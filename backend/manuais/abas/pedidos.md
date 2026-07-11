---
aba: Pedidos
rota: /pedidos
permissao: pedidos (view)
---

# Pedidos

## O que é

Central de consulta e gerenciamento de todos os pedidos lançados no sistema. Aqui você vê, filtra, imprime e acompanha o ciclo de vida de cada pedido — desde que foi criado até o faturamento no Conta Azul.

> **Atenção:** criar um pedido novo **não começa aqui**. Começa na aba **Rota**, no card do cliente, clicando em "Novo Pedido". Esta tela é de gestão, não de criação.

---

## O que dá pra fazer aqui

- Visualizar pedidos separados por tipo (sub-abas: Pedidos | Especiais | Bonificação | Amostras | Devoluções)
- Filtrar por data de entrega, data de criação, vencimento, embarque, motorista e vendedor
- Buscar por cliente, cidade, vendedor, documento ou número do pedido
- Filtrar rapidamente por status (Aberto, Enviar, Sincronizando, Aprovado, Faturado, Erro)
- Carregar a lista aos poucos: mostra os 50 primeiros e um botão **Carregar mais** (deixa a tela leve e rápida)
- Ver pendências de envio ao Conta Azul em tempo real
- Imprimir pedido individual ou vários ao mesmo tempo (seleção em lote)
- Enviar comprovante do pedido via WhatsApp para o cliente
- Aprovar ou reverter pedidos Especiais e Bonificações (quem tem permissão)
- Consultar situação atualizada no Conta Azul (pílula **Sync CA**) — também atualiza o check do boleto do CA
- Pílula **CA** (ícone do Conta Azul): cobranças/boletos gerados no CA. **Check verde ✓** = tem boleto no CA (cinza = já pago). O boleto do CA só é gerado manualmente dentro do Conta Azul
- Pílula **Asaas**: gerar/gerenciar **boleto pelo Asaas** (por parcela, com envio por WhatsApp). **Check verde ✓** = boleto emitido (cinza = pago). Só em pedido a prazo faturado; não aparece em especial, bonificação nem à vista
- Pílula **PIX Asaas** (pedidos à vista e especiais): gerar cobrança PIX / link de pagamento
- Baixar a **DANFE (PDF da NF-e)** de pedido faturado (ícone de recibo) — o app busca o XML autorizado na API do Conta Azul e gera o PDF na hora, sem precisar entrar no CA
- Reatribuir pedido para outro vendedor (quem tem permissão)
- Excluir pedidos (quem tem permissão específica por tipo)
- Avançar status de amostras (Solicitada → Preparação → Liberado)

---

## Como a lista carrega (rápido e leve)

- A lista mostra **50 pedidos por vez**, do mais novo para o mais antigo. Para ver mais, clique em **Carregar mais** no fim da lista (o rodapé mostra "Mostrando X de Y").
- A **busca** e o **filtro rápido de status** (Aberto/Enviar/Faturado…) valem sobre **todos os pedidos**, não só os que já apareceram na tela — o sistema busca no servidor. As contagens ao lado de cada status também são o total real.
- O filtro de **data de entrega** começa **limpo**. Se você escolher um período, ele fica **lembrado** para a próxima vez que abrir a tela. O botão **Limpar** zera todos os filtros (inclusive a data) e volta ao normal.
- A busca por texto encontra por **cliente, cidade, vendedor, documento ou número** (ex.: `123`, `ZZ#45`, `BN#7`). Não busca mais pelo valor total do pedido.

---

## Como fazer (passo a passo real)

### Criar um pedido novo
1. Vá para a aba **Rota**
2. Localize o card do cliente desejado
3. Clique em **"Novo Pedido"** no card
4. O sistema abre `/pedidos/novo?clienteId=...` (tela `NovoPedido`)
5. Escolha o **tipo** (Pedido Normal, Especial ou Bonificação)
6. Selecione a **condição de pagamento** e a **data de entrega**
7. Adicione os produtos e quantidades
8. Clique em **Salvar** — o pedido é criado com status **ABERTO**

### Enviar pedido ao Conta Azul
- Pedidos com status **ABERTO** precisam ser marcados como **ENVIAR** (ou isso ocorre automaticamente via sincronização)
- Ao sincronizar (`/admin/sync`), pedidos com status ENVIAR são enviados ao CA
- Após o envio, o status muda para **RECEBIDO**

### Acompanhar pedidos pendentes
- O painel no topo da lista mostra alertas coloridos: quantos pedidos estão em **Enviar**, **Aprovados** e **Erro**
- Clique no alerta para ir direto àquele grupo

