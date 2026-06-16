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
2. **Catálogo personalizado:** para clientes com cadastro, aparecem primeiro **"Você sempre pede"** (produtos comprados nas últimas 3 compras) e depois **"Mais salgados"**. Há busca e filtros por **categoria comercial** (a mesma categoria de produto do sistema). O Kit Festa **não** entra no catálogo de congelados.
3. **Repetir último pedido:** botão que recria o carrinho com os itens da última compra do cliente.
4. **Carrinho (gaveta lateral):** escolha da **condição de pagamento** (somente as liberadas no cadastro do cliente), **dia de entrega** (somente os dias do cadastro), telefone e observações.
5. **Pedido mínimo:** vem da **condição de pagamento** escolhida (o valor mínimo de compra cadastrado na Tabela de Preços). Se o subtotal for menor, o envio fica bloqueado.
6. **Preços:** usam o valor de venda do produto (ou um preço específico do site, se o admin definir). Não há pagamento online — o pedido é registrado e o pagamento é combinado depois.
7. **Promoções:** ainda não são tratadas no site de congelados.

## Painel admin (`/site-admin`)
Duas abas:

### Pedidos do site
Lista a fila de pedidos recebidos pelo site, com busca (nome, documento, telefone) e filtro por status:
- **Aguardando** — pedido de cliente com cadastro, pronto para aprovar.
- **Sem cadastro** — visitante sem Cliente no sistema; é preciso **Vincular cliente** antes.
- **Convertido** — já virou pedido no sistema (mostra o número).
- **Recusado / Cancelado**.

Ações por pedido:
- **Vincular cliente:** procura o cadastro no Conta Azul (por nome/documento/código) e vincula ao pedido. Depois o pedido fica "Aguardando".
- **Aprovar e gerar pedido:** cria um pedido no sistema a partir do pedido do site. Você escolhe se será **Normal** (com nota, vai ao Conta Azul) ou **Especial** (sem nota). O sistema **respeita a condição de pagamento**: se ela não permitir especial, a conversão é bloqueada. O vendedor do pedido é o vendedor do cadastro do cliente.
- **Recusar** (com motivo) e **Excluir** (somente administrador).

### Produtos no site
Define **quais produtos** aparecem no catálogo de congelados (igual ao Kit Festa). Busca por nome e filtro por categoria comercial. Para cada produto: **Adicionar/remover** do site e, opcionalmente, um **preço específico do site** (se vazio, usa o valor de venda do produto). Produtos que também estão no Kit Festa aparecem sinalizados.

## Página principal (`/inicio`)
Vitrine institucional pública (sem login): topo com logo e menu, hero com a caixa girando, os dois caminhos (Kit Festa e Congelados), faixa de diferenciais, contato (endereço, WhatsApp, Instagram) e rodapé. Tem um **botão de WhatsApp flutuante** que acompanha a rolagem e abre uma conversa direta. Os dados de contato vêm da configuração do site.
