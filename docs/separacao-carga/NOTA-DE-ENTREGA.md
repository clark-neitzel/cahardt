# Separação de Carga — nota de entrega

Data: 18/11/2026 · Situação: **liberado para publicar, com pendências que só você consegue conferir** (aparelho de verdade e impressora).

## O que mudou

- Tem uma tela nova no menu **Logística → Separação de Carga**, para separar a carga dentro da câmara fria sem a folha de embarque.
- Letra e botões grandes. O **A− / A+** aumenta a tela inteira e o aplicativo lembra o tamanho que você escolheu.
- Cada produto mostra três números: **SEPARAR**, **SEPAREI** e **FALTA**.
- Quando falta, você marca o motivo: **Vem depois** ou **Não tem**. Isso fica só anotado na separação. **Não mexe em pedido, nota, estoque nem na carga.**
- Dois jeitos de separar: **Carga inteira** (soma por produto) e **Por pedido** (bolsa térmica, um cliente por vez). Em "Por pedido" você escolhe a ordem: da carga, por cidade ou a que você quiser.
- Você informa quantas bolsas deu e sai **uma etiqueta por bolsa** ("BOLSA 1 de 3").
- A barra de cima, com o andamento, fica parada enquanto você rola a lista.
- **Funciona sem internet.** Você abre a carga ainda com sinal, entra na câmara e trabalha normal. Ao sair, o aplicativo envia tudo sozinho. As etiquetas pedidas lá dentro só saem quando você toca em **Imprimir agora**.
- A tela tem permissão própria: **Separação de Carga**. Só você (administrador) vê por enquanto.

## O que foi testado

- O testador usou a tela clicando, em três rodadas, no computador e em tamanho de celular: os dois modos, a ordem dos pedidos, a falta com motivo, as bolsas, concluir, duas pessoas na mesma carga, a carga mudando no meio, e o uso sem internet (inclusive recarregar e reabrir sem sinal).
- O revisor leu o código em três rodadas e os problemas que achou foram corrigidos.
- Eu conferi por conta própria: o aplicativo monta sem erro; quem não tem a permissão é barrado na tela e no servidor; enviar duas vezes a mesma coisa não duplica; a imagem da etiqueta sai certa; concluir não altera a carga.
- Entrar, sair, ponto do dia e pendência de rota foram testados de novo com internet e continuam iguais.

## O que você precisa conferir (um minuto cada)

1. **Ligar a permissão** para quem separa: Usuários → Permissões → Logística → "Separação de Carga".
2. **No iPhone ou iPad, antes de entrar na câmara:** feche o aplicativo e abra de novo pelo ícone, **com internet**. Só tocar no botão de atualizar não basta na primeira vez.
3. **Teste sem sinal:** abra uma carga, ligue o modo avião, toque em alguns produtos, feche o aplicativo e abra de novo. Tem que voltar na separação com tudo o que você tocou. Tire o modo avião: o envio acontece sozinho.
4. **Barra de cima:** role a lista e veja se a barra da carga fica parada no topo (em iPad antigo pode não ficar).
5. **Impressora:** em um pedido, informe 2 bolsas e imprima. Devem sair "BOLSA 1 de 2" e "BOLSA 2 de 2", legíveis, na etiqueta 100×120.

Cuidado no teste: o que você tocar numa carga de verdade aparece para quem for separar essa carga. Desfaça os toques depois, e não use "Concluir" numa carga real só para testar.

## O que ficou pendente

- **Não foi testado em aparelho de verdade:** iPhone e iPad, abrir pelo ícone sem sinal, toque com luva.
- **Não foi impresso na Zebra de verdade.** O servidor aceitou os pedidos de impressão e a imagem da etiqueta foi conferida, mas nenhuma etiqueta saiu do rolo.
- **Um caso que achei lendo o código e que ninguém testou:** se o aparelho só foi atualizado pelo botão de atualizar e o aplicativo fechar sozinho dentro da câmara, ele pode abrir na versão antiga e mostrar "Sem conexão" até o sinal voltar. Nada do que foi tocado se perde. O item 2 acima evita isso. A correção definitiva fica para a sequência.
- Carga muito grande (mais de 100 produtos) não foi testada na tela.
- Com mais de uma impressora de etiqueta grande ligada, o campo de escolher a impressora fica com letra escura sobre verde, difícil de ler. É só visual.

## Decisões tomadas sem você (estava na câmara) — diga se quer diferente

1. **Amostras** da carga não entram na lista. A tela só avisa "esta carga tem N amostras — separe à parte".
2. **Letra** vai de 15 até 29.
3. **Cargas que aparecem:** saída de ontem em diante e que ainda não foram conferidas na doca.
4. **As faltas só aparecem nesta tela.** Não há selo no painel de Embarque e ninguém é avisado.
5. **Pedido cancelado ou devolvido** não aparece na separação (na folha de embarque ele aparece).
6. Para a tela abrir sem sinal foi preciso mexer na parte do aplicativo que confere o login. **Sem internet só a Separação de Carga abre**; as outras telas mostram "Sem conexão".
7. **Ponto do dia:** na Separação, se o servidor não responde em 15 segundos, quem não é isento de ponto entra sem a conferência. Ela volta a ser cobrada quando o sinal volta.
8. Sem internet nenhuma, a tela "Sem conexão" agora aparece na hora, em vez de esperar uns 4 segundos tentando. Vale para o aplicativo todo.

---

## Aviso curto (para o seu WhatsApp)

Separação de Carga ficou pronta, pode usar.
Fica em Logística → Separação de Carga. Por enquanto só você vê: ligue a permissão "Separação de Carga" para quem separa.
Antes de entrar na câmara: feche o aplicativo, abra de novo pelo ícone com internet e abra a carga ainda com sinal.
Lá dentro funciona sem internet. Ao sair envia sozinho, e as etiquetas saem quando você tocar em "Imprimir agora".
Falta você conferir no iPhone/iPad (fechar e abrir sem sinal) e imprimir 2 bolsas de um pedido na Zebra.
Amostras ficaram só como aviso e as faltas só aparecem nessa tela. Se quiser diferente, me diga.
