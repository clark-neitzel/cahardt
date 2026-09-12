# Plano de Execução — Navegação & Design + Vendas (aprovado 09/2026)

Baseado em `docs/melhorias-2026-09/index.html`, `01-navegacao-design.html`, `02-vendas.html` e nos relatórios
`relatorios/design.md`, `relatorios/experiencia.md`, `relatorios/automacao.md`, mais leitura direta do código
em 12/09/2026. Escrito em modo somente leitura — nenhum arquivo do projeto foi alterado além deste plano.

As regras de "Linguagem visual v2" (PageHeader, EstadoVazio, piso `text-gray-500`, pílula em todo raio de
botão) e "Boas práticas de uso" (1 ação principal, foco volta ao campo inicial, Enter/Esc, anti-clique-duplo,
teclado numérico) estão sendo gravadas no `CLAUDE.md` em paralelo — este plano já assume essas regras como
vigentes e as usa como critério de aceite.

**Correção importante em relação às propostas originais** (achado de leitura de código, não estava nos
relatórios): em `NovoPedido.jsx` o alerta de inadimplência **já dispara na seleção do cliente**, antes do
carrinho (`useEffect` das linhas 424-520, chama `clienteService.obterInadimplencia` na L500 e renderiza o
banner na L1575-1611) — e os avisos de GPS/WhatsApp faltante também já aparecem nesse momento
(`AlertaGpsFaltante` L2597-2602, `AvisoWhatsappFaltante` L1617). O item "alertas antecipados" do
`automacao.md` (nº 8) **já está implementado**. O que falta de fato em B1 é só "Repetir último pedido" e
mostrar a última compra sem expandir a linha — muda o esforço de B1 de G para M/P.

---

## A1 — Linguagem visual v2: fundação + telas-piloto

**Objetivo:** criar os componentes-base do design system (`PageHeader`, `EstadoVazio`, `statusLabels`) e
aplicá-los nas 5 telas de maior uso, fechando o buraco do botão-pílula e elevando o piso de cinza nessas
telas.

**Arquivos a criar:**
- `frontend/src/components/PageHeader.jsx` — cápsula colorida + ícone + `<h1>` + subtítulo opcional + slot
  de ações à direita. Modelar pelo padrão já correto em `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx:62-73`
  e `frontend/src/pages/Financeiro/ContasReceberTabela.jsx:900-916`.
- `frontend/src/components/EstadoVazio.jsx` — ícone do módulo em círculo suave, frase em `gray-700`, botão
  de ação opcional.
- `frontend/src/constants/statusLabels.js` — tabela única de rótulos por status, começando pelo vocabulário
  já correto de `frontend/src/pages/Pedidos/ListaPedidos.jsx:37-42` (cores) + levantamento dos textos
  divergentes entre módulos citados no design.md (NF "Processando" vs. outros nomes).

**Arquivos a alterar:**
- `frontend/src/index.css` — ampliar o seletor de remapeamento de pílula (hoje só `.rounded`/`.rounded-md`
  conforme `design.md` item 2, confirmar linhas exatas ~132-133) para cobrir `button.rounded-lg` e
  `button.rounded-xl` também, como rede de segurança.
- `frontend/src/App.jsx:857` — `<Toaster position="top-right" />` sem `toastOptions`; adicionar tema único
  (sucesso = mint/verde, erro = vermelho) uma única vez aqui.
- Telas-piloto (aplicar `PageHeader` + `EstadoVazio` + revisar botão pílula + sweep de `text-gray-400`→`500`
  em texto lido, não em ícone decorativo):
  1. `frontend/src/pages/Clientes/ListaClientes.jsx` — **não tem topbar hoje** (`return` pula direto para
     filtros na linha 382); é a tela mais usada sem `<h1>` nenhum.
  2. `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` — botão primário em `rounded-xl` (linha
     78-81) e na cor do módulo (`sky`) em vez de `bg-primary`; corrigir os dois no mesmo commit.
  3. `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` — 4 botões em `rounded-md` (linhas 907-916)
     competindo no mesmo peso; reduzir para 1 ação principal + menu `⋯` com o resto (Relatório/CSV/Ver
     resumo), conforme item 6 do design.md.
  4. `frontend/src/pages/Pedidos/ListaPedidos.jsx` — já segue o vocabulário de badge certo (linhas 37-42);
     aplicar só `PageHeader` (verificar o `<h1>` atual) e trocar `text-gray-400` de texto lido (ex. linha
     1286, "Nenhum pedido encontrado") por `EstadoVazio`.
  5. `frontend/src/pages/Rota/RotaLeads.jsx` — `<h1>` solto sem cápsula (linha 2327); aplicar `PageHeader`
     só no topo fixo (não mexer no `CardCliente` denso — isso é o A1 vs. B2, ver adiante).

**Ordem interna:** 1) componentes novos + `index.css` + `Toaster` (sem tocar tela nenhuma) → 2) piloto
`PainelEmbarque` (211 linhas, prova de conceito) → 3) `ListaClientes` (maior ganho/risco, muito usada) →
4) `ContasReceberTabela` e `ListaPedidos` em paralelo (arquivos diferentes) → 5) `RotaLeads` (2863 linhas,
tocar só o topo).

