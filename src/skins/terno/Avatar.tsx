'use client';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { dampE } from 'maath/easing';
import * as THREE from 'three';
import { MODERATOR_ID, type Emotion } from '@/types';
import { mouthOpen } from '@/voice/speech';
import { resolveExpertise, type Expertise } from '@/presets/expertises';
import type { Skin } from '@/skins/types';
import { drawFace, FACE_SIZE } from './face';
import { lookOf, type Hair } from './look';
import { POSES, poseAt, type Joint } from './poses';
import { listenerReaction } from './reactions';

type AvatarProps = Parameters<Skin['Avatar']>[0];

const JOINTS: Joint[] = ['cabeca', 'tronco', 'ombroE', 'cotoveloE', 'ombroD', 'cotoveloD'];
const ZERO: [number, number, number] = [0, 0, 0];
const FACE_MS = 1000 / 12; // redesenho do rosto no máx. ~12 Hz
const BLINK_MS = 130;
const BREATH = Math.PI * 2 * 0.25; // respiração ~0.25 Hz

/* Proporções (m). Quadril (pivô do tronco) em HIP; púlpito ~1.05: com bater_na_mesa a mão (ombro y 0.45,
   braço 0.26 + antebraço 0.24) para em y≈1.06 à frente do avatar. */
const HIP = 0.95;
const SHOULDER: [number, number] = [0.235, 0.45];
const UPPER = 0.26;
const HAND = 0.24; // cotovelo → centro da mão
const HEAD_R = 0.23;
const NECK_Y = 0.6; // pivô da cabeça (local do tronco); centro da cabeça +0.2

/* Materiais compartilhados por cor (cache de módulo). */
const MATS = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.8, side: THREE.Side = THREE.FrontSide) {
  const key = `${color}|${roughness}|${side}`;
  let m = MATS.get(key);
  if (!m) MATS.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, side })));
  return m;
}
const shade = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const WHITE = mat('#f4f4f2');
const BLACK = mat('#111111', 0.4);
const WOOD = mat('#6d4425', 0.7);
const GRAY = mat('#8d969b', 0.5);
const GOLD = new THREE.MeshStandardMaterial({ color: '#e0b84a', roughness: 0.35, metalness: 0.7 });

/* Geometrias compartilhadas entre avatares. */
const torsoProfile = [[0.15, 0], [0.16, 0.1], [0.18, 0.25], [0.2, 0.38], [0.19, 0.45], [0.13, 0.52], [0.06, 0.555], [0, 0.56]]
  .map(([r, y]) => new THREE.Vector2(r, y));
const G = {
  torso: new THREE.LatheGeometry(torsoProfile, 20),
  leg: new THREE.CapsuleGeometry(0.075, 0.8, 4, 10),
  neck: new THREE.CylinderGeometry(0.055, 0.06, 0.14, 12),
  head: new THREE.SphereGeometry(HEAD_R, 32, 24),
  ball: new THREE.SphereGeometry(1, 14, 10), // esfera unitária (escalar na malha)
  shirtV: new THREE.CircleGeometry(0.075, 3),
  lapel: new THREE.PlaneGeometry(0.055, 0.2),
  tie: new THREE.BoxGeometry(0.036, 0.19, 0.01),
  knot: new THREE.BoxGeometry(0.04, 0.035, 0.015),
  upper: new THREE.CapsuleGeometry(0.055, UPPER - 0.08, 4, 10),
  fore: new THREE.CapsuleGeometry(0.048, HAND - 0.1, 4, 10),
  cuff: new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12),
  palm: new THREE.CapsuleGeometry(0.036, 0.05, 4, 10),
  thumb: new THREE.CapsuleGeometry(0.014, 0.035, 3, 6),
  hairCap: new THREE.SphereGeometry(HEAD_R + 0.016, 24, 12, 0, Math.PI * 2, 0, 1.2),
  beard: new THREE.SphereGeometry(HEAD_R + 0.008, 20, 6, 0, Math.PI, Math.PI / 2 + 0.6, Math.PI / 2 - 0.75),
  lens: new THREE.TorusGeometry(0.045, 0.007, 6, 20),
  bridge: new THREE.BoxGeometry(0.05, 0.007, 0.007),
};

/** Cachos: pontos (polar, azimute) sobre a calota, sem cobrir a testa. */
const CURLS: [number, number, number][] = (
  [[0.2, 0], [0.55, 2], [0.55, 4], [0.7, 0.9], [0.7, -0.9], [0.95, 1.6], [0.95, -1.6], [0.95, 2.4], [0.95, -2.4], [1.1, Math.PI], [0.6, Math.PI]] as const
).map(([p, a]) => {
  const r = HEAD_R + 0.03;
  return [r * Math.sin(p) * Math.sin(a), 0.2 + r * Math.cos(p), r * Math.sin(p) * Math.cos(a) - 0.03];
});

