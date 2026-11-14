# Pesquisa pré-debate (repertório) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar um dossiê com fontes (busca web + material do usuário) antes do debate, deixá-lo editável e injetá-lo nos prompts; opcionalmente, membros pesquisam durante o debate.

**Architecture:** Pipeline puro em `src/research/` (busca RSS → leitura segura → síntese por LLM), exposto por `POST /api/research` (SSE) e `POST /api/research/recortes`. O dossiê viaja dentro de `DebateConfig`; `prompts.ts` só o renderiza. A busca de membros é um desvio dentro do turno em `step.ts`, disparado pela tag `[busca: …]`.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Vitest, SDK `openai` via `ChatFn` existente, `pdfjs-dist` (única dependência nova, só no cliente).

**Spec:** `docs/superpowers/specs/2026-11-14-pesquisa-pre-debate-design.md`

## Global Constraints

- Next.js desta versão tem breaking changes: antes de criar rota ou página, ler o guia relevante em `node_modules/next/dist/docs/` (AGENTS.md do projeto).
- Nenhuma dependência nova além de `pdfjs-dist` (importada dinamicamente, só no cliente, só quando há PDF).
- Sem rede nos testes: `fetch`, DNS e `chat` sempre injetados.
- Limites (spec §3/§7.3): fatos ≤ 12 (texto ≤ 300), disputas ≤ 5 (≤ 200), fontes ≤ 12, recorte ≤ 400, dossiê serializado ≤ 8 KB, bloco no prompt ≤ ~4 000 chars, links ≤ 5, texto do usuário ≤ 6 000 por item e ≤ 20 000 no total, tema ≤ 300.
- Rede (spec §4/§7.1): timeout 8 s por fetch, corpo ≤ 1,5 MB, ≤ 3 redirecionamentos, `content-type` `text/html`/`text/plain`; ≤ 6 resultados de busca; leitura < 500 chars → Jina Reader; corte do pipeline em 50 s; rotas com `maxDuration = 60`.
- Busca de membros: 1 por turno, 6 por debate (`MAX_BUSCAS = 6`), `quickSearch` ≤ 4 resultados.
- Chaves nunca em log nem em mensagem de erro; 401/403 → `Chave inválida para <Provedor>.`
- Textos de UI e prompts em português, como no resto do projeto.
- O working tree tem mudanças não commitadas de outra frente (boca/voz): **commitar sempre com caminhos explícitos**, nunca `git add -A`/`.`.
- Comandos: `npx vitest run <arquivo>`, `npx tsc --noEmit`.

## Review Focus

1. **Tema sem nenhuma notícia** (assunto obscuro ou inventado): pipeline devolve dossiê com 0 fontes web e premissa `nao_encontrada`, sem lançar — teste em Task 6.
2. **429 do Groq gratuito na síntese**: tratar como falha de síntese (retry → fallback), nunca derrubar a rota — teste em Task 5.
3. **Usuário apaga todos os fatos na revisão**: dossiê com `fatos: []` passa na validação e gera bloco de prompt válido — testes em Tasks 1 e 7.
4. **Página com paywall/JS** (HTML sem `<p>` útil, Jina também falha): fonte fica com o resumo do RSS — teste em Task 4.
5. **Membro manda `[busca: …]` de novo na resposta pós-busca**: tratar como texto normal sem nova busca (sem loop) — teste em Task 8.

---

### Task 1: Tipos, estado e validação do dossiê

**Files:**
- Modify: `src/types.ts`, `src/engine/initialState.ts`, `src/engine/validate.ts`
- Test: `tests/engine/validate.test.ts` (criar se não existir; senão acrescentar)

**Interfaces:**
- Produces (em `src/types.ts`): `Fonte`, `Dossie` exatamente como spec §3; `DebateConfig.dossie?: Dossie`, `DebateConfig.membrosPesquisam?: boolean`; `DebateState.repertorioExtra: { fontes: Fonte[] }`, `DebateState.buscasFeitas: number`; novo membro da união `DebateEvent`: `{ type: 'research'; member: string; query: string; fontes?: Fonte[] }` (emitido sem `fontes` ao começar a busca e de novo com `fontes` ao terminar); `export const MAX_BUSCAS = 6`.
- Produces (em `src/engine/validate.ts`): `validateDossie(d: unknown): string | null` (mensagem de erro ou `null`), usado por `validateStepBody` e pelas rotas de pesquisa.

