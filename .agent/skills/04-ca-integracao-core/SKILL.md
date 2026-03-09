---
name: 04-ca-integracao-core
description: "🚨 NÚCLEO CONTA AZUL E OAUTH. Obrigatório ler antes de mexer em qualquer comunicação HTTP, Tokens 401 ou Sincronização Massiva. Ensina a usar o _axiosGet obrigatório."
---

# 04 CA INTEGRACAO CORE
> ⚠️ **DOCUMENTO MESTRE**: Este documento é a consolidação das antigas skills: contaazul-autenticacao, fluxo-dados-sync.



-------------------------------------------------
## CONTEÚDO ORIGINAL DE: contaazul-autenticacao
-------------------------------------------------

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

### Como renovar (Endpoint V2 COGNITO - OBRIGATÓRIO)

**CRÍTICO [FEV/2026]:** Os tokens atuais do Conta Azul operam sob o padrão JWT (Cognito). A API legada (`api.contaazul.com`) NÃO aceitará renovar esses tokens e retornará `invalid_client`. **Sempre use `auth.contaazul.com`**.

**POST** `https://auth.contaazul.com/oauth2/token`

**Headers Obrigatórios:**
*   `Authorization`: `Basic base64(client_id + ":" + client_secret)` -> Exigência exclusiva do novo endpoint auth!
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

### API Base URL (CRÍTICO)
**URL Base da API:** `https://api-v2.contaazul.com`

**IMPORTANTE [FEV/2026]:** A API base é EXCLUSIVAMENTE `api-v2.contaazul.com`. A API legada (`api.contaazul.com`) foi descontinuada para contas novas (Cognito). Usar o endpoint legado com tokens novos resultará em erro 401 Unauthorized imediato e impossível de reverter.

**Endpoints OBRIGATÓRIOS (V2):**
- **Produtos**: `https://api-v2.contaazul.com/v1/produtos` (paginação: `?pagina=X&tamanho_pagina=Y`)
- **Clientes (Pessoas)**: `https://api-v2.contaazul.com/v1/pessoas` (paginação: `?pagina=X&tamanho_pagina=Y`)
- **Vendas (Busca)**: `https://api-v2.contaazul.com/v1/venda/busca` -> NÃO USE `/v1/vendas` da API antiga.
- **Vendas (Criar)**: `https://api-v2.contaazul.com/v1/venda`

### 6. Governança: Estabilidade e Segurança (Token Rotation)

**CRÍTICO:** A Conta Azul utiliza **Refresh Token Rotation**. Isso significa que a cada refresh, o token antigo é invalidado.

**Regras de Ouro:**
1. **Mutex / Locking:** É OBRIGATÓRIO usar um mecanismo de trava (mutex) para impedir que múltiplas requisições tentem renovar o token simultaneamente. Se dois requests tentarem usar o mesmo `refresh_token` ao mesmo tempo, um deles falhará e invalidará o token para todos.
2. **Safe Rotation:** Nem sempre a API retorna um novo `refresh_token`. O código deve checar: se vier `null`, MANTENHA o antigo. Se vier novo, SUBSTITUA.
3. **Logs Detalhados:** Todo fluxo de auth deve logar o status, e qualquer erro 401 deve desencadear um log de erro crítico com o corpo da resposta.

---

## 6. Referências Oficiais & Endpoints (Documentação V2)

*   **Authorize URL**: `https://auth.contaazul.com/login`
*   **Token URL**: `https://auth.contaazul.com/oauth2/token`
*   **Escopos**: `openid profile aws.cognito.signin.user.admin`

### Parâmetros de URL Autorização
O endpoint de login Cognito exige parâmetros estritos:
`https://auth.contaazul.com/login?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&state={RANDOM_STRING}&scope=openid+profile+aws.cognito.signin.user.admin`

---

## Checklist de Robustez

- [ ] Lógica de renovação verifica o tempo antes de cada chamada.
- [ ] O novo `refresh_token` retornado na renovação é salvo no banco (sobrescrevendo o anterior).
- [ ] Tratamento de erro: Se o refresh falhar, marcar status como "Desconectado" no banco para a UI saber.
- [ ] Cron Job (Opcional): Um job a cada 45min que apenas chama `getValidToken()` para garantir que o token esteja sempre fresco, mesmo se ninguém usar o sistema.

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: fluxo-dados-sync
-------------------------------------------------

