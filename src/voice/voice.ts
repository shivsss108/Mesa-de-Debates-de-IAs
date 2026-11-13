export interface VoiceProfile { voice?: SpeechSynthesisVoice; pitch: number; rate: number }

export const voicesAvailable = (): boolean =>
  typeof globalThis.speechSynthesis !== 'undefined' && globalThis.speechSynthesis.getVoices().length > 0;

/** Prefere vozes do idioma; quando faltam, repete as vozes com pitch distinto (0.8–1.3). */
export function assignVoices(memberIds: string[], voices: SpeechSynthesisVoice[], lang: string): Record<string, VoiceProfile> {
  const l = lang.toLowerCase();
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === l);
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2)));
  const pool = exact.length ? exact : sameLang.length ? sameLang : voices;
  const n = Math.max(pool.length, 1);
  const rounds = Math.ceil(memberIds.length / n);
  const out: Record<string, VoiceProfile> = {};
  memberIds.forEach((id, i) => {
    const r = Math.floor(i / n);
    const pitch = rounds <= 1 ? 1 : 0.8 + (0.5 * r) / (rounds - 1);
    out[id] = { voice: pool[i % n], pitch: Math.round(pitch * 100) / 100, rate: 1 };
  });
  return out;
}

/** Fala o texto; resolve em onend/onerror ou após max(4s, palavras*600ms) (alguns navegadores perdem onend). */
export function speak(text: string, profile: VoiceProfile, lang = 'pt-BR'): Promise<void> {
  if (typeof globalThis.speechSynthesis === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = profile.voice?.lang ?? lang;
    if (profile.voice) u.voice = profile.voice;
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    const words = text.trim().split(/\s+/).length;
    const timer = setTimeout(done, Math.max(4000, words * 600));
    function done() {
      clearTimeout(timer);
      resolve();
    }
    u.onend = done;
    u.onerror = done;
    globalThis.speechSynthesis.speak(u);
  });
}
