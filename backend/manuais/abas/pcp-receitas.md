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
- Simular o escalonamento (calcular ingredientes para qualquer quantidade)
- Ver histórico de versões e o que mudou em cada uma
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
7. Na seção **Componentes**, clique em **Adicionar** para incluir cada ingrediente:
   - **Item**: busque e selecione o ingrediente (MP, SUB ou EMB)
   - **Quantidade**: quanto usar por batelada
   - **Tipo**: preenchido automaticamente conforme o item (MP, SUB ou EMB)
   - **Etapa**: opcional (preparo, modelagem, fritura, cozimento, montagem, embalagem)
   - **Obs**: anotação livre por ingrediente
8. Clique em **Criar Receita**.

> Se você escolher um produto do catálogo como ingrediente ou como item produzido, e ele ainda não existir no PCP, o sistema importa automaticamente.

### Editar uma receita ativa

1. Abra a receita e clique em **Editar**.
2. Faça as alterações.
3. Ao salvar, o sistema pede um **motivo da alteração** — obrigatório.
4. Uma nova versão é criada. A versão anterior fica com status "inativa" no histórico.
5. A tela navega automaticamente para a nova versão.

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

### Simular o escalonamento

A simulação calcula quantos ingredientes serão necessários para produzir uma quantidade diferente da batelada base. Disponível na tela de detalhe da receita.

1. Abra a receita e clique em **Simular Escalonamento**.
2. Escolha o modo:
   - **Por Quantidade**: informe quanto quer produzir. O sistema calcula o fator e a quantidade de cada ingrediente.
   - **Por Ingrediente Limitante**: informe qual ingrediente e quanto tem disponível. O sistema calcula o máximo que dá pra produzir.
3. O resultado mostra: fator de escala, rendimento escalado e a árvore de materiais (BOM) com ícones indicando se o estoque é suficiente ou não.

> O simulador é somente para consulta — não cria nenhuma ordem.

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
