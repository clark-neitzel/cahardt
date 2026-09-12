# Avaliação de Design — CA-Hardt
Consultoria de design · leitura de código, sem alteração de arquivos · 12/09/2026

---

## 1. Diagnóstico geral (10 linhas)

1. O sistema *funciona*, mas ainda parece "vários apps costurados": 164 telas em `frontend/src/pages`, escritas por gerações diferentes de código, sem um componente de topbar/card único — cada tela reconstrói o cabeçalho à mão.
2. `frontend/src/index.css` (linhas 79-133) resolve a cor (azul→verde) via *remapeamento CSS global*, não trocando as classes no código-fonte — o app parece Starbucks, mas o código por baixo continua "Conta Azul azul". Isso é dívida técnica visual: qualquer classe fora da lista mapeada (ex. `rounded-xl` em botão) escapa do padrão.
3. Prova disso: `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx:78-81` e `frontend/src/pages/Financeiro/ContasReceberTabela.jsx:907-916` têm botões primários em `rounded-md`/`rounded-xl`, não pílula — a regra "botão sempre pílula" do DESIGN.md só vale para `.rounded`/`.rounded-md` no CSS de remapeamento (`index.css:132-133`), não para `rounded-xl`/`rounded-lg`, então parte dos botões do sistema já nasce fora do padrão.
4. A queixa histórica de "letra fina" não foi eliminada, só amenizada: `text-gray-400` aparece **1148 vezes em 137 arquivos** de `frontend/src/pages` — incluindo em conteúdo lido pelo usuário (estados vazios como `Pedidos/ListaPedidos.jsx:1286` "Nenhum pedido encontrado…", `Financeiro/*`, legendas de dado como `Veiculos/VeiculoFicha.jsx:923`), abaixo do piso `gray-500` que o próprio DESIGN.md define como proibido para texto de leitura.
5. `frontend/src/pages/Clientes/ListaClientes.jsx` (tela mais usada por vendedores/escritório) **não tem topbar de página** — o `return` (linha 382) pula direto para a barra de ações em lote e o card de filtros; não há título "Clientes", ícone de módulo nem contexto. Comparado com `PainelEmbarque.jsx` ou `ContasReceberTabela.jsx:900-903`, que têm cápsula colorida + `<h1>`, a experiência entre telas é inconsistente — o usuário não sabe "onde está" ao entrar direto em Clientes.
6. Densidade é desigual: telas financeiras (`ContasReceberTabela.jsx`, 2232 linhas; `NotasFiscais`) empilham muitos KPIs, filtros, tabelas e ações na mesma view sem uma hierarquia clara de "1 ação principal" — contraria o princípio "uma tela, um foco" do PRODUCT.md.
7. O menu lateral (`App.jsx:448-511`) é denso e por flyout: `SidebarCat` (linha 246) abre submenus fixos posicionados via cálculo de coordenadas (`flyPos`), técnica frágil visualmente e difícil de escanear rápido — compare com apps de referência (Linear, Stripe) que usam painel expansível simples, não popover flutuante calculado.
8. Existem pelo menos 3 famílias de "card de modal" convivendo: `rounded-xl` (padrão novo), `rounded-2xl shadow-xl/2xl` (a maioria dos modais, ex. `Pedidos/ListaPedidos.jsx:1675`, `Admin/Embarques/NovaCargaModal.jsx:34`) e `rounded-lg shadow`/`shadow-md` legado (`Veiculos/Veiculos.jsx:168`, `Admin/Sync/PainelSync.jsx:80`) — nenhuma é "errada" isoladamente, mas a mistura sem regra visível é o que faz o app parecer remendado.
9. Nada no código sugere um sistema de *empty state* ilustrado, onboarding inline ou microcopy de encorajamento — todo "vazio" é uma linha de texto cinza claro dentro da tabela (ex. `text-gray-400` citado acima). Isso é o oposto de "impressionar": é o ponto onde mais apps modernos investem polish (ilustração leve, CTA, mensagem humana) e aqui é tratado como não-evento.
10. Resumo: a fundação (tokens, Manrope, verde Starbucks, badges de status, `SelectBusca`, `FiltroPeriodo`, tabela→card no mobile) está correta e documentada — o que falta para "impressionar" é **consistência de execução** (mesmo componente de topbar/card em toda tela), **hierarquia** (menos elementos competindo, uma ação em destaque) e **acabamento** (empty states, microinterações, espaçamento generoso nas telas mais usadas).

