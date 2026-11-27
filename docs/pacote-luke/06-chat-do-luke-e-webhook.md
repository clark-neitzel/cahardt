---
title: "Especificação — Chat do Luke e webhook (CA-Hardt)"
subtitle: "Webhook de solicitações e chat interno no app, com foto, áudio e PDF"
date: "27/11/2026"
lang: pt-BR
---

# Especificação — Chat do Luke e webhook (CA-Hardt)

**Versão:** 1.0 · 27/11/2026 · **Para:** desenvolvedor do CA-Hardt · **Aprovação:** Clarkson Neitzel
**Repositório:** `clark-neitzel/cahardt` (backend Node/Express/Prisma, Postgres, deploy no EasyPanel)
**Ambientes:** frontend `https://cahardt-github.xrqvlq.easypanel.host` · backend `https://cahardt-hardt-backend.xrqvlq.easypanel.host`

> Este documento descreve **o que construir**. Não altera o fluxo que já está no ar: o Luke lê o que está liberado; o que ele tenta gravar vira pedido em **Admin → Solicitações**; o dono autoriza e o sistema executa na hora, em nome do Luke. Onde o nome de tabela ou campo é **novo**, está marcado como **(novo)**.

---

## 1. Contexto e objetivo

O Luke já trabalha pela API `/api/agente/v1`. Quando uma gravação volta **202 `AGENTE_PEDE_AUTORIZACAO`**, o pedido já está na fila do Clarkson. Sem um aviso automático, o Luke só vê o resultado quando consulta a solicitação de novo.

Esta entrega faz duas coisas, no mesmo fio:

1. O CA-Hardt **chama um webhook** quando uma solicitação muda de status, e também quando alguém manda mensagem no chat do Luke. Assim o Luke confere e segue o trabalho na hora.
2. O app ganha um **chat interno com o Luke**, no lugar do clipe que hoje fica embaixo da tela. Cada usuário conversa só com o Luke; o admin vê o histórico de todos. Dá para mandar texto, foto (câmera ou galeria), áudio e PDF.

O caso de uso que o Clarkson descreveu, e que a tela precisa acertar de primeira:

> Uma pessoa na rua abre o aplicativo, toca no Luke embaixo, tira foto do comprovante de pagamento, escreve “lança esse pagamento” e manda.

O Luke recebe o webhook, lê o anexo pela API, cria o lançamento (que cai em Solicitações) e responde no próprio chat. Se a gravação precisar de autorização, a mensagem fica com o estado “aguardando autorização” e um link para o pedido.

---

## 2. Princípios (inegociáveis)

1. **Não redesenhar a API de agentes nem o fluxo de Solicitações.** Reaproveitar `/api/agente/v1`, o 202 com `solicitacaoId` e URL de consulta, e a tela Admin → Solicitações.
2. **Gravação financeira continua passando pela autorização do dono.** O chat não é um atalho para gravar direto. O Luke responde no chat; se precisar lançar, o pedido vai para a fila, como hoje.
3. **Chave e token só no header**, nunca na URL, no corpo, no git, em print ou no chat. Vale para o token do agente e para o segredo do webhook.
4. **Nenhum valor de segredo neste documento, em log, em resposta de API ou em issue.** O `LUKE_WEBHOOK_SECRET` o Clarkson copia do painel da rotina do Luke no app Grok Bot e cola no EasyPanel.
5. **LGPD:** anexo não tem URL pública. Download só autenticado (JWT do dono da conversa ou admin, ou token do agente). Cada usuário vê só a própria conversa. Dado real de cliente/fornecedor não vai para PR, teste ou issue.
6. **Não quebrar o que funciona.** Nenhuma tela financeira, rota de solicitação ou regra de autorização muda de comportamento. Chat e webhook são módulo novo. Se o Luke bater numa tela que ainda só deixa admin gravar, o pedido autorizado continua podendo voltar 403 — isso já é conhecido e não é resolvido aqui.
7. **O envio no app não depende do webhook estar no ar.** A mensagem e o anexo são gravados primeiro. Se o POST do webhook falhar, o evento fica no log para nova tentativa. O usuário não recebe erro vermelho só porque o Luke está indisponível; a mensagem permanece “enviado” até o webhook confirmar, e então passa a “Luke processando”.

---

## 3. O que já existe (não mexer no contrato)

Comportamento atual, que esta spec apenas observa:

| Passo | O que acontece |
|---|---|
| Leitura | `GET` nas rotas liberadas de `/api/agente/v1` (e as demais já abertas ao agente) responde na hora. |
| Gravação | `POST`/`PATCH`/`PUT`/`DELETE` **não executa**. Responde **202** com código `AGENTE_PEDE_AUTORIZACAO`, `solicitacaoId` e a URL para consultar o pedido. O pedido já entra na fila; o Luke **não reenvia**, só consulta o resultado depois. |
| Autorização | O dono (ou quem ele autorizar) aprova, recusa ou deixa expirar em **Admin → Solicitações**. Se autorizar, o sistema executa na hora, em nome do Luke. |
| Depois da execução | A consulta à solicitação devolve o status final: `AUTORIZADA`, `REJEITADA`, `EXPIRADA` ou `ERRO`. |

O webhook `solicitacao.atualizada` dispara **depois** dessa mudança de status, para o Luke não precisar ficar consultando.

Quando o Luke criar uma solicitação a partir de uma mensagem do chat, ele envia o header opcional `X-Origem-Conversa` (e, se tiver, `X-Origem-Mensagem`) na chamada de gravação. O backend grava esse vínculo no pedido. Ver seção 6.6.

---

## 4. Webhook de saída (CA-Hardt → Luke)

### 4.1 Destino e segredo

O CA-Hardt faz `POST` JSON para o webhook do Luke. A URL oficial é:

```
https://api2.cursor.sh/automations/webhook/75b35a0d-7033-50a9-a4d2-7db8f172a9ee
```

Configuração no **EasyPanel**, no serviço do **backend**, aba Environment:

| Variável | Função |
|---|---|
| `LUKE_WEBHOOK_URL` | URL de destino. Colar a URL acima. Em branco = webhook desligado (os eventos ainda entram no log, com status `DESLIGADO`, e podem ser reenviados quando a URL for preenchida). |
| `LUKE_WEBHOOK_SECRET` | Segredo de assinatura. O Clarkson **copia do painel da rotina do Luke no app Grok Bot** e cola aqui. Em branco = webhook desligado. **Nunca** devolver este valor em API, log, tela ou backup de configuração visível. |
| `LUKE_WEBHOOK_AUTH` | Opcional. `hmac` (padrão) ou `bearer`. Ver 4.2. |

