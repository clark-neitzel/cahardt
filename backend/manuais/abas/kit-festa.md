# Kit Festa — Site de pedidos e painel da cozinha

**Rota (painel admin):** `/kit-festa-admin`
**Site público do cliente:** `/kit-festa` (link enviado por WhatsApp/redes; não exige login do app)
**Permissão:** `admin` ou `kitFesta`. Para liberar a outros usuários: **Vendedores → editar → permissões → ligar "Kit Festa"** (a exclusão de pedidos continua só para admin).

O Kit Festa é a linha de salgados de festa (caixas de 25 unidades, mínimo de 4 caixas). O cliente acessa um **link público**, monta o pedido, escolhe data/horário e finaliza pelo WhatsApp. O pedido cai numa **fila** no painel admin; ao ser **aprovado**, vira um pedido normal/especial/bonificação na aba **Pedidos**.

> **Importante:** o módulo "Delivery" (Kanban) é outra coisa — acompanha a entrega de pedidos já existentes. O "Kit Festa" é o site de pedidos + agenda da cozinha.

---

## Como o cliente faz o pedido (site público)

1. **Acesso por CPF.** O cliente digita o CPF:
   - **Tem cadastro no app e já tem senha** → faz login.
   - **Tem cadastro no app mas nunca acessou o site** → cria uma senha (primeiro acesso).
   - **Não tem cadastro** → faz o pedido como **visitante** (informa nome e WhatsApp). Esse pedido entra como **"Sem cadastro"** e a equipe entra em contato para finalizar o cadastro.
   - **Esqueci minha senha** → recebe um código para redefinir.
2. **Monta o pedido** no catálogo (filtros por categoria; cada caixa = 1 sabor, 25un).
3. **Carrinho:** aplica cupom; respeita o mínimo de caixas.
4. **Checkout (passo a passo — cada etapa aparece após preencher a anterior):**
   - **Como receber:** retirada (mostra o endereço da loja + link "ver no mapa") ou **entrega**.
   - **Endereço (entrega):** se o cliente tem endereço no cadastro, ele aparece e o cliente escolhe "entregar neste endereço" ou "outro endereço". Se for outro, ou se não tiver cadastro (obrigatório informar), ele digita o **CEP** → o sistema busca (ViaCEP) e preenche rua + **bairro** (que é selecionado na lista, definindo a **taxa**) → informa **número** e complemento.
   - **Dia e horário:** calendário liberado pela cozinha + horário com vaga.
   - **Observações** (opcional).
5. **Confirma o WhatsApp:** o cliente confirma o número (ou informa, se não tiver) — fica registrado no pedido.
6. **Finaliza:** o pedido é salvo e aparece a tela "Pedido registrado!" com o botão **"Enviar pedido pelo WhatsApp"** (o cliente pode, opcionalmente, abrir a conversa com a loja por ali). Além disso, **assim que o pedido é finalizado, o nosso WhatsApp (BotConversa) envia automaticamente uma mensagem de confirmação para o celular do cliente**, com o resumo do pedido (itens, data/horário, retirada ou entrega e total). Se o número for novo/corrigido, o pedido é marcado como **"celular alterado"** para a equipe atualizar no cadastro. O pagamento é combinado depois (pix ou na entrega).

No site o cliente logado também vê a seção **"Indique e ganhe"** com o código de indicação dele (quando o programa de indicação está ativo nas Configurações).

---

## Painel admin — sub-abas

### 1. Pedidos
Fila de pedidos vindos do site, **do mais recente para o mais antigo**, com **pílulas de status com contagem** (Todos / Aguardando / Sem cadastro / Convertidos / Recusados / Cancelados) e busca por **nome, razão social, nome fantasia, cidade, CPF ou CNPJ** (e telefone). A lista **atualiza sozinha a cada 45 segundos**. Pedidos novos aparecem com **aviso amarelo pulsante** e etiqueta **"Novo"** com borda destacada. Quando o pedido gerado é **excluído no sistema**, o pedido do site vira **Cancelado** automaticamente.
- Abrir um pedido mostra itens, cliente, modo, data/horário, bairro/taxa, total e observações.
- **Pedidos "Sem cadastro"** aparecem destacados em vermelho. Antes de aprovar, é preciso **vincular** o pedido a um cliente do app (cadastre no Conta Azul, sincronize, busque e vincule).
- **Celular alterado:** quando o cliente informa/corrige o número no checkout, o pedido mostra o aviso **"celular alterado"** (laranja) com o novo número — atualize no cadastro do cliente no app/CA.
- **Aprovar:** escolha o **tipo de pedido** (Normal, Especial ou Bonificação) e o **vendedor**. Ao aprovar, o pedido é **convertido** e passa a aparecer na aba **Pedidos** no fluxo normal.
- **Recusar:** com motivo opcional.
- **Excluir** (ícone de lixeira no topo do pedido): apaga o pedido do Kit Festa de vez. **Só administradores** veem/usam (útil para apagar testes). Não apaga o Pedido normal já convertido — só o registro do Kit Festa.

