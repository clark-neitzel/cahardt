# Separação de Carga — só o que está pendente de entrega

Data: 19/11/2026 · Situação: **liberado para publicar, com uma conferência que só você consegue fazer** (olhar a tela depois de publicado).

## O que mudou

- A tela **Separação de Carga** agora mostra **só as cargas que ainda têm pedido para entregar**.
- Carga em que tudo já foi entregue **some da lista**.
- Dentro da carga, **pedido já entregue não aparece mais**. Os totais por produto contam só o que falta entregar.
- No aparelho que já tinha guardado uma carga antiga: ela some sozinha quando o aplicativo fala com o servidor. Se ela estava aberta, a tela fecha e avisa: "A carga #N já foi entregue e saiu da lista."
- **Nada do que você tocou e ainda não foi enviado é apagado.** Carga com toque, conclusão ou etiqueta esperando para sair fica no aparelho.

## O que foi testado

- **Com os dados de verdade de hoje (cópia das 11h15):** antes a tela mostrava **5 cargas com 78 pedidos**. Com a correção mostra **1 carga (a #445) com 6 pedidos**. As cargas #442, #443, #444 e #446 somem porque estão todas entregues. (Esses números mudam ao longo do dia.)
- O testador usou a tela clicando, em duas rodadas, em tamanho de celular: carga entregue some, carga com parte entregue abre só com o que falta, funciona sem internet, resposta estranha do servidor não apaga nada.
- O revisor leu o código em três rodadas. Achou dois problemas, os dois foram corrigidos e conferidos de novo.
- Eu conferi: o aplicativo monta sem erro, e a mudança não mexe em pedido, nota, estoque nem no banco de dados.

## O que você precisa conferir (um minuto)

1. Abra **Logística → Separação de Carga** com internet. Devem aparecer **só as cargas que ainda têm entrega para fazer**.
2. Abra uma carga que já teve entregas hoje. Os pedidos entregues **não podem aparecer**.

Se aparecer carga ou pedido que já foi entregue, me avise com o número.

## O que ficou pendente

- **Não foi testado no iPhone nem no iPad de verdade**, nem dentro do aplicativo publicado.
- **O aviso "A carga já foi entregue e saiu da lista" não foi visto na tela** por ninguém. Foi a última mudança, de duas linhas, e eu só conferi lendo o código. Se ele falhar, a carga some sem aviso, e nada se perde.
- **Entrega parcial e devolvido contam como "já entregue"** e somem da tela. Se você quiser ver esses pedidos na separação, é só falar.
- **Carga com saída de anteontem para trás não aparece**, mesmo que ainda tenha pedido pendente. Hoje existe 1 carga assim. Essa regra já era assim e não foi mexida.
- Depois que a carga é entregue, **não dá mais para ver nesta tela o que faltou na separação**. A anotação continua guardada no sistema.
- O aviso de carga que saiu da lista diz sempre "já foi entregue", mesmo quando o motivo é outro (por exemplo, a conferência da doca foi concluída). É só o texto.
- A lista mostra no máximo 40 cargas. Não foi testado com mais do que isso (hoje é 1).
