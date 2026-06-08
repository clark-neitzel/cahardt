---
aba: Leads
rota: /leads
permissao: todos (vendedor vê os próprios; admin vê todos)
---

# Leads

## O que é

Gestão completa dos leads (prospecções) do sistema. Um lead é um potencial cliente ainda não cadastrado como cliente ativo. A aba exibe todos os leads com suas etapas de funil, permite editar dados, tirar fotos da fachada, converter em cliente e acompanhar o progresso da prospecção.

> A criação de novos leads também pode ser feita diretamente na aba **Rota**, no botão "+ Lead".

---

## O que dá pra fazer aqui

- Listar todos os leads com filtros de busca, etapa do funil e vendedor
- Ver cards resumidos com nome, endereço, telefone, etapa e data de cadastro
- Expandir um lead para ver detalhes completos: foto da fachada, atendimentos, histórico
- Adicionar ou trocar a foto de fachada (câmera ou galeria)
- Criar um novo lead
- Editar dados do lead (nome, endereço, telefone, dias de visita, observações)
- Referenciar o lead a um cliente existente (quando descobrir que o lead já é um cliente cadastrado)
- Mudar a etapa do funil do lead

---

## Etapas do funil

| Etapa | Cor | Significado |
|-------|-----|-------------|
| NOVO | Azul | Acabou de ser cadastrado |
| VISITA | Roxo | Já foi visitado |
| PEDIDO | Verde | Fez algum pedido |
| CONVERTIDO | Verde escuro | Virou cliente ativo |
| FINALIZADO | Cinza | Descartado ou encerrado |

---

## Como fazer (passo a passo real)

### Criar um lead novo
1. Clique no botão **+ Novo Lead**
2. Preencha: nome do estabelecimento, endereço, telefone, observações
3. Salve — o lead entra na etapa NOVO

### Ver detalhes de um lead
1. Clique na linha do lead na lista
2. O painel de detalhes expande abaixo do card
3. Você vê: foto, atendimentos registrados, dados completos e histórico

### Tirar foto da fachada
1. Expanda o lead
2. Clique em **Câmera** (abre câmera do celular) ou **Galeria** (escolhe da memória)
3. A foto é salva automaticamente

### Editar dados do lead
1. Clique no ícone de edição no card do lead
2. O modal de edição abre com todos os campos
3. Ajuste e salve

### Referenciar a um cliente existente
1. Clique no ícone de "referenciar" (ícone de pessoas)
2. O modal permite buscar e vincular o lead a um cliente já cadastrado
3. Útil quando você descobre que o lead já compra mas está cadastrado com outro nome

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios leads |
| `pedidos.clientes = "todos"` | Pode filtrar por vendedor e ver leads de toda a equipe |

---

## Depende de / Interfere em

- **Rota** — leads aparecem nos cards de rota misturados com os clientes
- **Atendimentos** — atendimentos registrados no card do lead via Rota aparecem aqui nos detalhes
- **Clientes** — ao converter, o lead vira um cliente ativo no cadastro

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Leads/ListaLeads.jsx` | Lista principal com filtros e expansão |
| `frontend/src/pages/Leads/ModalEditarLead.jsx` | Modal de edição do lead |
| `frontend/src/pages/Leads/ModalReferenciarCliente.jsx` | Modal de vinculação a cliente |
| `frontend/src/pages/Rota/ModalNovoLead.jsx` | Modal de criação (também usado na Rota) |
| `frontend/src/services/leadService.js` | Chamadas de API para leads |
