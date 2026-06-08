---
aba: PCP — Estoque (PCP)
rota: /pcp/estoque
permissao: admin ou acesso ao módulo PCP
---

# PCP — Estoque (PCP)

## O que é

Posição de estoque dos itens que fazem parte do processo de produção: matérias-primas (MP), subprodutos (SUB), produtos acabados (PA) e embalagens (EMB). Diferente do Estoque de vendas, este painel foca em itens do PCP e permite ajustes manuais de entrada e saída.

---

## O que dá pra fazer aqui

- Ver estoque de todos os itens PCP com quantidade atual e estoque mínimo
- Filtrar por tipo de item (MP, SUB, PA, EMB) e por nome
- Ver apenas itens abaixo do estoque mínimo (alerta)
- Registrar entrada ou saída manual de estoque (ajuste)
- Ver quais itens precisam de reposição

---

## Tipos de item

| Tipo | Significado |
|------|-------------|
| MP | Matéria-Prima (ex: farinha, açúcar) |
| SUB | Subproduto intermediário |
| PA | Produto Acabado (controlado aqui pelo PCP) |
| EMB | Embalagem (caixa, saco, etc.) |

---

## Como fazer (passo a passo real)

### Ver itens em falta
1. Marque a opção **Abaixo do mínimo** nos filtros
2. A lista mostra apenas os itens com estoque atual menor que o mínimo
3. Itens críticos ficam com destaque visual

### Registrar entrada (compra/produção)
1. Clique no ícone de ajuste na linha do item
2. O modal abre
3. Selecione o tipo **ENTRADA**
4. Informe a quantidade e uma observação (opcional)
5. Salve

### Registrar saída (uso / descarte)
1. Clique no ícone de ajuste
2. Selecione **SAÍDA**
3. Informe quantidade e observação
4. Salve

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Visualiza e ajusta estoque PCP |

---

## Depende de / Interfere em

- **PCP — Ordens** — ao finalizar uma ordem, os consumos baixam os estoques automaticamente
- **PCP — Sugestões** — itens abaixo do mínimo geram sugestões de produção
- **PCP — Itens** — os subprodutos têm seu estoque gerenciado aqui

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/EstoquePcp.jsx` | Tela principal de estoque PCP |
| `frontend/src/services/pcpEstoqueService.js` | Chamadas de API |
| `backend/src/routes/pcp/estoque.js` | Rotas do backend |
