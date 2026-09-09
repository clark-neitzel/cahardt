---
aba: Produtos (Admin)
rota: /admin/produtos
permissao: admin
---

# Produtos (Admin)

## O que é

Gestão completa do cadastro de produtos da empresa. Permite criar, editar, ativar/inativar produtos e controlar as categorias. Desde 08/2026 o cadastro é **100% do app**: a categoria e o status (ativo/inativo) são editados aqui e **não são mais sobrescritos pela sincronização com o Conta Azul**. Os produtos cadastrados aqui aparecem no Catálogo de vendas, no site de congelados e podem ser adicionados aos pedidos.

---

## O que dá pra fazer aqui

- Listar produtos com filtro por nome, código, EAN, status (ativo/inativo/todos) e categorias
- Filtrar por categoria de produto (interna) e por categoria comercial
- Acessar o detalhe de cada produto para editar dados completos
- Ver imagem do produto
- **Ativar ou inativar um produto direto na tela de detalhe** (badge Ativo/Inativo no topo — clique nela ou no link "Inativar/Ativar produto"). Produto inativo some do site de congelados, dos catálogos de venda e das listas; o histórico é mantido e dá para reativar quando quiser. Na lista, produtos inativos aparecem com o selo vermelho "Inativo"
- **(09/2026) Editar o VALOR DE VENDA do produto** direto no app: na tela Gerenciar Produto, o primeiro cartão do topo ("Valor de Venda", com a tag EDITÁVEL) virou campo digitável. Digite o preço do jeito brasileiro (12,50) e clique em **Salvar e Voltar**. A **Margem** ao lado recalcula na hora, enquanto você digita, para conferir antes de salvar. A partir da primeira alteração o preço passa a ser **do app** e a sincronização com o Conta Azul **nunca mais o sobrescreve**
- **Editar a Categoria do produto** (campo "Categoria" no cartão Dados do Produto, marcado como EDITÁVEL): escolha uma categoria existente ou use "+ Criar categoria nova…" para digitar um nome novo. A categoria agrupa estoque, relatórios, margem e flex — desde 08/2026 ela é controlada no app (o sync do CA não a sobrescreve mais)
- Navegar para a tela de Sincronização (legado — o CA é somente leitura e não manda mais categoria nem status)
- **(Fase 6) Criar produto novo** pelo botão "Novo produto" (nome, código SKU, EAN, unidade, valor de venda e categoria) — desde 23/07/2026 o produto nasce **só no app** (o Conta Azul virou somente leitura e não recebe mais cadastros)
- **(Fase 6) Aba "Compras"** no detalhe do produto: histórico de compras vindo das Notas Recebidas (data, fornecedor, nota, quantidade na nota × entrada convertida, custo unitário e total). O **custo manual** do produto é atualizado por média ponderada a cada compra conferida
- **(Fase 6) Controle de estoque por produto**: no detalhe do produto (campo "Controle de estoque") escolha entre **Seguir a categoria** (padrão — vale a configuração de Categorias de Estoque), **Controlar SEMPRE** ou **NÃO controlar**. Produto que não controla estoque **continua recebendo custo e histórico de preços a cada compra** — só não movimenta quantidade (ex.: combustível, gás)
- **(08/2026) Bens do imobilizado (freezer, painel LED, móveis)**: cadastre o bem como produto normal e coloque-o numa **categoria com o toggle "Vende" desligado** (tela Categorias de Estoque). Ele passa a ter estoque e custo como qualquer produto, e **some das listas de venda** — catálogo, novo pedido e amostra recebem do servidor uma lista que já não o contém, então o vendedor não tem como encontrá-lo. *(O que ainda não existe é uma checagem na hora de gravar o pedido: quem estiver com a tela de pedido aberta desde antes da mudança precisa recarregar. Ver "Até onde a trava vai" no manual de Categorias de Estoque.)* Nesta tela de Produtos e no Histórico de Estoque ele **continua aparecendo** (é por aqui que você edita o bem) — o app pede a lista com `?incluirNaoVendaveis=1`
- **Chip "Não vendável"** na lista de produtos: o bem do imobilizado aparece com esse selo, para você distinguir de relance quem está fora da venda sem precisar abrir o produto ou conferir a categoria
- **O estoque não é mais importado do Conta Azul**: produto novo que chega pelo sync entra com estoque zerado; o saldo é formado pelas compras conferidas, ajustes manuais e saídas de faturamento — tudo dentro do app
- **(09/2026) Campo "Qtd. por caixa"** (opcional): quantos pacotes/unidades vêm numa **caixa fechada** do produto. Edita-se na tela Gerenciar Produto, no card **Inteligência Comercial** (aceita número inteiro ≥ 1 ou vazio); aparece só para consulta na ficha do produto (card Valores e Classificação, como "N un/cx"). Com o campo preenchido: no **Inventário** o botão "+10" vira "+N" (soma uma caixa por toque, com contador de caixas lançadas), no **Ajuste de Estoque** o card de escolher o produto mostra "· cx de N" ao lado do disponível, e nas **Etiquetas (PCP)** o card do produto e o topo da janela de imprimir mostram "· N un/cx". Vazio = todas as telas ficam como sempre. É só ajuda de digitação/visualização — o estoque continua contado em pacotes/unidades e **nada muda** no cálculo de estoque, nas reservas, nos pedidos nem na etiqueta impressa.

