# Mesa de IAs — Estúdio de TV (reformulação visual) — Design

**Data:** 2026-11-15
**Status:** aguardando revisão do autor
**Base:** v1 (`2026-11-13-mesa-de-ias-design.md`) + pesquisa pré-debate (`2026-11-14-pesquisa-pre-debate-design.md`)

---

## 1. Problema e objetivo

A cena atual é escura e pouco apresentável: luz ambiente azulada + um ponto laranja deixam a sala quase preta; avatares são cabeças-esfera carecas sobre corpos pretos; a mesa é um disco liso; o avatar de costas tampa metade da tela; o balão de fala cai sobre a transcrição; o FPS aparece no canto.

**Objetivo:** transformar o app inteiro num **programa de debate de TV**: estúdio com púlpitos em semicírculo, telão, LEDs e luz de estúdio; avatares procedurais estilizados e variados; câmera com cortes de TV; legenda de TV (GC) e legenda de fala; telas com a mesma identidade.

**Sucesso:**
- Na câmera Diretor nenhum avatar tampa outro nem o orador; o orador está sempre iluminado e legível.
- Cada membro é reconhecível (cabelo, pele, paletó, cor do temperamento) e o mesmo assento gera sempre a mesma aparência.
- Fala, boca e legenda continuam sincronizadas (relógio de fala existente).
- ~60 fps com 9 avatares num notebook comum (desktop, câmera Diretor).
- Contraste AA em todo texto; navegável por teclado; `prefers-reduced-motion` respeitado.
- Funciona em largura de celular (≥ 360 px).

**Decisões do autor:** direção "estúdio de TV"; avatares procedurais (sem modelos .glb); entram telão, GC e cortes de câmera; **sem pós-processamento** (sem nova dependência 3D); escopo = app inteiro; abordagem = substituir o visual atual (sem manter o antigo como opção).

## 2. Contratos que não mudam

- Interface `Skin` (`src/skins/types.ts`) e as props do avatar (`seat`, `view`, `isSpeaker`, `speakerPos`, `addressed`, `speakerStance`).
- Poses e gestos (`poses.ts`), reações de ouvinte (`reactions.ts`), emoções (`Emotion`), relógio de fala (`src/voice/speech.ts`: `bubbleText`, `mouthOpen`).
- Eventos (`DebateEvent`), `sceneReducer` (exceto o que §6 pede), motor e pesquisa.
- `seatPositions(n, radius)` mantém o formato de retorno `{ position, rotationY }[]`, índice 0 = moderador.

## 3. Estúdio e luz

### 3.1 Disposição
- `seatPositions` passa a distribuir os **membros num arco de ~200°** aberto para a câmera (+Z), todos voltados para o centro do arco; o **moderador** fica no centro, ao fundo (−Z), voltado para +Z. O raio do arco cresce com `n` (2–8 membros) para manter ≥ 1,1 m entre púlpitos.
- Cada membro fica num **púlpito**; o moderador numa **bancada** central. Púlpito e bancada escondem as pernas (o avatar não precisa mais de pernas visíveis abaixo do tampo).

### 3.2 Cenário (`src/scene/Studio.tsx`, substitui `Room.tsx` e `Table.tsx`)
- **Piso** escuro acetinado (`MeshStandardMaterial`, roughness ~0.35) com **anel de LED** emissivo em volta da área do debate.
- **Fundo curvo** de painéis com faixas de LED emissivas azul e âmbar.
- **Telão** atrás do moderador: plano com `CanvasTexture` mostrando tema (quebrado em até 2 linhas), "Turno X/Y", nome de quem fala e relógio do programa (mm:ss desde o início). Redesenho só quando um desses valores muda (relógio: 1×/s).
- **Púlpito** de cada membro: faixa de LED frontal na **cor do temperamento** (`corGravata`) e plaquinha com o nome (textura em canvas). Bancada do moderador em âmbar.
- Limites da câmera Livre continuam derivados do tamanho do estúdio (substitui `roomSize`).

