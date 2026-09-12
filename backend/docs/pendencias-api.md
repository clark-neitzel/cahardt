# Central de Pendências — `GET /api/pendencias`

Endpoint agregador para a tela `/pendencias` (A3 do plano `docs/melhorias-2026-09/PLANO-EXECUCAO-nav-design-vendas.md`).
Reúne em UMA chamada o que está esperando um clique do escritório/gerência, em vez de abrir 8 telas
separadas. A tela em si (frontend) é da próxima onda — este documento é o CONTRATO para quem for
construí-la.

- Implementação: `backend/services/pendenciasService.js` + `backend/routes/pendenciasRoutes.js`
- Montado em `backend/index.js`: `app.use('/api/pendencias', authMiddleware, pendenciasRoutes)`
- Só leitura — nenhum bloco entra em `$transaction`. Cada bloco tem seu próprio `try/catch`: se um
  falhar, os outros seguem e o bloco quebrado volta com `erro: true` (contador 0, itens vazios).
- Medido no banco local (`hardt_local`, dados de teste — bem mais volumoso que produção em alguns
  blocos por causa de pedidos de teste antigos sem NF-e/cobrança): **33–84ms** para a chamada completa
  (8 blocos), rodando local sem concorrência. **Não testado sob carga de produção** — ver "Riscos".

## Permissão

`isAdmin || Pode_Acessar_Financeiro_Gerencial || Pode_Ver_Pendencias`

`Pode_Ver_Pendencias` é permissão NOVA, registrada no `BOOL_INDEX` de
`frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` (seção "financeiro", ao lado de
`Pode_Acessar_Financeiro_Gerencial`) e no objeto de permissões padrão (`permissoesDefault`) do mesmo
arquivo. Sem `admin` nem nenhuma das duas, a rota devolve `403`.

## Request

```
GET /api/pendencias?limite=5
Authorization: Bearer <token>
```

- `limite` (opcional, default `5`, mín. 1, máx. 20) — quantas linhas trazer por bloco. O `contador` de
  cada bloco é sempre o total real (não é limitado por `limite`); só a lista `itens` é cortada.

## Resposta (exemplo real, banco local, admin)

```json
{
  "geradoEm": "2026-09-12T21:02:00.000Z",
  "totais": { "total": 1275, "dinheiroParado": 104581.69, "vencidas": 0, "avisos": 432 },
  "blocos": [
    {
      "chave": "pedidos_aprovar",
      "titulo": "Pedidos aguardando aprovação",
      "severidade": "ambar",
      "contador": 12,
      "itens": [
        {
          "id": "98d60f96-bf55-40b6-a5e3-7e2a11e842e3",
          "titulo": "ZZ#14 · SHEILLY RAQUEL DE MENEZES ANTUNES",
          "subtitulo": "Pedido especial aguardando aprovação",
          "valor": 250.67,
          "dataRef": "2026-03-24T12:00:00.000Z",
          "rota": "/pedidos",
          "acao": {
            "tipo": "aprovar_pedido",
            "label": "Aprovar",
            "endpoint": "/api/pedidos/98d60f96-bf55-40b6-a5e3-7e2a11e842e3/aprovar-especial",
            "metodo": "PUT"
          }
        }
      ],
      "rotaVerTodos": "/pedidos"
    }
  ]
}
```

## Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `geradoEm` | string ISO | Timestamp de quando a agregação rodou (não é cacheado). |
| `totais.total` | int | Soma dos `contador` de todos os blocos. |
| `totais.dinheiroParado` | number | Soma de `valorTotal` de `caixas_conferir` + `boletos_nao_enviados`. |
| `totais.vencidas` | int | Soma dos `contador` de `tarefas_atrasadas` + `notas_sem_conta` (pendências com prazo já estourado). |
| `totais.avisos` | int | Soma dos `contador` de `nfe_rejeitada` + `boletos_nao_enviados` + `producao_sugerida` (precisa de atenção, sem prazo estourado por si só). |
| `blocos[].chave` | string | Identificador estável do bloco (usar para ícone/rota no front, nunca o `titulo`). |
| `blocos[].titulo` | string | Rótulo pronto para exibir. |
| `blocos[].severidade` | `'vermelho'\|'ambar'\|'cinza'` | Cor sugerida do card/badge. |
| `blocos[].contador` | int | Total real (não limitado por `?limite`). |
| `blocos[].valorTotal` | number? | Só nos blocos com valor monetário relevante (`caixas_conferir`, `notas_sem_conta`, `boletos_nao_enviados`). |
| `blocos[].itens[]` | array | Até `limite` linhas, já formatadas para exibir direto (sem o front ter que remontar título). |
| `blocos[].itens[].acao` | object? | Quando existe, é a AÇÃO DE 1 CLIQUE — mesmo endpoint que a tela original usa. `null`/ausente quando a ação exige decisão humana (ex.: contar dinheiro, revisar nota). |
| `blocos[].rotaVerTodos` | string | Rota do app para "ver todos" desse bloco. |
| `blocos[].erro` | bool? | Só aparece quando o bloco falhou ao consultar — os outros blocos continuam normais. |

## Os 8 blocos desta leva

### `pedidos_aprovar` — Pedidos aguardando aprovação
- **Fonte:** mesmo critério de `ListaPedidos.jsx` (aba de aprovação) / `pedidoController.aprovarEspecial`
  e `aprovarBonificacao` (`backend/controllers/pedidoController.js`).
- **Critério:** `cancelado=false`, `statusEnvio IN (ABERTO, ERRO)`, (`especial=true` OU `bonificacao=true`),
  `situacaoCA` fora de `(APROVADO, FATURADO, EM_ABERTO)` (OR explícito com `null` — `notIn` do Prisma
  exclui linha `null` sozinho).
- **Ação de 1 clique:** `PUT /api/pedidos/:id/aprovar-especial` ou `.../aprovar-bonificacao` (mesmo
  endpoint que o botão "Aprovar" da tela Pedidos chama).
- Contagem local conferida por SQL direto: bate (13 = 13).

### `nfe_emitir` — NF-e a emitir
- **Fonte:** MESMO critério e MESMA lógica do chip "Sem nota" de
  `frontend/src/pages/Financeiro/NotasFiscais.jsx` (linha ~260:
  `pedidos.filter(p => !p.notaCA && !p.nota && p.podeEmitir !== false)`), calculados a partir do `where`
  da fila `GET /api/notas-fiscais/fila` (`backend/routes/notasFiscaisRoutes.js`): pedido de venda ou
  bonificação-com-nota, não cancelado, com número, `situacaoCA` fora de `(CANCELADO, EXCLUIDO)`.
- **A nota é achada pelo `ref` do AMBIENTE ATUAL** (`nf-{h|p}-{pedidoId}`, igual ao `.find()` do
  frontend) — **não** basta checar "o pedido tem alguma `notaFiscalApp`" (ver histórico abaixo). Pedido
  bloqueado por aprovação de bonificação (`bonificacao && statusEnvio !== 'RECEBIDO'`) não entra aqui
  (ele já está em `pedidos_aprovar`).
- Pedido com tentativa que deu erro **não** entra aqui — vai para `nfe_rejeitada` (evita contar a mesma
  pendência duas vezes); mas só some daqui porque a nota ERRO existe com o `ref` do ambiente atual — uma
  nota ERRO de outro ambiente não impede o pedido de aparecer aqui, igual à tela original.
- **Ação de 1 clique:** `POST /api/notas-fiscais/emitir/:pedidoId` (mesmo endpoint do botão "Emitir" da
  fila).
