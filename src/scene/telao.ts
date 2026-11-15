export interface TelaoInput {
  tema: string;
  turno: number;
  maxTurns: number;
  orador?: string;
  elapsedMs: number;
}

/** Texto do telão: tema em ≤ 2 linhas (a 2ª com "…" se truncar), status do turno e relógio mm:ss. */
export function telaoLines(input: TelaoInput, maxChars = 38): { tema: string[]; status: string; relogio: string } {
  const lines: string[] = [];
  let cur = '';
  for (let w of input.tema.trim().split(/\s+/).filter(Boolean)) {
    while (w.length > maxChars) { // palavra maior que a linha: corta no meio
      if (cur) lines.push(cur);
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
      cur = '';
    }
    if (cur && cur.length + 1 + w.length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const tema = lines.slice(0, 2);
  if (lines.length > 2) tema[1] = `${tema[1].slice(0, maxChars - 1).trimEnd()}…`;

  const s = Math.max(0, Math.floor(input.elapsedMs / 1000));
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    tema,
    status: input.maxTurns <= 0 ? '' : `Turno ${input.turno}/${input.maxTurns}${input.orador ? ` · fala: ${input.orador}` : ''}`,
    relogio: `${pad(Math.floor(s / 60))}:${pad(s % 60)}`,
  };
}
