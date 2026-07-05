---
aba: Fluxo de Caixa
rota: /financeiro/fluxo-caixa
permissao: Pode_Acessar_Financeiro_Gerencial
---

# Fluxo de Caixa

## O que é

Visão gerencial de **quanto dinheiro entra e sai**, comparando **previsto × realizado** por período. É montada automaticamente a partir de Contas a Receber e Contas a Pagar — nada precisa ser digitado aqui.

- **Previsto** = parcelas (a receber e a pagar) pelo **vencimento** — o que DEVE entrar/sair em cada dia.
- **Realizado** = pagamentos registrados pela **data em que aconteceram** (baixas manuais e as que chegam do Conta Azul) — o que DE FATO entrou/saiu.
- Dias futuros mostram só o previsto (marcados como "prev.").

## O que dá pra fazer aqui

- Escolher o período pelos chips: **Este mês (por dia)**, **Últimos 30 dias**, **Próximos 30 dias**, **Este ano (por mês)** e **Últimos 12 meses**
- Ver os 4 indicadores do topo:
  - **A receber em aberto** (com o quanto está vencido em vermelho)
  - **A pagar em aberto** (idem)
  - **Saldo previsto do período** (entradas − saídas que vencem)
  - **Saldo realizado do período** (o que de fato entrou − saiu)
- Ler o **gráfico de barras** dia a dia (ou mês a mês): barra verde = entrada realizada, vermelha = saída realizada, cinza atrás = previsto
- Consultar a **tabela dia a dia** (no celular, cards) com entradas/saídas previstas e realizadas, saldo do dia e **acumulado** — a linha de hoje fica destacada
- Dias sem nenhum movimento são omitidos da tabela

## De onde vêm os números

| Número | Fonte |
|--------|-------|
| Entradas previstas | Parcelas de **Contas a Receber** pelo vencimento (menos canceladas) |
| Entradas realizadas | Pagamentos recebidos (inclusive baixas parciais e as puxadas do Conta Azul) |
| Saídas previstas | Parcelas de **Contas a Pagar** pelo vencimento (menos canceladas) |
| Saídas realizadas | Pagamentos feitos (baixas manuais, "já paguei" e as puxadas do Conta Azul) |

> **Limitação:** o fluxo mostra o que está registrado no app. Despesa paga só dentro do Conta Azul aparece assim que a baixa é puxada pelo sync (a cada 30 min); despesa que nunca entrou no app não aparece.

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Financeiro_Gerencial` | Ver Fluxo de Caixa e DRE |
| `admin` | Sempre vê |

## Depende de / Interfere em

- **Contas a Receber** e **Contas a Pagar** — são a fonte de todos os números
- **Notas Recebidas** — gerar a conta da nota alimenta as saídas previstas/realizadas
- **DRE** — visão complementar (competência, não caixa)

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/financeiroGerencialService.js` | Consultas e agregação (funções puras) |
| `backend/routes/financeiroGerencial.js` | Rota GET /fluxo-caixa |
| `frontend/src/pages/Financeiro/FluxoCaixaPage.jsx` | Tela |
