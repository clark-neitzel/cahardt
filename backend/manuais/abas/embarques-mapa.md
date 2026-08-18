---
aba: Mapa das Entregas
rota: /admin/embarques/mapa
permissao: Pode_Acessar_Embarque
---

# Mapa das Entregas (divisão de cargas)

## O que é

Mapa da expedição para dividir entre as cargas/veículos **tudo que vai para a rua no dia** — não só os pedidos. Aparecem no mapa:

- **Pedidos faturados** do período escolhido;
- **Bonificações (BN#)** e **pedidos especiais (ZZ#)** — só depois de **aprovados** (a aprovação é o "faturamento" deles; pendente de aprovação não embarca e não aparece);
- **Amostras (AM#)** — as **liberadas** que ainda não estão em carga nenhuma, mais as que já estão penduradas nas cargas do dia (inclusive as já entregues, que ficam travadas). Amostra solicitada/em preparação/cancelada não aparece;
- **Cobranças de rota (CB#)** — só as que já estão penduradas nas cargas do dia. O mapa **não** lista títulos em aberto soltos: cobrança nova nasce pelo botão **"Inserir Cobrança"** na tela da carga (Painel de Expedição).

Pedido cancelado, devolvido ou excluído dentro de uma carga **não conta como entrega** e não aparece.

**Um pino por cliente.** Tudo que vai para o mesmo cliente no dia (pedido + amostra + cobrança) fica num pino só, com as marcações do que vai lá dentro — e **mover o cliente leva tudo junto**. Amostra de **lead** (cliente ainda não cadastrado) agrupa pelo lead.

A expedição decide **quem leva o quê**; a **ordem** da rota continua sendo decidida pelo motorista, na tela dele (Minhas Entregas). A estrela ⭐ no mapa é a saída da empresa.

Acesso: menu Embarque → botão **"Mapa das entregas"** no topo do Painel de Expedição, ou direto pela rota `/admin/embarques/mapa`. Mesma permissão do Embarque (`Pode_Acessar_Embarque`).

## Como ler o mapa

- **Bolinha cheia colorida** — item com ponto GPS confirmado; a cor é a da carga (a bolinha de cada carga aparece no cartão do painel lateral).
- **Bolinha com contorno tracejado e "≈"** — o cliente ainda não tem ponto GPS confirmado; a posição foi encontrada pelo **endereço do cadastro** (aproximada). O pino funciona igual aos outros.
- **Cinza** — item sem carga (ainda não atribuído).
- **Número dentro do pino** — quantos itens daquele cliente vão no dia (eles andam sempre juntos).
- **Marcações do que vai para o cliente** (nos badges do pino e do cartão):
  - **BN** (roxo) bonificação · **ZZ** (roxo) pedido especial · **A** (âmbar) amostra · **$** (verde) cobrança · **P** (branco, borda cinza) pedido comum.
  - O **P** só aparece em **pino misto**: quando o cliente leva pedido comum junto com amostra, cobrança, especial ou bonificação, o **P** aparece ao lado das outras marcações. **Pino que leva só pedido comum fica sem marcação nenhuma** (é o caso mais comum, por isso limpo).
- **Cadeado 🔒 (pino apagado)** — item que **não se move mais**: pedido que já saiu para entrega (status diferente de PENDENTE), amostra já **entregue**, cobrança que já foi **cobrada / não cobrada / baixada**. Se um cliente tem itens travados e itens livres, só os livres se movem.
- A legenda no canto inferior esquerdo do mapa resume esses estados.
- Tocar num pino abre o cartão do cliente: nome, cidade, a lista do que vai para ele (etiqueta e valor de cada item) e o menu **"Mover para…"** — que **leva tudo junto**.
- O menu "Mover para…" lista **todas as cargas do dia** ("Carga #71 — Edilson", "Carga #72 — Jociel"…) e, no fim, a opção de tirar da carga. O rótulo dela muda conforme o item: **"Tirar da carga (sem carga)"** para pedido/bonificação/especial/amostra (o item volta a ficar sem carga) e **"Tirar da carga (apaga a cobrança)"** quando há cobrança no conjunto — nesse caso o registro é apagado ao Confirmar e não volta pelo mapa.

## Painel lateral (no celular: puxe a alça na parte de baixo da tela)

- **Data do embarque** (padrão: hoje): define quais cargas aparecem no mapa — e, com elas, quais amostras e cobranças penduradas entram na tela.
- **Período de entrega dos pedidos**: define quais **pedidos livres** ficam disponíveis para distribuir. Assim é possível, por exemplo, abrir o embarque de hoje e incluir pedidos com entrega prevista para ontem que ainda não entraram em nenhuma carga. Pedidos que já pertencem às cargas do embarque continuam visíveis mesmo fora do período escolhido. **Amostras liberadas sem carga aparecem sempre**, independentemente desse período.
- **Hora de saída** (padrão 08:00) e **minutos por parada** (padrão 10) ficam salvos para o usuário.
- **Sugerir divisão** (botão verde): o sistema propõe uma divisão entre as cargas do dia. Cada **cliente é uma parada** (pedido, amostra e cobrança dele contam como uma só e vão para a mesma carga). A proposta **não grava nada** — os pinos recolorem como rascunho.
- **Recalcular preciso**: busca km, duração e horário de volta calculados por rota de verdade (OSRM) para o arranjo atual. Sem esse serviço, os números saem **aproximados** com o selo "≈" (calculados em linha reta, no próprio aparelho) — o mapa e a sugestão funcionam do mesmo jeito.
- **Cartão de cada carga**: bolinha da cor, número e motorista, a contagem do que vai ("14 pedidos · 2 amostras · 1 cobrança"), km/duração/volta prevista com o selo de precisão ("preciso" ou "≈ aproximado"), aviso âmbar **"impressa na vN — reimprimir"** quando a carga mudou depois da última impressão do romaneio, e o link "abrir carga" (leva ao Painel de Expedição).
  - **Trocar rotas:** dentro do cartão há o seletor *"Trocar tudo desta rota … com [outra carga] · Trocar"*. Ele **inverte os dois conjuntos inteiros** — pedidos, amostras e cobranças das duas cargas trocam de lugar de uma vez (itens travados ficam onde estão). É rascunho: só vale depois do **Confirmar**. Não mexe no motorista nem na data das cargas.
- **Sem carga** (cartão cinza): quantos itens do dia ainda não têm carga.
- **Serão apagadas** (cartão vermelho): aparece quando o rascunho tira alguma **cobrança** da carga — ver o aviso logo abaixo.
- **Clientes no mapa**: lista de todos os pinos (útil no celular), com as marcações do que vai para cada um; tocar leva ao pino.
- **Sem localização**: itens em que nem o GPS nem o endereço deram posição no mapa. Eles **nunca somem da divisão**. A lista traz **um cartão por cliente** (não um por item): dentro dele vêm os itens sem posição, cada um com o **motivo** de não ter pino:
  - *"sem ponto GPS e sem endereço utilizável no cadastro"* — é o caso da **amostra de lead** (lead não tem endereço estruturado para procurar) e do cliente sem GPS e sem endereço. Situação **permanente**: só sai da lista arrumando o cadastro / marcando o ponto GPS.
  - *"endereço não localizado no mapa"* (ou *"falha na geocodificação do endereço"*) — o endereço existe no cadastro mas o serviço não conseguiu achar; vale conferir a grafia, o número e o CEP.
  - *"geocodificação pendente — tente novamente em instantes"* — temporário (o mapa tem um tempo máximo para procurar endereços a cada carregamento); é só recarregar a tela daqui a pouco.

  Abaixo dos itens fica **um único** menu "Mover para…" para atribuir a carga manualmente (com o aviso "mover leva tudo junto" quando o cliente tem mais itens no dia). Cliente cujos itens já estão todos travados mostra o cadeado em vez do menu.

## Rascunho e confirmação (nada grava no clique)

1. Mover um pino (ou usar "Sugerir divisão" / "Trocar") só muda a tela — aparece a faixa **"alterações não aplicadas"** com **Confirmar** e **Descartar**.
2. **Confirmar** grava tudo de uma vez nas cargas. Se o banco tiver mudado desde que a tela foi carregada, **nada é aplicado** — a tela diz **qual item** e **por quê**, recarrega o mapa e você confirma de novo. São três situações, todas tratadas do mesmo jeito: o item **sumiu** (foi apagado), **mudou de carga** (outro operador mexeu) ou **mudou de situação** (amostra entregue, cobrança registrada na rua pelo motorista, entrega já concluída).
   - Diferente disso é o aviso de item que **não pode ser remanejado por regra** (especial/bonificação sem aprovação, pedido do Delivery, pedido cancelado indo para outra carga): aí recarregar não resolve — tire o item da mudança e confirme de novo.
   - Se o motorista **já organizou a rota** dele, o Confirmar **funciona normalmente**: o pedido remanejado é retirado automaticamente da rota organizada do motorista. Ele vê a rota **sem aquela parada** e o **número de paradas já atualiza na hora**, mas **km e tempo ficam como estavam, marcados como desatualizados** — a tela dele avisa algo como *"a expedição mudou sua carga — organize a rota de novo"*, e os números só voltam a valer depois que ele reorganizar. (Antes o sistema recalculava a duração sozinho e a conta saía **menor** do que a realidade, porque a volta à base sumia da soma.)
   - O mesmo aviso aparece para o motorista que **recebeu** um pedido: a rota organizada dele fica marcada como desatualizada (a parada nova só entra depois de **Organizar Rota**). O botão **Recalcular horários** do app dele **não** tira esse aviso — só o Organizar Rota.
   - **Tirar da carga** segue a mesma regra da lixeira do Painel de Expedição: só o que ainda está PENDENTE de entrega pode sair — inclusive pedido cancelado, que **pode** ser tirado da carga, mas **não pode** ir para outra.
3. **Descartar** volta ao que está salvo.
4. Item movido no rascunho ganha um **anel dourado** no pino.

### ⚠️ Tirar cobrança da carga APAGA o registro

Cobrança não é igual a pedido: quando você tira uma cobrança da carga e confirma, o registro é **apagado** (não existe cobrança pendente fora de carga). Ela **não volta pelo mapa** — para recolocar, use **"Inserir Cobrança"** na tela da carga, buscando o título de novo. Por isso a tela mostra o cartão vermelho **"Serão apagadas"** e pede uma **confirmação extra** antes de aplicar.

Detalhes que valem a pena saber:

- **Mover** cobrança de uma carga para outra é normal (não apaga nada) — só sai da carga quem for para "Tirar da carga".
- Cobrança **só se move enquanto estiver "A cobrar" (PENDENTE)**. Depois que o motorista registrou algo na rua (cobrou / não conseguiu cobrar) ou o caixa baixou, fica travada.
- Mudança de cobrança **não sobe a versão da carga** (o romaneio impresso não lista cobranças), mas entra no **Histórico da carga**. Já mover pedido ou amostra **sobe a versão das duas cargas** envolvidas — e dispara o aviso de "reimprimir".
- Cobrança **"não cobrada"** (o motorista tentou e não recebeu) continua aparecendo no mapa como **pino travado** **e conta no cartão da carga**, junto com "a cobrar", "cobrada" e "baixada": o cartão mostra **todas** as cobranças penduradas na carga, em qualquer situação. É o mesmo número da seção **"Cobranças na Carga"** do Painel de Expedição — os `$` do mapa e a contagem do cartão sempre batem. (Antes a "não cobrada" aparecia no mapa mas ficava de fora da contagem, e dava a impressão de erro. Ela conta porque **não é o fim da linha**: o escritório pode **desfazer** o registro e ela volta a "a cobrar" na mesma carga.)
- **Registrar a versão e o histórico não trava o remanejo**: essa parte roda **depois** que a divisão já foi gravada e, se falhar, não desfaz nada. Num caso raro a nova divisão vale mesmo sem a versão ter subido — ou seja, sem o aviso âmbar de **"reimprimir"** aparecer. Se a carga mudou e a folha não avisou, confira o **Histórico da carga** antes de sair. (Mesma regra do Embarque: "Registrar a versão nunca trava a operação".)

## Horário de referência 16:30

Se a volta prevista de uma carga passa de 16:30, o horário aparece em âmbar ("volta prevista 17:05 · ref. 16:30"). É só um **aviso visual** — não trava nada e não impede o Confirmar.

## O que esta tela NÃO faz

- Não define a **ordem** das entregas (isso é do motorista, em Minhas Entregas).
- Não cria nem imprime cargas (isso é no Painel de Expedição — o link "abrir carga" leva até lá).
- Não cria cobrança nova nem busca títulos em aberto (isso é o "Inserir Cobrança" da tela da carga).
- Não libera amostra: amostra só entra na divisão depois de **liberada** na tela de Amostras.
- Não aprova especial/bonificação: eles só aparecem aqui depois de aprovados na tela de Pedidos.
- Não mexe em item que já saiu / já foi trabalhado (cadeado).
