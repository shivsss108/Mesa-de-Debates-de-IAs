import { MODERATOR_ID, offlineIds } from '@/types';
import type { DebateConfig, DebateState } from '@/types';

export type ModeratorDecision = { acao: 'passar_palavra' | 'provocar' | 'encerrar'; para?: string; fala: string };

/** Extrai o 1º objeto JSON balanceado do texto (tolera ```json e texto ao redor). */
function firstJsonObject(raw: string): unknown {
  for (let start = raw.indexOf('{'); start !== -1; start = raw.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    for (let i = start; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          break; // tenta o próximo '{'
        }
      }
    }
  }
  return null;
}

const ACOES = ['passar_palavra', 'provocar', 'encerrar'];

export function parseModeratorDecision(raw: string): ModeratorDecision | null {
  const o = firstJsonObject(raw) as Record<string, unknown> | null;
  if (!o || typeof o.acao !== 'string' || !ACOES.includes(o.acao)) return null;
  return {
    acao: o.acao as ModeratorDecision['acao'],
    para: typeof o.para === 'string' ? o.para : undefined,
    fala: typeof o.fala === 'string' ? o.fala : '',
  };
}

export function resolveTarget(decision: ModeratorDecision, config: DebateConfig, state: DebateState): string {
  const offline = new Set(offlineIds(state));
  const ids = config.seats.map((s) => s.id);
  const ok = (id: string) => id !== MODERATOR_ID && ids.includes(id) && !offline.has(id);
  if (decision.para && ok(decision.para)) return decision.para;
  const hand = state.hands.find((h) => ok(h.member));
  if (hand) return hand.member;
  const online = ids.filter(ok);
  const pool = online.length ? online : ids;
  // menor lastSpokeTurn = falou há mais tempo (nunca falou = -1); empate: ordem dos assentos
  return pool.reduce((best, id) => ((state.lastSpokeTurn[id] ?? -1) < (state.lastSpokeTurn[best] ?? -1) ? id : best));
}

export function parseClosing(
  raw: string,
): { summary: string; consensus: string[]; openPoints: string[]; verdict: string } | null {
  const o = firstJsonObject(raw) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const summary = typeof o.summary === 'string' ? o.summary : '';
  const verdict = typeof o.verdict === 'string' ? o.verdict : '';
  if (!summary && !verdict && !('consensus' in o) && !('openPoints' in o)) return null;
  return { summary, consensus: arr(o.consensus), openPoints: arr(o.openPoints), verdict };
}
