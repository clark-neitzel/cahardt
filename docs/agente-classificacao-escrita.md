# Classificação das 183 funções de ESCRITA do agente (Luke) — CRIAR × resto

> Análise só-leitura do código (branch `feat/agente-politica-leitura` = `origin/main` 3603e3ac). Gerada em 27/11/2026 a partir do catálogo REAL (`node scripts/dump-catalogo-agente.js`, 183 funções de escrita hoje em **PEDE** nas 20 famílias liberadas para leitura; as bloqueadas fixas e as 2 prévias `avaliar-custo` já LIBERADAS ficam fora). Base para o próximo PR, que muda o seed em `config/agentePoliticaPadrao.js`.

**Regra do dono (a aplicar):** o Luke **lança/cria** registros novos com autonomia; para **deletar, modificar, estornar e faturar** ele **pergunta** (PEDE → vira solicitação que o dono autoriza).

## Como ler

- **Nível proposto:** `LIBERADO` = pode entrar no seed hoje, as guardas que já existem bastam. `LIBERADO*` = é CRIAR e deve ser liberado, **mas só depois de a guarda indicada existir no servidor** (até lá fica PEDE). `PEDE` = o Luke pergunta. `BLOQUEADO` = nunca (envio externo/consulta externa), igual às exceções "externo" do seed de leitura.
- Funções de CRIAR que **não têm uso para o Luke** (caixa físico, expedição, carteira comercial, clientes, pedidos de venda) ficam **PEDE** mesmo sendo criação — princípio do menor privilégio; o dono pode promover depois por override de FUNÇÃO.
- Várias rotas são **admin-only** (o agente nunca é admin): ficam PEDE no seed, mas hoje já respondem 403 por permissão — está anotado.
- Handler = `arquivo:linha` do controller/handler (quando o router só delega ao controller, é a linha da função no controller).

## Resumo

**183 funções.** Resultado proposto: **9 LIBERADO**, **11 LIBERADO\*** (CRIAR dependente de guarda), **150 PEDE**, **13 BLOQUEADO**.

| Categoria | Total | LIBERADO | LIBERADO* | PEDE | BLOQUEADO |
|---|---:|---:|---:|---:|---:|
| CRIAR | 33 | 6 | 11 | 16 | 0 |
| PREVIA_LEITURA | 8 | 3 | 0 | 0 | 5 |
| MODIFICAR | 56 | 0 | 0 | 56 | 0 |
| EXCLUIR | 26 | 0 | 0 | 26 | 0 |
| ESTORNAR | 20 | 0 | 0 | 20 | 0 |
| BAIXAR_FATURAR | 22 | 0 | 0 | 22 | 0 |
| CONCILIAR | 5 | 0 | 0 | 5 | 0 |
| ENVIO_EXTERNO | 8 | 0 | 0 | 0 | 8 |
| OUTRO | 5 | 0 | 0 | 5 | 0 |
| **Total** | **183** | **9** | **11** | **150** | **13** |

Das 33 funções CRIAR, 6 entram LIBERADO, 11 LIBERADO* e 16 ficam PEDE por serem de domínio humano (caixa, expedição, clientes, pedidos, DRE, ajuste de saldo). Prévias seguras: 3 LIBERADO e 5 BLOQUEADO (consultam serviço externo).

### Mudança no código do PR (esboço)

Hoje `nivelSeed` devolve PEDE para toda escrita de família do seed. O PR novo troca isso por uma tabela `ESCRITA_SEED` (chave → nível) com as linhas abaixo; `ehLeitura()` precisa passar a reconhecer também as funções LIBERADAS de escrita, senão `resolverEntrada` ignora override `LIBERADO` (só aceita LIBERADO em leitura) e a API de política recusa com 422 ("Liberar escrita para o agente ainda não é permitido", `agentePoliticaService.js:216`). Função de escrita nova continua nascendo BLOQUEADA.

## Guardas do servidor citadas (G1–G10)

| # | Guarda | Existe hoje? |
|---|---|---|
| G1 | **Idempotência obrigatória** para o agente: cabeçalho `Idempotency-Key` (ou chave natural) guardado numa tabela; repetir devolve o registro já criado em vez de criar outro | **Não** (grep no backend: nenhuma rota aceita idempotency key; só chaves naturais isoladas — nota por chave, produto por nome, inventário por id) |
| G2 | **Duplicidade** fornecedor + valor + vencimento (+ nº do documento) → 409; fornecedor sem documento: checar razão social | Parcial (fornecedor: só documento; despesa: nenhuma) |
| G3 | **Categoria proibida**: para o agente, recusar categoria FORA_DRE (retirada de lucros, empréstimos, imobilizado) e **não criar categoria nova por texto livre** (`categoriaDespesaService.idPorNome` cria a linha sozinho) | **Não** |
| G4 | **Sem baixa na criação**: agente não pode mandar `pago:true`/`dataPagamento` em `POST /contas-pagar` e `/notas-entrada/:p/gerar-conta` (baixar é PEDE) | **Não** |
| G5 | **Nota já capturada pela SEFAZ**: lançamento manual recusa se já existe nota do mesmo CNPJ+nº, ou mesmo CNPJ+valor+emissão (a SEFAZ pode trazer a nota depois com chave real) | Parcial (só fornecedor+nº quando ambos vêm) |
| G6 | **Matéria-prima só vincula a insumo de receita ativa** (PCP): item de ingrediente tem que ser item PCP ativo | A verificar no `pcpReceitaService.criar` (não confirmado nesta análise) |
| G7 | **Teto de valor** por lançamento e por dia para o agente; acima do teto a chamada vira PEDE | **Não** |
| G8 | **Sem ato fiscal/externo embutido**: `gerar-conta`, `vincular-parcelas` e `registrar-entrada` disparam a *confirmação da operação na SEFAZ* (`confirmarOperacaoAuto`) e salvam XML no Drive; para o agente isso deve ser desligado. Idem `forcar` na importação de extrato | **Não** (a rota `/manifestar` direta já é bloqueio fixo, mas o caminho indireto passa) |
| G9 | **Criação conservadora**: produto sem `estoqueInicial`/`valorVenda`; receita só `rascunho` | **Não** |
| G10 | **Limite de lote** (arrays: importar-lote, despesas-lote ≤ 200 hoje) | Parcial |

Outras guardas que **já existem** e ajudam: trava de custo fora da curva (409 sem `confirmarCustoForaDaCurva`), soma das parcelas = total da nota, 1 conta por nota, nota só em status NOVA, produto duplicado por nome (409), documento de fornecedor/cliente duplicado, cidade só da lista, extrato idempotente por hash+FITID e trava de conta errada, anexo com limite de tamanho/quantidade.

## Tabelas por família

