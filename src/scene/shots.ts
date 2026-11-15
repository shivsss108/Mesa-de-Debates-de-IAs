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
 * Plano aberto: de frente (+Z) e alto, de onde cabe o arco inteiro (extremos em ±100°) e o telão.
 * Recuo pelo fov horizontal (largura) e pelo vertical (púlpito da frente até o topo do telão).
 */
export function wideFraming(radius: number, aspect: number): { pos: [number, number, number]; look: [number, number, number] } {
  const tanH = Math.tan(FOV / 2) * Math.min(aspect, 16 / 9);
  const halfW = radius + 0.9; // púlpitos dos extremos + margem
  const zEdge = radius * Math.cos((100 * Math.PI) / 180);
  const h = 4.4 + 0.2 * radius; // alto: olha por cima de quem está de costas para a câmera
  let z = Math.max(radius + 3, zEdge + halfW / tanH);
  const span = () => Math.atan2(TELAO_TOP - h, z + radius + 1.9) - Math.atan2(FRONT_LOW - h, z - radius);
  while (span() > FOV * 0.9) z += 0.1; // ponytail: busca linear, roda só quando muda raio/aspecto
  const pitch = (Math.atan2(TELAO_TOP - h, z + radius + 1.9) + Math.atan2(FRONT_LOW - h, z - radius)) / 2;
  return { pos: [0, h, z], look: [0, h + Math.tan(pitch) * z, 0] };
}