**Dependências:** nenhuma sobre os outros pedaços; A2/A3/B2/B3 vão **consumir** `PageHeader`/`EstadoVazio`
depois de prontos — A1 deve rodar primeiro ou em paralelo na 1ª onda.

**Riscos:**
- `index.css` é global: ampliar o seletor de pílula pode pegar botão `rounded-lg`/`rounded-xl` de propósito
  (raro) — checar visualmente as pilotos e mais 5-10 telas ao acaso depois do build.
- `ListaClientes.jsx` é usada por vendedor em campo e escritório — testar mobile (≥320px) antes de commitar.
- Sweep de `text-gray-400`: não confundir ícone decorativo (mantém) com texto lido (sobe p/ 500/600) —
  revisão visual, não busca-e-substitui cego.
- Não mexer na paleta de cor dos badges nem no raio (`rounded-full` continua), regra inegociável do
  CLAUDE.md.

**Critérios de aceite (QA clicando):**
- `ListaClientes`, `PainelEmbarque`, `ContasReceberTabela`, `ListaPedidos`, `RotaLeads` mostram cápsula +
  ícone + título ao abrir, em desktop e em 375px de largura, sem scroll horizontal.
- Botão primário de `PainelEmbarque` é verde pílula (`bg-primary`), não mais `sky`/`rounded-xl`.
- `ContasReceberTabela` mostra 1 botão de ação principal visível + menu `⋯` com o resto — QA confere que
  todas as ações antigas (Relatório/CSV/Ver resumo) continuam acessíveis dentro do menu.
- Lista vazia (ex. filtrar Pedidos por algo sem resultado) mostra `EstadoVazio` com ícone + frase + ação,
  não mais texto solto cinza-claro.
- `npm run build` do frontend passa sem erro antes do commit (regra inegociável do CLAUDE.md).

**Manual/Clippy:** nenhuma rota/permissão muda — não precisa atualizar `copilotoService.js`; revisar só se
o texto do manual de `clientes.md`/`rota.md` descreve a tela de um jeito que a mudança visual invalide
(pouco provável, é só visual).

**Estimativa:** G (componentes são P, mas 5 telas piloto + sweep de cinza é trabalho real).
**Quem faz:** dev-frontend.

---

## A2 — Menu por perfil

**Objetivo:** montar `desktopSections` (e o equivalente mobile) filtrando por perfil de usuário antes do
filtro por permissão item a item, reduzindo o menu de 8 grupos/62 itens para o que cada perfil realmente usa.

**Arquivos a alterar:**
- `frontend/src/App.jsx` — a lógica de `desktopSections` está nas linhas ~349-421 (confirmado por leitura:
  bloco `const desktopSections = [...]` com grupos Vendas/Logística/Financeiro/Administração/RH/PCP/
  Produção-Estoque/Configurações, cada item já filtrado por `hasPermission`). O menu mobile replica a mesma
  lógica mais abaixo (`MobileMenuSection`, linhas ~300+, ver seção "Favoritos válidos" linha 431-434 que já
  usa `desktopSections` como fonte única — bom ponto de reaproveitamento: filtrar `desktopSections` por
  perfil e o mobile herda automaticamente se também ler dessa mesma estrutura).

**Detecção de perfil a reaproveitar:** `frontend/src/pages/Dashboard/DashboardHome.jsx:16-35` já resolve
`gestor` (admin/`Pode_Ver_Dashboard_Admin`), `entregador` (`Pode_Executar_Entregas`/`Pode_Ver_Todas_Entregas`
sem meta de venda) e "demais = vendedor". **Não existe hoje detecção de "escritório" nem "PCP" como perfil**
— só permissões soltas (`canPcp`, `showRH`, `showConfig` já calculados em `App.jsx`). A2 precisa **inventar**
o critério de "escritório" (proposta: quem tem permissão de Financeiro/Notas Fiscais/Embarque mas não é
`gestor` nem `entregador` nem vendedor puro) — decisão de produto, não só técnica; ver pergunta ao dono.

**Ordem interna:** 1) extrair a função de perfil para um hook compartilhado (`frontend/src/hooks/usePerfil.js`)
que `DashboardHome` e `App.jsx` chamam, em vez de duplicar a lógica → 2) definir, por perfil, quais `label`
de `desktopSections` aparecem (whitelist de grupos, não de itens individuais) → 3) aplicar o filtro em
`desktopSections` → 4) confirmar que o menu mobile usa a mesma fonte (checar se hoje replica
`desktopSections` ou tem JSX próprio).

**Dependências:** App.jsx também é tocado por **A3** (entrada "Pendências") e **B4** (fundir Site+Kit Festa).
Ver ondas no fechamento — recomendação: um único dev-frontend dono de `App.jsx` na janela em que A2+A3+B4
rodam, aplicando os três diffs em sequência no mesmo branch.

**Riscos:**
- **Risco central do `experiencia.md`:** perfil mal calibrado tira acesso de quem usa a tela raramente mas
  usa. Mitigação obrigatória: link "Ver menu completo" (todos os grupos, sem filtro) sempre acessível.
