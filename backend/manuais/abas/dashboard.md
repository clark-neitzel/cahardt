---
aba: Dashboard
rota: /
permissao: todos (cada perfil vê o seu — gestão, vendedor ou entregador)
---

# Dashboard (tela inicial)

## O que é

A tela inicial do app. Desde julho/2026 existe **um dashboard para cada perfil**, escolhido automaticamente pelas permissões de quem entrou:

- **Gestão** (`admin` ou `Pode_Ver_Dashboard_Admin`) → **Dashboard Gerencial** com 5 abas: Visão Geral, Vendas & Pedidos, Recorrência, Atendimentos e Resultado & Margem.
- **Vendedor** (demais usuários) → **Dashboard pessoal**: minha meta, meu dia, ranking da semana e "quem visitar primeiro".
- **Entregador** (`Pode_Executar_Entregas`, sem meta de venda) → **Dashboard do Entregador**: rota de hoje, próxima parada, dinheiro a receber na entrega e resumo da semana.

Os painéis antigos (cockpit, painel clássico) foram substituídos por este.

---

## Dashboard Gerencial (gestão)

### Filtro de categoria
No topo há um seletor de **categoria de produto** (padrão: Produto Acabado). Ele filtra as abas Visão Geral, Vendas e a margem por produto. A escolha fica salva por usuário.

### Aba Visão Geral
- O mês até agora: vendas líquidas, meta da equipe, **projeção de fechamento** (verde quando bate a meta), ticket médio, margem bruta e devoluções
- O dia de hoje: vendas, pedidos, atendimentos (% que virou pedido) e clientes atendidos
- **Precisa de atenção**: clientes em recompra crítica, retornos vencidos, clientes com parcela vencida, pedidos com erro de envio ao Conta Azul
- Saúde do caixa: a receber vencido, a pagar em 7 dias, saldo previsto 30 dias

### Aba Vendas & Pedidos
- Gráfico de vendas por semana (12 semanas, semana atual em dourado; no celular desliza para o lado)
- Vendedores × meta do mês com projeção e situação (acima da meta / quase lá / precisa reagir)
- Top produtos dos últimos 30 dias, produtos em queda (30d vs 30 anteriores) e vendas por cidade
- Link "ver como vendedor →" abre o dashboard individual de qualquer vendedor

### Aba Recorrência
- Funil de recompra da carteira: No prazo / Atenção / Atrasado / Crítico (calculado pelo ciclo de compra de cada cliente)
- **R$ em risco**: quanto os clientes atrasados+críticos compravam por mês
- Lista "clientes críticos — agir primeiro" ordenada pela venda em risco (clique abre o cliente)
- Sinais de enfraquecimento (ticket caindo, produto que sumiu da cesta)
- Movimento da carteira: novos, reativados, sem compra +90d, 1ª compra sem recompra

### Aba Atendimentos
- Total do mês, % que virou pedido, sem venda e leads novos
- Atendimentos por tipo (visita, WhatsApp, ligação...)
- **Por que não vendeu**: ranking dos motivos registrados pelos vendedores
- Aproveitamento por vendedor (conversão) e retornos vencidos

### Aba Resultado & Margem
- DRE simplificada do mês: receita bruta → devoluções → receita líquida → despesas operacionais → financeiro → **resultado do mês**, com comparação ao mês anterior
- Melhores e piores margens por produto (custo da ficha técnica do PCP ou custo de compra)
- Recebíveis por idade (aging) e custos que mais pesaram no mês

---

## Dashboard do Vendedor

- **Minha meta do mês**: anel de progresso, realizado, projeção e flex disponível, com a orientação "para bater a meta: vender R$ X por dia"
- **Hoje**: vendi hoje (vs meta do dia), pedidos e clientes atendidos vs rota do dia
- Barras da semana e do flex usado
- **Ranking da semana**: sua posição e quanto falta para subir (sem expor os números dos colegas)
- **Quem visitar primeiro**: clientes críticos/atrasados da SUA carteira (por valor em risco), retornos que você prometeu e clientes com parcela vencida para lembrar na visita — tudo clicável
- Minha meta por cidade e por produto (seções recolhíveis)
- Atalhos: Minha rota e Novo pedido
- Gestores podem escolher outro vendedor no seletor do topo (ou entrar por "ver como vendedor" no Dashboard Gerencial)

## Dashboard do Entregador

- **Minha rota de hoje**: X de Y entregas feitas com barra de progresso
- **Próxima parada** em destaque com botões "Abrir no mapa" e "Fazer check-in" (leva ao Painel de Entregas)
- Dinheiro a receber na entrega (quais clientes pagam na hora), devoluções e divergências do dia
- Próximas paradas em ordem de prioridade e finalizadas hoje
- Minha semana: entregas, devoluções e divergências, comparadas à semana passada

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê o dashboard do seu perfil |
| `admin` ou `Pode_Ver_Dashboard_Admin` | Vê o Dashboard Gerencial (5 abas) e o dashboard de qualquer vendedor |
| `Pode_Executar_Entregas` (sem meta de venda) | Vê o Dashboard do Entregador |

---

## Depende de / Interfere em

- **Metas** (`/config/metas`) — meta mensal, por cidade e por produto do vendedor
- **Pedidos** — vendas consideram pedidos FATURADOS (ou especiais), sem bonificação, menos devoluções
- **Atendimentos** — contagens, conversão e motivos de não venda
- **Recompra (ClienteInsight)** — status No prazo/Atenção/Atrasado/Crítico por ciclo de compra
- **Financeiro** — DRE, margem por produto, aging e fluxo de caixa (mesmas regras das telas do Financeiro)
- **Entregas/Embarques** — rota do dia do entregador

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Dashboard/DashboardHome.jsx` | Escolhe o dashboard pelo perfil |
| `frontend/src/pages/Dashboard/DashboardGeral.jsx` | Dashboard Gerencial (5 abas) |
| `frontend/src/pages/Dashboard/DashboardVendedorPessoal.jsx` | Dashboard do vendedor (rota própria: `/dashboard-vendedor`) |
| `frontend/src/pages/Dashboard/DashboardEntregador.jsx` | Dashboard do entregador |
| `backend/routes/dashboards.js` | API `/api/dashboards/geral/*`, `/api/dashboards/vendedor`, `/api/dashboards/entregador` |
| `backend/routes/metaRoutes.js` | API `/metas/dashboard` (painel de metas do vendedor) |

## Aviso de ponto GPS divergente (vendedor — novo 07/2026)

Na tela inicial do vendedor, quando clientes da carteira dele estão com o ponto GPS **divergente das entregas reais** (selo suspeito), aparece um cartão âmbar listando esses clientes com o botão **"Corrigir"** — o mapa abre com o alfinete já no lugar sugerido pelas entregas; normalmente é só conferir e salvar. O aviso some quando tudo é corrigido.