---

## 2. Inventário rápido

- **164 arquivos `.jsx` em `frontend/src/pages`** (fora componentes reutilizáveis), cobrindo ~60 telas distintas listadas em `backend/manuais/abas/README.md`.
- **Cards:** 3 famílias convivendo —
  - Padrão oficial `rounded-xl border border-gray-200 shadow-sm` — usado em 56 arquivos (o mais comum, correto).
  - `rounded-2xl shadow-xl/2xl` — reservado a modais grandes (correto pelo DESIGN.md, "Modais/painéis grandes: rounded-2xl"), mas usado também em cards simples de sucesso/erro (`Candidatura/Candidatura.jsx:312,347,410,658`).
  - `rounded-lg shadow`/`shadow-md` sem borda — legado, ex. `Veiculos/Veiculos.jsx:168`, `Admin/Sync/PainelSync.jsx:80` (some das bordas definidas no padrão, sombra mais pesada que o "descanso" `shadow-sm`).
- **Topbars de tela:** pelo menos 4 variações —
  1. Cápsula colorida + `<h1>` + subtítulo (padrão do design system) — `PainelEmbarque.jsx:62-73`, `ContasReceberTabela.jsx:900-916`.
  2. `<h1 className="text-base font-bold">` solto sem cápsula — `Rota/RotaLeads.jsx:2327`.
  3. Nenhum topbar, tela começa nos filtros — `Clientes/ListaClientes.jsx:382+`.
  4. Header dentro de modal/dashboard próprio, sem `<h1>` de página (`Dashboard/DashboardHome.jsx` é só um roteador — o título fica a critério de cada `Dashboard*` filho).
- **Botões "primários" que fogem da pílula:** `PainelEmbarque.jsx:78-81` (`rounded-xl`), `ContasReceberTabela.jsx:907,913,916` (`rounded-md`) — a lista de exemplos é maior; a causa raiz é que o remapeamento de `index.css:132-133` só cobre `.rounded`/`.rounded-md`, então qualquer botão feito com `rounded-lg`/`rounded-xl` escapa da regra "botão sempre pílula".
- **Cor de texto abaixo do piso definido no DESIGN.md:** `text-gray-400` em 1148 ocorrências / 137 arquivos — incluindo texto lido pelo usuário (mensagens de "nada encontrado", metadados de data, subtítulos).
- **Badges:** o vocabulário de cores em si é consistente (`ListaPedidos.jsx:37-42` segue exatamente a tabela do DESIGN.md), mas o *texto* dos badges varia por tela para o mesmo conceito ("Processando" vs "Em andamento", "Aberto" vs "Pendente") sem um glossário único — risco de leitura inconsistente entre módulos.
- **Ícone/cor de módulo:** majoritariamente correto (Expedição = sky, Financeiro = amber), mas o botão de ação primária de Embarques usa a cor do módulo (`bg-sky-600`) em vez do verde único de ação (`primary`), o que a "Regra da Voz Única" do DESIGN.md proíbe.

---

## 3. TOP 10 melhorias de design (por impacto)

### 1. Criar um componente `<PageHeader>` único e aplicá-lo em toda tela
**Problema:** 4 variações de topbar coexistindo; `ListaClientes.jsx:382` não tem nenhum. **Evidência:** `PainelEmbarque.jsx:62-73` vs `ListaClientes.jsx:382-390` vs `RotaLeads.jsx:2327`.
**Proposta:** um componente único (cápsula de cor do módulo + ícone + `<h1>` + subtítulo opcional + slot de ações à direita) usado em 100% das telas de nível 1 (as do menu). Zero improviso por tela.
**Telas afetadas:** todas (~60). **Esforço:** M (componente é pequeno; o trabalho é trocar 60 telas — pode ser feito incrementalmente, tela tocada = tela migrada).

### 2. Fechar o buraco do botão pílula (`rounded-xl`/`rounded-lg` em botão)
**Problema:** botões primários que escapam da regra de pílula por usarem uma classe de raio fora da lista remapeada. **Evidência:** `PainelEmbarque.jsx:81` (`rounded-xl`), `ContasReceberTabela.jsx:907,913,916` (`rounded-md`).
**Proposta:** ampliar o seletor CSS em `index.css:132-133` para cobrir `button.rounded-lg, button.rounded-xl` também (rede de segurança), **e** corrigir o código-fonte desses botões para as classes canônicas do design system ao tocar em cada tela.
**Telas afetadas:** Embarques, Contas a Receber (e provavelmente dezenas de outras — vale um grep geral). **Esforço:** P.