### `/api/contas-pagar` (12) — 1 LIBERADO, 9 PEDE, 1 LIBERADO*, 1 BLOQUEADO

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/contas-pagar/:p/anexos` | `routes/anexos.js:107` | CRIAR | **LIBERADO** | Anexa até 10 arquivos (PDF/foto) a uma despesa; grava em `uploads/anexos/` (persistente), SHA-256 | Mesmo arquivo 2× só gera AVISO (não bloqueia); exige tipo válido e limite de tamanho (já existem) |
| `POST /api/contas-pagar/:p/pdf` | `routes/contasPagar.js:525` | MODIFICAR | **PEDE** | SUBSTITUI o PDF legado da despesa (apaga o anterior do disco) | Perde o documento antigo; o agente deve usar `/anexos` (que só acrescenta) |
| `DELETE /api/contas-pagar/:p/pdf` | `routes/contasPagar.js:589` | EXCLUIR | **PEDE** | Remove o PDF legado e apaga o arquivo | Perde documento |
| `POST /api/contas-pagar` | `routes/contasPagar.js:760` | CRIAR | **LIBERADO*** | Cria despesa+parcelas; aceita `pago:true` (já baixa cada parcela), `itens` (ENTRADA de estoque + custo), categoria por texto (cria categoria nova se não existir), `enviarCA` (inócuo com CA somente leitura) | SEM idempotência e SEM checagem de duplicidade (2 cliques = 2 despesas); sem trava de categoria FORA_DRE/lucros; `pago:true` torna a criação uma baixa. Já há: trava de custo fora da curva (409) nos itens. Guardas: G1, G2, G3, G4, G7 |
| `PUT /api/contas-pagar/:p` | `routes/contasPagar.js:909` | MODIFICAR | **PEDE** | Edita despesa (campos, parcelas não pagas, fornecedor, categoria) | Despesa quitada exige permissão extra; mexe em DRE |
| `PUT /api/contas-pagar/:p/itens` | `routes/contasPagar.js:1219` | MODIFICAR | **PEDE** | Reescreve os produtos da despesa: ajusta estoque e custo (exige permissão de itens) | Duplica/estorna estoque; mexe em custo médio |
| `POST /api/contas-pagar/:p/cancelar` | `routes/contasPagar.js:1312` | EXCLUIR | **PEDE** | Cancela despesa sem pagamento e estorna entradas de estoque | Cancelar errado reabre estoque; irreversível sem relançar |
| `POST /api/contas-pagar/:p/reenviar-ca` | `routes/contasPagar.js:1369` | ENVIO_EXTERNO | **BLOQUEADO** | Recoloca despesa com erro na fila de envio ao Conta Azul | CA (externo); inócuo com CA somente leitura |
| `POST /api/contas-pagar/:p/parcelas/:p/baixar` | `routes/contasPagar.js:1390` | BAIXAR_FATURAR | **PEDE** | Baixa manual de uma parcela (ledger; marca para empurrar ao CA) | Pagamento sem lastro bancário |
| `POST /api/contas-pagar/baixar-lote` | `routes/contasPagar.js:1458` | BAIXAR_FATURAR | **PEDE** | Quita várias parcelas de uma vez (saldo restante) | Idem, em massa |
| `PUT /api/contas-pagar/:p/parcelas/:p/pagamentos/:p` | `routes/contasPagar.js:1531` | MODIFICAR | **PEDE** | Corrige data/forma/banco de um pagamento já lançado (permissão própria; 409 se conciliado) | Muda banco/data de baixa |
| `POST /api/contas-pagar/:p/parcelas/:p/estorno` | `routes/contasPagar.js:1640` | ESTORNAR | **PEDE** | Estorna um pagamento (se veio do CA, exclui a baixa lá primeiro) | Reabre dívida; toca CA |

### `/api/anexos` (2) — 2 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PATCH /api/anexos/:p` | `routes/anexos.js:173` | MODIFICAR | **PEDE** | Troca o tipo do anexo | Baixo |
| `DELETE /api/anexos/:p` | `routes/anexos.js:190` | EXCLUIR | **PEDE** | Apaga anexo (autor ou admin) e desativa o arquivo | Perde documento |

### `/api/fornecedores` (5) — 1 LIBERADO, 1 LIBERADO*, 3 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/fornecedores/da-pessoa/:p` | `routes/fornecedores.js:76` | CRIAR | **LIBERADO** | Garante o fornecedor a partir de um cadastro de pessoa (idempotente: devolve o existente com 200) | Idempotente por pessoa; exige a permissão de criar fornecedor |
| `POST /api/fornecedores` | `routes/fornecedores.js:111` | CRIAR | **LIBERADO*** | Cria fornecedor (origem APP) e o enfileira para envio ao CA (`statusEnvioCA=ENVIAR`) | Já há: documento duplicado=400, CNPJ/CPF validado, cidade da lista. Sem documento NÃO detecta razão social duplicada. Guarda: G2 (exigir documento ou checar razão social) |
| `PUT /api/fornecedores/:p` | `routes/fornecedores.js:158` | MODIFICAR | **PEDE** | Edita fornecedor | Trocar CNPJ/nome afeta notas e despesas ligadas |
| `POST /api/fornecedores/:p/excluir` | `routes/fornecedores.js:213` | EXCLUIR | **PEDE** | Exclui; se há vínculos, MESCLA despesas/notas no destino e apaga o original | Mescla errada junta dívidas de fornecedores diferentes |
| `POST /api/fornecedores/:p/cadastro-pessoa` | `routes/fornecedores.js:266` | CRIAR | **PEDE** | Cria o cadastro de PESSOA (cliente inativo) do fornecedor; só `checkAcesso` (leitura) protege | Sem CNPJ cria nova pessoa a cada chamada (idempotência só por documento); uso é da tela Usuários; fora do escopo do Luke (BPO financeiro/estoque) |

### `/api/notas-entrada` (12) — 2 LIBERADO, 2 LIBERADO*, 8 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/notas-entrada/importar-xml` | `routes/notasEntrada.js:617` | CRIAR | **LIBERADO** | Importa o XML de UMA nota (NF-e/NFS-e); grava nota/itens/fornecedor, sem ir à SEFAZ | Idempotente por chave (reimportar não duplica); recusa nota emitida pela própria empresa. Risco baixo |
| `POST /api/notas-entrada/lancar-manual` | `routes/notasEntrada.js:686` | CRIAR | **LIBERADO*** | Cria nota "na mão" (chave sintética `MANUAL-…`, status NOVA) e fornecedor se faltar | Só evita duplicata por fornecedor+número, e só se vierem os dois; não vê nota que a SEFAZ capturar depois. Guardas: G1, G5, G7 |
| `POST /api/notas-entrada/:p/vincular-parcelas` | `routes/notasEntrada.js:1211` | CONCILIAR | **PEDE** | Anexa a nota a parcelas já existentes (pode ajustar valor/desconto/acréscimo da parcela); salva XML no Drive; manifestação SEFAZ automática | Mexe em parcela existente e dispara ato fiscal (G8) |
| `POST /api/notas-entrada/:p/desvincular-parcelas` | `routes/notasEntrada.js:1385` | ESTORNAR | **PEDE** | Desfaz o vínculo nota↔parcelas (reverte ajustes/estoque) | Reabre conferência |
| `POST /api/notas-entrada/:p/criar-produto` | `routes/notasEntrada.js:1880` | CRIAR | **LIBERADO** | Cria o Produto (e item PCP espelho se MP/embalagem) a partir de um item da nota | Já há: advisory lock por nome, idempotente por nota (200 jaExistia), 409 se o nome é de outra origem, categoria tem que existir, auditoria. Não mexe em estoque |
| `POST /api/notas-entrada/:p/gerar-conta` | `routes/notasEntrada.js:1998` | CRIAR | **LIBERADO*** | Cria a conta a pagar da nota (parcelas+rateio), marca a nota CONFERIDA, dá ENTRADA no estoque (custo médio), pode criar produtos, aceita `pago:true`, salva XML no Drive e dispara a CONFIRMAÇÃO DA OPERAÇÃO NA SEFAZ (`confirmarOperacaoAuto`) | Já há: 1 conta por nota, nota tem que estar NOVA, soma das parcelas = total da nota, todo item com destino, trava de custo fora da curva. Falta: G4 (sem `pago`), G8 (sem manifestação automática pelo agente), G3 (categoria), G7 |
| `POST /api/notas-entrada/:p/registrar-entrada` | `routes/notasEntrada.js:2278` | CRIAR | **PEDE** | Marca a nota como ENTRADA_REGISTRADA (bonificação/amostra/troca/comodato/outro): NÃO cria dívida; itens entram no estoque a custo zero; manifestação SEFAZ automática | Classificar errado faz uma dívida real nunca ser lançada (some do contas a pagar). Ver "Decisões para o dono" #3 |
| `POST /api/notas-entrada/:p/desfazer-entrada` | `routes/notasEntrada.js:2380` | ESTORNAR | **PEDE** | Desfaz o registro de entrada sem pagamento (reverte estoque) | Reverte estoque |
| `POST /api/notas-entrada/:p/ignorar` | `routes/notasEntrada.js:2419` | EXCLUIR | **PEDE** | Marca a nota como IGNORADA (XML vai p/ subpasta "Ignoradas" no Drive) | Nota some da fila de lançamento |
| `POST /api/notas-entrada/:p/reativar` | `routes/notasEntrada.js:2440` | ESTORNAR | **PEDE** | Reativa nota ignorada | Volta à fila |
| `POST /api/notas-entrada/:p/cancelar-conferencia` | `routes/notasEntrada.js:2627` | ESTORNAR | **PEDE** | Cancela a conferência: cancela a despesa e estorna estoque | Desfaz conta e estoque |
| `POST /api/notas-entrada/:p/corrigir-entrada-estoque` | `routes/notasEntrada.js:2732` | MODIFICAR | **PEDE** | Corrige a conversão/entrada de estoque de nota já lançada (permissão própria) | Mexe em estoque e custo |

