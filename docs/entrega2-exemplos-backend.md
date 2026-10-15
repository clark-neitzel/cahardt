# Entrega 2 (Inadimplência visível) — exemplos REAIS de resposta do backend

Colados de `curl` contra o backend local (`hardt_local`, 14/10/2026). IDs/nomes são do banco local de testes.
Contrato do plano: `docs/plano-inadimplencia-visivel.md` (seções 3 e 4.3). Tudo **aditivo** — nenhum campo existente mudou.

**Situacao-resumida** (mesma forma em todo lugar): `{ inadimplente, totalVencido, parcelasVencidas, diasMaisAntiga, aConfirmar, bloqueiaVenda }`.
`aConfirmar` = `null` ou `{ valor, dias, forma, parcelas }`.

---
## 1. `POST /api/inadimplencia/lote` (qualquer logado)
Corpo `{ "clienteIds": [...] }` (aceita também `ids`). Máx. 500; id desconhecido volta como "em dia". Chave `data` indexada pelo id.

```
POST /api/inadimplencia/lote   {"clienteIds":["516b5d56-3d95-4294-ae5d-e2dbe95ec038","001e6b27-6e24-4448-b137-0aacc87c326d","inexistente"]}
200
{"data":{"516b5d56-3d95-4294-ae5d-e2dbe95ec038":{"inadimplente":true,"totalVencido":562.87,"parcelasVencidas":1,"diasMaisAntiga":152,"aConfirmar":null,"bloqueiaVenda":true},"001e6b27-6e24-4448-b137-0aacc87c326d":{"inadimplente":false,"totalVencido":0,"parcelasVencidas":0,"diasMaisAntiga":null,"aConfirmar":null,"bloqueiaVenda":false},"inexistente":{"inadimplente":false,"totalVencido":0,"parcelasVencidas":0,"diasMaisAntiga":null,"aConfirmar":null,"bloqueiaVenda":false}}}
```
Erros:
```
{}                      -> 400 {"error":"Informe clienteIds como lista."}
501 ids                 -> 400 {"error":"No máximo 500 clientes por consulta."}
sem token               -> 401 {"error":"Token não fornecido ou inválido."}
{"clienteIds":[]}       -> 200 {"data":{}}
```

---
## 2. `GET /api/pedidos?pagina=1&tamanhoPagina=3` (modo paginado)
Chaves da resposta continuam as mesmas: `items, total, pagina, tamanhoPagina, contagens, contagensNota`. Cada item ganha `inadimplencia` (Situacao-resumida do `clienteId` do pedido; `null` se o pedido não tem cliente; o campo falta se o cálculo falhar — trate como "sem selo").
```
item[0] id=fd8e8899… clienteId=516b5d56… inadimplencia={"inadimplente":true,"totalVencido":562.87,"parcelasVencidas":1,"diasMaisAntiga":152,"aConfirmar":null,"bloqueiaVenda":true}
item[1] id=0a9bcde5… clienteId=001e6b27… inadimplencia={"inadimplente":true,"totalVencido":10,"parcelasVencidas":1,"diasMaisAntiga":30,"aConfirmar":null,"bloqueiaVenda":false}
```
**Filtro `soEmAtraso=1`** (também aceita `true`): só pedidos de clientes com `inadimplente` (selo vermelho; "a confirmar" NÃO entra). Aplicado no servidor, depois dos chips: `contagens` e `total` dos chips **não** mudam com o filtro; só `items`/`total` da lista.
```
GET /api/pedidos?pagina=1&tamanhoPagina=50&soEmAtraso=1   -> total 554, 50 itens, todos com inadimplencia.inadimplente=true
                                                              contagens {"TODOS":1207,"ABERTO":17,"ENVIAR":6,...} (idêntico ao sem filtro)
GET /api/pedidos?pagina=1&tamanhoPagina=1                 -> total 1207
```
O modo legado (sem `pagina`, devolve array — Rota/HistoricoModal/DetalheCliente) **não** recebe `inadimplencia`.

---
## 3. Travas de aprovação (403 `CLIENTE_EM_ATRASO`)
Formato do 403 (igual nas 3 rotas): `{ error, codigo:'CLIENTE_EM_ATRASO', totalVencido, diasMaisAntiga }`. Mostrar `error` em toast.
Só trava quando `bloqueiaVenda` do cliente. Permissão de aprovar (`Pode_Aprovar_Especial`) continua necessária; a de inadimplente é ADICIONAL.
Rotas travadas: `PUT /api/pedidos/:id/aprovar-especial` (é o "Aprovar agora"/"Faturar" — mesma rota), `POST /api/pedidos/:id/converter-especial`, `POST /api/congelados/pedidos/:id/aprovar`. **Bonificação NÃO trava** (decisão do dono; `aprovar-bonificacao` intocada).

