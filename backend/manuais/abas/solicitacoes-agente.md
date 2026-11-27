---
aba: Solicitações dos agentes de IA (Luke)
rota: /admin/agentes/solicitacoes
permissao: admin
---

# Solicitações dos agentes de IA (Luke)

## O que é

Fila onde o **dono autoriza ou recusa** o que o agente de IA (Luke) pede para fazer no sistema. Quando uma ação do agente está marcada como "Pede autorização", ela **não é executada**: vira uma solicitação aqui, esperando a sua decisão. Só **administrador** vê esta tela. No menu (Administração → Solicitações) aparece um **selo vermelho com o número de pendentes**; ele atualiza sozinho a cada 1 minuto e quando você autoriza ou recusa.

---

## O que dá pra fazer aqui

- Ver os pedidos do agente, filtrando por situação (**Pendentes**, Executando, Autorizadas, Recusadas, Com erro, Resultado incerto, Expiradas); o filtro escolhido fica salvo
- Ler **o que ele quer fazer** (título, resumo, método e endereço) e **ver o que será enviado** (os dados; senhas e tokens aparecem ocultos)
- Ver o **endereço completo** da chamada. Quando ela leva parâmetros (por exemplo `?forcar=1`), eles aparecem **em destaque amarelo** ao lado do endereço: leia com atenção
- **Abrir tela**: leva para a tela do sistema relacionada, dentro do app, para você conferir antes de decidir
- **Autorizar**: o sistema executa a ação como "Luke (agente)"
- **Recusar**: com uma observação opcional (o agente pode ler o motivo)
- **Tentar de novo**: só para pedidos de "Resultado incerto"

---

## Situações (estados) de uma solicitação

| Situação | O que significa |
|----------|-----------------|
| Aguardando você (Pendente) | Esperando sua decisão. Tem prazo: aparece "expira em X h" |
| Executando… | Você autorizou e a ação está sendo executada neste momento. Aguarde alguns instantes (a tela se atualiza sozinha) e **não autorize de novo** |
| Autorizada | Você autorizou e a ação foi executada. O cartão mostra o resultado e os registros gerados |
| Recusada | Você recusou (ou o sistema recusou porque a função foi bloqueada para o agente depois do pedido). Nada foi executado |
| Erro ao executar (Erro) | Você autorizou, mas a ação falhou com um erro conhecido (a mensagem aparece no cartão). Nada foi feito |
| **Resultado incerto** (Erro indeterminado) | Você autorizou, mas o sistema **não sabe se a ação foi feita** (ex.: demorou demais e a conexão caiu). É preciso conferir na tela antes de qualquer coisa |
| Expirada | Ninguém decidiu a tempo; o agente precisa pedir de novo |

Se houver erros ou resultados incertos, aparece uma faixa amarela no topo com atalhos "Ver incertas" e "Ver com erro". O número de "com erro" considera os dos últimos 7 dias.

---

## Como fazer (passo a passo real)

### Autorizar um pedido
1. Leia o título e o resumo; se quiser, abra **Ver o que será enviado** e **Abrir tela**
2. Clique em **Autorizar**. O sistema avisa: "Isto vai executar a ação como Luke (agente)". Confirme
3. O cartão mostra o resultado: "Executado com sucesso", o código de resposta e os registros gerados. Se der erro, a mensagem do erro aparece ali

### Quando aparece "Algo mudou desde o pedido"
Alguns pedidos (por exemplo baixa de uma parcela) guardam como o item estava quando o agente pediu. Se o item mudou nesse meio tempo, o sistema **não executa direto**: mostra o **"antes"** (quando o agente pediu) e o **"agora"** lado a lado. Confira e escolha **Voltar sem autorizar** ou **Autorizar mesmo assim**. O cartão pendente também mostra um aviso amarelo quando detecta a mudança.

### Avisos que podem aparecer no cartão
- **Possível duplicata** (selo amarelo): já existe um pedido igual ou parecido. Abra a tela de destino e confira antes de autorizar.
- **Corpo incompleto**: o que o agente mandou era grande demais e a tela mostra só uma parte. Você não vê tudo o que será enviado: na dúvida, **recuse**.

### Se a conexão cair ou o servidor der erro ao autorizar
Se, ao clicar em Autorizar (ou Tentar de novo), a conexão cair ou o servidor responder com erro interno (500/502...), **a ação pode ter sido executada mesmo assim**. A tela avisa: **"Não sei se foi executado: confira a tela de destino antes de tentar de novo."** e atualiza a lista. Use **Abrir tela** para conferir antes de qualquer nova tentativa. Quando o servidor registrou o erro, a mensagem dele aparece em destaque no cartão.

### Recusar um pedido
1. Clique em **Recusar**, escreva o motivo (opcional) e confirme

### Resultado incerto: Tentar de novo (CUIDADO)
1. **Antes de tudo, confira na tela do sistema** (use **Abrir tela**) se a ação já foi feita
2. Só se não foi feita, clique em **Tentar de novo**. Abre um aviso forte: marque **"Entendi, repetir mesmo assim"** (só então o botão **Repetir agora** habilita) e confirme
3. Se for **cedo demais** (a execução anterior pode ainda estar em andamento), o botão já aparece desabilitado como **"Tentar de novo (disponível às HH:MM)"** e só libera nessa hora
4. **A repetição de uma CRIAÇÃO pode duplicar** (ex.: lançar a mesma conta duas vezes). O sistema envia a mesma chave de repetição, mas as telas ainda não usam essa chave para impedir duplicidade: por isso a conferência é sua. Depois de repetir, aparece um aviso amarelo no cartão lembrando disso

---

## Mensagens que podem aparecer

- **"Esta solicitação já está ..."**: outra pessoa já decidiu, ou ela expirou. A lista é atualizada.
- **"Esta função foi bloqueada para o agente depois do pedido"**: a função foi bloqueada depois que o agente pediu; a solicitação vira Recusada e nada é executado.

---

## Regras e cuidados

- Só administrador vê e decide; o agente nunca autoriza a si mesmo.
- Autorizar executa de verdade no sistema. Na dúvida, **Abrir tela** primeiro.
- Os dados "ocultos" (senhas, tokens) não aparecem nem para você.

---

## Perguntas frequentes

**O selo vermelho não some.** Ele conta os pedidos pendentes; decida ou aguarde expirarem.
**Onde configuro o que o agente pode fazer sozinho ou só com autorização?** Hoje essa configuração é feita por um técnico, a pedido do dono. Em uma entrega futura ela ficará em Usuários → (agente) → Permissões (ainda não existe).
**Onde gerencio o token do agente?** Em Agentes de IA.
