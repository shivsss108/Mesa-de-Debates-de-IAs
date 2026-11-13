# Mesa de IAs v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sala 3D no navegador onde 2–8 LLMs (cada uma com modelo, temperamento e expertise próprios) debatem um tema mediadas por um moderador ativo, com modo demo (replay) e modo ao vivo com chaves de provedores gratuitos.

**Architecture:** (Desvio deliberado da spec §3: em vez de um único `POST /api/debate` longo, usa-se um passo por requisição — resolve o risco 1 da spec, limite de duração na Vercel, sem mudar o contrato de eventos.) Next.js (App Router, TS). O servidor executa **um passo de debate por requisição** (`POST /api/debate/step`, resposta SSE): recebe `{config, state, keys}`, emite `DebateEvent`s e termina com o novo `DebateState`. O cliente conduz o loop, grava os eventos (replay) e alimenta um reducer puro (`sceneReducer`) que a cena React Three Fiber lê. Replay e ao vivo usam o mesmo reducer.

**Tech Stack:** Next.js (latest), React, TypeScript, @react-three/fiber, @react-three/drei, three, openai (SDK, só como cliente OpenAI-compatível), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-mesa-de-ias-design.md`

## Global Constraints

- Membros por mesa: 2–8, mais 1 moderador. Limite de turnos de membros: padrão 20, faixa 6–60; falas do moderador não contam.
- Membro: até ~80 palavras por fala; histórico enviado = resumo + últimas 6 falas. Resumo atualizado a cada 5 turnos de membros.
- Tag de abertura: `[emoção|gesto|alvo:<memberId|ninguem>|posição:<-1..1>]`.
- Limiar de mão levantada: urge ≥ 0.6; urge limitado a [0, 1.5].
- Retry: backoff 1s, 2s, 4s; 3 falhas seguidas → `sem_sinal` (membro) ou fallback de rodízio (moderador).
- Chaves: nunca persistidas nem logadas no servidor; nunca dentro de eventos; no cliente só em `sessionStorage`. Sem chave no corpo → `process.env.<PROVIDER>_API_KEY`.
- Provedores v1: groq, nvidia, openrouter, google, mistral, cerebras — todos via adaptador OpenAI-compatível pelo servidor.
- Catálogo com cache em memória de 10 min.
- Emoções: neutro, feliz, raiva, duvida, surpresa, tristeza, desdem, pensativo. Gestos: bater_na_mesa, apontar, bracos_cruzados, mao_levantada, maos_no_bolso, balancar_cabeca, dar_de_ombros, inclinar_para_frente (ids sem acento).
- Meta de desempenho: ~60 fps com 9 avatares.
- Textos de UI em português.
- Comandos de terminal: um comando por chamada (sem `&&`/`;`), conforme AGENTS.md do usuário.

## Review Focus

1. **Resposta vazia ou só com a tag** de um modelo gratuito → contar como falha (retry/`sem_sinal`), nunca emitir turno vazio. Teste na Task 6.
2. **Moderador aponta `para` inexistente, para si mesmo, ou para membro `sem_sinal`** → fallback para o topo da fila de mãos (ou próximo da ordem de assentos). Teste na Task 5.
3. **Vários assentos com o mesmo provedor/chave** → o intervalo mínimo é por provedor, compartilhado entre assentos, não por assento. Teste na Task 6.
4. **Texto personalizado gigante** (temperamento/expertise/tema) → truncar em 1000 caracteres (tema: 300) antes de entrar no prompt. Teste na Task 5.
5. **Usuário sai da página ou clica "Encerrar" no meio de um passo** → a requisição em andamento é abortada (`AbortController`) e nenhum novo passo é disparado. Teste na Task 8.

---

## File Structure

```
src/
  types.ts                     DebateConfig, DebateState, DebateEvent, ids
  presets/temperamentos.ts     10 temperamentos + neutro
  presets/expertises.ts        10 expertises + neutro
  presets/randomize.ts         randomizePersonalities, defaultNames
  engine/tags.ts               parseTag
  engine/urge.ts               computeHands
  engine/prompts.ts            buildMemberMessages, buildModeratorMessages, buildSummaryMessages, buildClosingMessages
  engine/moderator.ts          parseModeratorDecision, resolveTarget
  engine/step.ts               runStep (o motor)
  engine/initialState.ts       createInitialState
  providers/table.ts           PROVIDERS (baseURL, envKey, isFree, minIntervalMs, keyUrl)
  providers/client.ts          chat (streaming)
  providers/catalog.ts         getCatalog
  app/api/models/route.ts      GET catálogo
  app/api/debate/step/route.ts POST passo (SSE)
  client/sse.ts                readSSE (parser de stream)
  client/useLiveDebate.ts      loop do cliente
  client/replay.ts             Replay type, playReplay
  scene/sceneReducer.ts        SceneState + reducer puro
  scene/layout.ts              seatPositions
  scene/Room.tsx, Table.tsx, Cameras.tsx, Hud.tsx, Transcript.tsx, SpeechBubble.tsx, Stage.tsx
  skins/types.ts               Skin interface
  skins/terno/Avatar.tsx, face.ts, poses.ts, reactions.ts
  voice/voice.ts               speak, voicesAvailable
  app/page.tsx                 início
  app/config/page.tsx          configuração
  app/mesa/page.tsx            cena (ao vivo ou ?replay=)
  replays/demo-1.json
