# Mesa de IAs — Design (v1)

**Data:** 2026-11-13
**Status:** aguardando revisão do autor
**Tipo:** projeto de portfólio, web, publicado por link

---

## 1. Visão e objetivo

Uma sala de reuniões 3D no navegador onde LLMs debatem um tema. Cada participante é uma LLM separada, com **temperamento** e **expertise** configuráveis, mediados por um **moderador ativo**. O visitante pode andar pela sala, olhar de vários ângulos e ver os participantes gesticulando e mudando de expressão conforme o debate.

**Para quem:** recrutadores e visitantes do portfólio (precisam ver algo funcionando em segundos) e o próprio autor (testa com provedores gratuitos).

**Sucesso da v1:**
- Um link público abre direto num debate de demonstração (replay, custo zero), sem configuração.
- Com chaves de provedores **gratuitos** (Groq, NVIDIA NIM etc.), é possível montar uma mesa de 2–8 membros e assistir um debate completo ao vivo até o veredito final.
- A cena roda a ~60 fps com 9 avatares num notebook comum.
- O debate não fica repetitivo: quem é citado ou discorda tende a responder; quem só concordaria tende a ficar quieto.

**Origem:** releitura visual de um projeto anterior feito com CrewAI. Esta versão é escrita do zero.

## 2. Roadmap e escopo

| Versão | Conteúdo |
|---|---|
| **v1 (esta spec)** | Mesa redonda única, 2–8 membros + moderador, modo **Livre**, moderador ativo, vontade de falar / mão levantada, temperamento + expertise (prontos, aleatórios, personalizados), catálogo de provedores com filtro "só gratuitos", cena 3D com 3 câmeras, skin "Terno", balão + transcrição, voz do navegador opcional, replay/download de debate |
| v2 — drama | Interrupções (explosivo com vontade muito alta corta o orador), modo **Pontuado** (moderador-juiz com placar em cena), gestos mais ricos por temperamento |
| v3 — escala | 20–30 membros, formatos **painel + plateia** e **bancadas**, otimizações de render |
| v4 — produção | Membros produzem um artefato (código, texto criativo) num quadro central e debatem sobre ele (proponha → critique → revise) |
| futuro | Skins adicionais escolhíveis no início (robôs, 2.5D sprites, humanoide), voz neural, "vontade de falar" via LLM |

**Fora da v1:** tudo nas linhas v2+; contas de usuário; banco de dados; salvar debates no servidor.

A arquitetura v1 deve permitir v2–v4 sem trocar contratos: novos comportamentos entram como novos tipos de evento e novas skins/componentes de cena.

## 3. Arquitetura

**Stack:** Next.js (App Router) + TypeScript, React Three Fiber + drei, SDK `openai` (apontado para endpoints OpenAI-compatíveis), Vitest. Deploy na Vercel (plano gratuito).

```
┌──────────────────── Navegador ────────────────────┐
│  Tela de Configuração ──► DebateConfig (JSON)     │
│                                │                  │
│  Cena 3D (R3F) ◄── EventPlayer ◄── stream SSE     │
│   ├─ Sala + Mesa                  ou replay.json  │
│   ├─ Skin "Terno"                                 │
│   ├─ Câmeras (livre / órbita / diretor)           │
│   └─ Balão + Transcrição + Voz (Web Speech)       │
└───────────────────────┬───────────────────────────┘
                        │ POST /api/debate (config + chaves)
┌───────────────────────▼──── Servidor (Next.js) ───┐
│  DebateEngine ──► Moderador (LLM)                 │
│       │       ──► Membro × N (LLM cada)           │
│       ▼                                           │
│  ProviderClient (adaptador OpenAI-compatível)     │
│  Catalog (GET /api/models)                        │
└───────────────────────────────────────────────────┘
```

### 3.1 Unidades

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `DebateConfig` (tipo) | Contrato entre UI e motor: tema, idioma, limite de turnos, moderador `{provedor, modelo, provocação}`, assentos `[{id, nome, provedor, modelo, temperamento, expertise}]` | — |
| `DebateEngine` | Executa o debate e emite uma sequência de `DebateEvent`. Não conhece 3D. | `ProviderClient`, presets |
| `ProviderClient` | `chat(provedor, modelo, mensagens, chave) → AsyncIterable<string>` com streaming. Único ponto que conhece URLs. | SDK `openai` |
| `Catalog` | Lista modelos de cada provedor (`/models`) e marca `gratuito: boolean` pela regra do provedor. Cache em memória de 10 min. | `ProviderClient` |
| `EventPlayer` (cliente) | Consome eventos de SSE ou de um `replay.json` pela mesma interface; controla pausa e velocidade. | — |
| `Skin` | Interface: recebe `(memberId, DebateEvent)` e anima o avatar. v1 tem só `terno`. | R3F |

### 3.2 Eventos (`DebateEvent`)

União tipada, todos com `t` (ms desde o início) e `seq`:

