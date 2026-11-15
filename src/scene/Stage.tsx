'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { MODERATOR_ID } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import type { Skin } from '@/skins/types';
import { ternoSkin } from '@/skins/terno';
import { looksFor } from '@/skins/terno/look';
import { defaultRadius, seatPositions } from '@/scene/layout';
import { Studio } from '@/scene/Studio';
import { Cameras, type CameraMode } from '@/scene/Cameras';
import { Hud, type StageControls } from '@/scene/Hud';
import { BubbleAnchor, SpeechBubble } from '@/scene/SpeechBubble';
import { Transcript } from '@/scene/Transcript';
import { typingTarget } from '@/scene/keys';
import { cancelSpeech } from '@/voice/speech';

const MODES: CameraMode[] = ['diretor', 'orbita', 'livre'];

export function Stage({ scene, skin = ternoSkin, controls, defaultCamera = 'orbita', bare = false }: {
  scene: SceneState; skin?: Skin; controls: StageControls; defaultCamera?: CameraMode; /** sem HUD nem transcrição (fundo da tela inicial) */ bare?: boolean;
}) {
  const [mode, setMode] = useState<CameraMode>(defaultCamera);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string>();
  const cycle = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);

  useEffect(cancelSpeech, [scene.config]); // novo debate/replay: esquece a fala do anterior

  // relógio do programa (telão): zera a cada debate_start, tique de 1 s
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setElapsedMs(performance.now() - t0), 1000);
    return () => {
      clearInterval(id);
      setElapsedMs(0);
    };
  }, [scene.config]);

  const [debug] = useState(() => location.search.includes('debug')); // Stage só roda no cliente (dynamic ssr:false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyC') setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const cfgSeats = scene.config?.seats;
  const seats = cfgSeats ?? [];
  const looks = useMemo(() => looksFor(cfgSeats ?? []), [cfgSeats]);
  const n = seats.length + 1;
  const radius = defaultRadius(n);
  const poses = useMemo(() => seatPositions(n, radius), [n, radius]);
  const ids = [MODERATOR_ID, ...seats.map((s) => s.id)];
  const posOf = Object.fromEntries(ids.map((id, i) => [id, poses[i].position])) as Record<string, [number, number, number]>;
  const speakerPos = scene.speaker ? posOf[scene.speaker] : undefined;
  const speakerStance = scene.speaker ? scene.members[scene.speaker]?.stance : undefined;
  const Avatar = skin.Avatar;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1426' }}>
      <Canvas camera={{ position: [0, 3.2, radius + 3], fov: 55 }} dpr={[1, 2]}>
        <color attach="background" args={['#0b1426']} />
        <Studio radius={radius} seats={seats} speakerId={scene.speaker} elapsedMs={elapsedMs} scene={scene} />
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
              <Avatar seat={seat} view={view} isSpeaker={scene.speaker === id} speakerPos={speakerPos} addressed={scene.addressedTo === id} speakerStance={speakerStance} look={looks[id === MODERATOR_ID ? 'moderador' : id]} />
            </group>
          );
        })}
        {scene.speaker && speakerPos && (
          <BubbleAnchor position={[speakerPos[0], 2.3, speakerPos[2]]} target={bubbleRef} />
        )}
        <Cameras mode={mode} scene={scene} posOf={posOf} radius={radius} />
        {debug && <Stats />}
      </Canvas>
      {!bare && <SpeechBubble speaker={scene.speaker} turnSeq={scene.turnSeq} override={scene.searching ? `🔎 pesquisando: ${scene.searching}` : undefined} anchorRef={bubbleRef} />}
      {!bare && <Hud scene={scene} controls={controls} camera={mode} onCamera={cycle} hovered={hovered} />}
      {!bare && <Transcript scene={scene} />}
    </div>
  );
}
