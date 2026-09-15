# Relatório de QA — Etapa 1 "Entrada de Notas cria Produto de verdade"

Branch `feat/entrada-notas-produto`, worktree `~/Projetos/CA-Hardt-entrada-notas`. Teste feito
clicando na tela de verdade — backend local (`PORT=3000`) + Vite (`PORT=5173`) + Chrome via
puppeteer-core, banco `hardt_local`. Usuária de teste: **Josiane**, com `permissoes.admin: true`
setado **temporariamente só no banco local** para acessar Financeiro/PCP/Admin nesta sessão
(revertido ao final — ver seção Limpeza). Dados de teste (nota fiscal, itens, itens PCP órfãos)
criados via Prisma no `hardt_local` e **todos removidos ao final** (ver Limpeza).

## Veredito: **PASSOU COM RESSALVAS**

O fluxo funciona de ponta a ponta exatamente como especificado no plano e provado com evidência
de banco de dados (não só a tela). Backend é sólido — todas as travas (categoria obrigatória,
`criarItemPcp` desativado, estoque respeitando a categoria) se comportam certo, inclusive nos
casos de erro. Encontrei **dois defeitos de UI** (não de dados) que merecem correção antes de
anunciar a funcionalidade para a equipe: o texto de pré-visualização e o toast de "estoque
atualizado" dizem "soma no estoque" mesmo para itens de categoria que **não controla estoque**
(ex.: Material de Uso e Consumo) — o dado grava certo, mas a mensagem na tela engana quem está
conferindo.

---

## Cenários testados

