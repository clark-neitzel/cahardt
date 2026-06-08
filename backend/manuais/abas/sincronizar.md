---
aba: Sincronizar
rota: /admin/sync
permissao: admin
---

# Sincronizar

## O que é

Painel de controle da integração com o Conta Azul. Aqui você conecta (ou reconecta) o app ao CA, dispara as sincronizações manualmente e acompanha o histórico de execuções. A sincronização automática ocorre em background, mas esta tela permite acionar manualmente quando necessário.

---

## O que dá pra fazer aqui

- Ver o status da conexão com o Conta Azul (Conectado / Desconectado)
- Conectar ou reconectar ao CA via OAuth (redireciona para a tela de login do CA)
- Disparar **Sync Geral**: importa produtos, clientes e situação de pedidos do CA para o sistema
- Disparar **Sync Pedidos**: verifica pedidos que foram modificados no CA e atualiza o status no sistema
- Ver o histórico de execuções com: data, tipo, status (SUCESSO/ERRO), mensagem e quantidade de registros processados
- Inspecionar o JSON completo de qualquer execução (botão "Ver")

---

## Tipos de sync

| Tipo | O que faz |
|------|-----------|
| Sync Geral | Importa/atualiza produtos, clientes e situação de pedidos do CA |
| Sync Pedidos | Rastreia pedidos modificados no CA (aparece flag laranja na lista de Pedidos) |

---

## Como fazer (passo a passo real)

### Conectar ao Conta Azul
1. Se o status mostrar "Desconectado", clique em **Conectar**
2. O navegador redireciona para a tela de login do Conta Azul
3. Faça login com a conta da empresa no CA
4. O CA redireciona de volta para o app com o token de acesso
5. O status muda para "Conectado"

### Disparar Sync Geral
1. Certifique-se de que o status está "Conectado"
2. Clique em **Sync Geral**
3. O sistema processa em segundo plano
4. Após ~1 segundo, os logs atualizam com o resultado

### Verificar erros
1. Na lista de logs, localize execuções com status ERRO (fundo vermelho)
2. Clique em **Ver** para abrir o JSON completo
3. O erro detalhado aparece no campo "mensagem" ou nos dados da resposta

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba |

---

## Depende de / Interfere em

- **Pedidos** — o Sync Geral atualiza a situação (FATURADO, APROVADO) dos pedidos enviados
- **Produtos** — o Sync Geral importa novos produtos ou atualiza preços do CA
- **Clientes** — o Sync Geral pode atualizar dados de clientes sincronizados
- **Contas a Receber** — a situação das parcelas também pode ser atualizada pelo sync

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Sync/PainelSync.jsx` | Tela completa |
| `frontend/src/services/syncService.js` | Chamadas de API para sincronização |
| `frontend/src/services/authService.js` | Verificação de status de conexão CA |
| `backend/src/routes/sync.js` | Rotas do backend |
| `backend/src/routes/auth.js` | Callback OAuth do Conta Azul |
