# Site (Congelados)

Módulo do **site público da Hardt** voltado à revenda de congelados (B2B), com painel administrativo interno para gerenciar os produtos e os pedidos que chegam pelo site. Reaproveita a mesma estrutura do Kit Festa, mas é **personalizado por cliente**: cada cliente vê seus preços, suas condições de pagamento e seus dias de entrega, vindos do cadastro.

## Onde fica
- **Painel admin:** menu lateral **Site** → rota `/site-admin`. Permissão: `kitFesta` (mesma do Kit Festa) ou administrador.
- **Site público (sem login do app):**
  - Página principal: `/inicio` — vitrine institucional com botão de WhatsApp flutuante e os caminhos "Kit Festa" e "Congelados".
  - Área do cliente de congelados: `/congelados` — catálogo + pedido.

> Observação: enquanto o domínio próprio não é migrado, a home pública fica em `/inicio` (a raiz `/` do app continua sendo o painel interno).

## Site público — área do cliente (`/congelados`)
1. **Entrar:** o cliente informa **CPF ou CNPJ**. O sistema procura o cadastro:
   - Já tem senha → pede a senha e entra.
   - Existe no sistema mas sem senha → primeiro acesso, cria senha.
   - Não existe → pode fazer o pedido **sem cadastro** (a equipe vincula depois).
2. **Catálogo personalizado:** para clientes com cadastro, aparece primeiro **"Você sempre pede"** (produtos comprados nas últimas 3 compras) e depois o catálogo **separado por categoria** (cada categoria como uma seção, na ordem definida no admin), com os produtos em **ordem alfabética** dentro de cada categoria. A vitrine usa o **mesmo visual claro do Kit Festa** (cards cor de creme) e os filtros por **categoria comercial** aparecem como **pílulas** no topo (sem campo de busca). O Kit Festa **não** entra no catálogo de congelados.
   - **Preparo no card:** cada card mostra (entre o pacote e o preço) um rótulo discreto de **preparo** — ex.: "Para fritar", "Para assar", "Para aquecer". Esse texto é definido **por categoria** no admin (botão "Categorias do site"), então serve para o cliente saber como preparar mesmo em "Você sempre pede", que mistura categorias. Se a categoria não tiver preparo definido, o card não mostra nada.
   - **Fotos do produto:** o card usa **todas as imagens cadastradas no produto** (as mesmas do cadastro). Se o produto tem **mais de uma foto**, o card fica **passando as imagens** automaticamente (com bolinhas indicando quantas são).
   - **Ficha do produto:** clicar na foto (ou no nome) abre um **popup** com uma **imagem grande** do produto no topo — se houver mais de uma foto, tem **setas** (‹ ›) e bolinhas para trocar — e abaixo a ficha técnica vinda da **etiqueta** do produto, no mesmo padrão da etiqueta impressa: **tabela nutricional padrão ANVISA** (colunas 100 g · porção · %VD, com sub-itens recuados), **ingredientes + declaração de alérgenos** (CONTÉM/NÃO CONTÉM GLÚTEN · CONTÉM LACTOSE · ALÉRGICOS: CONTÉM…), **modo de preparo** e, no final, as pílulas de **validade** e **conservação**. Se o produto não tiver etiqueta cadastrada, mostra só a descrição.
3. **Repetir último pedido:** botão que recria o carrinho com os itens da última compra do cliente.
4. **Carrinho (gaveta lateral):** mostra a **condição de pagamento padrão** do cliente (o site usa só a padrão), **dia de entrega** (somente os dias do cadastro), telefone e observações.
5. **Pedido mínimo:** para cliente logado, vem da **condição padrão** dele; para visitante (sem login), vem da **tabela "Site"** (valor mínimo cadastrado nela). Se o subtotal for menor, o envio fica bloqueado.
6. **Preços — dependem de quem está vendo:**
   - **Visitante (sem login):** preço pela **tabela de preço "Site"** (condição com `ID = SITE`) — preço de venda do produto **+ o acréscimo % dessa tabela**. O valor mínimo do pedido também é o da tabela "Site".
   - **Cliente logado:** vê **exatamente o mesmo preço que o vendedor veria na tela de pedido** para ele, calculado com a **condição de pagamento padrão** do cadastro: preço de tabela + acréscimo da condição e, se já comprou aquele produto, o **último preço negociado** (pra mais ou pra menos) — respeitando o piso da **política de desconto do flex** (limite do vendedor). Cliente logado **sem** condição cadastrada cai na tabela "Site".
     - **O que é o "último preço":** é o valor praticado no **pedido feito por último** (data em que o pedido foi lançado — não a data de entrega). Assim, se o escritório renegocia um valor mais baixo num pedido novo, é esse valor que passa a aparecer (inclusive ao "Repetir último pedido"). Produtos **sem histórico** usam a tabela padrão do cliente. Esse critério é **o mesmo do vendedor** (mudou junto: vendedor e site sempre iguais).
   - Não há pagamento online — o pedido é registrado e o pagamento é combinado depois.
7. **Envio do pedido (WhatsApp):** ao finalizar, aparece "Pedido registrado!" com o botão **"Enviar pedido pelo WhatsApp"** — o **próprio cliente** envia o pedido à loja pelo WhatsApp dele. A loja **não** dispara mais mensagem automática (evita bloqueio do número). O pedido fica registrado na fila do admin de qualquer forma.
8. **Promoções:** ainda não são tratadas no site de congelados.

## Painel admin (`/site-admin`)
Duas abas:

