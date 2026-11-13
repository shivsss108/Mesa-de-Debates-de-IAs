'use client';
import { useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';

/** Balão acima da cabeça do orador; ~4 linhas visíveis, com rolagem. */
export function SpeechBubble({ position, text }: { position: [number, number, number]; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [text]);
  if (!text) return null;
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <div
        ref={ref}
        style={{
          width: 280, maxHeight: '5.4em', overflowY: 'auto', lineHeight: 1.35, fontSize: 14,
          padding: '8px 12px', borderRadius: 12, background: '#fffdf5', color: '#111',
          border: '2px solid #000', boxShadow: '0 2px 0 #000',
        }}
      >
        {text}
      </div>
    </Html>
  );
}
