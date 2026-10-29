---
aba: Dashboard
rota: /
permissao: todos (cada perfil vê o seu — gestão, vendedor ou entregador)
---

# Dashboard (tela inicial)

## O que é

A tela inicial do app. Desde julho/2026 existe **um dashboard para cada perfil**, escolhido automaticamente pelas permissões de quem entrou:

- **Gestão** (`admin` ou `Pode_Ver_Dashboard_Admin`) → **Dashboard Gerencial** com 5 abas: Visão Geral, Vendas & Pedidos, Recorrência, Atendimentos e Resultado & Margem. Quem é **administrador** (`admin`) vê ainda uma 6ª aba, **IA** (uso e custo da inteligência artificial).
- **Vendedor** (demais usuários) → **Dashboard pessoal**: minha meta, meu dia, ranking da semana e "quem visitar primeiro".
- **Entregador** (`Pode_Executar_Entregas`, sem meta de venda) → **Dashboard do Entregador**: rota de hoje, próxima parada, dinheiro a receber na entrega e resumo da semana.

Os painéis antigos (cockpit, painel clássico) foram substituídos por este.

---

## Dashboard Gerencial (gestão)

### Navegador de mês e filtro de categoria
No topo há:
- **Navegador de mês** (`‹ Julho 2026 ›`): passe entre os meses para ver o dashboard de cada um. No mês atual mostra tudo (inclusive hoje/alertas/caixa); num **mês fechado** a Visão Geral vira "Resultado do mês" (vendas, meta, atingimento, margem, devoluções) e os blocos de *hoje/alertas/saúde do caixa* somem (são do momento). As abas Vendas, Atendimentos e Resultado & Margem passam a mostrar o mês escolhido; a Recorrência é sempre a foto atual da carteira. Abre sempre no mês corrente; navega até 12 meses atrás.
- **Seletor de categoria** (padrão: Produto Acabado): filtra as abas Visão Geral, Vendas e a margem. A escolha fica salva por usuário.

### Aba Visão Geral
- O mês até agora: vendas (-) devoluções, meta da equipe, **projeção de fechamento** (verde quando bate a meta), ticket médio, margem bruta e devoluções
- **Como a projeção é calculada (desde 08/2026):** é a mesma conta da comissão — usa os **dias de trabalho** cadastrados na meta de cada vendedor (sábado, domingo e feriado não trabalhado ficam de fora) e estima cada dia que falta pela média das últimas 4 ocorrências daquele dia da semana (segunda se compara com segundas). Por isso a projeção **não cai no fim de semana** nem em feriado. Vendedor sem meta cadastrada entra pelo ritmo linear dos dias corridos até a meta ser cadastrada. Com filtro de categoria, o "que falta" é aplicado na proporção da categoria nas vendas do mês.
- O dia de hoje: vendas, pedidos, atendimentos (% que virou pedido) e clientes atendidos
- **Precisa de atenção**: clientes em recompra crítica, retornos vencidos, clientes com parcela vencida, pedidos com erro de faturamento
- Saúde do caixa: a receber vencido, a pagar em 7 dias, saldo previsto 30 dias

### Aba Vendas & Pedidos
- Gráfico de vendas por semana (12 semanas, semana atual em dourado; no celular desliza para o lado)
- Vendedores × meta do mês com projeção e situação (acima da meta / quase lá / precisa reagir). A projeção de cada vendedor usa a mesma conta da comissão (dias de trabalho + histórico do dia da semana); quem aparece com **°** está sem meta com dias de trabalho cadastrados no mês e projeta pelo ritmo linear
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

