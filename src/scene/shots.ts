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
const FRONT_Z = 0.25; // z dos assentos das pontas, em raios (layout: ninguém passa disso)

/**
 * Plano aberto: de frente (+Z), acima das cabeças e na borda do piso (studioSize/2 = r+3), de onde cabem o arco inteiro e o telão.
 * Inclina para baixo até o topo do telão ficar logo abaixo da borda do quadro: arco (atrás do centro) e telão sem sobra de teto.
 * Retrato: a câmera não sai do estúdio; sobe um pouco e aceita cortar os púlpitos das pontas.
 */
export function wideFraming(radius: number, aspect: number): { pos: [number, number, number]; look: [number, number, number] } {
  const tanH = Math.tan(FOV / 2) * Math.min(aspect, 16 / 9);
  const halfW = radius + 0.9; // púlpitos dos extremos + margem
  const zEdge = FRONT_Z * radius;
  const z = radius + 3; // borda do piso
  const short = Math.max(0, zEdge + halfW / tanH - z); // quanto faltaria recuar para caber a largura
  const h = 3.4 + 0.2 * radius + Math.min(1.5, 0.3 * short); // um pouco acima das cabeças: rostos de 3/4, telão livre
  const top = Math.atan2(TELAO_TOP - h, z + radius + 1.9);
  const pitch = top - (FOV / 2) * 0.9;
  return { pos: [0, h, z], look: [0, h + Math.tan(pitch) * z, 0] };
}