### Imprimir em lote (DANFEs + boletos / recibo do especial)
1. Marque os pedidos pelos checkboxes (ou clique **"Selecionar faturados"**) → clique **Imprimir N**
2. Na janela, escolha: **2 vias de cada documento** (uma p/ assinatura, outra p/ cliente) e **boleto logo após as vias** (sai na sequência, pronto p/ grampear)
3. **Imprime boleto do Conta Azul E do Asaas** — ao clicar em Imprimir, o app consulta o CA de cada pedido; se achar boleto lá, baixa o PDF e inclui na sequência (junto com os do Asaas). Condição com 2 parcelas = 2 boletos, na ordem
4. **Boleto já quitado NÃO é impresso** (não faz sentido). Se precisar imprimir um boleto pago (p/ o cliente conferir), faça pelo **Contas a Receber**
5. Avisos automáticos: pedidos **a prazo sem boleto (nem no CA, nem no Asaas)** aparecem em destaque com o botão **"Gerar boletos agora"** (gera no Asaas — o do CA só é gerado manualmente lá dentro); pedidos **sem NF-e emitida** são pulados (emita a nota no CA primeiro); pedidos **à vista** saem sem boleto (não há o que cobrar)
4. Pedido **ESPECIAL** sai no **recibo de conferência** (modelo sem a marca da Hardt, com itens, total e linha de assinatura) — especiais só imprimem pelo lote
5. Sai **um único PDF** com as folhas na ordem certa; as opções ficam lembradas para a próxima
- O botão de imprimir o pedido individual foi **removido** — a DANFE substitui; para mandar um pedido a alguém, use um print da tela

### Gerar PIX de um pedido (cobrança à vista / link de pagamento)
1. Na pílula **PIX** do pedido (aparece em pedidos à vista e especiais), escolha o valor e a **validade** (hoje / amanhã / 3 dias / 7 dias — o QR e o link valem até o fim do dia escolhido)
2. Mostre o QR, **copie o código PIX** ou **envie o link por WhatsApp** ao cliente
3. Quando pagar: **baixa automática** no app e no Conta Azul (conta ASAAS); check verde ✓ aparece na pílula
4. **Pedido ESPECIAL + PIX = conversão**: antes de gerar aparece um aviso vermelho destacado — ao receber qualquer valor via PIX (parcial ou total), o pedido especial é **convertido automaticamente em pedido normal**: ganha número novo na sequência, vai ao Conta Azul e a **NF-e deve ser emitida** pelo faturamento
5. Quem fatura recebe um **popup a cada 5 minutos** ("Pedido convertido — emitir NF-e") até dar ciência; quem recebe esse aviso é escolhido na aba **Usuários/Vendedores** (ícone de setas circulares laranja)

### Aprovar Pedido Especial ou Bonificação
1. Vá para a sub-aba **Especiais** ou **Bonificação**
2. Localize o pedido com status **ABERTO**
3. Clique em **Aprovar** (botão verde) — exige permissão `Pode_Aprovar_Especial` ou `Pode_Aprovar_Bonificacao`
4. O status muda para RECEBIDO e é faturado no CA

### Consultar situação no Conta Azul
- Clique no botão de reload ao lado do pedido que já tem `idVendaContaAzul`
- O sistema consulta o CA e atualiza `situacaoCA` e `statusEnvio`

### Ver link de cobrança (PIX/Boleto)
- Clique no ícone de cifrão ao lado do pedido faturado
- O sistema busca as cobranças ativas no CA e exibe os links
- Há botão **Copiar** para copiar todos os links formatados

---

## Sub-abas

A tela Pedidos possui 5 sub-abas internas (6 contando Devoluções para quem tem permissão).

### Pedidos (aba principal)
Lista todos os pedidos normais (`especial = false`, `bonificacao = false`). Inclui pedidos de Encaixe (marcados como encaixe mas do tipo normal). É a aba padrão ao abrir a tela.

- Filtros por data de entrega, criação, vencimento, embarque e motorista
- Filtros por status rápido clicáveis no painel de pendências
- Seleção em lote para impressão (pedidos FATURADO)

### Especiais
Lista pedidos do tipo **Especial** (`ZZ#`). São pedidos com condições diferenciadas de preço ou prazo, que requerem aprovação antes de ir ao CA.

- Exibe botão **Aprovar** (para aprovadores) e **Reverter** (para quem pode reverter)
- Após aprovação, o status muda e o pedido é faturado no CA automaticamente

