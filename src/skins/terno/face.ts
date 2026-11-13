import type { Emotion } from '@/types';

export const FACE_SIZE = 256;

/**
 * Desenha o rosto numa textura FACE_SIZE² mapeada numa SphereGeometry: a frente (+Z) cai em u=0.25, v=0.5.
 * Como u cobre 2π e v só π, o espaço do rosto é comprimido ×0.5 em x — assim pontos ficam redondos na esfera.
 * Unidades do espaço do rosto: ≈81 px por radiano, origem no centro do rosto, y para baixo.
 */
export function drawFace(ctx: CanvasRenderingContext2D, emotion: Emotion, opts: { blink: boolean; mouthOpen: number; offline: boolean }): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
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
  ctx.fillStyle = ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // olhos
  const r = emotion === 'surpresa' ? 9 : 6;
  const ey = emotion === 'pensativo' ? -18 : -10;
  const ex = emotion === 'pensativo' ? 5 : 0;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (opts.blink) {
      ctx.moveTo(s * 26 + ex - r, ey);
      ctx.lineTo(s * 26 + ex + r, ey);
      ctx.stroke();
    } else {
      ctx.ellipse(s * 26 + ex, ey, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // sobrancelhas (só quando a emoção pede)
  const brow = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  if (emotion === 'raiva') {
    brow(-38, -30, -14, -20);
    brow(38, -30, 14, -20);
  } else if (emotion === 'tristeza') {
    brow(-38, -20, -14, -28);
    brow(38, -20, 14, -28);
  } else if (emotion === 'duvida') {
    brow(-36, -22, -16, -22);
    brow(14, -32, 38, -38);
  }

  // boca
  ctx.beginPath();
  if (opts.mouthOpen > 0.05) {
    ctx.ellipse(0, 28, 9, 2 + 9 * opts.mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
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