# Fluxo de Sincronização (Sync)

O sistema mantém uma cópia local dos dados do ERP (Conta Azul) para performance e funcionamento offline/híbrido.

## Estrutura

1.  **Origem**: API Real do Conta Azul (`contaAzulService.js`).
2.  **Destino**: Banco de Dados PostgreSQL (Prisma).
3.  **Lógica**: `Upsert` (Update or Insert) com comparação de timestamps.

## Regras de Negócio

### Produtos - Sincronização Incremental ⚡

**Estratégia de Performance:**

O sistema implementa **sincronização incremental** para otimizar chamadas de API e reduzir tempo de sync em ~96%:

1. **Busca lista completa** de produtos (`GET /v1/produtos`)
   - Retorna apenas: `id`, `nome`, `codigo_sku`, `status`, `categoria`, `ultima_atualizacao`
   
2. **Compara timestamps** localmente
   - `ultima_atualizacao` (Conta Azul) vs `contaAzulUpdatedAt` (banco local)
   - Usa `Map` para lookup O(1)

3. **Busca detalhes** apenas quando necessário
   - Produto novo (não existe localmente)
   - Produto alterado (timestamps diferentes)
   - **Ignora** produtos com timestamp igual

4. **Salva timestamp** para próxima comparação
   - Usa timestamp da **lista**, não dos detalhes
   - Garante consistência entre comparação e salvamento

**Performance:**
- Sem mudanças: ~5 segundos (0 chamadas de detalhes)
- Com mudanças: ~1-2 minutos (N chamadas, onde N = produtos alterados)
- Ganho: **96% mais rápido** quando não há alterações

**Chave de Ligação:** `contaAzulId` (UUID vindo do ERP)

**Campos Sincronizados:**
- **Identificação**: `nome`, `codigo`, `ean`, `ncm`
- **Preços**: `valorVenda`, `custoMedio`
- **Estoques**: `estoqueDisponivel`, `estoqueReservado`, `estoqueTotal`, `estoqueMinimo`
- **Detalhes**: `unidade`, `categoria`, `descricao`, `status`, `pesoLiquido`
- **Timestamp**: `contaAzulUpdatedAt` ⚠️ **CRÍTICO** - para sync incremental

**Campos Locais (Não sobrescritos):**
- `ativo` - Controle local de visibilidade no app
- `imagens` - Imagens customizadas localmente

**Mapeamento Crítico (API v2):**
```javascript
// ⚠️ ATENÇÃO: Campos estão DENTRO de objetos aninhados
const dadosProduto = {
  valorVenda: p.estoque.valor_venda,      // NÃO p.valor_venda
  custoMedio: p.estoque.custo_medio,      // NÃO p.custo_medio
  estoqueMinimo: p.estoque.minimumStock,  // camelCase! NÃO estoque_minimo
  ncm: p.fiscal?.ncm?.codigo,             // Aninhado em fiscal.ncm
  unidade: p.fiscal?.unidade_medida?.descricao,
  contaAzulUpdatedAt: itemList.ultima_atualizacao  // Da LISTA, não dos detalhes
};
```

### 4. Logging Robusto (OBRIGATÓRIO)
Todo processo de sincronização DEVE implementar logs detalhados salvos no banco de dados (`SyncLog`).

**Regras de Log:**
1.  **Request/Response:** Em caso de erro, salvar URL, Método, Status Code e Body da resposta.
2.  **Transparência:** O usuário final deve conseguir ver o motivo Exato da falha no painel (ex: mensagem de erro da API).
3.  **Auditoria:** Manter histórico de execução com duração e contagem de registros.

### Clientes
- Chave de Ligação: `Documento` (CPF/CNPJ) ou `UUID` (se disponível).
- Campos Sincronizados: Nome, Fantasia, Endereço, Contatos.
- Campos Locais:
    - **Dados Operacionais**: Dia de Entrega, Dia de Venda, GPS, Observações.
    - Estes campos **NÃO** devem ser sobrescritos pelo Sync se estiverem vazios na origem.