- `debate_start { config sem chaves }`
- `turn_start { speaker, addressedTo? }` — `speaker` pode ser `"moderador"`
- `token { speaker, text }`
- `turn_end { speaker, fullText }`
- `emotion { member, emotion }`
- `gesture { member, gesture }`
- `stance { member, value }` (−1..+1)
- `hands { queue: [{member, urge, reason}] }`
- `status { member, state: "pensando" | "sem_sinal" | "ok" }`
- `summary_update { text }`
- `debate_end { summary, consensus[], openPoints[], verdict }`
- `error { message }`

Um replay é `{ version: 1, events: DebateEvent[] }`. Gravar = acumular os eventos recebidos no cliente.

### 3.3 Provedores

- Adaptador único OpenAI-compatível (`baseURL` por provedor). v1 suporta: **Groq, NVIDIA NIM, OpenRouter, Google AI Studio (endpoint OpenAI-compatível), Mistral, Cerebras**.
- Regras de "gratuito" ficam numa tabela por provedor (ex.: OpenRouter → id termina em `:free`; Groq/NVIDIA → todo o catálogo do plano free). A tabela é dado, não código espalhado.
- Cada provedor tem `minIntervalMs` configurável para respeitar limites gratuitos.
- As chamadas sempre passam pelo servidor (resolve CORS de provedores como NVIDIA).

### 3.4 Chaves

- O visitante cola as chaves na tela de configuração; ficam em `sessionStorage` e vão no corpo do `POST /api/debate`.
- O servidor **nunca persiste nem loga chaves**; o evento `debate_start` não as contém.
- Uso local: se o corpo não trouxer chave, o servidor usa `.env.local` (`GROQ_API_KEY`, etc.).

## 4. Dinâmica do debate

### 4.1 Ciclo

1. **Moderador decide.** Recebe tema, resumo, últimas 6 falas, contagem de falas por membro e a fila de mãos levantadas. Responde JSON:
   `{ "acao": "passar_palavra" | "provocar" | "encerrar", "para": "<memberId>", "fala": "<texto>" }`
   A `fala` é emitida como turno do moderador (avatar na cabeceira).
2. **Membro fala.** Prompt de sistema em camadas: regras do debate + expertise + temperamento. Recebe tema, resumo, últimas 6 falas e a pergunta do moderador.
3. **Tag de abertura** na resposta: `[emoção|gesto|alvo:<memberId|ninguem>|posição:<-1..1>] texto…`
   O motor remove a tag e emite `emotion`, `gesture`, `stance`. Campos ausentes ou inválidos → padrões do temperamento; posição anterior mantida.
4. **Vontade de falar** recalculada (4.2) → evento `hands`.
5. A cada 5 turnos de membros, o moderador atualiza o resumo (`summary_update`).
6. Fim quando atingir o limite de turnos **de membros** (falas do moderador não contam; padrão 20, faixa 6–60) ou `acao: "encerrar"`. O moderador gera `debate_end`.

Regras do prompt de membro: até ~80 palavras, responder diretamente a quem o citou, não repetir argumento já feito, manter-se no idioma escolhido.

### 4.2 Vontade de falar (sem chamada de LLM)

Para cada ouvinte `m` após a fala de `s`:

```
urge(m) = 1.0 se alvo == m
        + 0.5 * |posição(m) − posição(s)| / 2
        + impulsividade(temperamento(m))          // −0.2 .. +0.3
        − 0.4 se m falou nos últimos 2 turnos
        − 0.3 se |posição(m) − posição(s)| < 0.2 e alvo != m
```

Valor limitado a [0, 1.5]. Quem passar de **0.6** levanta a mão em cena. A fila (ordenada, com motivo legível) vai ao moderador, que normalmente escolhe o topo mas pode ignorá-la para provocar alguém calado. Nível de provocação alto → maior chance de `provocar`.

Constantes ficam num único arquivo para ajuste fino.

### 4.3 Presets

Cada **temperamento**: `{ id, nome, promptSnippet, corGravata, emocaoPadrao, gestosFavoritos[], impulsividade }`.
v1: explosivo, conservador, inovador, cético, conciliador, sarcástico, otimista, pessimista, pragmático, idealista.

Cada **expertise**: `{ id, nome, promptSnippet, acessorio }`.
v1: cientista, empresário, marketing, engenheiro, filósofo, economista, advogado, médico, artista, político.

**Personalizado:** texto livre substitui o `promptSnippet`; o restante usa um preset neutro (gravata cinza, impulsividade 0).
**Aleatorizar:** sorteia temperamento e expertise para todos os assentos (evitando repetir combinação enquanto houver opções).

Emoções v1: neutro, feliz, raiva, dúvida, surpresa, tristeza, desdém, pensativo.
Gestos v1: bater_na_mesa, apontar, bracos_cruzados, mao_levantada, maos_no_bolso, balancar_cabeca, dar_de_ombros, inclinar_para_frente.

### 4.4 Erros e limites