---

## Como fazer (passo a passo real)

### Buscar um produto
1. Abra a aba Produtos (Admin)
2. Use a busca para filtrar por nome, código ou EAN
3. Use as abas Ativo / Inativo / Todos para filtrar por status
4. Use os filtros de categoria para refinar ainda mais

### Editar um produto
1. Clique no nome ou na linha do produto
2. A tela de detalhe abre
3. Campos do cadastro original (nome, código, custo médio, EAN, NCM, peso, descrição) são **somente leitura**
4. Campos editáveis no app: **valor de venda**, **categoria**, **status (ativo/inativo)**, **unidade de medida**, **custo manual**, **qtd. por caixa**, categoria comercial, produto substituto, prioridade de recomendação, permitir sugestão e imagens
5. Clique em **Salvar** (botão da seção roxa "Inteligência Comercial") para gravar as alterações — exceto o ativar/inativar, que salva na hora ao confirmar

### Ativar ou inativar um produto
1. Abra o detalhe do produto
2. No topo, clique na badge **Ativo/Inativo** (ou no link "Inativar produto"/"Ativar produto" ao lado)
3. Confirme na mensagem — a mudança salva na hora, sem precisar clicar em Salvar
4. Inativo = some do site de congelados, dos catálogos e das listas de venda; nada do histórico é apagado

### Trocar ou criar a categoria de um produto
1. Abra o detalhe do produto
2. No cartão "Dados do Produto", clique no campo **Categoria** (tem a tag EDITÁVEL)
3. Escolha uma categoria da lista (dá para buscar digitando) ou clique em **"+ Criar categoria nova…"** e digite o nome
4. Clique em **Salvar e Voltar** para confirmar
5. A categoria também pode ser escolhida (ou criada) já no cadastro pelo botão "Novo produto"

### Quem pode alterar (permissão) — 09/2026

Editar produto exige a permissão **Produtos → editar** (ou ser administrador). Quem tem só **Produtos → ver** abre a tela normalmente e enxerga tudo — preço, custo, margem, estoque, imagens, promoções e histórico de compras —, mas **em modo somente leitura**:

- um aviso amarelo no topo da aba Dados explica a situação e o que pedir ao administrador;
- o **Valor de Venda** volta a ser cartão de leitura (não dá para digitar) e os demais campos ficam travados;
- os botões **Salvar e Voltar**, **Enviar** imagem (e as ações de ordem/capa/excluir), **+ Nova Promoção** e **Encerrar Promoção** não aparecem; "Cancelar" vira **Voltar**;
- a badge **Ativo/Inativo** deixa de ser clicável e o botão **Novo produto** some da lista;
- vale para **todas as abas** (Dados, Promoções e Compras).