## Scripts de Sync
- Localizados em `backend/scripts/`.
- Ex: `sync_clientes_manual.js`, `populate_manual.js`.
- **Atenção**: Scripts manuais rodam no contexto da máquina host. Certifique-se que o banco está acessível (localhost vs docker service name).

-------------------------------------------------
## SINCRONIZAÇÃO BIDIRECIONAL DE PEDIDOS (CA ↔ App)
-------------------------------------------------

> 🚨 **CRÍTICO**: Esta seção foi consolidada em FEV/2026 após bugs graves. Leia antes de tocar em `contaAzulService.js`.

## Arquitetura do Sync de Pedidos

Há 3 componentes independentes que trabalham juntos:

| Componente | Arquivo | Frequência | Função |
|---|---|---|---|
| `syncPedidosModificados` | `contaAzulService.js` | **Auto 15min** | Detecta alterações/exclusões no CA via busca por `data_alteracao` |
| Garbage Collector (GC) | `contaAzulService.js` | **Dentro do sync** | Pinga individualmente pedidos RECEBIDO para confirmar existência no CA |
| Worker de Fila | `syncPedidosService.js` | **A cada 30s** | Envia para o CA pedidos locais com statusEnvio='ENVIAR' |

**Auto-sync configurado em `index.js`:**
```javascript
// Roda a cada 15 minutos automaticamente (não precisa de botão)
setTimeout(_runSyncPedidos, 120000);  // 2min após start
setInterval(_runSyncPedidos, 900000); // depois a cada 15min
```

---

## 🚨 ARMADILHA CRÍTICA: Estrutura diferente entre endpoints CA

O GET individual de venda e o endpoint de busca retornam estruturas **diferentes**. Confundir isso causa marcar todos os pedidos como EXCLUIDO erroneamente.

### Endpoint de Busca (`/v1/venda/busca`)
```json
{
  "id": "87464009-...",
  "situacao": { "nome": "APROVADO", "descricao": "Aprovado" },
  "total": 470,
  "numero": 12
}
```

### Endpoint GET por ID (`/v1/venda/{id}`) — ESTRUTURA DIFERENTE!
```json
{
  "cliente": { "uuid": "...", "nome": "..." },
  "venda": {
    "id": "87464009-...",
    "situacao": { "nome": "APROVADO", "descricao": "Aprovado" },
    "numero": 12
  },
  "vendedor": { "id": "...", "nome": "..." }
}
```

**CÓDIGO CORRETO no GC para ler situacao:**
```javascript
// ✅ CORRETO — situacao está dentro de resCA.data.venda
const vendaObj = resCA.data?.venda || resCA.data; // fallback compatibilidade
const situacaoRaw = vendaObj?.situacao;
const situacaoNome = (typeof situacaoRaw === 'object' ? situacaoRaw?.nome : situacaoRaw) || null;

// ❌ ERRADO — retorna undefined no GET /venda/{id}
const situacaoNome = resCA.data?.situacao?.nome; // NUNCA FAZER ISSO NO GC
```

---

## Garbage Collector (GC) — Regras

O GC detecta pedidos excluídos ou cancelados silenciosamente no CA.

### Configuração Atual (Escalável)
```javascript
const pedidosLocaisAtivos = await prisma.pedido.findMany({
    where: { statusEnvio: 'RECEBIDO', idVendaContaAzul: { not: null } },
    orderBy: { contaAzulUpdatedAt: 'asc' }, // Mais antigos primeiro (rotação)
    take: 20  // MÁXIMO 20 por ciclo — não alterar para cima sem análise
});
```
**Por que 20?** Com rate limit de 10 req/s, 20 pings = ~3s. Com sync a cada 15min → 2.880 pedidos/dia verificados. Suficiente para qualquer volume.

### Lógica de Detecção de Excluído