- Validar com os perfis **reais** do banco local antes de produção — checar permissões de usuários ativos,
  não supor "vendedor só usa Rota/Pedidos".
- Favoritos (`useMenuFavoritos`) dependem de `todosItensMenu = desktopSections.flatMap(...)` (linha 433) —
  hoje um item que some do menu já é tratado como "perdeu permissão" e o favorito some junto (linhas
  431-432) — **checar que um favorito não desapareça só porque o perfil escondeu o grupo**; se acontecer é
  regressão a corrigir antes de entregar.

**Critérios de aceite (QA clicando):**
- Logar com um usuário vendedor real (permissões típicas de campo) e confirmar que o menu mostra só os
  grupos relevantes + "Ver menu completo" continua acessível e mostra tudo que a permissão permite.
- Fixar um favorito de um grupo que sumiu do perfil e confirmar que ele continua aparecendo em Favoritos.
- Logar com um usuário gestor e confirmar que nada sumiu (gestor não perde nada, conforme `experiencia.md`
  seção 4).
- Mobile: menu hambúrguer reflete o mesmo filtro.

**Manual/Clippy:** atualizar `backend/manuais/abas/README.md` não é necessário (rotas não mudam), mas vale
uma nota no manual de cada perfil (se existir) explicando que o menu agora é filtrado — checar se há
menção a "menu completo" em algum manual hoje.

**Estimativa:** M. **Quem faz:** dev-frontend (a lógica de perfil pode precisar de 1 ajuste de permissão no
backend só se o dono pedir uma flag nova de perfil — improvável, hasPermission já cobre).

---

## A3 — Central de Pendências

**Objetivo:** uma tela `/pendencias` (entrada de menu + candidata a tela inicial do escritório/gerência) que
agrega em um só lugar as pendências que hoje só aparecem quando alguém abre cada tela separadamente.

**Backend — endpoint agregador:**
- Rota nova, ex. `backend/routes/pendenciasRoutes.js` + `backend/services/pendenciasService.js`, um único
  `GET /api/pendencias` devolvendo contadores + até 5 linhas por bloco (evita 8-10 chamadas do front).
- **Serviços candidatos a reaproveitar** (arquivos confirmados, função exata a conferir na implementação):
  `pcpSugestaoService.js` (status `PENDENTE` na L167 → bloco "Ordens sugeridas"), `caixaConferenciaService.js`
  + `caixaConferenciaWorker.js` (→ "Caixas p/ conferir"), `canhotoService.js` (→ "Canhotos não bipados"),
  `amostraService.js` (→ "Amostras paradas").
- **Sem função pronta identificada** — exigem query nova: Pedidos p/ aprovar (Especial/Bonificação ABERTO),
  NF-e a emitir/rejeitada, Notas Recebidas sem conta a pagar, boletos/PIX >24h, tarefas atrasadas
  (reaproveitar o `where` que cada tela original já usa, ex. filtro "Sem nota" de Notas Fiscais).
- Consultas são só leitura (não entram em `$transaction`); evitar N+1 por bloco (`count`/`groupBy`).

**Frontend:**
- `frontend/src/pages/Pendencias/PainelPendencias.jsx` (nova) — `PageHeader` (de A1) + KPIs em
  `grid-cols-2 md:grid-cols-4` + blocos em card `rounded-xl border shadow-sm`, cada um com botão de ação de
  1 clique por linha (padrão já existente do card "Cobranças da Rota" do Caixa, citado como referência).
- `frontend/src/App.jsx` — nova entrada lazy (`lazyComRetry`) + rota `/pendencias` + entrada em
  `desktopSections` (grupo a definir — provavelmente dentro de "Financeiro" ou um item solto no topo para
  escritório/gerência) + permissão nova (ex. `Pode_Ver_Pendencias`, ou reaproveitar `isAdmin ||
  hasPermission('Pode_Acessar_Financeiro_Gerencial')` como primeira aproximação, a confirmar com o dono).

**Ordem interna:** 1) backend agregador com os 4-5 blocos já com serviço identificado (pedidos p/ aprovar,
ordens sugeridas, caixas p/ conferir, canhotos, amostras) → 2) tela + rota + menu → 3) blocos restantes com
query nova (NF-e emitir/rejeitada, notas recebidas sem conta, boletos/PIX >24h, tarefas atrasadas) entram
numa 2ª leva, só adicionando bloco ao array que o endpoint devolve.

**Dependências:** consome `PageHeader`/`EstadoVazio` de A1. Toca `App.jsx` — ver nota de A2 sobre dono único
do arquivo na mesma janela.

**Riscos:**
- Endpoint lendo 8-10 tabelas de uma vez pode ficar lento sem `count`/agregação — medir antes de dar como
  pronto (não travar a tela inicial do escritório).
- Se virar tela inicial do perfil escritório/gerência, **compete** com A2 e com o Dashboard Gerencial —
  decisão a confirmar com o dono (ver perguntas no fechamento).
- Permissão nova: espelhar front↔back exatamente (regra do CLAUDE.md) e entrar no `BOOL_INDEX` do painel de
  permissões.

