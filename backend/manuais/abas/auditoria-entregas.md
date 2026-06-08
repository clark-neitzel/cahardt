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
4. Marque "Escritório Responsável" se o pagamento será acertado pela gerência
5. Clique em Salvar

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