- [ ] **Step 1: Testes que falham**
  - `validateStepBody` aceita config sem `dossie` (regressão) e com dossiê válido de 2 fatos/2 fontes.
  - aceita dossiê com `fatos: []`, `disputas: []`, `fontes: []` (Review Focus 3).
  - rejeita: 13 fatos; fato com texto de 301 chars; `modo: 'x'`; `premissa.status` inválido; dossiê serializado > 8 192 bytes; `membrosPesquisam: 'sim'`.
  - `createInitialState` devolve `repertorioExtra: { fontes: [] }` e `buscasFeitas: 0`.
- [ ] **Step 2:** `npx vitest run tests/engine/validate.test.ts` → FAIL.
- [ ] **Step 3:** Implementar tipos, campos iniciais e `validateDossie`; `validateStepBody` chama `validateDossie` quando `config.dossie !== undefined` e checa `membrosPesquisam` boolean opcional. Ajustar `sceneReducer` só o necessário para o `switch` continuar exaustivo (`case 'research': return s;` — Task 9 completa).
- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(research): tipos do dossiê e validação` (arquivos acima).

### Task 2: `safeFetch` com guarda de SSRF

**Files:**
- Create: `src/research/safeFetch.ts`
- Test: `tests/research/safeFetch.test.ts`

**Interfaces:**
- Produces: `isPrivateIp(ip: string): boolean`; `safeFetch(url: string, deps?: { fetch?: typeof fetch; lookup?: (host: string) => Promise<string[]>; signal?: AbortSignal }): Promise<{ url: string; contentType: string; body: string }>` — lança `Error` com mensagem curta em qualquer recusa. Default de `lookup`: `dns.promises.lookup(host, { all: true })` → endereços.

- [ ] **Step 1: Testes que falham**
  - `isPrivateIp`: `true` para `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.0.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `::1`, `fc00::1`, `fe80::1`, `::ffff:127.0.0.1`; `false` para `8.8.8.8`, `172.32.0.1`, `2606:4700::1111`.
  - `safeFetch('ftp://x')` rejeita; `http://localhost/` rejeita (lookup → `127.0.0.1`); host público com `content-type: image/png` rejeita.
  - redirecionamento 302 de host público para `http://10.0.0.1/` rejeita; 4 redirecionamentos seguidos rejeita.
  - corpo maior que 1,5 MB rejeita (fetch falso com stream grande); HTML pequeno de host público devolve `{ body, contentType }`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar com `redirect: 'manual'`, revalidando protocolo + DNS a cada salto; `AbortSignal.any([deps.signal, AbortSignal.timeout(8000)])`; leitura do corpo em stream contando bytes.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(research): safeFetch com guarda de SSRF`.

### Task 3: Extração de texto e busca RSS

**Files:**
- Create: `src/research/extract.ts`, `src/research/search.ts`, `tests/research/fixtures/bing.xml`, `tests/research/fixtures/google.xml`, `tests/research/fixtures/article.html`
- Test: `tests/research/extract.test.ts`, `tests/research/search.test.ts`

**Interfaces:**
- Produces: `extractText(html: string, max = 3000): string`.
- Produces: `interface NewsItem { titulo: string; resumo: string; veiculo?: string; url?: string; data?: string }`; `parseBingRss(xml: string): NewsItem[]`; `parseGoogleRss(xml: string): NewsItem[]`; `searchNews(query: string, idioma: string, deps?: { fetch?: typeof fetch; signal?: AbortSignal }): Promise<NewsItem[]>`.
- URLs: Bing `https://www.bing.com/news/search?q=<q>&format=rss&mkt=<mkt>`; Google `https://news.google.com/rss/search?q=<q>&hl=<hl>&gl=<gl>&ceid=<gl>:<lang>`. Mapa de idioma: `pt-BR` → mkt `pt-BR`, hl `pt-BR`, gl `BR`, ceid `BR:pt-419`; `en*` → `en-US`/`US`/`US:en`; `es*` → `es-ES`/`ES`/`ES:es`; outro → `en-US`.