**Critérios de aceite (QA clicando):**
- Abrir `/pendencias` com usuário de escritório: cada bloco mostra contador real (comparar manualmente com
  a tela original — ex. quantas NF-e realmente estão sem emitir hoje).
- Clicar na ação de 1 clique de um bloco (ex. "Aprovar" em Pedidos p/ aprovar) e confirmar que o efeito é
  idêntico ao de fazer a mesma ação na tela original (não é uma ação paralela nova).
- Usuário sem a permissão da Central não vê a entrada no menu nem consegue acessar a URL direta (testar
  digitando a URL logado com perfil sem permissão — deve dar tela de acesso negado, não 500).
- Tempo de carregamento da tela é aceitável (poucos segundos) mesmo com volume real de produção.

**Manual/Clippy:** **tela nova** → criar `backend/manuais/abas/pendencias.md`, adicionar linha no
`README.md` e entrada na tabela `ABAS` de `backend/services/copilotoService.js` (rota `/pendencias` +
permissão real usada) — checklist obrigatório do CLAUDE.md.

**Estimativa:** G. **Quem faz:** dev-backend (endpoint agregador) + dev-frontend (tela), em paralelo depois
que o contrato do endpoint estiver combinado entre os dois (formato do JSON por bloco).

---

## A4 — Foco/cursor após ação repetida

**Objetivo:** depois de qualquer "ação de linha" (dar entrada/saída de estoque, confirmar item de
inventário, apontar produção, bipar canhoto...) o cursor volta sozinho para o campo de quantidade/código,
sem o usuário precisar clicar de novo — é o pedido literal do dono.

**Bug flagship confirmado por leitura de código — `frontend/src/pages/Estoque/PainelEstoque.jsx`
(tela "Ajuste de Estoque", `/estoque`, é exatamente o exemplo que o dono descreveu):**
- `handleAjuste` (linhas 276-333) limpa o campo (`setQuantidade('')`, linha 319) depois de registrar
  ENTRADA/SAÍDA, mas **nunca devolve o foco** — não existe `quantidadeRef` no arquivo, e o `<input>` de
  quantidade (linhas 586-594) não tem `ref`. Só o campo de observação tem ref (`obsRef`, linha 157,
  usado no `.focus()` da linha 284 — mas só no caso de erro de motivo de saída, não no caminho de sucesso).
- Correção mínima: criar `quantidadeRef = useRef(null)`, atribuir ao `<input>` de quantidade e chamar
  `quantidadeRef.current?.focus()` logo após `setQuantidade('')` na linha 319 (sucesso) — assim o vendedor
  digita a próxima quantidade sem tocar na tela de novo, exatamente o fluxo "digito quantidade, clico +,
  cursor já está pronto pro próximo".

**Varredura das demais telas de "formulário de linha"/ação repetida (a confirmar arquivo a arquivo pelo
dev-frontend, mesmo padrão de `grep` usado aqui):**
| Tela | Arquivo | Campo "início óbvio" | Estado hoje |
|---|---|---|---|
| Ajuste de Estoque | `Estoque/PainelEstoque.jsx` | input Quantidade (~L586) | **Confirmado sem foco de volta** — corrigir primeiro. |
| Inventário (contagem offline) | `Estoque/InventarioEstoque.jsx` | campo de quantidade contada | Sem `Ref` de quantidade identificado no grep; dev-frontend confirma o handler de contagem. |
| Posição de Estoque (edição inline) | `Estoque/PosicaoEstoque.jsx` | campo editado inline | Usa `autoFocus` em 4 pontos (L168, 264, 423, 544) na abertura da edição; confirmar se após salvar o próximo item também recebe foco, ou se já é referência positiva. |
| Caixa — Despesas | `Caixa/DespesasPage.jsx` | campo valor/descrição no modal | Modal fecha/reabre a cada despesa — a queixa pode não se aplicar igual; confirmar com o dono. |
| PCP — apontamento/etiquetas | `PCP/*` | quantidade apontada / código bipado | Não varrido nesta leitura — repetir o grep antes de estimar o tamanho real. |
| Bipagem de Canhoto | tela de `canhotoService.js` | campo de código bipado | Não varrido; candidato forte (fluxo repetitivo). |
| Contas a Pagar — itens | `Financeiro/ContasPagarPage.jsx` | campo de item da nota | Não varrido. |
| Tarefas | `Tarefas/*` | — | Baixa prioridade (não é ação repetida em série). |

**Proposta de hook utilitário:** `frontend/src/hooks/useFocoInicial.js` — recebe um `ref` e uma função
`voltarFoco()` que o handler de sucesso chama; padroniza o "depois de X, foco em Y" em vez de cada tela
reinventar. Não existe hoje (confirmado: nenhum resultado para `useFocoInicial`/`focusInicial` no repo).

