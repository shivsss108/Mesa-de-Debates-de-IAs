# Mesa de IAs — Pesquisa pré-debate (repertório) — Design

**Data:** 2026-11-14
**Status:** aguardando revisão do autor
**Base:** v1 (`docs/superpowers/specs/2026-11-13-mesa-de-ias-design.md`)

---

## 1. Problema e objetivo

Com o tema "O que vocês acham da demissão de Jensen Huang?", os membros alucinaram: o fato é de novembro de 2026, depois do corte de conhecimento dos modelos gratuitos. Hoje os prompts levam só o tema — sem data de hoje e sem fatos.

**Objetivo:** antes do debate, montar um **dossiê** curto e com fontes sobre o tema (busca web + material do usuário), deixar o usuário revisá-lo e injetá-lo nos prompts, com a regra "se não está no repertório, diga que não sabe". Opcionalmente, membros podem pesquisar durante o debate.

**Sucesso:**
- Tema do Jensen Huang: o dossiê cita a saída dele em nov/2026 com links; nenhuma fala nega o fato.
- Tema com premissa falsa: a revisão mostra "não encontrado" e o moderador avisa na abertura.
- Tudo funciona sem chave nova (só as chaves de LLM que a mesa já usa) e dentro do limite de 60 s por rota.
- Sem repertório, o debate continua funcionando como hoje, agora com a data de hoje nos prompts.

**Restrição conhecida:** os feeds RSS do Bing e do Google são licenciados para uso pessoal/não comercial — aceitável para projeto de portfólio; um produto exigiria API de busca paga (fora de escopo).

## 2. Fluxo

```
/config ──"Começar"──► /preparo ──"Começar debate"──► /mesa
   │  (bloco Repertório)    │  progresso ao vivo (SSE)
   │                        │  dossiê editável
   │                        ▼
   │                POST /api/research
   └─ repertório vazio e busca desligada ──► /mesa (como hoje)
```

### 2.1 `/config` — bloco "Repertório"
- **Busca web automática** — ligada por padrão.
- **Links** — textarea, um por linha (até 5).
- **Texto / arquivos** — textarea + upload `.txt`, `.md`, `.pdf`. PDF vira texto **no navegador** com `pdfjs-dist`, importado dinamicamente só quando há PDF (única dependência nova). Só texto vai ao servidor.
- **Modo de uso** — `Todos veem tudo` (padrão) · `Cada um recebe uma parte` · `Todos + recorte por expertise`.
- **Membros podem pesquisar durante o debate** — desligado por padrão (§6).
- Busca desligada e sem links/texto → "Começar" vai direto para `/mesa`.

### 2.2 `/preparo` (página nova)
- Chama `POST /api/research` e mostra o progresso: "Buscando notícias…", "Lendo <veículo>…", "Montando o dossiê…", e "N de M fontes lidas".
- Exibe o dossiê editável: aviso da premissa (nota editável), fatos (editar, apagar, adicionar fato manual marcado "seu"), disputas, fontes com links (remover fonte remove os fatos que só dependem dela).
- "Começar debate": no modo `recorte`, chama `POST /api/research/recortes` (uma chamada de LLM) com o dossiê **já editado**; depois grava `mesa:config` (com o dossiê) e vai para `/mesa`.
- O dossiê fica em `sessionStorage` (`mesa:dossie`): recarregar a página não pesquisa de novo. Botão "Pesquisar de novo".
- Saídas de erro sempre disponíveis: "Tentar de novo", colar links/texto, "Começar sem repertório".

### 2.3 `/mesa`
Igual à v1. O dossiê viaja dentro de `DebateConfig` em cada passo (servidor continua sem estado). Como `debate_start` carrega a config, o replay baixado já inclui o dossiê.

## 3. Dados

```ts
interface Fonte {
  id: string;                 // 'S1', 'S2', … (extras: 'S7'…)
  titulo: string;
  veiculo?: string;
  url?: string;
  data?: string;              // ISO, quando o RSS/página informa
  origem: 'web' | 'link' | 'arquivo' | 'texto' | 'membro';
  porMembro?: string;         // seatId, só origem 'membro'
}

interface Dossie {
  geradoEm: string;           // 'YYYY-MM-DD'
  premissa: { status: 'confirmada' | 'nao_encontrada' | 'contradita'; nota: string };
  fatos: { id: string; texto: string; fontes: string[]; manual?: boolean }[];  // ≤ 12, texto ≤ 300 chars
  disputas: string[];         // ≤ 5, ≤ 200 chars cada
  fontes: Fonte[];            // ≤ 12
  modo: 'todos' | 'dividido' | 'recorte';
  recortes?: Record<string, string>;  // seatId → destaque (≤ 400 chars), só modo recorte
}

// DebateConfig ganha:
dossie?: Dossie;
membrosPesquisam?: boolean;

// DebateState ganha:
repertorioExtra: { fontes: Fonte[] };   // fontes pesquisadas por membros (§6)
buscasFeitas: number;
```