```
PUT /api/pedidos/<especial de cliente devedor>/aprovar-especial   (usuário SEM Pode_Vender_Inadimplente)
403 {"error":"Este cliente está com contas em atraso. Só um responsável (permissão \"Vender para inadimplente\") pode liberar este pedido.","codigo":"CLIENTE_EM_ATRASO","totalVencido":562.87,"diasMaisAntiga":152}

(mesmo pedido, usuário COM Pode_Vender_Inadimplente) 200 {"message":"Pedido especial aprovado com sucesso.","pedido":{... "observacoes":"QA-INAD\n[qa-inad-com se responsabiliza pela aprovação — cliente com R$ 562,87 em atraso]" ...}}
(admin, devedor) 200, observação com "se responsabiliza pela aprovação"
(cliente em dia, usuário sem a permissão) 200

POST /api/pedidos/<especial>/converter-especial   (sem permissão, cliente devedor)
403 {"error":"Este cliente está com contas em atraso. ...","codigo":"CLIENTE_EM_ATRASO","totalVencido":562.87,"diasMaisAntiga":152}
(cliente em dia) 200 {"message":"Pedido convertido: ZZ#? virou o pedido #9990021. ...","convertido":true,"numeroAntigo":null,"numeroNovo":9990021}
```
A conta do próprio especial é ignorada no cálculo (`ignorarPedidoId`). Na conversão com permissão, a linha "se responsabiliza" é anexada às observações do pedido depois da conversão.

**Site/Ana** (`POST /api/congelados/pedidos/:id/aprovar`, módulo Site):
```
usuário sem permissão, cliente vinculado devedor:
403 {"error":"Este cliente está com contas em atraso. Só um responsável ... pode liberar este pedido.","codigo":"CLIENTE_EM_ATRASO","totalVencido":562.87,"diasMaisAntiga":152}
com permissão: passa; Pedido gerado fica com observacoes = "Site Congelados #48\n[qa-inad-com se responsabiliza pela aprovação — cliente com R$ 562,87 em atraso]"
tipoConversao "BONIFICACAO": a trava não se aplica.
```
Atenção front: neste endpoint o 403 vem do mesmo `erro()` do controller, então o corpo também pode trazer `code`/`itensSemEstoque` em outros erros (400). A trava usa `codigo`.

---
## 4. `GET /api/congelados/pedidos?status=AGUARDANDO` (fila do site/Ana)
Cada pedido ganha `inadimplencia` e `aguardandoResponsavel` (= `inadimplencia.bloqueiaVenda`). Só para pedidos **pendentes** (`AGUARDANDO`/`PENDENTE_CADASTRO`) **com cliente vinculado** (`congeladosCliente.clienteUuid`); nos demais: `inadimplencia:null, aguardandoResponsavel:false`.
```
{"id":"81943221-…","numero":49,"status":"AGUARDANDO","inadimplencia":null,"aguardandoResponsavel":false,"semEstoque":false}
{"id":"6e204eb7-…","numero":48,"status":"AGUARDANDO","inadimplencia":{"inadimplente":true,"totalVencido":562.87,"parcelasVencidas":1,"diasMaisAntiga":152,"aConfirmar":null,"bloqueiaVenda":true},"aguardandoResponsavel":true,"semEstoque":false}
```
O pedido continua na fila (nenhum filtro novo). Limitação: pedido `PENDENTE_CADASTRO` sem vínculo ainda não tem cliente → sem selo (o "Cliente sem cadastro" continua vindo primeiro na aprovação).

---
## 5. `GET /api/pendencias?limite=5` — bloco novo `liberacao_inadimplente`
```
totais: {"total":1276,"dinheiroParado":104581.69,"vencidas":0,"avisos":440}   // total e avisos agora somam o bloco novo
blocos (ordem): pedidos_aprovar, liberacao_inadimplente, nfe_emitir, nfe_rejeitada, caixas_conferir, notas_sem_conta, boletos_nao_enviados, producao_sugerida, tarefas_atrasadas
{ "chave":"liberacao_inadimplente","titulo":"Pedidos aguardando liberação (cliente em atraso)","severidade":"vermelho","contador":8,"rotaVerTodos":"/pedidos","itens":[
  {"id":"a7baec8c-9af1-4793-abc3-53be16a46dea","pedidoId":"a7baec8c-9af1-4793-abc3-53be16a46dea","numero":null,"clienteId":"bb20bcc6-6d51-4893-a023-9e1bea1aa493","cliente":"41.742.729 TERESINHA MARGARETE BASSANI DOMINGOS","origem":"ESPECIAL","totalVencido":799,"dias":98,"titulo":"ZZ#— · 41.742.729 TERESINHA MARGARETE BASSANI DOMINGOS","subtitulo":"Cliente em atraso: R$ 799,00 · 98d — precisa de um responsável", "valor":…, "dataRef":…, "rota":"/pedidos"} ,
  … (itens de origem "WHATSAPP_IA"/"SITE" têm rota "/pedidos-online?aba=site") ] }
```
Itens **sem `acao`** (front mostra "Abrir"). Não há duplicidade: contagem local = 14 pendentes de especial/bonificação = 8 (`pedidos_aprovar`) + 6 especiais no bloco novo; interseção dos ids = vazia. Itens dos demais blocos ganharam `clienteId` (aditivo; `caixas_conferir`/`producao_sugerida`/`tarefas_atrasadas` não têm cliente).