- HTTP 429 / timeout: espera com backoff exponencial (1s, 2s, 4s), evento `status: pensando`.
- 3 falhas seguidas de um membro: `status: sem_sinal` (rosto com estática), turno pulado, moderador segue; tenta de novo nos turnos seguintes.
- Moderador falha 3 vezes: fallback para rodízio pelo topo da fila de mãos (ou ordem dos assentos).
- JSON inválido do moderador: uma nova tentativa pedindo só JSON; depois, fallback de rodízio.
- Chave inválida (401) no primeiro uso: `error` com qual provedor falhou; debate não começa.

## 5. Cena 3D

- **Sala:** chão, paredes baixas, luz quente sobre a mesa, fundo escuro texturizado. Toon shading + contorno preto (estilo da referência: figura de terno com cabeça-esfera branca).
- **Mesa redonda;** assentos distribuídos em círculo; moderador na cabeceira (gravata branca, martelo).
- **Câmeras** (tecla `C` alterna):
  - *Livre:* WASD + mouse (pointer lock).
  - *Órbita:* rotação/zoom em torno da mesa.
  - *Diretor:* corta para o orador, plano aberto no moderador, close em gestos fortes. Padrão no replay.
- **Avatar "Terno":** primitivas (esfera, cápsulas, caixa). Rosto em `CanvasTexture` redesenhado por emoção; piscar automático; boca anima com tokens ou com a voz. Gestos = poses-chave interpoladas em ombro/cotovelo/cabeça/tronco, sem esqueleto. Idle com respiração. Gravata = cor do temperamento; acessório = expertise.
- **Reações locais dos ouvintes:** citado vira para o orador; posição oposta → braços cruzados; próxima → balança a cabeça; mão levantada se urge ≥ 0.6.
- **Texto:** balão sobre o orador preenchido em streaming; painel de transcrição lateral recolhível (nome, temperamento, expertise, modelo).
- **Voz:** botão liga/desliga; Web Speech API, voz/tom distintos por membro; com voz ligada o próximo turno aguarda o fim da fala.
- **HUD:** tema, turno X/Y, fila de mãos, pausar, velocidade (1×/1.5×/2×), encerrar. Hover num avatar mostra cartão com modelo, provedor, temperamento, expertise e barra de posição.

## 6. Telas e fluxo

```
Início ──► [Assistir demo]  ──► Cena (replay.json)
   └────► [Montar minha mesa] ──► Configuração ──► Cena ao vivo ──► Fim (resumo + veredito + Baixar .json)
```

- **Início:** título, demo rodando ao fundo, dois botões.
- **Configuração:** Debate (tema com sugestões, idioma, limite de turnos) · Moderador (modelo, provocação baixa/média/alta) · Assentos (2–8; cartão por assento com nome (gerado automaticamente a partir de uma lista, editável), provedor/modelo, temperamento, expertise; botões "Só gratuitos", "Aleatorizar personalidades", "Mesmo modelo para todos") · Chaves (um campo por provedor usado, com link "onde conseguir grátis"). "Começar" desabilitado enquanto faltar chave.
- **Fim:** painel com resumo, consensos, pontos em aberto, veredito; botão baixar replay.
- Os replays de demo do site são debates reais gravados pelo autor e colocados em `src/replays/`.

## 7. Estrutura

```
src/
  app/            páginas (início, config, mesa) + api/debate, api/models
  engine/         DebateEngine, moderador, prompts, tags, urge
  providers/      ProviderClient, catálogo, tabela de provedores
  presets/        temperamentos.ts, expertises.ts
  scene/          Sala, Mesa, Câmeras, HUD, Transcrição
  skins/terno/    Avatar, rosto (canvas), gestos
  replays/        demo-*.json
```

## 8. Testes

Vitest, só onde há lógica:
- `DebateEngine` com provedor falso roteirizado: sequência de eventos, extração de tag, fallback sem tag, `sem_sinal` após 3 falhas, fallback de rodízio do moderador, encerramento por limite.
- `urge`: citado > discordante > concordante; penalidade de quem falou recentemente; limiar 0.6.
- Parser de tag: casos válidos, parciais e lixo.
- Catálogo: regra de "gratuito" por provedor com respostas `/models` fixas.
- Cena: verificação manual tocando um replay fixo.

## 9. Riscos a validar no início da implementação

1. **Duração de função na Vercel (plano grátis):** um debate de 20 turnos numa única conexão SSE pode exceder o limite. Mitigação planejada: endpoint por turno (`POST /api/debate/turn` com o estado serializado), cliente orquestra o loop. Decidir após medir.
2. **CORS e compatibilidade OpenAI** de cada provedor da lista (especialmente endpoints `/models` e streaming): validar com uma chamada real por provedor.
3. **Limites gratuitos atuais:** conferir na documentação oficial de cada provedor e ajustar `minIntervalMs`.
4. **Modelos pequenos ignorando a tag/JSON:** medir taxa de acerto com os modelos gratuitos e ajustar prompts; fallbacks já previstos.
