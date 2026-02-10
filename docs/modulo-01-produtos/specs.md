# Especificações Técnicas (Specs) - Módulo 01: Produtos

## 1. Banco de Dados (PostgreSQL)

### Tabela: `produtos`
Responsável por espelhar os dados do ERP.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID | Chave primária local |
| `conta_azul_id` | STRING/UUID | ID original no Conta Azul (Chave única) |
| `codigo` | STRING | Código SKU/Referência |
| `nome` | STRING | Nome do produto |
| `preco_venda` | DECIMAL(10,2) | Preço de tabela |
| `unidade` | STRING | Unidade de medida (UN, KG, etc) |
| `saldo_estoque` | DECIMAL | Estoque atual |
| `ativo` | BOOLEAN | Status de exibição no App (Default: true) |
| `created_at` | TIMESTAMP | Data de criação |
| `updated_at` | TIMESTAMP | Última atualização |

### Tabela: `produto_imagens`
Gerenciamento da galeria local.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID | Chave primária |
| `produto_id` | UUID | FK para tabela `produtos` |
| `url` | STRING | Caminho relativo/URL da imagem |
| `principal` | BOOLEAN | Se é a imagem de capa (apenas 1 por produto) |
| `ordem` | INTEGER | Ordem de exibição |

### Tabela: `sync_logs`
Histórico de sincronizações.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID | Chave primária |
| `tipo` | STRING | Ex: 'PRODUTOS', 'CLIENTES' |
| `status` | STRING | 'SUCESSO', 'ERRO' |
| `mensagem` | TEXT | Detalhes ou JSON do erro |
| `registros_processados` | INTEGER | Quantidade afetada |
| `data_hora` | TIMESTAMP | Data da execução |

---

## 2. Backend (Node.js + Express)

### Rotas (`routes/produtoRoutes.js` e `routes/syncRoutes.js`)

- **GET** `/api/produtos`
    - Filtros: `page`, `limit`, `search` (nome/código), `ativo`.
    - Retorno: Lista paginada.
- **GET** `/api/produtos/:id`
    - Retorno: Dados detalhados + array de `imagens`.
- **PATCH** `/api/produtos/:id/status` (Admin)
    - Body: `{ ativo: boolean }`
- **POST** `/api/produtos/:id/imagens` (Admin)
    - Multipart/form-data. Salva em disco (`/uploads/produtos/{id}`).
    - Cria registro em `produto_imagens`.
- **DELETE** `/api/produtos/imagens/:id` (Admin)
    - Remove arquivo e registro do banco.
- **POST** `/api/sync/produtos` (Admin)
    - Dispara serviço de sincronização com Conta Azul.

### Services (`services/contaAzulService.js` e `produtoService.js`)
- `syncProdutos()`:
    1.  Autentica/Renova token Conta Azul.
    2.  Busca produtos (`/v1/products`).
    3.  Itera e faz *Upsert* (Update ou Insert) no banco local.
    4.  Grava log em `sync_logs`.

---

## 3. Frontend (React)

### Pages
- **Vendedor**:
    - `src/pages/Produtos/Catalogo.jsx`: Grid/Lista responsiva.
    - `src/pages/Produtos/DetalheProduto.jsx`: View com carrossel.
- **Backoffice**:
    - `src/pages/Admin/Produtos/ListaProdutos.jsx`: Tabela com ações.
    - `src/pages/Admin/Produtos/GerenciarProduto.jsx`: Edição de imagens e status.
    - `src/pages/Admin/Sync/PainelSync.jsx`: Status das integrações e logs.

### Componentes (`src/components/`)
- `ProductCard`: Card resumido (Foto, Nome, Preço).
- `StatusBadge`: Indicador visual (Ativo/Inativo, Estoque Baixo).
- `ImageUploader`: Componente de Drag & Drop para upload.
