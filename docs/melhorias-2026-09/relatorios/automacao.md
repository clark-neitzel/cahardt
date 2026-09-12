# Diagnóstico de Automação de Processos — CA-Hardt

Levantamento somente-leitura sobre `~/Projetos/CA-Hardt`, a partir dos manuais de aba, dos workers
(`backend/workers/scheduler.js`), dos services principais e das rotas de pedidos, caixa, NF-e,
notas recebidas, contas a pagar e PCP.

---

## 1. Diagnóstico em 10 linhas

1. O app já é **muito mais automatizado do que parece** — `scheduler.js` sozinho tem ~20 rotinas de fundo (sync CA, NF-e, backup, cobrança, WhatsApp, certificado, conciliação Asaas/CA). O problema não é falta de automação no backend; é que **boa parte dela termina num alerta ou numa fila, e ninguém tem uma tela só para ver "o que está travado esperando um clique"**.
2. O padrão que se repete: o sistema **sabe** o dado (histórico, estoque, vencimento, XML da nota) mas ainda **pede confirmação humana** em cada elo — o que é correto para dinheiro/fiscal, mas hoje falta reunir esses "pede confirmação" num só lugar.
3. O ponto mais frágil não é "falta automatizar", é **"a etapa automática existe mas ninguém junta os pontos na tela"** — ex.: nota chega sozinha em Notas Recebidas, mas virar Contas a Pagar é um clique manual sem alerta central; sugestão de produção só é calculada se alguém clicar em "Gerar Sugestões".
4. **Cadeia pedido → NF → caixa → financeiro** está bem costurada tecnicamente (webhooks, workers de 5-30min), mas o **vendedor não tem nenhuma ajuda ativa** na hora de montar o pedido além do preço/data sugeridos — não existe "repetir último pedido" nem alerta prévio (inadimplente, sem GPS, sem WhatsApp) antes de começar.
5. **Compra → estoque → custo** está sólido (NF-e/NFS-e chegam sozinhas, conferência gera estoque+custo automaticamente) — mas **quem decide gerar a conta a pagar ainda é humano, sem fila visível fora da própria tela de Notas Recebidas**.
6. **Produção (PCP)** tem toda a lógica pronta (receita, estoque mínimo, cálculo de bateladas) mas o gatilho é **100% manual** ("Gerar Sugestões") — é o candidato mais óbvio a virar automático/agendado.
7. Muita coisa que "poderia ser em um só lugar" já existe **espalhada**: pendências de caixa aparecem na Agenda (`CaixasPendentesAgenda.jsx`), pendências de NF na aba Notas Fiscais, pendências de cobrança na Régua, pendências de conciliação no Financeiro — cada uma na sua tela, nenhuma junta.
8. **Riscos evitados por automação já existente** são reais e bem desenhados (idempotência em toda fila, trava de dupla emissão de NF, trava de dupla baixa) — a base para acrescentar mais automação com segurança já está pronta.
9. O bot da Ana (IA) já é bem mais que atendimento: desde a v1.6 ele **cria pedido de Congelados/Kit Festa** que cai na fila de aprovação — ainda dá para avançar em identificar inadimplência/pendência antes de fechar o pedido pelo WhatsApp.
10. Resumo em uma frase: **o motor de automação já existe — falta o painel de controle** (Central de Pendências) e **um empurrão a mais no vendedor** (Assistente de Pedido) para capturar o "faço isso toda vez e podia ser sozinho" que o dono sente.

---

## 2. Mapa dos processos ponta a ponta

### Venda → Entrega → Caixa → Financeiro