### 3.3 Luz e materiais
- Sai `MeshToonMaterial` + `Outlines`; entram materiais físicos (`MeshStandardMaterial`).
- Luzes: `hemisphereLight` (céu azul-marinho / chão escuro), key light quente, fill frio, contraluz azul.
- **Spot no orador**: um `SpotLight` acompanha o orador atual (transição suave ~0,4 s); a key light geral cai levemente quando há orador.
- `ContactShadows` (drei) sob púlpitos e bancada; sem sombras dinâmicas.
- Paleta da cena: fundo `#0b1426`, LED azul `#3aa0ff`, âmbar `#ffb23e`.

## 4. Avatar (skin "terno" redesenhada)

### 4.1 Aparência determinística — `lookOf(seat): Look` (`src/skins/terno/look.ts`, pura)
- Hash estável do `seat.id` escolhe: tom de pele (6), estilo de cabelo (5: curto, repartido, coque, cacheado, careca com barba), cor de cabelo (5), cor do paletó (5: grafite, azul-marinho, vinho, oliva, bege).
- Camisa branca; **gravata na cor do temperamento** (como hoje).
- Assentos de uma mesma mesa não repetem a combinação (pele, cabelo, paletó) enquanto houver combinações livres — `lookOf` recebe também o índice/ids da mesa, ou existe `looksFor(seats)` que resolve colisões de forma determinística.
- Moderador: aparência fixa (cabelo grisalho, óculos, paletó escuro).

### 4.2 Corpo
- Proporção estilizada (cabeça ~1,3× a proporção real), pescoço, ombros arredondados, tronco afinando (lathe/cápsulas), **lapelas** no paletó, **mãos** no tom de pele com polegar.
- Acessórios de expertise mantidos e redesenhados no estilo novo.
- Juntas de pose inalteradas (`cabeca`, `tronco`, `ombroE/D`, `cotoveloE/D`) para que `POSES` continue válido; ajustar comprimentos só o necessário para os gestos (bater na mesa → tampo do púlpito; mão levantada visível).

### 4.3 Rosto (`face.ts`)
- Continua em `CanvasTexture`, agora com fundo no tom de pele do `Look`.
- Olhos com esclera, íris, brilho e pálpebra no piscar; **sobrancelhas sempre visíveis** e movidas pela emoção; boca com lábios; aberta (3 níveis do relógio de fala) mostra interior e dentes.
- Estado offline (`sem_sinal`) mantém o chuvisco.

### 4.4 Vida em cena
- Respiração sutil (tronco/ombros).
- **Todos os ouvintes olham para o orador** (cabeça, limitado a ±1,1 rad); o citado também gira o tronco levemente.
- Boca: inalterada (`mouthOpen` do relógio de fala).

## 5. Câmera, GC e camadas

### 5.1 Câmera Diretor com cortes
- Função pura `shotFor(input): Shot` (`src/scene/shots.ts`) onde `input = { speaker?, addressedTo?, speaking: boolean, progress: number, reactionSince?: number, now, reducedMotion }` — `speaking`/`progress` (0..1 = caracteres já ditos ÷ total) vêm do relógio de fala — e `Shot = { kind: 'aberto' | 'close' | 'reacao'; target?: string }`:
  - sem orador, ou orador ainda pensando (`speaking` falso) → `aberto`;
  - orador falando → `close` no orador;
  - se há `addressedTo` e `progress` acabou de passar de 0,4 → `reacao` no citado por 1,5 s (`reactionSince`), uma vez por turno, depois volta ao `close`;
  - `reducedMotion` → só `aberto` e `close`, sem reação.
- Cortes são **secos** (posição muda no frame); durante `close`, aproximação lenta (push-in) exceto com `reducedMotion`.
- Enquadramentos: `aberto` mostra todo o arco + telão; `close` enquadra cabeça e ombros do alvo a partir de uma posição à frente-lateral; `reacao` idem para o citado.
- Câmeras Órbita e Livre inalteradas (exceto limites do estúdio).

### 5.2 GC (legenda de TV) — `src/scene/LowerThird.tsx`
- DOM sobre o canvas, canto inferior esquerdo, desliza ao `turn_start`: **nome**; "Temperamento · Expertise"; menor: "modelo (Provedor)". Barra lateral na cor do membro; moderador → "Moderador".
- Some após o fim da fala; sem animação com `reducedMotion`.

