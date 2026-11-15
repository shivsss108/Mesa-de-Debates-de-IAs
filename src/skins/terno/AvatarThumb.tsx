import type { Hair, Look } from './look';

/** Cabelo no viewBox 64×64 (cabeça: elipse 32,24 · rx14 ry16). `top` = cobre o topo da cabeça; `beard` = barba. */
const HAIR_PATH: Record<Hair, { d: string; top: boolean; beard: boolean }> = {
  curto: { d: 'M17 22C16 9 26 6 32 6s16 3 15 16c-2-6-6-9-15-9s-13 3-15 9z', top: true, beard: false },
  repartido: { d: 'M17 24C14 8 28 4 36 7c8 2 12 8 11 17-1-5-4-8-9-9-5 3-14 2-21 9z', top: true, beard: false },
  coque: { d: 'M17 22C16 9 26 6 32 6s16 3 15 16c-2-6-6-9-15-9s-13 3-15 9zM27 3a5 5 0 1 1 10 0 5 5 0 0 1-10 0z', top: true, beard: false },
  cacheado: { d: 'M14 24c-3-6 0-10 4-11-1-6 6-9 11-7 4-3 12-1 12 6 5 1 7 7 4 12-1-5-5-8-9-9-6 2-16 1-22 9z', top: true, beard: false },
  careca_barba: { d: 'M18 26c0 12 6 18 14 18s14-6 14-18c-2 6-6 9-14 9s-12-3-14-9z', top: false, beard: true },
};

/** Cores e formas do avatar 2D (pura, testável). */
export function avatarThumbParts(look: Look) {
  const h = HAIR_PATH[look.hair];
  return { skin: look.skin, suit: look.suit, tie: look.tie, hair: { fill: look.hairColor, ...h } };
}

export function AvatarThumb({ look, size = 64, title }: { look: Look; size?: number; title?: string }) {
  const p = avatarThumbParts(look);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M6 64c0-14 11-22 26-22s26 8 26 22z" fill={p.suit} />
      <path d="M24 43l8 8 8-8-8-3z" fill="#f4f4f0" />
      <path d="M32 47l-4 6 4 11 4-11z" fill={p.tie} />
      <rect x="28" y="36" width="8" height="8" fill={p.skin} />
      <ellipse cx="32" cy="24" rx="14" ry="16" fill={p.skin} />
      <path d={p.hair.d} fill={p.hair.fill} />
      <circle cx="26.5" cy="24" r="1.8" fill="#111" />
      <circle cx="37.5" cy="24" r="1.8" fill="#111" />
      {look.glasses && (
        <g fill="none" stroke="#111" strokeWidth="1.2">
          <circle cx="26.5" cy="24" r="4.5" />
          <circle cx="37.5" cy="24" r="4.5" />
          <path d="M31 24h2" />
        </g>
      )}
      <path d="M28 32q4 2.5 8 0" stroke="#111" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
