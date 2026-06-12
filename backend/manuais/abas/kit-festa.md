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
4. **Checkout:** escolhe retirada (mostra o endereço e link "ver no mapa") ou entrega (seleciona o **bairro**, que mostra a **taxa**), escolhe **data** (calendário liberado pela cozinha) e **horário** (com vagas), e observações.
5. **Confirma o WhatsApp:** o cliente confirma o número (ou informa, se não tiver) — é pra onde a cópia do pedido é enviada.
6. **Finaliza:** o pedido é salvo e o cliente **recebe uma cópia no WhatsApp** automaticamente (mesmo envio dos outros avisos do app, via BotConversa). Se o número for novo/corrigido, o pedido é marcado como **"celular alterado"** para a equipe atualizar no cadastro. O pagamento é combinado depois (pix ou na entrega).

---

## Painel admin — sub-abas

### 1. Pedidos
Fila de pedidos vindos do site. Filtros por status (Aguardando, Sem cadastro, Convertidos, Recusados) e busca por nome/CPF/telefone.
- Abrir um pedido mostra itens, cliente, modo, data/horário, bairro/taxa, total e observações.
- **Pedidos "Sem cadastro"** aparecem destacados em vermelho. Antes de aprovar, é preciso **vincular** o pedido a um cliente do app (cadastre no Conta Azul, sincronize, busque e vincule).
- **Celular alterado:** quando o cliente informa/corrige o número no checkout, o pedido mostra o aviso **"celular alterado"** (laranja) com o novo número — atualize no cadastro do cliente no app/CA.
- **Aprovar:** escolha o **tipo de pedido** (Normal, Especial ou Bonificação) e o **vendedor**. Ao aprovar, o pedido é **convertido** e passa a aparecer na aba **Pedidos** no fluxo normal.
- **Recusar:** com motivo opcional.
- **Excluir** (ícone de lixeira no topo do pedido): apaga o pedido do Kit Festa de vez. **Só administradores** veem/usam (útil para apagar testes). Não apaga o Pedido normal já convertido — só o registro do Kit Festa.

### 2. Agenda
Calendário da cozinha. Cada dia tem um status: **Aberto**, **Últimas vagas**, **Esgotado** ou **Fechado** (cores na legenda). Um número no canto mostra quantos pedidos há no dia.
- Clique num dia para mudar o status.
- Atalhos do mês: **Abrir mês**, **Fechar domingos**, **Fechar mês**.
- **Horários e capacidade:** template de horários por modo (retirada/entrega), com capacidade (nº de pedidos) por horário. O site mostra os horários cheios como "esgotado".

### 3. Produtos
Define quais **produtos do app** aparecem no site. Busca e filtro (Todos / No site / Fora).
- **Adicionar/tirar** um produto do site.
- **Configurar** cada produto no site: categoria do site, unidades por caixa, preço Kit Festa (pode diferir do app), descrição, tags, opções (ex: Frango/Palmito), destaque ("Mais pedidos") e ordem.
- As **imagens** vêm automaticamente da foto cadastrada no produto do app.
- **Categorias do site:** crie/edite as categorias de exibição (ex: Fritos, De forno, Doces).

### 4. Bairros
Bairros de entrega com **CEP** e **taxa**. Ativar/desativar. No checkout, ao escolher "Entrega", o cliente seleciona o bairro e vê a taxa.

### 5. Cupons
Cupons de desconto: código, tipo (% ou R$), valor, mínimo de caixas, validade, limite de usos, só primeira compra, ativo/inativo.

### 6. Configurações
Tudo que aparece no site, editável sem programador:
- **Dados da loja** (nome, slogan, endereço, telefone, WhatsApp) + **upload da logo** ("Trocar logo" — use PNG com fundo transparente) + **Link do mapa (Google Maps)** usado no rodapé, no checkout de retirada e na cópia do WhatsApp.
- **Regras** (pedido mínimo de caixas).
- **Página inicial (hero)** (título, subtítulo, kicker).
- **Como funciona** (4 passos).
- **Indicação e entrega** (programa de indicação, crédito, texto do frete).
- **Avaliações** de clientes exibidas no site.

---

## Botões do topo
- **Abrir site:** abre a página pública do cliente numa nova aba.
- **Copiar link do cliente:** copia o link `/kit-festa` para enviar por WhatsApp/redes.