**Ordem interna:** 1) criar o hook `useFocoInicial` (pequeno, sem risco) → 2) aplicar no bug flagship
(`PainelEstoque.jsx`, é o que o dono citou nominalmente — prioridade 1) → 3) varrer e confirmar as demais
telas da tabela acima, indo pela ordem de uso (Estoque > PCP > Caixa > Contas a Pagar > Tarefas) → 4) aplicar
onde fizer sentido, pulando fluxos em modal (onde a queixa pode não se aplicar da mesma forma).

**Dependências:** nenhuma com A1/A2/A3/B — é isolado por tela, pode rodar em paralelo com tudo.

**Riscos:**
- `.focus()` automático dispara dentro do próprio handler de clique (gesto do usuário, seguro no iOS), mas
  testar em iPad real para confirmar que não há scroll indesejado ao reabrir o teclado.
- Não usar `autoFocus` do React para o retorno pós-ação (só dispara na montagem, não serve para reenviar
  foco num componente já montado) — o hook precisa expor função imperativa (`ref.current?.focus()`).
- Checar `ref.current` antes de focar (produto pode ter sido desselecionado pela própria ação).

**Critérios de aceite (QA clicando, incluindo o teste de foco pedido):**
- Em `/estoque` (Ajuste de Estoque): selecionar produto, digitar quantidade, clicar "+" (ENTRADA). Depois
  do toast de sucesso, **sem clicar em nada**, digitar de novo — o número precisa cair no campo Quantidade.
  Teste técnico equivalente: após a ação, `document.activeElement` é o `<input>` de quantidade (confirmar
  via DevTools/teste automatizado, não só visual).
- Repetir o mesmo teste para SAÍDA (com motivo preenchido).
- Repetir para cada tela da tabela que for de fato corrigida nesta entrega (marcar no relatório de entrega
  quais entraram nesta rodada e quais ficaram para depois).
- Teste em iPad real (ou emulação) confirmando que o teclado numérico não causa scroll brusco/perda de
  contexto.

**Manual/Clippy:** mudança de comportamento sutil (não cria tela nem rota) — não exige manual novo; se o
manual de `estoque-ajuste.md` descrever explicitamente "clique no campo para digitar de novo", corrigir a
frase.

**Estimativa:** M (o bug flagship é P; a varredura completa das outras telas é o que pode crescer — cabe ao
dev-frontend reportar ao final quantas telas entraram, sem esticar a entrega sem avisar o dono, regra do
CLAUDE.md "avisar quando o escopo cresce").
**Quem faz:** dev-frontend.

---

## B1 — Assistente de Pedido em NovoPedido.jsx

**Objetivo:** dar "Repetir último pedido" e mostrar a última compra por item sem precisar expandir — os
alertas de inadimplência/GPS/WhatsApp **já disparam cedo** (achado de código, ver nota no topo do plano),
então não é preciso mexer neles.

**Arquivos a alterar:**
- `frontend/src/pages/Pedidos/NovoPedido.jsx` — dois pontos:
  1. **"Última vez: N un em dd/mm" sempre visível por item**: o dado já existe em `historicoMap` (state,
     linha 169) — cada entrada tem `{ ultimoPreco, ultimaCompra, compras: [{data, numero, quantidade,
     valor}] }`, vindo de `pedidoService.historicoComprasCliente` (linha 505). Hoje só aparece dentro do
     bloco expansível (linhas 1448-1470, `{expandido && hist && hist.compras...}`). Mudança: renderizar
     `hist.compras[0]` (a mais recente) inline, sem precisar clicar para expandir — texto pequeno ao lado
     do nome do produto, ex. "última vez: 20un em 28/08". **Não precisa de chamada nova ao backend.**
  2. **Botão "Repetir último pedido"**: novo botão no card de contexto do cliente, perto de onde hoje fica
     a data sugerida. Ao clicar, percorre `historicoMap` (já carregado) e monta o carrinho (`itensMap`) com
     produto+quantidade da compra mais recente de cada item, respeitando as mesmas travas de estoque/preço
     que já rodam ao adicionar item manualmente (reaproveitar a função existente, não duplicar lógica de
     preço). `historicoComprasCliente` retorna por produto, não por "pedido" — dá para agrupar por
     `hist.compras[0].numero` (último pedido exato) ou usar "o mais recente de cada produto" (mais simples,
     dado natural do endpoint) — **decidir com o dono qual leitura** (ver pergunta no fechamento).
- **Backend:** só muda se a leitura for "último pedido exato" (`pedidoService.historicoComprasCliente`,
  linhas 807-854, precisaria agrupar por `pedido.numero`). Se for "última compra de cada item", nenhuma
  mudança de backend é necessária.

**Ordem interna:** 1) "última vez" inline (mudança pequena, sem risco, sem backend) → 2) decidir com o dono
a leitura de "repetir último pedido" → 3) implementar o botão (frontend, e backend só se necessário).

**Dependências:** nenhuma com A/B restantes.

**Riscos:**
- "Repetir último pedido" **não pode pular** trava nenhuma (estoque, preço atual, inadimplência, condição
  de pagamento) — só **pré-carrega**, nunca envia direto (o vendedor sempre revisa antes de Salvar,
  conforme `automacao.md`). Confirmar que o carrinho pré-carregado passa pelos mesmos `useMemo`/validações
  de um item adicionado manualmente.
