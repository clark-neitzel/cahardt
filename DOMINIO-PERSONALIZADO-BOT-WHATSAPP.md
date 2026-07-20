# Domínio personalizado da Hardt — como funciona hoje e como colocar o bot nele

> **Para quem é:** o agente/equipe do projeto do bot de WhatsApp.
> **Objetivo:** colocar o bot num endereço próprio dentro do domínio da Hardt (ex.: `bot.hardtsalgados.com.br`), do mesmo jeito que o app principal já usa o domínio.

---

## Como o domínio está montado HOJE (verificado em 13/07/2026)

O domínio é `hardtsalgados.com.br`. A estrutura tem três peças, cada uma num lugar:

| Peça | Onde fica | O que faz |
|---|---|---|
| **Registro + DNS** | **Hostinger** (painel hpanel.hostinger.com, conta do dono) | É onde se cria/edita os apontamentos (registros DNS). Nameservers: `lunar.dns-parking.com` / `solar.dns-parking.com` |
| **Hospedagem do app** | **EasyPanel** no VPS `76.13.160.151` | O painel EasyPanel recebe o tráfego e distribui para o serviço certo pelo NOME do domínio (proxy interno com HTTPS automático) |
| **E-mail do domínio** | **Hostinger** (registros MX `mx1/mx2.hostinger.com`) | E-mails @hardtsalgados.com.br — **NÃO TOCAR** nesses registros |

### Registros DNS atuais (não mexer neles)

| Tipo | Nome | Valor | Função |
|---|---|---|---|
| A | `@` (raiz) | `76.13.160.151` | Site/app principal |
| CNAME | `www` | `hardtsalgados.com.br` | www → raiz |
| MX | `@` | `mx1/mx2.hostinger.com` | E-mail (crítico) |

### Como o app principal usa o domínio (o modelo a copiar)

1. O registro DNS aponta o nome para o IP do VPS.
2. No **EasyPanel**, dentro do serviço do app, o domínio foi adicionado em **Domains** — o EasyPanel então:
   - passa a rotear as requisições daquele nome para o serviço certo (vários serviços dividem o mesmo IP; é o nome que decide para onde vai);
   - emite e renova o **certificado HTTPS sozinho** (Let's Encrypt) — não se instala certificado manualmente.

É só isso. Não há configuração de domínio dentro do código do app.

---

## Passo a passo para colocar o BOT no domínio

> ✅ **Confirmado (13/07/2026):** o bot roda no MESMO VPS EasyPanel do app (`76.13.160.151`), no projeto **`whatsapp`**, com dois serviços: **`backend`** e **`admin`**. Então o caminho é o mais simples possível — os passos abaixo já assumem isso.

### 0. Decidir os subdomínios

Usar **subdomínio**, nunca a raiz (a raiz é o site/app da Hardt). Como o projeto tem dois serviços, o natural é um nome para cada:

| Serviço no EasyPanel | Sugestão de subdomínio | Para quê |
|---|---|---|
| `whatsapp / backend` | `bot.hardtsalgados.com.br` | API do bot (webhooks do WhatsApp) |
| `whatsapp / admin` | `botadmin.hardtsalgados.com.br` (ou `painel.`) | Painel de administração |

(Se o painel `admin` for de uso só interno, dá para deixá-lo sem domínio por enquanto e resolver só o `backend`.)

### 1. Criar o(s) registro(s) DNS na Hostinger (ação do dono, ~2 min)

No painel da Hostinger → Domínios → `hardtsalgados.com.br` → **DNS / Nameservers** → adicionar:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `bot` | `76.13.160.151` | padrão (14400 ou automático) |
| A | `botadmin` | `76.13.160.151` | padrão |

⚠️ **Só ADICIONAR os registros novos. Não editar nem apagar nenhum registro existente** — em especial os **MX** (derruba o e-mail da empresa) e o **A da raiz** (derruba o site/app).

### 2. Adicionar o domínio nos serviços do bot no EasyPanel

No EasyPanel → projeto **`whatsapp`** → serviço **`backend`** → aba **Domínios** → **Adicionar domínio** → `bot.hardtsalgados.com.br` → HTTPS ativado (certificado automático). Conferir se a **porta interna** apontada é a porta em que o serviço escuta (mesmo valor do domínio `easypanel.host` que o serviço já tem).

Repetir no serviço **`admin`** com `botadmin.hardtsalgados.com.br`.

O EasyPanel emite o certificado sozinho assim que o DNS propagar — não instalar nada manualmente. O domínio `*.easypanel.host` antigo continua funcionando em paralelo.

### 3. Esperar propagar e testar

- A propagação do DNS leva de minutos a algumas horas.
- Testar: `https://bot.hardtsalgados.com.br` deve abrir **com cadeado (HTTPS válido)**. Sem HTTPS válido, webhook de WhatsApp não funciona.

### 4. Atualizar o que aponta para o endereço antigo do bot

Depois que o novo endereço estiver no ar, trocar nos lugares que usam a URL antiga:

- **Webhook da plataforma de WhatsApp** (Meta Cloud API / BotConversa / Evolution etc.) — o callback deve passar a usar `https://bot.hardtsalgados.com.br/...`;
- Qualquer link público que o bot envie nas mensagens;
- Variáveis de ambiente do projeto que contenham a URL base.

Manter o endereço antigo funcionando em paralelo por alguns dias (não desligar na hora) até confirmar que tudo migrou.

---

## Resumo do que precisa do DONO (Clarkson) e o que é do projeto

| Ação | Quem faz |
|---|---|
| Criar o registro DNS `bot` na Hostinger | Dono (ou o agente do projeto Hardt, guiando ele na tela) |
| Adicionar o domínio no painel onde o bot está hospedado | Agente do projeto do bot |
| Trocar webhooks/URLs para o endereço novo | Agente do projeto do bot |
| **Nunca**: mexer em MX, no A da raiz, no CNAME www ou nos nameservers | ninguém 🙂 |
