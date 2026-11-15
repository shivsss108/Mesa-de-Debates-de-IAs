import type { ChatMessage } from '@/providers/client';
import { resolveExpertise } from '@/presets/expertises';
import { resolveTemperamento } from '@/presets/temperamentos';
import { EMOTIONS, GESTURES, MAX_BUSCAS, MODERATOR_ID, offlineIds } from '@/types';
import type { DebateConfig, DebateState, Seat } from '@/types';

export const HISTORY_WINDOW = 6;
export const TEMA_MAX = 300;
export const MEMBER_WORDS = 80;

export const DOSSIE_BLOCK_MAX = 4000;

const tema = (c: DebateConfig) => c.tema.slice(0, TEMA_MAX);

const TZ = 'America/Sao_Paulo';
/** Data civil (YYYY-MM-DD) em São Paulo; independe do fuso do servidor. */
export const dataSP = (now: Date | number = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

// geradoEm é 'YYYY-MM-DD': split de string evita deslocamento de fuso do new Date().
export function hojeDe(config: DebateConfig, now: Date = new Date()): string {
  const g = config.dossie?.geradoEm;
  const [y, m, d] = (g && /^\d{4}-\d{2}-\d{2}/.test(g) ? g.slice(0, 10) : dataSP(now)).split('-');
  return `${d}/${m}/${y}`;
}

const hoje = (c: DebateConfig, now?: Date) => `Hoje é ${hojeDe(c, now)}.`;

/** Prioridade sob o limite: data/premissa > fatos > aviso e destaque > disputas > buscas dos membros (mais novas primeiro). Nunca corta no meio de uma linha. */
export function dossieBlock(config: DebateConfig, state: DebateState, quem: string): string {
  const d = config.dossie;
  const extras = state.repertorioExtra?.fontes ?? [];
  if (!d && !extras.length) return '';
  const seatIdx = config.seats.findIndex((s) => s.id === quem);
  const dividido = d?.modo === 'dividido' && seatIdx >= 0;
  const head: string[] = [];
  const fatos: string[] = [];
  const disputas: string[] = [];
  const aviso: string[] = [];
  if (d) {
    head.push(`Repertório (pesquisado em ${hojeDe(config)}):`);
    // a nota é editável na revisão sem limite próprio: cortada aqui para o cabeçalho nunca expulsar os fatos
    head.push(`Premissa do tema: ${d.premissa.status} — ${d.premissa.nota.slice(0, 300)}`);
    d.fatos.forEach((f, i) => {
      if (dividido && i % config.seats.length !== seatIdx) return;
      fatos.push(`- ${f.fontes.length ? `[${f.fontes.join(',')}] ` : ''}${f.texto}`);
    });
    disputas.push(...d.disputas.map((x) => `- ${x}`));
    if (dividido) aviso.push('Você tem só parte das informações; outros podem saber fatos que você não sabe.');
  }
  const recorte = d?.modo === 'recorte' ? d.recortes?.[quem] : undefined;
  if (recorte) aviso.push(`Destaque para a sua área: ${recorte}`);

  let used = head.join('\n').length;
  const fits = (ls: string[]) => used + ls.reduce((n, l) => n + l.length + 1, 0) <= DOSSIE_BLOCK_MAX;
  const take = (ls: string[]) => { used += ls.reduce((n, l) => n + l.length + 1, 0); };
  const greedy = (title: string | undefined, ls: string[]) => {
    const out: string[] = [];
    for (const l of ls) {
      if (!fits([...(title && !out.length ? [title] : []), l])) break;
      if (title && !out.length) take([title]);
      take([l]);
      out.push(l);
    }
    return out;
  };
  const fatosOk = greedy('Fatos:', fatos);
  const avisoOk = greedy(undefined, aviso);
  const dispOk = greedy('Pontos em disputa:', disputas);
  const extraLine = (f: (typeof extras)[number], resumo: boolean) =>
    `- [${f.id}] (por ${f.porMembro ? nameOf(config, f.porMembro) : 'membro'}) ${f.titulo}${resumo && f.resumo ? ` — ${f.resumo}` : ''}`;
  const chosen = new Map<number, string>();
  for (let i = extras.length - 1; i >= 0; i--) {
    const hdr = chosen.size ? [] : ['Pesquisado durante o debate:'];
    const l = [extraLine(extras[i], true), extraLine(extras[i], false)].find((x) => fits([...hdr, x]));
    if (!l) continue;
    take([...hdr, l]);
    chosen.set(i, l);
  }
  const extraOk = [...chosen.entries()].sort((x, y) => x[0] - y[0]).map(([, l]) => l);
  return [
    ...head,
    ...(fatosOk.length ? ['Fatos:', ...fatosOk] : []),
    ...(dispOk.length ? ['Pontos em disputa:', ...dispOk] : []),
    ...avisoOk.filter((l) => l.startsWith('Você tem')),
    ...(extraOk.length ? ['Pesquisado durante o debate:', ...extraOk] : []),
    ...avisoOk.filter((l) => !l.startsWith('Você tem')),
  ].join('\n');
}

function nameOf(config: DebateConfig, id: string): string {
  if (id === MODERATOR_ID) return 'Moderador';
  return config.seats.find((s) => s.id === id)?.nome ?? id;
}

function historyLines(config: DebateConfig, state: DebateState, n: number): string {
  return state.history
    .slice(-n)
    .map((h) => `${nameOf(config, h.speaker)}: ${h.text}`)
    .join('\n');
}

export function buildMemberMessages(
  config: DebateConfig,
  state: DebateState,
  seat: Seat,
  address: string,
  now?: Date,
  opts: { allowSearch?: boolean } = {},
): ChatMessage[] {
  const busca = config.membrosPesquisam && opts.allowSearch && state.buscasFeitas < MAX_BUSCAS;
  const others = config.seats.filter((s) => s.id !== seat.id);
  const ids = others.map((s) => `${s.nome} (${s.id})`).join(', ');
  const system = [
    hoje(config, now),
    `Você é ${seat.nome} (${seat.id}), participante de uma mesa de debate. Responda sempre em ${config.idioma}.`,
    'Regras:',
    `- Fale no máximo ${MEMBER_WORDS} palavras.`,
    '- Responda a quem foi citado ou a quem falou por último; não repita o que já foi dito.',
    '- Comece a resposta com a tag exata: [emoção|gesto|alvo:<id>|posição:<número>]',
    `  emoção: uma de ${EMOTIONS.join(', ')}`,
    `  gesto: um de ${GESTURES.join(', ')}`,
    `  alvo: o id (não o nome) de um destes membros: ${ids}; ou "ninguem". Nunca use o seu próprio id.`,
    '  posição: número de -1 (totalmente contra) a 1 (totalmente a favor), com ponto decimal (ex.: -0.7)',
    '  Exemplo: [duvida|apontar|alvo:' + (others[0]?.id ?? 'ninguem') + '|posição:-0.7] Seu texto aqui.',
    '- Seu conhecimento pode estar desatualizado. Para fatos recentes, use só o repertório. Se algo não está nele, diga que não sabe ou deixe claro que é opinião. Nunca invente datas, números ou declarações.',
    '- Não cite códigos de fonte como "(S2)" na fala; fale naturalmente.',
    busca ? '- Se precisar de um fato que não está no repertório, responda APENAS [busca: <consulta curta>], sem a tag de emoção e sem mais nada.' : '',
    resolveExpertise(seat.expertise).promptSnippet,
    resolveTemperamento(seat.temperamento).promptSnippet,
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Tema: ${tema(config)}`,
    dossieBlock(config, state, seat.id),
    state.summary ? `Resumo até agora: ${state.summary}` : '',
    `Últimas falas:\n${historyLines(config, state, HISTORY_WINDOW) || '(ninguém falou ainda)'}`,
    address,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildModeratorMessages(config: DebateConfig, state: DebateState, now?: Date): ChatMessage[] {
  const prov = {
    baixa: 'Provoque raramente; deixe o debate fluir.',
    media: 'Provoque de vez em quando, quando a conversa esfriar.',
    alta: 'Provoque com frequência: aponte contradições e chame os calados.',
  }[config.moderador.provocacao];
  const offline = offlineIds(state);
  const counts = config.seats
    .map((s) => `${s.nome} (${s.id}): ${state.history.filter((h) => h.speaker === s.id).length} falas`)
    .join('\n');
  const hands = state.hands.length
    ? state.hands.map((h) => `${nameOf(config, h.member)} (${h.member}) urgência ${h.urge.toFixed(2)}: ${h.reason}`).join('\n')
    : '(ninguém levantou a mão)';
  const off = offline.length ? offline.map((id) => `${nameOf(config, id)} (${id})`).join(', ') : '(nenhum)';
  const abertura =
    config.dossie && config.dossie.premissa.status !== 'confirmada' && state.history.length === 0
      ? `Atenção: a premissa do tema não foi confirmada na pesquisa (${config.dossie.premissa.status}). Na sua fala de abertura, avise os participantes e reformule o tema.`
      : '';
  const system = [
    hoje(config, now),
    `Você é o Moderador ativo de uma mesa de debate. Responda sempre em ${config.idioma}.`,
    'Você decide quem fala em seguida, pode provocar um membro ou encerrar o debate.',
    prov,
    'Responda SOMENTE com JSON, sem texto extra, no formato:',
    '{"acao":"passar_palavra"|"provocar"|"encerrar","para":"<id do membro>","fala":"<sua fala curta>"}',
    `Membros válidos (ids): ${config.seats.map((s) => s.id).join(', ')}`,
    abertura,
  ]
    .filter(Boolean)
    .join('\n');
  const user = [
    `Tema: ${tema(config)}`,
    dossieBlock(config, state, MODERATOR_ID),
    state.summary ? `Resumo: ${state.summary}` : '',
    `Turnos de membros: ${state.memberTurns}/${config.maxTurns}`,
    `Falas por membro:\n${counts}`,
    `Fila de mãos levantadas:\n${hands}`,
    `Membros offline (não os chame): ${off}`,
    `Últimas falas:\n${historyLines(config, state, HISTORY_WINDOW) || '(ninguém falou ainda)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildSummaryMessages(config: DebateConfig, state: DebateState, now?: Date): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `${hoje(config, now)}
Você resume debates. Escreva em ${config.idioma} um resumo corrido, em texto simples, com no máximo 120 palavras.`,
    },
    {
      role: 'user',
      content: [
        `Tema: ${tema(config)}`,
        dossieBlock(config, state, MODERATOR_ID),
        state.summary ? `Resumo anterior: ${state.summary}` : '',
        `Falas recentes:\n${historyLines(config, state, HISTORY_WINDOW)}`,
        'Atualize o resumo.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

export function buildClosingMessages(config: DebateConfig, state: DebateState, now?: Date): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        hoje(config, now),
        `Você encerra debates. Responda em ${config.idioma}, SOMENTE com JSON, sem texto extra, no formato:`,
        '{"summary":"<resumo>","consensus":["<ponto de consenso>"],"openPoints":["<ponto em aberto>"],"verdict":"<veredito final>"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Tema: ${tema(config)}`,
        dossieBlock(config, state, MODERATOR_ID),
        state.summary ? `Resumo: ${state.summary}` : '',
        `Últimas falas:\n${historyLines(config, state, HISTORY_WINDOW)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
