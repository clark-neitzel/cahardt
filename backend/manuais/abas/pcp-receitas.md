---
aba: PCP — Receitas
rota: /pcp/receitas
permissao: admin ou acesso ao módulo PCP
---

# PCP — Receitas

## O que é

Cadastro das receitas de produção. Uma receita define "o que é preciso para fabricar X unidades de um produto": quais ingredientes (itens PCP), em quais quantidades. O sistema mantém versões das receitas, então é possível ter uma receita ativa e outras como rascunho ou inativa.

---

## O que dá pra fazer aqui

- Listar receitas com filtro por nome, item produzido e status
- Criar nova receita
- Ver detalhes de uma receita: composição de ingredientes, versão, status
- Editar receita (criar nova versão ou editar rascunho)
- Ativar, inativar ou manter como rascunho

---

## Status de receita

| Status | Cor | Significado |
|--------|-----|-------------|
| ativa | Verde | Usada nas ordens de produção |
| inativa | Cinza | Desativada, não pode ser usada |
| rascunho | Amarelo | Em construção, ainda não finalizada |

---

## Como fazer (passo a passo real)

### Criar uma receita
1. Clique em **+ Nova Receita**
2. Selecione o item que essa receita produz (item PCP)
3. Dê um nome para a receita e defina a quantidade padrão por batelada
4. Adicione os ingredientes (componentes): selecione cada item PCP e informe a quantidade
5. Defina o status (ativa / rascunho)
6. Salve

### Ver composição de uma receita
1. Clique no card da receita
2. A tela de detalhe mostra: item produzido, versão, status e tabela de ingredientes com quantidades

### Editar / criar nova versão
- Na tela de detalhe, edite os campos e salve
- O sistema pode criar uma nova versão automaticamente dependendo da configuração

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Gerencia receitas |

---

## Depende de / Interfere em

- **PCP — Itens** — os ingredientes da receita são itens PCP (MP, SUB, PA, EMB)
- **PCP — Ordens de Produção** — as ordens usam as receitas ativas para definir o consumo de materiais
- **PCP — Sugestões** — o sistema usa as receitas para calcular quantas bateladas produzir

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/ReceitasList.jsx` | Lista de receitas |
| `frontend/src/pages/PCP/ReceitaDetalhe.jsx` | Detalhe e edição da receita |
| `frontend/src/services/pcpReceitaService.js` | Chamadas de API |
| `backend/src/routes/pcp/receitas.js` | Rotas do backend |
