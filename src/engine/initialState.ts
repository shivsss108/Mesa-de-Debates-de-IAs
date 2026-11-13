import type { DebateConfig, DebateState } from '@/types';

export function createInitialState(config: DebateConfig, now: number): DebateState {
  return {
    startedAt: now,
    memberTurns: 0,
    summary: '',
    history: [],
    stances: Object.fromEntries(config.seats.map((s) => [s.id, 0])),
    lastSpokeTurn: {},
    failures: Object.fromEntries(config.seats.map((s) => [s.id, 0])),
    moderatorFailures: 0,
    offline: {},
    hands: [],
    lastCallAt: {},
    done: false,
  };
}