- **Implementação (100% em SQL, sem backstop):** como o `ref` é sempre `nf-{h|p}-{pedidoId}` (o prefixo
  do ambiente é fixo, só o `pedidoId` muda) e a coluna `ref` é `@unique` (indexada), o filtro fica
  `notasFiscaisApp: { none: { ref: { startsWith: prefixo } } }` — "nenhuma nota DESTE PEDIDO cujo `ref`
  comece com o prefixo do ambiente atual" — dentro da relação já escopada ao próprio pedido isso é
  semanticamente igual ao match exato do frontend (só teria diferença se existisse, para o mesmo pedido,
  uma nota de OUTRO pedido, o que a FK não permite). `count()` e `findMany()` compartilham o mesmo
  `where` — o contador é sempre o total exato, nunca truncado, e nenhum pedido é carregado na memória do
  Node só para ser descartado no filtro.
- **Histórico:**
  - *Achado do QA (09/2026):* a primeira versão usava `notasFiscaisApp: { none: {} }` — "o pedido não
    tem NENHUMA nota, em nenhum ambiente" — e contava **815** contra **820** da réplica exata do chip
    original (o "823" citado na ressalva era o total bruto da fila, não o do chip "Sem nota" — o número
    certo para comparar era 820). 5 pedidos de teste/homologação com uma `notaFiscalApp` "solta" de
    outro ambiente ficavam de fora indevidamente.
  - *Achado do revisor (09/2026):* a correção do item acima passou a carregar até 2000 pedidos com
    `notasFiscaisApp` incluído e filtrar em JS — resolvia o número, mas pesado (JOIN + array na memória
    a cada chamada) e o contador ficava truncado em silêncio acima do backstop. Substituído pelo filtro
    `startsWith` 100% em SQL descrito acima.
  - **Reconferido depois das duas correções:** réplica isolada da lógica original = **820**; `count()`
    do bloco = **820** (`bate exatamente`); `EXPLAIN ANALYZE` do `count()` isolado no banco local:
    **1,8ms** (plano `Hash Anti Join` — no volume de produção, com o índice `@unique` de `ref`, tende a
    usar `Anti Join` por índice em vez de sequential scan, mas isso só se confirma olhando o plano em
    produção, não local). Endpoint completo (8 blocos): **33–84ms**.

### `nfe_rejeitada` — NF-e rejeitada pela SEFAZ
- **Fonte:** `notas_fiscais_app` com `status IN (ERRO, DENEGADO)` (gravado por
  `backend/services/focusNfeEmissaoService.js`, que também grava `mensagemSefaz` com o motivo).
- `subtitulo` traz os primeiros 140 caracteres da mensagem da SEFAZ/Focus.
- **Ação de 1 clique:** `POST /api/notas-fiscais/emitir/:pedidoId` (reemissão — mesma rota, novo
  intento; o backend já trata reemissão sobre `ref` existente).

### `caixas_conferir` — Caixas para conferir
- **Fonte:** `caixaConferenciaService.listarAConferir({ usuario, perms, incluirHoje: false })` — a MESMA
  fila que já alimenta o card "Caixas p/ conferir" da agenda de Tarefas
  (`frontend/src/pages/Tarefas/CaixasPendentesAgenda.jsx`) e a tela do Caixa. Respeita a mesma
  visibilidade (quem pode conferir; o dono do caixa nunca vê o próprio caixa na fila).
- `valorTotal` = soma de `valorAPrestar` de TODOS os caixas da fila (não só os `limite` retornados).
- **Sem ação de 1 clique** — conferir dinheiro exige contagem humana; a linha só leva para `/caixa`.

### `notas_sem_conta` — Notas recebidas sem conta a pagar
- **Fonte:** `NotaEntrada` (`backend/routes/notasEntrada.js`) com `status = 'NOVA'`, `contaPagarId IS
  NULL`, `criadoEm <= agora - 2 dias`.
- **Sem ação de 1 clique** — virar conta a pagar exige revisão (produtos, fornecedor, forma de
  pagamento); a linha leva para `/notas-recebidas`.