- [ ] **Step 1: Fixtures** — salvar um RSS real reduzido do Bing (2 itens, um com `&amp;` e entidades `&#233;`) e do Google (2 itens), e um HTML de matéria com `<nav>`, `<script>`, `<article>` com 3 `<p>`.
- [ ] **Step 2: Testes que falham**
  - `extractText(article.html)` contém o texto dos 3 parágrafos, não contém texto do `<nav>` nem do `<script>`; HTML sem `<article>` usa todos os `<p>`; resultado cortado em `max`; entidades decodificadas (`&amp;` → `&`, `&#233;` → `é`).
  - `parseBingRss` devolve a URL real decodificada do parâmetro `url=` do link `apiclick.aspx` (ex.: `https://olhardigital.com.br/...`), título com acentos, `resumo` da `<description>`.
  - `parseGoogleRss` devolve título/veículo (`<source>`) e `url` indefinida.
  - `searchNews` com fetch falso: Bing ok → itens do Bing; Bing lança → itens do Google; dedup por URL.
- [ ] **Step 3:** rodar → FAIL.
- [ ] **Step 4:** Implementar com regex/`DOMParser`-free (servidor); sem dependência.
- [ ] **Step 5:** rodar → PASS. Commit `feat(research): extração de texto e busca RSS`.

### Task 4: Leitura de fontes e busca rápida

**Files:**
- Create: `src/research/read.ts`, `src/research/quickSearch.ts`
- Test: `tests/research/read.test.ts`

**Interfaces:**
- Consumes: `safeFetch` (Task 2), `extractText`, `searchNews` (Task 3).
- Produces: `readSource(url: string, deps?: { safeFetch?: typeof safeFetch; fetch?: typeof fetch; signal?: AbortSignal }): Promise<string | undefined>` — Jina via `fetch('https://r.jina.ai/' + url)` com timeout 8 s.
- Produces: `quickSearch(query: string, idioma: string, deps?): Promise<NewsItem[]>` — `searchNews` cortado em 4.

- [ ] **Step 1: Testes que falham**
  - HTML com ≥ 500 chars úteis → texto extraído, Jina não chamado.
  - HTML com < 500 chars → chama Jina e devolve o texto dele (cortado em 3 000).
  - `safeFetch` lança e Jina lança → `undefined` (Review Focus 4).
  - `quickSearch` devolve no máximo 4 itens.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(research): leitura de fontes e busca rápida`.

### Task 5: Chamadas de LLM da pesquisa (consultas, síntese, recortes)

**Files:**
- Create: `src/research/llm.ts`, `src/research/queries.ts`, `src/research/synthesize.ts`, `src/research/recortes.ts`
- Test: `tests/research/synthesize.test.ts`, `tests/research/queries.test.ts`

**Interfaces:**
- Consumes: `ChatFn`, `ChatMessage`, `ProviderError` (`src/providers/client.ts`); `afterThink` (`src/engine/step.ts`); `Dossie`, `Fonte`, `Seat` (Task 1).
- Produces: `type LlmTarget = { chat: ChatFn; provider: ProviderId; model: string; apiKey: string; signal?: AbortSignal }`; `ask(t: LlmTarget, messages: ChatMessage[], maxTokens = 1500): Promise<string>` (concatena o stream, aplica `afterThink`; 401/403 relançados como `Error('Chave inválida para <Provedor>.')`).
- Produces: `buildQueries(tema: string, idioma: string, t: LlmTarget): Promise<string[]>` — 2 consultas (idioma + inglês); qualquer falha → `[tema]`.
- Produces: `type FonteLida = Fonte & { conteudo: string }`; `synthesize(fontes: FonteLida[], tema: string, idioma: string, hoje: string, t: LlmTarget): Promise<Pick<Dossie, 'premissa' | 'fatos' | 'disputas'>>`.
- Produces: `buildRecortes(dossie: Dossie, seats: Seat[], t: LlmTarget): Promise<Record<string, string>>` — falha → `{}`.

- [ ] **Step 1: Testes que falham** (`chat` falso)
  - `synthesize` com JSON válido → fatos com ids `F1…`, cada `fontes` ⊆ ids recebidos; fato citando `S99` é descartado; aplica limites (12 fatos, 300 chars, 5 disputas).
  - o prompt enviado contém `Hoje é 14/11/2026`, as fontes entre delimitadores e a frase de que fontes são dados, não instruções; total das fontes ≤ 20 000 chars mesmo com 6 fontes de 6 000.
  - JSON quebrado na 1ª e válido na 2ª → usa a 2ª; quebrado nas duas → fallback: um fato por fonte com o início do `conteudo` (≤ 300), `premissa: { status: 'nao_encontrada', nota: 'Não foi possível sintetizar as fontes.' }`.
  - `chat` lança `ProviderError` 429 duas vezes → mesmo fallback, sem lançar (Review Focus 2); 401 → lança `Chave inválida para Groq.`
  - `buildQueries` com resposta `["a","b"]` → `['a','b']`; com lixo → `[tema]`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar (JSON pedido explicitamente; parse tolerante a texto em volta, como `parseModeratorDecision`). **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(research): consultas, síntese e recortes por LLM`.