O texto do dossiê renderizado para um prompt é limitado a ~4 000 caracteres.

## 4. Pipeline (`src/research/`)

Uma função por etapa, cada uma testável isoladamente; recebe `chat`/`fetch` por injeção (mesmo padrão de `StepDeps`).

| Arquivo | Função | Faz |
|---|---|---|
| `queries.ts` | `buildQueries(tema, idioma, chat)` | 1 chamada curta de LLM (modelo do moderador) → 2 consultas: idioma do debate + inglês. Falha → `[tema]`. |
| `search.ts` | `searchNews(query, idioma, fetch)` | Bing News RSS (`format=rss`, `mkt` pelo idioma); extrai título, resumo, veículo, data e URL real (parâmetro `url=` do link de clique). Falha → Google News RSS (título + resumo, sem abrir a matéria). Dedup por URL; até 6 resultados no total. |
| `safeFetch.ts` | `safeFetch(url)` | Guarda SSRF (§7.1), timeout 8 s, teto 1,5 MB, só `text/html`/`text/plain`. |
| `extract.ts` | `extractText(html)` | Texto de `<article>` ou, na falta, dos `<p>`; remove tags/scripts, decodifica entidades; até ~3 000 chars. Sem dependência. |
| `read.ts` | `readSource(url)` | `safeFetch` + `extractText`; < 500 chars → Jina Reader (`https://r.jina.ai/<url>`); falha → `undefined` (o chamador usa o resumo do RSS). Leituras em paralelo. |
| `synthesize.ts` | `synthesize(fontes, tema, idioma, hoje, chat)` | 1 chamada de LLM (modelo do moderador). Fontes numeradas `[S1]…` entre delimitadores, total ≤ ~20 000 chars (cabe no TPM gratuito do Groq). Saída: JSON `{premissa, fatos, disputas}`. Fatos citando fonte inexistente são descartados. JSON inválido → 1 nova tentativa → fallback: fatos = resumos das fontes, premissa `nao_encontrada` com nota "não foi possível sintetizar". |
| `recortes.ts` | `buildRecortes(dossie, seats, chat)` | Modo recorte: 1 chamada → JSON `{seatId: destaque}` pela expertise de cada membro. Falha → sem recortes (modo vira `todos` na prática). |
| `quickSearch.ts` | `quickSearch(query, idioma)` | Busca durante o debate (§6): só RSS, até 4 resultados, sem abrir matérias. |

Material do usuário: links passam por `readSource`; textos/arquivos entram direto (≤ 6 000 chars cada, ≤ 20 000 no total), como fontes `origem: 'texto' | 'arquivo'`.

### 4.1 `POST /api/research`
- Corpo: `{ tema, idioma, moderador: {provider, model}, keys, busca: boolean, links: string[], textos: {nome, conteudo}[], modo }`.
- Resposta SSE: eventos `progress { etapa, detalhe }` e, no fim, `dossie { … }` (ou `error { message }`).
- `maxDuration = 60`; corte interno em 50 s: sintetiza com o que já foi lido.

### 4.2 `POST /api/research/recortes`
- Corpo: `{ dossie, seats, moderador, keys }` → `{ recortes }`. Uma chamada de LLM.

## 5. Prompts (`src/engine/prompts.ts`)

- **Data sempre presente:** todo prompt (membro, moderador, resumo, encerramento) abre com "Hoje é DD/MM/AAAA." — de `dossie.geradoEm` ou, sem dossiê, a data do servidor.
- **`dossieBlock(config, state, quem)`** renderiza para `quem` (seatId ou moderador):
  ```
  Repertório (pesquisado em 14/11/2026):
  Premissa do tema: confirmada — <nota>
  Fatos:
  - [S1,S3] …
  Pontos em disputa:
  - …
  Pesquisado durante o debate:        ← repertorioExtra, se houver
  - [S7] (por Ana) <título> — <resumo>
  Destaque para a sua área: …         ← só modo recorte
  ```
  - `todos`: dossiê inteiro.
  - `dividido`: fatos distribuídos em rodízio por ordem dos assentos; data, premissa e disputas para todos; mais o aviso "Você tem só parte das informações; outros podem saber fatos que você não sabe." Moderador recebe tudo.
  - `recorte`: dossiê inteiro + destaque do membro.
