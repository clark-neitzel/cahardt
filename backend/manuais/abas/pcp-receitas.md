---
aba: Receitas
rota: /pcp/receitas
permissao: pcp.receitas
---

# Receitas

## O que é

Uma receita define a fórmula de produção de um item: quais ingredientes usar, em quais quantidades, para render X unidades. O sistema guarda o histórico de versões — cada vez que você edita uma receita ativa, uma nova versão é criada e a anterior fica registrada com data e motivo.

Uma receita sempre produz um item do PCP (PA = Produto Acabado ou SUB = Subproduto). Os ingredientes podem ser: MP (matéria-prima), SUB (subproduto intermediário) ou EMB (embalagem).

## O que dá pra fazer aqui

- Listar receitas com filtro por status (ativa / rascunho / inativa) e busca por nome
- Criar nova receita
- Ver detalhes de uma receita: composição, versão, rendimento, perda, vigência
- Editar receita (gera nova versão automática com registro de motivo)
- Clonar uma receita para criar uma variação
- Ver o **custo** da receita: custo total e custo por unidade (por KG), calculado automaticamente
- Simular o escalonamento (calcular ingredientes para qualquer quantidade)
- Ver histórico de versões e o que mudou em cada uma
- Imprimir a receita em folha A4 para a cozinha (letra grande, ingredientes por etapa)
- Excluir receita

## Como fazer (passo a passo real)

### Criar uma nova receita

1. Clique em **Nova Receita**.
2. No campo **Item Produzido**: selecione o produto que esta receita vai fabricar. Você pode escolher:
   - Um subproduto já criado no PCP
   - Um produto do catálogo (PA) — ele será importado automaticamente para o PCP
3. Preencha o **Nome da Receita** (livre, ex: "Bolinha de Queijo Padrão").
4. Informe o **Rendimento Base**: quantas unidades (ou KG, L, etc.) esta receita produz numa batelada normal.
5. Opcional: **Perda Padrão (%)** — percentual de perda esperado no processo.
6. Escolha o **Status**: Ativa (pode ser usada em ordens) ou Rascunho (em construção).
7. Na seção **Componentes**, clique em **Adicionar** para incluir cada ingrediente. A nova linha entra **no topo da lista**, já pronta para preencher:
   - **Item**: clique no campo para abrir a **janela de busca** (um pop-up centralizado). Digite parte do nome para filtrar e clique no ingrediente desejado (MP, SUB ou EMB).
   - **Quantidade**: quanto usar por batelada
   - **Tipo**: preenchido automaticamente conforme o item (MP, SUB ou EMB)
   - **Etapa**: opcional (preparo, modelagem, fritura, cozimento, montagem, embalagem)
   - **Obs**: anotação livre por ingrediente
