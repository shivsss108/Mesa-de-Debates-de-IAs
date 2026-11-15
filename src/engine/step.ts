import { ProviderError, type ChatFn, type ChatMessage } from '@/providers/client';
import { PROVIDERS } from '@/providers/table';
import { resolveKey } from '@/providers/catalog';
import { resolveTemperamento } from '@/presets/temperamentos';
import { MAX_BUSCAS, MODERATOR_ID, offlineIds } from '@/types';
import type { DebateConfig, DebateEvent, DebateState, Fonte, ProviderId } from '@/types';
import { quickSearch } from '@/research/quickSearch';
import type { NewsItem } from '@/research/search';
import { parseSearchTag, parseTag, SearchTagFilter, stripSearchTags, TagStreamSplitter, type ParsedTag } from './tags';
import { computeHands } from './urge';
import { buildClosingMessages, buildMemberMessages, buildModeratorMessages, buildSummaryMessages } from './prompts';
import { parseClosing, parseModeratorDecision, resolveTarget, type ModeratorDecision } from './moderator';

export interface StepDeps {
  chat: ChatFn;
  keys: Partial<Record<ProviderId, string>>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  /** busca rápida dos membros (default `quickSearch`) */
  search?: (q: string, idioma: string) => Promise<NewsItem[]>;
}

export const BACKOFF_MS = [1000, 2000, 4000];
export const SUMMARY_EVERY = 5;
// modelos de raciocínio (gpt-oss, qwen3, deepseek-r1) gastam centenas de tokens pensando antes de responder
export const MEMBER_MAX_TOKENS = 1500;
export const MODERATOR_MAX_TOKENS = 1500;
const JSON_ONLY = 'Responda somente o JSON.';

type Body = DebateEvent extends infer E ? (E extends DebateEvent ? Omit<E, 'seq' | 't'> : never) : never;

/** Chave ausente ou recusada (401/403): encerra o debate com `error`, sem retry. */
class KeyError extends Error {}

/** ProviderError 401/403 vira KeyError com o nome do provedor; o resto passa intacto. */
/** Texto depois de um bloco `<think>` inicial (qwen3, deepseek-r1); `null` enquanto o modelo ainda pensa. */
export function afterThink(raw: string): string | null {
  const t = raw.trimStart();
  if (!t.startsWith('<think>')) return raw;
  const end = t.indexOf('</think>');
  return end < 0 ? null : t.slice(end + '</think>'.length);
}

/** 400/404/422: o modelo não aceita este pedido (ex.: modelo de áudio); tentar de novo não muda nada. */
function isPermanent(e: unknown): boolean {
  return e instanceof ProviderError && (e.status === 400 || e.status === 404 || e.status === 422);
}

function asKeyError(p: ProviderId, e: unknown): unknown {
  return e instanceof ProviderError && (e.status === 401 || e.status === 403)
    ? new KeyError(`Chave inválida para ${PROVIDERS[p].nome}.`)
    : e;
}

/**
 * Um passo do debate: decisão do moderador + um turno de membro.
 * Não muta `state`; devolve o novo estado. Abort (`deps.signal`) encerra sem emitir mais nada.
 */
export async function* runStep(
  config: DebateConfig,
  state: DebateState,
  deps: StepDeps,
  seqStart: number,
): AsyncGenerator<DebateEvent, DebateState> {
  const s = structuredClone(state);
  let seq = seqStart;
  try {
    for await (const e of step(config, s, deps, seqStart)) {
      if (deps.signal?.aborted) return s;
      yield { ...e, seq: seq++, t: deps.now() - s.startedAt } as DebateEvent;
    }
  } catch (e) {
    if (isAbort(e, deps.signal)) return s;
    throw e;
  }
  return s;
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof Error && e.name === 'AbortError');
}