Não hardcodar a URL no código: ler da env. A URL deste documento é o valor a ser colado, não um segredo.

Sem URL ou sem segredo, o chat e as solicitações continuam funcionando. Só não há aviso em tempo real para o Luke.

### 4.2 Assinatura

O corpo enviado é exatamente o JSON UTF-8 do evento (sem reformatar entre assinar e transmitir). Duas formas são aceitas; a padrão é a HMAC.

**Padrão (`LUKE_WEBHOOK_AUTH=hmac` ou ausente):** header no estilo GitHub, HMAC-SHA256 do **corpo cru**:

```
X-Hub-Signature-256: sha256=<hex>
```

O `<hex>` é o HMAC-SHA256 de `LUKE_WEBHOOK_SECRET` sobre os bytes crus do body, em minúsculas. Comparação no destino é em tempo constante. Encaminhar também:

| Header | Valor |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `X-Luke-Event` | `solicitacao.atualizada` ou `chat.mensagem` |
| `X-Luke-Delivery` | o mesmo `eventoId` do JSON (serve para o Luke deduplicar antes de ler o corpo) |
| `X-Luke-Timestamp` | Unix em segundos (UTC), do momento do envio desta tentativa |
| `User-Agent` | `CA-Hardt-Webhook/1` |

**Alternativa (`LUKE_WEBHOOK_AUTH=bearer`):** além dos headers de evento, enviar `Authorization: Bearer <LUKE_WEBHOOK_SECRET>`. Preferir HMAC: o segredo não viaja no header. Implementar as duas, escolhidas pela env, para o Luke poder verificar do jeito que o painel da rotina estiver configurado.

Se o segredo mudar no EasyPanel, os próximos envios usam o valor novo. Eventos antigos já assinados não precisam ser reassinados, a menos que sejam reenviados (aí assinam de novo, com o segredo atual, e o mesmo `eventoId`).

### 4.3 Entrega, timeout, retry e idempotência

| Regra | Valor |
|---|---|
| Método | `POST` |
| Timeout por tentativa | **10 segundos** (conexão + resposta) |
| Sucesso | qualquer **2xx** (o corpo da resposta do Luke pode ser ignorado) |
| Tentativas | 1 envio + até **4 reenvios** (5 no total) |
| Espera entre tentativas | 2s, 8s, 30s, 120s (exponencial, com um jitter pequeno, ex.: ±20%) |
| Reenviar | timeout, erro de rede, **5xx** e **429** (se vier `Retry-After`, respeitar, limitado a 5 minutos) |
| Não reenviar | **2xx** e **4xx** diferentes de 429 (assinatura recusada, URL errada etc.). Nesses casos o log fica `FALHA` com o status HTTP, para inspeção. |

O **`eventoId`** nasce uma vez, quando o evento é enfileirado, e **não muda** nos reenvios. O Luke trata a mesma `eventoId` como já processada (idempotência). Não gerar um `eventoId` novo a cada tentativa.

A fila do webhook é assíncrona: a thread que gravou a mensagem ou atualizou a solicitação não espera o POST externo. Um worker (ou a mesma fila já usada no backend, se houver) processa os envios.

Depois de esgotar as tentativas, o evento permanece `FALHA`. Precisa existir um caminho para **reenviar manualmente** (botão no admin ou rota interna), reutilizando o mesmo `eventoId`. Não precisa ser tela sofisticada na fase 1: uma ação na listagem do log basta.

### 4.4 Log de eventos enviados

Tabela nova **`luke_webhook_eventos`** (novo). Uma linha por evento (não por tentativa).

| Campo | Observação |
|---|---|
| `eventoId` | UUID, único, o mesmo do JSON e do header `X-Luke-Delivery` |
| `tipo` | `solicitacao.atualizada` \| `chat.mensagem` |
| `status` | `PENDENTE`, `ENVIADO`, `FALHA`, `DESLIGADO` |
| `tentativas` | quantas vezes o POST foi de fato disparado |
| `httpStatus` | da última tentativa, se houve resposta |
| `ultimoErro` | recorte curto (até 300 caracteres). **Sem** segredo, token ou corpo de anexo |
| `proximoTryEm` | quando a próxima tentativa está marcada |
| `solicitacaoId`, `conversaId`, `mensagemId` | os que se aplicarem, para filtrar o log |
| `payloadResumo` | JSON pequeno (ids, tipo, status da solicitação). Não guardar o arquivo nem o body inteiro se ele incluir dado demais; o body completo pode ficar só enquanto `PENDENTE`, se precisar reenviar, e ser aparado depois do sucesso |
| `criadoEm`, `enviadoEm` | timestamps com fuso |

Nunca gravar `LUKE_WEBHOOK_SECRET`, token do agente, Authorization ou a assinatura. Tela de log só para admin.

### 4.5 Evento `solicitacao.atualizada`

Dispara quando uma solicitação do agente muda para `AUTORIZADA`, `REJEITADA`, `EXPIRADA` ou `ERRO`. Não é obrigatório disparar na criação (`PENDENTE`): o Luke já recebe o 202 com o `solicitacaoId`.

```json
{
  "eventoId": "8e1c2b70-6a4d-4f3a-9c1e-2b7f0d4a91c3",
  "tipo": "solicitacao.atualizada",
  "enviadoEm": "2026-11-27T18:15:02-03:00",
  "solicitacao": {
    "id": "c0a1b2d3-1111-4222-8333-444455556666",
    "status": "AUTORIZADA",
    "resumo": "Alterar um fornecedor — inativar TESTE-LUKE NOVO (apagar)",
    "atualizadoEm": "2026-11-27T18:15:01-03:00",
    "autorizadoPor": { "id": "uuid-do-usuario", "nome": "Clarkson Neitzel" },
    "consultaUrl": "/api/agente/v1/solicitacoes/c0a1b2d3-1111-4222-8333-444455556666",
    "conversaId": "aa000000-0000-4000-8000-000000000001",
    "mensagemId": "bb000000-0000-4000-8000-000000000002",
    "erro": null
  }
}
```

