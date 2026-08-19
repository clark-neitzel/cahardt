---
aba: Auditoria de Entregas
rota: /admin/auditoria-entregas
permissao: admin
---

# Auditoria de Entregas

## O que é

Ferramenta de controle contábil para revisar e corrigir os pagamentos registrados pelos motoristas nas entregas. Permite identificar divergências (ex: motorista registrou dinheiro mas o pedido era boleto), editar os pagamentos e, em último caso, estornar uma entrega já finalizada.

---

## O que dá pra fazer aqui

- Ver todas as entregas de um dia/período com detalhes dos pagamentos registrados
- Filtrar por: data, número do embarque, motorista e nome do cliente
- Marcar o filtro "Apenas divergentes" para ver somente entregas com problemas
- Editar os pagamentos de uma entrega (trocar forma, valor, marcar como responsabilidade do escritório)
- Estornar uma entrega finalizada (apaga o pagamento do caixa e devolve o pedido para o caminhão)

---

## O que é uma "divergência"

Uma entrega é marcada como divergente quando os pagamentos registrados pelo motorista não batem com a condição de pagamento do pedido. Exemplos:
- Pedido era para receber em dinheiro, mas o motorista registrou como "boleto"
- O valor recebido não fecha com o total do pedido

---

## Como fazer (passo a passo real)

### Ver divergências do dia
1. Abra a aba Auditoria de Entregas
2. O filtro de data já vem com hoje
3. Marque a opção **Apenas divergentes** para ver somente os problemas
4. As entregas com divergência aparecem com destaque visual

### Editar pagamento de uma entrega
1. Clique no ícone de lápis na entrega que quer corrigir
2. O painel de edição abre com os pagamentos registrados
3. Adicione, remova ou edite os valores e formas de pagamento
4. Cada linha de pagamento tem os controles de **quem ficou de cobrar**:
   - a caixinha **Escritório responsável** — marque quando o acerto ficar com a gerência;
   - o seletor **Vendedor responsável** — escolha a pessoa que ficou de cobrar aquele valor;
   - a opção **Sem vendedor responsável**, dentro do próprio seletor, para tirar só o vendedor;
   - o botão **Tirar responsável**, que limpa as duas marcações daquela linha de uma vez.
   Se você marcar os dois na mesma linha, vale o **vendedor** — é a regra usada no relatório
   e no filtro de Contas a Receber.
5. Clique em Salvar

> **A marcação de responsável não se perde ao editar (08/2026).** Antes, corrigir o valor de
> uma entrega apagava em silêncio o "Vendedor responsável"/"Escritório responsável" daquele
> pedido — o título continuava em aberto, mas sem dono, e sumia do fechamento por responsável.
> Agora, se a tela usada para editar não falar de responsável (é o caso da correção feita pela
> tela de **Rota**), a marcação anterior é mantida. Para **trocar ou tirar** o responsável use
> os controles da linha de pagamento no painel de edição desta aba (passo 4) — é o único lugar
> em que a marcação muda de propósito.

> **Vendedor, motorista ou escritório (19/08/2026).** A marcação passou a dizer o **papel** de
> quem ficou de cobrar:
> - **Motorista responsável** — a pessoa é sempre **quem estava logado no aparelho** ao marcar.
>   Um id de outra pessoa mandado por fora é ignorado: não dá para pendurar a dívida de
>   motorista em terceiro.
> - **Vendedor responsável** — a pessoa é escolhida numa lista.
> - **Escritório responsável** — igual a antes.
>
> O **motorista pode marcar os três no checkout**, inclusive a si mesmo — a conferência do
> caixa é que valida. Aqui na Auditoria o escritório marca e corrige qualquer um dos três. Em
> qualquer tela a pessoa precisa existir e estar **ativa**, senão o app recusa e explica.
>
> Corrigir o **valor** de uma entrega preserva o papel junto com a pessoa: antes, cada correção
> rebaixava em silêncio uma marcação de motorista para "vendedor". As marcações feitas antes
> desta data continuam como estavam (vendedor/escritório) e não são reclassificadas.

### Corrigir o status da entrega
Editar o lançamento e mudar o status da entrega (ex.: o motorista marcou **Devolvido** por
engano) **não mexe no financeiro** — o título e o boleto do cliente ficam como estavam. Quem
encerra a cobrança é o registro da devolução na conferência do Caixa Diário. Se a devolução já
tinha sido registrada e também está errada, ela precisa ser **revertida** em Pedidos → aba
Devoluções.

### Estornar uma entrega
1. Clique no ícone de estorno (lixeira) na entrega
2. Confirme o alerta — esta ação é irreversível via tela
3. O pagamento é apagado do caixa e o pedido volta para a etapa "no caminhão"

> O estorno só deve ser usado em casos extremos. Prefira sempre editar o pagamento.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total; único perfil com acesso à auditoria |

---

## Depende de / Interfere em

- **Caixa Diário** — a edição aqui afeta o saldo do caixa do motorista
- **Contas a Receber** — pagamentos corrigidos aqui podem atualizar as parcelas
- **Embarque / Entregas** — o estorno devolve o pedido ao status de embarque

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Embarques/AuditoriaEntregas.jsx` | Tela completa de auditoria |
| `backend/src/routes/entregas.js` | Rota `GET /entregas/auditoria`, `PATCH /entregas/:id/editar`, `DELETE /entregas/:id/estorno` |

## Entrega cujo título já foi baixado no financeiro

Desde 08/2026, **estornar** ou **editar** o lançamento de uma entrega é **recusado** quando o título daquele pedido já tem baixa (total ou parcial) no financeiro — a mensagem aparece na tela. Motivo: apagar/reescrever os pagamentos da entrega deixaria a baixa sem lastro, e **título já quitado não reabre sozinho**.

O caminho certo, nesta ordem:
1. Financeiro → **Contas a Receber** → estornar a baixa (ou "desfazer a quitação" do especial) — isso desfaz tudo em cascata: histórico de pagamento, status da parcela e conciliação bancária;
2. só então volte aqui e estorne/edite a entrega.