### 3. Elevar o piso de cinza: banir `text-gray-400` de texto lido
**Problema:** 1148 ocorrências de uma cor que o próprio DESIGN.md proíbe para leitura ("nunca cinza mais claro que gray-500"). **Evidência:** `Pedidos/ListaPedidos.jsx:1286`, `Pedidos/ListaDevolucoes.jsx:128`, `Veiculos/VeiculoFicha.jsx:923`, `RH/DetalheCurriculo.jsx:61,330,351`.
**Proposta:** troca mecânica `text-gray-400` → `text-gray-500`/`text-gray-600` em texto de conteúdo (manter `gray-400` só em ícones decorativos/placeholders de input, onde é aceitável). Dá para fazer com um script de busca-e-substituição guiado, tela por tela, priorizando as 10 mais usadas.
**Telas afetadas:** 137 arquivos, mas o ganho perceptível concentra-se nas telas de uso diário (Pedidos, Clientes, Financeiro, RH). **Esforço:** M (mecânico, mas precisa revisão visual por tela para não pegar ícone).

### 4. Dar um "empty state" de verdade (ícone + frase + ação)
**Problema:** todo "nada encontrado" é uma linha de texto cinza dentro da tabela — sem convite à ação, sem acolhimento. **Evidência:** os 15+ exemplos do item 2 do inventário (ex. `Leads/ListaLeads.jsx:502,592`, `Atendimentos/PainelAtendimentos.jsx:525,746`).
**Proposta:** componente `<EstadoVazio icon subtitulo acao />` — ícone do módulo em círculo suave (`bg-mint`/cor do módulo a 10-15% opacidade), frase em `gray-700`, e quando fizer sentido um botão (`+ Novo cliente`, `Limpar filtros`). Reaproveitável em toda lista/tabela do sistema.
**Telas afetadas:** todas as listas (Pedidos, Leads, Clientes, Atendimentos, Financeiro…). **Esforço:** M.

### 5. Unificar a família de cards de modal (3 → 1)
**Problema:** `rounded-xl`, `rounded-2xl shadow-xl`, `rounded-2xl shadow-2xl` e `rounded-lg shadow`/`shadow-md` convivem sem critério visível. **Evidência:** `Veiculos/Veiculos.jsx:168` vs `Admin/Sync/PainelSync.jsx:80` vs `Pedidos/NovoPedido.jsx:2481,2534`.
**Proposta:** fixar 2 famílias só — card de conteúdo (`rounded-xl border shadow-sm`, já é o padrão em 56 arquivos) e modal (`rounded-2xl shadow-xl`, sempre com borda zero e overlay escuro consistente). Eliminar `rounded-lg shadow`/`shadow-md` sem borda.
**Telas afetadas:** Veículos, Sync, Candidatura e outros cards legados. **Esforço:** P–M.

### 6. Reduzir a densidade das telas financeiras — 1 ação em destaque, resto em menu
**Problema:** `ContasReceberTabela.jsx` empilha 4 botões de ação no topo (`900-916`) + 4 KPIs + filtros + tabela, todos no mesmo peso visual — contraria "uma tela, um foco" do PRODUCT.md.
**Proposta:** manter só a ação mais frequente visível (ex. "Baixar parcelas do CA"), e mover Relatório/CSV/Ver resumo para um menu `⋯` (kebab) ou dropdown "Exportar". KPIs continuam, mas com menos concorrência de botões ao lado.
**Telas afetadas:** Contas a Receber, Contas a Pagar, Notas Fiscais, Auditoria de Entregas — todas com o mesmo padrão de "barra de botões grudada". **Esforço:** M.

### 7. Simplificar o menu lateral (flyout calculado → painel simples)
**Problema:** `SidebarCat` (`App.jsx:246-300`) calcula posição de popover via `flyPos`/coordenadas — visualmente funciona, mas é mais frágil e menos "premium" que um menu que expande in-place ou um painel deslizante fixo.
**Proposta:** avaliar troca para submenu que expande *dentro* da própria sidebar (accordion vertical) quando ela está aberta (`w-60`), eliminando o cálculo de posição flutuante e o salto visual. Mantém o comportamento "hover expande" no ícone-only.
**Telas afetadas:** navegação global (todas as telas). **Esforço:** G (mexe na navegação principal, exige teste extensivo).

