---
aba: Config — Categorias de Cliente
rota: /configuracoes/categorias-cliente
permissao: admin
---

# Config — Categorias de Cliente (Segmento)

## O que é

Cadastro de segmentos ou perfis de cliente. Exemplos: "Supermercado", "Buffet", "Pessoa Física", "Revendedor". A categoria define comportamentos padrão para o cliente: ciclo de compra esperado (em dias), se é isento de desconto Flex e se não tem limite de desconto.

---

## O que dá pra fazer aqui

- Listar todas as categorias de cliente
- Criar nova categoria
- Editar uma categoria (nome, descrição, ciclo padrão em dias, isenção de flex, sem limite de desconto)
- Excluir uma categoria
- Ativar / desativar uma categoria

---

## Campos de cada categoria

| Campo | Significado |
|-------|-------------|
| Nome | Nome do segmento (ex: Supermercado) |
| Descrição | Descrição livre |
| Ciclo Padrão (dias) | Quantos dias entre compras é considerado normal para esse segmento |
| Isento de Flex | Clientes desse segmento não consomem o Flex do vendedor ao receber desconto |
| Sem Limite de Desconto | Clientes desse segmento podem receber qualquer % de desconto |

---

## Como fazer (passo a passo real)

### Criar uma categoria nova
1. Clique em **+ Nova Categoria**
2. Preencha: nome, ciclo padrão em dias, e ative as flags se necessário
3. Salve

### Editar
1. Clique no ícone de lápis
2. Edite e salve

### Atribuir a um cliente
- No detalhe do cliente, selecione a categoria no campo correspondente
- O ciclo e as regras de desconto passam a se aplicar automaticamente

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total |

---

## Depende de / Interfere em

- **Clientes** — cada cliente pode ter uma categoria associada que define o ciclo e regras de desconto
- **Análise IA** — o ciclo de compra da categoria é usado para calcular se o cliente está em dia ou atrasado
- **Contas a Receber** — filtro disponível por categoria de cliente

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/CategoriasCliente.jsx` | Tela de gerenciamento |
| `frontend/src/services/categoriaClienteService.js` | Chamadas de API |
| `backend/src/routes/categoriasCliente.js` | Rotas do backend |