### `/api/conciliacao-bancaria` (16) — 2 LIBERADO*, 2 BLOQUEADO, 12 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/conciliacao-bancaria/importar` | `routes/conciliacaoBancaria.js:52` | CRIAR | **LIBERADO*** | Importa extrato OFX/PDF de uma conta: cria lançamentos pendentes (corrige descrição de existentes) | Idempotente por hash do arquivo e FITID (duplicados ignorados) + trava de conta errada (409). Risco: `forcar=true` ignora a trava → G8 (agente não pode forçar) |
| `POST /api/conciliacao-bancaria/sincronizar-asaas` | `routes/conciliacaoBancaria.js:119` | ENVIO_EXTERNO | **BLOQUEADO** | Busca extrato no Asaas (API) e concilia automaticamente o que bate | Asaas (externo) e concilia sozinho |
| `POST /api/conciliacao-bancaria/conciliar-auto` | `routes/conciliacaoBancaria.js:156` | CONCILIAR | **PEDE** | Concilia sozinho os pendentes com exatamente 1 candidato (período/conta) | Em massa; casa extrato↔baixa. Ver "Decisões" #1 |
| `POST /api/conciliacao-bancaria/identificar-debitos-ca` | `routes/conciliacaoBancaria.js:184` | ENVIO_EXTERNO | **BLOQUEADO** | Varre o CA para descobrir de quem é cada débito e grava fornecedor/descrição/nota nos lançamentos | CA (externo) |
| `POST /api/conciliacao-bancaria/corrigir-conta-baixa` | `routes/conciliacaoBancaria.js:201` | MODIFICAR | **PEDE** | Move baixa para outro banco (e atualiza a conta financeira no CA quando há vínculo) | Mexe em baixa já feita; toca CA |
| `POST /api/conciliacao-bancaria/conciliar-unificado` | `routes/conciliacaoBancaria.js:249` | BAIXAR_FATURAR | **PEDE** | Ação única: amarra lançamentos a baixas existentes E CRIA baixa em boletos em aberto (juros/multa/desconto) | Dá baixa de título com valor digitado; é "quitar" |
| `POST /api/conciliacao-bancaria/:p/conciliar` | `routes/conciliacaoBancaria.js:275` | CONCILIAR | **PEDE** | Vincula o lançamento do extrato a uma baixa escolhida | Casa errado fecha o lançamento errado. Ver #1 |
| `POST /api/conciliacao-bancaria/:p/ignorar` | `routes/conciliacaoBancaria.js:291` | EXCLUIR | **PEDE** | Marca o lançamento como ignorado (tarifa/transferência) | Some dos pendentes |
| `POST /api/conciliacao-bancaria/confirmar-identificadas` | `routes/conciliacaoBancaria.js:305` | CONCILIAR | **PEDE** | Confirma em lote créditos identificados por "Venda NNNN" | Em massa |
| `POST /api/conciliacao-bancaria/:p/transferencia` | `routes/conciliacaoBancaria.js:324` | CONCILIAR | **PEDE** | Marca o lançamento como transferência entre contas (cria `TransferenciaConta`) | Tira o lançamento dos pendentes |
| `POST /api/conciliacao-bancaria/:p/desfazer` | `routes/conciliacaoBancaria.js:340` | ESTORNAR | **PEDE** | Volta o lançamento para pendente (apaga transferência junto) | Desfaz conciliação |
| `POST /api/conciliacao-bancaria/:p/conciliar-varios` | `routes/conciliacaoBancaria.js:377` | BAIXAR_FATURAR | **PEDE** | Concilia 1 lançamento a vários títulos a pagar, DANDO BAIXA (juros/multa) | Quita vários títulos |
| `POST /api/conciliacao-bancaria/:p/desfazer-titulo` | `routes/conciliacaoBancaria.js:407` | ESTORNAR | **PEDE** | Estorna a baixa de um título e recalcula a linha | Reabre dívida |
| `POST /api/conciliacao-bancaria/:p/criar-despesa` | `routes/conciliacaoBancaria.js:468` | CRIAR | **LIBERADO*** | Cria despesa JÁ PAGA a partir de uma SAÍDA do extrato (valor/data/banco vêm do lançamento; baixa criada; fornecedor novo opcional) | Valor/data/banco são do extrato (risco menor), MAS o lançamento continua PENDENTE depois: repetir a chamada cria despesa em dobro. Categoria livre. Guardas: G1 (1 despesa por lançamento), G3 |
| `POST /api/conciliacao-bancaria/despesas-lote` | `routes/conciliacaoBancaria.js:497` | CRIAR | **PEDE** | Cria até 200 despesas já pagas e já conciliadas (1 por lançamento), mesma categoria/fornecedor para todas | Erro de categoria se multiplica por 200; liberar só após G10 (teto/lote menor). Ver #4 |
| `DELETE /api/conciliacao-bancaria/importacoes/:p` | `routes/conciliacaoBancaria.js:530` | EXCLUIR | **PEDE** | Desfaz uma importação inteira (só se nada foi conciliado/ignorado) | Já protegido; some o extrato importado |

