'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import { dampE } from 'maath/easing';
import * as THREE from 'three';
import type { Emotion } from '@/types';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise, type Expertise } from '@/presets/expertises';
import type { Skin } from '@/skins/types';
import { drawFace, FACE_SIZE } from './face';
import { POSES, poseAt, type Joint } from './poses';
import { listenerReaction } from './reactions';

type AvatarProps = Parameters<Skin['Avatar']>[0];

const OUT = 0.012; // espessura do contorno
const JOINTS: Joint[] = ['cabeca', 'tronco', 'ombroE', 'cotoveloE', 'ombroD', 'cotoveloD'];
const ZERO: [number, number, number] = [0, 0, 0];
const FACE_MS = 1000 / 12; // redesenho do rosto no máx. ~12 Hz
const BLINK_MS = 130;

const SUIT = new THREE.MeshToonMaterial({ color: '#1b1b20' });
const WHITE = new THREE.MeshToonMaterial({ color: '#ffffff' });
const BLACK = new THREE.MeshToonMaterial({ color: '#0a0a0a' });
const WOOD = new THREE.MeshToonMaterial({ color: '#6d4425' });
const GOLD = new THREE.MeshToonMaterial({ color: '#e0b84a' });
const GRAY = new THREE.MeshToonMaterial({ color: '#8d969b' });

