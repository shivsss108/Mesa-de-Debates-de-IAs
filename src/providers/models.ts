// ponytail: tudo aqui é heurística pelo nome do modelo — os endpoints /models não dizem se o modelo conversa
// nem quão bom ele é. Atualizar as listas quando surgirem famílias novas; upgrade seria um ranking externo.

/** Áudio, voz, visão, código, embeddings, classificadores, recompensa e agentes: não servem para debater. */
const NON_DEBATE =
  /whisper|tts|orpheus|playai|speech|audio|asr|parakeet|guard|safety|reward|embed|rerank|retriev|bge|clip|compound|vision|-vl\b|-vl-|vila|neva|kosmos|deplot|paligemma|fuyu|ocr|parse|translat|cosmos|coder|codestral|devstral|starcoder|codegemma|code-?llama|usdcode|math|image|flux|stable-diffusion|sdxl/i;

/** Maior contagem de parâmetros citada no id, em bilhões ("8x7b" → 56, "235b-a22b" → 235). */
export function modelParams(id: string): number | undefined {
  let best: number | undefined;
  for (const m of id.toLowerCase().matchAll(/(?:(\d+)x)?(\d+(?:\.\d+)?)b(?![a-z0-9])/g)) {
    const n = Number(m[2]) * (m[1] ? Number(m[1]) : 1);
    if (best === undefined || n > best) best = n;
  }
  return best;
}

/** Serve para debater: conversa e não é minúsculo (≤ 4B parâmetros responde mal ao formato). */
export function isDebateModel(id: string): boolean {
  if (NON_DEBATE.test(id) || /nano|tiny/i.test(id)) return false;
  const p = modelParams(id);
  return p === undefined || p > 4;
}

const STRONG = /deepseek-(v3|r1|chat)|kimi-k2|qwen3|qwen-?3|llama-4|llama-3\.[13]-(70|405)|gpt-oss-120|nemotron.*(ultra|super)|mistral-large|gemini-2\.5|gemini-3|glm-4\.[5-9]/i;

/** Nota para ordenar "melhores": família forte + tamanho + palavras como large/small. Sem unidade. */
export function modelScore(id: string): number {
  const size = Math.min(modelParams(id) ?? 70, 400); // sem tamanho no nome costuma ser modelo grande de API
  let score = size / 8 + (STRONG.test(id) ? 60 : 0);
  if (/large|ultra|super|pro\b|-pro-|max/i.test(id)) score += 15;
  if (/small|mini|lite|instant|8b-/i.test(id)) score -= 15;
  return score;
}
