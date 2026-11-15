import { describe, it, expect } from 'vitest';
import { parseSearchTag, parseTag, TagStreamSplitter } from '@/engine/tags';

const ids = ['m1', 'm2'];

describe('parseTag', () => {
  it('parses a full tag', () => {
    expect(parseTag('[raiva|bater_na_mesa|alvo:m2|posição:-0.7] Absurdo!', ids)).toEqual({
      emotion: 'raiva', gesture: 'bater_na_mesa', target: 'm2', stance: -0.7, text: 'Absurdo!',
    });
  });
  it('ignores unknown gesture', () => {
    const r = parseTag('[raiva|bate_na_mesa] x', ids);
    expect(r.gesture).toBeUndefined();
    expect(r.emotion).toBe('raiva');
  });
  it('accepts no accent, spaces, uppercase', () => {
    const r = parseTag('  [ RAIVA | Apontar | ALVO : m1 | posicao : 0.5 ]  oi', ids);
    expect(r).toEqual({ emotion: 'raiva', gesture: 'apontar', target: 'm1', stance: 0.5, text: 'oi' });
  });
  it('drops ninguem and unknown targets', () => {
    expect(parseTag('[feliz|alvo:ninguem] x', ids).target).toBeUndefined();
    expect(parseTag('[feliz|alvo:m99] x', ids).target).toBeUndefined();
  });
  it('clamps and rejects stance', () => {
    expect(parseTag('[feliz|posição:3] x', ids).stance).toBe(1);
    expect(parseTag('[feliz|posição:abc] x', ids).stance).toBeUndefined();
  });
  it('accepts decimal comma in posição', () => {
    expect(parseTag('[feliz|posição:-0,7] x', ids).stance).toBe(-0.7);
  });
  it('matches alvo case-insensitively, returning the canonical id', () => {
    expect(parseTag('[feliz|alvo:M2] x', ['m1', 'm2']).target).toBe('m2');
    expect(parseTag('[feliz|alvo:ana] x', ['Ana']).target).toBe('Ana');
  });
  it('no tag returns trimmed text', () => {
    expect(parseTag('  olá mundo \n', ids)).toEqual({ text: 'olá mundo' });
  });
  it('tag in the middle is not a tag', () => {
    const raw = 'olá [raiva] mundo';
    expect(parseTag(raw, ids)).toEqual({ text: raw });
  });
});

describe('TagStreamSplitter', () => {
  it('holds until ] then releases text', () => {
    const s = new TagStreamSplitter();
    expect(['[fel', 'iz] Ol', 'á'].map((c) => s.push(c))).toEqual(['', 'Ol', 'á']);
    expect(s.tagRaw()).toBe('[feliz]');
  });
  it('releases immediately without leading [', () => {
    const s = new TagStreamSplitter();
    expect(s.push('  Olá')).toBe('  Olá');
    expect(s.tagRaw()).toBeNull();
    expect(s.push(' [x]')).toBe(' [x]');
  });
  it('gives up after 200 chars without ]', () => {
    const s = new TagStreamSplitter();
    const big = '[' + 'a'.repeat(250);
    expect(s.push(big)).toBe(big);
    expect(s.tagRaw()).toBeNull();
  });
});

describe('parseSearchTag', () => {
  it('lê a consulta de [busca: …] no início', () => {
    expect(parseSearchTag('[busca: Nvidia CEO] x')).toBe('Nvidia CEO');
    expect(parseSearchTag('  [Busca:   juros hoje  ]')).toBe('juros hoje');
    expect(parseSearchTag('[busca: ' + 'a'.repeat(150) + ']')).toBe('a'.repeat(120));
  });
  it('null quando não é busca', () => {
    expect(parseSearchTag('[duvida|apontar] texto')).toBeNull();
    expect(parseSearchTag('texto [busca: x]')).toBeNull();
    expect(parseSearchTag('[busca:   ]')).toBeNull();
    expect(parseSearchTag('[busca: sem fechar')).toBeNull();
  });
});
