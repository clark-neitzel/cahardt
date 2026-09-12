# Central de Pendências

**Rota:** `/pendencias`

## O que é

Um painel único que reúne tudo que está esperando um clique do escritório/gerência — em vez de abrir
Pedidos, Notas Fiscais, Caixa, Notas Recebidas, PCP e Tarefas separadamente para descobrir o que falta
fazer hoje.

## Quem acessa

Precisa de uma destas permissões (qualquer uma libera):
- `admin` (Administrador Global)
- `Pode_Acessar_Financeiro_Gerencial` (Fluxo de Caixa e DRE)
- `Pode_Ver_Pendencias` (nova — dá acesso só a esta tela, para quem não deveria ver os painéis
  financeiros gerenciais completos)

Sem nenhuma das três, a tela nem aparece no menu e a URL direta devolve acesso negado (a API devolve
`403`).

## Onde fica

Item **"Central de Pendências"** no topo do grupo **Financeiro** do menu (ícone de alerta âmbar).

## A tela

No topo, 4 números (KPIs): **Total de pendências**, **Dinheiro parado**, **Vencidas** e **Avisos**
(mesmo cálculo do contrato da API, ver abaixo). Um botão **"Atualizar"** recarrega tudo sem sair da
tela. Se não houver nenhuma pendência, aparece "Nada pendente 🎉" no lugar dos blocos.

Os blocos aparecem em ordem de severidade — **vermelho primeiro, depois âmbar, depois cinza** — e um
bloco sem nenhuma pendência simplesmente **some** (não aparece "0" na tela). Se algum bloco falhar ao
carregar, ele mostra um aviso discreto no lugar da lista (os outros blocos continuam normais — um erro
não derruba a tela toda).

## Os blocos (o que cada um mostra e o que fazer com ele)

1. **Pedidos aguardando aprovação** — pedidos Especial (ZZ#) e Bonificação (BN#) que ainda não foram
   aprovados. Botão "Aprovar" na própria linha faz o mesmo que aprovar na tela Pedidos.
2. **NF-e a emitir** — pedidos faturados que ainda não têm nenhuma tentativa de nota fiscal emitida.
   Botão "Emitir NF-e" dispara a emissão, igual à fila de Notas Fiscais.
3. **NF-e rejeitada pela SEFAZ** — notas que tentaram emitir e voltaram com erro/rejeição. Mostra o
   motivo resumido. Botão "Tentar de novo" reemite.
4. **Caixas para conferir** — caixas diários de vendedores esperando alguém contar o dinheiro (a partir
   do dia seguinte ao caixa). Não tem botão de 1 clique — precisa abrir o Caixa e contar de verdade.
5. **Notas recebidas sem conta a pagar** — notas de fornecedor já capturadas (XML baixado) há mais de 2
   dias que ainda não viraram conta a pagar. Sem ação automática — precisa revisar e gerar a conta.
6. **Faturados sem cobrança gerada** — pedidos faturados a prazo, há mais de 24h, sem boleto/PIX
   gerado ainda. Botão "Gerar boleto" cria a cobrança Asaas do pedido.
7. **Ordens de produção sugeridas** — sugestões do PCP (estoque abaixo do mínimo ou demanda de
   pedidos) que ainda não foram aceitas nem rejeitadas. Botão "Aceitar" vira ordem de produção.
8. **Tarefas atrasadas (minhas)** — só as tarefas do próprio usuário logado que já passaram do horário
   hoje e não foram concluídas. Sem ação de 1 clique — precisa abrir Tarefas e concluir de lá.

## Como os números são calculados

Cada bloco mostra um **contador real** (o total que existe, não só o que aparece na lista) e até 5
linhas de exemplo (as mais antigas/urgentes primeiro, salvo indicação contrária). Clicar em "Ver
todos" de um bloco leva para a tela original com o mesmo filtro.

Os totais do topo:
- **Total** — soma de todos os contadores.
- **Dinheiro parado** — soma do valor esperado nos Caixas a conferir + valor dos pedidos faturados
  sem cobrança.
- **Vencidas** — tarefas atrasadas + notas recebidas paradas há mais de 2 dias (pendências com prazo
  já estourado).
- **Avisos** — NF-e rejeitada + faturados sem cobrança + sugestões de produção (precisa de atenção,
  mas sem um prazo específico estourado).

## Limitações conhecidas (ver contrato completo em `backend/docs/pendencias-api.md`)

- O bloco "Faturados sem cobrança gerada" usa um critério simples (sem função pronta reaproveitada) e
  pode superestimar em produção — vale conferir com o financeiro antes de tratar como alarme vermelho.
- Os números batidos até agora foram só no banco local, com dados de teste distorcidos — os volumes
  reais de produção ainda não foram conferidos.