| # | Cenário | Resultado | Evidência |
|---|---|---|---|
| 1 | Notas Recebidas → nota nova mostra os 3 destinos por item (Vincular / Criar produto novo / Não é estoque) | **PASSOU** | Screenshot da tela de conferência com os 3 botões-pílula por item |
| 2 | Modal "Criar produto a partir da nota": nome pré-preenchido, "Na nota veio como", categoria obrigatória (SelectBusca), categoria comercial, EAN/NCM pré-preenchidos e editáveis, unidade+conversão, controle de estoque em 3 pílulas | **PASSOU** | Screenshot do modal completo |
| 3 | Criar produto com categoria **Matéria-Prima** → Produto criado + ItemPcp MP espelho + estoque somado | **PASSOU** | DB: `Produto.estoqueTotal=25`, `custoManual=5`; `ItemPcp` tipo `MP` com `produtoId` setado; `NotaEntradaEstoqueMov` com 1 linha (qtd 25); `CompraItem.semEstoque=false` |
| 4 | Criar produto com categoria **Material de Uso e Consumo** → Produto criado, **sem** estoque | **PASSOU** | DB: `Produto.estoqueTotal=0`; **nenhum** `ItemPcp` espelho criado (`itemPcpId: null` na resposta); **nenhuma** linha no ledger; `CompraItem.semEstoque=true`, `quantidade=2`, `custoUnitario=40` |
| 5 | "Não é estoque" com motivo **Imobilizado** | **PASSOU** | DB: `NotaEntradaItem.semEstoqueMotivo = 'IMOBILIZADO'` gravado |
| 6 | Rótulo do campo "Categoria da despesa (Contas a Pagar / DRE)" | **PASSOU** | Visível no screenshot, exatamente como pedido no plano |
| 7 | Sem categoria (produto ou padrão) → mensagem clara, não salva | **PASSOU** | Toast "Defina a categoria de custo dos itens (ou a categoria padrão) antes de enviar para a Conta Azul." — **nenhuma chamada POST disparada** (rede monitorada, zero requests) |
| 8 | Toast lista produtos criados | **PASSOU** | Toast "2 produtos criados: FARINHA DE TRIGO ESPECIAL QA TESTE 25KG, LUVA DESCARTAVEL CAIXA QA TESTE" |
| 9 | Envio final gera conta a pagar (`POST /gerar-conta`) | **PASSOU** | `201`, `contaPagarId` criado, `notaStatus: "CONFERIDA"`, `produtosCriados` com os 2 itens e `itemPcpId` correto (preenchido para MP, `null` para Uso e Consumo) |
| 10 | Regressão: conferir vinculando a **produto já existente** (fluxo clássico) continua gerando conta e somando estoque | **PASSOU** | `POST /gerar-conta` → `201`, `produtosCriados: []` (nada criado à toa), `estoque` mostra o item vinculado; DB confirma `ACUCAR REFINADO KG` foi de `estoqueTotal=0` para `10`, `custoManual=6` |
| 11 | Admin → Produtos → ficha do produto nascido da nota: "Cadastrado a partir da NF-e X (fornecedor) em data como '…'" e "Fornecedores que já vieram…" | **PASSOU** | Screenshot da ficha mostrando as duas seções com os dados corretos (NF-e 99001, FORNECEDOR TESTE QA LTDA, 15/09/2026) |
| 12 | Ficha do produto: NCM/EAN editáveis e salvam de verdade | **PASSOU** | Editei o NCM na tela (`99887766`), salvei, e **conferi direto no banco** — persistiu |
| 13 | Admin → Produtos → "Novo produto": categoria passou a ser obrigatória | **PASSOU** | Preenchi nome e tentei criar sem categoria → toast "Escolha a categoria do produto — é obrigatória.", **nenhuma chamada POST disparada** |
| 14 | PCP → Itens: item órfão mostra os 3 botões (Enviar para Produtos / Mudar tipo / Excluir); item COM produto (já vinculado) não mostra esses botões — não testei esse negativo especificamente, mas confirmei o positivo em todos os órfãos listados | **PASSOU** (parcial — ver Não testado) | Screenshot da listagem + `title` dos botões via DOM |
| 15 | "Enviar para Produtos" com categoria **fora de produção** (Uso e Consumo) → `window.confirm` de aviso, item **inativado**, estoque **não transferido** | **PASSOU** | Diálogo real capturado: *"...Este item do PCP será INATIVADO e o estoque dele NÃO é transferido sozinho..."*; resposta da API `201` com `"tornouEspelhoPcp":false,"estoqueNaoTransferido":3`; DB confirma `ativo:false`, `produtoId` setado, `estoqueAtual` do item PCP preservado em 3 (não somado ao produto) |
| 16 | "Mudar tipo" em item órfão | **PASSOU** | `PUT /pcp/itens/:id` → `200`, `tipo` mudou de `PA` para `MP` de fato (conferido na resposta da API) |
| 17 | "Excluir" item órfão **limpo** (sem uso) | **PASSOU** | `window.confirm` real capturado, `DELETE` → `204`, item sumiu da listagem |
| 18 | "Excluir" item órfão **usado** em receita real (`SUB-0009`) | **PASSOU** | Botão vem **desabilitado** direto do `podeExcluir` da listagem, com tooltip explicando o motivo: *"Este item está em uso — não pode ser excluído. Use Inativar."* (UX melhor que deixar clicar e devolver 409) |
| 19 | Categorias comerciais (`/config/categorias-produto`): sem o toggle "controla estoque" | **PASSOU** | Página carregada e texto "controla estoque" **não aparece em nenhum lugar** (busca no texto da página inteira) |
| 20 | Mobile 375px — Notas Recebidas (lista) | **PASSOU** | `scrollWidth === clientWidth === 375` (sem scroll horizontal); screenshot confirma layout empilhado |
| 21 | Mobile 375px — Conferência de nota (tela cheia) | **PASSOU** | `scrollWidth === 375`; screenshot mostra pílulas, campos e botões legíveis, empilhados |
| 22 | Mobile 375px — Modal "Criar produto a partir da nota" | **PASSOU** | Confirmado via DOM que o modal tem `fixed inset-0 ... items-end` (abre como folha subindo do rodapé, como manda o design system); screenshot **sem** `fullPage` confirma renderização correta (a primeira captura com `fullPage:true` mostrou o modal "duplicado" na página — é um artefato conhecido do Puppeteer com elementos `position:fixed` em screenshot de página inteira, não um bug real) |
| 23 | Mobile 375px — PCP → Itens (cards) | **PASSOU** | Sem scroll horizontal; cards com os 3 botões em largura total, texto completo, sem corte |
| 24 | Mobile 375px — Ficha do Produto (Admin → Produtos) | **PASSOU** | Sem scroll horizontal; seções "Cadastrado a partir da NF-e" e "Fornecedores" legíveis e sem overflow |
| 25 | Console do navegador durante todo o fluxo | **PASSOU** | Sem nenhum erro JS não tratado (`pageerror`) nos testes de desktop e mobile — só avisos de acessibilidade (`autocomplete`) e falhas de `ERR_CONNECTION_CLOSED` de recursos que não afetaram a funcionalidade (favicon/HMR do Vite) |

