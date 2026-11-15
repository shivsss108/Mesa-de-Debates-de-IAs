# Estúdio de TV (reformulação visual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o app num programa de debate de TV: estúdio com púlpitos em arco, telão e LEDs, avatares procedurais variados, câmera com cortes, GC, legenda de fala e telas com a mesma identidade.

**Architecture:** Lógica nova em funções puras testáveis (`seatPositions` em arco, `lookOf/looksFor`, `drawFace`, `shotFor`, `telaoLines`); a cena 3D (`Studio`, `Avatar`, `Cameras`) e as camadas DOM (`LowerThird`, `Caption`, `Hud`, `Transcript`, `EndPanel`) consomem essas funções. A interface `Skin`, poses, eventos e o relógio de fala não mudam.

**Tech Stack:** Next.js 16, React 19, React Three Fiber 9 + drei 10, three 0.187, CSS Modules, `next/font/google`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-estudio-tv-design.md`

## Global Constraints

- Nenhuma dependência npm nova (sem `@react-three/postprocessing`, sem modelos .glb). Fonte de títulos: **Barlow Condensed** via `next/font/google`.
- Contratos inalterados: `Skin` (`src/skins/types.ts`), `POSES`/juntas (`cabeca`, `tronco`, `ombroE/D`, `cotoveloE/D`), `Emotion`, `DebateEvent`, relógio de fala (`bubbleText`, `mouthOpen` em `src/voice/speech.ts`), formato de `seatPositions` (`{ position, rotationY }[]`, índice 0 = moderador).
- Paleta: `--bg #0b1426`, `--panel #111d33`, `--accent #ffb23e`, `--led #3aa0ff`, `--live #ff3b47`. Cor de cada membro = `resolveTemperamento(seat.temperamento).corGravata`; moderador = `--accent`.
- Materiais `MeshStandardMaterial`; sem `MeshToonMaterial` nem `Outlines` na cena. Texturas de canvas: rosto ≤ 12 Hz, telão ≤ 1 Hz, plaquinhas estáticas. `dpr={[1, 2]}`.
- `Stats` (FPS) só quando a URL tem `?debug`.
- `prefers-reduced-motion`: sem deslize do GC, sem push-in, sem plano de reação.
- Contraste AA; foco visível âmbar; controles com rótulo; funciona a partir de 360 px de largura.
- Textos de UI em português. Replay mostra selo "REPRISE"; ao vivo "AO VIVO"; demo da tela inicial "AO VIVO · DEMO".
- Antes de mexer em página/layout do Next, ler o guia relevante em `node_modules/next/dist/docs/` (AGENTS.md).
- Commits com caminhos explícitos (nunca `git add -A`/`.`); terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `npx vitest run <arquivo>`, `npx tsc --noEmit`, `npx eslint <arquivos tocados>` (não adicionar erros). O `next dev` do usuário roda em http://localhost:3000 a partir deste checkout — não subir outro.

## Review Focus

1. **Tema longo (300 chars) e nomes longos** no telão, plaquinha e GC: quebrar/elipsar sem estourar — teste de `telaoLines` em Task 5; GC/plaquinha com elipse (Task 8, verificação visual Task 11).
2. **Mesas pequenas e grandes (n = 3 e n = 9)**: arco sem sobreposição e câmera aberta enquadrando todos — testes em Task 1; enquadramento conferido em Task 11.
3. **Fim do debate / orador indefinido / membro offline**: câmera volta ao plano aberto e o spot apaga — teste em Task 6 (`shotFor` sem orador); rosto offline em Task 3.
4. **Celular 360–375 px**: GC, legenda e barra de controles não se sobrepõem — verificação em Task 11 com checagem por `getBoundingClientRect` (Task 9 define as posições).
5. **Temperamento personalizado** (sem preset): cor do membro cai na cor padrão de `resolveTemperamento` e `lookOf` funciona com qualquer `seat.id` — teste em Task 2.

---

### Task 1: Disposição em arco

**Files:**
- Modify: `src/scene/layout.ts`
- Test: `tests/scene/layout.test.ts` (reescrever os casos de círculo)