export function TernoAvatar({ seat, view, isSpeaker, speakerPos, addressed = false, speakerStance, look: lookProp }: AvatarProps) {
  const moderator = seat === 'moderador';
  const id = moderator ? MODERATOR_ID : seat.id;
  const look = useMemo(() => lookProp ?? lookOf(seat), [lookProp, seat]);
  const acessorio = moderator ? undefined : accessoryOf(resolveExpertise(seat.expertise));
  const suit = mat(look.suit);
  const skin = mat(look.skin, 0.6);

  const root = useRef<THREE.Group>(null);
  const faceMat = useRef<THREE.MeshStandardMaterial>(null);
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

    // todo ouvinte olha para o orador (cabeça); o citado também gira o tronco
    let yaw = 0, yawT = 0;
    if (speakerPos && !isSpeaker && root.current) {
      root.current.worldToLocal(st.look.set(speakerPos[0], 1.7, speakerPos[2]));
      yaw = THREE.MathUtils.clamp(Math.atan2(st.look.x, st.look.z), -1.1, 1.1);
      if (addressed) yawT = THREE.MathUtils.clamp(yaw, -0.3, 0.3);
    }

    const step = Math.min(dt, 0.1);
    for (const j of JOINTS) {
      const src = pose[j] ?? ZERO;
      const extra = j === 'cabeca' ? yaw - yawT : j === 'tronco' ? yawT : 0; // cabeça é filha do tronco
      st.tgt[0] = src[0]; st.tgt[1] = src[1] + extra; st.tgt[2] = src[2];
      dampE(st.base[j], st.tgt, 0.18, step);
    }

    // movimento sobre a pose base (sem passar pelo damp, para não amortecer as oscilações)
    const b = st.base;
    let ombroDx = 0, cotoveloDx = 0, cabecaX = 0, troncoX = 0.015 * Math.sin(t * 1.5);
    if (pose === POSES.bater_na_mesa) ombroDx = -0.45 * Math.max(0, Math.sin(t * 12));
    else if (pose === POSES.balancar_cabeca) cabecaX = 0.12 * Math.sin(t * 5);
    else if (pose === POSES.falando) { ombroDx = 0.15 * Math.sin(t * 3); cotoveloDx = 0.2 * Math.sin(t * 3 + 1); }
    if (view.status === 'sem_sinal') { cabecaX += 0.35; troncoX = 0.1; } // cabisbaixo
    if (tronco.current) {
      tronco.current.rotation.set(b.tronco.x + troncoX, b.tronco.y, b.tronco.z);
      tronco.current.scale.y = 1 + 0.01 * Math.sin(t * BREATH);
    }
    cabeca.current?.rotation.set(b.cabeca.x + cabecaX, b.cabeca.y, b.cabeca.z);
    ombroE.current?.rotation.copy(b.ombroE);
    cotoveloE.current?.rotation.copy(b.cotoveloE);
    ombroD.current?.rotation.set(b.ombroD.x + ombroDx, b.ombroD.y, b.ombroD.z);
    cotoveloD.current?.rotation.set(b.cotoveloD.x + cotoveloDx, b.cotoveloD.y, b.cotoveloD.z);

    // rosto
    if (now > st.nextBlink + BLINK_MS) st.nextBlink = now + 3000 + Math.random() * 3000;
    const blink = now >= st.nextBlink;
    const offline = view.status === 'sem_sinal';
    // boca segue o relógio de fala (uma abertura por palavra); `status` não entra: membros ficam 'pensando' até depois do turn_end
    const mouth = isSpeaker && !offline ? mouthOpen(id, now) : 0;
    const d = st.drawn;
    const changed = offline || d.emotion !== view.emotion || d.blink !== blink || d.mouth !== mouth || d.offline !== offline || d.skin !== look.skin;
    if (changed && now - st.lastDraw >= FACE_MS) {
      drawFace(st.ctx, view.emotion, { blink, mouthOpen: mouth, offline, skin: look.skin });
      st.tex.needsUpdate = true;
      st.lastDraw = now;
      d.emotion = view.emotion; d.blink = blink; d.mouth = mouth; d.offline = offline; d.skin = look.skin;
    }
  });

  const lapel = mat(shade(look.suit, 0.7));
  return (
    <group ref={root}>
      {/* pernas simples (o púlpito cobre) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.085, 0.475, 0]} geometry={G.leg} material={suit} />
      ))}

      <group ref={tronco} position={[0, HIP, 0]}>
        <mesh scale={[1, 1, 0.65]} geometry={G.torso} material={suit} />
        {/* camisa (V), lapelas e gravata */}
        <mesh position={[0, 0.4, 0.118]} rotation-z={-Math.PI / 2} scale={[1.8, 1, 1]} geometry={G.shirtV} material={WHITE} />
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.052, 0.36, 0.124]} rotation={[0, s * 0.35, -s * 0.32]} geometry={G.lapel} material={lapel} />
        ))}
        <mesh position={[0, 0.43, 0.126]} geometry={G.knot} material={mat(look.tie, 0.6)} />
        <mesh position={[0, 0.32, 0.124]} geometry={G.tie} material={mat(look.tie, 0.6)} />
        <mesh position={[0, 0.55, 0]} geometry={G.neck} material={skin} />
        {acessorio === 'estetoscopio' && <Stethoscope />}
        {acessorio === 'broche' && (
          <mesh position={[0.1, 0.37, 0.115]} rotation-x={Math.PI / 2} material={GOLD}>
            <cylinderGeometry args={[0.022, 0.022, 0.01, 16]} />
          </mesh>
        )}

        <group ref={cabeca} position={[0, NECK_Y, 0]}>
          <mesh position={[0, 0.2, 0]} geometry={G.head}>
            <meshStandardMaterial ref={faceMat} roughness={0.6} />
          </mesh>
          {/* nariz e orelhas */}
          <mesh position={[0, 0.18, 0.222]} scale={[0.026, 0.032, 0.024]} geometry={G.ball} material={skin} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.226, 0.19, 0]} scale={[0.022, 0.045, 0.035]} geometry={G.ball} material={skin} />
          ))}
          {acessorio !== 'capacete' && <HairStyle hair={look.hair} color={look.hairColor} />}
          {(look.glasses || acessorio === 'oculos') && <Glasses />}
          {acessorio === 'capacete' && <HardHat />}
        </group>

        <Arm side="E" shoulder={ombroE} elbow={cotoveloE} suit={suit} skin={skin}>
          {acessorio && HELD[acessorio]}
          {acessorio === 'relogio' && (
            <mesh position={[0, -0.18, 0]} material={GOLD}>
              <cylinderGeometry args={[0.052, 0.052, 0.025, 14]} />
            </mesh>
          )}
        </Arm>
        <Arm side="D" shoulder={ombroD} elbow={cotoveloD} suit={suit} skin={skin}>{moderator && <Gavel />}</Arm>
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
    drawn: { emotion: '' as Emotion | '', blink: false, mouth: -1, offline: false, skin: '' },
  };
}
type FrameState = ReturnType<typeof makeFrameState>;

