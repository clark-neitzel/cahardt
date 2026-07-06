---
aba: Saldos por Conta
rota: /financeiro/por-conta
permissao: Pode_Acessar_Financeiro_Gerencial
---

# Saldos por Conta

## O que é

Visão gerencial de **por qual banco/caixa o dinheiro entrou e saiu**. Mostra, no período escolhido, quanto **entrou** (recebimentos) e quanto **saiu** (pagamentos) em cada conta financeira (Sicoob, Caixinha, Conta Azul IP, etc.), o **resultado** (entradas − saídas) e, opcionalmente, o **saldo atual** de cada conta direto no Conta Azul.

É montada automaticamente a partir das baixas de Contas a Receber e Contas a Pagar — nada precisa ser digitado aqui.

## O que dá pra fazer aqui

- Escolher o período pelos chips: **Este mês**, **Últimos 30 dias**, **Últimos 90 dias**, **Este ano**
- Ver os 3 indicadores do topo: **Entradas**, **Saídas** e **Resultado** do período (somando todas as contas)
- Ver a **tabela por banco/caixa** (no celular, cards): entradas, saídas, resultado e — se ligar o botão **"Saldo atual no Conta Azul"** — o saldo em tempo real de cada conta
- **Clicar numa conta** para abrir o **extrato**: a lista de todas as entradas e saídas daquela conta no período, com quem (cliente/fornecedor), a origem e a data

## De onde vêm os números

| Número | Fonte |
|--------|-------|
| Entradas por conta | Recebimentos (parcelas de **Contas a Receber** pagas) agrupados pelo banco em que o dinheiro entrou |
| Saídas por conta | Pagamentos (baixas de **Contas a Pagar**, não estornadas) agrupados pelo banco de onde o dinheiro saiu |
| Saldo atual (CA) | Consulta em tempo real do saldo da conta no Conta Azul (botão opcional; pode demorar alguns segundos) |

A conta (banco/caixa) de cada baixa é capturada automaticamente:
- **Recebimentos:** vêm da sincronização do Conta Azul (onde o recebimento é dado).
- **Pagamentos:** vêm da baixa — ao dar baixa no app você escolhe o banco; nas baixas feitas no Conta Azul (DDA/contadora), o banco é puxado junto.

> **Limitação:** lançamentos **antigos importados** do Conta Azul podem aparecer em **"Não informado"** — na época a importação não trouxe o banco. Os novos já vêm com a conta certa.

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Financeiro_Gerencial` | Ver Saldos por Conta (e Fluxo de Caixa e DRE) |
| `admin` | Sempre vê |

## Depende de / Interfere em

- **Contas a Receber** e **Contas a Pagar** — são a fonte de todas as entradas e saídas
- **Fluxo de Caixa** e **DRE** — visões complementares (por período e por categoria)

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/financeiroGerencialService.js` | Agregação por conta (saldosPorConta, extratoPorConta) |
| `backend/routes/financeiroGerencial.js` | Rotas GET /por-conta e /por-conta/extrato |
| `frontend/src/pages/Financeiro/ContasBancosPage.jsx` | Tela |