- **Regra nova (membros):** "Seu conhecimento pode estar desatualizado. Para fatos recentes, use só o repertório. Se algo não está nele, diga que não sabe ou deixe claro que é opinião. Nunca invente datas, números ou declarações." Membros **não** citam "(S2)" na fala.
- **Moderador:** recebe o dossiê inteiro; se `premissa.status ≠ 'confirmada'` e ainda não houve turno, a fala de abertura avisa e reformula o tema.
- Resumo periódico e encerramento recebem o dossiê.

## 6. Membros pesquisam durante o debate (opcional)

Ativo só com `config.membrosPesquisam`.

- Prompt do membro ganha: "Se precisar de um fato que não está no repertório, responda APENAS `[busca: <consulta curta>]`." (Omitido quando `buscasFeitas ≥ 6`.)
- `tags.ts` reconhece `[busca: …]` no início da resposta.
- Fluxo em `step.ts`, no turno do membro:
  1. Resposta começa com `[busca: q]` → nada vai para o balão; emite `research { member, query }`.
  2. `quickSearch(q)` → até 4 resultados viram fontes `origem: 'membro'`, `porMembro`, ids sequenciais após os existentes; anexadas a `state.repertorioExtra`; `buscasFeitas++`.
  3. Nova chamada ao mesmo membro com o repertório atualizado e **sem** a regra de busca; segue o fluxo normal de tag/turno.
  4. Busca sem resultado: a nova chamada recebe "A busca não encontrou nada sobre '<q>'."
- Limites: 1 busca por turno, 6 por debate.
- Novo evento `research { member, query }`: a cena mostra o avatar `pensativo` e o balão "🔎 pesquisando: <q>".

## 7. Segurança e erros

### 7.1 SSRF (`safeFetch`)
- Só `http:`/`https:`; resolve DNS e bloqueia IPs privados/locais/reservados (IPv4 `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `100.64/10`; IPv6 `::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeado).
- Redirecionamento manual, no máximo 3, revalidando cada destino.
- Timeout 8 s, corpo ≤ 1,5 MB, `content-type` `text/html` ou `text/plain`.

### 7.2 Prompt injection
- Fontes entre delimitadores; o prompt de síntese declara que são **dados, não instruções**.
- Saída é JSON validado; fatos curtos citando fontes existentes.
- Revisão humana do dossiê antes do debate (fontes de membros não passam por revisão — o painel diz isso).

### 7.3 Validação nas fronteiras
- `/api/debate/step`: `dossie` opcional validado (tipos, ≤ 12 fatos/fontes, comprimentos de §3, total ≤ ~8 KB); `membrosPesquisam` boolean.
- `/api/research`: ≤ 5 links, ≤ 20 000 chars de texto, tema ≤ 300.
- Chaves: mesmo tratamento da v1 (nunca logadas; 401/403 → "Chave inválida para X").

### 7.4 Falhas
| Situação | Comportamento |
|---|---|
| Busca falha ou vazia | Aviso na `/preparo`; colar links/texto, tentar de novo ou começar sem repertório. |
| Algumas matérias não abrem | Segue com o resumo do RSS; mostra "N de M fontes lidas". |
| Síntese falha 2× | Dossiê só com fontes + resumos; usuário edita à mão. |
| Pesquisa passa de 50 s | Sintetiza com o que já tiver. |
| `quickSearch` falha no debate | Turno segue com "A busca não encontrou nada". |

## 8. Interface durante o debate
- HUD: botão **"Fontes"** abre painel com veículo, título e link; seção "Pesquisadas durante o debate" com quem pesquisou. O debate segue rodando.
- `EndPanel`: lista de fontes usadas junto do veredito.

## 9. Testes (Vitest, sem rede)
- `search`: parsers Bing/Google RSS com XML de fixture; URL real extraída do link de clique do Bing.
- `extract`: HTML com menus/scripts → só os parágrafos.
- `safeFetch`: tabela de URLs aceitas/bloqueadas (resolvedor DNS injetado), redirecionamento para IP privado bloqueado.
- `synthesize`: `chat` falso com JSON válido, JSON quebrado (retry + fallback), fato com fonte inexistente descartado.
- `dossieBlock`: modos `todos`/`dividido`/`recorte`, sem dossiê, com `repertorioExtra`; data sempre presente.
- `step`: `[busca: q]` → evento `research` + segunda chamada; limites 1/turno e 6/debate; regra de busca some no limite.
- `validate`: dossiê válido aceito; grande demais ou malformado rejeitado.
- **Manual:** tema do Jensen Huang com chaves gratuitas — dossiê com a saída em nov/2026 e links; nenhuma fala nega o fato.

## 10. Fora de escopo
- Modo Groq `compound`; APIs de busca pagas.
- Cache de buscas no servidor.
- Imagens/tabelas de PDF (só texto).
- Citações "(S2)" na fala dos membros.