| Campo | Regra |
|---|---|
| `status` | Um de `AUTORIZADA`, `REJEITADA`, `EXPIRADA`, `ERRO` |
| `resumo` | O mesmo texto curto que a fila de Solicitações já mostra (tipo da ação + identificação). Sem payload completo da entidade. |
| `autorizadoPor` | Quem autorizou ou rejeitou. `null` em `EXPIRADA` e quando não houver pessoa (ex.: expiração automática). |
| `consultaUrl` | Caminho relativo da rota de consulta que já existe para o agente. O Luke monta a URL com a base do backend. |
| `conversaId`, `mensagemId` | Preenchidos quando a solicitação nasceu de uma mensagem do chat (header `X-Origem-Conversa`). Senão, `null`. |
| `erro` | Em status `ERRO`, objeto `{ "codigo", "mensagem" }` com o que a execução devolveu (ex.: `403` de tela que ainda só deixa admin gravar). Senão `null`. |

`autorizadoPor.nome` é o nome do usuário interno, não um dado de cliente.

### 4.6 Evento `chat.mensagem`

Dispara quando **um usuário do app** envia uma mensagem no chat do Luke (texto e/ou anexos). Não dispara quando o próprio Luke responde — isso evitaria um loop.

```json
{
  "eventoId": "9f2d3c81-7b5e-4a4b-8d2f-3c8e1e5b02d4",
  "tipo": "chat.mensagem",
  "enviadoEm": "2026-11-27T18:20:11-03:00",
  "conversaId": "aa000000-0000-4000-8000-000000000001",
  "mensagem": {
    "id": "cc000000-0000-4000-8000-000000000003",
    "usuario": {
      "id": "uuid-do-usuario",
      "nome": "Maria Souza",
      "papel": "vendedor"
    },
    "texto": "Lança esse pagamento",
    "anexos": [
      {
        "id": "dd000000-0000-4000-8000-000000000004",
        "tipo": "foto",
        "mime": "image/jpeg",
        "tamanho": 245760,
        "nome": "comprovante.jpg",
        "url": "/api/agente/v1/chat/anexos/dd000000-0000-4000-8000-000000000004"
      }
    ],
    "criadoEm": "2026-11-27T18:20:10-03:00"
  }
}
```

| Campo | Regra |
|---|---|
| `usuario.papel` | O papel já usado no CA-Hardt (`admin`, `vendedor`, etc.). Não inventar taxonomia nova. |
| `texto` | Texto digitado, já aparado. String vazia ou `null` quando a mensagem for só anexo. |
| `anexos[].tipo` | `foto`, `audio`, `pdf` ou `arquivo` |
| `anexos[].url` | Caminho relativo da rota autenticada do agente (seção 6.2). **Não** é URL pública, nem link com token na query. O Luke baixa com o **mesmo token de agente no header**. |
| `anexos[].tamanho` | Bytes, número inteiro |

Áudio e PDF entram no mesmo formato; na fase 1 o app ainda não envia esses tipos, mas o contrato do webhook já os aceita.

---

## 5. Chat do Luke no app

### 5.1 Experiência (mobile-first)

O botão/ícone de **clipe** que hoje fica na parte de baixo do app (o atalho flutuante) é **substituído por um botão “Luke”**. Não deixar dois atalhos competindo no mesmo lugar. Se o Clippy (balão de ajuda) ainda existir como recurso separado, ele sai desse ponto; a entrada visível embaixo passa a ser o Luke.

Ao tocar no botão, abre o chat da pessoa logada (folha cheia no celular; painel lateral ou modal largo no desktop). A tela precisa funcionar bem em um telefone na rua, com uma mão só:

1. Abrir o app e tocar em **Luke**.
2. Tocar na câmera, fotografar o comprovante (e confirmar o recorte/preview).
3. Escrever o que precisa (“lança esse pagamento”).
4. Enviar.

Controles da caixa de composição, da esquerda para a direita (ou em um `+` que abre as opções, se o espaço for curto):

| Ação | Fase | Detalhe |
|---|---|---|
| Texto | 1 | Campo de mensagem, Enter envia no desktop; no celular o botão Enviar. |
| Tirar foto | 1 | Câmera traseira por padrão, com permissão do sistema. Depois do clique, preview e confirmação antes de anexar. |
| Escolher imagem | 1 | Galeria/`input` de arquivo de imagem. Também aceitar **colar** imagem (Ctrl+V / longo no mobile, quando o SO deixar). |
| Gravar áudio | 2 | Botão de microfone: segura ou toca para gravar, toca de novo para parar, com preview e opção de apagar antes de mandar. Mostrar duração. |
| Anexar ou colar PDF | 2 | Seletor de arquivo e colar PDF da área de transferência no desktop. |

Vários anexos na mesma mensagem são permitidos (até o limite da seção 5.6). A mensagem pode ser só anexo, só texto, ou os dois. Depois de enviada, ela aparece na conversa na hora, com o estado “enviado”.

O chat é de **uma conversa contínua por usuário** (não é uma thread nova a cada comprovante). Rola para o fim ao abrir e ao chegar mensagem nova.

### 5.2 Quem pode usar (permissão / lista de permissão)

Nova permissão por usuário, no mesmo painel de hoje (Admin → Usuários → permissões), por exemplo **`Pode_Usar_Chat_Luke`**:

- **Padrão: desligada.** Ninguém novo ganha o botão sem o admin ligar.
- Sem a permissão, o botão Luke **não aparece**, e as rotas de envio do app respondem **403**.
- O admin pode ligar pessoa por pessoa (a equipe que anda na rua, o financeiro, o próprio Clarkson).
- Aplicar perfil rápido ou “Marcar tudo / Limpar” **não** liga nem desliga esta chave, no mesmo espírito do Clippy — só o interruptor dela.
- Admin do sistema pode usar o chat (a permissão dele já entra ligada e pode ficar travada ligada, como o Clippy). Isso não se confunde com a tela de auditoria (5.4).

Quem não está na lista não aciona o webhook.

### 5.3 Histórico por usuário

- Cada usuário autenticado tem **uma** conversa com o Luke.
- Ele vê **somente** as mensagens e anexos dela.
- O histórico não expira nesta versão (não apagar automaticamente). Não precisa, na fase 1, de o usuário apagar mensagens; se quiser um “apagar a minha conversa”, fica para depois e só some da vista dele, não da vista do admin.
- Paginação para trás ao rolar (as 50 mais recentes primeiro).

### 5.4 Visão do admin

Tela somente leitura, por exemplo **Admin → Chat do Luke**, só para quem tiver permissão **`Pode_Ver_Chat_Luke_Todos`** (padrão: só perfil admin).

