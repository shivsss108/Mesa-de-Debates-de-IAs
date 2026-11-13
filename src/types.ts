export type ProviderId = 'groq' | 'nvidia' | 'openrouter' | 'google' | 'mistral' | 'cerebras';
export type Emotion = 'neutro' | 'feliz' | 'raiva' | 'duvida' | 'surpresa' | 'tristeza' | 'desdem' | 'pensativo';
export type Gesture =
  | 'bater_na_mesa'
  | 'apontar'
  | 'bracos_cruzados'
  | 'mao_levantada'
  | 'maos_no_bolso'
  | 'balancar_cabeca'
  | 'dar_de_ombros'
  | 'inclinar_para_frente';

export type PersonaRef = { presetId: string } | { custom: string };

export interface Seat {
  id: string;
  nome: string;
  provider: ProviderId;
  model: string;
  temperamento: PersonaRef;
  expertise: PersonaRef;
}

export interface DebateConfig {
  tema: string;
  idioma: string;
  maxTurns: number;
  moderador: { provider: ProviderId; model: string; provocacao: 'baixa' | 'media' | 'alta' };
  seats: Seat[];
}

export interface HandEntry {
  member: string;
  urge: number;
  reason: string;
}

export interface DebateState {
  startedAt: number;
  memberTurns: number;
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
  done: boolean;
  pendingAddress?: { to: string; text: string };
}

export type DebateEvent = { seq: number; t: number } & (
  | { type: 'debate_start'; config: DebateConfig }
  | { type: 'turn_start'; speaker: string; addressedTo?: string }
  | { type: 'token'; speaker: string; text: string }
  | { type: 'turn_end'; speaker: string; fullText: string }
  | { type: 'emotion'; member: string; emotion: Emotion }
  | { type: 'gesture'; member: string; gesture: Gesture }
  | { type: 'stance'; member: string; value: number }
  | { type: 'hands'; queue: HandEntry[] }
  | { type: 'status'; member: string; state: 'pensando' | 'sem_sinal' | 'ok' }
  | { type: 'summary_update'; text: string }
  | { type: 'debate_end'; summary: string; consensus: string[]; openPoints: string[]; verdict: string }
  | { type: 'error'; message: string }
);

export const MODERATOR_ID = 'moderador';
export const OFFLINE_COOLDOWN = 3;

/** ids com s.memberTurns - offline[id] < OFFLINE_COOLDOWN */
export function offlineIds(s: DebateState): string[] {
  return Object.keys(s.offline).filter((id) => s.memberTurns - s.offline[id] < OFFLINE_COOLDOWN);
}
