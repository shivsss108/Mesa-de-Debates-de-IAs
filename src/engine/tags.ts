import { EMOTIONS, GESTURES, type Emotion, type Gesture } from '@/types';

export interface ParsedTag {
  emotion?: Emotion;
  gesture?: Gesture;
  target?: string;
  stance?: number;
  text: string;
}

const TAG_RE = /^\s*(\[[^\]]{0,200}\])\s*/;
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function parseTag(raw: string, memberIds: string[]): ParsedTag {
  const m = TAG_RE.exec(raw);
  if (!m) return { text: raw.trim() };
  const out: ParsedTag = { text: raw.slice(m[0].length).trim() };
  for (const field of m[1].slice(1, -1).split('|')) {
    const i = field.indexOf(':');
    if (i < 0) {
      const v = norm(field);
      if ((EMOTIONS as readonly string[]).includes(v)) out.emotion = v as Emotion;
      else if ((GESTURES as readonly string[]).includes(v)) out.gesture = v as Gesture;
      continue;
    }
    const key = norm(field.slice(0, i));
    const val = field.slice(i + 1).trim();
    if (key === 'alvo') {
      const id = memberIds.find((m) => m.toLowerCase() === val.toLowerCase());
      if (id) out.target = id;
    } else if (key === 'posicao') {
      const n = Number(val.replace(',', '.')); // pt-BR: "-0,7"
      if (val !== '' && Number.isFinite(n)) out.stance = Math.max(-1, Math.min(1, n));
    }
  }
  return out;
}

const SEARCH_RE = /^\s*\[busca:([^\]]{0,200})\]/i;

/** Consulta de um `[busca: …]` no início da resposta (aparada, ≤ 120 chars), senão `null`. */
export function parseSearchTag(raw: string): string | null {
  return SEARCH_RE.exec(raw)?.[1].trim().slice(0, 120) || null;
}

/** Holds the stream start until the tag closes with `]` (or 200 chars without it). */
export class TagStreamSplitter {
  private buf = '';
  private mode: 'hold' | 'afterTag' | 'pass' = 'hold';
  private tag: string | null = null;

  push(chunk: string): string {
    if (this.mode === 'pass') return chunk;
    if (this.mode === 'afterTag') {
      const t = chunk.trimStart();
      if (t) this.mode = 'pass';
      return t;
    }
    this.buf += chunk;
    const head = this.buf.trimStart();
    if (!head) return '';
    if (!head.startsWith('[')) return this.release();
    const m = TAG_RE.exec(this.buf);
    if (m) {
      this.tag = m[1];
      const rest = this.buf.slice(m[0].length);
      this.buf = '';
      this.mode = rest ? 'pass' : 'afterTag';
      return rest;
    }
    return head.length > 201 ? this.release() : '';
  }

  private release(): string {
    const out = this.buf;
    this.buf = '';
    this.mode = 'pass';
    return out;
  }

  tagRaw(): string | null {
    return this.tag;
  }
}
