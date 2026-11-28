---
aba: Agentes de IA
rota: /admin/agentes-ia
permissao: admin
---

# Agentes de IA

## O que é

Tela só para **administradores**. Mostra os agentes de IA e conexões por API do sistema (por exemplo, o **Luke**): usuários-robô que entram no sistema por um **token de acesso** (uma "senha longa" que começa com `cah_ag_`) em vez de login e senha. Aqui você controla os tokens, a **Matriz de Permissões da API (módulo × ação)** e baixa o **Kit de Conexão** de cada agente.

---

## O que dá pra fazer aqui

- **Cartão "Chat do Luke"** (no topo da tela): é onde se **liga o Luke**. Veja a seção abaixo
- Ver cada agente: nome, selo **AGENTE**, se está ativo e quantos tokens ativos tem
- **Permissões da API**: abrir a matriz módulo × ação (`Ver`, `Criar`, `Editar`, `Excluir`, `Estornar`, `Dar baixa`), escolhendo em cada célula **NÃO** (bloqueado), **PEDE** (cai na fila de Solicitações para o dono autorizar) ou **SIM** (executa direto, com `Idempotency-Key` e guardas de segurança). Também permite ligar/desligar a matriz, aplicar a regra padrão e sincronizar permissões de base
- **Kit de conexão**: copiar ou baixar o guia `.md` (sem segredo) com URL base, matriz atual, regras de idempotência, códigos de erro e exemplos `curl` prontos para o integrador (além do catálogo vivo `GET /api/agente/v1/openapi.json`)
- **Gerar novo token** (escolhe o nome e a validade: 30, 90, 180 dias ou 1 ano)
- **Rotacionar** o token: gera um novo e oferece revogar os antigos com um clique
- **Revogar** um token (o agente que usa esse token perde o acesso na hora)
- Ver o último uso de cada token (quando e de qual endereço), quantos usos teve e o limite por minuto
- **Novo agente**: cria uma conexão nova já com as permissões de base (sem administrador)

---

## Estados do token

| Estado | O que significa |
|--------|-----------------|
| Ativo (verde) | Funciona normalmente |
| Expira em N dias (amarelo) | Faltam 14 dias ou menos: use **Rotacionar** antes de vencer, para o agente não ficar sem acesso |
| Expirado (vermelho) | Passou da validade; o agente não entra mais |
| Revogado (cinza) | Você cancelou; não volta mais (só gerando outro) |

Tokens revogados ou vencidos ficam recolhidos em "Tokens revogados ou vencidos".

---

## Como fazer (passo a passo real)

### Gerar um token novo
1. Clique em **Gerar novo token** no cartão do agente
2. Dê um nome (para você reconhecer depois) e escolha a validade
3. Clique em **Gerar token**
4. O token aparece **uma única vez**. Clique em **Copiar token** e cole direto na configuração do agente
5. Só então feche a janela. **Depois de fechar não existe jeito de ver o token de novo**: se perder, gere outro
6. Nunca cole o token em conversa, e-mail ou WhatsApp

### Trocar o token sem deixar o agente parado (rotacionar)
1. Clique em **Rotacionar**, escolha nome e validade, **Gerar token**
2. Copie o novo token e coloque no agente
3. Quando o agente já estiver usando o novo, clique em **Revogar os antigos agora**

### Revogar um token
1. No token, clique em **Revogar** e confirme
2. Quem usa esse token perde o acesso imediatamente. Não dá para desfazer

---

## Regras e cuidados

- Só administrador abre esta tela; quem não é administrador vê "Acesso negado".
- O agente **nunca** pode ser administrador.
- **Ao revogar o token, as solicitações pendentes DESTE AGENTE são recusadas automaticamente: todas, não só as do token revogado.** O mesmo vale ao usar "Revogar os antigos agora" na rotação. A tela avisa quantas foram recusadas.
- Por segurança, o sistema guarda só uma "impressão digital" do token. Por isso ele não pode ser mostrado de novo.
- Se o token vazou ou foi colado onde não devia: **revogue na hora** e gere outro.
- O que o agente pede e precisa da sua autorização cai na tela **Solicitações do Luke** (veja o manual dela).

---

## Perguntas frequentes

**Perdi o token, como vejo de novo?** Não dá. Gere um novo e revogue o antigo.
**Onde mudo o que o agente pode fazer?** Clique em **Permissões da API** no cartão do agente (ou em **Admin → Usuários**, na linha com o selo **CONEXÃO POR API**). Escolha `NÃO`, `PEDE` ou `SIM` em cada módulo/ação e salve.
**Como passo a documentação técnica para integrar o agente?** Clique em **Kit de conexão** (copia ou baixa `.md`, sem expor nenhum token). O próprio agente também pode consultar `/api/agente/v1/openapi.json`.
**O agente parou de funcionar de repente.** Veja se o token venceu ou foi revogado; gere um novo e coloque no agente.

---

## Cartão "Chat do Luke" (onde liga o Luke)

Fica no topo da tela e só aparece para administrador. Controla a aba **"Pedir ao Luke"** do cachorro Luke (veja o manual `chat-luke`).

- **Chat do Luke ligado/desligado** (interruptor grande): desligar corta a aba "Pedir ao Luke" para **todos**, na hora, e pede confirmação. Pedidos já enviados continuam guardados; novidades e "Tirar dúvida" seguem funcionando. Pode ligar de novo quando quiser.
- **Qual agente atende o chat**: escolha na lista de agentes ativos (SelectBusca). Só o agente escolhido lê e responde as conversas; sem agente, o usuário vê "Luke ainda não conectado" e os pedidos ficam guardados.
- **Limites por pessoa, por dia**: pedidos ao Luke (padrão 20), anexos (30) e dúvidas (50). Administrador não tem limite diário. Aceita número inteiro de 0 a 100000; clique em **Salvar alterações** (o botão só habilita quando algo mudou).
- **Aviso automático ao Luke** (só leitura): mostra se o envio de avisos ao serviço do Luke está **configurado** ou **não configurado**. Isso é feito no EasyPanel (`LUKE_WEBHOOK_URL` e `LUKE_WEBHOOK_SECRET`); nenhum segredo aparece na tela.
- **Quem pode conversar**: para uma pessoa usar o chat, ligue **"Conversar com o Luke — financeiro (BPO)"** em Usuários → Permissões da pessoa.
- Ainda não há tela para ajustar o limite de **uma pessoa só** (a rota existe no servidor; a tela fica para uma próxima etapa).