O servidor recusa essas gravações de qualquer forma (erro 403 "Sem permissão para editar produtos"), então a tela apenas espelha o que o servidor já garante.

### Alterar o preço de venda (09/2026)
1. Produtos → clique no produto → tela **Gerenciar Produto** (aba **Dados**)
2. O primeiro cartão do topo é o **Valor de Venda**, com a tag roxa **EDITÁVEL** — clique dentro dele
3. Digite o preço como se fala: **12,50** (a vírgula do teclado). No computador, o ponto do teclado numérico também vira vírgula sozinho. Só entram números — letras e símbolos são ignorados, e o campo aceita no máximo **dois centavos**
4. Enquanto você digita, o cartão **Margem** (ao lado) recalcula na hora — é a conferência antes de salvar
5. Clique em **Salvar e Voltar**. O aviso verde confirma o preço gravado ("Salvo! Valor de venda: R$ 12,50")
6. Se o servidor recusar o preço, aparece **a mensagem do próprio servidor** em vermelho (ex.: "Valor de venda inválido: informe um número maior ou igual a zero.") e **nada é gravado** — corrija e salve de novo
7. **A partir da primeira alteração, o preço é do app**: o produto fica marcado como preço local e a sincronização com o Conta Azul **não sobrescreve mais** esse valor. Reenviar o mesmo preço não muda nada
8. Toda alteração de preço fica **gravada no servidor**: quem mudou, a data e a hora, e de quanto para quanto (ex.: *"Preço de venda de X alterado de R$ 44,87 para R$ 63,21 por Fulano"*). **Ainda não existe tela para consultar esse registro** — hoje quem precisa saber quem mexeu no preço pede ao administrador/suporte, que lê direto no banco. O registro é gravado desde já, então a consulta cobre também as alterações feitas antes de a tela existir
9. Na **ficha do produto** (Produtos → visualizar) o valor de venda continua **só de leitura** — o lugar de editar o preço é a tela Gerenciar Produto, uma só, para não haver dois caminhos diferentes
10. Onde o preço novo aparece: catálogo de vendas, novo pedido, **conferência do Caixa** (é o preço-base sobre o qual entra o acréscimo da tabela do cliente), listas personalizadas (catálogo personalizado) e cálculo de margem. No **Kit Festa** e no **site de congelados** o preço novo só vale para os produtos que **não** têm preço próprio cadastrado nessas telas — onde existe preço específico, ele continua mandando. **Pedidos já lançados não mudam** — eles guardam o preço do momento da venda

### Custo do produto (Receita × Custo Médio CA × Custo Manual)
- **Custo pela Receita (PCP)**: se o produto está vinculado a um item do PCP com **receita ativa**, o custo exibido no detalhe do produto é o **custo calculado pela receita** (ingredientes + perda ÷ rendimento) — ele **substitui qualquer outro custo** na tela e é o usado no cálculo da margem. O cartão de custo passa a mostrar "Custo (Receita)".
- **Custo Médio CA**: vem do Conta Azul, somente leitura. Vale quando o produto **não tem receita ativa**. É também o custo usado dentro do cálculo das receitas do PCP (custo dos ingredientes).
- **Custo Manual**: campo editável no app, usado como **reserva** — só entra no lugar do custo do CA **quando o CA ainda não tem custo** para aquele produto. Assim que o Conta Azul passar a ter um custo, ele assume automaticamente e o manual fica de reserva.
- Use o Custo Manual para produtos que ainda não têm custo no CA, para que o custo das receitas que usam esse produto não fique incompleto.
- **Zerar custo do CA (botão)**: no detalhe do produto, abaixo do campo Custo Manual, quando o produto **tem custo do CA e não tem receita ativa** aparece o botão **"Zerar custo do CA — usar o Custo Manual"**. Ele descarta o custo vindo do Conta Azul (útil quando o custo do CA está errado e não dá mais para corrigir lá): o app passa a valer o **Custo Manual**, que é atualizado automaticamente por média ponderada a cada **entrada de compra** conferida no app. A sincronização com o CA **não traz o custo antigo de volta**. O cartão de custo passa a mostrar "Custo (App)". Dá para desfazer pelo botão "Voltar a usar o custo do CA" (o custo do CA retorna no próximo sync). Produto com receita ativa não mostra o botão — o custo da receita já prevalece.