### Task 6: Orquestrador e rotas

**Files:**
- Create: `src/research/pipeline.ts`, `src/app/api/research/route.ts`, `src/app/api/research/recortes/route.ts`
- Test: `tests/research/pipeline.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5; `resolveKey` (`src/providers/catalog.ts`); `validateDossie` (Task 1).
- Produces: `interface ResearchInput { tema: string; idioma: string; moderador: { provider: ProviderId; model: string }; busca: boolean; links: string[]; textos: { nome: string; conteudo: string }[]; modo: Dossie['modo'] }`; `type Progress = { etapa: 'buscando' | 'lendo' | 'sintetizando'; detalhe?: string; lidas?: number; total?: number }`; `runResearch(input: ResearchInput, deps: { t: LlmTarget; search?; read?; now?: () => number; deadlineMs?: number }, onProgress: (p: Progress) => void): Promise<Dossie>`.
- Rota `/api/research`: corpo `ResearchInput & { keys }`; valida limites (Global Constraints); SSE com `event: progress` e, no fim, `event: dossie` ou `data: {type:'error',message}`; `maxDuration = 60`. Mesmo padrão de stream de `src/app/api/debate/step/route.ts`.
- Rota `/api/research/recortes`: `{ dossie, seats, moderador, keys }` → JSON `{ recortes }`.

- [ ] **Step 1: Testes que falham** (todas as deps falsas)
  - busca desligada + 1 texto do usuário → dossiê com fonte `origem: 'texto'` e `geradoEm` = data de `now()` em `YYYY-MM-DD`.
  - 6 resultados, 2 leituras falham → fontes usam o resumo do RSS; `onProgress` recebe `{ etapa: 'lendo', lidas: 4, total: 6 }`.
  - busca sem nenhum resultado e sem material → dossiê com `fontes: []`, `premissa.status: 'nao_encontrada'`, sem lançar (Review Focus 1).
  - leitura lenta além de `deadlineMs` → sintetiza com o que já leu.
  - links do usuário passam por `read` com `origem: 'link'`; textos são cortados em 6 000 e no total em 20 000.
  - resultado passa em `validateDossie`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar pipeline e as duas rotas (ler o guia de route handlers em `node_modules/next/dist/docs/` antes). **Step 4:** rodar → PASS.
- [ ] **Step 5:** Commit `feat(research): pipeline e rotas /api/research`.

### Task 7: Data e dossiê nos prompts

**Files:**
- Modify: `src/engine/prompts.ts`
- Test: `tests/engine/prompts.test.ts`

**Interfaces:**
- Consumes: `Dossie`, `DebateState.repertorioExtra` (Task 1).
- Produces: `hojeDe(config: DebateConfig, now?: Date): string` (`DD/MM/AAAA`, de `dossie.geradoEm` ou `now`); `dossieBlock(config: DebateConfig, state: DebateState, quem: string): string` (string vazia sem dossiê e sem extras; formato da spec §5; ≤ 4 000 chars).
- Regras (texto exato da spec §5) adicionadas ao system do membro; aviso do modo dividido; instrução de abertura do moderador quando `premissa.status !== 'confirmada'` e `state.history.length === 0`.

- [ ] **Step 1: Testes que falham**
  - todos os 4 builders contêm `Hoje é 14/11/2026.` com `dossie.geradoEm = '2026-11-14'`; sem dossiê usam a data injetada.
  - `todos`: membro vê todos os fatos; `dividido` com 3 fatos e 2 membros: m1 vê F1 e F3, m2 vê F2, ambos veem premissa e disputas e o aviso; moderador vê os 3.
  - `recorte`: membro vê `Destaque para a sua área:` com o seu texto e não o do outro.
  - `repertorioExtra` aparece em `Pesquisado durante o debate:` com `(por <nome>)`.
  - dossiê com `fatos: []` gera bloco sem a seção `Fatos:` e sem lançar (Review Focus 3).
  - moderador com premissa `nao_encontrada` e histórico vazio recebe a instrução de avisar; com histórico, não.
  - bloco cortado em 4 000 chars com 12 fatos de 300.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run` → PASS (inclui `step.test.ts`).
