'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { MODERATOR_ID, type Seat } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { seatPositions, studioSize } from '@/scene/layout';
import { memberName } from '@/scene/names';
import { telaoLines } from '@/scene/telao';
import { resolveTemperamento } from '@/presets/temperamentos';

const BG = '#0b1426';
const PANEL = '#111d33';
const ACCENT = '#ffb23e';
const LED = '#3aa0ff';
const FALLBACK = "'Arial Narrow', Arial, sans-serif";

/** Família do next/font (--font-display: o canvas não lê var(), e o nome real é gerado). */
function displayFont() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  return v ? `${v}, ${FALLBACK}` : FALLBACK;
}

/** Fonte do canvas + contador que muda quando as fontes carregam (para repintar). */
function useDisplayFont() {
  const [state, setState] = useState({ font: FALLBACK, tick: 0 });
  useEffect(() => {
    let alive = true;
    const font = displayFont();
    Promise.all([document.fonts.load(`600 20px ${font}`), document.fonts.load(`700 20px ${font}`)])
      .catch(() => {})
      .then(() => alive && setState((s) => ({ font, tick: s.tick + 1 })));
    return () => { alive = false; };
  }, []);
  return state;
}

/* Materiais e geometrias compartilhados (cache de módulo, como no avatar). */
const LEDS = new Map<string, THREE.MeshStandardMaterial>();
function led(color: string, intensity = 2.2, side: THREE.Side = THREE.FrontSide) {
  const key = `${color}|${intensity}|${side}`;
  let m = LEDS.get(key);
  if (!m) LEDS.set(key, (m = new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, toneMapped: false, side })));
  return m;
}
const FLOOR = new THREE.MeshStandardMaterial({ color: BG, roughness: 0.35, metalness: 0.2 });
const WALL = new THREE.MeshStandardMaterial({ color: PANEL, roughness: 0.6, side: THREE.DoubleSide });
const BODY = new THREE.MeshStandardMaterial({ color: '#1a2a47', roughness: 0.45, metalness: 0.3 });
const TOP = new THREE.MeshStandardMaterial({ color: '#0e1830', roughness: 0.3, metalness: 0.5 });
const DESK = new THREE.MeshStandardMaterial({ color: '#3a2a12', roughness: 0.4, metalness: 0.4 });
const FRAME = new THREE.MeshStandardMaterial({ color: '#05080f', roughness: 0.5 });

/* Púlpito (membro) e bancada (moderador): à frente do avatar (+Z local), topo ~0.98. */
const P = { w: 0.75, h: 0.95, d: 0.4, z: 0.45 };
const D = { w: 1.7, h: 0.95, d: 0.5, z: 0.5 };
const G = {
  podium: new THREE.BoxGeometry(P.w, P.h, P.d),
  podiumTop: new THREE.BoxGeometry(P.w + 0.06, 0.04, P.d + 0.06),
  desk: new THREE.BoxGeometry(D.w, D.h, D.d),
  deskTop: new THREE.BoxGeometry(D.w + 0.08, 0.04, D.d + 0.08),
  strip: new THREE.PlaneGeometry(1, 0.045),
  plate: new THREE.PlaneGeometry(0.62, 0.155),
  vStrip: new THREE.BoxGeometry(0.04, 3.6, 0.04),
};

/** Desenha no canvas do emissiveMap do material (criado no 1º uso, fora do render). */
function paint(m: THREE.MeshStandardMaterial, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void) {
  let tex = m.emissiveMap as THREE.CanvasTexture | null;
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    m.emissiveMap = tex;
    m.emissive.set('#ffffff');
    m.needsUpdate = true;
  }
  const c = tex.image as HTMLCanvasElement;
  draw(c.getContext('2d')!, c.width, c.height);
  tex.needsUpdate = true;
}

/** Material com textura de canvas; a textura é descartada no unmount. */
function useCanvasMat() {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    const m = mat.current;
    return () => m?.emissiveMap?.dispose();
  }, []);
  return mat;
}

