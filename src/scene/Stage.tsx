'use client';
import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Outlines, Stats } from '@react-three/drei';
import { MODERATOR_ID } from '@/types';
import { resolveTemperamento } from '@/presets/temperamentos';
import type { SceneState } from '@/scene/sceneReducer';
import type { Skin } from '@/skins/types';
import { defaultRadius, seatPositions } from '@/scene/layout';
import { Room, roomSize } from '@/scene/Room';
import { Table } from '@/scene/Table';
import { Cameras, type CameraMode } from '@/scene/Cameras';
import { Hud, type StageControls } from '@/scene/Hud';
import { SpeechBubble } from '@/scene/SpeechBubble';
import { Transcript } from '@/scene/Transcript';
import { typingTarget } from '@/scene/keys';

const MODES: CameraMode[] = ['diretor', 'orbita', 'livre'];

/** Skin provisório (Task 10 traz o definitivo): cápsula colorida + cabeça esférica. */
export const placeholderSkin: Skin = {
  Avatar({ seat, view, isSpeaker }) {
    const color = seat === 'moderador' ? '#222' : resolveTemperamento(seat.temperamento).corGravata;
    return (
      <group scale={isSpeaker ? 1.05 : 1}>
        <mesh position={[0, 0.8, 0]}>
          <capsuleGeometry args={[0.2, 0.7, 4, 12]} />
          <meshToonMaterial color={color} />
          <Outlines thickness={0.02} color="black" />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.2, 24, 16]} />
          <meshToonMaterial color="#fff" />
          <Outlines thickness={0.02} color="black" />
        </mesh>
        {view.handUp && (
          <mesh position={[0.3, 1.9, 0]}>
            <sphereGeometry args={[0.08, 12, 8]} />
            <meshToonMaterial color="#ffd54f" />
          </mesh>
        )}
      </group>
    );
  },
};

export function Stage({ scene, skin = placeholderSkin, controls, defaultCamera = 'orbita' }: {
  scene: SceneState; skin?: Skin; controls: StageControls; defaultCamera?: CameraMode;
}) {
  const [mode, setMode] = useState<CameraMode>(defaultCamera);
  const [hovered, setHovered] = useState<string>();
  const cycle = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyC') setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const seats = scene.config?.seats ?? [];
  const n = seats.length + 1;
  const radius = defaultRadius(n);
  const poses = useMemo(() => seatPositions(n, radius), [n, radius]);
  const ids = [MODERATOR_ID, ...seats.map((s) => s.id)];
  const posOf = Object.fromEntries(ids.map((id, i) => [id, poses[i].position])) as Record<string, [number, number, number]>;
  const speakerPos = scene.speaker ? posOf[scene.speaker] : undefined;
  const Avatar = skin.Avatar;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f2a2e' }}>
      <Canvas camera={{ position: [0, 3.2, radius + 3], fov: 55 }} dpr={[1, 2]}>
        <ambientLight intensity={1.2} color="#9fc9cc" />
        <pointLight position={[0, 3, 0]} color="#ffb870" intensity={8} distance={0} decay={2} />
        <Room size={roomSize(radius)} />
        <Table radius={radius - 0.55} />
        {ids.map((id, i) => {
          const view = scene.members[id];
          if (!view) return null;
          const seat = id === MODERATOR_ID ? 'moderador' : seats.find((s) => s.id === id)!;
          return (
            <group
              key={id}
              position={poses[i].position}
              rotation-y={poses[i].rotationY}
              onPointerOver={(e) => { e.stopPropagation(); setHovered(id); }}
              onPointerOut={() => setHovered((h) => (h === id ? undefined : h))}
            >
              <Avatar seat={seat} view={view} isSpeaker={scene.speaker === id} speakerPos={speakerPos} />
            </group>
          );
        })}
        {scene.speaker && speakerPos && (
          <SpeechBubble position={[speakerPos[0], 2.3, speakerPos[2]]} text={scene.bubble} />
        )}
        <Cameras mode={mode} scene={scene} posOf={posOf} radius={radius} />
        {process.env.NODE_ENV === 'development' && <Stats />}
      </Canvas>
      <Hud scene={scene} controls={controls} camera={mode} onCamera={cycle} hovered={hovered} />
      <Transcript scene={scene} />
    </div>
  );
}