### `/api/financeiro-gerencial` (10) — 9 PEDE, 1 LIBERADO

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PUT /api/financeiro-gerencial/por-conta/lancamento-banco` | `routes/financeiroGerencial.js:133` | MODIFICAR | **PEDE** | Move um lançamento (receber/pagar/ajuste) para outro banco/caixa | Muda saldo por conta; só troca o campo da conta |
| `POST /api/financeiro-gerencial/por-conta/ajuste` | `routes/financeiroGerencial.js:157` | CRIAR | **PEDE** | Cria ajuste manual de saldo de uma conta (ENTRADA/SAÍDA, valor, data, motivo) | Cria saldo "do nada" sem lastro bancário; sem idempotência/duplicidade/teto. Ver "Decisões" #5 |
| `DELETE /api/financeiro-gerencial/por-conta/ajuste/:p` | `routes/financeiroGerencial.js:186` | EXCLUIR | **PEDE** | Apaga ajuste de saldo | Muda saldo |
| `PUT /api/financeiro-gerencial/categorias-despesa` | `routes/financeiroGerencial.js:281` | MODIFICAR | **PEDE** | Reclassifica categorias em lote (classificação, bloco DRE, natureza, compra de estoque); upsert cria categoria que não existe | Joga despesa dentro/fora da DRE (ex.: marcar lucros como OPERACIONAL) |
| `POST /api/financeiro-gerencial/categorias-despesa` | `routes/financeiroGerencial.js:326` | CRIAR | **LIBERADO** | Cria categoria de despesa nova (nasce `A_CLASSIFICAR`/OPERACIONAL conforme bloco) | Duplicidade sem diferenciar maiúscula já recusada (400). Risco: categoria-lixo; a classificação continua com o dono (PUT é PEDE) |
| `DELETE /api/financeiro-gerencial/categorias-despesa/:p` | `routes/financeiroGerencial.js:374` | EXCLUIR | **PEDE** | Apaga categoria que nunca foi usada | Só se sem uso (guarda já existe) |
| `POST /api/financeiro-gerencial/grupos-dre` | `routes/financeiroGerencial.js:417` | CRIAR | **PEDE** | Cria bloco novo da DRE | Muda a estrutura da DRE; nome duplicado já recusado; decisão do dono |
| `PUT /api/financeiro-gerencial/grupos-dre/ordem` | `routes/financeiroGerencial.js:435` | MODIFICAR | **PEDE** | Reordena os blocos da DRE | Muda o relatório |
| `PUT /api/financeiro-gerencial/grupos-dre/:p` | `routes/financeiroGerencial.js:450` | MODIFICAR | **PEDE** | Renomeia bloco da DRE | Muda o relatório |
| `DELETE /api/financeiro-gerencial/grupos-dre/:p` | `routes/financeiroGerencial.js:466` | EXCLUIR | **PEDE** | Apaga bloco (categorias dele ficam sem bloco) | Muda o relatório |

### `/api/contas-receber` (10) — 8 PEDE, 2 BLOQUEADO

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/contas-receber/baixa-lote` | `routes/contasReceber.js:1147` | BAIXAR_FATURAR | **PEDE** | Baixa várias parcelas (transação; cancela QR Asaas) | Dinheiro "recebido" sem lastro |
| `POST /api/contas-receber/:p/baixa` | `routes/contasReceber.js:1293` | BAIXAR_FATURAR | **PEDE** | Baixa uma parcela (ledger; toca Asaas) | Idem; regras de lastro/caixa do dia |
| `DELETE /api/contas-receber/:p/pagamentos/:p` | `routes/contasReceber.js:1447` | ESTORNAR | **PEDE** | Estorna um pagamento do ledger | Reabre título |
| `DELETE /api/contas-receber/:p/baixa` | `routes/contasReceber.js:1515` | ESTORNAR | **PEDE** | Estorna a baixa da parcela | Reabre título |
| `PATCH /api/contas-receber/:p/cancelar` | `routes/contasReceber.js:1587` | EXCLUIR | **PEDE** | Cancela a conta a receber | Some da carteira |
| `PATCH /api/contas-receber/:p/reverter-cancelamento` | `routes/contasReceber.js:1623` | ESTORNAR | **PEDE** | Desfaz o cancelamento | Reabre título |
| `PUT /api/contas-receber/:p/reverter-quitacao` | `routes/contasReceber.js:1672` | ESTORNAR | **PEDE** | Desfaz a quitação | Reabre título |
| `POST /api/contas-receber/admin/sincronizar` | `routes/contasReceber.js:1753` | CRIAR | **PEDE** | Cria contas a receber que faltam para pedidos ENVIAR (admin-only: o agente leva 403) | Em massa; admin-only |
| `POST /api/contas-receber/:p/sync-ca` | `routes/contasReceber.js:1824` | ENVIO_EXTERNO | **BLOQUEADO** | Puxa baixas do Conta Azul e baixa parcelas locais | CA (externo); baixa automática |
| `POST /api/contas-receber/sync-ca/todas` | `routes/contasReceber.js:1844` | ENVIO_EXTERNO | **BLOQUEADO** | Idem para todas as contas abertas | CA (externo); em massa |

### `/api/estoque` (6) — 5 PEDE, 1 BLOQUEADO

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/estoque/ajuste` | `routes/estoqueRoutes.js:28` | MODIFICAR | **PEDE** | Ajuste manual de estoque (ENTRADA/SAÍDA) por produto; saída exige motivo | Estoque falso; permissão por categoria. Ver #6 |
| `POST /api/estoque/codigo-barras/vincular` | `routes/estoqueRoutes.js:231` | MODIFICAR | **PEDE** | Grava o EAN no produto (`Produto.ean`) | EAN errado quebra o bipe/etiqueta |
| `POST /api/estoque/sync-produto/:p` | `routes/estoqueRoutes.js:306` | ENVIO_EXTERNO | **BLOQUEADO** | Sincroniza um produto com o Conta Azul | CA (externo) |
| `PATCH /api/estoque/produto/:p/minimo` | `routes/estoqueRoutes.js:326` | MODIFICAR | **PEDE** | Muda estoque mínimo/máximo (admin ou produtos.edit) | Muda alertas de compra |
| `POST /api/estoque/produto/:p/recalcular` | `routes/estoqueRoutes.js:373` | OUTRO | **PEDE** | Força o recálculo dos 3 estados de estoque (só admin: o agente leva 403) | Admin-only |
| `POST /api/estoque/inventario` | `routes/estoqueRoutes.js:391` | MODIFICAR | **PEDE** | Contagem física: ajusta o saldo de vários produtos nos dois sentidos (idempotente por `inventarioId`, máx. 500) | Reescreve o saldo; exige permissão de adicionar E diminuir. Ver #6 |

### `/api/categorias-estoque` (1) — 1 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PATCH /api/categorias-estoque/:p` | `routes/categoriaEstoqueRoutes.js:41` | MODIFICAR | **PEDE** | Liga/desliga controle de estoque, flex e "vendável" da categoria (só admin: o agente leva 403) | Admin-only |

### `/api/produtos` (8) — 1 LIBERADO*, 7 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/produtos` | `controllers/produtoController.js:303 (rota produtoRoutes.js:31)` | CRIAR | **LIBERADO*** | Cria produto só no app (CA somente leitura); aceita `estoqueInicial` (gera entrada de estoque) e `valorVenda` | Já há: nome duplicado=409 e categoria tem que existir. Falta G9: agente sem `estoqueInicial`/`valorVenda`; nome "quase igual" passa (duplicidade) |
| `PUT /api/produtos/:p` | `controllers/produtoController.js:317 (rota produtoRoutes.js:32)` | MODIFICAR | **PEDE** | Altera ficha (custoManual, categoria, EAN/NCM, ativo, mín/máx) | Custo/categoria errados distorcem CMV, DRE e estoque; não é criação |
| `PATCH /api/produtos/:p/status` | `controllers/produtoController.js:681 (rota produtoRoutes.js:33)` | EXCLUIR | **PEDE** | Ativa/inativa o produto (booleano explícito, idempotente) | Inativar tira o produto de venda/catálogo |
| `PATCH /api/produtos/:p/custo-ca` | `controllers/produtoController.js:574 (rota produtoRoutes.js:34)` | MODIFICAR | **PEDE** | Zera ou devolve o custo médio vindo do CA (`custoMedio=null`) | Altera custo base de margem/CMV |
| `POST /api/produtos/:p/imagens` | `controllers/produtoController.js:592 (rota produtoRoutes.js:37)` | CRIAR | **PEDE** | Upload de até 5 fotos em `uploads/` (disco) | fora do escopo do Luke (BPO financeiro/estoque); foto errada vai ao catálogo/site |
| `DELETE /api/produtos/imagens/:p` | `controllers/produtoController.js:634 (rota produtoRoutes.js:38)` | EXCLUIR | **PEDE** | Apaga a foto do produto | Perde arquivo |
| `PATCH /api/produtos/:p/imagens/reordenar` | `controllers/produtoController.js:699 (rota produtoRoutes.js:39)` | MODIFICAR | **PEDE** | Muda a ordem das fotos | Baixo; sem uso para o Luke |
| `PATCH /api/produtos/:p/imagens/:p/principal` | `controllers/produtoController.js:657 (rota produtoRoutes.js:40)` | MODIFICAR | **PEDE** | Troca a foto principal | Baixo; sem uso para o Luke |