### 8. Padronizar o glossário de badges de status entre módulos
**Problema:** o *código de cor* dos badges é consistente, mas o *texto* usado para o mesmo estado varia por tela (ex. NF "Processando" em Pedidos vs. outros nomes em Financeiro). **Evidência:** `Pedidos/ListaPedidos.jsx:37-42`.
**Proposta:** criar uma tabela única de rótulos por status (arquivo `constants/statusLabels.js` ou similar) e importar em todo lugar que hoje escreve a string à mão.
**Telas afetadas:** Pedidos, Notas Fiscais, Financeiro, Estoque. **Esforço:** M.

### 9. Cápsula de módulo consistente no botão de ação primário (Embarques)
**Problema:** o botão "Montar Nova Carga" usa a cor do módulo (`sky`) em vez do verde único de ação, contrariando a "Regra da Voz Única". **Evidência:** `PainelEmbarque.jsx:79-82`.
**Proposta:** botão primário sempre `bg-primary`/pílula; a cor do módulo fica só na cápsula do ícone de topo, nunca no CTA.
**Telas afetadas:** Embarques (e conferir os outros módulos com o mesmo hábito — Rota/laranja, PCP/teal). **Esforço:** P.

### 10. Espaçamento e respiro nas telas de trabalho intenso (Rota, Caixa)
**Problema:** `Rota/RotaLeads.jsx` (2863 linhas) e `Caixa/CaixaDiarioPage.jsx` (1703 linhas) são as telas mais usadas no dia a dia (vendedor em campo, motorista) e concentram muitos blocos pequenos com `mb-1`/`gap-2` — funcional, mas visualmente "compacto demais" para transmitir a sensação premium que o dono pede.
**Proposta:** revisão de espaçamento com passes de `p-4`→`p-5`, `gap-2`→`gap-3` em blocos-chave (sem quebrar a densidade necessária no mobile), e reforço de hierarquia tipográfica (valor grande + rótulo pequeno, não tudo no mesmo `text-sm`).
**Telas afetadas:** Rota, Caixa Diário — as duas telas mais usadas por vendedores/motoristas. **Esforço:** M.

---

## 4. Linguagem visual v2 — o que preservar e o que evoluir

**Preservar (funciona e está documentado em DESIGN.md):**
- Paleta Starbucks (verde `#00754A`/`#006241`, casa `#1E3932`, menta `#d4e9e2`, creme `#f2f0eb`), vocabulário fixo de badges de status, dourado raro.
- Manrope + números tabulares, piso de 12px, regra "texto de leitura ≥ gray-600" (falta é cumprir, não redesenhar).
- `SelectBusca`, `FiltroPeriodo`, `useFiltrosSalvos` — infraestrutura de filtro já madura, não mexer.
- Tabela→card no mobile, alvo de toque ≥44px — mobile-first já é ponto forte real.

**Evoluir:**
- **Espaçamento:** trocar o "apertado por padrão" por um ritmo de 3 níveis explícito — compacto (listas densas, Rota/Caixa), padrão (a maioria das telas, `p-5`/`gap-3`), respirado (telas de decisão/KPI, `p-6`/`gap-4`). Hoje o espaçamento é decidido tela a tela sem esse critério.
- **Tipografia:** manter peso/tamanho como único eixo de hierarquia (já é regra), mas reforçar contraste de escala — números-chave (KPI, valor de parcela) em `text-2xl`/`text-3xl` `font-bold` bem distintos do rótulo em `text-xs uppercase`, para que o olho "pouse" no dado, não precise ler tudo.
- **Cards:** consolidar em 2 famílias só (conteúdo `rounded-xl shadow-sm` / modal `rounded-2xl shadow-xl`), como no item 5 do Top 10.
- **Topbar:** componentizar (item 1) com 3 variantes previsíveis — lista/tabela (cápsula + título + ações), formulário (título + breadcrumb "voltar"), dashboard (título + seletor de período).
- **Menu lateral:** considerar accordion in-place em vez do flyout calculado (item 7); manter a lógica de favoritos (`useMenuFavoritos`), que já é um diferencial bom.
- **Estados vazios:** sempre ícone + frase humana + ação, nunca só texto cinza em linha de tabela (item 4).
- **Feedback/toasts:** `react-hot-toast` já está padronizado (1120 chamadas, biblioteca única) — manter, mas definir 1 posição/estilo único de toast (hoje herda o default da lib) com a paleta do tema (sucesso = mint/verde, erro = vermelho) em vez do estilo genérico da biblioteca.
- **Ícones de módulo:** manter o mapa de cores por módulo (correto e documentado), mas reforçar a regra de que o CTA primário da tela nunca herda a cor do módulo — sempre verde de ação (item 9).