---
## 6. IDs que faltavam (aditivos)
- **Caixa** `GET /api/caixa/resumo?data=…&vendedorId=…`: `clienteId` em `entregas[]` (45/45 preenchidos no teste), `atendimentos[]`, `pedidosVendedor[]`, `cobrancas…[]`, `recebimentosTitulos.itens[]`; mesmo nos itens do relatório do caixa (`/resumo`-PDF, `entregas`/`atendimentos`/`pedidosVendedor`). `clienteId` é `null` para lead.
```
entregas[0]: {"pedidoId":"ebe3e380-…","clienteId":"21c957f3-5aca-400d-a641-344daf219ee3","clienteNome":"RB COMERCIO DE COMBUSTIVEIS", …}
recebimentosTitulos.itens[0] tem "clienteId" (1/1)
```
- **Embarque** `GET /api/embarques/:id`: `pedidos[].cliente.UUID` (e `pedidos[].clienteId` — já existia como coluna do pedido).
```
pedidos[0].clienteId = "8ea56a92-a82f-477b-a8e8-ea0f9b375a48"   pedidos[0].cliente.UUID = "8ea56a92-a82f-477b-a8e8-ea0f9b375a48"
```
- **Atendimentos** (`/api/atendimentos/filtros` e demais): já devolvem `clienteId` (confirmado: `'clienteId' in item` = true). Nada mudou.
- **Pendências**: `clienteId` nos itens (acima).
- **Contas a Receber** `GET /api/contas-receber?clienteId=<uuid>&limit=5` — **já aceita `clienteId`** como filtro (contasReceber.js l.738; também em `/relatorio-itens`). Resposta tem `contas[]` com `clienteId` em cada linha:
```
{"contas":[{"id":"1cacc966-…","clienteNome":"MEU CANTINHO PAES E DOCES LTDA ME","clienteId":"516b5d56-3d95-4294-ae5d-e2dbe95ec038","pedidoNumero":null,"pedidoId":"4912dbe9-…","pedidoEspecial":true, …
```

---
## 7. Mapa `GET /api/mapa-clientes` — campos por cliente
Cliente **em dia** sai só com `inadimplente:false, bloqueiaVenda:false` (campos de valor ausentes — payload grande). Cliente com atraso **ou** "a confirmar" sai com todos:
```
em dia   : {"uuid":"fbd2fbd2-…","inadimplente":false,"bloqueiaVenda":false}   (totalVencido ausente)
em atraso: {"uuid":"46780b53-…","inadimplente":true,"totalVencido":5.5,"parcelasVencidas":1,"diasMaisAntiga":47,"aConfirmar":null,"bloqueiaVenda":false}
a confirmar: aConfirmar={"valor":157.83,"dias":155,"forma":"Dinheiro","parcelas":1}
```
Teste (admin com `pedidos.clientes='todos'`): 1154 clientes, 106 `inadimplente`, 1048 em dia, 7 com `aConfirmar`; payload 780 KB (era ~670 KB). O front deve tratar `totalVencido` ausente como 0. Falha no cálculo → mapa vem sem os campos.

---
## 8. Config `GET /api/inadimplencia/config` e histórico
```
GET (qualquer logado)  {"carenciaDias":3,"valorMinimoBloqueio":50,"prazoAConfirmarDias":7,"funcionarioFora":true,"motoristaVeAtraso":true,"siteExigeResponsavel":true,"ultimaMudanca":{}}
PUT não-admin          403 {"error":"Só o administrador muda esta regra."}
PUT admin {"carenciaDias":4}  200 {...,"carenciaDias":4,…,"ultimaMudanca":{"carenciaDias":{"usuarioNome":"<nome>","em":"2026-10-14T21:58:25.411Z"}},"ignoradas":[]}
PUT inválido {"carenciaDias":-1}  400 {"error":"carenciaDias: use um valor entre 0 e 365.","erros":["carenciaDias: use um valor entre 0 e 365."]}
GET depois             … "ultimaMudanca":{"carenciaDias":{"usuarioNome":"…","em":"…"}}   (chave só aparece depois da 1ª mudança; sem mudança = ausente)
GET /config/historico (admin)  [{"chave":"carenciaDias","de":3,"para":4,"usuarioNome":"…","em":"2026-10-14T21:58:25.411Z"}]   (mais recente primeiro, máx. 100)
GET /config/historico (não-admin) 403 {"error":"Só o administrador vê o histórico."}
```
`PUT` aceita o objeto inteiro devolvido pelo GET (ignora `ultimaMudanca`/`ignoradas`); `siteExigeResponsavel` é ignorado (aparece em `ignoradas`).

