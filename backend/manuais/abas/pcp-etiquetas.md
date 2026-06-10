---
aba: Etiquetas / Dados Etiquetas
rota: /pcp/etiquetas  e  /pcp/etiquetas/dados
permissao: pcp.etiquetas
---

# Etiquetas

## O que é

Sistema de impressão de etiquetas de embalagem dos produtos Hardt. Cada etiqueta contém as informações obrigatórias do rótulo: nome do produto, informação nutricional, composição, modo de preparo, alérgenos, código de barras (EAN-13) e datas de fabricação/validade (calculada automaticamente).

Este módulo tem duas telas separadas no menu lateral, com funções distintas:

| Tela | Rota | Para quê serve |
|------|------|----------------|
| Etiquetas | `/pcp/etiquetas` | Impressão no dia a dia (chão de fábrica) |
| Dados Etiquetas | `/pcp/etiquetas/dados` | Cadastro e gestão das etiquetas |

## Sub-abas

### Etiquetas (`/pcp/etiquetas`) — tela de impressão

Tela usada na produção. Mostra todos os produtos com etiqueta ativa em cards (4 colunas), ordenados alfabeticamente.

**O que dá pra fazer:**
- Buscar produto por nome ou código (campo em destaque, com foco automático)
- Filtrar por categoria de produto (pills clicáveis, salvos no navegador)
- Selecionar um produto e abrir o modal de impressão
- Imprimir a etiqueta diretamente

**Como imprimir:**

1. Abra a tela `/pcp/etiquetas`.
2. Digite o nome ou código na barra de busca, ou clique na categoria desejada.
3. Clique no card do produto (ou no botão **Imprimir** dentro do card).
4. O modal de impressão abre com um preview da etiqueta (tamanho real 80mm × 100mm).
5. Confira ou altere a **Data de Fabricação** (padrão: hoje).
6. A **Validade** é calculada automaticamente somando os dias configurados na etiqueta.
7. Ajuste o número de **Cópias** (use os botões + / − ou digite diretamente).
8. Clique em **Imprimir** — o diálogo de impressão do navegador abre com as cópias pré-configuradas.

---

### Dados Etiquetas (`/pcp/etiquetas/dados`) — cadastro

Gerenciamento do cadastro. Permite criar, editar, ativar/inativar e remover etiquetas.

**O que dá pra fazer:**
- Listar etiquetas com busca e filtro ativo/inativo
- Criar nova etiqueta
- Editar etiqueta existente
- Imprimir diretamente da lista (ícone de impressora)
- Ativar ou inativar uma etiqueta
- Remover uma etiqueta

**Como criar uma nova etiqueta:**

1. Clique em **Nova Etiqueta**.
2. Preencha a seção **Identificação**:
   - **Código do Produto** (obrigatório)
   - **Nome do Produto** (obrigatório)
   - **Peso Unitário (g)**: peso de cada unidade
   - **Peso Tabela Nutricional / Porção (g)**: tamanho da porção usada na tabela
   - **Quantidade por Embalagem**: quantas unidades por pacote; marque "Qtd. aproximada" se necessário (exibe "APROXIMADAMENTE" na etiqueta)
   - **Código de Barras**: EAN-13 (opcional; se inválido para EAN-13, usa CODE-128)
   - **Tipo de Produto**: texto livre (ex: "Mini - Fritar")
   - **Validade (dias)**: padrão 90 dias
   - **Vincular ao Produto do Catálogo**: opcional; permite filtrar por categoria na tela de impressão
3. Preencha a seção **Informação Nutricional**: valor energético, carboidratos, proteínas, gorduras totais, saturadas, trans, fibra e sódio. Preencha no formato "34kcal (2% VD)".
4. Preencha a seção **Composição e Preparo**: ingredientes, modo de preparo e armazenamento/conservação.
5. Preencha a seção **Alérgenos**: marque os checkboxes de leite, glúten e ovo; preencha outros alérgenos e o aviso de traços se necessário.
6. Clique em **Salvar**.

> Um produto do catálogo pode ter múltiplas etiquetas (ex: versão 22g e versão 28g do mesmo produto).

**Como editar ou imprimir da lista:**

- Clique no ícone de impressora para imprimir (abre tela dedicada `/pcp/etiquetas/:id/imprimir`).
- Clique no ícone de lápis para editar.
- Clique no toggle para ativar/inativar.
- Clique no ícone de lixeira para remover permanentemente.

## O que aparece na etiqueta impressa

A etiqueta mede 80mm × 100mm e contém (nesta ordem):
1. Nome do produto (negrito, grande)
2. Código + Peso unitário em gramas
3. Tabela nutricional por porção
4. Nota de valores diários
5. "CONTÉM X UNIDADES" (ou "APROXIMADAMENTE X UNIDADES")
6. INGREDIENTES
7. Aviso de alérgenos (ALÉRGICOS: Contém leite, glúten...)
8. MODO DE PREPARO
9. Armazenamento (freezer -12°C), se preenchido
10. Código de barras EAN-13 (se cadastrado)
11. "Fabricação - DD/MM/AAAA   Validade - DD/MM/AAAA"

## Permissões necessárias

| Ação | Permissão |
|------|-----------|
| Ver e imprimir etiquetas | `pcp.etiquetas` |
| Criar, editar, remover etiquetas | `pcp.etiquetas` |

Admin (`admin: true`) tem acesso sem precisar de `pcp.etiquetas`.

> Esta é uma permissão **separada** das demais do PCP — um usuário pode ter acesso a etiquetas sem ter acesso a ordens ou receitas, e vice-versa.

## Depende de / Interfere em

- **Produtos (catálogo)**: o vínculo com produto do catálogo é opcional e só serve para ativar o filtro por categoria na tela de impressão.
- Não interfere em nenhum outro módulo do PCP (ordens, estoque, receitas).

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/EtiquetasList.jsx` | Tela de impressão: grid de cards com modal de impressão embutido |
| `frontend/src/pages/PCP/EtiquetasDados.jsx` | Tela de cadastro: listagem com ações |
| `frontend/src/pages/PCP/EtiquetaForm.jsx` | Formulário de criação/edição com todos os campos do rótulo |
| `frontend/src/pages/PCP/EtiquetaImprimir.jsx` | Tela dedicada de impressão por ID (`/pcp/etiquetas/:id/imprimir`) |
| `frontend/src/services/etiquetaService.js` | Chamadas de API para etiquetas |
