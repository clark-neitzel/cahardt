---
aba: Embarque
rota: /admin/embarques
permissao: Pode_Acessar_Embarque
---

# Embarque

## O que é

Painel de expedição logística. Aqui são criados os "embarques" (cargas), que são romaneios de entrega: um conjunto de pedidos faturados que serão entregues juntos por um motorista em uma data. Após criar o embarque, o motorista acessa sua lista de entregas pelo celular e registra a baixa de cada entrega.

---

## O que dá pra fazer aqui

- Ver todos os embarques criados (número, data, motorista, quantidade de pedidos)
- Montar uma nova carga: escolher data de saída e motorista responsável
- Abrir o **Mapa das entregas** (botão no topo): dividir os pedidos do dia entre as cargas vendo os pinos no mapa — ver o manual próprio da aba "Mapa das Entregas" (`/admin/embarques/mapa`)
- Abrir o detalhe de uma carga para:
  - Ver os pedidos e amostras incluídos
  - Adicionar mais pedidos à carga (modal `AdicionarPedidosModal`)
  - Remover pedidos ou amostras da carga (desde que a entrega ainda não foi realizada)
  - Editar data e motorista do embarque (quem tem `Pode_Editar_Embarque`)
  - Ver o status de entrega de cada pedido (PENDENTE, ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO)
  - Imprimir o romaneio completo (roteiro de entrega + consolidado de produtos + rastreabilidade)
  - Ver a **versão atual da carga** (badge `vN` no cabeçalho do modal) e o **Histórico da carga** (toda alteração registrada: quem fez, quando e o quê)
  - Ver o aviso amarelo **"A folha impressa ficou para trás"** quando a carga mudou depois da última impressão — sinal de reimprimir o romaneio
  - **Inserir cobranças na carga** (seção "Cobranças na Carga"): pendurar títulos em aberto para o motorista cobrar na rua

---

## Como fazer (passo a passo real)

### Montar uma nova carga
1. Clique em **Montar Nova Carga** (botão azul no canto superior)
2. O modal abre com dois campos:
   - **Data Programada de Saída** — padrão é hoje
   - **Motorista / Responsável** — lista apenas usuários com `Pode_Executar_Entregas` ou `admin`
3. Clique em **Montar Carga** — o embarque é criado com número sequencial
4. O embarque aparece na lista; clique nele para abrir o detalhe e adicionar pedidos