---

## Defeitos encontrados

### DEFEITO 1 (moderado) — Preview "Entrada convertida" sempre diz "soma no estoque", mesmo quando não soma

**Onde:** `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx`, por volta da linha 3131.

**Como reproduzir:**
1. Ir em Notas Recebidas → Conferir uma nota → item → "Criar produto novo".
2. Escolher uma categoria que **não controla estoque** (ex.: "Material de Uso e Consumo").
3. Olhar o campo "Entrada convertida" do item: mostra **"→ soma no estoque"** em verde, igual a
   um item de Matéria-Prima.

**Evidência:** screenshot `25-apos-item1-item2.png` (capturado durante a sessão) mostra os dois
itens lado a lado — "25 KG → soma no estoque · custo R$5,00/KG" (Matéria-Prima, correto) e
"2 CX → soma no estoque · custo R$40,00/CX" (Material de Uso e Consumo, **texto errado** — o
banco confirma que **não** somou: `Produto.estoqueTotal=0`, sem `ItemPcp` espelho, sem linha no
ledger).

**Causa (código lido, não só suposição):** o trecho é condicional só a `vinculado` e `fator > 0`,
nunca consulta a categoria escolhida:
```jsx
<span className="text-green-700 font-medium ml-1.5">→ soma no estoque</span>
```

**Por que importa:** quem está conferindo a nota lê essa linha para saber se o estoque vai subir.
Para um item de uso e consumo, ela afirma o oposto do que realmente vai acontecer — o dado está
certo no banco, mas a pessoa pode achar que esqueceu de marcar "não controla estoque" e ficar
confusa, ou pior, pode achar que o sistema errou depois de ver o estoque do produto em 0.

### DEFEITO 2 (moderado) — Toast "Estoque atualizado" lista item que não teve estoque atualizado

**Onde:** `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx`, função `toastEstoque` (linha
~174).

**Como reproduzir:** mesmo cenário do Defeito 1, até o fim (clicar em "Gerar Conta a Pagar").

**Evidência:** screenshot `35-apos-gerar-conta.png` — o toast diz **"Estoque atualizado: +25 KG
FARINHA DE TRIGO ESPECIAL QA TESTE 25KG · +2 CX LUVA DESCARTAVEL CAIXA QA TESTE"**, incluindo a
LUVA (Material de Uso e Consumo) como se tivesse entrado em estoque. A própria resposta da API
que alimenta esse toast já vem com a distinção certa —
`"estoque":[...,{"nome":"LUVA...","destino":"PROD","semEstoque":true}]` — só que a função do
toast não olha o campo `semEstoque` e mistura os dois na mesma frase.

**Por que importa:** mesmo problema do Defeito 1, mas na confirmação final — reforça a mensagem
errada logo depois de salvar, quando a pessoa está menos propensa a duvidar.

**Sugestão pro dev (não é o meu papel corrigir, mas fica registrado):** os dois pontos podem
filtrar/rotular por `item.semEstoque` (ou, no preview, pela categoria escolhida) — trocar "→ soma
no estoque" por algo como "→ NÃO soma estoque (categoria não controla)" quando aplicável, e
separar a lista do toast em duas frases ou excluir os `semEstoque:true` da contagem "+N".

---

## O que NÃO pôde ser testado (e por quê)

1. **Impressão/AirPlay/PWA em iPad/iPhone reais** — não se aplica a esta entrega (não há tela de
   impressão nova), mas registrando por padrão: Chrome headless local não prova comportamento do
   Safari real.
2. **`prisma db push` em produção** — o relatório do backend já registra que isso não foi feito
   (só ALTER TABLE manual no local); não é algo que QA prova sozinho, precisa acontecer no deploy
   real. **Nada disto foi testado em produção.**