### Alterar a unidade de medida
1. Abra o detalhe do produto
2. No bloco "Valores e Classificação", o campo **Unidade** está editável (ex.: UN, KG, CX)
3. Digite a unidade desejada e clique em **Salvar** na seção roxa abaixo
4. Importante: a unidade é gerenciada **somente no app** — ela **não** é importada nem sobrescrita pela sincronização com o Conta Azul. Desde 09/2026 o **preço de venda também é do app** (editável no cartão Valor de Venda); o custo médio continua vindo do CA; **o ESTOQUE não é mais importado do CA** — o controle de quantidade é 100% do app (entradas pelas compras das Notas Recebidas e ajustes manuais, saídas pelo faturamento).

### Adicionar/trocar imagem
- Na tela de detalhe, há a seção de imagens
- Clique no ícone de câmera para enviar nova foto
- O produto passa a ter imagem no catálogo e nos cards da Rota

### Sincronizar com o Conta Azul
- Clique no link "ir para Sincronização" no topo da lista
- Na tela de Sync, importe os produtos do CA para o sistema

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total ao gerenciamento de produtos |
| `Produtos → ver` | Abre a aba Produtos (menu e tela). Só de leitura: consulta, busca, ficha do produto e histórico de compras |
| `Produtos → editar` | **Obrigatória para qualquer alteração (09/2026)**: criar produto, alterar o **preço de venda**, categoria, unidade, custo manual, qtd. por caixa, ativar/inativar e trocar imagem |
| `Produtos → editar` (aba **Promoções**) | Também obrigatória para **criar e encerrar promoção** (09/2026). Promoção define o preço com que o produto sai no pedido, então vale a mesma trava do preço. **Ver** a promoção continua liberado para todo mundo — o vendedor precisa enxergar o preço promocional para montar o pedido |

> **Mudou em 09/2026:** até então o servidor deixava passar **qualquer pessoa que tivesse o bloco "Produtos" no cadastro**, mesmo com "editar" desligado — inclusive quem era só de leitura; e a aba **Promoções** aceitava de qualquer usuário logado. Com o preço de venda virando editável no app, isso foi corrigido: agora o servidor exige mesmo o **Produtos → editar**, e quem não tem recebe o aviso *"Sem permissão para editar produtos. Peça a um administrador a permissão Produtos → editar"*. Quem já tinha o "editar" ligado **não perdeu nada**. Para liberar alguém: Usuários → o usuário → Permissões → Produtos → ligar **editar**.

---

## Depende de / Interfere em

- **Catálogo** — os produtos ativos aparecem no catálogo de vendas
- **Pedidos** — produtos cadastrados aqui são usados nos pedidos
- **Conta Azul** — códigos e dados fiscais vêm da sincronização com o CA
- **Config: Categorias de Produto** — as categorias comerciais usadas para filtrar no catálogo
- **PCP** — os produtos de tipo PA (produto acabado) são gerenciados nas receitas do PCP
- **Estoque** — o controle de estoque por categoria afeta quais produtos têm saldo gerenciado

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Produtos/ListaProdutos.jsx` | Lista com filtros e paginação |
| `frontend/src/pages/Produtos/DetalheProduto.jsx` | Tela de detalhe e edição |
| `frontend/src/pages/Admin/Produtos/GerenciarProduto.jsx` | Formulário completo de criação/edição (admin) |
| `frontend/src/services/produtoService.js` | Chamadas de API para produtos |
| `backend/src/routes/produtos.js` | Rotas do backend |