| Etapa | Status | Evidência |
|---|---|---|
| Criar pedido | [MANUAL] — vendedor digita cliente, itens, condição | `frontend/src/pages/Pedidos/NovoPedido.jsx` |
| Data de entrega sugerida pelo dia de venda do cliente | [AUTO] | `NovoPedido.jsx:455` `calcularProximaData(cliente.Dia_de_entrega)` |
| Último preço praticado por produto | [AUTO] (só preço, não repete o pedido) | `NovoPedido.jsx:169,505` `historicoComprasCliente` |
| Bloqueio por estoque/inadimplência/GPS/WhatsApp | [AUTO] (trava, não sugere alternativa) | `backend/routes` + `pedidos.md` |
| Enviar pedido (ENVIAR → RECEBIDO) | [AUTO] worker 30s | `scheduler.js` §4 `syncPedidosService.processarFila` |
| Emitir NF-e | [MANUAL] clique em "Emitir" (1/seleção/todas) | `notas-fiscais.md` |
| NF-e presa em "processando" | [AUTO] fallback de consulta | `scheduler.js` §12 `focusNfeEmissao.consultarPresas` |
| Embarque/romaneio | [MANUAL] montar carga, escolher motorista | `embarque.md` |
| Divisão de cargas no mapa | [MANUAL, com sugestão] botão "sugerir divisão" (OSRM) | `divisaoCargasService.js` |
| Entrega (baixa pelo motorista) | [MANUAL] celular do motorista | `entregas.md` |
| Baixa financeira da entrega | **[QUEBRA]** — dinheiro/PIX Asaas do dia fica "a conferir" até alguém abrir o Caixa e clicar **Processar**; nada avisa proativamente fora da Agenda | `caixa.md` (Baixa CA) |
| Conferência do dinheiro | [MANUAL, obrigatório] calculadora de cédulas | `caixa.md` §Conferir o dinheiro |
| Fechar caixa | [MANUAL] | idem |
| Caixa não conferido até a virada do dia | [AUTO] entra na fila + aviso WhatsApp 08h | `scheduler.js` §14 `caixaConferenciaWorker` |
| Baixa em Contas a Receber (CA) | [AUTO] sync 1h | `scheduler.js` §4.1 `contasReceberSyncService` |
| Conciliação Pix comum/cartão | [AUTO] extrato 30min | `scheduler.js` §10/§11 `asaasExtratoService`/`caExtratoService` |
| Cobrança de inadimplente | [AUTO] régua por forma, 5/5min checando horário | `scheduler.js` §7.1 `cobrancaService` |
| Falha de WhatsApp na cobrança | [AUTO] vira tarefa | `regua-cobranca.md` |
| Devolução → NF de devolução | [AUTO] no mesmo clique do registro | `ModalDevolucao.jsx` (protegido no `CLAUDE.md`) |
| Devolução → cancelar boleto/PIX Asaas | [AUTO] | idem |

### Compra → Estoque → Custo

| Etapa | Status | Evidência |
|---|---|---|
| Captura de NF-e/NFS-e do fornecedor | [AUTO] a cada 1h (trava de 3h real) | `scheduler.js` §4.3/§4.4 `sefazDfeService`/`nfseAdnService` |
| Manifestação "Ciência da Operação" | [AUTO] | `notas-recebidas.md` |
| Gerar Contas a Pagar a partir da nota | **[MANUAL/QUEBRA]** — nota fica em "NOVA" até alguém abrir Notas Recebidas e clicar; sem alerta central, sem prazo | `notas-recebidas.md` |
| Confirmação/recusa fiscal (manifestação do destinatário) | [MANUAL] decisão comercial, corretamente humana | `manifestacaoHomologacaoService.js` |
| Envio de despesa ao CA / fornecedor | [AUTO] fila 60s | `scheduler.js` §4.2 |
| Baixa de despesa paga no CA (DDA) | [AUTO] 30min | `scheduler.js` §4.2 `conferirBaixasCA` |
| Custo do produto recalculado na entrada | [AUTO] | `contas-a-pagar.md` (regra da média de compras recentes) |
| Snapshot mensal de custo | [AUTO] madrugada | `scheduler.js` §6.1 |
| Título vencido/a vencer | [AUTO] cálculo, mas ação de pagar é manual | `contas-a-pagar.md` KPIs |

### Produção (PCP)

