---
aba: Clientes
rota: /clientes
permissao: todos (admin vê todos; vendedor vê os próprios)
---

# Clientes

## O que é

Cadastro completo de clientes da empresa. Permite consultar, filtrar, editar dados de cada cliente e realizar ações em lote como reatribuir vendedor, mudar dia de entrega ou dia de venda. É também por aqui que se acessa o detalhe do cliente com todas as informações financeiras, fiscais e de contato.

---

## O que dá pra fazer aqui

- Listar clientes com filtros de busca (nome, CNPJ, cidade), dia de entrega, dia de venda, vendedor, condição de pagamento e condição permitida
- Alternar entre abas "Ativos" e "Inativos"
- Selecionar clientes em lote e atualizar: vendedor, dia de entrega, dia de venda e formas de atendimento
- Abrir o popup de inadimplência do cliente (valores vencidos, parcelas em aberto)
- Entrar no detalhe do cliente para editar cadastro completo
- Sincronizar dados do cliente com o Conta Azul

---

## Como fazer (passo a passo real)

### Buscar um cliente
1. Abra a aba Clientes
2. Use o campo de busca (por nome, cidade ou CNPJ)
3. Use os filtros de dia, vendedor ou condição para refinar

### Ver inadimplência
1. Localize o cliente na lista
2. Clique no ícone de alerta (triângulo vermelho) na linha do cliente
3. O modal abre com total vencido, parcelas e detalhes de cada nota

### Editar um cliente
1. Clique na linha do cliente para abrir o detalhe
2. Na tela de detalhe, edite os campos desejados (nome, endereço, telefone, dias de visita, condição padrão, etc.)
3. Salve — os dados são gravados no sistema e podem ser sincronizados com o Conta Azul

### Alterar dados em lote
1. Marque o checkbox de um ou mais clientes
2. Um botão de "Ações em lote" aparece no topo
3. Escolha o campo para alterar: vendedor, dia de entrega, dia de venda ou formas de atendimento
4. Confirme — o sistema atualiza todos os selecionados de uma vez

---

## Filtros disponíveis

| Filtro | Descrição |
|--------|-----------|
| Busca | Nome fantasia, razão social, CNPJ ou cidade |
| Vendedor | Filtra por vendedor responsável |
| Dia de Entrega | Dia da semana em que o motorista entrega |
| Dia de Venda | Dia da semana em que o vendedor visita |
| Condição Padrão | Condição de pagamento padrão do cliente |
| Condição Permitida | Filtra por condição que o cliente tem autorizado |
| Ativos / Inativos | Aba de seleção no topo |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios clientes |
| `admin` | Vê todos os clientes e pode fazer tudo |
| `pedidos.clientes = "todos"` | Pode filtrar por vendedor |

---

## Depende de / Interfere em

- **Rota** — os clientes desta lista aparecem nos cards da Rota
- **Pedidos** — condição de pagamento padrão pré-preenche o formulário de pedido
- **Conta Azul** — cadastro do cliente pode ser sincronizado com o CA (nome, CNPJ, endereço)
- **Config: Categorias de Cliente** — as categorias definem ciclo padrão e regras de flex/desconto

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Clientes/ListaClientes.jsx` | Lista principal com filtros e ações em lote |
| `frontend/src/pages/Clientes/DetalheCliente.jsx` | Tela de detalhe e edição do cliente |
| `frontend/src/services/clienteService.js` | Chamadas de API para clientes |
| `backend/src/routes/clientes.js` | Rotas do backend |
