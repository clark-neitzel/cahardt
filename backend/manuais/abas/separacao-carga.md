---
aba: Separação de Carga
rota: /separacao-carga
permissao: Pode_Separar_Carga
---

# Separação de Carga

## O que é

Tela feita para usar **dentro da câmara fria**, no iPad ou no celular, na hora de separar a mercadoria de uma carga. Substitui a folha de embarque impressa: letra grande, botões grandes, e **funciona sem internet**. Para cada produto aparecem três números: **SEPARAR** (o que o pedido pede), **SEPAREI** (o que você já tirou) e **FALTA** (a diferença).

Importante: o que você marca aqui **fica só registrado na separação**. Não muda pedido, nota fiscal, estoque nem a carga no Embarque. Nenhum aviso é mandado a ninguém (nem WhatsApp).

---

## Quem pode usar

Quem tem a permissão **Pode_Separar_Carga** (ligada em Administração → Usuários → Permissões, grupo Logística) e o administrador. **Não precisa** ter acesso à tela de Embarque nem à de Pedidos. Sem a permissão, a tela não aparece no menu e o sistema recusa os envios.

---

## Como fazer (passo a passo)

1. **Com internet**, abra Logística → Separação de Carga e escolha a carga. Aparecem só as cargas que ainda têm **pelo menos um pedido pendente de entrega**: data de saída de ontem em diante e conferência da doca ainda não concluída. Carga em que todos os pedidos já foram entregues (ou cancelados/devolvidos) some da lista, e o número de pedidos mostrado conta apenas os pendentes. No aparelho que já tinha essa carga guardada, ela abre na hora (mesmo sem sinal) e, se o servidor confirmar que já foi entregue e não houver nada seu esperando para ser enviado, fecha sozinha logo em seguida e some do aparelho.
2. Ao escolher, a carga é **baixada para o aparelho**. Toque na barra da carga ("Trocar ▾"): no painel que abre aparece o texto verde "Carga baixada neste aparelho — pode entrar na câmara". Na barra fechada fica a bolinha e "baixada no aparelho".
3. Entre na câmara e separe. Cada toque é guardado no aparelho na mesma hora — se a tela apagar ou o app fechar, nada se perde.
4. Ao sair da câmara e voltar o sinal, tudo é enviado sozinho. O painel da barra mostra quantos toques ainda não foram enviados.
5. Toque em **Concluir separação** no fim. Se sobrou produto sem tocar, o sistema pergunta antes ("N produtos ainda não foram tocados"). Ao concluir aparece "Separação concluída. As faltas ficaram registradas." (sem sinal: "Será enviada quando o sinal voltar"). A tela passa a mostrar "Separação concluída por X em data".
6. Se a carga tem amostras, aparece o aviso amarelo "Esta carga tem N amostra(s) — separe à parte." (amostras não entram como linhas da separação).

---

## Os dois modos

### Carga inteira
Lista de produtos em ordem alfabética, cada um com a **soma de todos os pedidos da carga**. Serve para tirar tudo de uma vez e depois dividir.
- **+ / −** ajustam o SEPAREI (não passa de zero nem do total pedido). Tocando no número dá para **digitar** o valor.
- **✓ Separei tudo** fecha a linha (fica verde, FALTA vira ✓). Tocar de novo desfaz.
- Se separou menos do que pediu, aparece a **razão da falta**: **Vem depois** (vai chegar/ser produzido) ou **Não tem**.
- **Só o que falta** esconde as linhas já prontas.
- **Ficou faltando** lista só os produtos em que você mexeu e que ainda têm falta, com a razão de cada um.

### Por pedido (bolsa térmica)
Um pedido por vez, para montar a bolsa de cada cliente. Cada pedido mostra o status: A separar, Separando, Com falta, Separado. Vale tudo do modo anterior (+, −, ✓, razão da falta), só que dentro do pedido.
- Os pedidos que **saíram, foram cancelados ou já foram entregues** não aparecem: só entram na separação os pedidos ainda pendentes de entrega (vale nos dois modos, por carga e por pedido).
- **Próximo pedido** leva ao seguinte na ordem, pulando os já prontos; também dá para abrir qualquer pedido na lista.
- Os dois modos são **independentes**: o que você separa em "Carga inteira" não preenche o "Por pedido", e vice-versa.

### Ordem dos pedidos
Em "Por pedido" você escolhe a ordem: **Da carga** (a mesma da folha), **Por cidade** ou **Eu escolho** (toque nos pedidos para numerar 1º, 2º, 3º…; tocar de novo tira o número; quem ficou sem número vai depois; **Limpar ordem** zera). A ordem **fica guardada na carga** — vale em qualquer aparelho e continua ao recarregar.

---

## Bolsas e etiquetas

