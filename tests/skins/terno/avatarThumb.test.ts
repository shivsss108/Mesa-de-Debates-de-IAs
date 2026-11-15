import { describe, expect, it } from 'vitest';
import { avatarThumbParts } from '@/skins/terno/AvatarThumb';
import { lookOf, type Hair } from '@/skins/terno/look';

const HAIRS: Hair[] = ['curto', 'repartido', 'coque', 'cacheado', 'careca_barba'];
const base = lookOf('moderador');

describe('avatarThumbParts', () => {
  it('devolve as cores do look', () => {
    const p = avatarThumbParts(base);
    expect(p.skin).toBe(base.skin);
    expect(p.suit).toBe(base.suit);
    expect(p.tie).toBe(base.tie);
    expect(p.hair.fill).toBe(base.hairColor);
  });
  it('path de cabelo distinto por estilo', () => {
    const paths = HAIRS.map((hair) => avatarThumbParts({ ...base, hair }).hair.d);
    expect(new Set(paths).size).toBe(HAIRS.length);
  });
  it('careca_barba tem barba e nenhum cabelo no topo', () => {
    const p = avatarThumbParts({ ...base, hair: 'careca_barba' });
    expect(p.hair.beard).toBe(true);
    expect(p.hair.top).toBe(false);
    expect(avatarThumbParts({ ...base, hair: 'curto' }).hair.beard).toBe(false);
  });
});
