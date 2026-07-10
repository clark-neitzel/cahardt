---
aba: Caixa Diário
rota: /caixa
permissao: Pode_Acessar_Caixa
---

# Caixa Diário

## O que é

Resumo financeiro diário do motorista/vendedor. Mostra tudo que aconteceu em um dia: entregas realizadas, valores recebidos por forma de pagamento, amostras entregues, despesas registradas, adiantamento e o total a prestar de contas. O admin usa para conferir e fechar o caixa de cada vendedor.

---

## O que dá pra fazer aqui

- Ver resumo do dia selecionado: total entregue, total recebido por forma de pagamento, adiantamento
- Selecionar data e vendedor (admin pode ver qualquer um; usuário comum vê sempre o próprio)
- Ver lista de entregas do dia com status de cada uma (PENDENTE, ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)
- Registrar baixa de pagamento no Conta Azul — seleção individual ou em lote por checkbox
- Marcar entregas como "conferidas" (assinatura verificada pelo admin)
- Registrar uma nova despesa do dia (combustível, pedágio, hotel, manutenção, etc.)
- Ver amostras entregues no dia
- Ver atendimentos do dia
- Ver e editar KM inicial do veículo do dia
- Ver o VALOR A PRESTAR — só aparece quando o dia está "certo"; senão mostra um checklist do que falta (KM final, entregas pendentes, clientes sem atendimento)
- Acessar ficha completa do veículo
- Fechar o caixa do dia (muda status para FECHADO)
- Imprimir relatório do caixa (`/caixa/impressao`)
- Conferir o caixa (admin: após revisão, marca como CONFERIDO)
- Reverter a conferência (admin: volta CONFERIDO → FECHADO)
- Reabrir o caixa (admin: volta FECHADO → ABERTO)
- Registrar devolução a partir de uma entrega do caixa
- **Conferir devoluções fisicamente** (cartão "Conferência de Devoluções"): contar a mercadoria que voltou no caminhão, comparar com o que o motorista marcou como devolvido, registrar sobras e cobrar faltas do motorista
- **Autorizar desconsiderar falta de devolução** com senha do responsável (ex.: produto que não foi carregado de manhã)

---

## Status do caixa

| Status | Significado |
|--------|-------------|
| ABERTO | Em andamento, ainda pode ser editado |
| FECHADO | Encerrado pelo motorista/vendedor |
| CONFERIDO | Revisado e confirmado pelo admin |

---

## Como fazer (passo a passo real)

### Ver o caixa de hoje
1. Abra a aba Caixa
2. O caixa do dia é carregado automaticamente com a data e vendedor padrão
3. O resumo mostra: total a receber, recebido por forma de pagamento, adiantamento e saldo

### Ver caixa de outro dia ou vendedor
- **Outro dia:** use o seletor de data (só habilitado para `Pode_Ver_Historico_Caixa` ou `admin`; sem essa permissão, o campo fica bloqueado no dia atual)
- **Outro vendedor:** só visível para `admin` ou `Pode_Editar_Caixa`; escolha no select de vendedor
- O seletor mostra **só vendedores ativos**. Um vendedor inativo aparece apenas nos dias em que teve movimento de caixa (marcado como "inativo · teve caixa") — o histórico não se perde

### Registrar baixa no Conta Azul (individual)
1. Na lista de entregas, localize a entrega com pagamento em Dinheiro, PIX ou Cartão
2. Marque o checkbox na coluna "CA" daquela entrega
3. Clique em **Processar selecionada(s)** — o sistema registra o recebimento no Conta Azul

### Registrar baixa em lote
1. Marque os checkboxes de várias entregas de uma vez
2. A barra azul "Baixa CA" aparece no topo da lista com o total selecionado
3. Clique em **Processar N selecionada(s)** — todas as baixas são enviadas ao CA de uma vez

### Registrar uma despesa
1. Clique em **+ Despesa** (botão no topo ou no card do veículo)
2. Escolha a categoria (combustível, pedágio, hotel, manutenção, outro)
3. Informe valor e descrição
4. Salve — a despesa é vinculada ao caixa do dia