/** Fonte no maior tamanho ≤ px em que todas as linhas cabem em max (nunca espremer via maxWidth). */
function fitFont(ctx: CanvasRenderingContext2D, font: string, lines: string[], weight: number, px: number, max: number) {
  for (; px > 12; px -= 2) {
    ctx.font = `${weight} ${px}px ${font}`;
    if (lines.every((l) => ctx.measureText(l).width <= max)) break;
  }
  return px;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Plaquinha com o nome: desenhada uma vez por nome/cor. */
function Nameplate({ nome, cor, y, z }: { nome: string; cor: string; y: number; z: number }) {
  const mat = useCanvasMat();
  const { font, tick } = useDisplayFont();
  useEffect(() => {
    paint(mat.current!, 512, 128, (ctx, W, H) => {
      ctx.fillStyle = '#0a1222';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 10, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 76px ${font}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(ellipsize(ctx, nome.toUpperCase(), W - 60), W / 2 + 5, H / 2 + 4);
    });
  }, [mat, nome, cor, font, tick]);
  return (
    <mesh geometry={G.plate} position={[0, y, z]}>
      <meshStandardMaterial ref={mat} color="#000000" emissiveIntensity={0.9} roughness={0.4} />
    </mesh>
  );
}

function Podium({ nome, cor }: { nome: string; cor: string }) {
  const front = P.z + P.d / 2 + 0.002;
  return (
    <group>
      <mesh geometry={G.podium} material={BODY} position={[0, P.h / 2, P.z]} />
      <mesh geometry={G.podiumTop} material={TOP} position={[0, P.h + 0.02, P.z]} />
      <mesh geometry={G.strip} material={led(cor)} position={[0, P.h - 0.07, front]} scale-x={P.w} />
      <mesh geometry={G.strip} material={led(cor, 1.4)} position={[0, 0.05, front]} scale-x={P.w} />
      <Nameplate nome={nome} cor={cor} y={0.62} z={front + 0.001} />
    </group>
  );
}

function Desk() {
  const front = D.z + D.d / 2 + 0.002;
  return (
    <group>
      <mesh geometry={G.desk} material={DESK} position={[0, D.h / 2, D.z]} />
      <mesh geometry={G.deskTop} material={TOP} position={[0, D.h + 0.02, D.z]} />
      <mesh geometry={G.strip} material={led(ACCENT)} position={[0, D.h - 0.07, front]} scale-x={D.w} />
      <mesh geometry={G.strip} material={led(ACCENT, 1.4)} position={[0, 0.05, front]} scale-x={D.w} />
      <Nameplate nome="Moderador" cor={ACCENT} y={0.62} z={front + 0.001} />
    </group>
  );
}

/** Telão: redesenha só quando o texto (tema/turno/orador/relógio) muda — relógio ≤ 1×/s. */
function Telao({ scene, speakerId, position }: { scene: SceneState; speakerId?: string; position: [number, number, number] }) {
  const mat = useCanvasMat();
  const c = scene.config;
  // relógio do programa: mora aqui para o tique de 1 s não re-renderizar o palco; zera a cada novo config.
  // ponytail: não pausa junto com o debate/replay (o estado de pausa é local do Hud); subir o estado se for preciso.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!c) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsedMs(performance.now() - t0), 1000);
    return () => {
      clearInterval(id);
      setElapsedMs(0);
    };
  }, [c]);
  const lines = telaoLines({
    tema: c?.tema ?? 'Mesa de IAs',
    turno: scene.memberTurns,
    maxTurns: c?.maxTurns ?? 0, // sem config: status vazio
    orador: speakerId ? memberName(c, speakerId) : undefined,
    elapsedMs,
  });
  const key = JSON.stringify(lines);
  const { font, tick } = useDisplayFont();
  useEffect(() => {
    const { tema, status, relogio } = JSON.parse(key) as typeof lines;
    paint(mat.current!, 1280, 720, (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#16284a');
      g.addColorStop(1, BG);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // faixa superior
      ctx.fillStyle = ACCENT;
      ctx.fillRect(0, 0, W, 10);
      ctx.textBaseline = 'middle';
      ctx.font = `700 54px ${font}`;
      ctx.fillStyle = ACCENT;
      ctx.textAlign = 'left';
      ctx.fillText('MESA DE IAs', 60, 80);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(relogio, W - 60, 80);
      ctx.fillStyle = '#ff3b47';
      ctx.beginPath();
      ctx.arc(W - 60 - ctx.measureText(relogio).width - 30, 80, 12, 0, Math.PI * 2);
      ctx.fill();
      // tema
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      const px = fitFont(ctx, font, tema, 700, 92, W - 120);
      const lh = px * 1.18;
      const y0 = (H - 150 + 130) / 2 - ((tema.length - 1) * lh) / 2; // centrado entre o cabeçalho e o rodapé
      tema.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
      // rodapé
      ctx.fillStyle = 'rgba(58,160,255,0.18)';
      ctx.fillRect(0, H - 150, W, 150);
      ctx.fillStyle = LED;
      ctx.fillRect(0, H - 150, W, 6);
      ctx.fillStyle = '#e6eefc';
      fitFont(ctx, font, [status], 600, 58, W - 120);
      ctx.fillText(status, W / 2, H - 72);
    });
  }, [mat, key, font, tick]);
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.06]} material={FRAME}>
        <boxGeometry args={[4.4, 2.56, 0.1]} />
      </mesh>
      <mesh>
        <planeGeometry args={[4.2, 2.36]} />
        <meshStandardMaterial ref={mat} color="#000000" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.31, 0]} material={led(LED)}>
        <boxGeometry args={[4.4, 0.04, 0.04]} />
      </mesh>
    </group>
  );
}

const THETA = [0.42 * Math.PI, 1.16 * Math.PI] as const; // fundo curvo: ~210° centrado em −Z
const SPOT_K = 7.5; // ~95% da transição em 0.4 s
const KEY = 1.6;

