'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { MODERATOR_ID } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { studioSize } from '@/scene/layout';
import { typingTarget } from '@/scene/keys';
import { REACTION_AT, shotFor, wideFraming } from '@/scene/shots';
import { speechProgress } from '@/voice/speech';

export type CameraMode = 'diretor' | 'orbita' | 'livre';
export const CAMERA_LABEL: Record<CameraMode, string> = { diretor: 'Diretor', orbita: 'Órbita', livre: 'Livre' };
const SPEED = 3; // u/s

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
      {mode === 'orbita' && <OrbitCam radius={radius} />}
      {mode === 'livre' && <FreeCam limit={studioSize(radius) / 2 - 0.5} />}
      {mode === 'diretor' && <DirectorCam scene={scene} posOf={posOf} radius={radius} />}
    </>
  );
}

function OrbitCam({ radius }: { radius: number }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, 3.2, radius + 3); // plano aberto ao entrar na órbita
  }, [camera, radius]);
  return (
    <OrbitControls makeDefault target={[0, 0.8, 0]} minDistance={2} maxDistance={Math.min(9, studioSize(radius) / 2 + 1.5)} maxPolarAngle={Math.PI / 2 - 0.05} />
  );
}

function FreeCam({ limit }: { limit: number }) {
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
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -limit, limit);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -limit, limit);
  });
  return <PointerLockControls selector="canvas" />;
}

const CLOSE_DIST = 1.9; // m à frente do alvo (plano médio fechado; 1.6 no fim do push-in)
const CLOSE_MAX = 3; // retrato afasta o close, até aqui
/** Centro da cabeça acima do assento: HIP 0.95 + NECK_Y 0.6 + 0.2 (src/skins/terno/Avatar.tsx); igual para moderador e membros. */
const HEAD_Y = 1.75;
const CLOSE_SIDE = (25 * Math.PI) / 180; // 3/4, deslocado para o lado da câmera (+Z)
const PUSH_IN = 0.3; // m de aproximação ao longo da fala

function DirectorCam({ scene, posOf, radius }: Pick<Props, 'scene' | 'posOf' | 'radius'>) {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const wide = useMemo(() => wideFraming(radius, aspect), [radius, aspect]);
  const closeDist = Math.min(CLOSE_MAX, CLOSE_DIST / Math.min(1, aspect / (4 / 3))); // retrato: recua para caber os ombros
  const reduced = useRef(false);
  const turn = useRef<{ seq: number; since?: number; done: boolean }>({ seq: NaN, done: false });
  const push = useRef(0);
  const last = useRef('');
  const cam = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => { reduced.current = mq.matches; };
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  useFrame(({ camera }, dt) => {
    const now = performance.now();
    const { speaker, addressedTo, turnSeq } = scene;
    const { speaking, progress } = speaker ? speechProgress(speaker, turnSeq) : { speaking: false, progress: 0 };
    const t = turn.current;
    if (t.seq !== turnSeq) Object.assign(t, { seq: turnSeq, since: undefined, done: false });
    // reação: uma vez por turno, quando a fala cruza REACTION_AT
    if (!t.done && addressedTo && speaking && progress >= REACTION_AT) Object.assign(t, { since: now, done: true });

    const shot = shotFor({ speaker, addressedTo, speaking, progress, reactionSince: t.since, now, reducedMotion: reduced.current });
    const p = shot.target ? posOf[shot.target] : undefined;
    const key = `${shot.kind}:${shot.target ?? ''}`;
    if (key !== last.current) { last.current = key; push.current = 0; } // corte seco: push-in recomeça

    if (!p) {
      cam.current.set(...wide.pos);
      look.current.set(...wide.look);
    } else {
      // frente do alvo: moderador olha +Z; membros olham para a origem
      const fwd = shot.target === MODERATOR_ID ? 0 : Math.atan2(-p[0], -p[2]);
      // gira para o lado da câmera (+Z): rosto de 3/4 e, atrás do orador, o fundo curvo (não o vazio da frente)
      const ang = fwd + (p[0] < -0.01 ? -CLOSE_SIDE : CLOSE_SIDE);
      const goal = shot.kind === 'close' && !reduced.current ? PUSH_IN * progress : 0;
      push.current += (goal - push.current) * (1 - Math.exp(-3 * dt)); // suaviza os saltos palavra a palavra
      const d = closeDist - push.current;
      const head = p[1] + HEAD_Y;
      cam.current.set(p[0] + Math.sin(ang) * d, head + 0.05, p[2] + Math.cos(ang) * d);
      look.current.set(p[0], head - 0.15, p[2]); // queixo/pescoço: cabeça inteira com folga em cima
    }
    camera.position.copy(cam.current);
    camera.lookAt(look.current);
  });
  return null;
}