### Bonificação
Lista pedidos do tipo **Bonificação** (`BN#`). Produtos enviados de graça para o cliente. Também requerem aprovação.

- Mesma lógica de aprovação e reversão dos Especiais
- Permissões separadas: `Pode_Aprovar_Bonificacao` e `Pode_Reverter_Bonificacao`

### Amostras
Lista pedidos do tipo **Amostra** (`AM#`). Produtos enviados como amostra com fluxo de status próprio.

Status possíveis: `SOLICITADA → PREPARACAO → LIBERADO → ENTREGUE`

- Botão de avançar status: muda para o próximo estado
- Botão de excluir amostra (quem tem `Pode_Excluir_Amostra`)
- Controle de amostras por produto

### Devoluções
Visível apenas para quem tem `Pode_Fazer_Devolucao` ou `admin`. Renderiza o componente `ListaDevolucoes`.

Mostra todas as devoluções registradas (parciais ou totais) com motivo, motorista, data, valor e status (ATIVA ou REVERTIDA).

---

## Tipos de pedido

| Tipo | Prefixo | Descrição |
|------|---------|-----------|
| Normal | `#123` | Pedido padrão de venda |
| Especial | `ZZ#123` | Condições diferenciadas; requer aprovação |
| Bonificação | `BN#123` | Produto grátis/bonificado; requer aprovação |
| Encaixe | `#123` (flag) | Pedido urgente encaixado na rota |
| Amostra | `AM#123` | Produto enviado como amostra; sub-aba própria |
| Devolução | — | Sub-aba própria; visível para quem tem `Pode_Fazer_Devolucao` |

---

## Status do pedido

| Status | Significado |
|--------|-------------|
| ABERTO | Criado, ainda não enviado ao CA |
| ENVIAR | Marcado para envio na próxima sincronização |
| SINCRONIZANDO | Sendo processado pelo worker de sync |
| RECEBIDO | Enviado e aceito pelo CA |
| ERRO | Falha no envio; o motivo aparece em vermelho |
| FATURADO | Confirmado/faturado pelo CA |

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a aba | `pedidos` (view) |
| Aprovar Especial | `Pode_Aprovar_Especial` ou `admin` |
| Reverter Especial | `Pode_Reverter_Especial` ou `admin` |
| Aprovar Bonificação | `Pode_Aprovar_Bonificacao` ou `admin` |
| Reverter Bonificação | `Pode_Reverter_Bonificacao` ou `admin` |
| Excluir pedido normal | `Pode_Excluir_Pedido` ou `admin` |
| Excluir pedido especial | `Pode_Excluir_Especial` ou `admin` |
| Excluir bonificação | `Pode_Excluir_Bonificacao` ou `admin` |
| Excluir amostra | `Pode_Excluir_Amostra` ou `admin` |
| Ver pedidos de todos os vendedores | `pedidos.clientes = "todos"` ou `admin` |
| Reatribuir vendedor | `Pode_Reatribuir_Vendedor` ou `admin` |
| Ver sub-aba Devoluções | `Pode_Fazer_Devolucao` ou `admin` |

---

## Depende de / Interfere em

- **Rota** — é onde pedidos novos são criados (botão "Novo Pedido" no card do cliente)
- **Conta Azul** — pedidos são enviados ao CA via sincronização; a situação volta para o app (`FATURADO`, `APROVADO`)
- **Embarque** — pedidos faturados são adicionados a embarques na aba Embarque
- **Entregas** — após o embarque, o status de entrega aparece no card do pedido
- **Contas a Receber** — faturamento no CA gera contas a receber; reverter especial cancela a conta no CA
- **Sincronizar** (`/admin/sync`) — executa o envio em lote dos pedidos ao CA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Pedidos/ListaPedidos.jsx` | Tela principal da aba (listagem, filtros, sub-abas, ações) |
| `frontend/src/pages/Pedidos/NovoPedido.jsx` | Formulário de criação/edição de pedido |
| `frontend/src/pages/Pedidos/ImpressaoPedido.jsx` | Tela de impressão de 1 ou N pedidos |
| `frontend/src/pages/Pedidos/ListaDevolucoes.jsx` | Sub-aba de devoluções |
| `frontend/src/services/pedidoService.js` | Chamadas de API para pedidos |
| `frontend/src/services/amostraService.js` | Chamadas de API para amostras |
| `backend/src/routes/pedidos.js` | Rotas do backend para pedidos |
