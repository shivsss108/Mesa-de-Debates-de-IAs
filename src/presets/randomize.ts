import type { Seat } from '@/types';
import { TEMPERAMENTOS } from './temperamentos';
import { EXPERTISES } from './expertises';

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo', 'Iara', 'João', 'Lia', 'Marco', 'Nina', 'Otto', 'Paula', 'Rafa'];

export function defaultNames(n: number): string[] {
  return NOMES.slice(0, n);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorteia pares temperamento×expertise sem repetir até esgotar o produto cartesiano; então reinicia. */
export function randomizePersonalities(seats: Seat[], rng: () => number = Math.random): Seat[] {
  const pairs = TEMPERAMENTOS.flatMap((t) => EXPERTISES.map((e) => [t.id, e.id] as const));
  let pool: (readonly [string, string])[] = [];
  return seats.map((s) => {
    if (pool.length === 0) pool = shuffle(pairs, rng);
    const [t, e] = pool.pop()!;
    return { ...s, temperamento: { presetId: t }, expertise: { presetId: e } };
  });
}
