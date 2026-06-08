---
aba: Config — Tabela de Preços
rota: /configuracoes/precos
permissao: admin
---

# Config — Tabela de Preços

## O que é

Cadastro das condições de pagamento disponíveis no sistema. Cada "condição" determina como o cliente vai pagar: à vista, parcelado em boleto, com PIX, etc. As condições afetam: quais pedidos podem ser criados, se debitam do caixa, se permitem especiais/bonificações, qual acréscimo de preço aplicar e quais formas de recebimento o motorista pode registrar.

---

## O que dá pra fazer aqui

- Listar todas as condições de pagamento
- Criar nova condição
- Editar uma condição existente
- Copiar configurações de uma condição para outra (agiliza criação)
- Ativar ou desativar uma condição
- Configurar por condição: acréscimo de preço, valor mínimo, banco padrão, formas de recebimento permitidas, regras por categoria de cliente

---

## Campos de cada condição

| Campo | Significado |
|-------|-------------|
| Nome | Nome exibido no app (ex: "Boleto 30 dias") |
| Tipo Pagamento | BOLETO, PIX, DINHEIRO, etc. |
| Opção Condição | Código interno usado no Conta Azul |
| Qtd Parcelas | Número de parcelas |
| Dias entre Parcelas | Intervalo em dias |
| Exige Banco | Obriga seleção de banco ao criar pedido |
| Banco Padrão | Banco pré-selecionado |
| Acréscimo Preço | % de acréscimo sobre o preço de venda |
| Valor Mínimo | Valor mínimo do pedido para usar esta condição |
| Debita Caixa | Aparece na lista de baixas do caixa do motorista |
| Permite Pedido | Se pode ser usada em pedidos normais |
| Permite Especial | Se pode ser usada em pedidos especiais |
| Permite Bonificação | Se pode ser usada em bonificações |
| Formas de Recebimento | Quais formas o motorista pode usar na entrega |
| Permite Devolução Total / Parcial | Se permite devoluções por esta condição |

---

## Como fazer (passo a passo real)

### Criar uma condição nova
1. Clique em **+ Nova Condição**
2. Preencha: nome, tipo de pagamento, parcelas e os demais campos
3. Para agilizar, use **Copiar de:** selecione uma condição existente para copiar as configurações
4. Ajuste o necessário e salve

### Editar uma condição
1. Clique no ícone de lápis da condição
2. Edite os campos no modal lateral
3. Salve

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |

---

## Depende de / Interfere em

- **Pedidos** — as condições disponíveis na criação do pedido vêm daqui
- **Caixa Diário** — condições com "Debita Caixa" aparecem na lista de baixas
- **Auditoria de Entregas** — formas de recebimento permitidas por condição restringem as opções do motorista
- **Config: Bancos** — os bancos disponíveis para selecionar em "Banco Padrão" vêm de lá

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/TabelaPrecos.jsx` | Tela completa |
| `frontend/src/services/tabelaPrecoService.js` | Chamadas de API |
| `backend/src/routes/tabelaPrecos.js` | Rotas do backend |
