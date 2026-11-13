'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

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

/** Balão acima da cabeça do orador; ~4 linhas visíveis, com rolagem. Posicionado por BubbleAnchor. */
export function SpeechBubble({ text, anchorRef }: { text: string; anchorRef: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [text]);
  return (
    <div ref={anchorRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 5, display: text ? 'block' : 'none' }}>
      <div
        ref={ref}
        style={{
          width: 280, maxHeight: '5.4em', overflowY: 'auto', lineHeight: 1.35, fontSize: 14,
          padding: '8px 12px', borderRadius: 12, background: '#fffdf5', color: '#111',
          border: '2px solid #000', boxShadow: '0 2px 0 #000', pointerEvents: 'auto',
        }}
      >
        {text}
      </div>
    </div>
  );
}
