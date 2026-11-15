/** Plano da câmera Diretor. */
export type Shot = { kind: 'aberto' | 'close' | 'reacao'; target?: string };

/** Duração do plano de reação. */
export const REACTION_MS = 1500;
/** Fração da fala a partir da qual corta para a reação do citado. */
export const REACTION_AT = 0.4;

/**
 * Plano do frame: aberto enquanto ninguém fala (ou o orador pensa); close no orador falando;
 * reação de REACTION_MS no citado a partir de `reactionSince` (quem marca é a câmera, uma vez por turno).
 */
export function shotFor(i: {
  speaker?: string; addressedTo?: string; speaking: boolean; progress: number; reactionSince?: number; now: number; reducedMotion: boolean;
}): Shot {
  if (!i.speaker || !i.speaking) return { kind: 'aberto' };
  const react = !i.reducedMotion && i.addressedTo && i.addressedTo !== i.speaker && i.reactionSince !== undefined
    && i.progress >= REACTION_AT && i.now - i.reactionSince < REACTION_MS;
  return react ? { kind: 'reacao', target: i.addressedTo } : { kind: 'close', target: i.speaker };
}

const FOV = (55 * Math.PI) / 180; // fov vertical do Canvas (Stage)
const TELAO_TOP = 4.78;
const FRONT_LOW = 1.2; // menor altura que aparece no assento da frente (só cabeça e ombros de quem está de costas)

/**
 * Plano aberto: de frente (+Z), alto e na borda do piso (studioSize/2 = r+3), de onde cabem o arco inteiro e o telão.
 * Mira na bissetriz entre o assento da frente e o topo do telão, sem nunca cortar o topo do telão.
 * Retrato: a câmera não sai do estúdio; sobe um pouco e aceita cortar os púlpitos das pontas.
 */
export function wideFraming(radius: number, aspect: number): { pos: [number, number, number]; look: [number, number, number] } {
  const tanH = Math.tan(FOV / 2) * Math.min(aspect, 16 / 9);
  const halfW = radius + 0.9; // púlpitos dos extremos + margem
  const zEdge = radius * Math.cos((100 * Math.PI) / 180);
  const z = radius + 3; // borda do piso
  const short = Math.max(0, zEdge + halfW / tanH - z); // quanto faltaria recuar para caber a largura
  const h = 4.4 + 0.2 * radius + Math.min(1.5, 0.3 * short); // alto: olha por cima de quem está de costas
  const top = Math.atan2(TELAO_TOP - h, z + radius + 1.9);
  const pitch = Math.max((top + Math.atan2(FRONT_LOW - h, z - radius)) / 2, top - (FOV / 2) * 0.95);
  return { pos: [0, h, z], look: [0, h + Math.tan(pitch) * z, 0] };
}