**Interfaces:**
- Produces: `seatPositions(n: number, radius?: number): SeatPose[]` (mesma assinatura); `defaultRadius(n: number): number`; `studioSize(radius: number): number` (lado do estúdio; substitui `roomSize`).

- [ ] **Step 1: Testes que falham** (`n` = total incluindo moderador)
  - `n=5`: `ps[0]` em `x≈0`, `z = -radius` (fundo), `rotationY ≈ 0` (olha para +Z).
  - membros (`ps[1..]`) num arco de 200° centrado em +Z: todos com `z > ps[0].z`; simétricos (`x` de `ps[i]` ≈ `-x` de `ps[n-i]`); todos à distância `radius` da origem; `rotationY` aponta para a origem (frente · posição ≈ −1, como no teste atual).
  - espaçamento: para `n=3` e `n=9`, a distância entre membros vizinhos ≥ 1.1.
  - `studioSize(defaultRadius(9)) > 2 * defaultRadius(9) + 4`.
  - o teste existente que usa o replay demo continua passando.
- [ ] **Step 2:** `npx vitest run tests/scene/layout.test.ts` → FAIL.
- [ ] **Step 3:** Implementar: membros em ângulos de `-100°` a `+100°` em torno de +Z (iguais), moderador em `(0, 0, -radius)`; `defaultRadius(n)` cresce para garantir o espaçamento ≥ 1.1 (corda entre vizinhos = `2r·sin(Δ/2)`). Remover `roomSize` de `Room.tsx` só na Task 5 — aqui exportar `studioSize` de `layout.ts`.
- [ ] **Step 4:** rodar → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(scene): púlpitos em arco`.

### Task 2: Aparência determinística dos membros

**Files:**
- Create: `src/skins/terno/look.ts`
- Test: `tests/skins/terno/look.test.ts`

**Interfaces:**
- Produces: `type Hair = 'curto' | 'repartido' | 'coque' | 'cacheado' | 'careca_barba'`; `interface Look { skin: string; hair: Hair; hairColor: string; suit: string; tie: string; glasses: boolean }`; constantes `SKINS` (6 hex), `HAIR_COLORS` (5 hex incl. grisalho `#b8b8b8` só no moderador), `SUITS` (`grafite #2b2f36`, `azul-marinho #1c2a4a`, `vinho #5a1f2b`, `oliva #4a4f2a`, `bege #b9a184`); `lookOf(seat: Seat | 'moderador'): Look`; `looksFor(seats: Seat[]): Record<string, Look>` (inclui `moderador`).

- [ ] **Step 1: Testes que falham**
  - `lookOf(seat)` é igual em duas chamadas e independe da ordem dos outros assentos.
  - `lookOf('moderador')`: `hair` ≠ `careca_barba`, `hairColor === '#b8b8b8'`, `glasses === true`, `suit === '#1c2a4a'`, `tie` = âmbar `#ffb23e`.
  - `tie` de um membro = `resolveTemperamento(seat.temperamento).corGravata`; com `temperamento: { custom: 'x' }` não lança e devolve uma cor hex (Review Focus 5).
  - `looksFor` com 8 assentos (ids `m1..m8`): as 8 combinações `(skin, hair, suit)` são distintas; mesmo resultado em duas chamadas.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** Implementar com hash FNV-1a do id; `looksFor` resolve colisões avançando o índice de forma determinística (ordem de `seats`).
- [ ] **Step 4:** rodar → PASS. **Step 5:** Commit `feat(skin): aparência determinística por assento`.

### Task 3: Rosto novo

**Files:**
- Modify: `src/skins/terno/face.ts`
- Test: `tests/skins/terno/face.test.ts`

**Interfaces:**
- Produces: `drawFace(ctx, emotion, opts: { blink: boolean; mouthOpen: number; offline: boolean; skin: string }): void` (novo campo `skin`; `FACE_SIZE` e o mapeamento de UV inalterados).