tests/                         espelha src/ (*.test.ts)
scripts/smoke-providers.ts     validação manual de provedores
```

---

### Task 1: Scaffold, tipos e presets

**Files:**
- Create: projeto Next.js na raiz; `src/types.ts`; `src/presets/temperamentos.ts`; `src/presets/expertises.ts`; `src/presets/randomize.ts`; `vitest.config.ts`
- Test: `tests/presets/randomize.test.ts`

**Interfaces:**
- Produces:
```ts
export type ProviderId = 'groq'|'nvidia'|'openrouter'|'google'|'mistral'|'cerebras';
export type Emotion = 'neutro'|'feliz'|'raiva'|'duvida'|'surpresa'|'tristeza'|'desdem'|'pensativo';
export type Gesture = 'bater_na_mesa'|'apontar'|'bracos_cruzados'|'mao_levantada'|'maos_no_bolso'|'balancar_cabeca'|'dar_de_ombros'|'inclinar_para_frente';
export type PersonaRef = { presetId: string } | { custom: string };
export interface Seat { id: string; nome: string; provider: ProviderId; model: string; temperamento: PersonaRef; expertise: PersonaRef }
export interface DebateConfig { tema: string; idioma: string; maxTurns: number;
  moderador: { provider: ProviderId; model: string; provocacao: 'baixa'|'media'|'alta' }; seats: Seat[] }
export interface HandEntry { member: string; urge: number; reason: string }
export interface DebateState { startedAt: number; memberTurns: number; summary: string;
  history: { speaker: string; text: string }[]; stances: Record<string, number>;
  lastSpokeTurn: Record<string, number>; failures: Record<string, number>; moderatorFailures: number;
  offline: Record<string, number> /* memberId → memberTurns quando caiu */; hands: HandEntry[]; lastCallAt: Partial<Record<ProviderId, number>>; done: boolean;
  pendingAddress?: { to: string; text: string } }
export type DebateEvent = { seq: number; t: number } & (
  | { type: 'debate_start'; config: DebateConfig }
  | { type: 'turn_start'; speaker: string; addressedTo?: string }
  | { type: 'token'; speaker: string; text: string }
  | { type: 'turn_end'; speaker: string; fullText: string }
  | { type: 'emotion'; member: string; emotion: Emotion }
  | { type: 'gesture'; member: string; gesture: Gesture }
  | { type: 'stance'; member: string; value: number }
  | { type: 'hands'; queue: HandEntry[] }
  | { type: 'status'; member: string; state: 'pensando'|'sem_sinal'|'ok' }
  | { type: 'summary_update'; text: string }
  | { type: 'debate_end'; summary: string; consensus: string[]; openPoints: string[]; verdict: string }
  | { type: 'error'; message: string });
export const MODERATOR_ID = 'moderador';
export const OFFLINE_COOLDOWN = 3;
export function offlineIds(s: DebateState): string[]; // ids com s.memberTurns - offline[id] < OFFLINE_COOLDOWN
```
  - `Temperamento { id; nome; promptSnippet; corGravata: string /*hex*/; emocaoPadrao: Emotion; gestosFavoritos: Gesture[]; impulsividade: number /*-0.2..0.3*/ }`, `TEMPERAMENTOS: Temperamento[]` (explosivo, conservador, inovador, cetico, conciliador, sarcastico, otimista, pessimista, pragmatico, idealista), `TEMPERAMENTO_NEUTRO` (gravata `#9e9e9e`, impulsividade 0).
  - `Expertise { id; nome; promptSnippet; acessorio: 'oculos'|'prancheta'|'relogio'|'capacete'|'livro'|'calculadora'|'pasta'|'estetoscopio'|'pincel'|'broche' }`, `EXPERTISES` (cientista, empresario, marketing, engenheiro, filosofo, economista, advogado, medico, artista, politico), `EXPERTISE_NEUTRA`.
  - `resolveTemperamento(ref: PersonaRef): Temperamento & { promptSnippet: string }` / `resolveExpertise(ref)` — custom → neutro com `promptSnippet = custom.slice(0, 1000)`.
  - `randomizePersonalities(seats: Seat[], rng?: () => number): Seat[]`
  - `defaultNames(n: number): string[]` (lista fixa de ≥ 12 nomes curtos em PT, sem repetição).

- [ ] **Step 1:** Scaffold: `npx create-next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*"` (pasta já tem `.git`, `.gitignore` e `docs/`; mesclar `.gitignore`). Instalar `three @react-three/fiber @react-three/drei openai` e dev `vitest @types/three`. Script `"test": "vitest run"`. `vitest.config.ts` com alias `@` → `src`.
- [ ] **Step 2: Write the failing test** `tests/presets/randomize.test.ts`:
  - `randomizePersonalities` com 4 assentos e rng determinístico → todos com `{presetId}` válidos, 4 combinações distintas, provider/model/nome preservados.
  - com 101 assentos (> 10×10) não lança e todos válidos.
  - `defaultNames(8)` → 8 nomes únicos.
  - `resolveTemperamento({custom: 'x'.repeat(5000)}).promptSnippet.length === 1000` e `impulsividade === 0`.
