# PRD - Módulo 01: Produtos

## 1. Visão Geral
Este módulo é responsável pelo gerenciamento do catálogo de produtos do aplicativo Hardt Salgados. Ele deve manter o cadastro de produtos sincronizado com o ERP Conta Azul, permitindo que vendedores consultem itens atualizados (preço, estoque, imagens) e que a administração gerencie a ativação e galeria de fotos.

## 2. Requisitos Funcionais

### 2.1. Sincronização com Conta Azul
- **Sync de Produtos**:
    - O sistema deve buscar produtos da API do Conta Azul.
    - Campos obrigatórios: Código, Nome, Valor Unitário, Saldo em Estoque (calculado/buscado), Código de Barras (GTIN), NCM.
    - O sync deve ser incremental (apenas modificados) ou total (forçado).
    - Logs de execução devem ser salvos em banco (`sync_logs`).
    - Imagens cadastradas no App **não** devem ser sobrescritas pelo sync do ERP.

### 2.2. Gestão de Produtos (Backoffice)
- **Listagem**: Visualizar todos os produtos com busca e filtros (Ativo/Inativo, Categoria).
- **Detalhamento**: Ver informações completas do produto.
- **Ativação**: Admin pode ativar ou inativar um produto manualmente no App (independente do ERP).
- **Galeria de Imagens**:
    - Upload de múltiplas imagens por produto.
    - Definição de imagem principal (capa).
    - Exclusão e ordenação de imagens.

### 2.3. Catálogo (App Vendedor)
- **Listagem Mobile**: Interface otimizada para celular.
    - Exibir: Foto Principal, Nome, Código, Preço e Estoque Disponível.
    - Busca rápida por nome ou código.
- **Detalhe do Produto**:
    - Carrossel de imagens.
    - Botão "Adicionar ao Pedido" (Visual apenas nesta etapa).

## 3. Regras de Negócio
1.  **Imutabilidade**: Dados fiscais e cadastrais (Nome, Código, Preço Base) vêm **exclusivamente** do Conta Azul. O App não edita esses campos.
2.  **Imagens**: O Conta Azul não envia imagens. O gerenciamento de mídia é 100% local no App.
3.  **Estoque**: O estoque exibido deve ser o real retornado pelo ERP (ou cacheado na última sincronização).

## 4. Perfil de Acesso
- **Vendedor**: Apenas visualização (Leitura).
- **Admin/Interno**: Visualização, Gestão de Imagens e Execução de Sync.
