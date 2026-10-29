---
aba: Config — Contas Financeiras (Bancos)
rota: /configuracoes/bancos
permissao: admin
---

# Config — Contas Financeiras (Bancos)

## O que é

Lista de contas financeiras (bancos e meios de recebimento) do app. Esses registros são usados na Tabela de Preços para definir o banco padrão de cada condição de pagamento, e nas baixas de contas a receber. Esta tela é somente leitura.

---

## O que dá pra fazer aqui

- Ver todas as contas financeiras cadastradas
- Ver: ID interno, nome do banco, tipo de uso, opção de condição, fonte de venda e status (ativo/inativo)

> Esta tela não permite criar ou editar contas.

---

## Campos exibidos

| Campo | Significado |
|-------|-------------|
| ID | Identificador interno no sistema |
| Banco | Nome da conta financeira |
| Tipo Uso | Como a conta é usada (ex: recebimento, pagamento) |
| Opção Condição | Identificador interno legado (código de condição) |
| Fonte Venda ID | Identificador interno legado (UUID) |
| Status | Ativo ou Inativo |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso à tela (somente visualização) |

---

## Depende de / Interfere em

- **Config: Tabela de Preços** — o "Banco Padrão" de cada condição usa os registros desta tela

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/ContasFinanceiras.jsx` | Tela de listagem |
| `frontend/src/services/contaFinanceiraService.js` | Chamadas de API |
| `backend/src/routes/contasFinanceiras.js` | Rotas do backend |