| Etapa | Status | Evidência |
|---|---|---|
| Calcular itens abaixo do mínimo com receita ativa | **[MANUAL]** só roda ao clicar "Gerar Sugestões" | `pcp-sugestoes.md` |
| Aceitar sugestão → gerar OP | [AUTO] (depois do clique) | idem |
| Estoque de PA/SUB atualizado | [AUTO] pelo apontamento do painel operacional | `pcp-painel.md` |
| Etiqueta/rótulo | [MANUAL] impressão | `pcp-etiquetas.md` |

### Comunicação (WhatsApp / bot da Ana)

| Etapa | Status | Evidência |
|---|---|---|
| Confirmação de pedido, boleto/PIX, código de verificação | [AUTO] fila com reenvio | `botWhatsappService.js` |
| Cobrança | [AUTO] régua | acima |
| Selo de uso real do WhatsApp do cliente | [AUTO] madrugada | `scheduler.js` §9b |
| IA responde catálogo/agenda/cliente | [AUTO] | `ia-consulta-api.md` |
| IA cria pedido (Congelados/Kit Festa) | [AUTO, cai em fila de aprovação humana] desde v1.4 | idem |
| IA avisa inadimplência/pendência ao cliente antes de fechar pedido | **[QUEBRA]** não documentado como implementado | `ia-consulta-api.md` §"Próximos passos previstos" |

---

## 3. TOP 15 automações (por horas economizadas × risco evitado)

**1. Central de Pendências (ver seção 4)**
O que a pessoa faz hoje: abre 6 telas diferentes (Notas Fiscais, Notas Recebidas, Caixa/Agenda, Contas a Receber, PCP Sugestões, Tarefas) para saber o que está parado.
Passaria a acontecer sozinho: uma tela agrega tudo com contador e ação de 1 clique.
Gatilho: acesso à tela (dados já existem, é só consulta).
Confirmação: nenhuma — é leitura; a ação em si continua exigindo o clique de sempre.
Risco/trava: nenhum dado novo é gravado; é UI.
Esforço: **G** (tela nova + endpoint agregador).

**2. Sugestão de produção agendada (não só sob demanda)**
Hoje: PCP só descobre item abaixo do mínimo se alguém lembrar de clicar "Gerar Sugestões".
Passaria a: rodar 1x/dia (ex.: 05h, antes do turno) e notificar (badge/WhatsApp interno) quando há sugestão nova; aceitar continua manual.
Gatilho: horário fixo diário, como o snapshot de custo.
Confirmação: aceitar a OP continua exigindo clique (correto — é decisão de chão de fábrica).
Risco: nenhum — só antecipa o cálculo, não cria OP sozinho.
Esforço: **P** (mover a lógica existente para um `setInterval`/cron, reaproveitando `pcpSugestaoService.js`).

**3. Alerta central "nota recebida sem conta a pagar"**
Hoje: nota chega em Notas Recebidas, mas só é vista por quem abre aquela aba.
Passaria a: contador na Central de Pendências + aviso (o mesmo padrão do "certificado vencendo") para quem tem `Pode_Acessar_Notas_Recebidas`, X dias depois de "NOVA" sem virar conta a pagar.
Gatilho: nota parada há N dias em status NOVA (worker diário, reaproveitando o padrão do `certificadoService.alertarValidadeCertificado`).
Confirmação: gerar a conta continua manual (dado fiscal, exige conferência de categoria/produto).
Risco: nenhum, é só aviso.
Esforço: **P**.

**4. Assistente de Pedido — repetir último pedido**
Hoje: vendedor redigita tudo mesmo quando o pedido é igual ao de toda semana (o app só traz o **preço**, não os **itens/quantidades**, ver `NovoPedido.jsx`).
Passaria a: botão "Repetir último pedido" no card do cliente/na tela Novo Pedido, pré-carregando itens+quantidades do último pedido do mesmo tipo, que o vendedor ajusta antes de enviar.
Gatilho: clique do vendedor (não precisa virar automático — é economia de digitação).
Confirmação: o vendedor sempre revisa e confirma antes de Salvar (igual hoje).
Risco: nenhum — não muda a trava de estoque/inadimplência já existentes.
Esforço: **M** (usa o mesmo endpoint `historicoComprasCliente`, precisa reconstituir o carrinho).

