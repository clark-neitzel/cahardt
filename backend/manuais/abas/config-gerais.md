---
aba: Config — Configurações Gerais
rota: /admin/configuracoes
permissao: admin
---

# Config — Configurações Gerais

## O que é

Central de configurações do sistema. Agrupa todas as definições que afetam o comportamento do app: quais categorias aparecem no catálogo de vendas, os tipos de atendimento disponíveis, as origens de lead, as ações que os vendedores podem registrar e outros parâmetros de comportamento.

---

## O que dá pra fazer aqui

- Configurar quais categorias de produto aparecem no catálogo de vendas (`categorias_vendas`)
- Gerenciar os tipos de atendimento disponíveis: nome, cor, visibilidade e comportamentos
  - Obrigar observação
  - Permitir/obrigar data de retorno
  - Transferir atendimento para outro usuário
  - Abrir pedido de amostra automaticamente
  - Criar alerta visual no card do cliente
- Gerenciar as ações de atendimento (o que o vendedor pode registrar como resultado)
- Gerenciar origens de lead (como o lead chegou)
- Ver quais rotas/dias estão configurados (RotasAtivasPreview)
- Configurar parâmetros do caixa diário
- Configurar a mensagem padrão de WhatsApp para notificações

---

## Como fazer (passo a passo real)

### Configurar categorias visíveis no catálogo
1. Abra a aba Config — Configurações Gerais
2. Localize a seção de categorias de vendas
3. Selecione quais categorias de produto aparecerão no catálogo
4. Salve

### Adicionar um tipo de atendimento
1. Na seção de tipos de atendimento, clique em **+ Adicionar tipo**
2. Defina nome, cor e os comportamentos (obriga obs, permite retorno, etc.)
3. Salve

### Configurar ações disponíveis
1. Na seção de ações, clique em **+ Adicionar ação**
2. Defina: nome, cor, visibilidade e quais comportamentos especiais ativa
3. Para transferir para outro usuário: marque "Transfere atendimento" e configure responsável fixo ou a escolha do vendedor
4. Salve

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total às configurações gerais |

---

## Depende de / Interfere em

- **Catálogo** — as categorias de vendas configuradas aqui filtram o catálogo
- **Rota / Atendimentos** — os tipos de atendimento e ações disponíveis vêm daqui
- **Leads** — as origens de lead usadas no cadastro vêm daqui

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Configuracoes/Configuracoes.jsx` | Tela principal de configurações |
| `frontend/src/pages/Admin/Configuracoes/RotasAtivasPreview.jsx` | Preview das rotas configuradas |
| `frontend/src/services/configService.js` | Chamadas de API de configurações |
| `backend/src/routes/configuracoes.js` | Rotas do backend |