- [ ] **Step 3:** Run `npm test` → FAIL (módulos não existem).
- [ ] **Step 4:** Implementar `types.ts`, presets (snippets de 1–2 frases em PT, cada temperamento com 2–3 gestos favoritos coerentes; explosivo impulsividade 0.3, conservador e conciliador −0.2) e `randomize.ts` (embaralha pares do produto cartesiano; se acabar, reinicia).
- [ ] **Step 5:** Run `npm test` → PASS. Run `npm run build` → sucesso.
- [ ] **Step 6:** Commit `feat: scaffold, tipos e presets`.

---

### Task 2: Parser da tag

**Files:** Create `src/engine/tags.ts`; Test `tests/engine/tags.test.ts`

**Interfaces:**
- Produces: `parseTag(raw: string, memberIds: string[]): { emotion?: Emotion; gesture?: Gesture; target?: string; stance?: number; text: string }`
  - Também `TagStreamSplitter`: `class { push(chunk: string): string /*texto já liberado para streaming*/; tagRaw(): string|null }` — segura o início do stream até fechar `]` (ou até 200 chars sem `]` → libera tudo, sem tag).

- [ ] **Step 1: Failing tests:**
  - `'[raiva|bater_na_mesa|alvo:m2|posição:-0.7] Absurdo!'` (ids `['m1','m2']`) → `{emotion:'raiva', gesture:'bater_na_mesa', target:'m2', stance:-0.7, text:'Absurdo!'}`.
  - `'[raiva|bate_na_mesa] x'` (gesto inexistente) → `gesture` undefined, `emotion:'raiva'`.
  - Aceita `posicao` sem acento, espaços, maiúsculas (`RAIVA`).
  - `alvo:ninguem` e `alvo:m99` (não existe) → `target` undefined.
  - `posição:3` → clamp `1`; `posição:abc` → undefined.
  - Sem tag → `{text: raw.trim()}`.
  - Tag no meio do texto não é tratada como tag.
  - `TagStreamSplitter`: chunks `['[fel', 'iz] Ol', 'á']` → pushes retornam `''`, `'Ol'`, `'á'` (espaço após a tag descartado); `tagRaw()` = `'[feliz]'`. Primeiro chunk sem `[` inicial (ignorando espaços) → liberado imediatamente e `tagRaw()` = null.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar. Regex âncora no início: `/^\s*\[([^\]]{0,200})\]\s*/`; campos separados por `|`; campo sem `:` é emoção se casar com `Emotion`, senão gesto se casar com `Gesture`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: parser da tag de emoção/gesto/alvo/posição`.

---

### Task 3: Vontade de falar

**Files:** Create `src/engine/urge.ts`; Test `tests/engine/urge.test.ts`

**Interfaces:**
- Consumes: `DebateState`, `Seat`, `resolveTemperamento`.
- Produces: `URGE = { cited: 1.0, disagreeWeight: 0.5, recentPenalty: 0.4, recentWindow: 2, agreePenalty: 0.3, agreeEpsilon: 0.2, threshold: 0.6, max: 1.5 }` e
  `computeHands(args: { speaker: string; target?: string; seats: Seat[]; stances: Record<string,number>; lastSpokeTurn: Record<string,number>; memberTurns: number; offline: string[] }): HandEntry[]` — só ouvintes (exclui speaker, moderador e offline), só os com urge ≥ threshold, ordenado desc. `reason` em PT: `"foi citado"`, `"discorda"`, `"impulsivo"` (o fator de maior contribuição).

Fórmula (spec 4.2), stance ausente = 0:
```
urge = (target==m ? cited : 0)
     + disagreeWeight * |s(m) - s(speaker)| / 2
     + impulsividade(m)
     - (memberTurns - lastSpokeTurn[m] <= recentWindow ? recentPenalty : 0)
     - (|s(m)-s(speaker)| < agreeEpsilon && target != m ? agreePenalty : 0)
clamp [0, max]
```

- [ ] **Step 1: Failing tests:** citado neutro > discordante extremo (s=+1 vs −1) não-citado; concordante (diferença 0.1) não aparece; explosivo discordante moderado (diff 1.0) aparece e conservador com mesma diff não; quem falou no turno anterior perde para igual que não falou; offline nunca aparece; speaker nunca aparece; ordenação desc.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: cálculo de vontade de falar`.

---

### Task 4: Provedores, cliente e catálogo

**Files:** Create `src/providers/table.ts`, `src/providers/client.ts`, `src/providers/catalog.ts`, `scripts/smoke-providers.ts`; Test `tests/providers/catalog.test.ts`, `tests/providers/client.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ProviderInfo { id: ProviderId; nome: string; baseURL: string; envKey: string; keyUrl: string;
  minIntervalMs: number; isFree: (modelId: string) => boolean }
export const PROVIDERS: Record<ProviderId, ProviderInfo>;
export type ChatMessage = { role: 'system'|'user'|'assistant'; content: string };
export type ChatFn = (req: { provider: ProviderId; model: string; messages: ChatMessage[]; apiKey: string;
  signal?: AbortSignal; maxTokens?: number }) => AsyncIterable<string>;
export const chat: ChatFn;
export class ProviderError extends Error { status?: number }
export interface CatalogModel { provider: ProviderId; id: string; free: boolean }
export function getCatalog(keys: Partial<Record<ProviderId,string>>, fetchModels?: (p: ProviderId, key: string) => Promise<string[]>, now?: () => number): Promise<{ models: CatalogModel[]; errors: { provider: ProviderId; message: string }[] }>;
export function resolveKey(p: ProviderId, keys: Partial<Record<ProviderId,string>>): string | undefined; // corpo > process.env[envKey]
```
- baseURLs: groq `https://api.groq.com/openai/v1`; nvidia `https://integrate.api.nvidia.com/v1`; openrouter `https://openrouter.ai/api/v1`; google `https://generativelanguage.googleapis.com/v1beta/openai`; mistral `https://api.mistral.ai/v1`; cerebras `https://api.cerebras.ai/v1`. envKeys `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`.
- `isFree`: openrouter → `id.endsWith(':free')`; groq, nvidia, cerebras → `true`; google → `/flash|gemma/i.test(id)`; mistral → `true` (tier de experimentação). `minIntervalMs` iniciais: groq 2000, nvidia 1500, openrouter 3000, google 4000, mistral 1000, cerebras 2000 (ajustar após o smoke).

