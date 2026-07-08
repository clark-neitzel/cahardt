---
aba: Catálogo
rota: /catalogo
permissao: todos (filtrado por categorias comerciais permitidas ao vendedor)
---

# Catálogo

## O que é

Vitrine de consulta de produtos disponíveis para venda, no mesmo visual do site de congelados (pílulas de categoria, cards com foto e popup ao clicar). O vendedor usa para ver foto, preço, código, estoque e a ficha (tabela nutricional, ingredientes, modo de preparo) antes ou durante a visita. Não é possível criar pedido a partir daqui — o pedido começa na aba **Rota**.

Além da consulta, o Catálogo permite **Montar catálogo personalizado**: o vendedor seleciona alguns produtos, escolhe o cliente e a condição de pagamento, e o sistema gera uma **lista de preços em página pública** (link `hardtsalgados.com.br/lista/<código>`) para enviar ao cliente pelo WhatsApp. É um "snapshot": os preços ficam **congelados** no momento em que o link é gerado.

---

## O que dá pra fazer aqui

- Buscar produto por nome ou código
- Filtrar por categoria usando as **pílulas de categoria** no topo (botão "Todos" + uma pílula por categoria comercial, com a cor da categoria)
- Ver os produtos organizados em **seções por categoria** (sem paginação — carrega tudo de uma vez)
- Ver card com foto, nome, preço, código e estoque disponível; etiqueta de status (Ativo / Sem Estoque / Baixo Estoque / Inativo)
- Clicar no produto para abrir um **popup** com: foto(s) em carrossel, preço, estoque, descrição e — quando o produto tem etiqueta cadastrada — a **tabela nutricional (padrão ANVISA)**, ingredientes/alérgenos, modo de preparo, validade e conservação
- Filtro automático por categorias de vendas configuradas no sistema e pelas categorias comerciais permitidas ao vendedor (regras mantidas; as pílulas filtram só dentro do que já é permitido)
- **Montar catálogo personalizado**: selecionar vários produtos, escolher o cliente e a condição de pagamento, e gerar um link público de lista de preços para enviar no WhatsApp

---

## Montar catálogo personalizado (lista de preços por link)

O botão **"Montar catálogo"** (no topo da tela) liga o **modo seleção**:

1. Toque em **Montar catálogo** — o cabeçalho muda e os cards passam a ter uma marca de seleção (bolinha com ✓)
2. Toque nos produtos que quer incluir (o contador no topo mostra quantos foram marcados)
3. Toque em **"Destinatário e condição"** na barra inferior
4. Escolha **para quem enviar**:
   - **Cliente cadastrado** (busca por nome) — o sistema já sugere a **condição de pagamento padrão** dele;
   - **Outro destinatário** — para quem ainda não é cliente: é só digitar o nome da pessoa ou empresa.
5. Escolha a **condição de pagamento** — aparecem as condições **marcadas para o catálogo** (tag "Aparece no Catálogo Personalizado" em Configurações → Preços e Condições). As **aprovadas** do cliente ficam normais (com selo "padrão"); as **não aprovadas** que **exigem aprovação de crédito** (tag na condição) ficam marcadas como **"aprov. crédito"**. Os preços recalculam na hora com o **mesmo cálculo do Novo Pedido** (`preço de tabela + acréscimo da condição`); "à vista" pode ficar mais barato, prazos maiores mais caros
6. Toque em **"Gerar link do catálogo"** (a validade é sempre **7 dias**)
7. O sistema devolve o link (`hardtsalgados.com.br/lista/<código>`) — botões **Copiar** e **Enviar no WhatsApp**

O que o **cliente** vê ao abrir o link: uma página no visual da marca Hardt (com a logo real) com o nome dele, a condição, a validade e a lista de produtos com o preço final de cada um — e um botão para fazer o pedido no WhatsApp. **Não aparece o total da lista** (só o vendedor vê o total ao montar). Não precisa de login.

