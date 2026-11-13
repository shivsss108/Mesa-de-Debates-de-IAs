'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MODERATOR_ID, type DebateConfig, type DebateEvent } from '@/types';
import { assignVoices, speak, voicesAvailable } from '@/voice/voice';

/** Voz opcional: `waitFor` fala o turn_end quando ligada; `config` é preenchido pela página a partir da cena. */
export function useVoice() {
  const [on, setOn] = useState(false);
  const [available, setAvailable] = useState(false);
  const onRef = useRef(false);
  const config = useRef<DebateConfig | undefined>(undefined);

  useEffect(() => {
    const ss = globalThis.speechSynthesis;
    if (!ss) return;
    const refresh = () => setAvailable(voicesAvailable());
    refresh();
    ss.addEventListener('voiceschanged', refresh); // vozes carregam de forma assíncrona
    return () => {
      ss.removeEventListener('voiceschanged', refresh);
      ss.cancel(); // sair da página cala a fala
    };
  }, []);

  const toggle = useCallback(() => {
    onRef.current = !onRef.current;
    setOn(onRef.current);
    if (!onRef.current) globalThis.speechSynthesis?.cancel(); // resolve a promessa pendente via onend/onerror
  }, []);

  const waitFor = useCallback(async (e: DebateEvent) => {
    const c = config.current;
    if (!onRef.current || !c || e.type !== 'turn_end') return;
    const ids = [...c.seats.map((s) => s.id), MODERATOR_ID];
    const profile = assignVoices(ids, globalThis.speechSynthesis.getVoices(), c.idioma || 'pt-BR')[e.speaker];
    if (profile) await speak(e.fullText, profile, c.idioma || 'pt-BR');
  }, []);

  return { on, available, toggle, waitFor, config };
}