export function TernoAvatar({ seat, view, isSpeaker, speakerPos, addressed = false, speakerStance }: AvatarProps) {
  const moderator = seat === 'moderador';
  const tie = moderator ? '#ffffff' : resolveTemperamento(seat.temperamento).corGravata;
  const acessorio = moderator ? undefined : accessoryOf(resolveExpertise(seat.expertise));

  const root = useRef<THREE.Group>(null);
  const faceMat = useRef<THREE.MeshToonMaterial>(null);
  const cabeca = useRef<THREE.Group>(null);
  const tronco = useRef<THREE.Group>(null);
  const ombroE = useRef<THREE.Group>(null);
  const cotoveloE = useRef<THREE.Group>(null);
  const ombroD = useRef<THREE.Group>(null);
  const cotoveloD = useRef<THREE.Group>(null);
  const state = useRef<FrameState>(null);
  useEffect(() => () => state.current?.tex.dispose(), []);

  useFrame(({ clock }, dt) => {
    const now = performance.now();
    if (!state.current) {
      if (!faceMat.current) return;
      state.current = makeFrameState(now);
      faceMat.current.map = state.current.tex;
      faceMat.current.needsUpdate = true;
    }
    const st = state.current;
    const t = clock.elapsedTime + st.phase;

    // gesture.at está no tempo do debate; ancora no relógio local quando chega um gesto novo
    const g = view.gesture;
    if (g && g.at !== st.seenAt) { st.seenAt = g.at; st.seenLocal = now; }
    const nowT = g ? g.at + (now - st.seenLocal) : 0;
    const reaction = isSpeaker || !speakerPos ? (view.handUp ? 'mao_levantada' : 'idle') : listenerReaction(view, speakerStance ?? 0, addressed);
    const pose = poseAt(view, nowT, isSpeaker, reaction);

    // citado: vira a cabeça para o orador
    let yaw = 0;
    if (addressed && speakerPos && !isSpeaker && root.current) {
      root.current.worldToLocal(st.look.set(speakerPos[0], 1.5, speakerPos[2]));
      yaw = THREE.MathUtils.clamp(Math.atan2(st.look.x, st.look.z), -1.1, 1.1);
    }

    const step = Math.min(dt, 0.1);
    for (const j of JOINTS) {
      const src = pose[j] ?? ZERO;
      st.tgt[0] = src[0]; st.tgt[1] = src[1] + (j === 'cabeca' ? yaw : 0); st.tgt[2] = src[2];
      dampE(st.base[j], st.tgt, 0.18, step);
    }

    // movimento sobre a pose base (sem passar pelo damp, para não amortecer as oscilações)
    const b = st.base;
    let ombroDx = 0, cotoveloDx = 0, cabecaX = 0, troncoX = 0.015 * Math.sin(t * 1.5);
    if (pose === POSES.bater_na_mesa) ombroDx = -0.45 * Math.max(0, Math.sin(t * 12));
    else if (pose === POSES.balancar_cabeca) cabecaX = 0.12 * Math.sin(t * 5);
    else if (pose === POSES.falando) { ombroDx = 0.15 * Math.sin(t * 3); cotoveloDx = 0.2 * Math.sin(t * 3 + 1); }
    if (view.status === 'sem_sinal') { cabecaX += 0.35; troncoX = 0.1; } // cabisbaixo
    tronco.current?.rotation.set(b.tronco.x + troncoX, b.tronco.y, b.tronco.z);
    cabeca.current?.rotation.set(b.cabeca.x + cabecaX, b.cabeca.y, b.cabeca.z);
    ombroE.current?.rotation.copy(b.ombroE);
    cotoveloE.current?.rotation.copy(b.cotoveloE);
    ombroD.current?.rotation.set(b.ombroD.x + ombroDx, b.ombroD.y, b.ombroD.z);
    cotoveloD.current?.rotation.set(b.cotoveloD.x + cotoveloDx, b.cotoveloD.y, b.cotoveloD.z);

    // rosto
    if (now > st.nextBlink + BLINK_MS) st.nextBlink = now + 3000 + Math.random() * 3000;
    const blink = now >= st.nextBlink;
    const offline = view.status === 'sem_sinal';
    const mouth = isSpeaker && view.status === 'ok' ? Math.round((0.5 + 0.5 * Math.sin(t * 14)) * 3) / 3 : 0;
    const d = st.drawn;
    const changed = offline || d.emotion !== view.emotion || d.blink !== blink || d.mouth !== mouth || d.offline !== offline;
    if (changed && now - st.lastDraw >= FACE_MS) {
      drawFace(st.ctx, view.emotion, { blink, mouthOpen: mouth, offline });
      st.tex.needsUpdate = true;
      st.lastDraw = now;
      d.emotion = view.emotion; d.blink = blink; d.mouth = mouth; d.offline = offline;
    }
  });

  return (
    <group ref={root}>
      {/* pernas e sapatos */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.085, 0, 0]}>
          <mesh position={[0, 0.46, 0]} material={SUIT}>
            <capsuleGeometry args={[0.065, 0.72, 4, 10]} />
            <Outlines thickness={OUT} color="black" />
          </mesh>
          <mesh position={[0, 0.035, 0.04]} material={BLACK}>
            <boxGeometry args={[0.1, 0.07, 0.2]} />
          </mesh>
        </group>
      ))}

      <group ref={tronco} position={[0, 0.85, 0]}>
        {/* paletó */}
        <mesh position={[0, 0.25, 0]} scale={[1, 1, 0.72]} material={SUIT}>
          <capsuleGeometry args={[0.16, 0.24, 4, 14]} />
          <Outlines thickness={OUT} color="black" />
        </mesh>
        {/* camisa (V) e gravata */}
        <mesh position={[0, 0.39, 0.112]} rotation-z={-Math.PI / 2} scale={[1.7, 1, 1]} material={WHITE}>
          <circleGeometry args={[0.075, 3]} />
        </mesh>
        <mesh position={[0, 0.3, 0.118]}>
          <boxGeometry args={[0.032, 0.2, 0.01]} />
          <meshToonMaterial color={tie} />
          <Outlines thickness={0.004} color="black" />
        </mesh>
        {acessorio === 'estetoscopio' && <Stethoscope />}
        {acessorio === 'broche' && (
          <mesh position={[0.085, 0.36, 0.112]} rotation-x={Math.PI / 2} material={GOLD}>
            <cylinderGeometry args={[0.022, 0.022, 0.01, 16]} />
          </mesh>
        )}

        <group ref={cabeca} position={[0, 0.5, 0]}>
          <mesh position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.2, 32, 24]} />
            <meshToonMaterial ref={faceMat} />
            <Outlines thickness={0.015} color="black" />
          </mesh>
          {acessorio === 'oculos' && <Glasses />}
          {acessorio === 'capacete' && <HardHat />}
        </group>

        <Arm side="E" shoulder={ombroE} elbow={cotoveloE}>
          {acessorio && HELD[acessorio]}
          {acessorio === 'relogio' && (
            <mesh position={[0, -0.27, 0]} material={GOLD}>
              <cylinderGeometry args={[0.052, 0.052, 0.03, 14]} />
            </mesh>
          )}
        </Arm>
        <Arm side="D" shoulder={ombroD} elbow={cotoveloD}>{moderator && <Gavel />}</Arm>
      </group>
    </group>
  );
}

/** Estado mutável por avatar, criado no primeiro frame (fora do render) — nada é alocado depois. */
function makeFrameState(now: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FACE_SIZE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return {
    ctx: canvas.getContext('2d')!,
    tex,
    base: Object.fromEntries(JOINTS.map((j) => [j, new THREE.Euler()])) as Record<Joint, THREE.Euler>,
    tgt: [0, 0, 0] as [number, number, number],
    look: new THREE.Vector3(),
    seenAt: NaN,
    seenLocal: 0,
    nextBlink: now + 3000 + Math.random() * 3000,
    phase: Math.random() * 10,
    lastDraw: -Infinity,
    drawn: { emotion: '' as Emotion | '', blink: false, mouth: -1, offline: false },
  };
}
type FrameState = ReturnType<typeof makeFrameState>;

/** Acessório da expertise; neutra/personalizada não tem acessório. */
function accessoryOf(e: Expertise): Expertise['acessorio'] | undefined {
  return e.id === 'neutra' ? undefined : e.acessorio;
}

type GroupRef = RefObject<THREE.Group | null>;