Isso é suficiente para um designer montar um mockup HTML: os tokens (cor/tipografia/raio/espaçamento) já existem em `design-system.html` e no front-matter de `DESIGN.md`; o que muda é a *composição* (componentes de topbar/card/empty-state únicos) e a *disciplina de aplicação* (piso de cinza, pílula em todo botão, 1 ação em destaque por tela).

---

## 5. Telas para mockup "antes → depois"

### 1. Clientes (`/clientes` — `ListaClientes.jsx`)
Maior uso diário (vendedor + escritório). **Depois:** adicionar `<PageHeader>` (cápsula verde + "Clientes" + contador "1.148 cadastrados"); mover ações em lote para uma barra contextual que só aparece com seleção (já existe, só precisa de topbar acima dela); no mobile, cards de cliente com nome em destaque (`text-base font-bold`), cidade/telefone em `gray-600`, badge de status à direita — hoje a lista carece de um `<h1>` que ancore a tela.

### 2. Rota (`/rota` — `RotaLeads.jsx`)
Tela do vendedor em campo, uma mão, sol na tela. **Depois:** simplificar a hierarquia do card de cliente (nome grande, 1 badge de prioridade, botão de ação único "Atender"/"Ver" bem visível); reduzir a quantidade de blocos empilhados com `mb-1` para um ritmo de `gap-3` mais respirável; no desktop, manter densidade mas com separação visual mais clara entre "clientes de hoje" e "demais".

### 3. Caixa Diário (`/caixa` — `CaixaDiarioPage.jsx`)
Tela do motorista, uso repetitivo e sob pressão de horário. **Depois:** destacar 1 KPI central ("Falta conferir: R$ X") em vez de vários números competindo; ações de baixa/despesa como botões grandes de toque fácil (já existe `min-h-[44px]`, falta reforçar contraste de peso); no mobile, uma barra fixa inferior só com a ação principal do momento.

### 4. Contas a Receber (`/financeiro/contas-receber-tabela` — `ContasReceberTabela.jsx`)
Tela mais carregada do financeiro. **Depois:** aplicar o item 6 do Top 10 — 1 botão de ação visível, resto em menu "⋯"; KPIs com número maior e rótulo menor (hoje ambos em pesos próximos); tabela com hover mais evidente e paginação/scroll claros dado o tamanho do arquivo (2232 linhas de UI).

### 5. Dashboard (`/` — `DashboardGeral`/`DashboardVendedorPessoal`, atrás de `DashboardHome.jsx`)
Primeira tela que todo usuário vê ao logar — maior oportunidade de causar a impressão de "premium". **Depois:** garantir que o primeiro KPI (meta do mês / resultado do dia) tenha destaque tipográfico claramente maior que o resto da página, com um único card "herói" no topo (fundo `house` ou `mint`, número grande) seguido pelos cartões secundários — hoje a composição depende de qual dashboard filho carrega, sem um padrão de "herói + secundários" comum aos três.

### 6. Painel de Expedição / Embarque (`/admin/embarques` — `PainelEmbarque.jsx`)
Tela pequena (211 linhas) e por isso o lugar mais barato para aplicar o `<PageHeader>` e corrigir o botão fora do padrão (itens 1, 2 e 9) como piloto do padrão antes de replicar nas telas maiores.

---

## Confirmação

Este relatório foi produzido **somente lendo código** (`PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, `frontend/src/index.css`, `frontend/src/App.jsx`, `backend/manuais/abas/README.md` e ~15 arquivos de telas em `frontend/src/pages`, mais buscas `grep` no diretório). **Nenhum arquivo do projeto `~/Projetos/CA-Hardt` foi criado, editado ou apagado.**
