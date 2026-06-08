---
aba: Dashboard
rota: /dashboard
permissao: todos (vendedor vê o próprio; admin pode ver qualquer vendedor)
---

# Dashboard

## O que é

Painel de acompanhamento de desempenho em vendas. O vendedor vê o próprio progresso em tempo real: quanto vendeu no mês, se está no ritmo para bater a meta, quanto precisa vender por visita para fechar o mês. O admin (ou quem tiver `Pode_Ver_Dashboard_Admin`) vê um painel gerencial com todos os vendedores juntos.

---

## O que dá pra fazer aqui

- Ver o total vendido no mês x meta definida (barra de progresso colorida)
- Ver a projeção de fechamento do mês com base no ritmo atual
- Saber quanto precisa vender por visita para bater a meta
- Ver as cidades programadas para hoje com status de meta individual
- Clicar em uma cidade e abrir o detalhe: progresso, próximas visitas, dia da semana com mais venda
- Admin: trocar o vendedor selecionado para ver o dashboard de qualquer pessoa da equipe
- Admin: ver painel gerencial com visão de todas as cidades do dia

---

## Como fazer (passo a passo real)

### Acompanhar a meta do mês
1. Abra o app — o Dashboard é a tela inicial padrão
2. O card principal mostra: valor realizado, meta, % atingido e projeção
3. A barra de progresso muda de cor:
   - Vermelha: abaixo de 50%
   - Azul: entre 50% e 79%
   - Amarela: entre 80% e 99%
   - Verde: 100% ou mais

### Ver detalhe de uma cidade
1. Role a tela até a seção de cidades
2. Clique no card da cidade desejada
3. Um painel lateral abre mostrando: meta, realizado, projeção, quanto falta, próximas datas de visita e dia da semana com mais venda
4. Feche clicando fora ou pressionando Esc

### Admin: trocar vendedor
1. Selecione o nome do vendedor no seletor no topo
2. O dashboard atualiza para mostrar os dados daquele vendedor

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê o próprio dashboard |
| `admin` ou `Pode_Ver_Dashboard_Admin` | Vê o painel admin com visão geral e pode trocar de vendedor |
| `Pode_Gerenciar_Metas` | Também acessa o painel admin |

---

## Depende de / Interfere em

- **Metas** (`/config/metas`) — os valores de meta mensal, cidades e produtos vêm de lá
- **Pedidos** — o "realizado" considera pedidos com situação FATURADO no Conta Azul
- **Rota** — dias de visita por cidade são configurados nos dias de venda do cliente

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Dashboard/DashboardVendedor.jsx` | Componente principal da tela |
| `frontend/src/pages/Dashboard/DashboardAdminSection.jsx` | Painel gerencial (admin) |
| `frontend/src/pages/Dashboard/DashboardAdminSectionClassic.jsx` | Visão clássica do admin |
| `backend/src/routes/metas.js` | API `/metas/dashboard`, `/metas/cidades-hoje-todos` |
