'use client';
import { Outlines } from '@react-three/drei';

export function Table({ radius }: { radius: number }) {
  return (
    <group>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[radius, radius, 0.08, 48]} />
        <meshToonMaterial color="#8a5a35" />
        <Outlines thickness={0.02} color="black" />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.25, 0.4, 0.74, 24]} />
        <meshToonMaterial color="#5e3d24" />
        <Outlines thickness={0.02} color="black" />
      </mesh>
    </group>
  );
}