/** Acessório da expertise; neutra/personalizada não tem acessório. */
function accessoryOf(e: Expertise): Expertise['acessorio'] | undefined {
  return e.id === 'neutra' ? undefined : e.acessorio;
}

/** Cabelo em coordenadas do grupo da cabeça (centro da cabeça em y=0.2). */
function HairStyle({ hair, color }: { hair: Hair; color: string }) {
  const m = mat(color, 0.7, THREE.DoubleSide);
  const cap = <mesh position={[0, 0.2, 0]} rotation-x={-0.45} geometry={G.hairCap} material={m} />;
  switch (hair) {
    case 'curto':
      return cap;
    case 'repartido':
      return (
        <>
          {cap}
          <mesh position={[-0.06, 0.4, 0.1]} rotation={[0.3, 0, 0.35]} scale={[0.13, 0.055, 0.11]} geometry={G.ball} material={m} />
        </>
      );
    case 'coque':
      return (
        <>
          {cap}
          <mesh position={[0, 0.4, -0.17]} scale={0.085} geometry={G.ball} material={m} />
        </>
      );
    case 'cacheado':
      return (
        <>
          {cap}
          {CURLS.map((p, i) => <mesh key={i} position={p} scale={0.07} geometry={G.ball} material={m} />)}
        </>
      );
    case 'careca_barba':
      return <mesh position={[0, 0.2, 0]} geometry={G.beard} material={m} />;
  }
}

type GroupRef = RefObject<THREE.Group | null>;

