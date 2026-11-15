import { afterEach, describe, expect, it, vi } from 'vitest';
import { bubbleText, cancelSpeech, mouthOpen, PULSE_MS, say, speech, speechProgress, wordEnds, WPS } from '@/voice/speech';

afterEach(() => {
  cancelSpeech();
  vi.useRealTimers();
});

describe('wordEnds', () => {
  it('fim de cada palavra, ignorando espaços extras', () => {
    expect(wordEnds('Oi  tudo bem?')).toEqual([2, 8, 13]);
    expect(wordEnds('   ')).toEqual([]);
  });
});

describe('say (simulada)', () => {
  it('revela palavra por palavra, mexe a boca só do orador e termina com o texto inteiro', async () => {
    vi.useFakeTimers();
    const done = say({ seq: 10, speaker: 'm1', text: 'um dois tres' }, { speed: () => 1 });
    const step = 1000 / WPS;

    // turno começou no seq 5: a fala (turn_end seq 10) é deste turno
    expect(bubbleText('m1', 5)).toBe('um');
    expect(mouthOpen('m1', performance.now())).toBeGreaterThan(0);
    expect(mouthOpen('m2', performance.now())).toBe(0); // bug antigo: só um orador mexe a boca, e é o certo

    await vi.advanceTimersByTimeAsync(step);
    expect(bubbleText('m1', 5)).toBe('um dois');
    // entre palavras a boca fecha
    expect(mouthOpen('m1', performance.now() + PULSE_MS)).toBe(0);

    await vi.advanceTimersByTimeAsync(step * 2);
    await done;
    expect(bubbleText('m1', 5)).toBe('um dois tres');
  });

  it('velocidade 2× fala na metade do tempo', async () => {
    vi.useFakeTimers();
    const done = say({ seq: 1, speaker: 'm1', text: 'a b c d' }, { speed: () => 2 });
    await vi.advanceTimersByTimeAsync((4 * 1000) / (WPS * 2));
    await done;
    expect(speech.shown).toBe(7);
  });
});

describe('bubbleText', () => {
  it('"…" enquanto o orador pensa: fala anterior não vaza para o turno novo', () => {
    Object.assign(speech, { seq: 10, speaker: 'm1', text: 'velho', shown: 5 });
    expect(bubbleText('m1', 12)).toBe('…'); // mesmo orador, turno novo (turn_start seq 12)
    expect(bubbleText('m2', 5)).toBe('…');
  });

  it('cancelSpeech esquece a fala (replay reiniciado volta a seq baixos)', () => {
    Object.assign(speech, { seq: 300, speaker: 'm1', text: 'velho', shown: 5 });
    cancelSpeech();
    expect(bubbleText('m1', 3)).toBe('…');
  });
});

describe('speechProgress', () => {
  it('não começou → speaking false; durante → progresso; outro orador/turno → false', async () => {
    vi.useFakeTimers();
    expect(speechProgress('m1', 5)).toEqual({ speaking: false, progress: 0 });
    const done = say({ seq: 10, speaker: 'm1', text: 'um dois tres' }, { speed: () => 1 });
    const p = speechProgress('m1', 5);
    expect(p.speaking).toBe(true);
    expect(p.progress).toBeGreaterThan(0);
    expect(p.progress).toBeLessThan(1);
    expect(speechProgress('m2', 5)).toEqual({ speaking: false, progress: 0 });
    expect(speechProgress('m1', 12)).toEqual({ speaking: false, progress: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(speechProgress('m1', 5)).toEqual({ speaking: true, progress: 1 });
  });
});