- [ ] **Step 1: Failing tests:**
  - catalog: com `fetchModels` falso (openrouter `['a:free','b']`, groq `['llama']`) → `free` correto; provider sem chave (nem env) é omitido sem erro; `fetchModels` que lança → entrada em `errors`, demais providers presentes; segunda chamada em < 10 min não chama `fetchModels` de novo; após 10 min chama.
  - client: `chat` com `fetch` global mockado retornando stream SSE OpenAI (`data: {"choices":[{"delta":{"content":"Oi"}}]}` ... `data: [DONE]`) → yields `['Oi', ...]`; resposta 429 → lança `ProviderError` com `status 429`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar `chat` com `new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: false })` e `chat.completions.create({ stream: true, ... }, { signal })`; mapear erros do SDK para `ProviderError` (status). Catálogo com `Map` de cache por provider (chave não entra na chave do cache além de "tem/não tem").
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** `scripts/smoke-providers.ts` (`npx tsx scripts/smoke-providers.ts`): para cada provider com chave no `.env.local`, lista 5 modelos e faz um chat streaming de 1 frase; imprime ok/erro e latência. **Execução manual com chaves do usuário** (riscos 2–4 da spec). Ajustar `minIntervalMs`/`isFree` com o que for observado e anotar no commit.
- [ ] **Step 6:** Commit `feat: provedores, cliente streaming e catálogo`.

---

### Task 5: Prompts e decisão do moderador

**Files:** Create `src/engine/prompts.ts`, `src/engine/moderator.ts`; Test `tests/engine/prompts.test.ts`, `tests/engine/moderator.test.ts`

**Interfaces:**
- Consumes: tipos, presets, `ChatMessage`.
- Produces:
```ts
export const HISTORY_WINDOW = 6; export const TEMA_MAX = 300; export const MEMBER_WORDS = 80;
export function buildMemberMessages(config: DebateConfig, state: DebateState, seat: Seat, address: string): ChatMessage[];
export function buildModeratorMessages(config: DebateConfig, state: DebateState): ChatMessage[];
export function buildSummaryMessages(config: DebateConfig, state: DebateState): ChatMessage[];
export function buildClosingMessages(config: DebateConfig, state: DebateState): ChatMessage[];
export type ModeratorDecision = { acao: 'passar_palavra'|'provocar'|'encerrar'; para?: string; fala: string };
export function parseModeratorDecision(raw: string): ModeratorDecision | null; // extrai o 1º objeto JSON do texto (tolera ```json)
export function resolveTarget(decision: ModeratorDecision, config: DebateConfig, state: DebateState): string; // memberId válido
export function parseClosing(raw: string): { summary: string; consensus: string[]; openPoints: string[]; verdict: string } | null;
```
- Prompt do membro (system) em camadas: regras (≤ `MEMBER_WORDS` palavras, responder a quem citou, não repetir, idioma `config.idioma`, **começar com a tag** no formato exato e listas de emoções/gestos/ids válidos) + expertise + temperamento. User: tema (truncado `TEMA_MAX`), resumo, últimas `HISTORY_WINDOW` falas como `Nome: texto`, e `address`.
- Prompt do moderador: papel ativo; nível de provocação (baixa: provoca raramente; alta: aponta contradições e chama calados com frequência); contagem de falas por membro; fila `state.hands`; membros offline; responder **somente JSON** `ModeratorDecision`.
- `resolveTarget`: `para` válido, não moderador, não offline → ele; senão topo de `state.hands`; senão o membro online que falou há mais tempo (empate: ordem dos assentos).

- [ ] **Step 1: Failing tests:**
  - member messages: contém snippet do temperamento e da expertise; contém só as 6 últimas falas quando há 10; tema de 1000 chars aparece truncado em 300; custom de 5000 chars aparece com ≤ 1000.
  - moderator messages: contém nomes de offline e a fila de mãos.
  - `parseModeratorDecision`: JSON puro; JSON dentro de ```json```; texto antes do JSON; `acao` inválida → null; lixo → null.
  - `resolveTarget` (Review Focus 2): `para:'m9'` inexistente → topo da fila; `para:'moderador'` → topo da fila; `para` offline → topo; fila vazia → quem falou há mais tempo.
  - `parseClosing`: JSON válido → objeto; arrays ausentes → `[]`; lixo → null.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: prompts e decisão do moderador`.

---

### Task 6: Motor (`runStep`)