- Catálogo atual é sempre a fonte de verdade de preço/disponibilidade (produto pode ter sido descontinuado
  desde a última compra) — histórico só sugere quantidade.
- Não interfere em NF-e de devolução nem WhatsApp — é só montagem de carrinho antes do Enviar.

**Critérios de aceite (QA clicando):**
- Selecionar um cliente com histórico: cada item já comprado mostra "última vez: Nun em dd/mm" sem
  precisar clicar para expandir.
- Clicar "Repetir último pedido": carrinho é pré-carregado com os itens/quantidades esperados; preço exibido
  é o **atual** do catálogo (não o congelado no histórico, a não ser que seja a mesma regra de "puxa
  histórico do cliente" já existente na linha 734-735); vendedor consegue editar/remover item antes de
  Enviar.
- Testar com um item que ficou sem estoque suficiente desde a última compra: trava de estoque continua
  disparando normalmente mesmo vindo do "repetir".
- Testar com cliente inadimplente: banner de bloqueio continua aparecendo do mesmo jeito de hoje.

**Manual/Clippy:** atualizar `backend/manuais/abas/pedidos.md` (ou o manual específico de Novo Pedido, se
houver) descrevendo o botão novo e o texto "última vez".

**Estimativa:** P/M (menor que a estimativa original do `automacao.md`, que assumia endpoint novo — a
maior parte do dado já existe). **Quem faz:** dev-frontend (dev-backend só entra se a leitura escolhida for
"pedido exato" e exigir endpoint novo).

---

## B2 — Card do cliente na Rota

**Objetivo:** simplificar a hierarquia visual do `CardCliente` em `RotaLeads.jsx` (nome grande, 1 badge,
botão único "Atender" bem visível) e adicionar link "Ver pedido criado".

**Arquivos a alterar:**
- `frontend/src/pages/Rota/RotaLeads.jsx` — componente `CardCliente` definido na linha 304 (arquivo de 2863
  linhas — mexer só nesse componente). Botão "Atender" já existe em dois pontos (linhas 737-742 e 929).
  Card raiz usa `border-amber-400` (prioridade) ou `border-sky-400/50` padrão (linha 985) — **múltiplos
  badges e blocos empilhados hoje** (comentário da linha 596: "badge cenário + motivo curto + botão IA +
  chevron", já 3-4 elementos concorrendo).

**Ordem interna:** 1) reduzir para nome grande + 1 badge + botão "Atender" em destaque (mover
cenário/motivo/IA para o card expandido, fora da linha sempre visível) → 2) "Ver pedido criado" como link
condicional (checar se o dado já está disponível no item ou precisa de nova consulta).

**Dependências:** mesmo arquivo-base de A1 (que toca só o topo, linha ~2327) — B2 mexe no `CardCliente`
(linha ~304-985); partes diferentes o suficiente se os dois devs avisarem qual trecho tocam.

**Riscos:**
- `RotaLeads.jsx` é a tela mais usada em campo (uma mão, sol na tela) — testar mobile real antes de
  commitar; não mudar a lógica dos badges (prioridade, transferência), só a hierarquia visual.
- Link "Ver pedido criado" não pode sugerir que o pedido já foi enviado/aprovado se ainda for rascunho —
  refletir o status real (reaproveitar `statusLabels.js` de A1, se já pronto).

**Critérios de aceite (QA clicando):**
- Card do cliente mostra nome em destaque, 1 badge de prioridade, botão "Atender" claramente como ação
  principal — sem elementos concorrendo no mesmo peso visual.
- Depois de criar um pedido pelo card, "Ver pedido criado" aparece e leva à tela/linha certa em Pedidos.
- Mobile 375px: card não quebra, toque no "Atender" tem alvo ≥44px.

**Manual/Clippy:** atualizar `backend/manuais/abas/rota.md` se a descrição do card mudar de forma relevante.

**Estimativa:** M. **Quem faz:** dev-frontend.

---

## B3 — Clientes: PageHeader + aba "Qualidade dos Dados"

**Objetivo:** aplicar `PageHeader` (de A1) em `ListaClientes.jsx` com contador, e adicionar na ficha do
cliente uma aba "Qualidade dos Dados" reaproveitando os componentes de GPS e WhatsApp que hoje só existem
nas telas de auditoria em lote.

**Arquivos a alterar:**
- `frontend/src/pages/Clientes/ListaClientes.jsx` — mesma tela da piloto nº1 de A1; **B3 e A1 se sobrepõem
  no mesmo arquivo** — A1 aplica o `PageHeader` básico, B3 entra depois só adicionando o contador
  ("1.148 cadastrados") ao subtítulo (sequência no mesmo arquivo, não PRs concorrentes).
- `frontend/src/pages/Clientes/DetalheCliente.jsx` — ficha do cliente, nova aba "Qualidade dos Dados"
  (sub-abas GPS e WhatsApp).
- Componentes a **reaproveitar sem duplicar lógica**: extrair a parte visual (mini-mapa de 1 ponto, bloco
  de status de WhatsApp) de `frontend/src/pages/Clientes/SaudePontosGps.jsx` e
  `frontend/src/pages/Clientes/PendenciasWhatsapp.jsx` para um componente compartilhado, importado nos dois
  lugares em vez de copiar JSX.

