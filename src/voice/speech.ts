import { speak, type VoiceProfile } from '@/voice/voice';

/** Palavras por segundo da fala simulada (sem voz), em velocidade 1×. */
export const WPS = 3;
/** Quanto tempo a boca fica aberta depois de cada palavra. */
export const PULSE_MS = 160;

/**
 * Relógio de fala: estado mutável único que o balão e a boca leem a cada frame (sem re-render do React).
 * `seq` é o seq do turn_end sendo falado; `shown` é quantos caracteres de `text` já foram ditos.
 */
export const speech = { id: 0, seq: -1, speaker: '', text: '', shown: 0, pulseAt: -Infinity, amp: 0 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Índice logo após o fim de cada palavra de `text`. */
export function wordEnds(text: string): number[] {
  return [...text.matchAll(/\S+/g)].map((m) => m.index + m[0].length);
}

function pulse(id: number, shown: number) {
  if (speech.id !== id) return;
  speech.shown = Math.max(speech.shown, shown);
  speech.pulseAt = performance.now();
  speech.amp = [1 / 3, 2 / 3, 1][(Math.random() * 3) | 0];
}

/** Interrompe a fala simulada em andamento e esquece a última (novo debate/replay reinicia os seq). A voz real é calada com speechSynthesis.cancel(). */
export function cancelSpeech() {
  Object.assign(speech, { id: speech.id + 1, seq: -1, speaker: '', text: '', shown: 0, pulseAt: -Infinity });
}

/** Texto do balão: a parte já dita da fala do turno atual, ou "…" enquanto o orador ainda pensa. */
export function bubbleText(speaker: string, turnSeq: number): string {
  const mine = speech.speaker === speaker && speech.seq > turnSeq;
  return (mine && speech.text.slice(0, speech.shown)) || '…';
}

/**
 * Fala `text` de `speaker`: com `profile`, pela voz do navegador (boca nas palavras via onboundary);
 * sem, simula a fala a WPS×speed palavras/s. Resolve quando termina; o texto inteiro fica visível no fim.
 */
export async function say(
  e: { seq: number; speaker: string; text: string },
  opts: { profile?: VoiceProfile; lang?: string; speed: () => number },
): Promise<void> {
  const id = ++speech.id;
  Object.assign(speech, { seq: e.seq, speaker: e.speaker, text: e.text, shown: 0, pulseAt: -Infinity });
  const ends = wordEnds(e.text);
  let boundaries = false;

  // ponytail: a simulação não respeita pausa no meio de uma fala; pausa só vale entre eventos
  const simulate = async () => {
    for (const end of ends) {
      if (speech.id !== id || boundaries) return;
      pulse(id, end);
      await sleep(1000 / (WPS * opts.speed()));
    }
  };

  if (opts.profile) {
    // algumas vozes (online do Google) não disparam onboundary: a simulação roda até a primeira palavra real chegar
    void simulate();
    await speak(e.text, { ...opts.profile, rate: opts.speed() }, opts.lang, (charIndex) => {
      boundaries = true;
      pulse(id, ends.find((x) => x > charIndex) ?? e.text.length);
    });
  } else {
    await simulate();
  }
  if (speech.id === id) speech.shown = e.text.length;
}

/** Abertura da boca (0..1) de `speaker` agora. */
export function mouthOpen(speaker: string, now: number): number {
  return speech.speaker === speaker && now - speech.pulseAt < PULSE_MS ? speech.amp : 0;
}