**Files:** Create `src/engine/step.ts`, `src/engine/initialState.ts`; Test `tests/engine/step.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
```ts
export function createInitialState(config: DebateConfig, now: number): DebateState;
export interface StepDeps { chat: ChatFn; keys: Partial<Record<ProviderId,string>>; now: () => number; sleep: (ms: number) => Promise<void>; signal?: AbortSignal }
export async function* runStep(config: DebateConfig, state: DebateState, deps: StepDeps, seqStart: number): AsyncGenerator<DebateEvent, DebateState>;
export const BACKOFF_MS = [1000, 2000, 4000]; export const SUMMARY_EVERY = 5;
```

Um passo:
1. Se `state.memberTurns === 0 && state.history.length === 0` → emite `debate_start` com o `config` (que, por tipo, nunca contém chaves).
2. Se `memberTurns >= maxTurns` → **fechamento** (abaixo) e retorna `done: true`.
3. Moderador: chama `buildModeratorMessages`, coleta texto, `parseModeratorDecision`; se null, 1 retry com mensagem extra "Responda somente o JSON."; se ainda null ou erro 3× → `moderatorFailures++` e decisão de fallback `{acao:'passar_palavra', para: resolveTarget(...), fala: ''}`. `acao:'encerrar'` → fechamento.
4. Se `fala` não vazia: `turn_start(moderador, addressedTo)`, `token`(fala inteira), `turn_end`.
5. Membro alvo: `status pensando` → chat com `TagStreamSplitter` → `turn_start`, `token`s, ao fim `parseTag(raw)`, emite `emotion` (tag ou `emocaoPadrao`), `gesture` (tag, se houver), `stance` (se houver; atualiza `stances`), `turn_end`, `status ok`. Atualiza `history`, `lastSpokeTurn`, `memberTurns++`, `failures[m]=0`.
   - Falha (exceção, ou texto pós-tag vazio — Review Focus 1): backoff `BACKOFF_MS[i]` via `deps.sleep`, até 3 tentativas; após 3 → `failures[m]++`, `offline[m] = memberTurns`, `status sem_sinal`, sem `turn_start`. Ele fica fora por `OFFLINE_COOLDOWN` turnos de membros (via `offlineIds`) e depois volta a ser elegível.
   - Chave ausente para o provider (`resolveKey` undefined) → evento `error` com nome do provider e `done: true`.
6. Rate gate antes de **cada** chamada: `wait = PROVIDERS[p].minIntervalMs - (now - lastCallAt[p])`, `sleep(wait)` se > 0, atualiza `lastCallAt[p]` (por provider — Review Focus 3).
7. `computeHands` → evento `hands`; salva em `state.hands`.
8. Se `memberTurns % SUMMARY_EVERY === 0` → chamada de resumo → `summary_update`, `state.summary`.
- Fechamento: `buildClosingMessages` → `parseClosing`; se null após 1 retry → `debate_end` com `summary = state.summary`, arrays vazios, `verdict: ''`.
- `t = deps.now() - state.startedAt`; `seq` incremental a partir de `seqStart`.
- `deps.signal` abortado → para sem emitir mais eventos e retorna o estado atual.

- [ ] **Step 1: Failing tests** (chat falso: fila roteirizada de respostas por `(provider, model)`; `sleep` falso que registra ms; `now` controlado):
  - passo feliz: tipos de evento na ordem `debate_start, turn_start(moderador), token, turn_end, status(pensando), turn_start(m1), token…, emotion, gesture, stance, turn_end, status(ok), hands`.
  - sem tag → `emotion` = `emocaoPadrao` do temperamento, sem `gesture`/`stance`.
  - resposta `'[feliz]'` só tag → tratada como falha (retry).
  - 3 falhas → `status sem_sinal`, `offline` contém m, `sleep` chamado com 1000, 2000, 4000.
  - moderador retorna lixo duas vezes → fallback, ainda há turno de membro.
  - `acao:'encerrar'` → `debate_end` e `done`.
  - `memberTurns === maxTurns` → só fechamento.
  - 5º turno → `summary_update` presente.
  - dois assentos mesmo provider groq: segunda chamada com `now` avançado 500ms → `sleep(1500)` (minIntervalMs 2000).
  - sem chave → `error` contendo `'Groq'`, `done`.
  - eventos nunca contêm a string da chave (serializar todos e `not.toContain(key)`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: motor de debate por passo`.

---

### Task 7: Rotas de API

**Files:** Create `src/app/api/models/route.ts`, `src/app/api/debate/step/route.ts`, `src/client/sse.ts`; Test `tests/api/step.test.ts`, `tests/client/sse.test.ts`

**Interfaces:**
- Consumes: `getCatalog`, `runStep`, `chat`.
- Produces:
  - `POST /api/models` body `{ keys }` → `{ models, errors }` (POST para não pôr chave em URL).
  - `POST /api/debate/step` body `{ config: DebateConfig; state: DebateState; keys; seqStart: number }` → `text/event-stream`: cada evento `data: <DebateEvent JSON>\n\n`; último `event: state\ndata: <DebateState JSON>\n\n`. `export const maxDuration = 60`.
  - `validateStepBody(body: unknown): { ok: true; value } | { ok: false; error: string }` — 2–8 seats, ids únicos, providers válidos, `maxTurns` 6–60, `tema` não vazio; inválido → HTTP 400 JSON.
  - `readSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }>` (cliente).
- Request `signal` repassado para `runStep` (aborto do cliente cancela chamadas ao provedor).
- Nenhum `console.log` do corpo.

