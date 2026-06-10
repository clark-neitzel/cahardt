---
aba: Itens PCP (Subprodutos)
rota: /pcp/itens
permissao: pcp.itens
---

# Itens PCP (Subprodutos)

## O que é

Esta tela gerencia os **subprodutos** do PCP — itens intermediários fabricados internamente e usados como ingrediente em outras receitas. Exemplo: massa pré-preparada, recheio, cobertura.

Matérias-primas (MP), Produtos Acabados (PA) e Embalagens (EMB) **não são criados aqui**: eles vêm do cadastro de Produtos do sistema e são importados automaticamente quando você os usa pela primeira vez em uma receita.

## O que dá pra fazer aqui

- Ver a lista de subprodutos com estoque atual e mínimo (destaque vermelho quando abaixo do mínimo)
- Buscar por nome ou código
- Filtrar por status: ativos, inativos ou todos
- Criar novo subproduto
- Editar um subproduto existente
- Ativar ou desativar um subproduto

## Como fazer (passo a passo real)

### Criar um novo subproduto

1. Clique em **Novo Subproduto** (canto superior direito).
2. O sistema sugere um código automaticamente — você pode manter ou digitar outro.
3. Preencha os campos:
   - **Código**: identificação interna (obrigatório)
   - **Nome**: nome do subproduto (obrigatório)
   - **Tipo**: sempre "Subproduto" (SUB) — não é possível alterar nesta tela
   - **Unidade**: KG, UN, L, PCT, CX, G ou ML
   - **Custo Unitário**: valor por unidade (opcional, aceita 4 casas decimais)
   - **Estoque Mínimo**: quantidade mínima desejada em estoque (opcional, padrão 0)
   - **Descrição**: texto livre (opcional)
4. Clique em **Criar Subproduto**.

### Editar um subproduto

1. Na lista, clique no ícone de lápis ao lado do subproduto.
2. Altere os campos desejados.
3. Clique em **Salvar**.

> Se o item foi importado do cadastro de Produtos (tipos MP, PA ou EMB), os campos código, nome e unidade ficam bloqueados — só é possível editar estoque mínimo, custo unitário e descrição.

### Ativar ou desativar um subproduto

1. Na lista, clique no ícone de toggle (liga/desliga) ao lado do item.
2. O status muda imediatamente.
3. Itens inativos ficam esmaecidos na lista e não aparecem como opções ao criar receitas.

### Filtrar a lista

- **Busca**: pesquisa por nome ou código em tempo real.
- **Status**: dropdown para exibir Ativos / Inativos / Todos.

## Tipos de item no PCP

| Tipo | Sigla | Origem |
|------|-------|--------|
| Matéria-Prima | MP | Importado do cadastro de Produtos |
| Subproduto | SUB | Criado nesta tela |
| Produto Acabado | PA | Importado do cadastro de Produtos |
| Embalagem | EMB | Importado do cadastro de Produtos |

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a tela | `pcp.itens` |
| Criar, editar, ativar/desativar | `pcp.itens` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.itens`.

## Depende de / Interfere em

- **Receitas**: subprodutos criados aqui aparecem como opção de "item produzido" e como ingredientes ao montar receitas.
- **Estoque PCP** (`/pcp/estoque`): cada subproduto tem saldo exibido lá. Ao finalizar uma ordem de produção, o estoque do subproduto produzido aumenta.
- **Produtos (cadastro geral)**: MP, PA e EMB são importados automaticamente na primeira vez que você os seleciona numa receita.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/ItensPcp.jsx` | Listagem com filtros, toggle ativo/inativo |
| `frontend/src/pages/PCP/ItemPcpForm.jsx` | Formulário de criação e edição |
| `frontend/src/services/pcpItemService.js` | Chamadas de API para itens PCP |