### 2. Agenda
Os horários são definidos **por data** (não é mais um template que vale pra sempre). Um dia só fica disponível no site se tiver horários configurados e não estiver fechado.

**Configurar horários em lote** (bloco de cima):
- Escolha o **período** (De / Até — quantos dias quiser) e os **dias da semana** que entram.
- Escolha o **tipo** (Retirada ou Entrega — são configurados separadamente, podem ter horários diferentes).
- Defina a **capacidade** (pedidos por horário) e selecione os **horários** na grade de **06:00 às 20:00** (de 30 em 30 min). Atalhos: Todos / Comercial / Limpar.
- **Aplicar horários ao período:** grava esses horários em todos os dias escolhidos.
- **Fechar os dias do período:** marca os dias como fechados (indisponíveis no site).

**Calendário + editor do dia** (bloco de baixo):
- O calendário mostra cada dia: bolinha verde (tem horários), cinza escuro (fechado), cinza claro (sem horários) e o nº de pedidos no canto.
- Clique num dia para **editar manualmente**: **fechar/reabrir** o dia, e ajustar os horários de **retirada** e **entrega** um a um (mudar a capacidade de um horário, adicionar ou remover horário). Use para fechar dias específicos ou ajustar conforme demandas externas.
- A capacidade pode variar por horário; no site, horários cheios aparecem como "esgotado" e dias sem vaga como "esgotado/fechado".

### 3. Produtos
Define quais **produtos do app** aparecem no site. Busca e filtro (Todos / No site / Fora).
- **Adicionar/tirar** um produto do site.
- **Configurar** cada produto no site: categoria do site, unidades por caixa, preço Kit Festa (pode diferir do app), descrição, tags, opções (ex: Frango/Palmito), destaque ("Mais pedidos") e ordem.
- As **imagens** vêm automaticamente da foto cadastrada no produto do app.
- **Categorias do site:** crie/edite as categorias de exibição (ex: Fritos, De forno, Doces).

### 4. Bairros
Bairros de entrega com **CEP** e **taxa**. Ativar/desativar. No checkout, ao escolher "Entrega", o cliente seleciona o bairro e vê a taxa.

### 5. Cupons
Cupons de desconto: código, tipo (% ou R$), valor, mínimo de caixas, validade, limite de usos, só primeira compra, ativo/inativo. Abaixo da lista tem o **histórico "Quem usou os cupons"** — cliente, cupom, desconto e data de cada uso.

### 6. Indicações
Controle do programa de indicação. Cada indicação vira **1 crédito** para o indicador **quando o pedido do indicado é quitado (pago)**; o indicador usa **1 crédito por pedido** (cupom e crédito nunca juntos no mesmo pedido).
- **Resumo:** créditos gerados, disponíveis, valor a usar, valor já usado.
- **Tabela:** indicador (quem ganha) · código · indicado · valor do crédito · situação (Disponível/Usado) · data.
- O crédito é liberado **automaticamente** quando o Financeiro dá **baixa no Contas a Receber** do pedido do indicado (processo normal). Não há botão de "marcar como pago" — a quitação vem do Financeiro.

### 7. Configurações
Tudo que aparece no site, editável sem programador:
- **Dados da loja** (nome, slogan, endereço, telefone, WhatsApp) + **upload da logo** ("Trocar logo" — use PNG com fundo transparente) + **Link do mapa (Google Maps)** usado no rodapé, no checkout de retirada e na cópia do WhatsApp.
- **Regras** (pedido mínimo de caixas).
- **Página inicial (hero)** (título, subtítulo, kicker).
- **Como funciona** (4 passos).
- **Indicação e entrega:** programa ativo/inativo, **crédito do indicador** (R$ que quem indica ganha), **desconto do indicado** (valor + tipo R$/% que quem usa o código ganha na 1ª compra) e texto do frete.
- **Avaliações** de clientes exibidas no site.

> **Pagamento (quitação):** é feito pelo **Financeiro**, dando **baixa no Contas a Receber** do pedido (fluxo normal, como qualquer pedido). Quando o pedido do indicado é baixado, o sistema **libera o crédito automaticamente** para quem indicou. No checkout, o cliente usa **um** desconto por pedido: cupom **ou** código de indicação (1ª compra) **ou** 1 crédito de indicação. Na tela do cliente há um aviso (editável em Configurações) informando que os créditos entram em até ~72h após a conclusão do pedido do indicado.

---

## Botões do topo
- **Abrir site:** abre a página pública do cliente numa nova aba.
- **Copiar link do cliente:** copia o link `/kit-festa` para enviar por WhatsApp/redes.
