---
aba: Config — Contas Financeiras (Bancos)
rota: /configuracoes/bancos
permissao: admin
---

# Config — Contas Financeiras (Bancos)

## O que é

Lista de contas financeiras (bancos e meios de recebimento) sincronizados do Conta Azul. Esses registros são usados na Tabela de Preços para definir o banco padrão de cada condição de pagamento, e nas baixas de contas a receber. Esta tela é somente leitura — os dados vêm do CA.

---

## O que dá pra fazer aqui

- Ver todas as contas financeiras cadastradas (sincronizadas do Conta Azul)
- Ver: ID interno, nome do banco, tipo de uso, opção de condição, fonte de venda e status (ativo/inativo)

> Esta tela não permite criar ou editar contas. O cadastro é feito no Conta Azul e importado pelo Sync.

---

## Campos exibidos

| Campo | Significado |
|-------|-------------|
| ID | Identificador interno no sistema |
| Banco | Nome da conta financeira no CA |
| Tipo Uso | Como a conta é usada (ex: recebimento, pagamento) |
| Opção Condição | Código de condição associado no CA |
| Fonte Venda ID | ID da fonte de venda no CA (UUID) |
| Status | Ativo ou Inativo |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso à tela (somente visualização) |

---

## Depende de / Interfere em

- **Config: Tabela de Preços** — o "Banco Padrão" de cada condição usa os registros desta tela
- **Sincronizar** — os dados desta tela são atualizados pelo Sync Geral do CA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/ContasFinanceiras.jsx` | Tela de listagem |
| `frontend/src/services/contaFinanceiraService.js` | Chamadas de API |
| `backend/src/routes/contasFinanceiras.js` | Rotas do backend |
