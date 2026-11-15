'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { bubbleText } from '@/voice/speech';

/** Dentro do Canvas: projeta `position` para a tela e move o balão (DOM fora do Canvas, sem drei Html, que quebra ao desmontar). */
export function BubbleAnchor({ position, target }: { position: [number, number, number]; target: RefObject<HTMLDivElement | null> }) {
  const v = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const el = target.current;
    if (!el) return;
    v.current.set(...position).project(camera);
    const hidden = v.current.z > 1;
    el.style.visibility = hidden ? 'hidden' : 'visible';
    el.style.transform = `translate(${((v.current.x + 1) / 2) * size.width}px, ${((1 - v.current.y) / 2) * size.height}px) translate(-50%, -100%)`;
  });
  return null;
}

/** Balão acima da cabeça do orador; ~4 linhas visíveis, com rolagem. Revela o texto no ritmo do relógio de fala. Posicionado por BubbleAnchor. */
export function SpeechBubble({ speaker, turnSeq, anchorRef, override }: { speaker?: string; turnSeq: number; override?: string; anchorRef: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!speaker) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      const text = override ?? bubbleText(speaker, turnSeq);
      if (el && el.textContent !== text) {
        el.textContent = text;
        el.scrollTo({ top: el.scrollHeight });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [speaker, turnSeq, override]);
  return (
    <div ref={anchorRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 5, display: speaker ? 'block' : 'none' }}>
      <div
        ref={ref}
        aria-live="polite"
        style={{
          width: 280, maxHeight: '5.4em', overflowY: 'auto', lineHeight: 1.35, fontSize: 14,
          padding: '8px 12px', borderRadius: 12, background: '#fffdf5', color: '#111',
          border: '2px solid #000', boxShadow: '0 2px 0 #000', pointerEvents: 'auto',
        }}
      />
    </div>
  );
}
