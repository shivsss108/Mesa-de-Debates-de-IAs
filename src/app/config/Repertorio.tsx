'use client';
import { useState } from 'react';
import type { ResearchInput } from '@/research/pipeline';
import { readFileText } from './readFile';
import s from './config.module.css';

export type Repertorio = Omit<ResearchInput, 'tema' | 'idioma' | 'moderador'> & { membrosPesquisam: boolean };

export const REPERTORIO_VAZIO: Repertorio = { busca: true, links: [], textos: [], modo: 'todos', membrosPesquisam: false };
export const COLADO = 'Texto colado';

const MODOS: { v: Repertorio['modo']; l: string }[] = [
  { v: 'todos', l: 'Todos veem tudo' },
  { v: 'dividido', l: 'Cada um recebe uma parte' },
  { v: 'recorte', l: 'Todos + recorte por expertise' },
];

export function Repertorio({ value, onChange }: { value: Repertorio; onChange: (v: Repertorio) => void }) {
  const [linksText, setLinksText] = useState(value.links.join('\n'));
  const [fileErr, setFileErr] = useState<string>();
  const colado = value.textos.find((t) => t.nome === COLADO)?.conteudo ?? '';
  const arquivos = value.textos.filter((t) => t.nome !== COLADO);
  const set = (p: Partial<Repertorio>) => onChange({ ...value, ...p });
  const setColado = (conteudo: string) => set({ textos: [...(conteudo ? [{ nome: COLADO, conteudo }] : []), ...arquivos] });

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setFileErr(undefined);
    const novos: Repertorio['textos'] = [];
    for (const f of Array.from(files)) {
      try {
        novos.push(await readFileText(f));
      } catch (e) {
        setFileErr(`${f.name}: ${e instanceof Error ? e.message : 'não foi possível ler o arquivo.'}`);
      }
    }
    if (novos.length) onChange({ ...value, textos: [...value.textos, ...novos].slice(0, 10) });
  };

  return (
    <section className={s.block} aria-labelledby="h-rep">
      <h2 id="h-rep">Repertório</h2>
      <div className={s.grid}>
        <label className={`${s.check} ${s.wide}`}>
          <input type="checkbox" checked={value.busca} onChange={(e) => set({ busca: e.target.checked })} />
          Busca web automática
        </label>
        <label className={`${s.field} ${s.wide}`}>
          Links (um por linha, até 5)
          <textarea className={s.textarea} value={linksText} placeholder="https://…"
            onChange={(e) => {
              setLinksText(e.target.value);
              set({ links: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) });
            }} />
        </label>
        <label className={`${s.field} ${s.wide}`}>
          Texto
          <textarea className={s.textarea} value={colado} maxLength={6000} placeholder="Cole aqui um texto de apoio"
            onChange={(e) => setColado(e.target.value)} />
        </label>
        <label className={`${s.field} ${s.wide}`}>
          Arquivos (.txt, .md, .pdf)
          <input className={s.input} type="file" multiple accept=".txt,.md,.pdf"
            onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {fileErr && <p role="alert" className={`${s.err} ${s.wide}`}>{fileErr}</p>}
        {arquivos.map((a) => (
          <div key={a.nome} className={s.toolbar} style={{ margin: 0 }}>
            <span className={s.note}>{a.nome} ({a.conteudo.length} caracteres)</span>
            <button type="button" className={s.btn} onClick={() => set({ textos: value.textos.filter((t) => t !== a) })}>Remover {a.nome}</button>
          </div>
        ))}
        <label className={s.field}>
          Modo de uso
          <select className={s.select} value={value.modo} onChange={(e) => set({ modo: e.target.value as Repertorio['modo'] })}>
            {MODOS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </label>
        <label className={s.check}>
          <input type="checkbox" checked={value.membrosPesquisam} onChange={(e) => set({ membrosPesquisam: e.target.checked })} />
          Membros podem pesquisar durante o debate
        </label>
      </div>
    </section>
  );
}
