'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readSSE } from '@/client/sse';
import { validateDossie } from '@/engine/validate';
import type { Progress, ResearchInput } from '@/research/pipeline';
import { safeHref } from '@/scene/Sources';
import type { DebateConfig, Dossie, ProviderId } from '@/types';
import { Logo } from '../Logo';
import type { Repertorio } from '../config/Repertorio';
import c from '../config/config.module.css';
import s from './preparo.module.css';

type Keys = Partial<Record<ProviderId, string>>;
type Fato = Dossie['fatos'][number];

function readSession<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    // modo privado/cota cheia: só não sobrevive à navegação
  }
}

const STATUS = { confirmada: 'Premissa confirmada', nao_encontrada: 'Premissa não encontrada', contradita: 'Premissa contradita' };

function etapaTexto(p: Progress) {
  if (p.etapa === 'buscando') return 'Buscando notícias…';
  if (p.etapa === 'lendo') return p.detalhe ? `Lendo ${p.detalhe}…` : 'Lendo fontes…';
  return 'Montando o dossiê…';
}

/** remover fonte tira o id dos fatos e descarta fatos não manuais que ficam sem fonte (mesma regra de fit() no pipeline) */
function semFonte(d: Dossie, id: string): Dossie {
  return {
    ...d,
    fontes: d.fontes.filter((f) => f.id !== id),
    fatos: d.fatos.map((f) => ({ ...f, fontes: f.fontes.filter((x) => x !== id) })).filter((f) => f.manual || f.fontes.length),
  };
}

/** o que muda o resultado da pesquisa: se mudou, o dossiê guardado não vale */
const assinatura = (cfg: DebateConfig, r: Repertorio) =>
  JSON.stringify([cfg.tema, cfg.idioma, cfg.moderador.provider, cfg.moderador.model, r.busca, r.links, r.textos, r.modo]);