function Arm({ side, shoulder, elbow, suit, skin, children }: {
  side: 'E' | 'D'; shoulder: GroupRef; elbow: GroupRef; suit: THREE.Material; skin: THREE.Material; children?: ReactNode;
}) {
  const s = side === 'E' ? 1 : -1;
  return (
    <group ref={shoulder} position={[s * SHOULDER[0], SHOULDER[1], 0]}>
      <mesh scale={0.072} geometry={G.ball} material={suit} />
      <mesh position={[0, -UPPER / 2, 0]} geometry={G.upper} material={suit} />
      <group ref={elbow} position={[0, -UPPER, 0]}>
        <mesh position={[0, -0.09, 0]} geometry={G.fore} material={suit} />
        <mesh position={[0, -0.19, 0]} geometry={G.cuff} material={WHITE} />
        {/* mão (palma achatada + polegar para a frente) */}
        <mesh position={[0, -HAND, 0]} scale={[0.75, 1, 1]} geometry={G.palm} material={skin} />
        <mesh position={[-s * 0.012, -HAND + 0.012, 0.032]} rotation-x={-0.6} geometry={G.thumb} material={skin} />
        {children}
      </group>
    </group>
  );
}

/** Objetos segurados na mão esquerda (coordenadas do antebraço; mão em y=-HAND). */
const HELD: Partial<Record<Expertise['acessorio'], ReactNode>> = {
  prancheta: (
    <group position={[0, -0.27, 0.07]} rotation={[-0.3, 0, 0]}>
      <mesh material={WOOD}><boxGeometry args={[0.16, 0.22, 0.012]} /></mesh>
      <mesh position={[0, -0.01, 0.007]} material={WHITE}><boxGeometry args={[0.13, 0.17, 0.002]} /></mesh>
    </group>
  ),
  livro: (
    <mesh position={[0, -0.27, 0.06]} rotation={[-0.3, 0, 0]} material={mat('#8e2b2b', 0.7)}>
      <boxGeometry args={[0.14, 0.18, 0.04]} />
    </mesh>
  ),
  calculadora: (
    <mesh position={[0, -0.26, 0.055]} rotation={[-0.4, 0, 0]} material={GRAY}>
      <boxGeometry args={[0.08, 0.12, 0.02]} />
    </mesh>
  ),
  pasta: (
    <mesh position={[0, -0.38, 0]} material={WOOD}>
      <boxGeometry args={[0.07, 0.22, 0.3]} />
    </mesh>
  ),
  pincel: (
    <group position={[0, -0.26, 0.03]} rotation={[-1.2, 0, 0]}>
      <mesh material={WOOD}><cylinderGeometry args={[0.01, 0.012, 0.22, 8]} /></mesh>
      <mesh position={[0, 0.13, 0]} material={mat('#d81b60', 0.6)}><coneGeometry args={[0.018, 0.05, 8]} /></mesh>
    </group>
  ),
};

/** Armação na altura dos olhos (≈0.12 rad acima do equador da cabeça). */
function Glasses() {
  return (
    <group position={[0, 0.228, 0.236]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.072, 0, -0.012]} geometry={G.lens} material={BLACK} />
      ))}
      <mesh geometry={G.bridge} material={BLACK} />
    </group>
  );
}

function HardHat() {
  const yellow = mat('#fbc02d', 0.5, THREE.DoubleSide);
  return (
    <group position={[0, 0.25, 0]}>
      <mesh material={yellow}>
        <sphereGeometry args={[0.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.005, 0.02]} material={yellow}>
        <cylinderGeometry args={[0.285, 0.285, 0.015, 24]} />
      </mesh>
    </group>
  );
}

function Stethoscope() {
  return (
    <group>
      <mesh position={[0, 0.5, 0.025]} rotation-x={Math.PI / 2 - 0.3} material={GRAY}>
        <torusGeometry args={[0.085, 0.011, 6, 24]} />
      </mesh>
      <mesh position={[-0.07, 0.27, 0.125]} rotation-x={Math.PI / 2} material={GRAY}>
        <cylinderGeometry args={[0.028, 0.028, 0.015, 14]} />
      </mesh>
    </group>
  );
}

/** Martelo do moderador, na mão direita. */
function Gavel() {
  return (
    <group position={[0, -HAND, 0.04]} rotation-x={-Math.PI / 2}>
      <mesh position={[0, 0.08, 0]} material={WOOD}><cylinderGeometry args={[0.012, 0.012, 0.2, 8]} /></mesh>
      <mesh position={[0, 0.18, 0]} rotation-z={Math.PI / 2} material={WOOD}>
        <cylinderGeometry args={[0.035, 0.035, 0.11, 12]} />
      </mesh>
    </group>
  );
}
