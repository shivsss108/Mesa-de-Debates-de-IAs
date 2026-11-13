import { MODERATOR_ID, type HandEntry, type Seat } from '@/types';
import { resolveTemperamento } from '@/presets/temperamentos';

export const URGE = {
  cited: 1.0,
  disagreeWeight: 0.5,
  recentPenalty: 0.4,
  recentWindow: 2,
  agreePenalty: 0.3,
  agreeEpsilon: 0.2,
  threshold: 0.6,
  max: 1.5,
};

/** Quem levanta a mão após uma fala (sem chamar LLM): só ouvintes com urge >= limiar, ordenados desc. */
export function computeHands(args: {
  speaker: string;
  target?: string;
  seats: Seat[];
  stances: Record<string, number>;
  lastSpokeTurn: Record<string, number>;
  memberTurns: number;
  offline: string[];
}): HandEntry[] {
  const { speaker, target, seats, stances, lastSpokeTurn, memberTurns, offline } = args;
  const sSpeaker = stances[speaker] ?? 0;
  const hands: HandEntry[] = [];
  for (const seat of seats) {
    const m = seat.id;
    if (m === speaker || m === MODERATOR_ID || offline.includes(m)) continue;
    const diff = Math.abs((stances[m] ?? 0) - sSpeaker);
    const cited = target === m ? URGE.cited : 0;
    const disagree = (URGE.disagreeWeight * diff) / 2;
    const impulsivity = resolveTemperamento(seat.temperamento).impulsividade;
    // lastSpokeTurn ausente = nunca falou: sem penalidade de fala recente
    const recent = m in lastSpokeTurn && memberTurns - lastSpokeTurn[m] <= URGE.recentWindow ? URGE.recentPenalty : 0;
    const agree = diff < URGE.agreeEpsilon && target !== m ? URGE.agreePenalty : 0;
    const urge = Math.min(URGE.max, Math.max(0, cited + disagree + impulsivity - recent - agree));
    if (urge < URGE.threshold) continue;
    const top = Math.max(cited, disagree, impulsivity);
    const reason = top === cited ? 'foi citado' : top === disagree ? 'discorda' : 'impulsivo';
    hands.push({ member: m, urge, reason });
  }
  return hands.sort((a, b) => b.urge - a.urge);
}
