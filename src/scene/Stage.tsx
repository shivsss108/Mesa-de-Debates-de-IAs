'use client';
import { useEffect, useMemo, useState } from 'react';
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
import { memberName } from '@/scene/names';
import { Caption } from '@/scene/Caption';
import { LowerThird } from '@/scene/LowerThird';
import s from '@/scene/overlays.module.css';
import { Transcript } from '@/scene/Transcript';
import { typingTarget } from '@/scene/keys';
import { cancelSpeech } from '@/voice/speech';

const MODES: CameraMode[] = ['diretor', 'orbita', 'livre'];

export function Stage({ scene, skin = ternoSkin, controls, defaultCamera = 'diretor', bare = false }: {
  scene: SceneState; skin?: Skin; controls: StageControls; defaultCamera?: CameraMode; /** sem HUD nem transcrição (fundo da tela inicial) */ bare?: boolean;
}) {
  const [mode, setMode] = useState<CameraMode>(defaultCamera);
  const [hovered, setHovered] = useState<string>();
  const cycle = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);

  useEffect(cancelSpeech, [scene.config]); // novo debate/replay: esquece a fala do anterior

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
        <Studio radius={radius} seats={seats} speakerId={scene.speaker} scene={scene} />
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
        <Cameras mode={mode} scene={scene} posOf={posOf} radius={radius} />
        {debug && <Stats />}
      </Canvas>
      {!bare && (
        <div className={s.root}>
          <LowerThird scene={scene} />
          <Caption speaker={scene.speaker} name={scene.speaker ? memberName(scene.config, scene.speaker) : undefined} turnSeq={scene.turnSeq} override={scene.searching ? `🔎 pesquisando: ${scene.searching}` : undefined} />
        </div>
      )}
      {!bare && <Hud scene={scene} controls={controls} camera={mode} onCamera={cycle} hovered={hovered} />}
      {!bare && <Transcript scene={scene} />}
    </div>
  );
}
