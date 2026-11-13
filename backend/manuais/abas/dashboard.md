---
aba: Dashboard
rota: /
permissao: todos (cada perfil vê o seu — gestão, vendedor ou entregador)
---

# Dashboard (tela inicial)

## O que é

A tela inicial do app. Desde julho/2026 existe **um dashboard para cada perfil**, escolhido automaticamente pelas permissões de quem entrou:

- **Gestão** (`admin` ou `Pode_Ver_Dashboard_Admin`) → **Dashboard Gerencial** com 5 abas: Visão Geral, Vendas & Pedidos, Carteira, Atendimentos e Resultado & Margem. Quem é **administrador** (`admin`) vê ainda uma 6ª aba, **IA** (uso e custo da inteligência artificial).
- **Vendedor** (demais usuários) → **Dashboard pessoal**: minha meta, meu dia, ranking da semana e "quem visitar primeiro".
- **Entregador** (`Pode_Executar_Entregas`, sem meta de venda) → **Dashboard do Entregador**: rota de hoje, próxima parada, dinheiro a receber na entrega e resumo da semana.

Os painéis antigos (cockpit, painel clássico) foram substituídos por este.

---

## Dashboard Gerencial (gestão)

### Navegador de mês e filtro de categoria
No topo há:
- **Navegador de mês** (`‹ Julho 2026 ›`): passe entre os meses para ver o dashboard de cada um. No mês atual mostra tudo (inclusive hoje/alertas/caixa); num **mês fechado** a Visão Geral vira "Resultado do mês" (vendas, meta, atingimento, margem, devoluções) e os blocos de *hoje/alertas/saúde do caixa* somem (são do momento). As abas Vendas, Atendimentos e Resultado & Margem passam a mostrar o mês escolhido; a Carteira é sempre a foto de hoje (tem o seu próprio seletor Semana/Mês). Abre sempre no mês corrente; navega até 12 meses atrás.
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

