import type { ChatMessage } from '@/providers/client';
import { resolveExpertise } from '@/presets/expertises';
import { resolveTemperamento } from '@/presets/temperamentos';
import { EMOTIONS, GESTURES, MODERATOR_ID, offlineIds } from '@/types';
import type { DebateConfig, DebateState, Seat } from '@/types';

export const HISTORY_WINDOW = 6;
export const TEMA_MAX = 300;
export const MEMBER_WORDS = 80;

const tema = (c: DebateConfig) => c.tema.slice(0, TEMA_MAX);

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

export function buildMemberMessages(config: DebateConfig, state: DebateState, seat: Seat, address: string): ChatMessage[] {
  const others = config.seats.filter((s) => s.id !== seat.id);
  const ids = others.map((s) => `${s.nome} (${s.id})`).join(', ');
  const system = [
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
    resolveExpertise(seat.expertise).promptSnippet,
    resolveTemperamento(seat.temperamento).promptSnippet,
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    `Tema: ${tema(config)}`,
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

export function buildModeratorMessages(config: DebateConfig, state: DebateState): ChatMessage[] {
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
  const system = [
    `Você é o Moderador ativo de uma mesa de debate. Responda sempre em ${config.idioma}.`,
    'Você decide quem fala em seguida, pode provocar um membro ou encerrar o debate.',
    prov,
    'Responda SOMENTE com JSON, sem texto extra, no formato:',
    '{"acao":"passar_palavra"|"provocar"|"encerrar","para":"<id do membro>","fala":"<sua fala curta>"}',
    `Membros válidos (ids): ${config.seats.map((s) => s.id).join(', ')}`,
  ].join('\n');
  const user = [
    `Tema: ${tema(config)}`,
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

export function buildSummaryMessages(config: DebateConfig, state: DebateState): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Você resume debates. Escreva em ${config.idioma} um resumo corrido, em texto simples, com no máximo 120 palavras.`,
    },
    {
      role: 'user',
      content: [
        `Tema: ${tema(config)}`,
        state.summary ? `Resumo anterior: ${state.summary}` : '',
        `Falas recentes:\n${historyLines(config, state, HISTORY_WINDOW)}`,
        'Atualize o resumo.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

export function buildClosingMessages(config: DebateConfig, state: DebateState): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        `Você encerra debates. Responda em ${config.idioma}, SOMENTE com JSON, sem texto extra, no formato:`,
        '{"summary":"<resumo>","consensus":["<ponto de consenso>"],"openPoints":["<ponto em aberto>"],"verdict":"<veredito final>"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Tema: ${tema(config)}`,
        state.summary ? `Resumo: ${state.summary}` : '',
        `Últimas falas:\n${historyLines(config, state, HISTORY_WINDOW)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}