**5. Fila de "caixa com recebimento não processado" na Central**
Hoje: dinheiro/PIX Asaas da entrega fica esperando alguém abrir o Caixa e clicar Processar; só aparece nos caixas pendentes da Agenda.
Passaria a: contador na Central com valor total parado por vendedor/dia.
Gatilho: leitura direta (entregas com pagamento e sem baixa).
Confirmação: processar continua exigindo o clique de sempre (dinheiro é sensível).
Risco: nenhum, é leitura.
Esforço: **P**.

**6. Alerta de "boleto/PIX não enviado" no fechamento do dia**
Hoje: existe alerta na hora de imprimir em lote (Pedidos), mas não há verificação diária proativa.
Passaria a: 1x/dia, listar pedidos faturados a prazo sem boleto/PIX gerado (>24h) na Central.
Gatilho: worker diário.
Confirmação: gerar continua manual (decide qual forma).
Risco: nenhum.
Esforço: **P**.

**7. Sugestão de quantidade por histórico no Assistente de Pedido**
Hoje: histórico existe (`historicoComprasCliente`) mas só mostra "último preço", não sugere quantidade típica.
Passaria a: mostrar ao lado de cada item "última vez: 20un, 12/08" e, se possível, "média das últimas 3 vezes".
Gatilho: mesma chamada já feita ao abrir o pedido.
Confirmação: vendedor sempre digita/confirma a quantidade final.
Risco: nenhum.
Esforço: **P/M**.

**8. Alerta prévio no Assistente de Pedido (inadimplente/sem WhatsApp/sem GPS)**
Hoje: essas travas só aparecem **depois** que o vendedor já montou o carrinho e tenta Enviar.
Passaria a: mostrar o alerta **assim que o cliente é selecionado** (antes de montar o carrinho), economizando retrabalho.
Gatilho: mesma consulta já feita (`obterInadimplencia`, ponto GPS, WhatsApp) — só reordenar quando dispara na tela.
Confirmação: nenhuma nova — as travas já existem, é UX.
Risco: nenhum.
Esforço: **P**.

**9. Auto-gerar conta a pagar para nota de fornecedor recorrente/confiável**
Hoje: toda nota nova, mesmo de fornecedor de sempre (ex.: aluguel, insumo fixo), exige clique manual "Gerar conta a pagar".
Passaria a: regra opcional por fornecedor ("sempre gerar automático") que cria a conta a pagar sozinha ao chegar a nota NOVA, deixando só a baixa manual.
Gatilho: chegada da nota (já processada pelo worker de captura).
Confirmação: continuaria exigindo confirmação explícita por fornecedor (opt-in), nunca ligado por padrão — risco fiscal de categorizar errado.
Risco: categoria de despesa errada, duplicidade de nota já vinculada manualmente — precisa trava de idempotência (já existe para nota→conta).
Esforço: **M**.

**10. Aviso central de canhoto de NF não bipado**
Hoje: aba Canhotos existe, mas ninguém é avisado se um canhoto não volta em X dias.
Passaria a: contador na Central "canhotos pendentes há mais de N dias".
Gatilho: worker diário.
Confirmação: nenhuma, é aviso.
Risco: nenhum.
Esforço: **P**.

**11. Relatório automático "o que o dono monta na mão" → Financeiro Visão Geral já existe, mas falta versão exportável/enviada**
Hoje: dono provavelmente monta manualmente um resumo semanal para si (a Visão Geral existe mas é só tela).
Passaria a: gerar um resumo semanal (PDF/WhatsApp) com os mesmos KPIs do Dashboard Financeiro, enviado sozinho toda segunda de manhã.
Gatilho: cron semanal.
Confirmação: nenhuma, é leitura.
Risco: nenhum.
Esforço: **M** (reaproveita `financeiroGerencialService.js`).