- [ ] **Step 1: Testes que falham** (contexto falso que registra chamadas, como no teste atual)
  - fundo pintado com `opts.skin`.
  - **sobrancelhas desenhadas em todas as 8 emoções** (pelo menos 2 traços na faixa de y das sobrancelhas).
  - olho aberto desenha esclera clara + íris escura + brilho; `blink` desenha pálpebra no lugar.
  - `mouthOpen` 1/3, 2/3, 1 produzem aberturas de alturas crescentes e, a partir de 2/3, um retângulo claro de dentes; `mouthOpen 0` desenha lábios fechados por emoção.
  - `offline` continua desenhando só o chuvisco (Review Focus 3).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS (+ `tests/skins/terno/*` verdes).
- [ ] **Step 5:** Commit `feat(skin): rosto com olhos, sobrancelhas e lábios`.

### Task 4: Corpo do avatar redesenhado

**Files:**
- Modify: `src/skins/terno/Avatar.tsx`, `src/skins/types.ts`, `src/scene/Stage.tsx`
- Test: verificação visual (sem novo teste unitário); `tests/skins/terno/*` continuam verdes

**Interfaces:**
- Consumes: `lookOf`, `looksFor` (Task 2), `drawFace` com `skin` (Task 3).
- Produces: `Skin['Avatar']` ganha uma prop **opcional** `look?: Look` (extensão compatível do contrato: sem ela o avatar usa `lookOf(seat)`); `Stage.tsx` calcula `looksFor(seats)` uma vez (`useMemo`) e passa `look={looks[id]}` — é assim que a mesa evita repetições (spec §4.1).

- [ ] **Step 1:** Manter `useFrame`, `dampE` e a estrutura de juntas. Trocar materiais para `MeshStandardMaterial` compartilhados por cor (cache módulo `Map<string, Material>`), remover `Outlines`.
- [ ] **Step 2:** Corpo: cabeça maior (raio ~0.23), pescoço, tronco afinando (lathe ou cápsulas sobrepostas), lapelas (2 planos), camisa + gravata `look.tie`, mãos (cápsula + polegar) em `look.skin`; cabelo por `look.hair` (formas simples: calota, calota + risca, coque = esfera atrás, cacheado = grupo de esferas, careca + barba = meia-casca no queixo); óculos se `look.glasses` ou acessório `oculos`. Pernas removidas (púlpito cobre); manter acessórios de expertise, reposicionados.
- [ ] **Step 3:** Vida: respiração (escala Y do tronco ±1%, ~0.25 Hz); **todo ouvinte olha para o orador** (yaw da cabeça para `speakerPos`, ±1.1 rad); o `addressed` soma yaw de tronco ±0.3 rad. Boca via `mouthOpen(id, now)` como hoje.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`; abrir `http://localhost:3000/mesa?replay=demo-1` e confirmar avatares com cabelo/pele variados, mãos, gestos e boca funcionando.
- [ ] **Step 5:** Commit `feat(skin): avatar estilizado com cabelo, pele e mãos`.

### Task 5: Estúdio, telão e luz

**Files:**
- Create: `src/scene/Studio.tsx`, `src/scene/telao.ts`
- Delete: `src/scene/Room.tsx`, `src/scene/Table.tsx`
- Modify: `src/scene/Stage.tsx`, `src/scene/Cameras.tsx` (`roomSize` → `studioSize`)
- Test: `tests/scene/telao.test.ts`

**Interfaces:**
- Consumes: `seatPositions`, `defaultRadius`, `studioSize` (Task 1); `looksFor` não é necessário aqui.
- Produces: `telaoLines(input: { tema: string; turno: number; maxTurns: number; orador?: string; elapsedMs: number }, maxChars = 38): { tema: string[]; status: string; relogio: string }` (tema em ≤ 2 linhas, a 2ª com "…" se truncar; `status` = `Turno 7/20 · fala: Ana` ou `Turno 7/20`; `relogio` = `mm:ss`); `<Studio radius seats speakerId elapsedMs scene />`.

