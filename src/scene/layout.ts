export interface SeatPose {
  position: [number, number, number];
  rotationY: number;
}

const ARC = (200 * Math.PI) / 180; // membros espalhados em [-100°, +100°] em torno de +Z (câmera)
const MIN_GAP = 1.25; // distância mínima entre púlpitos vizinhos (> 1.1 exigido)

/** Índice 0 = moderador no fundo (0,0,-r); membros em arco voltado para a câmera (+Z), todos olhando para a origem. */
export function seatPositions(n: number, radius = defaultRadius(n)): SeatPose[] {
  const m = n - 1;
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { position: [0, 0, -radius] as [number, number, number], rotationY: 0 };
    const a = m === 1 ? 0 : -ARC / 2 + ((i - 1) * ARC) / (m - 1);
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    // frente do avatar = +Z rotacionado por rotationY; aponta para a origem (-pos)
    return { position: [x, 0, z] as [number, number, number], rotationY: Math.atan2(-x, -z) };
  });
}

/** Raio que garante corda entre vizinhos (2r·sin(Δ/2)) >= MIN_GAP; nunca abaixo do visual antigo nem de 2.2. */
export const defaultRadius = (n: number) => {
  const m = n - 1;
  const need = m > 1 ? MIN_GAP / (2 * Math.sin(ARC / (m - 1) / 2)) : 0;
  return Math.max(2.2, 1.6 + 0.15 * n, need);
};

/** Lado do piso quadrado do estúdio. */
export const studioSize = (radius: number) => 2 * radius + 6;