- No banco local o contador deu 0 (não há nota de teste parada há mais de 2 dias) — conferido também
  por SQL direto.

### `boletos_nao_enviados` — Faturados sem cobrança gerada
- **Sem função pronta identificada no repo** para este critério (ver texto do plano). Implementado o
  critério mais simples, todo em banco local (sem bater no Conta Azul, ao contrário da checagem de
  `backend/services/impressaoLoteService.js`, que consulta a API do CA e por isso é mais lenta e não
  serve para um endpoint agregador):
  - pedido de venda normal (`especial=false`, `bonificacao=false`), `cancelado=false`,
    `situacaoCA = 'FATURADO'`;
  - condição a prazo — mesmo teste `A_PRAZO` de `impressaoLoteService.js`
    (`tipoPagamento === 'BOLETO_BANCARIO'` OU `nomeCondicaoPagamento` contém "boleto");
  - criado há mais de 24h (`createdAt <= agora - 24h`);
  - **nenhuma** `CobrancaAsaas` (PIX ou boleto) já gerada para o pedido (`cobrancasAsaas: { none: {} }`).
  - Trava de segurança: no máximo 200 pedidos entram no cálculo de `valorTotal`/lista completa (bloco
    de anomalia — não deveria ter volume alto; se estourar, é sinal de que algo mais sério está errado
    e precisa de investigação, não só desta tela).
- **Ação de 1 clique:** `POST /api/asaas/boletos` com `{ pedidoIds: [id] }` (mesmo endpoint que a tela de
  Contas a Receber/lote usa para gerar cobrança a partir de uma lista de pedidos).
- No banco local o contador deu 431 — **provavelmente superestimado para produção**: o critério não
  verifica se o cliente já tem boleto emitido *direto no Conta Azul* (só olha `CobrancaAsaas`, que é a
  tabela do fluxo Asaas do app); pedido antigo faturado antes do Asaas existir cai aqui mesmo já tendo
  sido cobrado por fora. **Recomendo o dev-frontend/gerente validar esse número contra um dia real de
  produção antes de exibir como pendência "vermelha"** — por isso a severidade ficou `ambar`, não
  `vermelho`.

### `producao_sugerida` — Ordens de produção sugeridas
- **Fonte:** `sugestoes_producao` com `status = 'PENDENTE'` (mesmo status que
  `backend/services/pcpSugestaoService.js` usa como trava para aceitar/rejeitar, linha ~167).
- **Ação de 1 clique:** `PATCH /api/pcp/sugestoes/:id/aceitar` (mesmo endpoint do botão "Aceitar" da
  tela `/pcp/sugestoes`).

### `tarefas_atrasadas` — Tarefas atrasadas (minhas)
- **Fonte:** mesma regra de `GET /api/tarefas/pendentes` (`backend/routes/tarefaRoutes.js`) — tarefa
  `ativo=true`, `responsavelId = usuário logado`, que já "tocou" hoje (considerando recorrência:
  `NUNCA/DIARIA/DIAS_UTEIS/SEMANAL/MENSAL/DIAS_SEMANA`) e ainda não foi concluída.
  - **Importante:** os helpers de recorrência (`ocorreNoDia`, `minutos`) foram **replicados** dentro de
    `pendenciasService.js` em vez de importados de `tarefaRoutes.js`, porque o arquivo de rota não os
    exporta e é tocado por várias telas. Se a regra de recorrência mudar em `tarefaRoutes.js`, **precisa
    mudar também aqui** (comentário deixado no topo do arquivo).
  - Só mostra as tarefas do PRÓPRIO usuário — ver a agenda de colegas é outra permissão
    (`Pode_Ver_Agenda_Colegas`), fora do escopo deste bloco.
- **Sem ação de 1 clique** — concluir tarefa é um ato do usuário na hora certa; a linha leva para
  `/tarefas`.

## Testes rodados (curl, banco local `hardt_local`)