- [ ] **Step 5:** Commit `feat(engine): data de hoje e repertório nos prompts`.

### Task 8: Membros pesquisam durante o debate

**Files:**
- Modify: `src/engine/tags.ts`, `src/engine/step.ts`, `src/engine/prompts.ts`
- Test: `tests/engine/tags.test.ts`, `tests/engine/step.test.ts`

**Interfaces:**
- Consumes: `quickSearch` (Task 4), `MAX_BUSCAS` (Task 1), `dossieBlock` (Task 7).
- Produces: `parseSearchTag(raw: string): string | null` em `tags.ts` (consulta de `[busca: …]` no início, aparada, ≤ 120 chars; senão `null`); `StepDeps.search?: (q: string, idioma: string) => Promise<NewsItem[]>` (default `quickSearch`); `buildMemberMessages(config, state, seat, address, opts?: { allowSearch?: boolean })`.
- Regra no prompt (só com `config.membrosPesquisam && allowSearch && state.buscasFeitas < MAX_BUSCAS`): `Se precisar de um fato que não está no repertório, responda APENAS [busca: <consulta curta>].`

- [ ] **Step 1: Testes que falham** (`fakeChat`/`makeDeps` de `tests/engine/step.test.ts`, `search` falso)
  - `parseSearchTag('[busca: Nvidia CEO] x')` → `'Nvidia CEO'`; `'[duvida|apontar]…'` → `null`.
  - membro responde `[busca: q]` → eventos contêm `research { member: 'm1', query: 'q' }` e depois `research { member: 'm1', query: 'q', fontes: [...] }`, ambos antes de `turn_start` do m1; nenhum `token` com `[busca`; `search` chamado 1×; 2ª chamada ao membro sem a regra de busca e com `Pesquisado durante o debate:`; estado final com `buscasFeitas: 1` e fontes `origem: 'membro'`, `porMembro: 'm1'`, ids seguindo os do dossiê.
  - 2ª resposta também começa com `[busca: …]` → vira texto de turno normal, sem 2ª busca (Review Focus 5).
  - `buscasFeitas: 6` → prompt sem a regra; `membrosPesquisam` falso → sem a regra.
  - `search` lança ou vem vazio → 2ª chamada recebe `A busca não encontrou nada sobre 'q'.`
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar no laço de turno do membro (detectar a tag no texto acumulado antes de emitir `turnStart`). **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat(engine): membros podem pesquisar durante o debate`.

### Task 9: Cena — evento de pesquisa, painel "Fontes" e EndPanel

**Files:**
- Modify: `src/scene/sceneReducer.ts`, `src/scene/SpeechBubble.tsx`, `src/scene/Stage.tsx`, `src/scene/Hud.tsx`, `src/scene/EndPanel.tsx`
- Create: `src/scene/Sources.tsx`
- Test: `tests/scene/sceneReducer.test.ts`

**Interfaces:**
- Consumes: evento `research` e `Fonte` (Task 1).
- Produces: `SceneState.searching?: string` e `SceneState.extraSources: Fonte[]`; reducer em `research`: `speaker = member`, `turnSeq = e.seq`, `searching = query`, emoção do membro `pensativo`; `turn_start` limpa `searching`; `research` com `fontes` acumula em `extraSources`.
- `SpeechBubble` ganha `override?: string` (mostrado no lugar do texto do relógio de fala): `🔎 pesquisando: <q>`.
- `Sources({ dossie, extra }: { dossie?: Dossie; extra: Fonte[] })`: lista veículo · título (link `target="_blank" rel="noopener noreferrer"`), seção "Pesquisadas durante o debate (não revisadas)" com nome de quem pesquisou.
- HUD: botão "Fontes" (só se houver dossiê ou extras) alterna o painel. `EndPanel`: seção "Fontes" com `Sources`.

- [ ] **Step 1: Testes que falham** — reducer: `research` sem fontes define `speaker`, `searching`, emoção `pensativo`; `research` com fontes acumula `extraSources`; `turn_start` seguinte limpa `searching`; `debate_start` zera `extraSources`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar reducer e componentes. **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat(scene): pesquisa em cena e painel de fontes`.

