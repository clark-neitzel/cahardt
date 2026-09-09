---
aba: Config — Categorias de Produto (Comercial)
rota: /config/categorias-produto
permissao: configuracoes (ver) · admin ou Pode_Editar_Categorias_Produto (alterar)
---

# Config — Categorias de Produto (Comercial)

## O que é

Cadastro das categorias comerciais de produto. Estas categorias são usadas para organizar produtos do ponto de vista de vendas (ex: "Linha Premium", "Festas", "Produtos Orgânicos") e para controlar o acesso de vendedores: um vendedor pode ter permissão para vender apenas certas categorias.

> **Atenção:** estas são categorias comerciais criadas no sistema, diferentes das categorias fiscais do Conta Azul.

---

## O que dá pra fazer aqui

- Listar todas as categorias de produto comerciais
- Criar nova categoria
- Editar uma categoria (nome, descrição, cor, ordem de exibição)
- Excluir uma categoria (com aviso de quantos produtos ficariam sem classificação)
- Ativar / desativar uma categoria
- Configurar se a categoria permite venda fracionada
- Configurar a **Regra de Flex** da categoria comercial: Normal / Só desconto / Não contabilizar

---

## Como fazer (passo a passo real)

### Criar uma categoria nova
1. Clique em **+ Nova Categoria**
2. Preencha: nome, descrição, ordem de exibição e cor da tag
3. Marque se permite fração (ex: 0,5 unidades)
4. Salve

### Editar uma categoria
1. Clique no ícone de lápis na linha da categoria
2. Edite os campos
3. Salve

### Excluir
1. Clique no ícone de lixeira
2. Confirme a primeira pergunta ("Tem certeza que deseja excluir esta categoria?")
3. Se a categoria ainda estiver em algum produto, o sistema **recusa** e mostra quantos produtos são, avisando que eles ficariam **sem classificação comercial** (somem dos filtros, do catálogo e das restrições de categoria por vendedor) e que **não dá para desfazer**. Aí você escolhe:
   - **Cancelar** e trocar a categoria desses produtos antes (o certo na maioria dos casos); ou
   - **Excluir mesmo assim**, confirmando a segunda pergunta — só então a categoria é apagada.
4. Categoria sem nenhum produto é apagada direto, sem a segunda pergunta.

> Antes de 09/2026 a exclusão era silenciosa: a categoria sumia e todos os produtos dela perdiam a classificação comercial sem nenhum aviso. Hoje o sistema conta os produtos e pede confirmação explícita.

### "Sumiu o botão Nova Categoria / o lápis / a lixeira"
Não sumiu por defeito: quem **não** tem a permissão vê a tela em **modo somente leitura**. Nesse modo a lista continua completa, mas o botão *Nova Categoria*, o lápis (editar) e a lixeira (excluir) **não aparecem**, e no topo fica um aviso amarelo:

> **Acesso somente leitura.** Você pode consultar as categorias, mas não criar, renomear nem excluir. Peça a um administrador a permissão *"Configurações → Categorias de Produto (criar, editar e excluir)"*.

### Se aparecer "Sem permissão para alterar categorias de produto"
A mensagem completa é: *"Sem permissão para alterar categorias de produto. Peça a um administrador a permissão «Configurações → Categorias de Produto (criar, editar e excluir)»."*

Quer dizer que você **vê** a lista (todo mundo vê), mas não pode criar, renomear nem excluir. Quem libera é um administrador, em **Usuários → Permissões → Configurações → Categorias de Produto (criar/editar/excluir)**.

---

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| **Ver** a lista de categorias (aqui, nos filtros, no catálogo e na tela de produto) | Qualquer usuário logado. A tela em si fica dentro de Configurações, que exige `configuracoes.view` |
| **Criar / renomear / editar** categoria | `admin` **ou** `Pode_Editar_Categorias_Produto` |
| **Excluir** categoria | `admin` **ou** `Pode_Editar_Categorias_Produto` (+ a confirmação explícita quando há produtos vinculados) |

- `Pode_Editar_Categorias_Produto` **nasce desligada para todo mundo** e não entra em nenhum perfil rápido nem no "marcar tudo" — só se liga um a um, de propósito. Na prática, hoje só o administrador altera categoria de produto.
- Onde ligar: **Usuários → (usuário) → Permissões → seção Configurações → "Categorias de Produto (criar/editar/excluir)"** (ou procurando por "categoria" na busca do painel de permissões).
- Por que é permissão separada de "Gerenciar Configurações": mexer aqui muda a classificação comercial que o time inteiro usa; apagar uma categoria desclassifica produtos e isso não tem como desfazer.

---

## Depende de / Interfere em

- **Produtos** — cada produto pode ter uma categoria comercial associada
- **Catálogo** — vendedores com restrição de categoria comercial veem apenas produtos das categorias permitidas
- **Vendedores** — a lista `categoriasComerciais` no perfil do vendedor usa os IDs dessas categorias
- **Delivery** — categorias comerciais são usadas na configuração do Delivery para definir quais pedidos entram no Kanban

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/CategoriasProduto.jsx` | Tela de gerenciamento |
| `frontend/src/services/categoriaProdutoService.js` | Chamadas de API |
| `backend/routes/categoriasProduto.js` | Rotas do backend (GET aberto; POST/PUT/DELETE com permissão) |
| `backend/services/categoriaProdutoService.js` | Regras — inclui a contagem de produtos antes de excluir |
| `backend/middlewares/permissaoCategoriasProduto.js` | Trava de permissão das rotas de escrita |
| `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` | Onde a permissão é concedida (seção Configurações) |