### `/api/pcp/itens` (7) — 2 LIBERADO*, 1 LIBERADO, 4 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/pcp/itens` | `routes/pcpItemRoutes.js:73` | CRIAR | **LIBERADO*** | Cria item SUB (subproduto) com código automático | Código duplicado=409, MAS nome duplicado não é checado (cria SUB repetido); guarda: nome normalizado único |
| `POST /api/pcp/itens/importar` | `routes/pcpItemRoutes.js:93` | CRIAR | **LIBERADO** | Cria o item PCP (MP/PA/EMB) de um produto do cadastro; se já existe devolve o existente | Idempotente por produto |
| `POST /api/pcp/itens/importar-lote` | `routes/pcpItemRoutes.js:113` | CRIAR | **LIBERADO*** | Importa vários produtos como itens PCP (idempotente por produto) | Sem limite de tamanho do array → G10 |
| `PUT /api/pcp/itens/:p` | `routes/pcpItemRoutes.js:132` | MODIFICAR | **PEDE** | Edita item PCP (custo, mínimo; órfão pode trocar tipo/código/nome) | Muda custo/tipo de insumo |
| `POST /api/pcp/itens/:p/promover-produto` | `routes/pcpItemRoutes.js:153` | MODIFICAR | **PEDE** | Item órfão vira Produto (cria produto E reescreve/inativa o item) | Cria e altera registro existente |
| `PATCH /api/pcp/itens/:p/ativo` | `routes/pcpItemRoutes.js:172` | MODIFICAR | **PEDE** | ALTERNA ativo/inativo (toggle, NÃO idempotente: 2 chamadas desfazem) | Inativar insumo esconde da receita |
| `DELETE /api/pcp/itens/:p` | `routes/pcpItemRoutes.js:187` | EXCLUIR | **PEDE** | Exclui item órfão sem uso | Já só apaga item sem uso |

### `/api/pcp/receitas` (8) — 2 LIBERADO, 2 LIBERADO*, 4 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/pcp/receitas/:p/link-impressao` | `routes/pcpReceitaRoutes.js:106` | PREVIA_LEITURA | **LIBERADO** | Gera link de PDF com token de 5 min (assinado, não grava no banco) | Sem escrita; token amarrado à receita e ao agente |
| `POST /api/pcp/receitas` | `routes/pcpReceitaRoutes.js:133` | CRIAR | **LIBERADO*** | Cria receita com ingredientes; por padrão nasce `status=ativa` | Duplica receita vigente (conflito só na versão); G6 (MP só vincula a insumo válido) e G9 (agente cria só `rascunho`) |
| `PUT /api/pcp/receitas/:p` | `routes/pcpReceitaRoutes.js:156` | MODIFICAR | **PEDE** | Edita receita (exige motivo; só não-inativa) com histórico | Muda receita em produção e o custo |
| `POST /api/pcp/receitas/:p/nova-versao` | `routes/pcpReceitaRoutes.js:174` | MODIFICAR | **PEDE** | Cria nova versão ATIVA e INATIVA a vigente (transação) | Troca a receita em uso |
| `POST /api/pcp/receitas/:p/clonar` | `routes/pcpReceitaRoutes.js:188` | CRIAR | **LIBERADO*** | Cria nova receita + novo SUB copiando ingredientes (nome obrigatório) | Nome/código duplicado→409 só no código; G9 (rascunho) |
| `POST /api/pcp/receitas/:p/escalonar` | `routes/pcpReceitaRoutes.js:206` | PREVIA_LEITURA | **LIBERADO** | Simulador de escalonamento (só calcula) | Sem escrita |
| `PATCH /api/pcp/receitas/:p/status` | `routes/pcpReceitaRoutes.js:225` | MODIFICAR | **PEDE** | Muda status (rascunho/ativa/inativa) | Ativar/inativar receita |
| `DELETE /api/pcp/receitas/:p` | `routes/pcpReceitaRoutes.js:242` | EXCLUIR | **PEDE** | Exclui receita | Perde receita |

### `/api/pcp/estoque` (1) — 1 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/pcp/estoque/ajuste` | `routes/pcpEstoqueRoutes.js:31` | MODIFICAR | **PEDE** | Ajuste manual do estoque PCP (ENTRADA/SAÍDA) | Estoque de cozinha falso. Ver #6 |

### `/api/indicadores-gestao` (2) — 2 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PUT /api/indicadores-gestao/config` | `routes/indicadoresGestao.js:78` | MODIFICAR | **PEDE** | Muda a alíquota de imposto sobre venda (só admin: o agente leva 403) | Muda todos os indicadores; admin-only |
| `PUT /api/indicadores-gestao/metas` | `routes/indicadoresGestao.js:92` | MODIFICAR | **PEDE** | Salva metas dos indicadores (só admin: o agente leva 403) | Admin-only |

