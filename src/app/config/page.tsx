'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PROVIDERS } from '@/providers/table';
import type { CatalogModel } from '@/providers/catalog';
import { defaultNames, randomizePersonalities } from '@/presets/randomize';
import type { DebateConfig, ProviderId, Seat } from '@/types';
import { Logo } from '../Logo';
import { looksFor } from '@/skins/terno/look';
import { ModelPicker, SeatCard } from './SeatCard';
import { Repertorio, REPERTORIO_VAZIO } from './Repertorio';
import { validateConfig } from './validateConfig';
import { bestOf, randomModels, variedBest } from './assignModels';
import s from './config.module.css';

type Keys = Partial<Record<ProviderId, string>>;

const SUGESTOES = [
  'A inteligência artificial vai substituir programadores?',
  'Pizza com abacaxi é uma heresia?',
  'Devemos colonizar Marte antes de resolver os problemas da Terra?',
  'Trabalho remoto é melhor que presencial?',
  'O livre-arbítrio existe?',
];

const mkSeat = (i: number, nome: string, provider: ProviderId = 'groq', model = ''): Seat => ({
  id: `m${i + 1}`, nome, provider, model, temperamento: { presetId: '' }, expertise: { presetId: '' },
});

function defaultConfig(): DebateConfig {
  const seats = randomizePersonalities(defaultNames(4).map((n, i) => mkSeat(i, n)));
  return { tema: '', idioma: 'pt-BR', maxTurns: 20, moderador: { provider: 'groq', model: '', provocacao: 'media' }, seats };
}

function readSession<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    // modo privado/cota cheia: a config só não sobrevive à navegação
  }
}