Servidor local levantado com `JWT_SECRET` temporário (variável não estava setada no `.env` local — cada
sessão precisa definir a própria, não fica salva em arquivo).

```bash
# Sem a permissão (usuário Josiane, admin=false, sem Pode_Ver_Pendencias/Financeiro_Gerencial)
curl http://localhost:3000/api/pendencias -H "Authorization: Bearer $SEMPERM"
# → 403 {"error":"Sem permissão para acessar a Central de Pendências."}

# Com admin (usuário Clarkson)
curl http://localhost:3000/api/pendencias -H "Authorization: Bearer $ADMIN"
# → 200, geradoEm + totais + 8 blocos (ver exemplo acima)
# tempo: 33-84ms em chamadas seguidas

curl "http://localhost:3000/api/pendencias?limite=2" -H "Authorization: Bearer $ADMIN"
# → cada bloco com no máximo 2 itens (contador continua sendo o total real)
```

Contagens de `pedidos_aprovar`, `nfe_rejeitada` e `notas_sem_conta` conferidas por SQL direto no banco
local — bateram exatamente com o JSON da rota.

**Verificação extra do bloco `nfe_emitir` (ver "Histórico" na seção do bloco acima):** rodei um script
isolado (descartado depois do teste, não commitado) que replica em Prisma puro a lógica exata do chip
"Sem nota" do `NotasFiscais.jsx` (find por `ref` do ambiente atual) e comparei o resultado com o `count()`
do `where` 100% em SQL (`notasFiscaisApp: { none: { ref: { startsWith: prefixo } } }`) — **820 = 820**,
bate exatamente. `EXPLAIN ANALYZE` do `count()` isolado: 1,8ms no banco local (plano `Hash Anti Join`).
Reconferido também com o servidor rodando via `curl` (bloco voltou com `contador: 820`, 33-84ms para a
chamada completa dos 8 blocos).

`node --check` limpo em `backend/services/pendenciasService.js`, `backend/routes/pendenciasRoutes.js` e
`backend/index.js`. `cd frontend && npm run build` passou depois de adicionar `Pode_Ver_Pendencias` ao
`PermissoesModal.jsx`.

## Riscos / o que não foi provado

- **Volume de produção não testado** — o banco local tem dados de teste distorcidos (820 "sem NF-e",
  431 "sem cobrança" — quase certamente inflados por pedidos de teste antigos). Antes de expor a tela ao
  escritório, alguém precisa rodar este endpoint contra produção (só leitura, `GET`, sem risco de
  escrita) e conferir se os números fazem sentido e se o tempo de resposta continua bom com o volume
  real.
- **`boletos_nao_enviados`** é o bloco mais frágil — critério "mais simples" documentado acima, não
  reaproveita nenhuma função pronta, e pode gerar falso-positivo para pedidos faturados antes do Asaas
  existir no fluxo, ou cobrados fora do app. Marcar como prioridade de revisão quando a tela for feita.
- **`caixas_conferir`** chama `caixaConferenciaService.listarAConferir`, que por sua vez chama
  `calcularValorAPrestar` para cada caixa da fila (um a um) — em produção, com fila maior, pode pesar
  mais que os outros blocos. Não vi isso no teste local (fila pequena, 11 caixas) — medir com fila maior
  antes de confiar cegamente no tempo total.
- **Permissão nova só funciona em produção depois do deploy do backend E do frontend** (o toggle só
  aparece no painel depois do frontend publicado com o `BOOL_INDEX` atualizado). Até lá, só quem já tem
  `admin` ou `Pode_Acessar_Financeiro_Gerencial` consegue acessar a rota.
- Não testei o caminho `erro: true` de um bloco (não simulei falha proposital em nenhum service) — a
  estrutura de `try/catch` por bloco está no código e o padrão segue o mesmo já usado em
  `backend/routes/caixa.js` (`res.json([])` em vez de derrubar a rota inteira), mas não bati um cenário
  real de falha.
