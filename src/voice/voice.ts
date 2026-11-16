export interface VoiceProfile { voice?: SpeechSynthesisVoice; pitch: number; rate: number }

export const voicesAvailable = (): boolean =>
  typeof globalThis.speechSynthesis !== 'undefined' && globalThis.speechSynthesis.getVoices().length > 0;

export type Genero = 'f' | 'm';

// ponytail: a Web Speech API não informa o gênero da voz e o assento não tem campo de gênero; adivinha-se pelo nome.
// Teto: nomes fora das listas (voz) ou ambíguos (membro). Upgrade: campo `genero` no Seat + tabela de vozes por plataforma.
const FEM = new Set(
  ('female feminina feminino mulher woman francisca maria thalita brenda elza giovanna leila leticia manuela yara luciana joana catarina fernanda raquel ines heloisa ' +
    'zira aria jenny hazel susan samantha victoria karen moira tessa helena laura sabina paulina monica elvira dalia ' +
    'gabi alice beatriz bia ingrid isabel carmen ester ruth miriam liz mel isis iris thais tais lais').split(' '),
);
const MASC = new Set(
  ('male masculino homem man antonio daniel donato fabio humberto julio nicolau valerio macerio duarte cristiano felipe david mark guy davis george alex fred tom jorge diego pablo alvaro ' +
    'rafa luca joshua moderador').split(' '),
);

/** Gênero pelo nome (de voz ou de pessoa); `undefined` quando nenhuma palavra é conhecida. */
export function generoDoNome(nome: string): Genero | undefined {
  const words = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of words) {
    if (FEM.has(w)) return 'f';
    if (MASC.has(w)) return 'm';
  }
  return undefined;
}

/** Gênero do debatedor: nome conhecido, senão a regra do português (1º nome terminado em "a" = feminino). */
export const generoDoMembro = (nome: string): Genero => generoDoNome(nome) ?? (/a$/i.test(nome.trim().split(/\s+/)[0] ?? '') ? 'f' : 'm');

/**
 * Voz do mesmo gênero do membro (pelo nome); sem voz desse gênero, as de gênero desconhecido; sem essas, qualquer uma.
 * Prefere vozes do idioma e, dentro do gênero, só as neurais ("Natural" no Edge) quando existem.
 * Quando faltam vozes, repete: a 1ª rodada fala no pitch natural (1), as seguintes em 0.9, 1.1, 0.8, 1.2…
 */
export function assignVoices(members: { id: string; nome: string }[], voices: SpeechSynthesisVoice[], lang: string): Record<string, VoiceProfile> {
  const l = lang.toLowerCase();
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === l);
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2)));
  const inLang = exact.length ? exact : sameLang.length ? sameLang : voices;
  const neural = (vs: SpeechSynthesisVoice[]) => {
    const nat = vs.filter((v) => /natural|neural/i.test(v.name));
    return nat.length ? nat : vs;
  };
  const byG = (g?: Genero) => inLang.filter((v) => generoDoNome(v.name) === g);
  const used: Record<string, number> = {}; // quantos membros já usaram cada pool
  const out: Record<string, VoiceProfile> = {};
  for (const { id, nome } of members) {
    const g = generoDoMembro(nome);
    const [key, base] = byG(g).length ? [g, byG(g)] : byG().length ? ['?', byG()] : ['*', inLang];
    const pool = neural(base);
    const n = Math.max(pool.length, 1);
    const i = used[key] ?? 0;
    used[key] = i + 1;
    const r = Math.floor(i / n);
    const pitch = 1 + (r % 2 ? -1 : 1) * 0.1 * Math.ceil(r / 2);
    out[id] = { voice: pool[i % n], pitch: Math.round(pitch * 100) / 100, rate: 1 };
  }
  return out;
}

/** Fala o texto; resolve em onend/onerror ou após max(4s, palavras*600ms) (alguns navegadores perdem onend). `onWord` recebe o charIndex de cada palavra. */
export function speak(text: string, profile: VoiceProfile, lang = 'pt-BR', onWord?: (charIndex: number) => void): Promise<void> {
  if (typeof globalThis.speechSynthesis === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = profile.voice?.lang ?? lang;
    if (profile.voice) u.voice = profile.voice;
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    const words = text.trim().split(/\s+/).length;
    const timer = setTimeout(done, Math.max(4000, (words * 600) / profile.rate));
    function done() {
      clearTimeout(timer);
      resolve();
    }
    if (onWord) u.onboundary = (ev) => { if (ev.name === 'word') onWord(ev.charIndex); };
    u.onend = done;
    u.onerror = done;
    globalThis.speechSynthesis.speak(u);
  });
}
