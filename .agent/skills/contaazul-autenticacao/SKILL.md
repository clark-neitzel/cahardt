---
name: contaazul-autenticacao
description: "Guia completo de Autenticação OAuth 2.0 na Conta Azul, cobrindo fluxo de autorização, troca de código e, crucialmente, a estratégia de renovação (Refresh Token) para manter a conexão ativa indefinidamente."
---

# Conta Azul OAuth 2.0 - Guia de Implementação Robusta

Este documento detalha como manter uma integração "viva" com a Conta Azul, focando na renovação de tokens para evitar desconexões.

## 1. Visão Geral do Fluxo

O fluxo OAuth 2.0 da Conta Azul funciona em três etapas principais:

1.  **Solicitação de Código (Authorization Code)**: O usuário é redirecionado para a Conta Azul, faz login e autoriza o app.
2.  **Troca de Código por Tokens (Access & Refresh)**: O app recebe um `code` temporário e o troca por um `access_token` (curta duração) e um `refresh_token` (longa duração).
3.  **Renovação de Acesso (Refresh Token Flow)**: Antes do `access_token` expirar, o app usa o `refresh_token` para obter um novo par de tokens.

---

## 2. Tipos de Token e Validade

| Token | Validade Típica | Função |
| :--- | :--- | :--- |
| **Access Token** | **60 minutos (1 hora)** | Usado no Header `Authorization: Bearer <token>` para chamar a API. |
| **Refresh Token** | **60 dias (aprox.)*** | Usado **EXCLUSIVAMENTE** para gerar novos Access Tokens. |

*> Nota: A validade do Refresh Token é reiniciada a cada uso se a opção "Refresh Token Rotation" estiver ativa (padrão em muitos provedores OAuth modernos, verificar comportamento específico da CA).*

---

## 3. Renovando o Access Token (O segredo da conexão eterna)

Para que a conexão nunca se perca, o sistema deve renovar o token **automaticamente** antes de ele expirar, sem intervenção do usuário.

### Quando renovar?
O ideal é implementar uma margem de segurança. Se o token dura 60 minutos, renove-o aos **50 minutos** ou **55 minutos**.

### Como renovar (Endpoint)

**POST** `https://api.contaazul.com/oauth2/token`

**Headers:**
*   `Authorization`: `Basic base64(client_id + ":" + client_secret)`
*   `Content-Type`: `application/x-www-form-urlencoded`

**Body:**
```
grant_type=refresh_token
refresh_token=<SEU_REFRESH_TOKEN_SALVO_NO_BANCO>
```

**Resposta de Sucesso (HTTP 200):**
```json
{
  "access_token": "novo_access_token_xyz...",
  "refresh_token": "novo_refresh_token_abc...", // IMPORTANTE: Algumas APIs giram esse token também!
  "expires_in": 3600
}
```

### ⚠️ Regra de Ouro: Salvar o NOVO Refresh Token
A cada renovação, a Conta Azul pode retornar um **novo** `refresh_token`. Você **DEVE** salvar esse novo token no banco, substituindo o antigo. Se você tentar usar o token antigo novamente, a API rejeitará e a conexão será perdida.

---

## 4. Estratégia de Implementação no Código

### A. Armazenamento Seguro (Banco de Dados)
Tabela: `ContaAzulConfig` (ou `integracao_tokens`)
*   `access_token` (Text)
*   `refresh_token` (Text)
*   `expires_in` (Int) - Segundos, ex: 3600
*   `updated_at` (DateTime) - Hora que o token foi gerado.

### B. Lógica de "Get Token" (Middleware ou Service)

Sempre que for fazer uma chamada à API (ex: `syncProdutos`), **NÃO** use o token do banco diretamente. Chame uma função `getValidToken()` que faz o seguinte:

1.  Busca token e `updated_at` no banco.
2.  Calcula: `TempoDecorrido = Agora - updated_at`.
3.  Se `TempoDecorrido > 55 minutos` (3300 segundos):
    *   Chama endpoint de Refresh.
    *   **Se der sucesso**: Atualiza `access_token` E `refresh_token` no banco. Retorna novo token.
    *   **Se der erro (400/401)**: O refresh expirou ou foi revogado. Loga erro crítico e alerta admin (aqui sim o botão "Conectar" é necessário).
4.  Se `TempoDecorrido <= 55 minutos`:
    *   Retorna token do banco.

---

## 5. Configuração VERIFICADA e Funcionando (IMPORTANTE)

**⚠️ ESTA É A CONFIGURAÇÃO QUE FUNCIONA PARA ESTE PROJETO. NÃO ALTERAR.**

### Credenciais
- **Client ID**: `6f6gpe5la4bvg6oehqjh2ugp97`
- **Client Secret**: `1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls`

### Endpoints (Legacy/Cognito)
- **Authorization URL**: `https://auth.contaazul.com/login`
- **Token URL**: `https://auth.contaazul.com/oauth2/token`
- **Redirect URI**: `https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback`

### URL Completa de Autorização
```
https://auth.contaazul.com/login?response_type=code&client_id=6f6gpe5la4bvg6oehqjh2ugp97&redirect_uri=https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback&state=ESTADO&scope=openid+profile+aws.cognito.signin.user.admin
```

### Scope Correto
`openid+profile+aws.cognito.signin.user.admin`

**NOTA CRÍTICA**: Este projeto usa credenciais Legacy/Cognito, NÃO o endpoint moderno `api.contaazul.com/auth/authorize`. O scope `sales` NÃO funciona neste endpoint.

---

## 6. Referências Oficiais & Endpoints (Documentação Genérica)

*   **Authorize URL**: `https://api.contaazul.com/auth/authorize`
*   **Token URL**: `https://api.contaazul.com/oauth2/token`
*   **Escopos**: Verifique se o escopo `sales` está incluso para pedidos e produtos.

### Parâmetros de URL Autorização
`client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=sales&state={RANDOM_STRING}&response_type=code`

---

## Checklist de Robustez

- [ ] Lógica de renovação verifica o tempo antes de cada chamada.
- [ ] O novo `refresh_token` retornado na renovação é salvo no banco (sobrescrevendo o anterior).
- [ ] Tratamento de erro: Se o refresh falhar, marcar status como "Desconectado" no banco para a UI saber.
- [ ] Cron Job (Opcional): Um job a cada 45min que apenas chama `getValidToken()` para garantir que o token esteja sempre fresco, mesmo se ninguém usar o sistema.
