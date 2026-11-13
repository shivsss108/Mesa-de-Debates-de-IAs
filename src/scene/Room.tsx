'use client';
import { useMemo } from 'react';
import * as THREE from 'three';

export const ROOM = 12; // lado da sala (u); limite da câmera livre = ROOM/2

function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + Math.random() * 105;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sala azul-petróleo com textura de ruído (estilo pictórico/granulado da referência). */
export function Room() {
  const noise = useMemo(makeNoise, []);
  return (
    <group>
      <color attach="background" args={['#0f2a2e']} />
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[ROOM, 5, ROOM]} />
        <meshToonMaterial side={THREE.BackSide} map={noise} color="#2a5a5f" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[ROOM, ROOM]} />
        <meshToonMaterial map={noise} color="#1a3a3e" />
      </mesh>
    </group>
  );
}