> **Mediante aprovação de crédito:** se a condição escolhida estiver marcada como **"Exige aprovação de crédito"** (tag em Preços e Condições, ex.: boleto) **e não estiver aprovada** para aquele destinatário, a lista sai marcada como **"mediante aprovação de crédito"** — tanto no app quanto na página do cliente. Condições sem essa tag (ex.: à vista) nunca pedem aprovação. Para não-cliente (destinatário avulso), toda condição com a tag entra como "mediante aprovação de crédito".
> **WhatsApp da página do cliente:** cliente cadastrado → abre a conversa do **vendedor** que montou a lista; não-cliente → abre o **WhatsApp da loja**.
> **Preços congelados:** a lista guarda os preços do momento em que foi gerada. Se o produto mudar de preço depois, o link que o cliente já recebeu **não muda**. Para atualizar, é só montar uma lista nova.
> **Aviso de pedido mínimo:** se o total ficar abaixo do mínimo da condição, aparece um lembrete só para o vendedor (não bloqueia o envio).

---

## Como fazer (passo a passo real)

### Buscar um produto
1. Abra a aba Catálogo
2. Digite o nome ou código no campo de busca
3. A lista atualiza automaticamente (com debounce de 500ms)

### Filtrar por categoria
1. Toque numa pílula de categoria no topo (ex.: o nome da categoria comercial)
2. A lista mostra só os produtos daquela categoria; toque em "Todos" para voltar

### Ver detalhe / ficha de um produto
1. Clique no card do produto
2. Abre um popup com foto(s), preço, estoque e descrição
3. Se o produto tiver etiqueta cadastrada (em **PCP — Dados Etiquetas**), o popup também mostra a tabela nutricional, ingredientes, alérgenos, modo de preparo e validade
4. Feche no botão "Fechar" ou clicando fora do popup

> A ficha nutricional vem da mesma etiqueta usada no site de congelados (procura pela etiqueta vinculada ao produto e, se não houver, pelo código). Produto sem etiqueta mostra "Ficha técnica deste produto ainda não cadastrada".

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Acessa o catálogo |
| `permissoes.categoriasComerciais` (array no perfil) | Restringe quais produtos o vendedor vê |

Se o vendedor tiver categorias comerciais definidas no seu cadastro, ele só vê produtos dessas categorias. Sem restrição = vê tudo.

---

## Depende de / Interfere em

- **Produtos** (`/admin/produtos`) — o cadastro e as fotos dos produtos vêm de lá
- **Config: Categorias de Produto** — define as categorias comerciais usadas nas pílulas e no filtro
- **Config Gerais** — define quais categorias aparecem no catálogo de vendas (`categorias_vendas`)
- **PCP — Dados Etiquetas** (`/pcp/etiquetas/dados`) — origem da tabela nutricional, ingredientes e modo de preparo mostrados no popup

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Produtos/Catalogo.jsx` | Catálogo: busca, pílulas de categoria, seções por categoria, card, popup da ficha e **modo montar catálogo personalizado** (seleção + modal cliente/condição/validade) |
| `frontend/src/services/produtoService.js` | Chamadas de API para produtos (inclui `ficha(id)`) |
| `frontend/src/services/catalogoPersonalizadoService.js` | Gerar/listar/arquivar catálogo personalizado (privado) |
| `frontend/src/pages/Site/ListaPersonalizada.jsx` + `lista.css` | Página pública da lista de preços (marca Hardt), rota `/lista/:token` |
| `backend/services/catalogoPersonalizadoService.js` | Snapshot: congela preços, gera token único, monta resposta pública |
| `backend/controllers/catalogoPersonalizadoController.js` | `gerar`, `listarMeus`, `arquivar`, `publicoPorToken` |
| `backend/routes/catalogoPersonalizadoRoutes.js` | Privado: `POST/GET/DELETE /api/catalogo-personalizado` |
| `backend/routes/catalogoPersonalizadoPublicRoutes.js` | Público: `GET /api/catalogo-personalizado-publico/:token` |
| `backend/controllers/produtoController.js` | `listar` (com filtros) e `ficha` (dados + etiqueta nutricional) |
| `backend/routes/produtoRoutes.js` | Rota `GET /produtos/:id/ficha` |

> A página antiga `frontend/src/pages/Produtos/DetalheProduto.jsx` continua existindo na rota `/produto/:id`, mas o catálogo agora abre o popup em vez de navegar para ela.
> O catálogo personalizado é um **snapshot** (tabelas `catalogos_personalizados` + `catalogos_personalizados_itens`): não referencia Produto/Cliente por FK, guarda os dados congelados do momento da geração.
