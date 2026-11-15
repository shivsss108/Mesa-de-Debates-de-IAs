const MAX = 6000;

/** .txt/.md via File.text(); .pdf via pdfjs-dist (import dinâmico, só no navegador). Corta em 6 000 caracteres. */
export async function readFileText(file: File): Promise<{ nome: string; conteudo: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let conteudo: string;
  if (ext === 'txt' || ext === 'md') conteudo = await file.text();
  else if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const partes: string[] = [];
    for (let i = 1; i <= pdf.numPages && partes.join(' ').length < MAX; i++) {
      const { items } = await (await pdf.getPage(i)).getTextContent();
      partes.push(items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    conteudo = partes.join('\n');
  } else throw new Error(`Formato não suportado: ${ext}`);
  return { nome: file.name, conteudo: conteudo.slice(0, MAX) };
}
