'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { MODERATOR_ID } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { ROOM } from '@/scene/Room';
import { typingTarget } from '@/scene/keys';

export type CameraMode = 'diretor' | 'orbita' | 'livre';
export const CAMERA_LABEL: Record<CameraMode, string> = { diretor: 'Diretor', orbita: 'Órbita', livre: 'Livre' };
const SPEED = 3; // u/s
const LIMIT = ROOM / 2 - 0.5;
const CLOSE_MS = 1500;

interface Props {
  mode: CameraMode;
  scene: SceneState;
  /** posição de cada assento por id */
  posOf: Record<string, [number, number, number]>;
  radius: number;
}

export function Cameras({ mode, scene, posOf, radius }: Props) {
  return (
    <>
      {mode === 'orbita' && <OrbitControls makeDefault target={[0, 0.8, 0]} maxPolarAngle={Math.PI / 2 - 0.05} />}
      {mode === 'livre' && <FreeCam />}
      {mode === 'diretor' && <DirectorCam scene={scene} posOf={posOf} radius={radius} />}
    </>
  );
}

function FreeCam() {
  const camera = useThree((s) => s.camera);
  const keys = useRef(new Set<string>());
  useEffect(() => {
    camera.position.y = 1.6;
    const down = (e: KeyboardEvent) => !typingTarget(e) && keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera]);
  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (!f && !r) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    const step = SPEED * Math.min(dt, 0.1);
    camera.position.addScaledVector(dir, f * step).addScaledVector(side, r * step);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -LIMIT, LIMIT);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -LIMIT, LIMIT);
  });
  return <PointerLockControls selector="canvas" />;
}

function DirectorCam({ scene, posOf, radius }: Pick<Props, 'scene' | 'posOf' | 'radius'>) {
  const lookAt = useRef(new THREE.Vector3(0, 0.8, 0));
  const close = useRef<{ id: string; until: number }>(undefined);
  const seen = useRef<Record<string, number | undefined>>({});

  // close de 1.5s quando chega gesture bater_na_mesa
  useEffect(() => {
    for (const [id, m] of Object.entries(scene.members)) {
      if (m.gesture?.name === 'bater_na_mesa' && seen.current[id] !== m.gesture.at) {
        seen.current[id] = m.gesture.at;
        close.current = { id, until: performance.now() + CLOSE_MS };
      }
    }
  }, [scene.members]);

  const sp = scene.speaker;
  const cam = new THREE.Vector3();
  const look = new THREE.Vector3();
  useFrame(({ camera }, dt) => {
    const c = close.current && close.current.until > performance.now() ? close.current.id : undefined;
    const id = c ?? sp;
    const p = id && id !== MODERATOR_ID ? posOf[id] : undefined;
    if (!p) {
      cam.set(0, 3.6, radius + 4.2);
      look.set(0, 0.8, 0);
    } else {
      const dir = new THREE.Vector3(p[0], 0, p[2]).normalize();
      const back = c ? 1.3 : 2.4;
      cam.set(p[0] - dir.x * back, c ? 1.6 : 1.9, p[2] - dir.z * back);
      look.set(p[0], 1.3, p[2]);
    }
    const a = 1 - Math.exp(-3 * dt);
    camera.position.lerp(cam, a);
    lookAt.current.lerp(look, a);
    camera.lookAt(lookAt.current);
  });
  return null;
}