3. **Item COM produto não mostra os botões de órfão** — validei visualmente que todos os itens
   **sem** produto mostram os 3 botões; não abri a tela com um item que JÁ tem produto vinculado
   para confirmar que os botões somem nesse caso (não achei um exemplo rápido na base local sem
   mexer em dado de produção real). Fica como lacuna pequena — o código (`ItensPcp.jsx`) usa
   `produtoId == null` como condição, então é baixo risco, mas não é a mesma coisa que ter visto
   na tela.
4. **DELETE 409 realmente devolvido pela API** — testei o caminho onde o **botão já vem
   desabilitado** (UX correta, impede o clique). Não forcei uma chamada `DELETE` direta via
   `fetch`/curl para ver o corpo do erro 409 na tela (o botão desabilitado torna esse caminho
   inacessível pela UI, que é o que importa para o usuário final — mas não vi o toast de erro 409
   com meus próprios olhos).
5. **PUT 400 "SUB resultado de receita ativa" na tela** — não tentei mudar o tipo de um SUB que é
   resultado de receita ativa para ver o toast de erro (evitei mexer em subprodutos reais de
   produção, como manda a regra "local não é produção"); o backend já provou isso via curl no
   próprio relatório dele.
6. **Categoria "fora da lista carregada" no modal** — não testei o caso do modal `SelectBusca`
   sem opções por falha de rede (o relatório do dev já assume que não há tratamento de erro nesse
   caso extremo).

---

## Regras do projeto conferidas

- **`$transaction` com timeout** — não testei diretamente (exigiria simular banco lento), mas o
  relatório do backend documenta `{timeout:20000, maxWait:10000}` nas transações tocadas; aceito
  a documentação dele como evidência de código (não é algo que QA prova clicando).
- **Schema só adiciona campos** — não removi nada ao rodar os testes; os campos novos
  (`nomeOrigemNota`, `notaOrigemId`, `CompraItem.semEstoque`) apareceram nas respostas da API sem
  quebrar nada existente.
- **SelectBusca em vez de `<select>` nativo** — confirmado em todos os dropdowns novos (categoria
  do modal, categoria comercial, controle de estoque, motivo "não é estoque", forma de pagamento,
  categoria padrão) — todos renderizam como o componente customizado, não o `<select>` do
  sistema operacional.
- **Mobile obrigatório** — testado nas 4 telas relevantes em 375px, sem scroll horizontal.

---

## Limpeza feita ao final

- Removidas as 2 notas de teste (`NF-e 99001`, `NF-e 99002`), seus itens, `CompraItem`,
  `NotaEntradaEstoqueMov`, contas a pagar e parcelas geradas.
- Removidos os 3 produtos criados no teste (Farinha, Luva, Item QA Orfão Promover Uso) e a
  `MovimentacaoEstoque` associada.
- Removidos os 3 `ItemPcp` de teste (`QA-ORFAO-001/002/003` e o espelho MP da Farinha).
- `ACUCAR REFINADO KG` (produto real usado no teste de regressão) revertido para
  `estoqueTotal=0`, `custoManual=null` (estado anterior ao teste).
- Permissão `admin: true` **removida** da usuária Josiane (só existia para esta sessão de QA);
  senha de teste local limpa (`senha: null`).
- Categorias de estoque (`Matéria-Prima`, `Embalagem`, `Material de Uso e Consumo`) **não foram
  removidas** — já existiam no `hardt_local` antes deste teste (achado ao consultar o banco no
  início da sessão), não foram criadas por mim.
- Backend (porta 3000), Vite (porta 5173) e todas as instâncias headless do Chrome derrubados ao
  final.
- Nenhum arquivo do projeto foi editado por mim (só scripts de apoio no scratchpad da sessão,
  fora do repositório, e scripts temporários no `backend/` que também foram apagados).

---

## Recomendação ao gerente de entrega

Backend: pronto, com evidência de banco em todos os casos do contrato. Frontend: funcionalmente
completo e testado clicando, incluindo erro e mobile — mas com os 2 defeitos de mensagem
(Defeitos 1 e 2 acima) que devem voltar para o dev-frontend antes de anunciar a novidade para a
equipe. Nenhum dos dois corrompe dado ou bloqueia o fluxo — é só o texto que engana.
