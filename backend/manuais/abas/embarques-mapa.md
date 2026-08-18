---
aba: Mapa das Entregas
rota: /admin/embarques/mapa
permissao: Pode_Acessar_Embarque
---

# Mapa das Entregas (divisão de cargas)

## O que é

Mapa da expedição para dividir as entregas do dia entre as cargas/veículos. Cada pedido faturado do dia aparece como um pino colorido no mapa — a cor diz em qual carga ele está. A expedição decide **quem leva o quê**; a **ordem** da rota continua sendo decidida pelo motorista, na tela dele (Minhas Entregas). A estrela ⭐ no mapa é a saída da empresa.

Acesso: menu Embarque → botão **"Mapa das entregas"** no topo do Painel de Expedição, ou direto pela rota `/admin/embarques/mapa`. Mesma permissão do Embarque (`Pode_Acessar_Embarque`).

## Como ler o mapa

- **Bolinha cheia colorida** — pedido com ponto GPS confirmado; a cor é a da carga (a bolinha de cada carga aparece no cartão do painel lateral).
- **Bolinha com contorno tracejado e "≈"** — o cliente ainda não tem ponto GPS confirmado; a posição foi encontrada pelo **endereço do cadastro** (aproximada). O pino funciona igual aos outros.
- **Cinza** — pedido sem carga (ainda não atribuído).
- **Cadeado 🔒 (pino apagado)** — pedido que já saiu para entrega (status diferente de PENDENTE): não pode mais trocar de carga.
- A legenda no canto inferior esquerdo do mapa resume esses estados.
- Tocar num pino abre o cartão do pedido: cliente, etiqueta, valor, cidade e o menu **"Mover para…"** (outra carga ou "Tirar da carga").

## Painel lateral (no celular: puxe a alça na parte de baixo da tela)

- **Dia das entregas** (padrão: hoje), **hora de saída** (padrão 08:00) e **minutos por parada** (padrão 10) — os dois últimos ficam salvos para o usuário.
- **Sugerir divisão** (botão verde): o sistema propõe uma divisão dos pedidos entre as cargas do dia. A proposta **não grava nada** — os pinos recolorem como rascunho.
- **Recalcular preciso**: busca km, duração e horário de volta calculados por rota de verdade (OSRM) para o arranjo atual. Sem esse serviço, os números saem **aproximados** com o selo "≈" (calculados em linha reta, no próprio aparelho) — o mapa e a sugestão funcionam do mesmo jeito.
- **Cartão de cada carga**: bolinha da cor, número e motorista, quantidade de pedidos, km/duração/volta prevista com o selo de precisão ("preciso" ou "≈ aproximado"), aviso âmbar **"impressa na vN — reimprimir"** quando a carga mudou depois da última impressão do romaneio, e o link "abrir carga" (leva ao Painel de Expedição).
- **Sem carga** (cartão cinza): quantos pedidos do dia ainda não têm carga.
- **Sem localização**: pedidos em que nem o GPS nem o endereço deram posição no mapa. Eles **nunca somem da divisão** — cada um tem o menu "Mover para…" para atribuir a carga manualmente.

## Rascunho e confirmação (nada grava no clique)

1. Mover um pino (ou usar "Sugerir divisão") só muda a tela — aparece a faixa **"alterações não aplicadas"** com **Confirmar** e **Descartar**.
2. **Confirmar** grava tudo de uma vez nas cargas. Se outro operador tiver mexido nos mesmos pedidos nesse meio tempo, **nada é aplicado**: a tela avisa quais clientes mudaram, recarrega o mapa e você confirma de novo.
3. **Descartar** volta ao que está salvo.
4. Pedido movido no rascunho ganha um **anel dourado** no pino.

## Horário de referência 16:30

Se a volta prevista de uma carga passa de 16:30, o horário aparece em âmbar ("volta prevista 17:05 · ref. 16:30"). É só um **aviso visual** — não trava nada e não impede o Confirmar.

## O que esta tela NÃO faz

- Não define a **ordem** das entregas (isso é do motorista, em Minhas Entregas).
- Não cria nem imprime cargas (isso é no Painel de Expedição — o link "abrir carga" leva até lá).
- Não mexe em pedido que já saiu para entrega (cadeado).