### Adicionar pedidos ao embarque
1. Clique no embarque desejado (desktop: botão "Analisar / Imprimir"; mobile: toque no card)
2. No modal de detalhes, clique em **+ Adicionar Pedidos** (ou equivalente)
3. O modal `AdicionarPedidosModal` abre com a lista de pedidos FATURADOS disponíveis
4. Selecione os pedidos e confirme — eles entram na carga
5. **Não aparecem na lista** (e o sistema recusa se alguém tentar atrelar): pedido **cancelado**, pedido excluído, pedido que já está em outra carga, pedido que está no Kanban do Delivery (esse é entregue por outro fluxo) e **pedido especial (ZZ#) ou bonificação (BN#) ainda pendente de aprovação** — para especial/bonificação, a aprovação é o equivalente do faturamento: só depois de clicar **Aprovar agora** (na tela de Pedidos) o pedido pode entrar em carga. Se alguém tentar atrelar um pendente, o sistema recusa com o motivo ("especial pendente de aprovação" / "bonificação pendente de aprovação")
   - Pedido **devolvido não entra nessa conta**: a devolução só pode ser registrada depois que o motorista marcou a entrega (`ENTREGUE_PARCIAL` ou `DEVOLVIDO`), e a partir daí o pedido fica preso na carga — não sai mais dela nem volta para a lista de disponíveis. Reenvio de mercadoria devolvida é **pedido novo**, nunca o mesmo

### Remover pedido da carga
1. Abra o detalhe do embarque
2. Localize o pedido na lista
3. Clique no ícone de remover (lixeira) ao lado do pedido
4. Confirme — o pedido é retirado da carga
5. **Bloqueio:** pedidos com statusEntrega diferente de PENDENTE (já foram entregues, parciais ou devolvidos) não podem ser removidos; é necessário primeiro desfazer a entrega no sistema

### Editar data ou motorista do embarque
1. Abra o detalhe do embarque
2. Clique no botão de edição (lápis) — visível apenas para `Pode_Editar_Embarque` ou `admin`
3. Altere a data de saída e/ou o motorista responsável
4. Clique em Salvar

### Inserir uma cobrança na carga (Cobrança em Rota)
Serve para mandar um título em aberto junto com o motorista, para ele cobrar do cliente na rua.

1. Abra o detalhe da carga e vá até a seção **Cobranças na Carga** (embaixo dos pedidos/amostras)
2. Clique em **Inserir Cobrança** e **busque o cliente pelo nome** (mínimo 2 letras)
3. A busca mostra **só títulos em aberto**, com parcela, vencimento e saldo; os vencidos vêm marcados em vermelho. A lista **não é limitada aos clientes da carga** — dá para mandar qualquer cobrança
4. Marque um ou vários e clique em **Adicionar** — eles aparecem na carga com a situação **"A cobrar"**
5. Título que já está em outra rota aparece bloqueado ("já em rota"), para não cobrar duas vezes
6. **Tirar da carga:** clique na lixeira da linha. Só sai enquanto estiver "A cobrar" — depois que o motorista registrou algo na rua, fica travado
7. Inserir/tirar cobrança **não sobe a versão da carga** (não muda o romaneio impresso), mas fica registrado no Histórico da carga
8. **Trocar o motorista** da carga leva as cobranças pendentes junto — o novo motorista passa a vê-las na aba Cobranças dele
9. O motorista cobra na tela **Rota → Entregas** (seção "Cobranças a fazer", junto do roteiro do dia) e a **baixa oficial sai no Caixa Diário**, no cartão "Cobranças da Rota"

### Imprimir romaneio
1. Abra o detalhe do embarque
2. Clique em **Imprimir / Pré-visualizar** (ícone de impressora)
3. Uma tela de pré-visualização abre em tela cheia com formato A4
4. O romaneio é dividido em páginas automáticas com 55 itens por página:
   - **Roteiro de Entrega**: lista de pedidos com cliente, cidade e status
   - **Amostras na Carga** (se houver)
   - **Consolidado de Produtos**: quantidade total de cada produto somado de todos os pedidos
   - **Rastreabilidade**: produto → quantidade → quais pedidos o contém
5. Clique em **Imprimir** para enviar para impressora
6. A folha do Roteiro sai com um **QR code no cabeçalho** e o carimbo da versão (ex.: `v3`). Ao clicar em Imprimir, o sistema registra qual versão foi impressa — é essa marca que dispara o aviso de "reimprimir" se alguém mexer na carga depois

### Versões da carga e conferência pelo motorista (como funciona)
1. Toda carga nasce na **versão 1**. Qualquer alteração (mudar data, trocar motorista, adicionar/remover pedido ou amostra) **sobe a versão** e entra no **Histórico da carga** (parte de baixo do modal de detalhes), com quem fez, quando e o quê
2. A folha impressa carrega o QR com a versão daquele momento. Se a carga mudar depois, o modal mostra o aviso amarelo pedindo para **reimprimir**
3. Antes de sair, o motorista escaneia o QR da folha pelo botão **Folha** na tela Minhas Entregas: o app compara a versão da folha com a atual — verde se confere, amarelo mostrando o que mudou, e aviso se a folha for de outro motorista
4. Registrar a versão nunca trava a operação: se o histórico falhar, o salvamento da carga acontece normalmente

---

## Quem aparece como motorista

Apenas usuários com a permissão `Pode_Executar_Entregas` ou `admin` e com status ativo aparecem na lista de motoristas ao montar ou editar uma carga.

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Acessar_Embarque` |
| Criar embarque | `Pode_Acessar_Embarque` (acesso à tela implica criação) |
| Editar data/motorista do embarque | `Pode_Editar_Embarque` ou `admin` |
| Adicionar/remover pedidos da carga | `Pode_Acessar_Embarque` (acesso à tela implica gestão da carga) |
| Inserir/tirar cobranças da carga | `Pode_Acessar_Embarque` ou `admin` |
| Aparecer como motorista disponível | `Pode_Executar_Entregas` ou `admin` |
| Cobrar os títulos na rua | `Pode_Cobrar_Titulo_Rota` (do motorista/vendedor, na tela Minhas Entregas) |

---

## Depende de / Interfere em

- **Pedidos** — só entram no embarque pedidos FATURADOS (ou especial/bonificação **já aprovados** — pendente de aprovação não embarca; a aprovação é o "faturamento" do especial/bonificação). Pedido **cancelado** fica fora da lista de disponíveis e é recusado se alguém tentar atrelar (cancelar não muda a situação no CA, então antes ele aparecia como se estivesse livre)
- **Devoluções** — nascem sempre de uma carga: só é possível registrar devolução de pedido que o motorista marcou como `ENTREGUE_PARCIAL` ou `DEVOLVIDO`, e esse pedido não pode mais ser removido do romaneio
- **Entregas (Rota e Minhas Entregas)** — após criado, cada pedido do embarque se torna uma entrega pendente para o motorista
- **Caixa Diário** — as baixas de entrega (pagamentos recebidos) registradas pelo motorista alimentam o caixa do dia; as **cobranças da rota** cobradas em dinheiro somam no valor a prestar e são baixadas no cartão "Cobranças da Rota"
- **Contas a Receber** — as cobranças inseridas na carga são parcelas em aberto; a baixa acontece no Caixa, não aqui
- **Auditoria de Entregas** — permite revisar e corrigir pagamentos registrados pelo motorista
- **Veículos** — o veículo não é selecionado no formulário atual de criação (apenas motorista e data); veículo pode estar vinculado via backend

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` | Lista de embarques e botão de nova carga |
| `frontend/src/pages/Admin/Embarques/NovaCargaModal.jsx` | Modal de criação (data + motorista) |
| `frontend/src/pages/Admin/Embarques/DetalhesCargaModal.jsx` | Modal de detalhes, edição, remoção e impressão do romaneio |
| `frontend/src/pages/Admin/Embarques/AdicionarPedidosModal.jsx` | Modal de seleção de pedidos FATURADOS para adicionar à carga |
| `frontend/src/pages/Admin/Embarques/CobrancasCargaSection.jsx` | Seção "Cobranças na Carga" + modal de busca de títulos em aberto |
| `backend/routes/cobrancasRota.js` | Rotas da Cobrança em Rota (inserir/tirar da carga, cobrar, não-cobrada) |
| `frontend/src/services/embarqueService.js` | Chamadas de API para embarques |
| `backend/src/routes/embarques.js` | Rotas do backend |
