---
aba: Vendedores (Usuários)
rota: /admin/vendedores
permissao: admin
---

# Vendedores (Usuários)

## O que é

Gerenciamento de todos os usuários do sistema (chamados de "vendedores", mas incluem motoristas, escritório e qualquer pessoa com acesso). Aqui se configura: limites de Flex, alerta de faturamento, formas de atendimento visíveis, permissões detalhadas e status ativo/inativo.

---

## O que dá pra fazer aqui

- Listar todos os usuários (ativos e inativos)
- Buscar por nome
- Editar: e-mail, telefone, Flex Mensal, Flex Disponível, % máximo de desconto Flex
- Ativar ou inativar um usuário
- Configurar quais formas de atendimento aparecem para o vendedor (Presencial, WhatsApp, Telefone)
- Ligar/desligar alerta de faturamento por WhatsApp
- Abrir o modal de permissões para configurar as permissões detalhadas do usuário

---

## Como fazer (passo a passo real)

### Editar dados de um vendedor
1. Clique no ícone de lápis na linha do vendedor
2. Campos editáveis aparecem: e-mail, telefone, Flex Mensal, Flex Disponível, % Desc.
3. Salve com o ícone de check

### Configurar permissões
1. Clique no ícone de escudo (permissões) na linha do vendedor
2. O modal de permissões abre com todas as flags disponíveis
3. Marque/desmarque conforme necessário
4. Salve

### Ativar ou inativar
- Clique no ícone de usuário com X (inativar) ou com check (reativar)
- Confirme o alerta — usuários inativos não conseguem acessar o sistema

### Configurar formas de atendimento visíveis
- Clique nos botões de forma (Presencial, WhatsApp, Telefone) no card do vendedor
- As formas marcadas aparecem como opção no modal de atendimento da Rota para aquele vendedor
- A mudança é salva automaticamente

### Ligar/desligar alerta de faturamento
- Clique no ícone de sino na linha do vendedor
- Quando ativo, o vendedor recebe notificação por WhatsApp quando um pedido é faturado no CA

---

## Permissões disponíveis (exemplos principais)

| Permissão | Função |
|-----------|--------|
| `admin` | Acesso total ao sistema |
| `Pode_Aprovar_Especial` | Aprova pedidos especiais |
| `Pode_Aprovar_Bonificacao` | Aprova bonificações |
| `Pode_Excluir_Pedido` | Exclui pedidos normais |
| `Pode_Fazer_Devolucao` | Registra devoluções |
| `Pode_Executar_Entregas` | Aparece como motorista nos embarques |
| `Pode_Editar_Caixa` | Acessa caixas de outros vendedores |
| `Pode_Gerenciar_Metas` | Cria e edita metas de vendas |
| `Pode_Ver_Dashboard_Admin` | Vê o painel gerencial do dashboard |
| `Pode_Editar_Veiculos` | Cadastra e edita veículos |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba |

---

## Depende de / Interfere em

- **Rota** — as formas de atendimento configuradas aqui aparecem no modal de atendimento
- **Caixa / Embarque** — a flag `Pode_Executar_Entregas` define quem aparece como motorista
- **Metas** — Flex Mensal e Flex Disponível são usados nas validações de desconto nos pedidos
- **Dashboard** — `Pode_Ver_Dashboard_Admin` habilita o painel gerencial

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Vendedores/ListaVendedores.jsx` | Tela principal |
| `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` | Modal de permissões |
| `frontend/src/services/vendedorService.js` | Chamadas de API |
| `backend/src/routes/vendedores.js` | Rotas do backend |