### `/api/pedidos` (22) — 17 PEDE, 5 BLOQUEADO

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PUT /api/pedidos/:p/local-entrega` | `routes/localEntrega.js:162` | MODIFICAR | **PEDE** | Define local de entrega do pedido | Entrega no lugar errado |
| `DELETE /api/pedidos/:p/local-entrega` | `routes/localEntrega.js:176` | EXCLUIR | **PEDE** | Remove o local de entrega do pedido | Volta ao endereço do cliente |
| `POST /api/pedidos/imprimir-lote/checar` | `controllers/pedidoController.js:186 (rota pedidoRoutes.js:35)` | PREVIA_LEITURA | **BLOQUEADO** | Só checa pedidos do lote, mas consulta o Conta Azul (externo) | Externo, igual às exceções "externo" do seed de leitura (BLOQUEADO) |
| `POST /api/pedidos/imprimir-lote/checar-pedido` | `controllers/pedidoController.js:203 (rota pedidoRoutes.js:36)` | PREVIA_LEITURA | **BLOQUEADO** | Checa 1 pedido consultando o CA (`forcar` refaz a consulta) | Externo; idem |
| `POST /api/pedidos/imprimir-lote` | `controllers/pedidoController.js:216 (rota pedidoRoutes.js:37)` | PREVIA_LEITURA | **BLOQUEADO** | Gera o PDF do lote (DANFE + boletos); busca nota/boleto em Focus/CA/Asaas | Externo e pesado; não grava dado de negócio |
| `POST /api/pedidos/avisos-convertidos/:p/ciente` | `controllers/pedidoController.js:379 (rota pedidoRoutes.js:44)` | OUTRO | **PEDE** | Marca o aviso "especial convertido" como visto | Aviso de tela de humano; sem uso para o Luke |
| `POST /api/pedidos/avisos-pagamento-apos-quitacao/:p/ciente` | `controllers/pedidoController.js:366 (rota pedidoRoutes.js:49)` | OUTRO | **PEDE** | Marca o aviso de pagamento pós-quitação como visto | Idem; some um alerta financeiro importante |
| `POST /api/pedidos` | `controllers/pedidoController.js:391 (rota pedidoRoutes.js:55)` | CRIAR | **PEDE** | Cria pedido; com `statusEnvio=ENVIAR` vai ao faturamento e dispara WhatsApp ao cliente (`notificarPedido`); trava de estoque/GPS/inadimplência/cadastro | Cria venda real e manda mensagem ao cliente; fora do escopo do Luke (BPO financeiro/estoque). Se um dia liberar: só `ABERTO` (sem ENVIAR) + idempotência |
| `PUT /api/pedidos/:p` | `controllers/pedidoController.js:578 (rota pedidoRoutes.js:58)` | MODIFICAR | **PEDE** | Edita pedido (só ABERTO) | Altera itens/preço/condição |
| `PUT /api/pedidos/:p/revisado` | `controllers/pedidoController.js:747 (rota pedidoRoutes.js:61)` | MODIFICAR | **PEDE** | Tira a pendência de revisão do pedido | Esconde alerta de revisão |
| `PUT /api/pedidos/:p/aprovar-especial` | `controllers/pedidoController.js:787 (rota pedidoRoutes.js:64)` | BAIXAR_FATURAR | **PEDE** | Aprova pedido especial (sem nota): baixa estoque e libera | Aprovação; baixa estoque e vira conta a receber |
| `PUT /api/pedidos/:p/reverter-especial` | `controllers/pedidoController.js:867 (rota pedidoRoutes.js:67)` | ESTORNAR | **PEDE** | Desfaz a aprovação do especial (volta a ABERTO) | Devolve estoque; mexe em financeiro já gerado |
| `POST /api/pedidos/:p/converter-especial` | `controllers/pedidoController.js:976 (rota pedidoRoutes.js:70)` | BAIXAR_FATURAR | **PEDE** | Converte especial em pedido com NF: segue ao faturamento e emissão da NF-e | Dispara fluxo fiscal (NF-e) |
| `PUT /api/pedidos/:p/aprovar-bonificacao` | `controllers/pedidoController.js:1040 (rota pedidoRoutes.js:73)` | BAIXAR_FATURAR | **PEDE** | Aprova bonificação (baixa estoque; pode ir com nota) | Aprovação |
| `PUT /api/pedidos/:p/reverter-bonificacao` | `controllers/pedidoController.js:1196 (rota pedidoRoutes.js:76)` | ESTORNAR | **PEDE** | Desfaz a aprovação da bonificação | Devolve estoque |
| `PATCH /api/pedidos/:p/nf-bonificacao` | `controllers/pedidoController.js:1089 (rota pedidoRoutes.js:79)` | MODIFICAR | **PEDE** | Corrige "bonificação com/sem nota" antes da NF sair | Muda tratamento fiscal |
| `PUT /api/pedidos/:p/cancelar` | `controllers/pedidoController.js:1759 (rota pedidoRoutes.js:82)` | EXCLUIR | **PEDE** | Cancela pedido (só sem NF-e); grava auditoria | Cancela venda |
| `DELETE /api/pedidos/:p` | `controllers/pedidoController.js:1728 (rota pedidoRoutes.js:85)` | EXCLUIR | **PEDE** | Exclui pedido ABERTO/rascunho/ERRO | Apaga venda |
| `POST /api/pedidos/:p/enviar-whatsapp` | `controllers/pedidoController.js:732 (rota pedidoRoutes.js:88)` | ENVIO_EXTERNO | **BLOQUEADO** | Manda o pedido ao cliente pelo bot (Z-API), com `forceManual` | WhatsApp: só ato humano; risco de banimento do número (ver CLAUDE.md) |
| `PUT /api/pedidos/:p/reatribuir-vendedor` | `controllers/pedidoController.js:1809 (rota pedidoRoutes.js:91)` | MODIFICAR | **PEDE** | Troca o vendedor do pedido (só no app) | Muda comissão e meta |
| `PUT /api/pedidos/:p/impresso` | `controllers/pedidoController.js:1950 (rota pedidoRoutes.js:94)` | MODIFICAR | **PEDE** | Registra que o pedido foi impresso | Baixo |
| `POST /api/pedidos/:p/consultar-ca` | `controllers/pedidoController.js:1844 (rota pedidoRoutes.js:97)` | ENVIO_EXTERNO | **BLOQUEADO** | Consulta a venda no Conta Azul e atualiza o pedido local | CA (externo); sobrescreve status local |

### `/api/clientes` (15) — 15 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PUT /api/clientes/:p/local-entrega` | `routes/localEntrega.js:76` | MODIFICAR | **PEDE** | Define local de entrega do cliente (endereço/ponto) | Entrega no lugar errado; fora do escopo do Luke (BPO financeiro/estoque) |
| `DELETE /api/clientes/:p/local-entrega` | `routes/localEntrega.js:95` | EXCLUIR | **PEDE** | Remove o local de entrega do cliente | Volta ao endereço do cadastro |
| `PUT /api/clientes/:p/local-entrega/ponto` | `routes/localEntrega.js:110` | MODIFICAR | **PEDE** | Grava o ponto GPS do local de entrega (voto GPS) | Altera rota/mapa de entrega |
| `POST /api/clientes` | `controllers/clienteController.js:570 (rota clienteRoutes.js:12)` | CRIAR | **PEDE** | Cria cliente `Ativo=true` (entra em rota/venda); consulta número no WhatsApp (Z-API), pode gravar GPS/fiscal/contatos | fora do escopo do Luke (BPO financeiro/estoque). Já há: documento duplicado=409, cidade só da lista, fornecedor com mesmo doc=409. Sem documento a duplicidade não é detectada |
| `POST /api/clientes/sync` | `controllers/clienteController.js:1346 (rota clienteRoutes.js:13)` | OUTRO | **PEDE** | No-op: responde "desativado" (não grava) | Sem uso; manter PEDE (ou BLOQUEADO) por ser rota morta |
| `PUT /api/clientes/lote` | `controllers/clienteController.js:1492 (rota clienteRoutes.js:14)` | MODIFICAR | **PEDE** | Atualiza vários clientes de uma vez | Dano em massa |
| `POST /api/clientes/:p/atualizar-regime` | `controllers/clienteController.js:1321 (rota clienteRoutes.js:16)` | MODIFICAR | **PEDE** | Consulta Receita/BrasilAPI (externo) e grava o regime tributário | Consulta externa; sobrescreve regime/selo |
| `POST /api/clientes/:p/endereco-historico/:p/restaurar` | `controllers/clienteController.js:522 (rota clienteRoutes.js:22)` | ESTORNAR | **PEDE** | Restaura endereço/ponto de uma versão antiga do histórico | Desfaz alteração de endereço (pode exigir autorização de GPS) |
| `PATCH /api/clientes/:p/retomar-visitas` | `controllers/clienteController.js:422 (rota clienteRoutes.js:23)` | MODIFICAR | **PEDE** | Tira o cliente da pausa de visitas | Reativa cobrança de visita na rota |
| `PUT /api/clientes/:p/telefones/ordem` | `controllers/clienteContatoController.js:44 (rota clienteRoutes.js:26)` | MODIFICAR | **PEDE** | Muda a ordem preferida dos WhatsApp do cliente | Muda para qual número o bot manda |
| `PUT /api/clientes/:p/telefones/ddd55` | `controllers/clienteContatoController.js:52 (rota clienteRoutes.js:27)` | MODIFICAR | **PEDE** | Confirma que o "55" é DDD (RS) | Muda o número usado nos envios |
| `POST /api/clientes/:p/contatos` | `controllers/clienteContatoController.js:63 (rota clienteRoutes.js:29)` | CRIAR | **PEDE** | Cria contato (telefone/e-mail) do cliente | fora do escopo do Luke (BPO financeiro/estoque); contato errado recebe WhatsApp |
| `PATCH /api/clientes/:p/contatos/:p` | `controllers/clienteContatoController.js:71 (rota clienteRoutes.js:30)` | MODIFICAR | **PEDE** | Edita contato do cliente | Idem |
| `DELETE /api/clientes/:p/contatos/:p` | `controllers/clienteContatoController.js:78 (rota clienteRoutes.js:31)` | EXCLUIR | **PEDE** | Apaga contato do cliente | Perde contato |
| `PATCH /api/clientes/:p` | `controllers/clienteController.js:839 (rota clienteRoutes.js:33)` | MODIFICAR | **PEDE** | Edita cadastro do cliente (nome, endereço, condição, regime, GPS…) | Campos sensíveis (condição de pagamento, CNPJ); histórico grava quem alterou |