### Task 10: `/config` (bloco Repertório) e página `/preparo`

**Files:**
- Modify: `src/app/config/page.tsx`, `src/app/config/config.module.css`, `package.json`
- Create: `src/app/config/Repertorio.tsx`, `src/app/config/readFile.ts`, `src/app/preparo/page.tsx`, `src/app/preparo/preparo.module.css`
- Test: `tests/config/readFile.test.ts`

**Interfaces:**
- Consumes: `ResearchInput`, `Progress` (Task 6), `Dossie` (Task 1), `readSSE` (`src/client/sse.ts`).
- Produces: `readFileText(file: File): Promise<{ nome: string; conteudo: string }>` (`.txt`/`.md` via `file.text()`; `.pdf` via `await import('pdfjs-dist')`, concatenando o texto das páginas; corta em 6 000; outra extensão lança `Formato não suportado: <ext>`).
- sessionStorage: `mesa:repertorio` (`Omit<ResearchInput, 'tema'|'idioma'|'moderador'> & { membrosPesquisam: boolean }`), `mesa:dossie` (`Dossie`).
- `/config`: "Começar" grava `mesa:repertorio`; se `busca` falso e sem links/textos → `/mesa` com `membrosPesquisam` na config; senão → `/preparo`.
- `/preparo`: se `mesa:dossie` existe para o mesmo tema, mostra; senão chama `/api/research` e mostra progresso (`Buscando notícias…`, `Lendo <detalhe>…`, `Montando o dossiê…`, `N de M fontes lidas`). Edição conforme spec §2.2 (apagar fonte remove fatos que só dependem dela; fato manual com `manual: true`). Botões: "Começar debate" (modo `recorte` chama `/api/research/recortes` antes), "Pesquisar de novo", "Começar sem repertório"; em erro, "Tentar de novo".

- [ ] **Step 1:** `npm install pdfjs-dist` (anotar versão exata no commit). Ler o guia de páginas client em `node_modules/next/dist/docs/`.
- [ ] **Step 2: Testes que falham** — `readFileText` com `File` `.txt` de 7 000 chars → 6 000; `.md` → conteúdo; `.docx` → lança `Formato não suportado: docx`. (PDF fica no teste manual.)
- [ ] **Step 3:** rodar → FAIL. **Step 4:** implementar `readFileText`, `Repertorio.tsx`, ajustes em `page.tsx` e a página `/preparo` seguindo os estilos de `config.module.css`.
- [ ] **Step 5:** `npx vitest run` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 6:** Commit `feat(ui): bloco Repertório e página /preparo` (incluir `package.json` e `package-lock.json`).

### Task 11: Verificação ponta a ponta

- [ ] **Step 1:** Com `next dev` e chaves gratuitas (Groq), tema `O que vocês acham da demissão de Jensen Huang?`, busca ligada, modo `todos`: o dossiê mostra a saída de Huang em nov/2026 com links; editar um fato e apagar uma fonte funciona; no debate, nenhuma fala nega o fato; botão "Fontes" abre a lista; EndPanel lista as fontes.
- [ ] **Step 2:** Tema com premissa falsa (`O que vocês acham da renúncia do papa Leão XX?`): revisão mostra `não encontrada`; abertura do moderador avisa.
- [ ] **Step 3:** Busca desligada + 1 PDF: dossiê só com a fonte `arquivo`. Modos `dividido` e `recorte` rodam sem erro.
- [ ] **Step 4:** `membrosPesquisam` ligado: aparece ao menos um "🔎 pesquisando" em um debate de 10 turnos, ou registrar que os modelos não pediram (não é falha).
- [ ] **Step 5:** `npx vitest run`, `npx tsc --noEmit` — saída anexada ao relatório.