async function* step(config: DebateConfig, s: DebateState, deps: StepDeps, seqStart: number): AsyncGenerator<Body> {
  /** Erros que não são falha passageira do provedor: sobem direto, sem retry. */
  const fatal = (e: unknown) => e instanceof KeyError || isAbort(e, deps.signal);

  /** Rate gate por provedor (compartilhado entre assentos) antes de cada chamada; devolve a chave. */
  async function gate(p: ProviderId): Promise<string> {
    const key = resolveKey(p, deps.keys);
    if (!key) throw new KeyError(`Sem chave de API para ${PROVIDERS[p].nome}.`);
    const last = s.lastCallAt[p];
    const wait = last === undefined ? 0 : PROVIDERS[p].minIntervalMs - (deps.now() - last);
    if (wait > 0) await deps.sleep(wait);
    s.lastCallAt[p] = deps.now();
    return key;
  }

  /** Chamada não-streaming com backoff; lança após BACKOFF_MS.length falhas. */
  async function collect(p: ProviderId, model: string, messages: ChatMessage[]): Promise<string> {
    let last: unknown;
    for (const backoff of BACKOFF_MS) {
      try {
        const apiKey = await gate(p);
        let out = '';
        for await (const c of deps.chat({ provider: p, model, messages, apiKey, signal: deps.signal, maxTokens: MODERATOR_MAX_TOKENS }))
          out += c;
        return afterThink(out) ?? '';
      } catch (err) {
        const e = asKeyError(p, err);
        if (fatal(e)) throw e;
        last = e;
        await deps.sleep(backoff);
      }
    }
    throw last;
  }

  /** JSON do moderador: 1 retry pedindo só o JSON; null se falhar. */
  async function decide<T>(messages: ChatMessage[], parse: (raw: string) => T | null): Promise<T | null> {
    const { provider, model } = config.moderador;
    try {
      const raw = await collect(provider, model, messages);
      const retry = [...messages, { role: 'assistant' as const, content: raw }, { role: 'user' as const, content: JSON_ONLY }];
      return parse(raw) ?? parse(await collect(provider, model, retry));
    } catch (e) {
      if (fatal(e)) throw e;
      return null;
    }
  }

  async function* closing(): AsyncGenerator<Body> {
    const c = await decide(buildClosingMessages(config, s), parseClosing);
    s.done = true;
    yield c
      ? { type: 'debate_end', ...c, summary: c.summary || s.summary }
      : { type: 'debate_end', summary: s.summary, consensus: [], openPoints: [], verdict: '' };
  }

  try {
    if (seqStart === 0) yield { type: 'debate_start', config };
    if (s.memberTurns >= config.maxTurns) return yield* closing();

    // 1. Moderador
    let decision: ModeratorDecision | null = await decide(buildModeratorMessages(config, s), parseModeratorDecision);
    if (!decision) {
      s.moderatorFailures++;
      decision = { acao: 'passar_palavra', fala: '' };
    }
    if (decision.acao === 'encerrar') return yield* closing();
    // 'provocar' segue como 'passar_palavra': a provocação está em `fala`
    const m = resolveTarget(decision, config, s);
    const fala = decision.fala.trim();
    if (fala) {
      yield { type: 'turn_start', speaker: MODERATOR_ID, addressedTo: m };
      yield { type: 'token', speaker: MODERATOR_ID, text: fala };
      yield { type: 'turn_end', speaker: MODERATOR_ID, fullText: fala };
      s.history.push({ speaker: MODERATOR_ID, text: fala });
    }

    // 2. Membro
    const seat = config.seats.find((x) => x.id === m)!;
    const others = config.seats.filter((x) => x.id !== m).map((x) => x.id);
    const address = fala ? `O Moderador se dirigiu a você: "${fala}"` : 'É a sua vez de falar.';
    // 1 busca por turno, MAX_BUSCAS por debate
    let allowSearch = !!config.membrosPesquisam && s.buscasFeitas < MAX_BUSCAS;
    let messages = buildMemberMessages(config, s, seat, address, undefined, { allowSearch });
    const turnStart: Body = { type: 'turn_start', speaker: m, ...(fala ? { addressedTo: MODERATOR_ID } : {}) };
    yield { type: 'status', member: m, state: 'pensando' };

    let turn: ParsedTag | undefined;
    let lastErr: unknown;
    for (let i = 0; i < BACKOFF_MS.length && !turn; i++) {
      const splitter = new TagStreamSplitter();
      const filter = new SearchTagFilter();
      let head = ''; // texto visível depois da tag inicial, enquanto o turno não começou
      let raw = '';
      let fed = 0;
      let started = false;
      let errored = false;
      let query: string | null = null;
      try {
        const apiKey = await gate(seat.provider);
        const req = { provider: seat.provider, model: seat.model, messages, apiKey, signal: deps.signal, maxTokens: MEMBER_MAX_TOKENS };
        for await (const chunk of deps.chat(req)) {
          raw += chunk;
          const visible = afterThink(raw);
          if (visible === null) continue; // ainda dentro de <think>: não vai para o balão
          const split = splitter.push(visible.slice(fed));
          fed = visible.length;
          // splitter e filtro seguram "[busca…": a busca (logo no início ou logo após a tag de emoção) é decidida antes de qualquer token
          if (allowSearch && !started && (query = parseSearchTag(splitter.tagRaw() ?? '') ?? parseSearchTag((head += split)))) break;
          let out = filter.push(split);
          if (!started) {
            out = out.trimStart();
            if (!out) continue;
            started = true;
            yield turnStart;
          }
          yield { type: 'token', speaker: m, text: out };
        }
      } catch (err) {
        const e = asKeyError(seat.provider, err);
        if (fatal(e)) throw e;
        errored = true;
        lastErr = e;
      }
      const tail = query ? '' : filter.flush();
      if (started && tail) yield { type: 'token', speaker: m, text: tail };
      if (query) {
        allowSearch = false;
        yield { type: 'research', member: m, query };
        const search = deps.search ?? ((q: string, idioma: string) => quickSearch(q, idioma, { signal: deps.signal }));
        const items = await search(query, config.idioma).catch((): NewsItem[] => []);
        s.buscasFeitas++;
        let k = Math.max(0, ...[...(config.dossie?.fontes ?? []), ...s.repertorioExtra.fontes].map((f) => Number(/^S(\d+)$/.exec(f.id)?.[1] ?? 0)));
        const fontes: Fonte[] = items.slice(0, 4).map((n) => ({
          id: `S${++k}`,
          titulo: n.titulo.slice(0, 120),
          ...(n.resumo ? { resumo: n.resumo.slice(0, 300) } : {}),
          ...(n.veiculo ? { veiculo: n.veiculo.slice(0, 80) } : {}),
          ...(n.url && n.url.length <= 500 ? { url: n.url } : {}), // URL cortada não serve: sem URL
          ...(n.data ? { data: n.data.slice(0, 40) } : {}),
          origem: 'membro',
          porMembro: m,
        }));
        s.repertorioExtra = { fontes: [...s.repertorioExtra.fontes, ...fontes] };
        yield { type: 'research', member: m, query, fontes };
        const aviso = fontes.length ? '' : `\n\nA busca não encontrou nada sobre '${query}'.`;
        messages = buildMemberMessages(config, s, seat, address + aviso, undefined, { allowSearch: false });
        i--; // a busca não gasta tentativa: a nova chamada tem o laço inteiro de retries
        continue;
      }
      const p = parseTag(afterThink(raw) ?? '', others);
      p.text = stripSearchTags(p.text);
      // ponytail: stream que cai depois de já ter mostrado texto vira um turno truncado (evita turn_start sem turn_end)
      if (p.text && (started || !errored)) {
        // o splitter não tem flush: se ainda segurava um "[..." sem fechar, solta agora
        if (!started) {
          yield turnStart;
          yield { type: 'token', speaker: m, text: p.text };
        }
        turn = p;
      } else {
        if (isPermanent(lastErr)) break; // 400/404/422: o modelo não aceita o pedido, repetir só gasta cota
        await deps.sleep(BACKOFF_MS[i]);
      }
    }

    if (!turn) {
      s.failures[m] = (s.failures[m] ?? 0) + 1;
      s.offline[m] = s.memberTurns;
      const reason = lastErr instanceof Error ? lastErr.message.slice(0, 160) : 'resposta vazia do modelo';
      yield { type: 'status', member: m, state: 'sem_sinal', reason };
      // o cooldown de offline conta memberTurns, que não avançam se ninguém fala: sem este freio a mesa gira para sempre
      s.stalledSteps = (s.stalledSteps ?? 0) + 1;
      if (s.stalledSteps >= config.seats.length) {
        s.done = true;
        yield { type: 'error', message: 'Nenhum membro conseguiu falar. Verifique as chaves e os modelos.' };
      }
      return;
    }

    yield { type: 'emotion', member: m, emotion: turn.emotion ?? resolveTemperamento(seat.temperamento).emocaoPadrao };
    if (turn.gesture) yield { type: 'gesture', member: m, gesture: turn.gesture };
    if (turn.stance !== undefined) {
      s.stances[m] = turn.stance;
      yield { type: 'stance', member: m, value: turn.stance };
    }
    yield { type: 'turn_end', speaker: m, fullText: turn.text };
    yield { type: 'status', member: m, state: 'ok' };
    s.history.push({ speaker: m, text: turn.text });
    s.memberTurns++;
    s.lastSpokeTurn[m] = s.memberTurns;
    s.failures[m] = 0;
    s.stalledSteps = 0;

    // 3. Mãos e resumo
    s.hands = computeHands({
      speaker: m,
      target: turn.target,
      seats: config.seats,
      stances: s.stances,
      lastSpokeTurn: s.lastSpokeTurn,
      memberTurns: s.memberTurns,
      offline: offlineIds(s),
    });
    yield { type: 'hands', queue: s.hands };

    if (s.memberTurns % SUMMARY_EVERY === 0) {
      try {
        const text = (await collect(config.moderador.provider, config.moderador.model, buildSummaryMessages(config, s))).trim();
        if (text) {
          s.summary = text;
          yield { type: 'summary_update', text };
        }
      } catch (e) {
        if (fatal(e)) throw e; // resumo falhou: segue com o anterior
      }
    }
  } catch (e) {
    if (!(e instanceof KeyError)) throw e;
    s.done = true;
    yield { type: 'error', message: e.message };
  }
}