- [ ] **Step 1: Failing tests:** `validateStepBody` com 1 e 9 seats, ids duplicados, provider `'xai'`, `maxTurns 100` → erros; corpo válido → ok. Handler `POST` com `runStep` mockado (`vi.mock('@/engine/step')`) → stream contém os `data:` e termina com `event: state`. `readSSE` com chunks que quebram no meio de um evento → eventos inteiros.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Manual: `npm run dev`, `curl` em `/api/debate/step` com config de 2 membros Groq e chave do `.env.local` → stream de eventos visível.
- [ ] **Step 6:** Commit `feat: rotas de catálogo e passo de debate`.

---

### Task 8: Loop do cliente, replay e `sceneReducer`

**Files:** Create `src/client/useLiveDebate.ts`, `src/client/replay.ts`, `src/scene/sceneReducer.ts`; Test `tests/scene/sceneReducer.test.ts`, `tests/client/liveLoop.test.ts`, `tests/client/replay.test.ts`

**Interfaces:**
- Produces:
```ts
export interface MemberView { id: string; emotion: Emotion; gesture?: { name: Gesture; at: number }; stance: number; status: 'pensando'|'sem_sinal'|'ok'; handUp: boolean }
export interface SceneState { config?: DebateConfig; members: Record<string, MemberView>; speaker?: string; addressedTo?: string;
  bubble: string; transcript: { speaker: string; text: string }[]; hands: HandEntry[]; memberTurns: number; summary: string;
  ended?: Extract<DebateEvent, {type:'debate_end'}>; error?: string }
export const initialScene: SceneState;
export function sceneReducer(s: SceneState, e: DebateEvent): SceneState;
export interface Replay { version: 1; events: DebateEvent[] }
export function parseReplay(json: unknown): Replay; // lança Error('Replay inválido') se version != 1 ou events não-array
export function playReplay(replay: Replay, onEvent: (e: DebateEvent) => void, opts: { speed: () => number; paused: () => boolean; signal: AbortSignal; waitFor?: () => Promise<void> }): Promise<void>; // respeita deltas de t / speed
export function runLiveLoop(config: DebateConfig, keys: Partial<Record<ProviderId,string>>, onEvent: (e: DebateEvent) => void,
  opts: { fetchStep: (body: object, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>; signal: AbortSignal; paused: () => boolean; waitFor?: () => Promise<void> }): Promise<DebateEvent[]>; // retorna eventos gravados
export function useLiveDebate(): { scene: SceneState; start(config, keys): void; stop(): void; pause(p: boolean): void; speed: number; setSpeed(n: 1|1.5|2): void; events: DebateEvent[] };
export function useReplay(replay: Replay): { scene: SceneState; pause; speed; setSpeed };
```
- `waitFor` é o gancho para a voz (Task 11) segurar o próximo passo.
- Reducer: `token` acumula em `bubble`; `turn_end` move `fullText` para `transcript` e limpa `bubble`; `hands` define `handUp` (`urge ≥ 0.6`, já filtrado); `gesture.at = e.t`.

- [ ] **Step 1: Failing tests:**
  - reducer: sequência do passo feliz da Task 6 → `speaker`, `bubble` acumulado, depois `transcript` com 2 entradas (moderador + m1), `members.m1.emotion` atualizado, `handUp` de quem está na fila, `debate_end` → `ended`.
  - live loop com `fetchStep` falso (2 passos, o 2º com state `done:true`) → para sozinho; `seqStart` do 2º = nº de eventos do 1º; retorna todos os eventos.
  - (Review Focus 5) abort durante o 1º passo → `fetchStep` chamado 1 vez, promessa resolve sem lançar, nenhum evento após o abort.
  - `parseReplay({version:2})` lança; replay válido com `speed 2` chama `sleep` com metade dos deltas (injetar sleep via `waitFor`/timers falsos do Vitest).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar (hooks são casca fina sobre `runLiveLoop`/`playReplay` + `useReducer`). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: loop do cliente, replay e reducer da cena`.

---

### Task 9: Cena — sala, mesa, câmeras, HUD, texto

**Files:** Create `src/scene/layout.ts`, `Room.tsx`, `Table.tsx`, `Cameras.tsx`, `Hud.tsx`, `Transcript.tsx`, `SpeechBubble.tsx`, `Stage.tsx`, `src/skins/types.ts`, `src/app/mesa/page.tsx`; Test `tests/scene/layout.test.ts`

**Interfaces:**
- Consumes: `SceneState`, hooks da Task 8.
- Produces:
  - `seatPositions(n: number, radius?: number): { position: [number,number,number]; rotationY: number }[]` — índice 0 = moderador na cabeceira (ângulo 0), membros distribuídos uniformemente no restante do círculo, todos olhando para o centro. `radius` padrão `1.6 + 0.15*n`.
  - `interface Skin { Avatar: React.FC<{ seat: Seat | 'moderador'; view: MemberView; isSpeaker: boolean; speakerPos?: [number,number,number] }> }`
  - `<Stage scene={SceneState} skin={Skin} controls={...} />` monta Canvas + Room + Table + avatares + câmeras + HUD.
  - `/mesa?replay=demo-1` toca `src/replays/demo-1.json`; `/mesa` sem query lê config/chaves do `sessionStorage` (`mesa:config`, `mesa:keys`) e roda ao vivo; sem config → redireciona para `/config`.
- Câmeras (tecla `C` cicla): livre = drei `PointerLockControls` + WASD (velocidade 3 u/s, colisão só com limites da sala); órbita = `OrbitControls` alvo no centro da mesa; diretor = interpola posição até ponto à frente-acima do `speaker` (moderador → plano aberto), close de 1.5s quando chega `gesture bater_na_mesa`. Padrão: diretor no replay, órbita ao vivo.
- Visual: `MeshToonMaterial` + drei `Outlines` (preto); fundo escuro azul-petróleo com textura de ruído (estilo da referência); luz quente pontual sobre a mesa.
- HUD (HTML sobreposto): tema, `turno X/maxTurns`, fila de mãos (nome + motivo), pausar, velocidade 1×/1.5×/2×, encerrar, botão voz (Task 11), câmera atual. Hover em avatar → cartão (modelo, provedor, temperamento, expertise, barra de posição −1..+1).
- `SpeechBubble`: drei `Html` acima da cabeça do orador, máx. ~4 linhas com rolagem. `Transcript`: painel lateral recolhível.
- Até a Task 10, o `Skin` usado é um placeholder (cápsula colorida) definido em `Stage.tsx`.

- [ ] **Step 1: Failing test** `layout.test.ts`: n=5 → 5 posições, [0] em ângulo 0, todas a `radius` do centro, `rotationY` aponta para o centro (vetor posição·direção ≈ −1), distâncias angulares entre membros iguais.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar `layout.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Implementar componentes. Gerar `src/replays/demo-1.json` provisório **à mão** (≈ 30 eventos, 3 membros, inclui gestos, hands e debate_end) para desenvolvimento.
- [ ] **Step 6:** Verificar no navegador (`npm run dev`, `/mesa?replay=demo-1`): os três modos de câmera funcionam, balão e transcrição seguem o replay, HUD pausa/acelera, contador de FPS (drei `Stats` só em dev) ≈ 60.
- [ ] **Step 7:** Commit `feat: cena 3D, câmeras e HUD`.