**Ordem interna:** 1) depende de A1 já ter tocado `ListaClientes.jsx` → 2) extrair os componentes visuais
de GPS/WhatsApp → 3) adicionar a aba na ficha do cliente.

**Dependências:** depende de A1 (`PageHeader` pronto e aplicado em `ListaClientes`).

**Riscos:**
- As telas de auditoria em lote (`SaudePontosGps.jsx`, `PendenciasWhatsapp.jsx`) **não podem perder
  funcionalidade** ao extrair o componente visual — continuam sendo a tela de faxina em massa.
- Confirmar que a versão na ficha do cliente usa a mesma fonte de verdade do selo de WhatsApp (não
  recalcula diferente).

**Critérios de aceite (QA clicando):**
- `ListaClientes` mostra "Clientes · N cadastrados" no `PageHeader`.
- Abrir a ficha de um cliente sem ponto GPS: aba "Qualidade dos Dados" mostra o aviso de GPS faltante,
  igual ao que aparece em `SaudePontosGps.jsx` para aquele mesmo cliente (comparar os dois).
- Idem para WhatsApp.
- As telas `SaudePontosGps` e `PendenciasWhatsapp` continuam funcionando normalmente (nada quebrou na
  extração do componente).

**Manual/Clippy:** atualizar `backend/manuais/abas/clientes.md` descrevendo a aba nova.

**Estimativa:** M. **Quem faz:** dev-frontend.

---

## B4 — Pedidos Online (unificar Site + Kit Festa)

**Objetivo:** uma entrada de menu "Pedidos Online" com abas Site (Congelados) / Kit Festa, sem mudar a
lógica de negócio de cada canal.

**Achado que facilita:** os dois já compartilham a **mesma permissão** (`kitFesta`, confirmado em
`App.jsx:357-358` e na tabela `ABAS` de `copilotoService.js:46-47`) e a mesma rota `tab="kitFesta"` em
`PrivateRoute` (`App.jsx:747,750`) — a fusão é principalmente de **menu e casca visual**, não de permissão.

**Arquivos a alterar:**
- `frontend/src/App.jsx` — hoje duas entradas de menu (`/kit-festa-admin` L357, `/site-admin` L358) e duas
  rotas (L747, 750). Trocar por **uma** entrada "Pedidos Online" (nova rota `/pedidos-online`) que renderiza
  uma casca com abas Site/Kit Festa, **mantendo** `/site-admin` e `/kit-festa-admin` como redirects para
  `/pedidos-online?aba=site` / `?aba=kit-festa` (compatibilidade com links/favoritos salvos).
- Novo componente `frontend/src/pages/PedidosOnline/PedidosOnlineAdmin.jsx` — casca com abas, importando
  `SiteAdmin.jsx` (965 linhas) e `KitFestaAdmin.jsx` (83 linhas, já uma casca de abas internas —
  `AbaAgenda/AbaBairros/AbaConfig/AbaCupons/AbaIndicacoes/AbaPedidos/AbaProdutos`) **sem alterar o conteúdo
  interno de nenhum dos dois** — só troca de onde são montados.

**Ordem interna:** 1) casca com abas + redirects das rotas antigas (zero risco, aditivo) → 2) trocar a
entrada de menu → 3) confirmar que favoritos antigos sobrevivem via redirect.

**Dependências:** toca `App.jsx` — mesma janela de A2/A3, dono único do arquivo.

**Riscos:**
- `KitFestaAdmin.jsx` já é casca de abas — aninhar mais um nível (Pedidos Online > Kit Festa > aba interna)
  pode confundir visualmente; testar abas aninhadas em mobile (scroll horizontal de pílulas).
- Favoritos apontando para as rotas antigas: o filtro de A2 (`todosItensMenu.find(i => i.to === f)`) trata
  rota sumida como "perdeu permissão" e remove o favorito — o redirect resolve a navegação, mas o item em
  Favoritos pode sumir; QA testa esse caso.
- Nenhuma regra fiscal/financeira é tocada — é troca de casca de navegação.

**Critérios de aceite (QA clicando):**
- Menu mostra 1 entrada "Pedidos Online" com abas Site/Kit Festa; cada aba funciona exatamente como a tela
  antiga (fila, aprovar, virar pedido).
- Acessar diretamente a URL antiga `/site-admin` e `/kit-festa-admin` redireciona para a aba certa dentro
  de `/pedidos-online`.
- Um usuário com favorito salvo apontando para `/kit-festa-admin` ainda consegue chegar lá (via redirect),
  mesmo que o atalho do menu precise ser refeito.

**Manual/Clippy:** atualizar `backend/manuais/abas/kit-festa.md` e `site-congelados.md` com a rota nova
(ou criar `pedidos-online.md` e apontar os dois antigos para ele) + atualizar `README.md` e a tabela `ABAS`
em `copilotoService.js` (rota mudou de `/kit-festa-admin`/`/site-admin` para `/pedidos-online`).

