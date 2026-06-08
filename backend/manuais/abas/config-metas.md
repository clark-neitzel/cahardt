---
aba: Config — Metas de Vendas
rota: /configuracoes/metas
permissao: admin ou Pode_Gerenciar_Metas
---

# Config — Metas de Vendas

## O que é

Cadastro e gestão das metas mensais de vendas por vendedor. Para cada vendedor e mês, é possível definir: meta financeira mensal, limite de Flex, dias de trabalho configurados, metas por produto e por cidade, e metas de promoções. Os dados desta tela alimentam diretamente o Dashboard.

---

## O que dá pra fazer aqui

- Ver todas as metas do mês selecionado
- Navegar entre meses
- Criar nova meta para um vendedor
- Editar uma meta existente (clicando no ícone de lápis)
- Excluir uma meta
- Ver resumo: meta financeira, flex, dias configurados, produtos e cidades com meta

---

## Como fazer (passo a passo real)

### Criar meta para um vendedor
1. Selecione o mês de referência no seletor de data
2. Clique em **+ Nova Meta**
3. Selecione o vendedor
4. Preencha:
   - Valor mensal (meta financeira)
   - Flex Mensal (limite de desconto flex)
   - Dias de trabalho (quais dias da semana o vendedor trabalha)
   - Metas por produto: produto + quantidade ou valor alvo
   - Metas por cidade: cidade + valor alvo + dias de visita
   - Metas de promoção: nome da promoção + valor alvo
5. Salve

### Ver metas de outro mês
- Clique no seletor de mês e escolha o mês desejado

### Editar uma meta
1. Clique no ícone de lápis na linha da meta
2. Edite os campos no modal
3. Salve

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou `Pode_Gerenciar_Metas` | Pode criar, editar e excluir metas |
| Todos os usuários | Podem ver suas próprias metas no Dashboard |

---

## Depende de / Interfere em

- **Dashboard** — as metas definidas aqui são exibidas no dashboard do vendedor como barra de progresso
- **Vendedores** — o Flex Mensal configurado aqui é diferente do Flex Disponível no cadastro do vendedor (este é o limite mensal para descontos)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/Metas/GerenciarMetas.jsx` | Tela principal |
| `frontend/src/pages/Configuracoes/Metas/MetaFormModal.jsx` | Modal de criação/edição |
| `backend/src/routes/metas.js` | Rotas do backend |