### Definir adiantamento
1. No card de resumo, localize o campo **Adiantamento (R$)**
2. Digite o valor e clique em **Salvar** (visível para `Pode_Definir_Adiantamento` ou `admin`)
3. O adiantamento é descontado do total a prestar de contas

### Ver o VALOR A PRESTAR (só aparece com o dia "certo")
O valor a prestar de contas fica **escondido** enquanto o dia não estiver completo. No lugar do valor aparece um checklist laranja "Falta para fechar o dia" com o que ainda precisa ser feito. O valor volta a aparecer sozinho assim que tudo for resolvido. Escondem o valor (para todos, motorista e escritório):
- **KM final do veículo não informado** (quando o dia usou veículo/modo presencial) — o KM final é informado no fechamento do ponto/diário
- **Entregas ainda pendentes** — pedidos do embarque do dia que ainda não foram marcados como entregues/devolvidos
- **Clientes da rota sem atendimento** — clientes com venda marcada para o dia da semana que não tiveram atendimento, pedido nem entrega

Observação: devoluções e baixas de dinheiro **não** entram nesse checklist (são tratadas na parte financeira/fechar caixa, mais abaixo).

### Fechar o caixa
1. Verifique as pendências — se houver, o botão fica desabilitado e as pendências aparecem listadas
2. Clique em **Fechar Caixa** — o sistema pode alertar sobre entregas sem conferência de assinatura (mas não bloqueia)
3. Confirme — o status muda para FECHADO

### Imprimir relatório do caixa
1. Clique em **Imprimir** (disponível com o caixa FECHADO ou CONFERIDO)
2. O sistema navega para `/caixa/impressao?data=...&vendedorId=...`
3. A tela de impressão abre; imprima normalmente

O relatório sai em **2 folhas A4**:
- **Folha 1 (conferência):** valor a prestar em destaque + campos para preencher à mão (Contado, Diferença, Conferido por) + todas as entregas do dia com checkbox e a coluna "Dinheiro" (soma do que deve estar no caixa, com subtotal) + assinaturas do motorista e do conferente. Cabe até ~52 entregas na folha 1; acima disso a lista continua numa folha extra.
- **Folha 2 (apoio):** veículo/KM/média/adiantamento, composição do valor a prestar (o que entra e o que não entra no caixa), despesas detalhadas, resumo das entregas, conferência de devoluções, amostras, **resumo** dos atendimentos/pedidos do dia (contagem por tipo + números dos pedidos; o detalhe de cada atendimento fica só na tela do caixa) e linhas para observações do conferente.

### Conferir o caixa (admin)
1. Selecione o vendedor e o dia desejado
2. Revise as entregas, assinaturas e pagamentos
3. Adicione uma observação administrativa se necessário
4. Clique em **Conferir Caixa** — o status muda para CONFERIDO

### Reverter conferência (admin)
- Clique em **Reverter Conferência** no caixa com status CONFERIDO
- O status volta para FECHADO

### Reabrir caixa (admin)
- Clique em **Reabrir Caixa** no caixa com status FECHADO
- O status volta para ABERTO e os totais são recalculados ao fechar novamente

### Registrar devolução
- Na linha de uma entrega, clique no botão de devolução (ícone de retorno)
- O modal de devolução abre vinculado àquele pedido e àquele caixa

### Conferir devoluções (mercadoria que voltou fisicamente)
O cartão **Conferência de Devoluções** aparece automaticamente quando o dia tem alguma devolução registrada nas entregas. Ele lista cada produto que **deveria voltar** no caminhão, com o número do pedido e o cliente de origem.

1. Quem tem a permissão `Pode_Conferir_Devolucao_Caixa` recebe a mercadoria e digita, produto por produto, **quanto voltou de verdade** (use 0 se nada voltou)
2. O sistema compara:
   - **Bateu** → linha verde "Confere ✓"
   - **Voltou a mais** → sobra, fica só registrada (não gera valor nem mexe em estoque)
   - **Voltou a menos** → falta: o sistema calcula o valor pela tabela de cobrança do motorista (configurada na aba Vendedores; padrão "À vista - Funcionário") e mostra "Cobrar X — R$ Y"