**12. IA da Ana avisa inadimplência antes de fechar pedido pelo WhatsApp**
Hoje: a IA já identifica o cliente e cria pedido (v1.4-1.6), mas não há evidência de checar inadimplência antes.
Passaria a: endpoint `/cliente/situacao` (já existe, 🔒 só painel) ser consultado pela IA antes de confirmar pedido, avisando o cliente ("você tem um título em aberto") em vez do vendedor descobrir depois.
Gatilho: toda criação de pedido pela IA.
Confirmação: continua caindo na fila de aprovação humana (já é assim).
Risco: exposição de dado financeiro pelo WhatsApp — exige mensagem genérica, não valor exato, mantendo a regra de identificação por telefone já em vigor.
Esforço: **M** (é integração externa, feita no projeto Antigravity + endpoint aqui).

**13. Alerta central de pedido especial convertido aguardando NF-e**
Hoje: existe popup individual a cada 5 min para quem fatura, mas não aparece contado na Central.
Passaria a: contador agregando esse mesmo popup (reaproveita a lógica existente).
Gatilho: já calculado (popup existente).
Confirmação: nenhuma nova.
Risco: nenhum.
Esforço: **P**.

**14. Duplicar/relançar despesa recorrente automaticamente**
Hoje: existe botão "Duplicar despesa" manual — bom passo, mas ainda depende de lembrar.
Passaria a: marcar uma despesa como "recorrente mensal" e o sistema já sugerir (não lançar sozinho) a duplicata no dia configurado, aparecendo na Central para 1 clique de confirmação.
Gatilho: data configurada por despesa.
Confirmação: sempre confirmação humana antes de lançar (valor pode mudar mês a mês).
Risco: duplicidade se confirmado duas vezes — precisa trava por competência.
Esforço: **M**.

**15. Alerta central de amostra "SOLICITADA" parada há muito tempo**
Hoje: fluxo de status (Solicitada→Preparação→Liberado→Entregue) é 100% manual sem cobrança de prazo.
Passaria a: contador na Central "amostras paradas há mais de N dias em Solicitada/Preparação".
Gatilho: worker diário.
Confirmação: nenhuma, é aviso.
Risco: nenhum.
Esforço: **P**.

---

## 4. Proposta "Central de Pendências" (mockup)

Uma tela nova (`/financeiro/pendencias` ou no menu geral, ícone de alerta), **do escritório**, layout em blocos de cartão (padrão design system: `rounded-xl border shadow-sm`), cada bloco com contador grande no cabeçalho e lista com ação em 1 clique por linha, igual ao card "Cobranças da Rota" do Caixa (já usado como referência de UX no app).

**Topo:** faixa de KPIs (grid `grid-cols-2 md:grid-cols-4`) somando tudo: "N pendências no total", separadas por severidade (vermelho = vencido/dinheiro parado, âmbar = aguardando ação, cinza = informativo).

**Blocos sugeridos (cada um = card com header `TÍTULO DA SEÇÃO` do design system):**

1. **Pedidos para aprovar** (Especiais/Bonificação ABERTO) — cliente, valor, há quantos dias; botão **Aprovar** inline (reaproveita a permissão existente).
2. **NF-e para emitir** — pedidos FATURADO sem nota (cartão "Sem nota" já existe na tela Notas Fiscais); botão **Emitir**.
3. **NF-e rejeitada** — motivo resumido; botão **Corrigir/Reemitir** (leva à tela).
4. **Caixas para conferir/fechar** — reaproveita `caixaConferenciaService`; botão **Abrir caixa**.
5. **Notas recebidas sem conta a pagar** — NOVA há mais de N dias; botão **Gerar conta**.
6. **Boletos/PIX não enviados** — pedido faturado a prazo sem cobrança gerada; botão **Gerar boleto**.
7. **Títulos vencidos** (resumo, não lista de 500 linhas) — total por faixa de atraso, atalho para Contas a Receber/Régua.
8. **Ordens de produção sugeridas** — itens abaixo do mínimo (reaproveita `pcpSugestaoService`); botão **Aceitar** (cria OP).
9. **Tarefas atrasadas** (da Régua de Cobrança e das gerais) — já existe o conceito de tarefa com alerta sonoro; só listar as vencidas aqui também.
10. **Canhotos não bipados há mais de X dias**.
11. **Amostras paradas**.

