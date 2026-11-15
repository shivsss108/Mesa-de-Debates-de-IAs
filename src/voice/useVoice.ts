'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MODERATOR_ID, type DebateConfig, type DebateEvent } from '@/types';
import { assignVoices, voicesAvailable } from '@/voice/voice';
import { cancelSpeech, say } from '@/voice/speech';

/** `waitFor` fala cada turn_end (voz do navegador se ligada, senão fala simulada); `config` e `speed` são preenchidos pela página. */
export function useVoice() {
  const [on, setOn] = useState(false);
  const [available, setAvailable] = useState(false);
  const onRef = useRef(false);
  const config = useRef<DebateConfig | undefined>(undefined);
  const speed = useRef(1);

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
  useEffect(() => cancelSpeech, []); // sair da página também para a fala simulada

  const toggle = useCallback(() => {
    onRef.current = !onRef.current;
    setOn(onRef.current);
    if (!onRef.current) globalThis.speechSynthesis?.cancel(); // resolve a promessa pendente via onend/onerror
  }, []);

  const waitFor = useCallback(async (e: DebateEvent) => {
    if (e.type !== 'turn_end') return;
    const c = config.current;
    const lang = c?.idioma || 'pt-BR';
    const ids = c ? [...c.seats.map((s) => s.id), MODERATOR_ID] : [];
    const profile = onRef.current && c ? assignVoices(ids, globalThis.speechSynthesis.getVoices(), lang)[e.speaker] : undefined;
    await say({ seq: e.seq, speaker: e.speaker, text: e.fullText }, { profile, lang, speed: () => speed.current });
  }, []);

  return { on, available, toggle, waitFor, config, speed };
}