| Recurso | Detalhe |
|---|---|
| Lista de conversas | Usuário, papel, data da última mensagem, se há anexo, se há solicitação pendente ligada |
| Filtros | Usuário, intervalo de datas, texto, presença de anexo, estado da última mensagem |
| Detalhe | Histórico completo daquela conversa, com anexos (download autenticado) e links das solicitações |
| Somente leitura | Admin **não** escreve no lugar do usuário nem “como Luke”. Quem responde no chat é o Luke, pela API de agente. |

Esta tela entra na **fase 2**. Na fase 1 o admin já usa o próprio chat (a conversa dele) e vê as solicitações na fila de sempre.

### 5.5 Estados da mensagem

Cada mensagem (do usuário ou do Luke) tem um estado visível na bolha:

| Estado | Quando | O que a pessoa vê |
|---|---|---|
| `ENVIADO` | Gravou no servidor; webhook ainda não confirmou 2xx | “Enviado” |
| `PROCESSANDO` | Webhook de `chat.mensagem` entregue, ainda sem resposta do Luke | “Luke processando” |
| `RESPONDIDO` | O Luke já postou a resposta nesta conversa (vale para a mensagem do usuário que originou o pedido) | A resposta aparece embaixo; a mensagem original pode marcar “Respondido” |
| `AGUARDANDO_AUTORIZACAO` | A resposta do Luke (ou a mensagem original) está ligada a uma ou mais solicitações ainda `PENDENTE` | “Aguardando autorização”, com **link** para a solicitação (quem pode abrir Admin → Solicitações vai para o pedido; os demais vêem o status, sem a tela de autorização) |
| `ERRO` | Falha definitiva do webhook, ou o Luke devolveu uma resposta com status de erro, ou a solicitação ligada ficou `ERRO` / `REJEITADA` / `EXPIRADA` | Texto claro +, se houver, link da solicitação |

Transições típicas de uma mensagem do usuário: `ENVIADO` → `PROCESSANDO` → `RESPONDIDO`, ou `PROCESSANDO` → `AGUARDANDO_AUTORIZACAO` → `RESPONDIDO` (quando a solicitação é autorizada e o Luke confirma no chat). O backend pode atualizar o estado da mensagem do usuário ao gravar a resposta do Luke e ao mudar o status da solicitação vinculada. O Luke também pode mandar uma mensagem de acompanhamento (“Pronto, o pagamento foi lançado” ou “O pedido foi recusado”).

Uma mensagem do Luke nasce em `RESPONDIDO`, ou em `AGUARDANDO_AUTORIZACAO` se ela trouxer `solicitacaoIds`.

### 5.6 Anexos: tipos, limites, armazenamento e LGPD

| Tipo | MIME aceitos | Tamanho máx. | Fase |
|---|---|---|---|
| Foto / imagem | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` | 10 MB cada | 1 |
| PDF | `application/pdf` | 15 MB cada | 2 |
| Áudio | `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/aac` | 10 MB ou 5 minutos, o que ocorrer primeiro | 2 |
| Outro | recusar | — | — |

Limites extras: no máximo **5 anexos** por mensagem; no máximo **20 MB** somados. Acima disso: **413 `ANEXO_GRANDE`** ou **415 `TIPO_NAO_ACEITO`**.

Armazenamento:

- Gravar fora da pasta pública do frontend. Caminho interno em disco (ou bucket privado), no mesmo estilo dos anexos financeiros já existentes.
- Nome no disco é opaco (UUID + extensão derivada do MIME). O nome original fica só no campo `nome`, para exibir.
- **Proibido** servir por URL pública, por path previsível sem auth, ou com token na query string (`?token=`, `?key=`).
- Download: a rota confere autenticação e autorização **antes** de ler o arquivo. Se o arquivo não estiver no disco, **404 `ANEXO_PERDIDO`** (nunca 500), como já é regra de anexo no CA-Hardt.
- Thumbnail de foto é opcional na fase 1; se houver, segue a mesma regra de auth.
- Não transcrever áudio no CA-Hardt nesta versão: o Luke baixa o arquivo e transcreve do lado dele, se precisar.
- Antivírus ou checagem de magic-bytes é bem-vinda (não confiar só na extensão). PDF e imagem precisam parecer o que o MIME declara; senão 415.

Logs e auditoria não guardam o conteúdo do arquivo. Guardam `anexoId`, tipo, tamanho, usuário e data.

---

## 6. Rotas da API

Base do backend: `https://cahardt-hardt-backend.xrqvlq.easypanel.host`. Datas em ISO 8601 com fuso (horário de São Paulo, `-03:00`, quando for timestamp; `YYYY-MM-DD` se for só data).

### 6.1 Autenticação do agente

As rotas da seção 6.2 usam **o mesmo token de agente já usado em `/api/agente/v1`**, **somente no header**. Nunca na URL, no caminho ou no corpo.

- Token na query string (`?token=`, `?key=`, ou o nome do header como parâmetro) → **400 `CHAVE_NA_URL`**, **sem comparar** o valor.
- Sem token ou token inválido → **401**.
- Token válido, mas sem permissão para o chat (se o backend separar escopos) → **403 `ESCOPO_INSUFICIENTE`**.
- API de chat desligada por configuração (flag futura) → **503 `NAO_CONFIGURADA`**.

O header exato é o **mesmo das rotas atuais** de `/api/agente/v1` (não inventar um segundo esquema). Nas rotas do app (6.3 e 6.4), a auth continua sendo o **JWT do usuário** logado, como no restante do frontend.