| Resposta CA | Situação | Ação |
|---|---|---|
| `404` ou `400` | Pedido deletado definitivamente | Marcar EXCLUIDO |
| `200` com `situacao.nome = null` | Soft-delete via interface CA | Marcar EXCLUIDO |
| `200` com `situacao.nome = 'CANCELADO'` | Cancelado explicitamente | Marcar EXCLUIDO |
| `200` com situacao válida (APROVADO etc.) | Ativo | Não fazer nada |
| `401` | Token expirado | Refresh e continuar |

---

## findFirst no syncPedidosModificados — REGRA CRÍTICA

**NUNCA usar OR [idVendaContaAzul, numero] em uma única query.** Isso causa falsos positivos quando há vários pedidos com o mesmo número (pedidos de teste + pedido real).

**CORRETO — em duas etapas:**
```javascript
// PRIORIDADE 1: Match exato pelo CA ID (sem ambiguidade)
let pedidoLocal = await prisma.pedido.findFirst({
    where: { idVendaContaAzul: venda.id },
    include: { itens: true }
});

// PRIORIDADE 2: Fallback por numero SOMENTE se o pedido nunca foi ao CA
if (!pedidoLocal && venda.numero) {
    pedidoLocal = await prisma.pedido.findFirst({
        where: { numero: venda.numero, idVendaContaAzul: null },
        include: { itens: true }
    });
}
```

---

## Restauração de Status (EXCLUIDO → RECEBIDO)

Quando o GC tem bug e marca pedido ativo como EXCLUIDO, o `syncPedidosModificados` restaura automaticamente:

```javascript
// Se CA diz que está ativo mas local está EXCLUIDO (ex: GC bugado)
if (pedidoLocal.statusEnvio === 'EXCLUIDO' && !isCanceladoV2) {
    await prisma.pedido.update({
        where: { id: pedidoLocal.id },
        data: {
            statusEnvio: 'RECEBIDO',
            situacaoCA: venda.situacao?.nome || null,
            revisaoPendente: true,
            contaAzulUpdatedAt: dataAtualizacaoCA
        }
    });
    console.log(`🔄 [Sync CA] Pedido #${pedidoLocal.numero} RESTAURADO: EXCLUIDO → RECEBIDO`);
}
```

---

## Rate Limits da CA (Verificado 2026)

- **600 chamadas por minuto** por conta conectada
- **10 por segundo** por conta conectada
- Sem webhook disponível — usar polling com `data_alteracao_de` (estratégia oficial da CA)

---

## 📥 IMPORTAÇÃO DE PEDIDOS ÓRFÃOS (CA → App) — MAR/2026

Quando um pedido existe no CA mas não tem correspondente local, o `syncPedidosModificados` cria o pedido localmente com **enriquecimento completo**:

| Dado | Origem | Comportamento |
|---|---|---|
| Vendedor | `GET /v1/venda/{id}` → campo `id_vendedor` | Vinculado pelo UUID local se existir |
| Condição de Pagamento | `condicao_pagamento.tipo_pagamento` + `opcao_condicao_pagamento` | Mapeado na `TabelaPreco` local → salva `nomeCondicaoPagamento` |
| Itens | `GET /v1/venda/{id}/itens` | Produto vinculado por `contaAzulId`. `flexGerado` calculado vs `valorVenda` local |
| Histórico do Cliente | `clienteInsightService.recalcularCliente()` | Disparado via `setImmediate` após criação |

### Campo `nomeCondicaoPagamento` (CRÍTICO — MAR/2026)

O modelo `Pedido` agora persiste o **nome completo da condição** (`nome_condicao_pagamento`) no momento da criação. Isso evita lookup reverso ambíguo quando múltiplas condições têm o mesmo `opcaoCondicao`.

**Prioridade de exibição (caixa, embarques, entregas):**
```javascript
// 1º: nome salvo direto no pedido (novos pedidos pós-mar/2026)
// 2º: lookup por chave composta tipoPagamento|opcaoCondicao (pedidos antigos)
// 3º: opcaoCondicaoPagamento bruto como fallback
const nomeCondicao = e.nomeCondicaoPagamento
    || mapaCondicoes[`${e.tipoPagamento}|${e.opcaoCondicaoPagamento}`]
    || e.opcaoCondicaoPagamento;
```

**Migration SQL (Update 33 do migrationService):**
```sql
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "nome_condicao_pagamento" TEXT;
```