No modo "Por pedido", cada pedido tem o contador de **bolsas** (de 0 a 20). Toque em **Imprimir N etiquetas** para sair uma etiqueta "BOLSA 1 de N", "2 de N"… com cliente, cidade, pedido, carga, data de entrega e motorista. Elas saem na impressora de etiqueta 100×120 da cozinha, na ordem em que você separou os pedidos. Se houver mais de uma impressora, a tela pede para escolher (e lembra a escolha).

---

## Sem internet (dentro da câmara)

- **Baixe a carga antes** de entrar, com sinal. Sem carga baixada e sem sinal, a tela avisa e não deixa começar.
- Sem internet a bolinha da barra fica **amarela** e a barra mostra "sem internet · N guardados", e o painel mostra uma faixa **escura**: "Sem internet · tudo guardado no aparelho". Dá para recarregar a página ou fechar e abrir o app: os toques continuam lá.
- **Ao voltar o sinal** os toques são enviados sozinhos, em poucos segundos.
- **Etiquetas pedidas sem internet** ficam guardadas ("N etiquetas guardadas — você imprime ao sair"). Elas aparecem numa faixa escura. Ao voltar o sinal a faixa fica **amarela**: "N etiquetas esperando · **Imprimir agora**". **Nada imprime sozinho**: só quando você toca em "Imprimir agora" (e sai na ordem em que foram pedidas; tocar de novo não duplica).
- Se **duas pessoas** mexem na mesma linha, vale o **último toque**; linhas diferentes se somam.
- **A carga mudou:** se, enquanto você separava, o escritório tirou/colocou um pedido ou mudou uma quantidade, ao voltar o sinal aparece o aviso **"A carga mudou"** dizendo o que entrou, o que saiu e o que mudou de quantidade. Depois do OK a tela passa a mostrar a carga nova e os toques das linhas que continuam são mantidos (o que você tinha tocado em pedido que saiu da carga e ainda não tinha sido enviado sai da fila do aparelho — a tela avisa "N toques seus eram de pedido que saiu da carga e foram descartados". O que já tinha sido enviado continua registrado no servidor, mas não aparece mais na tela).
- **Fechou o app lá dentro?** Abrindo de novo pelo ícone, sem sinal: se há separação em andamento neste aparelho e a pessoa tem a permissão, o app abre direto na Separação de Carga. As outras telas mostram "Sem conexão" até o sinal voltar.
- Aviso "Feche e abra o app uma vez com sinal antes de entrar na câmara" aparece quando o aparelho ainda não está pronto para funcionar sem sinal.
- Se a carga foi apagada do sistema, o aparelho guarda seus toques e avisa; ele não descarta nada sozinho.

---

## Letra grande (A− / A+)

Os botões **A−** e **A+** (no painel da barra) aumentam ou diminuem a letra da **tela inteira**, de 15 a 29, de 2 em 2. O tamanho escolhido fica lembrado por usuário. O cabeçalho fixo e as telas pequenas usam um teto menor para não cobrir a lista.

---

## Avisos e faixas

- Avisos de problema (envio parado, memória do aparelho cheia): no cabeçalho aparece uma linha vermelha "⚠ … — toque para ver". Tocando, a tela vai até o aviso, que tem o motivo, quantos toques estão guardados e o botão "Tentar de novo". Nada é perdido: fica guardado no aparelho.
- A faixa de etiquetas fica abaixo do cabeçalho e rola com a tela. Se a lista de impressoras falhar, mostra o motivo e "Tentar de novo"; com mais de uma impressora, pede para escolher.
- Mudar o número de bolsas de um pedido que já está esperando impressão atualiza a quantidade de etiquetas; bolsas = 0 tira o pedido da fila. Se a etiqueta tinha dado erro ou foi pedida sem sinal, continua esperando o seu toque em "Imprimir agora" / "Tentar de novo".

---

## Concluir separação

Registra quem concluiu, quando e um resumo (quantos produtos completos, quantos com falta, quantos sem tocar, e a lista de faltas com a razão). Pode concluir de novo depois; vale a última. Concluir **não fecha a carga** nem avisa ninguém: é só o registro. Reenviar a mesma conclusão (por falha de internet) não cria duplicata.

---

## Depende de / Interfere em

- **Embarque** — a carga e os pedidos vêm de lá. Separar **não** altera a carga (a folha impressa não fica "desatualizada") e a conferência da doca (bipagem) continua independente.
- **Impressão de etiquetas (cozinha)** — as bolsas usam a mesma fila e impressora 100×120 das etiquetas de pedido, com permissão própria (`Pode_Separar_Carga`).
- **Pedidos / estoque / fiscal** — nada é alterado.

---

## Arquivos no código

- `backend/routes/separacaoCarga.js` e `backend/services/separacaoCargaService.js` — API `/api/separacao-carga` (cargas, baixar, sincronizar)
- Tabelas `separacao_cargas`, `separacao_carga_linhas`, `separacao_carga_pedidos`, `separacao_carga_conclusoes`
- `backend/routes/impressaoEtiquetasRoutes.js` — origem `SEPARACAO` das etiquetas
- `frontend/src/pages/Logistica/SeparacaoCarga/`
