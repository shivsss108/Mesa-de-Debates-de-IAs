'use client';
import { useEffect, useState, type RefObject } from 'react';

/** Ocioso quando passou `ms` desde a última atividade, exceto com o foco dentro do elemento. */
export function idleAfter(lastActivity: number, now: number, focusedInside: boolean, ms = 3000): boolean {
  return !focusedInside && now - lastActivity >= ms;
}

const ACTIVITY = ['mousemove', 'pointerdown', 'touchstart', 'keydown'] as const;

/** true depois de `ms` sem mouse/toque/tecla; nunca enquanto o foco estiver dentro de `ref`. */
export function useIdle(ref: RefObject<HTMLElement | null>, ms = 3000): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let last = performance.now();
    const check = () => setIdle(idleAfter(last, performance.now(), !!ref.current?.contains(document.activeElement), ms));
    const wake = () => {
      last = performance.now();
      setIdle(false);
    };
    ACTIVITY.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    window.addEventListener('focusin', check);
    const id = setInterval(check, 250);
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, wake));
      window.removeEventListener('focusin', check);
      clearInterval(id);
    };
  }, [ref, ms]);
  return idle;
}
