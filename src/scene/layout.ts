export interface SeatPose {
  position: [number, number, number];
  rotationY: number;
}

/** Índice 0 = moderador na cabeceira (ângulo 0); membros distribuídos uniformemente no restante do círculo. */
export function seatPositions(n: number, radius = 1.6 + 0.15 * n): SeatPose[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    // frente do avatar = +Z rotacionado por rotationY; aponta para o centro (-pos)
    return { position: [x, 0, z] as [number, number, number], rotationY: Math.atan2(-x, -z) };
  });
}

export const defaultRadius = (n: number) => 1.6 + 0.15 * n;
