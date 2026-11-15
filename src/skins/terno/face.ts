import type { Emotion } from '@/types';

export const FACE_SIZE = 256;

/**
 * Desenha o rosto numa textura FACE_SIZE² mapeada numa SphereGeometry: a frente (+Z) cai em u=0.25, v=0.5.
 * Como u cobre 2π e v só π, o espaço do rosto é comprimido ×0.5 em x — assim pontos ficam redondos na esfera.
 * Unidades do espaço do rosto: ≈81 px por radiano, origem no centro do rosto, y para baixo.
 */

const SCLERA = '#f6f4ee', IRIS = '#3b2a1e', PUPIL = '#0c0c0c', LASH = '#2a1a12', LIP = '#a8505a', MOUTH = '#3a0f14', TEETH = '#f8f6f0';

/** Sobrancelha por emoção: [yExterno, yInterno, curvatura] — esquerda e direita (y menor = mais alta). */
const BROWS: Record<Emotion, [[number, number, number], [number, number, number]]> = {
  neutro: [[-32, -32, -3], [-32, -32, -3]],
  feliz: [[-34, -37, -4], [-34, -37, -4]],
  raiva: [[-36, -24, 0], [-36, -24, 0]],
  tristeza: [[-28, -39, -1], [-28, -39, -1]],
  surpresa: [[-42, -43, -5], [-42, -43, -5]],
  desdem: [[-28, -26, 0], [-38, -41, -3]],
  duvida: [[-32, -31, 0], [-44, -39, -4]],
  pensativo: [[-30, -34, -2], [-36, -42, -3]],
};

export function drawFace(
  ctx: CanvasRenderingContext2D,
  emotion: Emotion,
  opts: { blink: boolean; mouthOpen: number; offline: boolean; skin: string },
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = opts.skin;
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE);

  if (opts.offline) {
    // estática: chuvisco cinza sobre toda a cabeça
    for (let i = 0; i < 500; i++) {
      const g = (Math.random() * 200) | 0;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(Math.random() * FACE_SIZE, Math.random() * FACE_SIZE, 6, 4);
    }
    return;
  }

  ctx.setTransform(0.5, 0, 0, 1, FACE_SIZE / 4, FACE_SIZE / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const oval = (x: number, y: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  };

  // olhos
  const wide = emotion === 'surpresa';
  const gx = emotion === 'pensativo' ? 3 : emotion === 'duvida' ? 2 : 0;
  const gy = emotion === 'pensativo' ? -3 : 0;
  const ry = wide ? 10 : emotion === 'desdem' ? 6 : 8;
  ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    const x = s * 26;
    if (opts.blink) {
      ctx.fillStyle = opts.skin;
      oval(x, -10, 11, 6);
      ctx.fill();
      ctx.strokeStyle = LASH;
      ctx.beginPath();
      ctx.moveTo(x - 11, -10);
      ctx.quadraticCurveTo(x, -6, x + 11, -10);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = SCLERA;
    oval(x, -10, wide ? 12 : 11, ry);
    ctx.fill();
    ctx.fillStyle = IRIS;
    oval(x + gx, -10 + gy, wide ? 4.5 : 5.5, wide ? 4.5 : 5.5);
    ctx.fill();
    ctx.fillStyle = PUPIL;
    oval(x + gx, -10 + gy, 2.6, 2.6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    oval(x + gx - 1.8, -10 + gy - 2, 1.4, 1.4);
    ctx.fill();
    ctx.strokeStyle = LASH; // pálpebra superior
    ctx.beginPath();
    ctx.moveTo(x - 12, -10);
    ctx.quadraticCurveTo(x, -10 - ry * 1.5, x + 12, -10);
    ctx.stroke();
  }

  // sobrancelhas (sempre; a emoção muda altura e inclinação)
  ctx.strokeStyle = LASH;
  ctx.lineWidth = 4;
  [-1, 1].forEach((s, i) => {
    const [yo, yi, bow] = BROWS[emotion][i];
    ctx.beginPath();
    ctx.moveTo(s * 40, yo);
    ctx.quadraticCurveTo(s * 27, (yo + yi) / 2 + bow, s * 14, yi);
    ctx.stroke();
  });

  // boca
  ctx.strokeStyle = LIP;
  ctx.lineWidth = 3.5;
  const m = opts.mouthOpen;
  if (m > 0.05) {
    const rx = emotion === 'feliz' ? 11 : 9;
    const h = 2 + 9 * m;
    ctx.fillStyle = MOUTH;
    oval(0, 28, rx, h);
    ctx.fill();
    if (m >= 0.6) {
      ctx.fillStyle = TEETH;
      ctx.fillRect(-rx * 0.7, 28 - h + 1.5, rx * 1.4, 4);
    }
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  switch (emotion) {
    case 'feliz':
      ctx.moveTo(-16, 22);
      ctx.quadraticCurveTo(0, 40, 16, 22);
      break;
    case 'raiva':
      ctx.moveTo(-14, 33);
      ctx.quadraticCurveTo(0, 21, 14, 33);
      break;
    case 'tristeza':
      ctx.moveTo(-12, 31);
      ctx.quadraticCurveTo(0, 25, 12, 31);
      break;
    case 'surpresa':
      ctx.ellipse(0, 30, 7, 9, 0, 0, Math.PI * 2);
      break;
    case 'desdem':
      ctx.moveTo(-6, 30);
      ctx.lineTo(16, 22);
      break;
    case 'duvida':
      ctx.moveTo(-10, 28);
      ctx.lineTo(10, 28);
      break;
    case 'pensativo':
      ctx.moveTo(2, 28);
      ctx.lineTo(14, 28);
      break;
    case 'neutro':
      ctx.moveTo(-12, 25);
      ctx.quadraticCurveTo(0, 31, 12, 25);
      break;
  }
  ctx.stroke();
}