export default function PreparoPage() {
  const router = useRouter();
  const [config, setConfig] = useState<DebateConfig>();
  const [rep, setRep] = useState<Repertorio>();
  const [keys, setKeys] = useState<Keys>({});
  const [dossie, setDossie] = useState<Dossie>();
  const [progress, setProgress] = useState<Progress>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [novoFato, setNovoFato] = useState('');
  const abort = useRef<AbortController>(undefined);

  const research = useCallback(async (cfg: DebateConfig, r: Repertorio, k: Keys) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setError(undefined);
    setDossie(undefined);
    setProgress(undefined);
    try {
      const input: ResearchInput & { keys: Keys } = {
        tema: cfg.tema, idioma: cfg.idioma, moderador: { provider: cfg.moderador.provider, model: cfg.moderador.model },
        busca: r.busca, links: r.links, textos: r.textos, modo: r.modo, keys: k,
      };
      const res = await fetch('/api/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'Falha ao pesquisar.');
      }
      for await (const e of readSSE(res.body)) {
        const data = JSON.parse(e.data) as Progress | Dossie | { type: 'error'; message: string };
        if ('type' in data && data.type === 'error') throw new Error(data.message);
        if (e.event === 'progress') setProgress(data as Progress);
        else if (e.event === 'dossie') {
          setDossie(data as Dossie);
          return;
        }
      }
      throw new Error('A pesquisa terminou sem resultado.');
    } catch (x) {
      if (ctl.signal.aborted) return;
      setError(x instanceof Error ? x.message : 'Falha ao pesquisar.');
    } finally {
      if (abort.current === ctl) setRunning(false);
    }
  }, []);

  useEffect(() => {
    const cfg = readSession<DebateConfig>('mesa:config');
    const r = readSession<Repertorio>('mesa:repertorio');
    if (!cfg?.seats?.length || !r) return router.replace('/config');
    const k = readSession<Keys>('mesa:keys') ?? {};
    // sessionStorage só existe no cliente: inicializa aqui (mesmo padrão de /config)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(cfg);
    setRep(r);
    setKeys(k);
    const salvo = readSession<{ tema: string; sig?: string; dossie: Dossie }>('mesa:dossie');
    if (salvo?.tema === cfg.tema && salvo.sig === assinatura(cfg, r) && salvo.dossie) setDossie(salvo.dossie);
    else void research(cfg, r, k);
    return () => abort.current?.abort();
  }, [router, research]);

  // guarda as edições: recarregar não pesquisa de novo
  useEffect(() => {
    if (config && rep && dossie) writeSession('mesa:dossie', { tema: config.tema, sig: assinatura(config, rep), dossie });
  }, [config, rep, dossie]);

  if (!config || !rep) return null;

  const edit = (fn: (d: Dossie) => Dossie) => {
    setError(undefined);
    setDossie((d) => d && fn(d));
  };
  const setFato = (i: number, p: Partial<Fato>) => edit((d) => ({ ...d, fatos: d.fatos.map((f, j) => (j === i ? { ...f, ...p } : f)) }));
  const addFato = () => {
    const texto = novoFato.trim();
    if (!texto) return;
    edit((d) => {
      let n = 1;
      while (d.fatos.some((f) => f.id === `M${n}`)) n++;
      return { ...d, fatos: [...d.fatos, { id: `M${n}`, texto, fontes: [], manual: true }] };
    });
    setNovoFato('');
  };

  const goMesa = (cfg: DebateConfig) => {
    writeSession('mesa:config', cfg);
    router.push('/mesa');
  };

  const comecar = async () => {
    if (!dossie) return;
    const base: Dossie = { ...dossie, fatos: dossie.fatos.filter((f) => f.texto.trim()), modo: rep.modo };
    delete base.recortes;
    const v = validateDossie(base);
    if (v) return setError(v);
    setStarting(true);
    setError(undefined);
    try {
      let final = base;
      if (rep.modo === 'recorte') {
        const res = await fetch('/api/research/recortes', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dossie: base, seats: config.seats, moderador: config.moderador, keys }),
        });
        const j = (await res.json()) as { recortes?: Record<string, string>; error?: string };
        if (!res.ok || !j.recortes) throw new Error(j.error ?? 'Falha ao gerar recortes.');
        final = { ...base, recortes: j.recortes };
        const v2 = validateDossie(final);
        if (v2) throw new Error(v2);
      }
      goMesa({ ...config, dossie: final, membrosPesquisam: rep.membrosPesquisam });
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Falha ao gerar recortes.');
      setStarting(false);
    }
  };

  const semRepertorio = () => {
    goMesa({ ...config, dossie: undefined, membrosPesquisam: rep.membrosPesquisam });
  };

  const denovo = () => {
    try {
      sessionStorage.removeItem('mesa:dossie');
    } catch {
      // sem storage: nada a limpar
    }
    void research(config, rep, keys);
  };

  return (
    <main className={c.page}>
      <div className={c.wrap}>
        <header className={c.head}>
          <Logo size="sm" />
          <div>
            <h1>Preparar o repertório</h1>
            <p>{config.tema}</p>
          </div>
          <Link href="/config" className={c.back}>← Configuração</Link>
        </header>

        <div aria-live="polite">
          {running && (
            <section className={c.block}>
              <h2>Pesquisando</h2>
              <p>{progress ? etapaTexto(progress) : 'Começando…'}</p>
              {progress?.total ? <p className={c.note}>{progress.lidas ?? 0} de {progress.total} fontes lidas</p> : null}
            </section>
          )}
          {error && <p role="alert" className={c.err}>{error}</p>}
        </div>

        {dossie && !running && (
          <>
            <section className={c.block} aria-labelledby="h-prem">
              <h2 id="h-prem">Premissa</h2>
              <label className={c.field}>
                {STATUS[dossie.premissa.status]} — nota
                <textarea className={c.textarea} value={dossie.premissa.nota}
                  onChange={(e) => edit((d) => ({ ...d, premissa: { ...d.premissa, nota: e.target.value } }))} />
              </label>
            </section>

            <section className={c.block} aria-labelledby="h-fatos">
              <h2 id="h-fatos">Fatos ({dossie.fatos.length}/12)</h2>
              <ul className={s.list}>
                {dossie.fatos.map((f, i) => (
                  <li key={f.id} className={s.row}>
                    <label className={c.field}>
                      <span>Fato {f.id}{f.fontes.length ? ` (fontes: ${f.fontes.join(', ')})` : ''} {f.manual && <span className={s.tag}>seu</span>}</span>
                      <textarea className={c.textarea} maxLength={300} value={f.texto} onChange={(e) => setFato(i, { texto: e.target.value })} />
                    </label>
                    <button type="button" className={c.btn} onClick={() => edit((d) => ({ ...d, fatos: d.fatos.filter((_, j) => j !== i) }))}>Apagar fato {f.id}</button>
                  </li>
                ))}
              </ul>
              <div className={s.row} style={{ marginTop: 12 }}>
                <label className={c.field}>
                  Adicionar fato seu
                  <input className={c.input} maxLength={300} value={novoFato} onChange={(e) => setNovoFato(e.target.value)} />
                </label>
                <button type="button" className={c.btn} style={{ alignSelf: 'flex-end' }} disabled={!novoFato.trim() || dossie.fatos.length >= 12} onClick={addFato}>Adicionar</button>
              </div>
            </section>

            {dossie.disputas.length > 0 && (
              <section className={c.block} aria-labelledby="h-disp">
                <h2 id="h-disp">Disputas</h2>
                <ul className={s.list}>
                  {dossie.disputas.map((x, i) => (
                    <li key={i} className={s.row}>
                      <label className={c.field}>
                        Disputa {i + 1}
                        <input className={c.input} maxLength={200} value={x}
                          onChange={(e) => edit((d) => ({ ...d, disputas: d.disputas.map((y, j) => (j === i ? e.target.value : y)) }))} />
                      </label>
                      <button type="button" className={c.btn} style={{ alignSelf: 'flex-end' }}
                        onClick={() => edit((d) => ({ ...d, disputas: d.disputas.filter((_, j) => j !== i) }))}>Apagar disputa {i + 1}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={c.block} aria-labelledby="h-fontes">
              <h2 id="h-fontes">Fontes</h2>
              {dossie.fontes.length === 0 && <p className={c.note}>Nenhuma fonte.</p>}
              <ul className={s.list}>
                {dossie.fontes.map((f) => {
                  const href = safeHref(f.url);
                  return (
                    <li key={f.id} className={s.row}>
                      <span className={s.src}>
                        {f.id} · {f.veiculo && <>{f.veiculo} · </>}
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{f.titulo}</a> : f.titulo}
                        {f.data && <> ({f.data})</>}
                      </span>
                      <button type="button" className={c.btn} onClick={() => edit((d) => semFonte(d, f.id))}>Remover fonte {f.id}</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <div className={`${c.start} ${s.actions}`}>
          <button type="button" className={c.go} disabled={!dossie || running || starting} onClick={() => void comecar()}>
            {starting ? 'Preparando…' : 'Começar debate'}
          </button>
          {error && !dossie && <button type="button" className={c.btn} disabled={running} onClick={denovo}>Tentar de novo</button>}
          <button type="button" className={c.btn} disabled={running || starting} onClick={denovo}>Pesquisar de novo</button>
          <button type="button" className={c.btn} disabled={starting} onClick={semRepertorio}>Começar sem repertório</button>
        </div>
      </div>
    </main>
  );
}
