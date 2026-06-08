---
aba: Mensagens Agendadas
rota: /admin/mensagens-agendadas
permissao: admin
---

# Mensagens Agendadas

## O que é

Configuração de mensagens automáticas enviadas via WhatsApp para os vendedores em horários e dias específicos. Existem dois tipos: mensagens de **meta** (resumo de progresso do vendedor no dia) e mensagens de **atendimento** (lembrete ou cobrança sobre os atendimentos do dia). O sistema dispara automaticamente conforme a configuração.

---

## O que dá pra fazer aqui

- Listar todas as configurações de mensagens agendadas
- Criar nova configuração (vendedor + tipo + hora + dias da semana)
- Editar configuração existente
- Excluir uma configuração
- Disparar uma mensagem manualmente agora (para testes ou uso emergencial)
- Pré-visualizar o texto que seria enviado antes de disparar

---

## Tipos de mensagem

| Tipo | O que envia |
|------|-------------|
| meta | Resumo do progresso do vendedor no dia (pedidos, valor, meta) |
| atendimento | Cobrança ou lembrete sobre atendimentos registrados no dia |

---

## Como fazer (passo a passo real)

### Criar uma nova mensagem agendada
1. Clique em **+ Nova Mensagem**
2. Selecione o vendedor destinatário
3. Escolha o tipo (meta ou atendimento)
4. Defina a hora de envio (ex: 18:00)
5. Marque os dias da semana
6. Ative/desative a configuração
7. Salve

### Disparar uma mensagem agora (teste)
1. Localize a configuração na lista
2. Clique no ícone de "play" (disparar)
3. A mensagem é enviada imediatamente para o vendedor
4. O resultado aparece como toast (sucesso ou falha)

### Pré-visualizar o texto
1. Localize a configuração
2. Clique no ícone de olho (preview)
3. O texto que seria enviado aparece em uma modal

### Buscar
- Use o campo de busca no topo para filtrar por nome do vendedor

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba |

---

## Depende de / Interfere em

- **Vendedores** — as mensagens são enviadas para o telefone cadastrado no perfil do vendedor
- **Dashboard / Metas** — o conteúdo da mensagem de meta usa os dados do dashboard do vendedor
- **Atendimentos** — o conteúdo da mensagem de atendimento usa os registros do dia

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/MensagensAgendadas/MensagensAgendadas.jsx` | Tela completa |
| `frontend/src/services/mensagemAgendadaService.js` | Chamadas de API |
| `backend/src/routes/mensagensAgendadas.js` | Rotas do backend |