3. Produto que voltou **sem devolução registrada**: use "+ Adicionar produto que voltou sem devolução" (sobra avulsa, só registro)
4. Clique em **Confirmar conferência** — o total das faltas é **somado ao valor a prestar** do caixa como a linha "Faltas de devolução"
5. Depois de confirmada, a conferência fica travada (só consulta); ela aparece também no relatório impresso do caixa
6. **Importante:** se o dia teve devolução, o caixa **só fecha** depois da conferência confirmada
7. A conferência **não movimenta estoque** — o estoque retorna quando o faturamento emite a nota de devolução (fluxo normal)

### Desconsiderar falta com autorização (senha)
Quando a falta não é culpa do motorista (ex.: o produto não foi carregado de manhã):
1. Na linha com falta, clique em **Desconsiderar (autorização)**
2. Escolha **quantas unidades** desconsiderar (pode ser só parte; o restante continua cobrado)
3. Escolha o motivo, o responsável (só aparecem pessoas com `Pode_Autorizar_Desconsiderar_Devolucao`) e digite a **senha do login do responsável** — funciona no celular dele
4. Fica registrado quem autorizou, quando e o motivo (visível no caixa, no relatório impresso e no log de auditoria)

### Reabrir conferência de devoluções
- Com o caixa ABERTO, quem tem `Pode_Reverter_Caixa` ou `admin` pode clicar em **Reabrir conferência** para corrigir uma conferência confirmada (a cobrança é recalculada ao confirmar de novo)

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Caixa` |
| Ver o próprio caixa | `Pode_Acessar_Caixa` (qualquer usuário com acesso) |
| Ver caixas de outros vendedores | `Pode_Editar_Caixa` ou `admin` |
| Ver caixas de outros dias | `Pode_Ver_Historico_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Registrar adiantamento | `Pode_Definir_Adiantamento` ou `Pode_Editar_Caixa` ou `admin` |
| Fechar caixa | `Pode_Fechar_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Registrar baixa no Conta Azul | `Pode_Baixar_Caixa` ou `Pode_Editar_Caixa` ou `admin` |
| Conferir e reverter conferência | `Pode_Reverter_Caixa` ou `admin` (reverter); `admin` ou `Pode_Editar_Caixa` (conferir) |
| Reabrir caixa fechado | `Pode_Reverter_Caixa` ou `admin` |
| Registrar devolução | `Pode_Fazer_Devolucao` ou `admin` |
| Digitar/confirmar a conferência de devoluções | `Pode_Conferir_Devolucao_Caixa` ou `admin` (demais usuários veem só consulta) |
| Autorizar desconsiderar falta de devolução | senha de alguém com `Pode_Autorizar_Desconsiderar_Devolucao` ou `admin` |
| Reabrir conferência de devoluções | `Pode_Reverter_Caixa` ou `admin` (com o caixa ABERTO) |

---

## Depende de / Interfere em

- **Embarque / Entregas** — as entregas do caixa vêm dos embarques criados para aquele motorista
- **Despesas** — são acessíveis também pela aba própria (`/despesas`)
- **Contas a Receber** — a baixa CA registra o recebimento na parcela correspondente no Conta Azul
- **Conta Azul** — a baixa é enviada diretamente para o CA via API
- **Veículos** — o KM inicial e a ficha do veículo do dia são acessíveis dentro do caixa

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/CaixaDiarioPage.jsx` | Tela principal do caixa com todos os fluxos |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de nova despesa |
| `frontend/src/pages/Caixa/ConferenciaDevolucaoCard.jsx` | Cartão de conferência de devoluções + modal de autorização com senha |
| `frontend/src/pages/Pedidos/ModalDevolucao.jsx` | Modal de devolução acessível pelo caixa |
| `frontend/src/pages/Veiculos/VeiculoFicha.jsx` | Ficha do veículo embutida no caixa |
| `frontend/src/services/caixaService.js` | Chamadas de API do caixa |
| `backend/src/routes/caixa.js` | Rotas do backend |
