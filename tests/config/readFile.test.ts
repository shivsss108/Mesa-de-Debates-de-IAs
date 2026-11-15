import { describe, it, expect } from 'vitest';
import { readFileText } from '@/app/config/readFile';

describe('readFileText', () => {
  it('.txt de 7000 chars é cortado em 6000', async () => {
    const r = await readFileText(new File(['a'.repeat(7000)], 'x.txt'));
    expect(r.nome).toBe('x.txt');
    expect(r.conteudo).toHaveLength(6000);
  });
  it('.md devolve o conteúdo', async () => {
    expect((await readFileText(new File(['# oi'], 'n.md'))).conteudo).toBe('# oi');
  });
  it('.docx lança Formato não suportado', async () => {
    await expect(readFileText(new File(['x'], 'a.docx'))).rejects.toThrow('Formato não suportado: docx');
  });
});