- [ ] **Step 1: Testes que falham** — `telaoLines`: tema de 300 chars → 2 linhas, cada ≤ 38, a última termina em "…" (Review Focus 1); tema curto → 1 linha; `elapsedMs 65_000` → `01:05`; sem orador → `Turno 3/20`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `telaoLines`.
- [ ] **Step 4:** `Studio.tsx`: piso (`roughness 0.35`, `#0b1426`), anel de LED emissivo (`#3aa0ff`), fundo curvo com faixas emissivas azul e âmbar, telão (plano + `CanvasTexture` redesenhado só quando `telaoLines` muda), púlpito por membro com faixa LED na cor do membro e plaquinha com nome (canvas estático, elipse se longo), bancada do moderador âmbar, `ContactShadows`. Luzes: `hemisphereLight`, key quente, fill frio, contraluz azul, `SpotLight` que segue o orador (lerp ~0.4 s; intensidade 0 sem orador). Em `Stage.tsx`: trocar `Room`/`Table`; `<color attach="background">` `#0b1426`; `Stats` só se `location.search` tem `debug`.
- [ ] **Step 5:** PASS + `tsc`; conferir no navegador o estúdio, telão com o tema do replay e o spot mudando de orador.
- [ ] **Step 6:** Commit `feat(scene): estúdio de TV com telão, LEDs e spot`.

### Task 6: Câmera Diretor com cortes

**Files:**
- Create: `src/scene/shots.ts`
- Modify: `src/scene/Cameras.tsx` (DirectorCam), `src/voice/speech.ts`
- Test: `tests/scene/shots.test.ts`, `tests/voice/speech.test.ts`

**Interfaces:**
- Produces: `speechProgress(speaker: string, turnSeq: number): { speaking: boolean; progress: number }` em `speech.ts` (`speaking` = a fala deste turno começou; `progress` = `shown/text.length`, 0 se não começou); `type Shot = { kind: 'aberto' | 'close' | 'reacao'; target?: string }`; `shotFor(i: { speaker?: string; addressedTo?: string; speaking: boolean; progress: number; reactionSince?: number; now: number; reducedMotion: boolean }): Shot`; `REACTION_MS = 1500`, `REACTION_AT = 0.4`.

- [ ] **Step 1: Testes que falham**
  - `shotFor` sem `speaker` → `aberto` (Review Focus 3); `speaker` com `speaking:false` → `aberto`; `speaking:true, progress 0.2` → `close` no orador.
  - com `addressedTo`, `reactionSince = now - 500` → `reacao` no citado; `now - 1600` → `close`.
  - `reducedMotion:true` nunca devolve `reacao`.
  - `speechProgress`: antes de `say` → `{speaking:false, progress:0}`; durante → `progress` entre 0 e 1; outro orador/turno → `speaking:false`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `shotFor`, `speechProgress`.
- [ ] **Step 4:** DirectorCam: a cada frame calcula o plano; mantém `reactionSince` (marca quando `progress` cruza `REACTION_AT` pela 1ª vez no turno, só se há `addressedTo`); cortes secos (posição definida no frame da troca); `aberto` enquadra o arco inteiro + telão (distância a partir de `radius`); `close` = cabeça e ombros a ~1.4 m, à frente-lateral do alvo, com push-in de 0.3 m ao longo da fala (desligado com reduced motion, via `matchMedia('(prefers-reduced-motion: reduce)')`).
- [ ] **Step 5:** PASS + `tsc`; conferir os cortes no replay.
- [ ] **Step 6:** Commit `feat(scene): câmera diretor com cortes de TV`.