### Aba IA (visível só para administrador)
Mostra **quanto a inteligência artificial custou, por dia, quem usou e onde gastou** — para o dono enxergar se o gasto é **de uma vez só (pontual)** ou **todo dia (recorrente)**. Quem tem só `Pode_Ver_Dashboard_Admin` (ou é gestor) **não vê** esta aba nem os valores: é exclusiva de `admin`.
- **Cartões do topo**: custo de hoje, dos últimos 7 dias e dos últimos 30 dias (em dólar e em reais; a cotação do dólar é buscada automaticamente — se alguém cadastrar uma em Config → IA, a cadastrada vale), número de chamadas e % que falhou.
- **Todo dia × uma vez**: separa os serviços que usam a IA em **Recorrente** (usou em 5 ou mais dias dos últimos 30), **Ocasional** (3 ou 4 dias) e **Pontual** (1 ou 2 dias), com o custo de cada grupo. É aqui que se descobre o gasto que se repete sem ninguém perceber (por exemplo a orientação automática de cada cliente, que roda toda noite e depois de cada atendimento). Logo depois que o painel entra no ar ainda há pouco histórico: enquanto houver menos de 5 dias de dados ele avisa "poucos dados" em vez de classificar errado.
- **Custo por dia**: barras diárias separando o que foi **automático** (o sistema chamou sozinho) do que foi **manual** (uma pessoa pediu). O dia vale no **horário de Brasília**.
- **Por serviço**: ranking de onde gastou (Clippy, orientação por cliente, Como Fazer, fotos do checklist do veículo, leitura de comprovante de despesa). Chamada sem identificação aparece como "Sem identificação".
- **Por pessoa**: quem mais usou. O que o sistema faz sozinho aparece como "Sistema (automático)".
- Período selecionável no filtro de datas (padrão 30 dias, no máximo 90).
- **Importante**: o painel mostra **só o que o CA-Hardt chamou — não é a fatura da OpenAI** (a fatura pode ter outros usos e arredondamentos). Valores marcados como **estimado** foram calculados na hora com o preço atual do modelo (linhas antigas sem custo gravado); depois do recálculo de custos feito pelo administrador essas linhas passam a ter o custo gravado e saem de "estimado"; o preço dos modelos conhecidos é automático (não precisa cadastrar); só um modelo desconhecido aparece como "sem preço" até alguém cadastrar em Config → IA (nunca R$ 0,00). Datas no futuro são cortadas em hoje. Se o período pedido (já até hoje) for maior que 90 dias o painel mostra os últimos 90 e avisa (`periodo.encurtado`). Isso vale em todas as listas (por origem, por usuário, por dia, classificação): item sem preço mostra "—" e, se parte das chamadas tem preço, soma só essas. Chamada que falhou sem gastar nada não conta como "sem preço". Usuários apagados aparecem juntos numa só linha "Usuário removido". O histórico anterior ao painel (orientação por cliente, Como Fazer e fotos do checklist) é importado como **retroativo**; antes disso o Clippy e a leitura de comprovante não tinham registro.
- O sistema não guarda o texto enviado à IA nem a resposta — só quem usou, onde, quando, tokens e custo.

---

## Dashboard do Vendedor

- **Minha meta do mês**: anel de progresso, realizado, projeção e flex disponível, com a orientação "para bater a meta: vender R$ X por dia". Desde 08/2026 o realizado conta **só pedido faturado** (ou especial) e **desconta as devoluções** — mesma régua da comissão e do Dashboard Geral. Pedido lançado que ainda não virou nota entra no realizado quando for faturado.
- **Minha comissão** (só para o vendedor com comissão ativa — meta + configuração no mês; gestores não veem): comissão já garantida no mês, quanto vendeu vs meta, e "se continuar nesse ritmo, fecha o mês com R$ X de comissão". Se houver mínimo configurado e ainda não atingido, mostra quanto falta vender para destravar a comissão. A projeção compara cada dia de venda que falta com as últimas segundas, terças, quartas… do próprio vendedor.
- **Popup da comissão (manhã e tarde)**: para quem tem comissão ativa, o app mostra uma vez por período um resumo da comissão e da projeção — o mesmo conteúdo do card. Os horários (padrão 08:00 e 18:00) e o liga/desliga são configurados por vendedor em Config → Comissões (modal de edição, seção "Popup no app do vendedor"). Fechar não mostra de novo no mesmo período.
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
| `admin` (somente) | Vê também a aba **IA** (custo e uso da inteligência artificial) |
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
| `backend/routes/iaUso.js` + `backend/services/iaUsoService.js` | API `/api/ia-uso/resumo` da aba IA (só `admin`); dados vêm da tabela `ia_uso_logs`, gravada por `aiProvider.js` |
| `backend/routes/metaRoutes.js` | API `/metas/dashboard` (painel de metas do vendedor) |

## Aviso de ponto GPS divergente (vendedor — novo 07/2026)

Na tela inicial do vendedor, quando clientes da carteira dele estão com o ponto GPS **divergente das entregas reais** (selo suspeito), aparece um cartão âmbar listando esses clientes com o botão **"Corrigir"** — o mapa abre com o alfinete já no lugar sugerido pelas entregas; normalmente é só conferir e salvar. O aviso some quando tudo é corrigido.
