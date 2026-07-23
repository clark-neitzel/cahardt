---
aba: Contas a Receber
rota: /financeiro/contas-receber/tabela
permissao: Pode_Acessar_Contas_Receber
---

# Contas a Receber

## O que é

Gestão financeira de todas as contas a receber. **Desde 23/07/2026 o app é o dono do financeiro** (o Conta Azul virou somente leitura): cada pedido finalizado gera a conta com parcelas aqui mesmo, e as baixas acontecem só no app. Esta tela mostra o estado de cada parcela (pendente, parcial, pago, vencido), permite dar baixa manual — total, parcial ou com desconto (inclusive 100%) — e gerar relatórios de inadimplência.

Também existem **contas importadas do Conta Azul** (origem IMPORTADO_CA): são cobranças antigas que viviam lá e foram trazidas para cá na migração — aparecem sem pedido vinculado, com a descrição original do CA.

---

## O que dá pra fazer aqui

- Ver todas as parcelas de contas a receber em formato de tabela
- Filtrar por: busca (cliente/pedido), status da conta, status da parcela, origem, vendedor, categoria de cliente, condição de pagamento, cobrança (boleto/pix/dinheiro/cartão), forma de pagamento de entrega, forma de pagamento da baixa e período de vencimento/pagamento
- Ordenar por qualquer coluna (clique no cabeçalho)
- Selecionar parcelas em lote e dar baixa coletiva (sempre pelo valor cheio de cada parcela)
- Dar baixa em uma parcela individual — pode ser o valor total, um valor parcial (o restante fica pendente como PARCIAL) e/ou um desconto (em R$ ou %, incluindo 100% do saldo, sem precisar receber nada)
- Ver o histórico de cada pagamento recebido numa parcela (data, valor, desconto, quem registrou) e estornar um pagamento específico sem mexer nos outros
- Sincronizar situação de uma conta específica ou de todas as contas com o Conta Azul
- Acompanhar progresso de sincronização em tempo real (log de sync)
- Abrir popup do cliente para ver histórico e inadimplência
- Abrir popup do pedido para ver detalhes
- Gerar relatório de inadimplência agrupado por pedido, cliente, vendedor ou sem agrupamento
- Exportar a lista filtrada em CSV
- Emitir e gerenciar **boletos via Asaas** por parcela (botão "Boletos Asaas" na conta expandida da visão resumo)

---

## Status das parcelas

| Status | Cor | Significado |
|--------|-----|-------------|
| PENDENTE | Cinza | Aguardando vencimento, nenhum valor recebido ainda |
| PARCIAL | Amarelo | Recebeu parte do valor (ou desconto parcial) — ainda tem saldo restante |
| VENCIDO | Vermelho | Prazo expirado sem pagamento |
| PAGO | Verde | Quitada — recebido + desconto cobrem o valor total |
| CANCELADO | Cinza claro | Parcela cancelada |

---

## Como fazer (passo a passo real)

### Ver contas em aberto
1. Abra a aba Contas a Receber
2. Por padrão, o filtro mostra contas pendentes e vencidas
3. Ordene por vencimento para ver as mais antigas primeiro

### Filtrar contas
1. Clique no painel de filtros (ou use os filtros rápidos no topo)
2. Escolha um ou mais dos filtros disponíveis:
   - **Status da conta**: Aberto, Fechado, Cancelado
   - **Status da parcela**: Pendente, Vencido, Pago, Cancelado
   - **Origem**: de onde a conta veio (ex: pedido normal, especial)
   - **Vendedor**: filtra contas dos clientes de um vendedor
   - **Categoria de cliente**: segmento do cliente
   - **Condição de pagamento**: a condição exata do pedido (ex: 14 dias - Boleto, À vista - Pix)
   - **Cobrança**: como o título é cobrado — Boleto, Pix, Dinheiro ou Cartão. Vem da condição do pedido, então **funciona com contas ainda em aberto** (ex.: Status Conta = Aberto + Cobrança = Boleto lista tudo que está para receber em boleto, sem precisar marcar uma a uma as condições "7 dias - Boleto", "14 dias - Boleto"...)
   - **Forma de pagamento entrega**: forma registrada pelo motorista
   - **Forma Pgto (baixa)**: como a parcela foi quitada — só encontra parcela **já baixada** (parcela em aberto ainda não tem forma de pagamento). Para filtrar boleto em aberto, use o filtro **Cobrança**
   - **Período de vencimento / período de pagamento**
3. Os filtros são salvos no localStorage por usuário

### Dar baixa em uma parcela (total, parcial ou com desconto)
1. Localize a parcela na tabela (ou abra "Ver detalhes" e clique em **Dar baixa**)
2. Clique no botão de baixa (ícone de cheque) na linha
3. O modal abre já com o **valor recebido** preenchido com o saldo restante — reduza esse valor para registrar um pagamento parcial
4. Opcionalmente marque **Aplicar desconto no saldo restante** (só aparece habilitado para quem tem a permissão `Pode_Dar_Desconto_Baixa`): escolha R$ ou % e informe o motivo (obrigatório). Um desconto de 100% do saldo quita a parcela sem receber nada
5. Informe forma de pagamento, data, o **banco/caixa** em que o dinheiro entrou (vem pré-selecionado com a conta padrão; alimenta o relatório "Saldos por Conta") e observação (opcionais além do valor)
6. O modal mostra ao vivo se a parcela vai ficar **PARCIAL** (com o saldo que ainda falta) ou **PAGO** (quitada)
7. Confirme — cada baixa fica registrada no histórico de pagamentos da parcela (visível em "Ver detalhes"), permitindo estornar só aquele pagamento depois, sem afetar os demais