Cada bloco: até 5 linhas visíveis + "ver todas (N)" que leva à tela original (a Central não substitui as telas, só aponta). Filtro por responsável/vendedor no topo. Mobile: cards empilhados (`md:hidden` / `hidden md:block` no padrão já usado nas outras telas).

---

## 5. Proposta "Assistente de Pedido" (mockup, vendedor)

Ao abrir **Novo Pedido** e selecionar o cliente (antes de mostrar o carrinho), inserir um **painel de contexto** no topo (card âmbar/verde conforme severidade), no lugar de só a data sugerida atual:

1. **Alertas primeiro** (o que hoje só aparece tarde):
   - 🔴 "Cliente com título vencido de R$ X — confirme com o financeiro antes de vender a prazo" (reaproveita `obterInadimplencia`, mas mostrado **na seleção do cliente**, não só ao tentar Enviar).
   - 🟡 "Cliente sem WhatsApp cadastrado" / "sem ponto GPS" — com atalho para resolver na hora (mesmos modais que já existem no bloqueio de Enviar, só antecipados).
2. **Botão "Repetir último pedido"** — mostra data e itens do último pedido do cliente (mesmo tipo: normal/especial), pré-carrega o carrinho para o vendedor ajustar.
3. **Sugestão por histórico**, ao lado de cada produto no carrinho: "última compra: 12un em 28/08" (usa o `historicoMap` que já é carregado, só não é exibido para quantidade hoje).
4. **Data de entrega** já sugerida (mantém o que existe).

Mockup visual: um card no topo da tela, abaixo do seletor de cliente, título "Resumo antes de montar o pedido", com os alertas em lista e o botão de repetir pedido em destaque (botão primário verde). Tudo dispensável — o vendedor pode ignorar e montar do zero como hoje.

---

## 6. Roadmap de 90 dias

**Dias 1–20 (fundação, baixo risco, alto retorno rápido)**
- PCP: sugestão de produção agendada (item 2) — reaproveita serviço existente.
- Alertas central "nota sem conta a pagar" (item 3) e "boleto não enviado" (item 6) — dois workers pequenos, seguem o padrão do `certificadoService`.
- Assistente de Pedido: antecipar alertas de inadimplência/WhatsApp/GPS na seleção do cliente (item 8) — é reordenar UI, sem nova regra de negócio.

**Dias 21–50 (Central de Pendências v1)**
- Construir a tela com os 5-6 blocos mais valiosos primeiro: Pedidos para aprovar, NF-e a emitir/rejeitada, Notas recebidas sem conta, Caixas para conferir, Sugestões de produção.
- Endpoint agregador único no backend (evita 6 chamadas separadas no front).

**Dias 51–70 (Assistente de Pedido completo)**
- "Repetir último pedido" (item 4) + sugestão de quantidade por histórico (item 7).
- QA extensivo (é a tela mais usada do app, por todos os vendedores em campo).

**Dias 71–90 (extensões e IA)**
- Completar os blocos restantes da Central (canhotos, amostras, títulos vencidos).
- Resumo semanal automático (item 11).
- Avaliar com o dono se vale abrir o endpoint de inadimplência para a IA da Ana antes de fechar pedido pelo WhatsApp (item 12) — é decisão de produto/exposição de dado, não só técnica.

---

## Confirmação

Este levantamento foi **somente leitura**: nenhum arquivo do projeto foi criado, editado ou apagado. Todas as observações vêm de manuais em `backend/manuais/abas/`, do `backend/workers/scheduler.js`, dos services em `backend/services/`, do `backend/docs/ia-consulta-api.md` e do código de `frontend/src/pages/Pedidos/NovoPedido.jsx`.
