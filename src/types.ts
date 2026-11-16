export type ProviderId = 'groq' | 'nvidia' | 'openrouter' | 'google' | 'mistral' | 'cerebras';
export const EMOTIONS = ['neutro', 'feliz', 'raiva', 'duvida', 'surpresa', 'tristeza', 'desdem', 'pensativo'] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const GESTURES = [
  'bater_na_mesa',
  'apontar',
  'bracos_cruzados',
  'mao_levantada',
  'maos_no_bolso',
  'balancar_cabeca',
  'dar_de_ombros',
  'inclinar_para_frente',
] as const;
export type Gesture = (typeof GESTURES)[number];

export type PersonaRef = { presetId: string } | { custom: string };

export interface Seat {
  id: string;
  nome: string;
  provider: ProviderId;
  model: string;
  temperamento: PersonaRef;
  expertise: PersonaRef;
}

export interface Fonte {
  id: string; // 'S1', 'S2', … (extras: 'S7'…)
  titulo: string;
  resumo?: string; // ≤ 300 chars (buscas de membros)
  veiculo?: string;
  url?: string;
  data?: string; // ISO, quando o RSS/página informa
  origem: 'web' | 'link' | 'arquivo' | 'texto' | 'membro';
  porMembro?: string; // seatId, só origem 'membro'
}

export interface Dossie {
  geradoEm: string; // 'YYYY-MM-DD'
  premissa: { status: 'confirmada' | 'nao_encontrada' | 'contradita'; nota: string };
  fatos: { id: string; texto: string; fontes: string[]; manual?: boolean }[]; // ≤ 12, texto ≤ 300 chars
  disputas: string[]; // ≤ 5, ≤ 200 chars cada
  fontes: Fonte[]; // ≤ 12
  modo: 'todos' | 'dividido' | 'recorte';
  recortes?: Record<string, string>; // seatId → destaque (≤ 400 chars), só modo recorte
}

export const MAX_BUSCAS = 6;

export interface DebateConfig {
  tema: string;
  idioma: string;
  maxTurns: number;
  moderador: { provider: ProviderId; model: string; provocacao: 'baixa' | 'media' | 'alta' };
  seats: Seat[];
  dossie?: Dossie;
  membrosPesquisam?: boolean;
}

export interface HandEntry {
  member: string;
  urge: number;
  reason: string;
}

export interface DebateState {
  startedAt: number;
  /** falas de membros até agora: relógio interno (cooldown de offline, urgência, resumo) */
  memberTurns: number;
  /** turno (rodada) atual, a partir de 1; estado antigo sem o campo = 1 */
  turno: number;
  /** quem falou no turno atual, em ordem, com repetição; estado antigo sem o campo = [] */
  falaram: string[];
  summary: string;
  history: { speaker: string; text: string }[];
  stances: Record<string, number>;
  lastSpokeTurn: Record<string, number>;
  failures: Record<string, number>;
  moderatorFailures: number;
  /** memberId → memberTurns quando caiu */
  offline: Record<string, number>;
  hands: HandEntry[];
  lastCallAt: Partial<Record<ProviderId, number>>;
  /** passos seguidos sem turno de membro com sucesso (estado antigo sem o campo = 0) */
  stalledSteps: number;
  /** fontes pesquisadas por membros durante o debate */
  repertorioExtra: { fontes: Fonte[] };
  buscasFeitas: number;
  done: boolean;
  pendingAddress?: { to: string; text: string };
}

export type DebateEvent = { seq: number; t: number } & (
  | { type: 'debate_start'; config: DebateConfig }
  | { type: 'turn_start'; speaker: string; addressedTo?: string; turno?: number }
  | { type: 'token'; speaker: string; text: string }
  | { type: 'turn_end'; speaker: string; fullText: string }
  | { type: 'emotion'; member: string; emotion: Emotion }
  | { type: 'gesture'; member: string; gesture: Gesture }
  | { type: 'stance'; member: string; value: number }
  | { type: 'hands'; queue: HandEntry[] }
  | { type: 'status'; member: string; state: 'pensando' | 'sem_sinal' | 'ok'; reason?: string }
  | { type: 'summary_update'; text: string }
  | { type: 'debate_end'; summary: string; consensus: string[]; openPoints: string[]; verdict: string }
  | { type: 'research'; member: string; query: string; fontes?: Fonte[] }
  | { type: 'error'; message: string }
);

export const MODERATOR_ID = 'moderador';
export const OFFLINE_COOLDOWN = 3;

/** ids com s.memberTurns - offline[id] < OFFLINE_COOLDOWN */
export function offlineIds(s: DebateState): string[] {
  return Object.keys(s.offline).filter((id) => s.memberTurns - s.offline[id] < OFFLINE_COOLDOWN);
}