/** Luzes do estúdio + spot que segue o orador. */
function Lights({ target }: { target?: { pos: THREE.Vector3; front: THREE.Vector3 } }) {
  const spot = useRef<THREE.SpotLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalAim = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const s = spot.current;
    if (!s) return;
    const a = 1 - Math.exp(-SPOT_K * Math.min(dt, 0.1));
    if (target) {
      goalAim.set(target.pos.x, 1.6, target.pos.z);
      goalPos.copy(target.pos).addScaledVector(target.front, 1.8).setY(4.6);
      if (s.intensity < 0.5) { // ligando do zero: aparece já no orador, sem varrer o palco
        s.position.copy(goalPos);
        s.target.position.copy(goalAim);
      }
      s.position.lerp(goalPos, a);
      s.target.position.lerp(goalAim, a);
    }
    s.intensity += ((target ? 60 : 0) - s.intensity) * a;
    s.target.updateMatrixWorld();
    if (key.current) key.current.intensity += ((target ? KEY * 0.75 : KEY) - key.current.intensity) * a;
  });
  return (
    <>
      <hemisphereLight args={['#2a4a85', '#04060c', 1.1]} />
      <directionalLight ref={key} position={[3, 6, 6]} color="#ffd8a8" intensity={KEY} />
      <directionalLight position={[-6, 3, 4]} color="#a8ccff" intensity={0.55} />
      <directionalLight position={[0, 4, -9]} color={LED} intensity={1.4} />
      <spotLight ref={spot} color="#fff3e0" intensity={0} angle={0.32} penumbra={0.6} decay={2} distance={0} />
    </>
  );
}

export function Studio({ radius, seats, speakerId, scene }: {
  radius: number; seats: Seat[]; speakerId?: string; scene: SceneState;
}) {
  const n = seats.length + 1;
  const poses = useMemo(() => seatPositions(n, radius), [n, radius]);
  const size = studioSize(radius);
  const wallR = size / 2;

  const idx = speakerId === MODERATOR_ID ? 0 : seats.findIndex((s) => s.id === speakerId) + 1;
  const sp = speakerId && idx >= 0 ? poses[idx] : undefined;
  const target = useMemo(() => {
    if (!sp) return undefined;
    const pos = new THREE.Vector3(...sp.position);
    return { pos, front: new THREE.Vector3(Math.sin(sp.rotationY), 0, Math.cos(sp.rotationY)) };
  }, [sp]);

  const vStrips = useMemo(
    () => Array.from({ length: 9 }, (_, i) => THETA[0] + ((i + 0.5) * THETA[1]) / 9).map((a) => [Math.sin(a) * (wallR - 0.05), 2.3, Math.cos(a) * (wallR - 0.05)] as [number, number, number]),
    [wallR],
  );

  return (
    <group>
      <Lights target={target} />
      {/* piso + anel de LED */}
      <mesh material={FLOOR} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <mesh material={led(LED, 1.8)} rotation-x={-Math.PI / 2} position={[0, 0.004, 0]}>
        <ringGeometry args={[radius + 0.85, radius + 0.93, 96]} />
      </mesh>
      <mesh material={led(ACCENT, 1.2)} rotation-x={-Math.PI / 2} position={[0, 0.004, 0]}>
        <ringGeometry args={[0.9, 0.95, 64]} />
      </mesh>
      {/* fundo curvo com faixas azul e âmbar */}
      <mesh material={WALL} position={[0, 2.5, 0]}>
        <cylinderGeometry args={[wallR, wallR, 5, 64, 1, true, THETA[0], THETA[1]]} />
      </mesh>
      {/* cilindro aberto: normais para fora, vemos o lado de dentro → BackSide */}
      <mesh material={led(LED, 2.2, THREE.BackSide)} position={[0, 0.35, 0]}>
        <cylinderGeometry args={[wallR - 0.06, wallR - 0.06, 0.06, 64, 1, true, THETA[0], THETA[1]]} />
      </mesh>
      <mesh material={led(ACCENT, 2.2, THREE.BackSide)} position={[0, 4.85, 0]}>
        <cylinderGeometry args={[wallR - 0.06, wallR - 0.06, 0.06, 64, 1, true, THETA[0], THETA[1]]} />
      </mesh>
      {vStrips.map((p, i) => <mesh key={i} geometry={G.vStrip} material={led(i % 2 ? ACCENT : LED, 1.6)} position={p} />)}
      <Telao scene={scene} speakerId={speakerId} position={[0, 3.5, -radius - 1.9]} />
      {/* púlpitos e bancada, posicionados como o avatar do assento */}
      {poses.map((p, i) => (
        <group key={i} position={p.position} rotation-y={p.rotationY}>
          {i === 0 ? <Desk /> : <Podium nome={seats[i - 1].nome} cor={resolveTemperamento(seats[i - 1].temperamento).corGravata} />}
        </group>
      ))}
      {/* ponytail: sombra de contato renderizada 1× por disposição (key=n); avatares que se mexem não atualizam a sombra. Trocar por frames={Infinity} se fizer falta. */}
      <ContactShadows key={n} frames={1} position={[0, 0.006, 0]} scale={size} far={1.2} blur={2.2} opacity={0.7} resolution={512} color="#000000" />
    </group>
  );
}
