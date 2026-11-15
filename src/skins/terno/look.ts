import { resolveTemperamento } from '@/presets/temperamentos';
import type { Seat } from '@/types';

export type Hair = 'curto' | 'repartido' | 'coque' | 'cacheado' | 'careca_barba';

export interface Look {
  skin: string;
  hair: Hair;
  hairColor: string;
  suit: string;
  tie: string;
  glasses: boolean;
}

export const SKINS = ['#f3d2b8', '#e0ac82', '#c68a5e', '#a06a42', '#7a4a2d', '#4f2f1e'] as const;
/** Os 5 primeiros são de membros; o grisalho é só do moderador. */
export const HAIR_COLORS = ['#1a1612', '#3b2a1e', '#6b4a2f', '#8a3b1f', '#d2a75a', '#b8b8b8'] as const;
export const SUITS = ['#2b2f36', '#1c2a4a', '#5a1f2b', '#4a4f2a', '#b9a184'] as const;
const HAIRS: Hair[] = ['curto', 'repartido', 'coque', 'cacheado', 'careca_barba'];
const MEMBER_HAIR_COLORS = HAIR_COLORS.slice(0, 5);
const AMBAR = '#ffb23e';

/** FNV-1a 32 bits. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Índices (pele, cabelo-cor, terno) derivados do id; `shift` desloca em caso de colisão. */
function pick(id: string, shift = 0) {
  const h = fnv1a(id);
  return {
    s: (h + shift) % SKINS.length,
    c: ((h >>> 8) + shift) % MEMBER_HAIR_COLORS.length,
    t: ((h >>> 16) + shift) % SUITS.length,
  };
}

function build(seat: Seat, shift: number): Look {
  const { s, c, t } = pick(seat.id, shift);
  return {
    skin: SKINS[s],
    hair: HAIRS[(fnv1a(seat.id) >>> 4) % HAIRS.length],
    hairColor: MEMBER_HAIR_COLORS[c],
    suit: SUITS[t],
    tie: resolveTemperamento(seat.temperamento).corGravata,
    glasses: false,
  };
}

const MODERADOR: Look = {
  skin: SKINS[1],
  hair: 'repartido',
  hairColor: HAIR_COLORS[5],
  suit: '#1c2a4a',
  tie: AMBAR,
  glasses: true,
};

export function lookOf(seat: Seat | 'moderador'): Look {
  return seat === 'moderador' ? { ...MODERADOR } : build(seat, 0);
}

/** Garante (skin, hair, suit) distintos (até 8 membros) avançando o índice na ordem de `seats`. */
export function looksFor(seats: Seat[]): Record<string, Look> {
  const out: Record<string, Look> = { moderador: lookOf('moderador') };
  const used = new Set<string>();
  const key = (l: Look) => `${l.skin}|${l.hair}|${l.suit}`;
  for (const seat of seats) {
    let look = build(seat, 0);
    // ponytail: busca linear com no máx. 150 deslocamentos (6×5 pele/terno × cabelo); acima de ~8 membros pode repetir.
    for (let k = 1; used.has(key(look)) && k <= 150; k++) look = build(seat, k);
    used.add(key(look));
    out[seat.id] = look;
  }
  return out;
}