### Task 7: Identidade — tokens, fonte e marca

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/Mascote.tsx`
- Create: `src/app/Logo.tsx`, `src/app/Logo.module.css`, `src/skins/terno/AvatarThumb.tsx`
- Test: `tests/skins/terno/avatarThumb.test.ts`

**Interfaces:**
- Consumes: `Look`, `lookOf` (Task 2).
- Produces: tokens CSS (`--bg`, `--panel`, `--panel-solid`, `--line`, `--fg`, `--muted`, `--accent`, `--accent-2`, `--led`, `--live`, `--danger`, `--font-display`); `<Logo badge?: 'AO VIVO' | 'REPRISE' | 'AO VIVO · DEMO' size?: 'sm' | 'lg' />`; `<AvatarThumb look: Look size?: number />` (SVG 2D: cabeça na pele, cabelo pelo estilo, paletó, gravata) e `avatarThumbParts(look): { skin, hair, suit, tie }` (pura, testável); `Mascote` passa a renderizar `AvatarThumb` com `lookOf('moderador')`.

- [ ] **Step 1: Testes que falham** — `avatarThumbParts(look)` devolve as cores do `look` e um path de cabelo diferente para cada `Hair`; `careca_barba` devolve barba e nenhum cabelo no topo.
- [ ] **Step 2:** FAIL. **Step 3:** implementar.
- [ ] **Step 4:** `globals.css` com os tokens (substituir paleta petróleo; `:focus-visible` âmbar); `layout.tsx` carrega Barlow Condensed (pesos 600/700) como `--font-display`; `Logo` = "MESA DE IAs" em `--font-display` + selo com ponto `--live` (selo sem animação com reduced motion).
- [ ] **Step 5:** PASS + `tsc`; curl `http://localhost:3000/` → 200.
- [ ] **Step 6:** Commit `feat(ui): tokens do estúdio, fonte condensada e logo`.

### Task 8: GC e legenda de fala

**Files:**
- Create: `src/scene/LowerThird.tsx`, `src/scene/Caption.tsx`, `src/scene/overlays.module.css`
- Delete: `src/scene/SpeechBubble.tsx`
- Modify: `src/scene/Stage.tsx`
- Test: `tests/scene/lowerThird.test.ts`

**Interfaces:**
- Consumes: `bubbleText` (speech.ts), `scene.searching`, `memberName`, `resolveTemperamento`, `resolveExpertise`, `PROVIDERS`.
- Produces: `lowerThirdInfo(config: DebateConfig, id: string): { nome: string; linha: string; modelo: string; cor: string }` (pura; moderador → `{ nome: 'Moderador', linha: 'Mediação', modelo: '<modelo> (<Provedor>)', cor: '#ffb23e' }`); `<LowerThird scene />`; `<Caption speaker turnSeq override? />` (mesmo loop rAF que o antigo `SpeechBubble`, 2 linhas visíveis, `aria-live="polite"`).

- [ ] **Step 1: Testes que falham** — `lowerThirdInfo` para membro: `linha` = `"<Temperamento> · <Expertise>"`, `modelo` = `"<model> (<nome do provedor>)"`, `cor` = `corGravata`; moderador como acima.
- [ ] **Step 2:** FAIL. **Step 3:** implementar.
- [ ] **Step 4:** GC no canto inferior esquerdo, entra com deslize (CSS transition, desligada em reduced motion) a cada `turn_start`, sai quando o orador vira `undefined`; nome com `text-overflow: ellipsis` (Review Focus 1). Legenda: faixa central inferior acima da barra de controles, `max-width: min(760px, 92vw)`, 2 linhas, rolagem para a última linha. Remover `SpeechBubble`/`BubbleAnchor` de `Stage.tsx`.
- [ ] **Step 5:** PASS + `tsc`; conferir no replay GC trocando a cada turno e legenda sincronizada com a boca.
- [ ] **Step 6:** Commit `feat(scene): legenda de TV (GC) e legenda de fala`.

### Task 9: HUD, transcrição e encerramento

**Files:**
- Modify: `src/scene/Hud.tsx`, `src/scene/Transcript.tsx`, `src/scene/EndPanel.tsx`, `src/scene/EndPanel.module.css`, `src/scene/Sources.tsx`, `src/app/mesa/page.tsx`, `src/app/page.tsx`
- Create: `src/scene/Hud.module.css`, `src/scene/useIdle.ts`
- Test: `tests/scene/useIdle.test.ts`

**Interfaces:**
- Consumes: `Logo` (Task 7), `AvatarThumb`/`looksFor` (Tasks 2, 7), tokens.
- Produces: `StageControls.badge?: 'AO VIVO' | 'REPRISE'` (mesa ao vivo → `AO VIVO`, replay → `REPRISE`); `idleAfter(lastActivity: number, now: number, focusedInside: boolean, ms = 3000): boolean` (pura, em `useIdle.ts`) + hook `useIdle(ref, ms)`.