---
## 9. Complementos pedidos pelo front (rodada 2)

### 9.1 Caixa: `saldoVencidoPedido` (Tela 10 — "deve + R$ X" = total do cliente MENOS este valor)
`GET /api/caixa/resumo?data=…&vendedorId=…` — cada linha de `entregas[]`, `pedidosVendedor[]`, `cobrancasRota.itens[]` e `recebimentosTitulos.itens[]` agora tem **`pedidoId`** (novo em `pedidosVendedor`, `cobrancasRota.itens` e `recebimentosTitulos.itens`; `entregas` já tinha) e **`saldoVencidoPedido`**.
`saldoVencidoPedido` = soma de `valor − valorPago − valorDescontoTotal` das parcelas **em aberto (PENDENTE/PARCIAL/VENCIDO) com vencimento antes de hoje (SP)** da conta daquele pedido; **0** se nada vencido, se o pedido não tem conta, ou se `pedidoId` é nulo. Parcela com saldo ≤ R$ 1,00 não conta. É o saldo bruto do pedido (não aplica as regras de espera/funcionário). `atendimentos[]` e `clientesNaoAtendidos[]` NÃO ganham o campo (não são pedido).
```
GET /api/caixa/resumo?data=2026-04-30&vendedorId=2eebf9f2-6dda-49be-aa9f-8b853476c4cd
.entregas[]: 45 linhas — clienteId 45/45, pedidoId 45/45, saldoVencidoPedido presente em 45/45 (>0 em 4)
exemplo: {"pedidoId":"ebe3e380-4cf7-4f20-826d-344ec1770af0","clienteId":"21c957f3-5aca-400d-a641-344daf219ee3","clienteNome":"RB COMERCIO DE COMBUSTIVEIS","saldoVencidoPedido":203.88}
   (conferido no banco: parcela 1 = 203.88, pago 0, desconto 0, PENDENTE, venc. 2026-05-14)

GET …?data=2026-05-06&vendedorId=01c9474d-ec91-4fbf-b40a-686e914585f0
.pedidosVendedor[]: 20 linhas — pedidoId 20/20, saldoVencidoPedido 20/20

GET …?data=2026-08-19&vendedorId=cd3dff75-91e1-4284-8d20-f933b7ae31e3
.recebimentosTitulos.itens[]: 1 linha — clienteId, pedidoId e saldoVencidoPedido presentes (0)
```
### 9.2 Caixa: `cobrancasRota.itens[]` traz `clienteId` (prova que faltava)
Teste: no banco local a cobrança não tinha dono/data de referência, então ajustei temporariamente `cobrado_por_id`/`data_referencia` de 1 cobrança, consultei e **desfiz** (valores voltaram a NULL).
```
GET /api/caixa/resumo?data=2026-08-20&vendedorId=cd3dff75-91e1-4284-8d20-f933b7ae31e3
.cobrancasRota.itens (1): {"clienteId":"8f38e3fe-3dd6-4318-bcb1-0f507e41e117","pedidoId":"47bc5721-5e21-4e7d-9880-56142438aa04","saldoVencidoPedido":0,"clienteNome":"MERCADO CARLAO"}
```
### 9.3 Checkout do motorista — `clienteId` já vem (nenhuma mudança de código)
`GET /api/entregas/pendentes` e `/api/entregas/concluidas` (alimentam Painel do Motorista / Minhas entregas) usam `include` no pedido, então `clienteId` (coluna do pedido) e `cliente.UUID` (via `CLIENTE_FICHA_SELECT`) já vêm. O fluxo "Checkout" da Rota (`RotaLeads`) usa a lista de pedidos, que também traz `clienteId`.
```
GET /api/entregas/pendentes (admin): 151 itens; dos 148 com _tipoEntrega:'pedido' -> 148 com clienteId, 148 com cliente.UUID
  ex.: {"id":"ce07780c-…","clienteId":"5ad49a54-ad49-4b4b-a553-990de6755888","_tipoEntrega":"pedido","cliente":{"UUID":"5ad49a54-ad49-4b4b-a553-990de6755888", …}}
GET /api/entregas/concluidas: pedido[0] -> clienteId = cliente.UUID = 1c9979cc-79a4-4576-a51e-0353d13b9943
```
Itens `_tipoEntrega` de amostra/lead não têm `clienteId` (não passam pelo checkout de pedido).
