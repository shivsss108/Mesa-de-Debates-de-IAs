import type { DebateConfig, Dossie, Fonte } from '@/types';
import { memberName } from '@/scene/names';

/** só http(s): url vem da web/usuário e poderia ser javascript: */
export function safeHref(url?: string): string | undefined {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function Item({ f, config }: { f: Fonte; config?: DebateConfig }) {
  const href = safeHref(f.url);
  return (
    <li>
      {f.veiculo && <>{f.veiculo} · </>}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{f.titulo}</a> : f.titulo}
      {f.data && <> ({f.data})</>}
      {f.porMembro && <> — por {memberName(config, f.porMembro)}</>}
    </li>
  );
}

export function Sources({ dossie, extra, config }: { dossie?: Dossie; extra: Fonte[]; config?: DebateConfig }) {
  const base = dossie?.fontes ?? [];
  if (!base.length && !extra.length) return null;
  return (
    <>
      {base.length > 0 && <ul>{base.map((f) => <Item key={f.id} f={f} config={config} />)}</ul>}
      {extra.length > 0 && (
        <>
          <h4>Pesquisadas durante o debate (não revisadas)</h4>
          <ul>{extra.map((f) => <Item key={f.id} f={f} config={config} />)}</ul>
        </>
      )}
    </>
  );
}