8. **Ordenar os ingredientes**: use as setas **↑** e **↓** no fim de cada linha para mover o ingrediente para cima ou para baixo. O número (#) à esquerda mostra a posição. Essa ordem é salva e respeitada na visualização e na impressão da receita.
9. Clique em **Criar Receita**.

> Se você escolher um produto do catálogo como ingrediente ou como item produzido, e ele ainda não existir no PCP, o sistema importa automaticamente.

> **Rascunho automático:** enquanto você digita uma receita (nova ou edição), tudo é salvo automaticamente no próprio navegador. Se atualizar a página, fechar a aba sem querer ou precisar sair, ao voltar para a mesma tela o sistema recupera o que você já tinha digitado e mostra um aviso amarelo. Há um botão **Descartar e recomeçar** para apagar o rascunho. O rascunho é apagado sozinho assim que a receita é salva com sucesso. (Obs.: por ser salvo no navegador, o rascunho fica naquele computador/navegador específico.)

### Editar uma receita ativa

1. Abra a receita e clique em **Editar**.
2. Faça as alterações.
3. Ao salvar, o sistema pede um **motivo da alteração** — obrigatório.
4. Uma nova versão é criada. A versão anterior fica com status "inativa" no histórico.
5. A tela navega automaticamente para a nova versão.

> Reordenar os ingredientes (setas ↑/↓) também conta como alteração — só essa mudança já permite salvar uma nova versão.

### Ver o histórico de versões

1. Abra qualquer receita.
2. Clique em **Histórico** (mostra o número de versões entre parênteses).
3. O histórico exibe: número da versão, status, quem alterou, quando e o motivo.
4. Para cada alteração, mostra exatamente o que mudou: campos do cabeçalho, ingredientes adicionados, removidos ou com quantidade alterada.
5. Clique em qualquer versão para abrí-la.

### Clonar uma receita

1. Abra a receita e clique em **Clonar Receita**.
2. Digite o nome da nova receita.
3. O sistema cria uma cópia com um novo subproduto intermediário.
4. A nova receita abre no modo de edição para você ajustar.

### Ver o custo da receita

Na tela de detalhe da receita o sistema mostra automaticamente:

- **Custo Total da Receita**: soma do custo de cada ingrediente (custo unitário × quantidade usada).
- **Custo por unidade (por KG)**: custo total dividido pelo rendimento, já **descontada a perda padrão** (se houver). Ex.: rendimento 100 KG com 5% de perda → o custo é dividido por 95 KG.
- Na tabela de componentes aparecem duas colunas novas: **Custo Unit.** (custo de 1 unidade do ingrediente) e **Custo** (custo daquele ingrediente na receita).

**De onde vem o custo de cada ingrediente:**

- **Matéria-prima / embalagem (MP, EMB)**: usa o **custo médio do Conta Azul** do produto. Se o CA ainda não tiver custo, usa o **custo manual** digitado no cadastro do produto (aba Produtos → abrir o produto → campo "Custo Manual"). Assim que o CA passar a ter custo, o do CA assume automaticamente.
- **Subproduto (SUB)**: o custo é calculado **a partir da própria receita do subproduto** — custo da receita dele dividido pelo rendimento dele (custo por KG). Esse valor é multiplicado pela quantidade usada. Funciona em **cascata**: uma receita usa o custo por KG do subproduto, que por sua vez vem da receita dele, e assim por diante.

> Se aparecer "sem custo" em algum ingrediente (ou um aviso amarelo), é porque aquele produto não tem custo no CA nem custo manual, ou o subproduto ainda não tem receita ativa. Cadastre o custo para o total ficar completo.

### Simular o escalonamento

A simulação calcula quantos ingredientes serão necessários para produzir uma quantidade diferente da batelada base. Disponível na tela de detalhe da receita.

1. Abra a receita e clique em **Simular Escalonamento**.
2. Escolha o modo:
   - **Por Quantidade**: informe quanto quer produzir. O sistema calcula o fator e a quantidade de cada ingrediente.
   - **Por Ingrediente Limitante**: informe qual ingrediente e quanto tem disponível. O sistema calcula o máximo que dá pra produzir.
3. O resultado mostra: fator de escala, rendimento escalado e a árvore de materiais (BOM) com ícones indicando se o estoque é suficiente ou não.

> O simulador é somente para consulta — não cria nenhuma ordem.

### Imprimir a receita para a cozinha

1. Abra a receita e clique em **Imprimir**.
2. Abre uma janela já formatada em folha **A4** (retrato), com letra grande e legível para uso na cozinha.
3. A impressão mostra: nome da receita, o que produz, rendimento, perda padrão e versão no cabeçalho; os ingredientes **agrupados por etapa** (Preparo, Modelagem, Fritura, Embalagem) com quantidade, unidade e observação de cada um; e as observações gerais da receita no rodapé.
4. A janela do navegador abre a caixa de impressão automaticamente — basta confirmar (ou salvar como PDF).

> Se nada abrir, libere os **pop-ups** do site no navegador.

## Status da receita

| Status | Cor | Significado |
|--------|-----|-------------|
| ativa | Verde | Disponível para uso em ordens de produção |
| rascunho | Amarelo | Em construção, não aparece nas ordens |
| inativa | Cinza | Versão antiga ou desativada, não pode ser usada |

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver a tela e listar receitas | `pcp.receitas` |
| Criar, editar, clonar, excluir | `pcp.receitas` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.receitas`.

## Depende de / Interfere em

- **Itens PCP**: os ingredientes e o item produzido precisam existir como itens PCP (ou ser importados do catálogo).
- **Nome do produto**: o nome do ingrediente que aparece na receita acompanha o nome do produto no catálogo. Se o nome do produto mudar (pela sincronização com a Conta Azul), o nome passa a refletir automaticamente nas receitas.
- **Ordens de Produção**: só receitas com status "ativa" aparecem ao criar uma nova ordem. Cada ordem registra qual versão da receita foi usada.
- **Simulador**: usa os dados de estoque atual de cada item para indicar se o estoque é suficiente.

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/ReceitasList.jsx` | Listagem de receitas com filtros |
| `frontend/src/pages/PCP/ReceitaForm.jsx` | Formulário de criação e edição |
| `frontend/src/pages/PCP/ReceitaDetalhe.jsx` | Detalhe, histórico, clonar, excluir |
| `frontend/src/pages/PCP/SimuladorEscalonamento.jsx` | Componente do simulador (embutido no detalhe) |
| `frontend/src/services/pcpReceitaService.js` | Chamadas de API para receitas |