### 6.2 Rotas do Luke (token de agente)

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/agente/v1/chat/conversas` | Lista conversas com atividade recente. Query: `atualizadasDepois` (ISO), `limit` (padrão 50, máx. 200). Item: `id`, `usuario {id,nome,papel}`, `atualizadoEm`, `ultimaMensagem {id,texto,status,criadoEm}`, `aguardandoAutorizacao`. |
| `GET` | `/api/agente/v1/chat/conversas/:conversaId` | Cabeçalho da conversa + as 50 mensagens mais recentes (ou `depoisDe` / `antesDe` + `limit` para paginar). |
| `GET` | `/api/agente/v1/chat/conversas/:conversaId/mensagens` | Só as mensagens, com anexos (metadados + `url` relativa). Query: `depoisDe`, `antesDe`, `limit`. |
| `GET` | `/api/agente/v1/chat/anexos/:anexoId` | **Binário** do arquivo (`Content-Type` do MIME gravado, `Content-Disposition` com o nome original). 404 `ANEXO_PERDIDO` ou `NAO_ENCONTRADO`. O agente pode baixar anexo de qualquer conversa do chat do Luke. |
| `POST` | `/api/agente/v1/chat/conversas/:conversaId/mensagens` | Resposta do Luke no chat. |

Corpo do `POST` de resposta:

```json
{
  "texto": "Recebi o comprovante. Abri o pedido para lançar o pagamento; ele está na fila de autorização.",
  "solicitacaoIds": ["c0a1b2d3-1111-4222-8333-444455556666"],
  "status": "AGUARDANDO_AUTORIZACAO"
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `texto` | sim | Até 8000 caracteres. Não vazio. |
| `solicitacaoIds` | não | Lista de ids **já existentes** e, de preferência, já vinculados a esta conversa. Id desconhecido → 400 `SOLICITACAO_INVALIDA`. |
| `status` | não | `RESPONDIDO` (padrão, se não houver `solicitacaoIds`) ou `AGUARDANDO_AUTORIZACAO` (padrão, se houver pendente). |

Resposta **201**:

```json
{
  "ok": true,
  "mensagem": {
    "id": "ee000000-0000-4000-8000-000000000005",
    "conversaId": "aa000000-0000-4000-8000-000000000001",
    "autor": "LUKE",
    "texto": "Recebi o comprovante. Abri o pedido para lançar o pagamento; ele está na fila de autorização.",
    "status": "AGUARDANDO_AUTORIZACAO",
    "solicitacoes": [
      {
        "id": "c0a1b2d3-1111-4222-8333-444455556666",
        "status": "PENDENTE",
        "resumo": "Criar uma conta a pagar — comprovante enviado no chat",
        "consultaUrl": "/api/agente/v1/solicitacoes/c0a1b2d3-1111-4222-8333-444455556666"
      }
    ],
    "criadoEm": "2026-11-27T18:21:04-03:00"
  }
}
```

Essa mensagem aparece no chat do usuário **em tempo real** (seção 6.5). Não dispara webhook `chat.mensagem`.

Idempotência: o `POST` de resposta aceita o mesmo mecanismo já usado na API de agentes (header `Idempotency-Key`, se já existir; senão, aceitar `Idempotency-Key` e gravar por agente + chave por 24h, devolvendo a mesma mensagem se repetir).

### 6.3 Rotas do app (JWT do usuário)

Usadas pelo frontend do chat. Só a conversa do próprio usuário.

| Método | Rota sugerida | Função |
|---|---|---|
| `GET` | `/api/chat-luke/conversa` | Abre ou devolve a conversa do usuário logado, com as mensagens recentes. Quem não tem `Pode_Usar_Chat_Luke` leva 403. |
| `GET` | `/api/chat-luke/conversa/mensagens` | Paginação (`antesDe`, `limit`). |
| `POST` | `/api/chat-luke/anexos` | Upload (`multipart/form-data`). Valida tipo e tamanho. Devolve `{ id, tipo, mime, tamanho, nome }`. O arquivo só entra numa mensagem depois do `POST` de mensagem (ou o `POST` de mensagem já leva os arquivos; os dois jeitos servem, desde que um anexo órfão expire em poucas horas). |
| `POST` | `/api/chat-luke/mensagens` | Corpo: `{ texto?, anexoIds[] }`. Pelo menos um dos dois. Grava a mensagem `ENVIADO`, enfileira o webhook `chat.mensagem`, devolve a mensagem. |
| `GET` | `/api/chat-luke/anexos/:anexoId` | Binário, só se o anexo for da conversa do usuário (ou se for admin na tela 6.4). Sem token na URL. |
| `GET` | `/api/chat-luke/stream` | Tempo real da conversa do usuário (seção 6.5). |

Os nomes podem seguir o padrão de rotas do projeto; o contrato (auth JWT, só a própria conversa, upload autenticado) é o que importa.

### 6.4 Rotas do admin (JWT, fase 2)

| Método | Rota sugerida | Função |
|---|---|---|
| `GET` | `/api/admin/chat-luke/conversas` | Lista com os filtros da seção 5.4. Exige `Pode_Ver_Chat_Luke_Todos`. |
| `GET` | `/api/admin/chat-luke/conversas/:conversaId` | Histórico completo (paginado). Somente leitura. |
| `GET` | `/api/admin/chat-luke/anexos/:anexoId` | Binário autenticado. |
| `GET` | `/api/admin/chat-luke/webhook-eventos` | Log da seção 4.4, com filtro por tipo, status e ids. |
| `POST` | `/api/admin/chat-luke/webhook-eventos/:eventoId/reenviar` | Reenvia com o mesmo `eventoId`. |

Nenhuma rota admin escreve mensagem no chat.

### 6.5 Tempo real

Quando o Luke postar uma resposta, ou quando o estado de uma mensagem/solicitação ligada mudar, o chat aberto precisa atualizar **sem a pessoa recarregar a página**.

Ordem de preferência:

1. **SSE** (`GET /api/chat-luke/stream`) — mais simples de operar atrás do proxy do EasyPanel, se o timeout de idle for ajustado; ou
2. **WebSocket**, se o projeto já tiver um; ou
3. **Polling** curto (`GET` mensagens `depoisDe=<id ou timestamp>` a cada 3–5 s enquanto o chat estiver aberto, e ao voltar o app para primeiro plano).

A fase 1 pode lançar com polling, desde que o intervalo seja baixo com o chat aberto e pare quando a tela não estiver visível. Fase 2 pode trocar para SSE/WebSocket sem mudar o contrato das mensagens.

Eventos que a tela precisa refletir: mensagem nova do Luke, mudança de status (`PROCESSANDO`, `AGUARDANDO_AUTORIZACAO`, `RESPONDIDO`, `ERRO`), e o vínculo com a solicitação (status e link).

### 6.6 Vínculo conversa → solicitação

Nas chamadas de **gravação** já existentes em `/api/agente/v1` (as que hoje devolvem 202), o Luke pode mandar:

| Header | Obrigatório | Valor |
|---|---|---|
| `X-Origem-Conversa` | não | UUID da conversa |
| `X-Origem-Mensagem` | não | UUID da mensagem do usuário que originou o pedido |

Se os ids existirem e a conversa for do chat do Luke, a solicitação criada guarda `conversaId` e `mensagemId`. Se o header vier com id inválido, a gravação **não falha**: o pedido é criado normalmente e o vínculo é ignorado (logar um aviso). Assim um header velho não bloqueia o financeiro.

O mesmo vínculo aparece:

- no webhook `solicitacao.atualizada`;
- no `GET` da solicitação (campos novos, opcionais);
- na bolha do chat (link e estado `AGUARDANDO_AUTORIZACAO`);
- na tela admin do chat, na fase 2.

Quando a solicitação mudar de status, atualizar as mensagens ligadas e avisar o stream/polling. Não exige que o Luke responda de novo, mas ele pode.

---

## 7. Modelo de dados

Nomes sugeridos; ajustar ao padrão Prisma do repositório. Campos novos em tabelas que já existem estão marcados.

```prisma
model ChatLukeConversa {                          // (novo)
  id            String   @id @default(uuid())
  usuarioId     String   @unique @map("usuario_id")
  criadoEm      DateTime @default(now()) @map("criado_em")
  atualizadoEm  DateTime @updatedAt @map("atualizado_em")
  mensagens     ChatLukeMensagem[]
  @@map("chat_luke_conversas")
}

model ChatLukeMensagem {                          // (novo)
  id          String   @id @default(uuid())
  conversaId  String   @map("conversa_id")
  autor       String   // USUARIO | LUKE | SISTEMA
  usuarioId   String?  @map("usuario_id") // quem mandou, se autor=USUARIO
  texto       String?  @db.Text
  status      String   // ENVIADO | PROCESSANDO | RESPONDIDO | AGUARDANDO_AUTORIZACAO | ERRO
  criadoEm    DateTime @default(now()) @map("criado_em")
  conversa    ChatLukeConversa @relation(fields: [conversaId], references: [id])
  anexos      ChatLukeAnexo[]
  solicitacoes ChatLukeMensagemSolicitacao[]
  @@index([conversaId, criadoEm])
  @@map("chat_luke_mensagens")
}

model ChatLukeAnexo {                             // (novo)
  id          String   @id @default(uuid())
  mensagemId  String?  @map("mensagem_id") // null enquanto órfão do upload
  tipo        String   // foto | audio | pdf | arquivo
  mime        String
  tamanho     Int
  nome        String   // nome original, só para exibir
  caminho     String   // path interno, nunca exposto
  criadoEm    DateTime @default(now()) @map("criado_em")
  expiresEm   DateTime? @map("expires_em") // para órfão
  mensagem    ChatLukeMensagem? @relation(fields: [mensagemId], references: [id])
  @@map("chat_luke_anexos")
}

model ChatLukeMensagemSolicitacao {               // (novo)
  mensagemId     String @map("mensagem_id")
  solicitacaoId  String @map("solicitacao_id")
  mensagem       ChatLukeMensagem @relation(fields: [mensagemId], references: [id])
  @@id([mensagemId, solicitacaoId])
  @@index([solicitacaoId])
  @@map("chat_luke_mensagem_solicitacoes")
}

model LukeWebhookEvento {                         // (novo)
  id            String    @id @default(uuid())
  eventoId      String    @unique @map("evento_id")
  tipo          String    // solicitacao.atualizada | chat.mensagem
  status        String    // PENDENTE | ENVIADO | FALHA | DESLIGADO
  tentativas    Int       @default(0)
  httpStatus    Int?      @map("http_status")
  ultimoErro    String?   @map("ultimo_erro")
  proximoTryEm  DateTime? @map("proximo_try_em")
  solicitacaoId String?   @map("solicitacao_id")
  conversaId    String?   @map("conversa_id")
  mensagemId    String?   @map("mensagem_id")
  payloadResumo Json?     @map("payload_resumo")
  criadoEm      DateTime  @default(now()) @map("criado_em")
  enviadoEm     DateTime? @map("enviado_em")
  @@index([status, proximoTryEm])
  @@index([tipo, criadoEm])
  @@map("luke_webhook_eventos")
}
```

Na tabela **já existente de solicitações** (a de Admin → Solicitações), acrescentar campos opcionais **(novo)**:

- `conversaId` (`String?`)
- `mensagemId` (`String?`)

Preenchidos a partir dos headers `X-Origem-Conversa` e `X-Origem-Mensagem`. Índice neles. Não tornar obrigatórios: pedidos feitos fora do chat continuam iguais.

Permissões novas no cadastro de usuários: `Pode_Usar_Chat_Luke`, `Pode_Ver_Chat_Luke_Todos`.

---

## 8. Telas

### 8.1 Botão Luke e chat (fase 1)

- Botão “Luke” no lugar do clipe de baixo, visível só com `Pode_Usar_Chat_Luke`.
- Área de mensagens, caixa de texto, câmera, galeria/colar imagem, enviar.
- Preview do anexo antes do envio, com botão de remover.
- Estados da seção 5.5 na bolha, incluindo link da solicitação.
- Vazio inicial: uma linha curta do tipo “Fale com o Luke. Pode mandar um comprovante e escrever o que precisa lançar.”
- Usável em tela de **375 px** de largura, com teclado virtual aberto (a caixa de composição permanece acessível).
- Pedir permissão de câmera só quando a pessoa tocar em fotografar.

### 8.2 Áudio e PDF (fase 2)

- Gravação de áudio com duração visível, preview e descarte.
- Anexar e colar PDF, com o nome do arquivo visível.
- No histórico, áudio tem player simples; PDF abre/baixa pela rota autenticada (não por link público).

### 8.3 Admin → Chat do Luke (fase 2)

- Lista + filtros + detalhe somente leitura (seção 5.4).
- Acesso também ao log de webhook e à ação “Reenviar evento”.
- Entrada no menu Admin, ao lado de Solicitações, só para quem tem `Pode_Ver_Chat_Luke_Todos`.

### 8.4 Configuração

Não precisa de tela para a URL e o segredo do webhook na fase 1: vão pelo EasyPanel (seção 4.1). Se no futuro isso entrar em Configurações → Integrações, o segredo **não pode** voltar em GET (só “cadastrado” / “em branco”), no mesmo padrão das outras chaves.

A permissão por usuário entra no painel de permissões já existente (fase 1).

---

## 9. Convenções

Erros no formato já usado no CA-Hardt, com `codigo` estável. Decidir pelo `codigo`.

| HTTP | codigo | Quando |
|---|---|---|
| 400 | `CHAVE_NA_URL` | Token ou segredo veio na query |
| 400 | `SOLICITACAO_INVALIDA` | `solicitacaoIds` com id inexistente |
| 400 | `MENSAGEM_VAZIA` | Sem texto e sem anexo |
| 401 | `NAO_AUTENTICADO` | Token/JWT ausente ou inválido |
| 403 | `SEM_PERMISSAO` | Sem `Pode_Usar_Chat_Luke` ou sem visão admin |
| 404 | `NAO_ENCONTRADO` / `ANEXO_PERDIDO` | Conversa, mensagem ou arquivo |
| 413 | `ANEXO_GRANDE` | Estourou tamanho |
| 415 | `TIPO_NAO_ACEITO` | MIME ou conteúdo não aceito |
| 429 | `LIMITE_MINUTO` | Mesmo teto razoável das outras rotas de agente (ex.: 300/min) |
| 503 | `NAO_CONFIGURADA` | Se o módulo for desligável e estiver off |

`POST` de mensagem do usuário é idempotente se o cliente mandar `Idempotency-Key` (evita duplicar comprovante com rede ruim no celular).

---

## 10. Critérios de aceite

### 10.1 Webhook

1. Ao autorizar, rejeitar, expirar ou falhar uma solicitação, o CA-Hardt enfileira um evento `solicitacao.atualizada` com o `solicitacaoId`, o status novo, o resumo, a data e quem agiu.
2. O POST sai para `LUKE_WEBHOOK_URL` com JSON, `X-Hub-Signature-256: sha256=<hex>` do body cru (ou `Authorization: Bearer` se a env pedir) e os headers `X-Luke-Event`, `X-Luke-Delivery`, `X-Luke-Timestamp`.
3. A assinatura HMAC confere com o segredo. O valor do segredo **não** aparece em log, resposta ou tela.
4. Reenvio usa o **mesmo** `eventoId`. Timeout de 10 s. Backoff como na seção 4.3.
5. Sem URL ou sem segredo, a solicitação e o chat não quebram; o evento fica `DESLIGADO`.
6. Existe log consultável pelo admin e uma forma de reenviar um evento `FALHA`.

### 10.2 Chat (fase 1)

7. O clipe de baixo é substituído pelo botão Luke, visível só com a permissão ligada.
8. No celular, dá para fotografar um comprovante, escrever um texto e enviar, em poucos toques.
9. A mensagem aparece no histórico do usuário. Outro usuário logado **não** a vê.
10. O webhook `chat.mensagem` é enfileirado com `usuario`, `texto`, `anexos[]` (tipo, MIME, tamanho, nome e URL autenticada).
11. O Luke baixa o anexo com o token no header (sem token na URL) e recebe o binário certo.
12. O `POST /api/agente/v1/chat/conversas/:conversaId/mensagens` grava a resposta e ela aparece no chat aberto sem recarregar (stream, SSE ou polling).
13. Se a resposta trouxer `solicitacaoIds` pendentes, a bolha mostra “Aguardando autorização” com link para o pedido.
14. Gravação do Luke com `X-Origem-Conversa` (e `X-Origem-Mensagem`) fica ligada ao pedido; o webhook `solicitacao.atualizada` devolve esses ids.
15. Colar ou escolher uma imagem no desktop também anexa (fase 1).

### 10.3 Chat (fase 2)

16. Dá para gravar áudio e anexar ou colar PDF, dentro dos limites.
17. Admin → Chat do Luke lista todas as conversas, com filtros, somente leitura, inclusive anexos autenticados.
18. Quem não tem `Pode_Ver_Chat_Luke_Todos` não abre essa tela nem as rotas admin.

### 10.4 Segurança e regressão

19. Token na URL é recusado com 400, sem comparar.
20. Anexo sem auth devolve 401/403, nunca o arquivo.
21. Solicitações, telas financeiras e o 202 `AGENTE_PEDE_AUTORIZACAO` permanecem iguais para pedidos feitos fora do chat.
22. Deploy só com OK explícito do Clarkson no chat.

---

## 11. Checklist de teste

Usar dados fictícios (fornecedor “TESTE-LUKE…”, comprovante de mentira). Nada de nota, CPF ou dado real de cliente em print, PR ou issue.

### 11.1 Webhook de solicitações (fase 1)

- [ ] Autorizar um pedido em Admin → Solicitações e ver no log um evento `solicitacao.atualizada` com status `AUTORIZADA`, resumo, data e `autorizadoPor`.
- [ ] Rejeitar outro pedido e conferir status `REJEITADA`.
- [ ] Conferir o header `X-Hub-Signature-256` contra o body cru (script local, **sem** colar o segredo em issue).
- [ ] Com `LUKE_WEBHOOK_AUTH=bearer`, conferir o header `Authorization` (só nos logs do lado que recebe, nunca gravar o valor no CA-Hardt).
- [ ] Derrubar o destino ou forçar 500: o evento tenta de novo com o mesmo `eventoId` e backoff.
- [ ] Forçar 400: não entra em loop de retry; fica `FALHA`; o botão de reenviar funciona.
- [ ] Timeout (destino que não responde em 10 s): reenvia.
- [ ] `LUKE_WEBHOOK_URL` ou `LUKE_WEBHOOK_SECRET` em branco: o pedido autoriza normalmente; evento `DESLIGADO`.
- [ ] O segredo não aparece em log do backend, resposta de API nem no frontend.

### 11.2 Chat texto + foto (fase 1)

- [ ] Usuário **sem** permissão: botão Luke ausente; `POST` de mensagem 403.
- [ ] Ligar a permissão: o botão aparece no lugar do clipe; o clipe antigo não permanece no mesmo ponto.
- [ ] No telefone (ou emulação 375 px), tirar foto, escrever “lança esse pagamento”, enviar.
- [ ] Escolher imagem da galeria e colar uma imagem no desktop.
- [ ] A mensagem aparece só na conversa daquele usuário. Entrar com outro usuário e confirmar que a conversa é outra, vazia.
- [ ] Recusar MIME (ex.: `.exe`) e arquivo acima de 10 MB: 415 / 413, nada gravado.
- [ ] `GET` do anexo sem auth: 401. Com token na query: 400 `CHAVE_NA_URL`. Com token de agente no header: 200 e o binário.
- [ ] Webhook `chat.mensagem` sai com `eventoId`, usuário, texto e `anexos[].url` relativa.
- [ ] O Luke (ou um curl no lugar dele) responde no `POST .../mensagens`; a bolha nova aparece no app aberto sem F5.
- [ ] Resposta com `solicitacaoIds` mostra “Aguardando autorização” e o link.
- [ ] Uma gravação do agente com `X-Origem-Conversa` e `X-Origem-Mensagem` liga o pedido; ao autorizar, o webhook traz esses ids e o chat atualiza o estado.
- [ ] Header `X-Origem-Conversa` com UUID inexistente: o 202 da solicitação continua igual, sem vínculo.
- [ ] Mensagem do usuário é persistida mesmo com webhook desligado ou destino fora do ar.
- [ ] Rede instável: reenviar a mesma `Idempotency-Key` não duplica a mensagem.
- [ ] Arquivo apagado do disco: `GET` do anexo devolve 404 `ANEXO_PERDIDO`, não 500.

### 11.3 Áudio, PDF e admin (fase 2)

- [ ] Gravar áudio de poucos segundos, ouvir o preview, descartar, gravar de novo e enviar.
- [ ] Áudio acima de 5 minutos ou 10 MB é recusado.
- [ ] Anexar PDF e colar PDF no desktop; abrir/baixar só autenticado.
- [ ] Admin vê a conversa da pessoa da rua, com foto, áudio e PDF, e não consegue enviar mensagem nessa tela.
- [ ] Filtros por usuário, data, texto e anexo funcionam.
- [ ] Usuário comum não abre Admin → Chat do Luke (menu oculto + API 403).
- [ ] Log de webhook lista os eventos e o reenvio manual gera um POST com o mesmo `eventoId`.

### 11.4 Regressão

- [ ] Admin → Solicitações: autorizar e rejeitar um pedido feito **fora** do chat (sem headers de origem) segue igual, e o webhook mesmo assim dispara `solicitacao.atualizada` com `conversaId` nulo.
- [ ] Leitura e gravação `/api/agente/v1` (202, consulta, expiração) não mudam.
- [ ] Demais telas do app (contas a pagar, fornecedores, etc.) iguais.
- [ ] Quem não tem a permissão nova não vê mudança, além da troca do clipe — e essa troca só vale para quem tem o chat ligado. Para quem está sem permissão, definir no implemento um comportamento explícito: ou o clipe antigo permanece, ou some o atalho; o importante é **não deixar o usuário sem permissão cair num chat 403**. Recomendação: sem permissão, o botão Luke não aparece e o clipe antigo **não volta** (o chat é o substituto; quem precisa usa a permissão). Se hoje o clipe tiver outra função além de abrir um assistente (por exemplo, anexar em outra tela), essa função nas telas próprias **permanece**.

---

## 12. Fases de entrega

Fases curtas, cada uma publicável sozinha, **só com OK explícito do Clarkson no chat**. Não juntar as duas num único PR só para “adiantar”.

### Fase 1 — webhook de solicitações + chat com texto e foto

1. Env `LUKE_WEBHOOK_URL`, `LUKE_WEBHOOK_SECRET`, `LUKE_WEBHOOK_AUTH`; worker com timeout, backoff, `eventoId` e log.
2. Evento `solicitacao.atualizada` em autorização, rejeição, expiração e erro.
3. Campos opcionais `conversaId` / `mensagemId` na solicitação e headers `X-Origem-Conversa` / `X-Origem-Mensagem`.
4. Tabelas do chat, permissão `Pode_Usar_Chat_Luke`, rotas JWT (texto + foto) e rotas do agente (GET conversa/mensagens/anexo e POST da resposta).
5. Botão Luke no lugar do clipe, chat mobile-first (câmera, galeria, colar imagem, estados, link da solicitação).
6. Evento `chat.mensagem` no mesmo webhook.
7. Tempo real mínimo (polling é aceitável).
8. Testes da seção 11.1, 11.2 e regressão 11.4.

Ao terminar a fase 1, uma pessoa na rua já consegue mandar o comprovante, o Clarkson já autoriza na fila de sempre, e o Luke já é avisado nos dois eventos.

### Fase 2 — áudio, PDF e visão do admin

1. Gravação de áudio, anexo e colar PDF, limites da seção 5.6.
2. Tela Admin → Chat do Luke (somente leitura, filtros) e permissão `Pode_Ver_Chat_Luke_Todos`.
3. Log de webhook no admin e reenvio manual.
4. Trocar polling por SSE ou WebSocket, se o polling da fase 1 ainda estiver no ar.
5. Testes da seção 11.3 e regressão breve.

Fora destas fases (não bloquear): transcrição de áudio no servidor, apagar conversa pelo usuário, editar mensagem, chat em grupo, o Luke escrever em nome de um usuário, UI do segredo no painel, e corrigir as telas que ainda devolvem 403 depois de autorizar (isso é ajuste da API já existente).

---

## 13. O que o Luke faz do outro lado (só para contexto)

Não é trabalho do CA-Hardt, mas explica o contrato:

- O Clarkson cola no EasyPanel o segredo gerado no painel da rotina do Luke (app Grok Bot).
- O Luke verifica a assinatura, deduplica por `eventoId` e, em `chat.mensagem`, baixa os anexos com o token de agente no header.
- Em `solicitacao.atualizada`, o Luke consulta a `consultaUrl` se precisar do resultado completo e, quando fizer sentido, posta o acompanhamento no chat.
- O Luke **não** reenvia a gravação que já virou solicitação; espera a autorização (agora avisada pelo webhook).

---

## Anexo A — Resumo das env no EasyPanel

| Variável | Obrigatória para ligar o webhook | Valor |
|---|---|---|
| `LUKE_WEBHOOK_URL` | sim | `https://api2.cursor.sh/automations/webhook/75b35a0d-7033-50a9-a4d2-7db8f172a9ee` |
| `LUKE_WEBHOOK_SECRET` | sim | colar do painel da rotina do Luke no app Grok Bot. Nunca commitar. |
| `LUKE_WEBHOOK_AUTH` | não | `hmac` (padrão) ou `bearer` |

O token do agente **não** é estas variáveis: continua o que já autentica `/api/agente/v1`.

## Anexo B — Referências

- Fluxo atual: `/api/agente/v1`, 202 `AGENTE_PEDE_AUTORIZACAO`, Admin → Solicitações.
- Pacote do Luke: `01-spec-api-financeira-agentes.md` (princípios de autorização, anexo sem URL pública, chave só no header). Este documento **não substitui** essa spec; acrescenta o chat e o webhook sobre a API que já está no ar.
- Permissão por usuário no mesmo padrão do Clippy (`docs/nota-entrega-clippy-por-usuario.md`), mas o atalho de baixo passa a ser o Luke.