---

### Task 10: Skin "Terno"

**Files:** Create `src/skins/terno/Avatar.tsx`, `face.ts`, `poses.ts`, `reactions.ts`, `index.ts`; Test `tests/skins/terno/poses.test.ts`, `tests/skins/terno/reactions.test.ts`

**Interfaces:**
- Consumes: `Skin`, `MemberView`, presets (cor da gravata, acessório).
- Produces:
```ts
export type Joint = 'cabeca'|'tronco'|'ombroE'|'cotoveloE'|'ombroD'|'cotoveloD';
export type Pose = Partial<Record<Joint, [number, number, number]>>; // rotações Euler rad
export const POSES: Record<Gesture | 'idle' | 'falando', Pose>;
export const GESTURE_DURATION_MS: Record<Gesture, number>; // mao_levantada e bracos_cruzados = sustentadas (Infinity)
export function poseAt(view: MemberView, nowT: number, isSpeaker: boolean): Pose; // gesto ativo se nowT - at < duração, senão reação/idle
export function listenerReaction(view: MemberView, speakerStance: number, addressed: boolean): Gesture | 'idle';
export function drawFace(ctx: CanvasRenderingContext2D, emotion: Emotion, opts: { blink: boolean; mouthOpen: number; offline: boolean }): void;
export const ternoSkin: Skin;
```
- `listenerReaction`: `handUp` → `mao_levantada`; `|stance - speakerStance| > 1` → `bracos_cruzados`; `< 0.3` → `balancar_cabeca`; senão `idle`. Citado (`addressed`) vira a cabeça para o orador (feito no Avatar via `lookAt`, não pose).
- Avatar: esfera branca (cabeça, `CanvasTexture` 256² com `drawFace`), terno preto (cápsulas), camisa branca, gravata (cor do temperamento; moderador branca + martelo), acessório da expertise (primitivas simples). Interpolação de juntas por `damp` (drei `maath/easing`) a cada frame. Piscar a cada 3–6 s aleatório. Boca: `mouthOpen` oscila enquanto `isSpeaker` e chegam tokens. `sem_sinal` → rosto com estática.
- Expressões (`drawFace`): olhos de ponto + boca de traço; raiva = sobrancelhas em V + boca para baixo; duvida = uma sobrancelha alta; surpresa = olhos maiores + boca O; tristeza = sobrancelhas caídas; desdem = boca de lado; pensativo = olhos para cima; feliz = boca curva.

- [ ] **Step 1: Failing tests:** `poseAt` com gesto `bater_na_mesa` em `at=1000`, `nowT=1200` → pose do gesto; `nowT=1000+duração+1` → idle/reação; `mao_levantada` sustentada enquanto `handUp`. `listenerReaction` nos 4 casos acima. Todo `Gesture` tem entrada em `POSES` e `GESTURE_DURATION_MS`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar poses/reactions; depois `face.ts` e `Avatar.tsx`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar no navegador com o replay: 8 gestos legíveis, 8 expressões distintas, acessórios visíveis, 9 avatares ≈ 60 fps.
- [ ] **Step 6:** Commit `feat: skin Terno com rosto, gestos e reações`.

---

### Task 11: Voz do navegador

**Files:** Create `src/voice/voice.ts`; Modify `src/scene/Hud.tsx`, `src/client/useLiveDebate.ts` (passar `waitFor`); Test `tests/voice/voice.test.ts`

