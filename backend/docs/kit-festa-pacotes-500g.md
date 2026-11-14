# Pacotes 500 g no Kit Festa

Os pacotes da linha G-MINI 500 g entram no **mesmo pedido** do Kit Festa, como complemento, com preço fixo do catálogo (R$ 15,00 quando cadastrado assim). Eles **não** entram no mínimo de caixas do pedido nem no `minCaixas` do cupom.

## Como cadastrar (aba Kit Festa dos pedidos online)

1. Abra **Pedidos online → Kit Festa → Produtos**.
2. Em **Categorias do site**, crie a categoria **Congelados**. O slug precisa ficar `congelados`.
3. Busque cada um dos 6 produtos G-MINI 500 g e adicione ao site.
4. Em cada um:
   - **Categoria** = Congelados
   - **Preço Kit Festa** = `15,00` (não deixe em branco: o sistema usaria o `valorVenda` do produto, que não é R$ 15)
   - **Unidades por caixa** = `1` (não deixe 25)

O sistema identifica um item como **pacote** se **qualquer** uma for verdadeira:

- a categoria tem slug `congelados` (ou contém `congelado`);
- `unidadesPorCaixa === 1`.

Por isso vale cadastrar as duas coisas (categoria + unidades = 1).

## O que muda no site e na aprovação

- O site ganha a seção **Congelados**, com o rótulo **pacote 500 g** (em vez de “caixa de 25”).
- O mínimo de 4 caixas conta só as caixas do Kit Festa.
- Na conversão para Pedido, o preço unitário do catálogo Kit Festa é gravado e **não é recalculado** pela condição 4003 (Avista-Kit Festa) na tela de Pedidos.
- Pedidos em horário cheio (via Ana) chegam com a marca `[ENCAIXE]` nas observações: só valem depois da confirmação da equipe.
- Na fila, o botão **Criar cadastro com os dados do pedido** pré-preenche o cliente com nome, CPF/CNPJ, telefone e o endereço que a Ana tiver coletado. A equipe completa o que faltar (cidade da lista oficial, dia de venda, dia de entrega, tabela e vendedor).
