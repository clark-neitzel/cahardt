# Estoque — Inventário (contagem física)

**Rota:** `/estoque/inventario` · **Menu:** Produção / Estoque → Inventário
**Quem vê:** admin ou quem tem alguma regra de permissão de estoque. **Para enviar** o inventário de uma categoria é preciso poder **adicionar E diminuir** estoque nessa categoria (a contagem ajusta nos dois sentidos). Categorias sem essa permissão aparecem acinzentadas com "sem permissão".

## Para que serve

Contar fisicamente o estoque de uma categoria (ex.: dentro da câmara fria) e ajustar o sistema para o valor contado. Feita para funcionar **sem internet** durante a contagem: só precisa de conexão para começar (baixar a lista) e para enviar no final.

## Fluxo

1. **Escolher a categoria** (tela inicial). Mostra as categorias de estoque com a quantidade de produtos. **Categorias marcadas como "não vende"** (imobilizado — freezer, painel LED, móveis) **aparecem aqui normalmente**: é justamente aqui que o bem precisa ser contado. O que muda é que os produtos dessas categorias somem das listas de venda (catálogo, pedido, amostra). Precisa de internet **só neste passo** — ao tocar em "Baixar produtos e iniciar", a lista de produtos (com o estoque atual do sistema) fica guardada no celular.
2. **Contar (funciona offline).** Cada produto tem botões grandes **−**, **+** e **+10** (para caixas fechadas) e um campo para digitar direto. Cada toque é salvo na hora no celular: pode fechar o app, a tela apagar ou a bateria acabar — ao reabrir a tela, a contagem continua de onde parou (cartão "Contagem em andamento"). Tem busca por nome/código e filtros "Todos / Faltam contar / Contados", além da barra de progresso (X de Y contados).
3. **Revisar.** Mostra contados vs. sistema com badge de diferença (verde "confere", âmbar +N, vermelho −N), total de diferenças e campo de observação. Produtos **não contados ficam de fora** (o estoque deles não muda).
4. **Enviar.** Com internet, envia na hora. **Sem internet**, fica "guardado no celular" e é **enviado sozinho** assim que o celular reconectar (ou pelo botão "Tentar enviar agora").

## O que acontece ao enviar

- Para cada produto contado, o sistema compara com o `estoqueTotal` atual e, se houver diferença, ajusta o estoque para o valor contado e grava uma movimentação no **Histórico de Estoque** com motivo **Inventário** (quem contou, quando, antes → depois).
- Produtos que conferem não geram movimentação.
- O reservado/disponível é recalculado automaticamente (reservas de pedidos continuam valendo).
- **Reenviar não duplica:** cada inventário tem um código único; se a conexão cair no meio do envio, reenviar continua de onde parou, sem ajustar duas vezes.

## Botão "Voltar para categorias" (na contagem)

- Sem nada contado: volta direto.
- Com produtos contados: pergunta se quer **Guardar e continuar depois** (a contagem fica salva no celular), **Apagar contagem e sair**, ou voltar a contar.

## Dúvidas comuns

- **"Comecei a contagem e caiu a internet"** — normal, continue contando; só o início e o envio precisam de rede.
- **"Enviei e não aconteceu nada"** — se estava sem internet aparece o aviso âmbar "Inventário guardado no celular"; conecte o celular que ele envia sozinho.
- **"Contei errado um produto"** — na revisão, toque em "← Ajustar" para voltar; ou use "limpar contagem" no próprio produto.
- **"Onde vejo o que o inventário mudou?"** — em Estoque → Histórico, filtrando o motivo "Inventário"; e na tela final do envio (lista antes → depois).
- **"O número 'sistema' mostrado é qual?"** — o estoque **total** físico registrado (não o disponível), pois a contagem física inclui o que está reservado para pedidos.