export default function ConfigPage() {
  const router = useRouter();
  const [config, setConfig] = useState<DebateConfig>();
  const [keys, setKeys] = useState<Keys>({});
  const [env, setEnv] = useState<ProviderId[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [onlyFree, setOnlyFree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [turnsText, setTurnsText] = useState<string>();
  const [rep, setRep] = useState<Repertorio>(REPERTORIO_VAZIO);
  const modTouched = useRef(false);

  useEffect(() => {
    // sessionStorage só existe no cliente: inicializa aqui para não quebrar a hidratação (personalidades aleatórias)
    const saved = readSession<DebateConfig>('mesa:config');
    modTouched.current = !!saved;
    setConfig(saved?.seats?.length ? saved : defaultConfig());
    setKeys(readSession<Keys>('mesa:keys') ?? {});
    setRep(readSession<Repertorio>('mesa:repertorio') ?? REPERTORIO_VAZIO);
    fetch('/api/models/env').then((r) => r.json()).then((ids: ProviderId[]) => setEnv(ids)).catch(() => {});
  }, []);

  const shown = useMemo(() => (onlyFree ? models.filter((m) => m.free) : models), [models, onlyFree]);
  const looks = useMemo(() => looksFor(config?.seats ?? []), [config?.seats]);
  const problems = useMemo(() => {
    const p = config ? validateConfig(config, keys, env) : [];
    return rep.links.length > 5 ? [...p, 'No máximo 5 links no repertório.'] : p;
  }, [config, keys, env, rep.links.length]);

  const update = useCallback((fn: (c: DebateConfig) => DebateConfig) => setConfig((c) => c && fn(c)), []);
  const setSeats = (fn: (seats: Seat[]) => Seat[]) =>
    update((c) => {
      const seats = fn(c.seats);
      // o moderador acompanha o assento 1 até o usuário mexer nele
      const moderador = modTouched.current || !seats[0] ? c.moderador : { ...c.moderador, provider: seats[0].provider, model: seats[0].model };
      return { ...c, seats, moderador };
    });

  const loadModels = useCallback(async (k: Keys) => {
    setLoading(true);
    setLoadErrors([]);
    try {
      const res = await fetch('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys: k }) });
      const j = (await res.json()) as { models: CatalogModel[]; errors: { provider: ProviderId; message: string }[] };
      setModels(j.models);
      setLoadErrors(j.errors.map((e) => `${PROVIDERS[e.provider].nome}: ${e.message}`));
      // o catálogo já vem só com modelos que servem para debate: troca pelo melhor do provedor
      // o que estiver vazio ou não estiver mais na lista (ex.: um modelo de voz escolhido antes)
      const ids = new Set(j.models.map((m) => `${m.provider}:${m.id}`));
      const fix = <T extends { provider: ProviderId; model: string }>(x: T): T =>
        ids.has(`${x.provider}:${x.model}`) ? x : { ...x, model: bestOf(j.models, x.provider)?.model ?? '' };
      update((c) => ({ ...c, seats: c.seats.map(fix), moderador: fix(c.moderador) }));
    } catch {
      setLoadErrors(['Não foi possível carregar os modelos.']);
    } finally {
      setLoading(false);
    }
  }, [update]);

  // carrega os modelos sozinho quando há chave (sem precisar clicar), com pausa para não chamar a cada tecla
  const keysSig = JSON.stringify(keys);
  useEffect(() => {
    const k = JSON.parse(keysSig) as Keys;
    if (!Object.values(k).some((v) => v?.trim()) && !env.length) return;
    const t = setTimeout(() => void loadModels(k), 700);
    return () => clearTimeout(t);
  }, [keysSig, env.length, loadModels]);

  if (!config) return null;

  const used = [...new Set<ProviderId>([config.moderador.provider, ...config.seats.map((x) => x.provider)])];

  const setKey = (p: ProviderId, v: string) => {
    const next = { ...keys, [p]: v };
    setKeys(next);
    writeSession('mesa:keys', next);
  };

  const assign = (fn: (c: DebateConfig, m: CatalogModel[]) => DebateConfig) => {
    modTouched.current = true; // o moderador recebeu um modelo escolhido de propósito
    update((c) => fn(c, shown));
  };

  const setCount = (n: number) =>
    setSeats((seats) => {
      if (n <= seats.length) return seats.slice(0, n);
      const names = defaultNames(8);
      const extra = Array.from({ length: n - seats.length }, (_, k) => {
        const i = seats.length + k;
        return mkSeat(i, names[i], seats[0]?.provider, seats[0]?.model);
      });
      return randomizePersonalities([...seats, ...extra]).map((x, i) => (i < seats.length ? seats[i] : x));
    });

  const sameModel = () => {
    const [first] = config.seats;
    modTouched.current = false;
    update((c) => ({
      ...c,
      seats: c.seats.map((x) => ({ ...x, provider: first.provider, model: first.model })),
      moderador: { ...c.moderador, provider: first.provider, model: first.model },
    }));
  };

  const start = () => {
    const { membrosPesquisam } = rep;
    writeSession('mesa:repertorio', rep);
    writeSession('mesa:keys', keys);
    const semRepertorio = !rep.busca && !rep.links.length && !rep.textos.some((x) => x.conteudo.trim());
    if (semRepertorio) {
      writeSession('mesa:config', { ...config, dossie: undefined, membrosPesquisam }); // dossiê antigo não vale mais
      router.push('/mesa');
    } else {
      writeSession('mesa:config', { ...config, membrosPesquisam });
      router.push('/preparo');
    }
  };

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <header className={s.head}>
          <Logo size="sm" />
          <div>
            <h1>Montar a mesa</h1>
            <p>Defina o tema, quem se senta e com qual modelo.</p>
          </div>
          <Link href="/" className={s.back}>← Início</Link>
        </header>

        <section className={s.block} aria-labelledby="h-debate">
          <h2 id="h-debate">Debate</h2>
          <div className={s.grid}>
            <label className={`${s.field} ${s.wide}`}>
              Tema
              <input className={s.input} value={config.tema} maxLength={300} placeholder="Sobre o que a mesa vai debater?"
                onChange={(e) => update((c) => ({ ...c, tema: e.target.value }))} />
            </label>
            <label className={s.field}>
              Idioma
              <select className={s.select} value={config.idioma} onChange={(e) => update((c) => ({ ...c, idioma: e.target.value }))}>
                <option value="pt-BR">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            <label className={s.field}>
              Turnos de membros (6–60)
              <input className={s.input} type="number" min={6} max={60} value={turnsText ?? (Number.isNaN(config.maxTurns) ? '' : String(config.maxTurns))}
                onChange={(e) => {
                  setTurnsText(e.target.value);
                  // vazio vira NaN: validateConfig acusa e o botão fica desabilitado
                  update((c) => ({ ...c, maxTurns: e.target.value === '' ? NaN : Math.round(Number(e.target.value)) }));
                }}
                onBlur={() => setTurnsText(undefined)} />
            </label>
          </div>
          <div className={s.chips} role="group" aria-label="Sugestões de tema">
            {SUGESTOES.map((t) => (
              <button key={t} type="button" className={s.chip} onClick={() => update((c) => ({ ...c, tema: t }))}>{t}</button>
            ))}
          </div>
        </section>

        <section className={s.block} aria-labelledby="h-mod">
          <h2 id="h-mod">Moderador</h2>
          <div className={s.grid}>
            <ModelPicker label="Moderador" provider={config.moderador.provider} model={config.moderador.model} models={shown}
              onChange={(provider, model) => { modTouched.current = true; update((c) => ({ ...c, moderador: { ...c.moderador, provider, model } })); }} />
            <label className={s.field}>
              Provocação
              <select className={s.select} value={config.moderador.provocacao}
                onChange={(e) => update((c) => ({ ...c, moderador: { ...c.moderador, provocacao: e.target.value as DebateConfig['moderador']['provocacao'] } }))}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </label>
          </div>
        </section>

        <section className={s.block} aria-labelledby="h-seats">
          <h2 id="h-seats">Assentos</h2>
          <div className={s.toolbar}>
            <label className={s.check}>
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
              Só gratuitos
            </label>
            <button type="button" className={s.btn} onClick={() => setSeats((x) => randomizePersonalities(x))}>Aleatorizar personalidades</button>
            <button type="button" className={s.btn} disabled={!shown.length} onClick={() => assign(variedBest)}
              title="Os modelos mais fortes disponíveis, alternando provedores">Variar melhores modelos</button>
            <button type="button" className={s.btn} disabled={!shown.length} onClick={() => assign(randomModels)}>Aleatorizar modelos</button>
            <button type="button" className={s.btn} onClick={sameModel}>Mesmo modelo para todos</button>
            <label className={`${s.check} ${s.btn}`} style={{ marginLeft: 'auto' }}>
              Membros
              <input className={s.input} style={{ width: 64 }} type="number" min={2} max={8} value={config.seats.length}
                onChange={(e) => setCount(Math.min(8, Math.max(2, Math.round(Number(e.target.value)) || 2)))} />
            </label>
          </div>
          <div className={s.seats}>
            {config.seats.map((seat, i) => (
              <SeatCard key={seat.id} seat={seat} look={looks[seat.id]} index={i} models={shown} canRemove={config.seats.length > 2}
                onChange={(next) => setSeats((all) => all.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setSeats((all) => all.filter((_, j) => j !== i).map((x, j) => ({ ...x, id: `m${j + 1}` })))} />
            ))}
          </div>
        </section>

        <Repertorio value={rep} onChange={setRep} />

        <section className={s.block} aria-labelledby="h-keys">
          <h2 id="h-keys">Chaves de API</h2>
          <p className={s.note} style={{ marginBottom: 12 }}>Ficam só nesta aba do navegador (sessionStorage) e são enviadas apenas para chamar o provedor.</p>
          <p className={s.note} style={{ marginBottom: 12 }}>Pode preencher vários: cada assento escolhe o seu provedor. Só os provedores em uso são obrigatórios.</p>
          <div className={s.grid}>
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <div key={p} className={s.keyRow}>
                <label className={s.field}>
                  Chave {PROVIDERS[p].nome}{used.includes(p) ? ' (em uso)' : ''}
                  <input className={s.input} type="password" autoComplete="off" value={keys[p] ?? ''}
                    placeholder={env.includes(p) ? 'Usando a chave do servidor' : 'Cole sua chave'} onChange={(e) => setKey(p, e.target.value)} />
                </label>
                <a href={PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer">onde conseguir grátis</a>
              </div>
            ))}
          </div>
          <div className={s.toolbar} style={{ marginTop: 14, marginBottom: 0 }}>
            <button type="button" className={s.btn} onClick={() => void loadModels(keys)} disabled={loading}>{loading ? 'Carregando…' : 'Recarregar modelos'}</button>
            {models.length > 0 && <span className={s.note}>{shown.length} modelos disponíveis</span>}
          </div>
          {loadErrors.map((m) => <p key={m} role="alert" className={s.err}>{m}</p>)}
        </section>

        <div className={s.start}>
          <button type="button" className={s.go} disabled={problems.length > 0} onClick={start}>Começar</button>
          {problems.length > 0 && <ul className={s.problems} aria-live="polite">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      </div>
    </main>
  );
}