function Arm({ side, shoulder, elbow, children }: { side: 'E' | 'D'; shoulder: GroupRef; elbow: GroupRef; children?: ReactNode }) {
  const s = side === 'E' ? 1 : -1;
  return (
    <group ref={shoulder} position={[s * 0.2, 0.42, 0]}>
      <mesh position={[0, -0.16, 0]} material={SUIT}>
        <capsuleGeometry args={[0.05, 0.24, 4, 10]} />
        <Outlines thickness={OUT} color="black" />
      </mesh>
      <group ref={elbow} position={[0, -0.32, 0]}>
        <mesh position={[0, -0.14, 0]} material={SUIT}>
          <capsuleGeometry args={[0.045, 0.2, 4, 10]} />
          <Outlines thickness={OUT} color="black" />
        </mesh>
        <mesh position={[0, -0.33, 0]} material={WHITE}>
          <sphereGeometry args={[0.05, 14, 10]} />
          <Outlines thickness={OUT} color="black" />
        </mesh>
        {children}
      </group>
    </group>
  );
}

/** Objetos segurados na mão esquerda (coordenadas do antebraço; mão em y=-0.33). */
const HELD: Partial<Record<Expertise['acessorio'], ReactNode>> = {
  prancheta: (
    <group position={[0, -0.36, 0.07]} rotation={[-0.3, 0, 0]}>
      <mesh material={WOOD}><boxGeometry args={[0.16, 0.22, 0.012]} /><Outlines thickness={0.006} color="black" /></mesh>
      <mesh position={[0, -0.01, 0.007]} material={WHITE}><boxGeometry args={[0.13, 0.17, 0.002]} /></mesh>
    </group>
  ),
  livro: (
    <mesh position={[0, -0.36, 0.06]} rotation={[-0.3, 0, 0]}>
      <boxGeometry args={[0.14, 0.18, 0.04]} />
      <meshToonMaterial color="#8e2b2b" />
      <Outlines thickness={0.006} color="black" />
    </mesh>
  ),
  calculadora: (
    <mesh position={[0, -0.35, 0.055]} rotation={[-0.4, 0, 0]} material={GRAY}>
      <boxGeometry args={[0.08, 0.12, 0.02]} />
      <Outlines thickness={0.006} color="black" />
    </mesh>
  ),
  pasta: (
    <mesh position={[0, -0.47, 0]} material={WOOD}>
      <boxGeometry args={[0.07, 0.22, 0.3]} />
      <Outlines thickness={0.008} color="black" />
    </mesh>
  ),
  pincel: (
    <group position={[0, -0.35, 0.03]} rotation={[-1.2, 0, 0]}>
      <mesh material={WOOD}><cylinderGeometry args={[0.01, 0.012, 0.22, 8]} /></mesh>
      <mesh position={[0, 0.13, 0]}><coneGeometry args={[0.018, 0.05, 8]} /><meshToonMaterial color="#d81b60" /></mesh>
    </group>
  ),
};

function Glasses() {
  return (
    <group position={[0, 0.175, 0.195]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.065, 0, 0]} material={BLACK}>
          <torusGeometry args={[0.042, 0.008, 6, 20]} />
        </mesh>
      ))}
      <mesh material={BLACK}><boxGeometry args={[0.05, 0.008, 0.008]} /></mesh>
    </group>
  );
}

function HardHat() {
  return (
    <group position={[0, 0.22, 0]}>
      <mesh>
        <sphereGeometry args={[0.21, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial color="#fbc02d" side={THREE.DoubleSide} />
        <Outlines thickness={0.01} color="black" />
      </mesh>
      <mesh position={[0, 0.005, 0.02]}>
        <cylinderGeometry args={[0.245, 0.245, 0.015, 24]} />
        <meshToonMaterial color="#fbc02d" />
        <Outlines thickness={0.006} color="black" />
      </mesh>
    </group>
  );
}

function Stethoscope() {
  return (
    <group>
      <mesh position={[0, 0.46, 0.02]} rotation-x={Math.PI / 2 - 0.3} material={GRAY}>
        <torusGeometry args={[0.1, 0.011, 6, 24]} />
      </mesh>
      <mesh position={[-0.06, 0.24, 0.12]} rotation-x={Math.PI / 2} material={GRAY}>
        <cylinderGeometry args={[0.028, 0.028, 0.015, 14]} />
        <Outlines thickness={0.005} color="black" />
      </mesh>
    </group>
  );
}

/** Martelo do moderador, na mão direita. */
function Gavel() {
  return (
    <group position={[0, -0.33, 0.04]} rotation-x={-Math.PI / 2}>
      <mesh position={[0, 0.08, 0]} material={WOOD}><cylinderGeometry args={[0.012, 0.012, 0.2, 8]} /></mesh>
      <mesh position={[0, 0.18, 0]} rotation-z={Math.PI / 2} material={WOOD}>
        <cylinderGeometry args={[0.035, 0.035, 0.11, 12]} />
        <Outlines thickness={0.006} color="black" />
      </mesh>
    </group>
  );
}