### `/api/embarques` (13) — 2 BLOQUEADO, 11 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/embarques/sugerir-divisao` | `routes/embarquesMapa.js:573` | PREVIA_LEITURA | **BLOQUEADO** | Propõe divisão de cargas (NÃO grava), mas geocodifica endereços (Nominatim/OSRM, externo) | Externo, como `GET /api/embarques/mapa` (já BLOQUEADO no seed) |
| `POST /api/embarques/estimar-rotas` | `routes/embarquesMapa.js:988` | PREVIA_LEITURA | **BLOQUEADO** | Calcula números de um arranjo de cargas (NÃO grava); geocodificação externa | Idem |
| `POST /api/embarques/aplicar-divisao` | `routes/embarquesMapa.js:1136` | MODIFICAR | **PEDE** | Aplica a divisão: refaz cargas em transação (apaga/move itens) | Reorganiza a expedição inteira do dia |
| `PATCH /api/embarques/:p` | `routes/embarques.js:283` | MODIFICAR | **PEDE** | Edita a carga (motorista, data, status…); sobe a versão | Exige reimprimir folha |
| `POST /api/embarques` | `routes/embarques.js:381` | CRIAR | **PEDE** | Cria carga e já puxa pedidos para ela | Move pedidos existentes; fora do escopo do Luke (BPO financeiro/estoque) |
| `POST /api/embarques/:p/pedidos` | `routes/embarques.js:439` | MODIFICAR | **PEDE** | Coloca pedido na carga (sobe versão) | Altera carga já impressa |
| `DELETE /api/embarques/:p/pedidos/:p` | `routes/embarques.js:501` | EXCLUIR | **PEDE** | Tira pedido da carga | Idem |
| `POST /api/embarques/:p/amostras` | `routes/embarques.js:548` | MODIFICAR | **PEDE** | Coloca amostras na carga (transação) | Idem |
| `DELETE /api/embarques/:p/amostras/:p` | `routes/embarques.js:646` | EXCLUIR | **PEDE** | Tira amostra da carga | Idem |
| `POST /api/embarques/:p/impressao` | `routes/embarques.js:684` | MODIFICAR | **PEDE** | Carimba a versão/hora da última impressão | Baixo; só humano imprime |
| `POST /api/embarques/:p/conferir` | `routes/embarques.js:723` | CRIAR | **PEDE** | Registra um bipe de conferência da doca (idempotente por item) | Conferência falsa libera carga errada; fora do escopo do Luke (BPO financeiro/estoque) |
| `DELETE /api/embarques/:p/conferir/:p/:p` | `routes/embarques.js:781` | EXCLUIR | **PEDE** | Desfaz um bipe de conferência | Idem |
| `POST /api/embarques/:p/conferencia/concluir` | `routes/embarques.js:797` | BAIXAR_FATURAR | **PEDE** | Conclui a conferência da carga | Fecha etapa logística |

### `/api/entregas` (7) — 1 LIBERADO, 6 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/entregas/conferir-folha` | `routes/entregas.js:202` | PREVIA_LEITURA | **LIBERADO** | Compara a versão da folha (QR) com a carga atual; só lê | Sem escrita; exige permissão de entregador |
| `POST /api/entregas/amostra/:p/concluir` | `routes/entregas.js:492` | BAIXAR_FATURAR | **PEDE** | Conclui entrega de amostra (grava status/foto) | Conclusão de entrega |
| `POST /api/entregas/:p/concluir` | `routes/entregas.js:568` | BAIXAR_FATURAR | **PEDE** | Conclui entrega: grava pagamentos reais, cobranças Asaas, itens devolvidos (transação grande) | Registra dinheiro recebido/devolução; mexe em Asaas |
| `PATCH /api/entregas/:p/editar` | `routes/entregas.js:890` | MODIFICAR | **PEDE** | Corrige uma entrega concluída (refaz pagamentos/itens; Asaas) | Mexe em dinheiro já registrado |
| `DELETE /api/entregas/:p/estorno` | `routes/entregas.js:1148` | ESTORNAR | **PEDE** | Estorno logístico: desfaz a conclusão da entrega | Desfaz baixa/pagamentos |
| `PATCH /api/entregas/:p/prioridade` | `routes/entregas.js:1228` | MODIFICAR | **PEDE** | Define/remove prioridade de parada | Ordem de entrega |
| `POST /api/entregas/reordenar-prioridades` | `routes/entregas.js:1307` | MODIFICAR | **PEDE** | Compacta as prioridades de todos os motoristas | Mexe na ordem do dia inteiro |

### `/api/caixa` (20) — 20 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `POST /api/caixa/autorizacoes-devolucao/:p/responder` | `routes/caixa.js:161` | BAIXAR_FATURAR | **PEDE** | Autoriza (com senha) ou rejeita pedido de autorização de devolução | Aprovação; exige senha de humano |
| `PUT /api/caixa/conferencia-dinheiro/config` | `routes/caixa.js:295` | MODIFICAR | **PEDE** | Liga/desliga a conferência do dinheiro (só admin: o agente leva 403 de qualquer jeito) | Regra do caixa; admin-only |
| `PATCH /api/caixa/adiantamento` | `routes/caixa.js:1120` | MODIFICAR | **PEDE** | Define o adiantamento do caixa (upsert; confirmação para diminuir) | Altera saldo esperado do caixa |
| `POST /api/caixa/conferencia-dinheiro/enviar` | `routes/caixa.js:1205` | BAIXAR_FATURAR | **PEDE** | Manda o caixa para a fila de conferência do dinheiro (idempotente) | Etapa de fechamento do caixa |
| `POST /api/caixa/conferencia-dinheiro/conferir` | `routes/caixa.js:1227` | BAIXAR_FATURAR | **PEDE** | "Quem recebe o dinheiro assina" a conferência | Confere dinheiro: só humano |
| `POST /api/caixa/contagem-dinheiro` | `routes/caixa.js:1266` | CRIAR | **PEDE** | Registra uma contagem de cédulas (idempotente por id) | Contagem falsa mascara diferença; fora do escopo do Luke (BPO financeiro/estoque) |
| `POST /api/caixa/conferencia-dinheiro/desfazer` | `routes/caixa.js:1300` | ESTORNAR | **PEDE** | Desfaz a conferência do dinheiro | Reabre o caixa |
| `POST /api/caixa/fechar` | `routes/caixa.js:1316` | BAIXAR_FATURAR | **PEDE** | Fecha o caixa do dia | Fechamento do caixa |
| `POST /api/caixa/conferir` | `routes/caixa.js:1476` | BAIXAR_FATURAR | **PEDE** | Admin confere o caixa (FECHADO→CONFERIDO) | Conferência: só humano |
| `POST /api/caixa/reverter-conferencia` | `routes/caixa.js:1499` | ESTORNAR | **PEDE** | CONFERIDO→FECHADO | Desfaz conferência |
| `POST /api/caixa/reabrir` | `routes/caixa.js:1554` | ESTORNAR | **PEDE** | FECHADO→ABERTO (transação) | Desfaz fechamento |
| `POST /api/caixa/reabrir-pendentes` | `routes/caixa.js:1638` | ESTORNAR | **PEDE** | Reabre em massa caixas fechados com pendência | Em massa |
| `PATCH /api/caixa/entrega-conferir` | `routes/caixa.js:1694` | BAIXAR_FATURAR | **PEDE** | Marca entrega como conferida no caixa (pode criar/atualizar pagamentos) | Conferência |
| `POST /api/caixa/conferencia-devolucao/autorizar` | `routes/caixa.js:2011` | BAIXAR_FATURAR | **PEDE** | Libera conferência de devolução digitando a própria senha | Aprovação com senha de humano |
| `POST /api/caixa/conferencia-devolucao/solicitar-autorizacao` | `routes/caixa.js:2061` | CRIAR | **PEDE** | Cria pedido de autorização (aparece como pop-up p/ o responsável) | Notificação interna; fora do escopo do Luke (BPO financeiro/estoque) |
| `POST /api/caixa/conferencia-devolucao/cancelar-solicitacao` | `routes/caixa.js:2139` | EXCLUIR | **PEDE** | Cancela pedido pendente de autorização | Baixo |
| `POST /api/caixa/conferencia-devolucao/confirmar` | `routes/caixa.js:2165` | BAIXAR_FATURAR | **PEDE** | Grava contagem da devolução e calcula/cria a cobrança por falta | Gera cobrança ao motorista |
| `POST /api/caixa/conferencia-devolucao/reabrir` | `routes/caixa.js:2323` | ESTORNAR | **PEDE** | CONFERIDA→PENDENTE | Desfaz conferência |
| `POST /api/caixa/cobrancas-rota/baixar` | `routes/caixa.js:2749` | BAIXAR_FATURAR | **PEDE** | Baixa oficial dos títulos cobrados na rua (cria pagamento, quita parcela; idempotente por cobrança) | Quita título; toca Asaas |
| `POST /api/caixa/quitar-ca` | `routes/caixa.js:2917` | BAIXAR_FATURAR | **PEDE** | Dá baixa das entregas à vista (local p/ especial; no CA via API p/ normal) e trata PIX Asaas | Quitação em massa; CA/Asaas |