**Interfaces:**
- Produces: `voicesAvailable(): boolean`; `assignVoices(memberIds: string[], voices: SpeechSynthesisVoice[], lang: string): Record<string, { voice?: SpeechSynthesisVoice; pitch: number; rate: number }>` (prefere vozes do idioma; repete vozes com pitch distinto 0.8–1.3 quando faltam); `speak(text: string, profile): Promise<void>` (resolve em `onend`/`onerror`).
- Com voz ligada: no `turn_end`, `speak(fullText)` e o `waitFor` do loop/replay aguarda a promessa. Boca do avatar acompanha `onboundary` quando disponível.
- Sem `speechSynthesis` ou sem vozes → botão desabilitado com `title="Seu navegador não tem voz disponível"`.

- [ ] **Step 1: Failing tests:** `assignVoices` com 2 vozes `pt-BR` e 5 membros → 5 perfis, todos com voz pt-BR, pares (voz, pitch) distintos; sem vozes do idioma → usa as disponíveis. `voicesAvailable()` false quando `globalThis.speechSynthesis` ausente.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar no navegador: ligar voz no replay, cada membro com voz distinta, próximo turno espera.
- [ ] **Step 6:** Commit `feat: voz do navegador opcional`.

---

### Task 12: Telas de início, configuração e fim

**Files:** Create `src/app/page.tsx`, `src/app/api/models/env/route.ts`, `src/app/config/page.tsx`, `src/app/config/SeatCard.tsx`, `src/app/config/validateConfig.ts`, `src/scene/EndPanel.tsx`; Test `tests/config/validateConfig.test.ts`

**Interfaces:**
- Consumes: presets, `randomizePersonalities`, `defaultNames`, `POST /api/models`, `PROVIDERS` (nome, keyUrl), `Replay`.
- Produces: `validateConfig(config: DebateConfig, keys: Partial<Record<ProviderId,string>>, envProviders: ProviderId[]): string[]` (lista de problemas em PT; vazia = pode começar). `envProviders` vem de `GET /api/models/env` → `ProviderId[]` com chave no servidor (só os ids, nunca as chaves).
- Início: título "Mesa de IAs", `Stage` tocando `demo-1` em loop no fundo (câmera diretor, sem HUD), botões "Assistir demo" (`/mesa?replay=demo-1`) e "Montar minha mesa" (`/config`).
- Config: blocos Debate (tema com 5 sugestões clicáveis, idioma pt-BR/en/es, turnos 6–60), Moderador (provedor/modelo, provocação), Assentos (2–8; `SeatCard` com nome editável, provedor/modelo do catálogo, temperamento e expertise como `select` + opção "Personalizado…" que abre `textarea` com contador `/1000`), barra com "Só gratuitos" (filtra os dropdowns por `free`), "Aleatorizar personalidades", "Mesmo modelo para todos". Chaves: um `input type=password` por provedor usado, link `keyUrl` "onde conseguir grátis", salvo em `sessionStorage` `mesa:keys`; "Carregar modelos" chama `/api/models`. "Começar" desabilitado enquanto `validateConfig` retornar problemas (mostrados abaixo do botão). Ao começar: grava `mesa:config` e navega para `/mesa`.
- Fim (`EndPanel`, quando `scene.ended`): resumo, consensos, pontos em aberto, veredito, botão "Baixar debate" (`Blob` de `{version:1, events}` → `mesa-de-ias-<data>.json`), "Nova mesa".
- Acessibilidade: todos os controles com `label`; navegação por teclado na config.

- [ ] **Step 1: Failing tests:** `validateConfig`: tema vazio → problema; assento sem modelo → problema citando o nome do assento; provedor usado sem chave e fora de `envProviders` → problema citando o provedor; com chave no env → ok; config válida → `[]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementar `validateConfig`, rota `GET /api/models/env`, depois telas. **Step 4:** Run → PASS.
- [ ] **Step 5:** Verificar ponta a ponta no navegador com chaves gratuitas reais: config de 4 membros (Groq + NVIDIA), "Só gratuitos", aleatorizar, um personalizado → debate completo até o painel final → baixar `.json` → abrir `/mesa?replay=` com ele copiado para `src/replays/` toca igual.
- [ ] **Step 6:** Commit `feat: telas de início, configuração e fim`.

---

### Task 13: Demo real, README e deploy

**Files:** Modify `src/replays/demo-1.json` (substituir pelo debate real gravado); Create `README.md`

- [ ] **Step 1:** Com o usuário, gravar 1–2 debates reais bons (tema interessante, 4–6 membros, temperamentos contrastantes) e substituir o replay provisório.
- [ ] **Step 2:** `README.md`: GIF/screenshot, o que é, como rodar local (`.env.local` de exemplo com os nomes das variáveis, **sem valores**), provedores gratuitos e onde pegar chaves, arquitetura em 1 diagrama, roadmap v2–v4, inspirações (LLM Council, ChatDev, AI Town).
- [ ] **Step 3:** `npm test` → tudo PASS; `npm run build` → sucesso.
- [ ] **Step 4:** Commit `docs: README e debate de demonstração`.
- [ ] **Step 5:** **Parar e pedir confirmação ao usuário** antes de: criar repositório no GitHub, dar push, e fazer deploy na Vercel (ações externas/públicas). Após o deploy, abrir a URL pública e confirmar que "Assistir demo" funciona sem chave e que um debate ao vivo de 6 turnos completa dentro do limite de duração.
