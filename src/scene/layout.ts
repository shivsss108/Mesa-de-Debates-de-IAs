export interface SeatPose {
  position: [number, number, number];
  rotationY: number;
}

const deg = (d: number) => (d * Math.PI) / 180;
// Ângulos medidos a partir de −Z (moderador). 40°: púlpito não encosta na bancada (1.7 m) a partir de r = 2.7;
// 104°: o da ponta fica um pouco à frente do eixo x (z ≈ 0.24·r), visto de 3/4 pela câmera em +Z.
const INNER = deg(40);
const OUTER = deg(104);
const MAX_STEP = deg(32); // com poucos membros, não espalha até a ponta: mais rostos de frente
const MIN_GAP = 1.25; // distância mínima entre púlpitos vizinhos (> 1.1 exigido)
const MIN_RADIUS = 2.7; // abaixo disto o púlpito mais interno invade a bancada do moderador

/** Passo angular entre membros do mesmo lado (k = membros no lado mais cheio). */
const stepFor = (k: number) => (k > 1 ? Math.min(MAX_STEP, (OUTER - INNER) / (k - 1)) : 0);

/**
 * Índice 0 = moderador no fundo (0,0,-r) olhando +Z. Membros num arco aberto para a câmera (+Z), dos dois lados do
 * moderador, todos olhando para a origem. Ordem dos assentos = esquerda → direita vista da câmera; com número ímpar
 * de membros o extra fica à esquerda (na ponta).
 */
export function seatPositions(n: number, radius = defaultRadius(n)): SeatPose[] {
  const m = n - 1;
  const left = Math.ceil(m / 2);
  const step = stepFor(left);
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return { position: [0, 0, -radius] as [number, number, number], rotationY: 0 };
    const j = i - 1; // 0..left-1 à esquerda (de fora para dentro), depois à direita (de dentro para fora)
    const a = j < left ? -(INNER + (left - 1 - j) * step) : INNER + (j - left) * step;
    const x = Math.sin(a) * radius;
    const z = -Math.cos(a) * radius;
    // frente do avatar = +Z rotacionado por rotationY; aponta para a origem (-pos)
    return { position: [x, 0, z] as [number, number, number], rotationY: Math.atan2(-x, -z) };
  });
}

/** Raio que garante corda entre vizinhos (2r·sin(Δ/2)) >= MIN_GAP; nunca abaixo de MIN_RADIUS. */
export const defaultRadius = (n: number) => {
  const step = stepFor(Math.ceil((n - 1) / 2));
  return Math.max(MIN_RADIUS, step ? MIN_GAP / (2 * Math.sin(step / 2)) : 0);
};

/** Lado do piso quadrado do estúdio. */
export const studioSize = (radius: number) => 2 * radius + 6;