### `/api/dashboards` (6) — 6 PEDE

| Chave | Handler | Categoria | Nível | Efeito colateral relevante | Risco / guarda do servidor |
|---|---|---|---|---|---|
| `PATCH /api/dashboards/geral/carteira/cliente/:p` | `routes/dashboards.js:650` | MODIFICAR | **PEDE** | Salva a ficha do cliente na carteira (gestor) | Analítico comercial; fora do escopo do Luke (BPO financeiro/estoque) |
| `POST /api/dashboards/geral/carteira/mesmo-cliente` | `routes/dashboards.js:655` | CRIAR | **PEDE** | Cria vínculo "mesmo cliente" (junta cadastros nos indicadores) | Distorce indicadores se errado; reversível (DELETE); fora do escopo do Luke (BPO financeiro/estoque) |
| `DELETE /api/dashboards/geral/carteira/mesmo-cliente/:p` | `routes/dashboards.js:664` | EXCLUIR | **PEDE** | Desfaz o vínculo "mesmo cliente" | Reversível |
| `POST /api/dashboards/geral/carteira/sugestao-dispensar` | `routes/dashboards.js:672` | OUTRO | **PEDE** | Dispensa uma sugestão de "mesmo cliente" | Esconde sugestão |
| `POST /api/dashboards/geral/carteira/silencio` | `routes/dashboards.js:681` | CRIAR | **PEDE** | Silencia cliente na carteira por N dias | Esconde cliente dos alertas; fora do escopo do Luke (BPO financeiro/estoque) |
| `DELETE /api/dashboards/geral/carteira/silencio/:p` | `routes/dashboards.js:690` | EXCLUIR | **PEDE** | Desfaz o silêncio | Reversível |

## Decisões para o dono

1. **Conciliar é CRIAR ou MODIFICAR?** Recomendo **nem um nem outro: é categoria própria (CONCILIAR) e fica PEDE.** Conciliar não cria registro novo; amarra extrato a baixa e muda o status do lançamento (e o `conciliar-unificado`/`conciliar-varios` ainda DÃO BAIXA em boletos). Caminho futuro: liberar só `POST /:p/conciliar` quando houver 1 candidato exato (valor+data), via guarda — o `conciliar-auto` do próprio sistema já usa essa regra.
2. **Criar conta a pagar já paga (`pago:true`) e criar despesa a partir do extrato (`criar-despesa`).** Recomendo: `POST /api/contas-pagar` e `gerar-conta` **liberados só sem `pago`** (G4: o servidor recusa `pago:true` do agente; quitar é PEDE). `criar-despesa` (nasce paga, mas valor/data/banco vêm do extrato) pode ser LIBERADO* assim que existir G1 (1 despesa por lançamento).
3. **Dar entrada de nota (`gerar-conta` e `registrar-entrada`).** São o coração do trabalho do Luke. `gerar-conta` recomendo LIBERADO* (cria a dívida, a nota já trava duplicata). `registrar-entrada` (bonificação/amostra/troca = "não é dívida") recomendo **PEDE**: classificar errado faz uma dívida real nunca aparecer no contas a pagar. Os dois **disparam confirmação na SEFAZ** — decidir se o agente pode (recomendo NÃO: G8 desliga a manifestação automática quando quem chama é o agente, e o dono confirma na tela).
4. **Lote (`despesas-lote`, até 200) e importar-lote.** Recomendo PEDE no lote de despesas (um engano de categoria se repete 200×) e teto menor (ex.: 20) para o agente (G10).
5. **Ajuste manual de saldo (`por-conta/ajuste`) e criar bloco da DRE.** São "criar", mas fabricam saldo/estrutura do relatório sem lastro. Recomendo PEDE nos dois (e categoria de despesa nova LIBERADO, porque a classificação na DRE continua com o dono).
6. **Ajuste de estoque e inventário (`/estoque/ajuste`, `/inventario`, `/pcp/estoque/ajuste`).** ENTRADA de estoque parece "lançar", mas altera saldo/custo sem documento. Recomendo PEDE (MODIFICAR); a entrada legítima de estoque do Luke já vem pela nota (`gerar-conta`).
7. **Criar produto novo e fornecedor novo.** Recomendo LIBERADO* nos dois: produto (`POST /produtos` e `criar-produto` da nota) com 409 por nome e categoria que já existe — falta só G9 (sem `estoqueInicial`/`valorVenda`); fornecedor exige CNPJ/CPF (ou checa razão social) e já enfileira envio ao CA (inócuo com CA somente leitura). `criar-produto` da nota já é seguro (idempotente) → LIBERADO.
8. **Anexar arquivo.** `POST /contas-pagar/:p/anexos` LIBERADO (só acrescenta; duplicata vira aviso). **Mas `POST /contas-pagar/:p/pdf` SUBSTITUI e apaga o anterior** → PEDE; o Luke deve usar só `/anexos`. Apagar/trocar tipo de anexo = PEDE. Quer que o aviso de duplicata (mesmo SHA-256) vire bloqueio para o agente?

### Pontos que precisam ir ao PR (achados da análise)

- Nenhuma rota de criação tem **idempotência**: duplo envio do agente (retry de rede) duplica despesa, fornecedor sem documento e SUB de PCP. É o pré-requisito nº 1 para qualquer LIBERADO*.
- `POST /api/fornecedores/:p/cadastro-pessoa` escreve em `clientes` protegida só por `checkAcesso` (permissão de leitura). Mesmo PEDE no seed, vale corrigir para `checkEscrita`.
- Categoria de despesa nasce sozinha a partir de texto livre em `POST /contas-pagar` (via `idPorNome`) e não há trava para categoria FORA_DRE/lucros.
- `PATCH /api/pcp/itens/:p/ativo` é toggle (não idempotente): se um dia for liberado, repetir desfaz.
- `resolverEntrada` (agentePoliticaService) só aceita override `LIBERADO` para leitura (`ehLeitura`); o PR precisa ajustar essa regra para as escritas LIBERADAS.