### Aba Carteira (substitui a antiga aba Recorrência)
Foto de HOJE da carteira de clientes, calculada por regra (sem inteligência artificial). Não usa o navegador de mês nem o seletor de categoria: tem os seus próprios controles no topo, **Semana | Mês** (semana corrente de segunda até hoje contra a anterior até o mesmo dia; ou mês até hoje contra o mês anterior até o mesmo dia), **vendedor** e **Lista curta | Completa** (5 clientes ou todos). A escolha fica lembrada. Blocos, na ordem:
- **Resumo do gerente**: 3 a 4 frases montadas dos números (vendas contra o período anterior, clientes que compraram, novos/voltaram/pararam, parados e os 20 maiores, projeção do mês).
- **Para onde o mês está indo**: já entrou, quanto fecha no ritmo atual, a meta, o quanto falta por dia de trabalho contra o que vem entrando, e uma linha por vendedor. Usa a mesma conta da comissão e da Visão Geral. Sem meta cadastrada, mostra só o ritmo.
- **Seis números comparados**: vendas líquidas (já descontando devolução), clientes que compraram, ticket, clientes novos, voltaram (compraram de novo depois de 35+ dias parados) e pararam (passaram a ser considerados parados no período).
- **Gráfico**: últimas 9 semanas ou últimos 6 meses.
- **Suas decisões de hoje**: cliente grande com pedido faltando, "parece o mesmo cliente" (mesmo celular ou endereço, um parando quando o outro começa; botão **Juntar** ou **Não é o mesmo**), clientes sem vendedor (mostra só 5, os que já pediram primeiro, para não inflar o total) e clientes para inativar (mais de 180 dias sem comprar; só o tempo sem comprar decide, uma anotação de vendedor dizendo "fechou" aparece só como aviso no cliente). O quadro "o que deram as suas decisões" começa vazio.
- **Os 20 maiores clientes** (últimos 90 dias, líquido): aviso quando um deles está com pedido faltando.
- **Carteira por vendedor**: no ritmo, atraso leve, parado (a Ana chama / precisa de visita), para inativar, novos.
- **Clientes que pedem atenção**: abas Parados (Ana), Parados (visita), Atraso leve, Inativar e Enfraquecendo (ticket caindo 15% ou mais). Cada cliente traz um texto do gerente (por regra) e abre o cadastro.
- **O que a equipe fez**: pedidos, R$ e clientes por vendedor, mais os registros sem pedido, separados pelo tipo do registro (WhatsApp, presencial, sem visita, outros; financeiro fica de fora), contra o período anterior.
- **Por que não compraram** (últimos 30 dias): lido por palavra das anotações dos vendedores, por isso é aproximado.
- **Quem mais caiu e quem mais subiu**, **por tipo de cliente** e **por grupo de produto**.
- **Movimento da carteira** e o **valor em risco por mês**.
**Como a Carteira decide quem está parado**: o ritmo de cada cliente é o MAIOR entre o ciclo do cadastro (ou da categoria) e a média dos intervalos entre os últimos 6 pedidos. Está **no ritmo** até 1,5 vez o ritmo sem comprar; **parado** com 21 dias ou mais E 2 vezes o ritmo (precisa de 3 dias de pedido; cliente com 1 ou 2 pedidos é "novo"); depois de 180 dias vira "para inativar". Pedido cancelado e bonificação não contam. Cadastros ligados como "mesmo cliente" contam como um só, e cadastro inativo que ainda compra entra na conta. Kit Festa é sazonal (nunca aparece como parado) e Funcionários ficam fora das listas. "Parado" com celular utilizável e com menos de 2 registros "sem resposta" por WhatsApp nos últimos 30 dias vai para a Ana; com 2 ou mais (ou sem celular), visita presencial. "Sem visita" não conta como mensagem. Nesta etapa não há como separar vendedor interno de externo, então todos os registros de WhatsApp entram na conta (na etapa atual isso é só rótulo: nada é disparado).
**Botão "Já sei" em cada cliente**: (1) *é o mesmo cliente de outro cadastro* — busca o outro cadastro por nome ou documento (mesmo inativo, mínimo 3 letras) e junta os dois, com **Desfazer**; (2) *não me avise por 30 ou 90 dias* — o cliente sai das listas e volta sozinho quando o prazo acaba (pode desfazer); (3) *não compra mais* — abre a **ficha do cliente** ali mesmo, já com **Inativo** marcado (é só confirmar e salvar). Tudo fica registrado no log de auditoria.
**Ficha do cliente (painel lateral)**: ao tocar num cliente da Carteira abre a ficha ali mesmo, sem sair da aba: números do gerente (dias sem comprar, ritmo, ticket médio, total de pedidos, situação e a frase do gerente), últimos 5 pedidos e últimos 6 atendimentos, e o que dá para mudar na hora — **vendedor, tipo de cliente, dia de venda, ciclo de compra personalizado, observação comercial fixa, ativo/inativo, celular e WhatsApps** (os mesmos campos e regras do cadastro). Ao salvar, a Carteira já reflete a mudança. Quem não tem permissão de editar clientes não consegue mudar *ativo*, *celular* e *WhatsApps* (os campos aparecem travados). Toda alteração fica no log de auditoria com o antes e o depois. Dá para desfazer uma troca de vendedor mesmo que o vendedor anterior tenha ficado inativo (desde que a troca tenha sido feita pela ficha). Em cadastros unidos, o texto do gerente cita só os OUTROS cadastros.
**Cliente inativo na Carteira**: cadastro inativo só continua na Carteira se estiver unido a outro cadastro ou ainda estiver comprando (no ritmo ou com atraso leve). Inativo parado, "para inativar" ou sem pedido some das listas, do top 20, das decisões e da divisão Ana/visita; o dinheiro que ele já vendeu continua nos totais de venda. Os números da Carteira podem diferir do alerta "recompra crítica" da Visão Geral, que ainda usa a régua antiga do ciclo fixo.
Os dados ficam em cache por até 10 minutos; o botão de atualizar do dashboard força o recálculo. Quem vê: a mesma permissão do Dashboard Gerencial (administrador ou `Pode_Ver_Dashboard_Admin`).

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
- **Todo dia × uma vez**: separa os serviços que usam a IA em **Recorrente** (usou em 5 ou mais dias dos últimos 30), **Ocasional** (3 ou 4 dias) e **Pontual** (1 ou 2 dias), com o custo de cada grupo. É aqui que se descobre o gasto que se repete sem ninguém perceber (por exemplo a orientação automática de cada cliente, gerada depois de cada atendimento; a análise noturna das 23:30 foi desligada em 11/2026). Logo depois que o painel entra no ar ainda há pouco histórico: enquanto houver menos de 5 dias de dados ele avisa "poucos dados" em vez de classificar errado.
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