### 5.3 Legenda de fala (closed caption) — substitui o balão
- Faixa central inferior (acima da barra de controles), até 2 linhas visíveis, texto revelado pelo relógio de fala (`bubbleText`), "…" enquanto pensa, "🔎 pesquisando: <q>" durante busca (`scene.searching`).
- Removidos `SpeechBubble`/`BubbleAnchor` e a projeção 3D→2D.

### 5.4 HUD
- **Selo do programa** (canto superior esquerdo): logo "MESA DE IAs", ponto vermelho "AO VIVO" (no replay: "REPRISE"), "Turno X/Y". Tema fica no telão.
- **"Pedindo a palavra"** (canto superior direito): fila de mãos levantadas, compacta.
- **Barra de controles**: pílula translúcida central inferior; some após 3 s sem movimento do mouse; reaparece com movimento, toque ou foco do teclado; nunca some com foco dentro dela.
- Botão "Fontes" e painel (já existentes) restilizados.
- **FPS (`Stats`) só com `?debug`** na URL.
- Cartão do membro ao passar o mouse: estilo novo, com mini-avatar.

### 5.5 Transcrição e fim
- Transcrição: gaveta lateral fechada por padrão; nome de cada fala na cor do membro.
- `EndPanel`: tela de encerramento do programa (logo, resumo, consensos, pontos em aberto, veredito, fontes, botões).

## 6. Identidade das telas

- **Tokens** em `globals.css` (substituem a paleta petróleo): `--bg #0b1426`, `--panel #111d33` (translúcido onde sobre a cena), `--line`, `--fg`, `--muted`, `--accent #ffb23e`, `--accent-2`, `--led #3aa0ff`, `--live #ff3b47`, `--danger`. HUD, transcrição, GC, legenda e EndPanel passam a CSS modules usando esses tokens (fim dos estilos inline espalhados).
- **Tipografia**: títulos em **Barlow Condensed** (via `next/font/google`, sem nova dependência npm) — logo, títulos de seção, GC, telão; corpo em Geist.
- **Marca**: logotipo "MESA DE IAs" condensado + selo "AO VIVO"; `Mascote` redesenhado no estilo do avatar novo.
- **Início**: estúdio da demo ao fundo; título como vinheta do programa, selo "AO VIVO · DEMO", dois botões.
- **`/config` e `/preparo`**: mesma estrutura, tema novo; títulos de seção condensados com sublinhado âmbar; **cartão de assento** com faixa na cor do temperamento e **miniatura do avatar** (SVG 2D a partir de `lookOf`).
- **Responsivo** (≥ 360 px): GC e legenda reduzidos; barra de controles em duas linhas se preciso; transcrição vira folha inferior.
- **Acessibilidade**: contraste AA; foco âmbar visível; `prefers-reduced-motion` desliga deslizes do GC, push-in e cortes de reação; controles com rótulos.

## 7. Desempenho

- Meta: ~60 fps com 9 avatares (câmera Diretor, desktop comum). Remoção de `Outlines` corta draw calls; materiais compartilhados por cor; geometrias reutilizadas entre avatares; texturas de canvas (rosto ≤ 12 Hz, telão ≤ 1 Hz, plaquinhas estáticas).
- `dpr` máximo 2 mantido.

## 8. Testes e verificação

- **Unitários (Vitest)**: `lookOf`/`looksFor` (determinismo; sem repetição numa mesa de 9 enquanto possível; moderador fixo); `seatPositions` (arco: todos com z ≥ posição do moderador, espaçamento mínimo, simetria, voltados para o centro); `shotFor` (aberto/close/reação/reducedMotion); `drawFace` (sobrancelhas em todas as emoções; 3 aberturas de boca; offline).
- Os testes existentes de poses, reações, cena e relógio de fala continuam verdes.
- **Visual (navegador)**: início, `/config`, `/preparo`, `/mesa?replay=demo-1` em desktop e 375 px; checar sobreposição de camadas, contraste, foco por teclado, cortes da câmera, GC/legenda sincronizados com a fala; medir fps com 9 avatares (8 membros + moderador).

## 9. Fora de escopo
- Pós-processamento (bloom, DOF, vinheta 3D).
- Modelos .glb, rigging, lip-sync por fonemas.
- Plateia, vinhetas sonoras/música.
- Manter o visual antigo como skin alternativa.