### Pedidos do site
Lista a fila de pedidos recebidos pelo site, **do mais recente para o mais antigo**. A busca é por **nome, razão social, nome fantasia, cidade, CPF ou CNPJ** (e telefone). A lista **atualiza sozinha a cada 45 segundos**, então pedidos novos e mudanças de status aparecem sem precisar recarregar.

No topo há **pílulas de status com a contagem** de cada um (Todos / Aguardando / Sem cadastro / Convertido / Recusado / Cancelado) — clicar filtra a lista. Quando há pedidos novos esperando, aparece um **aviso amarelo pulsante** ("X pedidos novos aguardando") e cada pedido novo ganha a etiqueta **"Novo"** e borda destacada, para o operador tratar na hora.

Status:
- **Aguardando** — pedido de cliente com cadastro, pronto para aprovar.
- **Sem cadastro** — visitante sem Cliente no sistema; é preciso **Vincular cliente** antes.
- **Convertido** — já virou pedido no sistema (mostra o número).
- **Recusado / Cancelado** — Cancelado aparece automaticamente quando o pedido gerado é **excluído no sistema** (o status do site acompanha o do sistema).

Ações por pedido:
- **Vincular cliente:** procura o cadastro no Conta Azul (por nome/documento/código) e vincula ao pedido. Depois o pedido fica "Aguardando".
- **Aprovar e gerar pedido:** cria um pedido no sistema a partir do pedido do site. Você escolhe se será **Normal** (com nota, vai ao Conta Azul) ou **Especial** (sem nota). O sistema **respeita a condição de pagamento**: se ela não permitir especial, a conversão é bloqueada. O vendedor do pedido é o vendedor do cadastro do cliente.
- **Recusar** (com motivo) e **Excluir** (somente administrador).

### Produtos no site
Define **quais produtos** aparecem no catálogo de congelados (igual ao Kit Festa): cards com foto, nome, categoria e preço. Busca por nome, filtros **Todos / No site / Fora** e seleção de **várias categorias comerciais** ao mesmo tempo — os filtros ficam **salvos** (voltam do jeito que você deixou). O botão **Categorias do site** permite definir o **nome que cada categoria mostra no site** (apelido, sem mexer no nome do sistema), a **ordem**, **ocultar** categorias dos filtros e o **preparo** (texto que aparece no card de cada produto daquela categoria, ex.: "Para fritar"). Botão **Adicionar/No site** e **Configurar** por produto (preço do site, **unidades**, **embalagem** — como aparece no card: caixa, pacote, unidade etc., **foto** do produto, descrição, ordem, destaque "Mais pedidos", ativo). Se o preço do site ficar vazio, usa o cálculo automático (condição + negociação). Produtos que também estão no Kit Festa aparecem sinalizados.

### Configurações
Configura a aparência e os textos do site (igual ao Kit Festa): **logo**, dados da loja (nome, slogan, endereço, telefone, WhatsApp, Instagram, Facebook, **e-mail de atendimento** e **link do mapa**), a **linha pequena do topo** (kicker), a seção **"Nossa História"** (logo abaixo dos cards na página principal), os **4 destaques** (que aparecem na base do painel Nossa História), o texto da seção "Dois jeitos de pedir" e os textos da tela de login dos congelados. Cada bloco tem seu botão **Salvar**.

No bloco **"Destaques"** você edita os 4 quadradinhos (ex.: “desde 2007 · Tradição”): cada um tem a **linha amarela**, o **título** e o **texto**. Eles aparecem na **base do painel da Nossa História**.

A seção **"Nossa História"** é um **painel verde** que aparece **logo abaixo dos cards** na página principal: ali você edita o **título**, o **texto** (cada parágrafo em uma linha), a **frase de destaque** (manuscrita, opcional) e envia as **imagens do carrossel** que aparece ao lado (botão **Adicionar**; as setas ‹ › mudam a ordem e o **×** remove; máx 3MB cada). Os **4 destaques** ficam na base do painel. Enquanto não houver nenhuma imagem enviada, mostra a caixa padrão da Hardt. Depois de mexer nas imagens, clique em **Salvar** para publicar.

No topo da aba há **Abrir site** (abre a página principal) e **Copiar link do cliente** (copia o link da área de congelados pra mandar ao cliente).

## Página principal (`/inicio`)
Vitrine institucional pública (sem login), com **fundo claro (creme, estilo Kit Festa)**: topo com logo e menu; a página abre com a **logo da Hardt em tamanho grande** (no desktop, à esquerda; no celular, centralizada no topo) ao lado do título da seção **"Dois jeitos de pedir"**, com os dois cards (Kit Festa e Congelados) logo abaixo. Em seguida vem a seção **"Nossa História"** — um **painel verde** com título + texto + frase manuscrita à esquerda e um **carrossel de imagens** à direita (com selo "Sabor sem igual"), e os **4 destaques** (tradição, feito à mão, frota própria, pedido fácil) na base do painel; tudo editável no admin. Depois vem o contato (cartão "Onde estamos" com endereço, WhatsApp em destaque, **e-mail**, **redes sociais** — Instagram e Facebook com ícones clicáveis que abrem as páginas — e os botões **Chamar no WhatsApp** e **Montar Kit Festa**, ao lado de um **mapa do Google** com a localização da loja). O **rodapé é simples**: a **logo** + "Hardt Doces e Salgados Ltda® — Todos os direitos reservados." (as informações de contato ficam só no cartão, pra não repetir). O mapa usa o **endereço cadastrado** e as redes usam o Instagram/Facebook dos dados da loja (o Facebook só aparece se estiver preenchido). No menu, **A Hardt** leva à seção Nossa História. Tem um **botão de WhatsApp flutuante** que acompanha a rolagem e abre uma conversa direta. Os dados de contato vêm da configuração do site.