**Estimativa:** M. **Quem faz:** dev-frontend.

---

## B5 — Ana avisa título em aberto antes de fechar pedido (avaliar/deferir)

**Recomendação: deixar para depois, não entra nesta rodada.** Depende de integração externa (projeto
Antigravity, fora deste repo) e de decisão de exposição de dado financeiro pelo WhatsApp — o `automacao.md`
já sinaliza isso como risco (mensagem genérica, não valor exato) e decisão de produto, não só técnica.
Mexe também no contrato de `/api/ia-consulta/v1`, área protegida do CLAUDE.md (nunca remover/renomear
campo, incompatibilidade exige `/v2`, testar com `curl` antes de commitar, atualizar
`backend/docs/ia-consulta-api.md` no mesmo commit). Sem trabalho de código a planejar agora — só decisão do
dono (pergunta 5 no fechamento).

---

## Ordem recomendada de execução em ondas

**Onda 1 (paralela, sem conflito de arquivo):**
- A1 (fundação + `PainelEmbarque` piloto) — dev-frontend 1.
- A4 (foco/cursor, bug flagship `PainelEstoque.jsx`) — dev-frontend 2, isolado.
- A3 backend (endpoint agregador) — dev-backend, isolado do front nesta fase.
- B1 (Assistente de Pedido) — dev-frontend 3, arquivo próprio (`NovoPedido.jsx`).

**Onda 2 (depois de A1 ter `PageHeader`/`EstadoVazio` prontos):**
- A1 continua nas pilotos restantes (`ListaClientes`, `ContasReceberTabela`, `ListaPedidos`, `RotaLeads`
  topo).
- B3 (Clientes: aba Qualidade dos Dados), depois que A1 tocar `ListaClientes.jsx`.
- B2 (Card da Rota) em paralelo com A1 em `RotaLeads.jsx` se os devs combinarem o trecho de cada um.
- A3 frontend (tela `/pendencias`), depois do contrato do endpoint fechado na onda 1.

**Onda 3 — `App.jsx` em sequência, um dono só do arquivo nesta janela** (evita 3 PRs simultâneos no mesmo
bloco de ~80 linhas): 1) A2 (menu por perfil, reestrutura `desktopSections`, é a base) → 2) A3 (entrada
"Pendências" em cima da estrutura já filtrada) → 3) B4 (fundir Site+Kit Festa). Alternativa se o prazo
apertar: um único dev-frontend faz os três diffs em sequência no mesmo branch — mais lento, mais seguro
para o arquivo de navegação global.

**Deixar para uma rodada seguinte:**
- B5 — depende de decisão externa (ver acima).
- Blocos "secundários" da Central de Pendências sem serviço de backend identificado (NF-e rejeitada, notas
  recebidas sem conta, boletos/PIX >24h, tarefas atrasadas) — 2ª leva, depois dos 4-5 blocos prontos
  estarem no ar e aprovados.
- Fusões maiores do `experiencia.md` (Financeiro Gerencial 5-em-1, hub "Recebíveis", hub "Compras") **não
  fazem parte do escopo aprovado** — mencionar ao dono que existem, sem incluir nesta entrega.
- Varredura completa de A4 além do bug flagship — corrigir o citado pelo dono primeiro, avisar quantas
  telas mais foram encontradas e propor rodada 2 dedicada, sem esticar esta entrega sem avisar.

## Perguntas que só o dono responde (recomendação padrão para cada uma, dono indisponível agora)

1. **A2 — quem é "escritório" como perfil?** Não existe detecção hoje (só `gestor`/`entregador`/`vendedor`
   em `DashboardHome.jsx`). **Padrão:** "tem permissão de Financeiro, Notas Fiscais ou Embarque, mas não é
   gestor nem entregador" — revisar com o dono depois de ver o menu rodando.
2. **A3 — Pendências vira tela inicial do escritório/gerência ou cartão no Dashboard Gerencial?**
   **Padrão:** cartão no Dashboard Gerencial primeiro (menor risco) + entrada própria no menu; promover a
   tela inicial depois, se o uso mostrar que faz sentido.
3. **B1 — "Repetir último pedido" reconstitui o último PEDIDO exato ou a ÚLTIMA COMPRA de cada item?**
   Muda se precisa de endpoint novo (ver B1). **Padrão:** última compra de cada item (sem mudança de
   backend, entrega mais rápido); "pedido exato" fica como evolução se o dono preferir depois.
4. **A1 — o sweep de `text-gray-400`→`500` cobre só as 5 pilotos ou o dono autoriza sweep maior (137
   arquivos) já nesta rodada?** **Padrão:** só as 5 pilotos agora; resto fica como dívida catalogada,
   corrigida quando cada tela for tocada por outro motivo (regra "boy scout" do CLAUDE.md).
5. **B5 — vale abrir o endpoint de inadimplência para a Ana avisar o cliente antes de fechar pedido pelo
   WhatsApp?** Decisão de exposição de dado financeiro, não técnica. **Padrão:** não agora — proposta
   registrada para quando o dono quiser avaliar (área protegida do CLAUDE.md: contrato de API + WhatsApp
   transacional).