- [ ] **Step 1: Testes que falham** — `idleAfter`: `now - last < 3000` → false; `≥ 3000` → true; `focusedInside` → sempre false.
- [ ] **Step 2:** FAIL. **Step 3:** implementar.
- [ ] **Step 4:** HUD em CSS module: selo (`Logo` + "Turno X/Y") no canto superior esquerdo; "Pedindo a palavra" no superior direito (some sem mãos); barra de controles em pílula central inferior que some com `useIdle` (reaparece com mouse/toque/foco); botão e painel "Fontes" restilizados; cartão do membro com `AvatarThumb`. Posições sem sobreposição em 360 px: GC à esquerda acima da barra, legenda centralizada acima do GC no celular (Review Focus 4). Transcrição: gaveta à direita fechada por padrão (no celular, folha inferior), nomes na cor do membro. `EndPanel`: cabeçalho com `Logo`, seções existentes, estilo "encerramento".
- [ ] **Step 5:** PASS + `tsc` + eslint dos arquivos tocados; conferir no replay.
- [ ] **Step 6:** Commit `feat(ui): HUD de programa de TV, transcrição e encerramento`.

### Task 10: Telas início, /config e /preparo

**Files:**
- Modify: `src/app/page.tsx`, `src/app/page.module.css`, `src/app/config/page.tsx`, `src/app/config/config.module.css`, `src/app/config/SeatCard.tsx`, `src/app/config/Repertorio.tsx`, `src/app/preparo/page.tsx`, `src/app/preparo/preparo.module.css`
- Test: verificação visual; testes existentes verdes

**Interfaces:**
- Consumes: `Logo`, `AvatarThumb`, `looksFor`, tokens.

- [ ] **Step 1:** Início: estúdio da demo ao fundo (já é o `Stage bare`), título = `Logo size="lg" badge="AO VIVO · DEMO"`, subtítulo e os dois botões com os tokens.
- [ ] **Step 2:** `/config` e `/preparo`: cabeçalho com `Logo size="sm"`, títulos de seção em `--font-display` com sublinhado âmbar, painéis `--panel`; `SeatCard` com faixa lateral na cor do temperamento e `AvatarThumb` do assento (via `looksFor(config.seats)`), atualizando quando o temperamento muda.
- [ ] **Step 3:** `npx vitest run` + `tsc` + eslint dos arquivos tocados; curl `/`, `/config`, `/preparo` → 200; conferir no navegador.
- [ ] **Step 4:** Commit `feat(ui): telas com identidade do estúdio`.

### Task 11: Verificação ponta a ponta

- [ ] **Step 1:** No navegador (desktop ~1280×800 e 375×812): `/`, `/config`, `/preparo` (dossiê de teste em sessionStorage), `/mesa?replay=demo-1`. Checar: nada tampa o orador na câmera Diretor; GC, legenda, selo, "Pedindo a palavra" e barra não se sobrepõem (comparar `getBoundingClientRect` via JS — Review Focus 4); foco por teclado visível em todos os controles; contraste do texto sobre `--panel` ≥ 4.5:1.
- [ ] **Step 2:** Mesas de 3 e 9 lugares: gravar em `sessionStorage` um `mesa:config` de teste com 2 e depois 8 membros (provedor `groq`, modelo qualquer, sem chave) e abrir `/mesa`. O motor emite `debate_start` antes de falhar por falta de chave, então o estúdio é montado com 3 e 9 lugares; conferir na câmera Diretor (plano aberto) que todos os púlpitos aparecem sem sobreposição (Review Focus 2). Remover o `mesa:config` de teste do `sessionStorage` depois.
- [ ] **Step 3:** FPS: com a mesa de 9 lugares do Step 2 e `?debug` na URL, observar o `Stats` por 20 s e anotar a média (meta ~60 em desktop).
- [ ] **Step 4:** `npx vitest run`, `npx tsc --noEmit` — saídas no relatório.