### Dar baixa em lote
1. Marque os checkboxes das parcelas desejadas (só aparecem parcelas ainda sem nenhum pagamento — Pendente/Vencido)
2. Clique em **Baixa em Lote** (botão no topo da tabela)
3. Informe a forma de pagamento, a data e o **banco/caixa** em que o dinheiro entrou (vem pré-selecionado com a conta padrão; alimenta o relatório "Saldos por Conta") para todas
4. Confirme — todas as parcelas selecionadas são baixadas de uma vez pelo valor cheio (baixa em lote não aceita valor parcial nem desconto — para isso, use a baixa individual)

### Emitir boleto pelo app (Asaas)
1. Na visão resumo (acordeão), expanda a conta e clique em **Boletos Asaas** (aparece só se a integração Asaas estiver configurada no servidor)
2. No modal, emita o boleto de uma parcela específica ou de **todas as parcelas em aberto** de uma vez — o vencimento e o valor (saldo) vêm do nosso Contas a Receber
3. Para cada boleto emitido dá para: **Abrir o PDF**, **copiar a linha digitável**, **enviar por WhatsApp** ao cliente (mensagem pronta com link e linha digitável) e **cancelar** o boleto
4. Quando o cliente pagar, o Asaas avisa o sistema e a **baixa acontece sozinha** na parcela (lançada na conta financeira ASAAS). O modal mostra "Pago via Asaas"
5. O cliente precisa ter **CPF/CNPJ no cadastro** (exigência do boleto registrado); sem isso a emissão avisa o erro
6. A nota fiscal é emitida **pelo próprio app** (aba Notas Fiscais, via Focus NFe) — o Asaas cuida só da cobrança
7. **Se o vencimento da parcela mudar depois do boleto emitido**, o sistema **atualiza o boleto no Asaas sozinho** — ao abrir o modal de boletos ou ao imprimir — e o PDF e a linha digitável passam a valer a data nova. Se esse ajuste automático falhar, o modal mostra um aviso amarelo ("boleto com vencimento diferente da parcela"); nesse caso, cancele o boleto e emita de novo antes de enviar ao cliente
8. **Boleto que passou do vencimento** aparece com o badge vermelho **"Boleto vencido"** — ele **continua pagável** no banco do cliente (com juros/multa, se configurados), então o sistema **não emite outro sozinho** (evita duas cobranças vivas e pagamento em dobro). As ações (PDF, linha digitável, WhatsApp, cancelar) continuam disponíveis. Para gerar um boleto com vencimento novo, **cancele o vencido primeiro** e depois emita outro

### Sincronizar com o Conta Azul (transição — só contas antigas)
- O Conta Azul é **somente leitura** desde 23/07/2026: o app não registra mais nada lá
- O sync continua existindo apenas para **puxar** baixas de contas antigas (da era CA) que ainda sejam registradas por lá — pedidos novos não têm nada no CA
- Clique no ícone de atualização (reload) em uma conta específica, ou em **Sync Todas**

### Gerar relatório de inadimplência
1. Clique no botão **Relatório** (no topo)
2. Defina o período de vencimento e opcionalmente a categoria de cliente
3. Escolha o agrupamento: por pedido, por cliente, por vendedor ou sem agrupamento
4. O relatório é gerado na tela com totais por grupo

### Exportar em CSV
1. Aplique os filtros desejados
2. Clique em **Exportar CSV**
3. O arquivo é baixado com as parcelas visíveis na tabela

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Contas_Receber` |
| Dar baixa (individual ou em lote), estornar (tudo ou um pagamento específico) | `Pode_Baixar_Contas_Receber` ou `admin` |
| Aplicar desconto numa baixa (parcial ou 100%) | `Pode_Dar_Desconto_Baixa` ou `admin` (além de ter `Pode_Baixar_Contas_Receber`) |
| Sincronizar com o CA | `Pode_Acessar_Contas_Receber` (acesso à tela permite sync) |
| Ver contas de todos os vendedores | Qualquer usuário com acesso à tela (a tela não filtra por vendedor automaticamente) |

---

## Depende de / Interfere em

- **Pedidos** — cada pedido finalizado gera a conta com parcelas aqui (tudo no app; nada vai ao CA)
- **Conta Azul (legado)** — contas antigas da era CA foram importadas para cá (origem IMPORTADO_CA). Baixa dada **no Conta Azul** numa dessas contas importadas é espelhada no app sozinha (a cada 3 horas): a parcela é quitada com o banco/forma de lá e o crédito aparece na Conciliação Bancária e nos Saldos por Conta
- **Notas Fiscais** — a NF-e do pedido é emitida pelo app (Focus NFe)
- **Caixa Diário** — baixas feitas pelo motorista na entrega também atualizam as parcelas aqui
- **Clientes** — a inadimplência exibida na Rota e no detalhe do cliente vem dos dados desta tela

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Financeiro/ContasReceberTabela.jsx` | Tela completa com tabela, filtros, baixa, sync e relatório |
| `frontend/src/services/contasReceberService.js` | Chamadas de API para contas a receber |
| `backend/src/routes/contasReceber.js` | Rotas do backend |
