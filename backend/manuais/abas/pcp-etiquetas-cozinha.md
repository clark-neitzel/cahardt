---
aba: PCP — Etiquetas da Cozinha
rota: /pcp/etiquetas/cozinha
permissao: pcp.etiquetas
---

# PCP — Etiquetas da Cozinha

## O que é

A tela para a cozinha colar etiqueta de **lote, fabricação e validade** nos recheios, massas e qualquer outro item que não tem receita. Você escolhe o item, confere as datas e toca em **Imprimir**: a etiqueta sai direto na Zebra da cozinha, **sem abrir janela de impressão**, do iPad, do celular ou do computador.

Quem pode usar: administradores e quem tem a permissão **PCP → Etiquetas**. A tela de cadastro das impressoras (Configurações → Impressoras) é só do administrador.

## O que dá pra fazer aqui

- **Escolher o item** em blocos grandes, separados por abas com contagem: **Favoritos** (os 6 que você mais etiquetou nos últimos 30 dias; se você ainda não etiquetou nada, mostra os 6 mais usados por todos), **Recheios**, **Massas**, **Outros** e **Todos**. A aba escolhida fica lembrada. Use a busca para achar por pedaço do nome (não precisa acento nem maiúscula).
- **Digitar um item novo** (que não está na lista): escreva o nome. Se já existir um com o mesmo nome (mesmo com outra caixa ou acento, ex.: "açúcar mascavo" e "Açucar Mascavo"), o sistema usa o que já existe; senão cria uma vez só, na aba **Outros**. Esse item **não entra no Estoque PCP**.
- **Data de fabricação**: Hoje, Ontem ou outra data (até 7 dias atrás; nunca no futuro).
- **Conservação**: **Refrigerado** ou **Congelado**. Ao trocar, a validade sugerida muda sozinha e a tela mostra a data final.
- **Validade**: vem do prazo cadastrado no item (Itens PCP → "Validade refrigerado/congelado (dias)"). Se o item ainda não tem prazo, o sistema **não inventa**: avisa para definir a validade e você escolhe um prazo nos botões (3/7/30/90 dias) ou digita. Se você mudar o prazo sugerido, o sistema anota que a validade foi alterada.
- **Peso** (opcional): digitado em kg, é só informativo na etiqueta — **não mexe em estoque nenhum**.
- **Quantidade** de etiquetas (1 a 200) e **tamanho**: **40×25** (pequena, sai em 2 por linha) ou **100×120** (grande). O tamanho que você usou por último para aquele item fica lembrado. Na 40×25, se a quantidade for ímpar, a última etiqueta sai sozinha.
- **Responsável**: quem fabricou. Aparecem você e os colegas da cozinha como botões; também dá para escolher "outra pessoa".
- **Imprimir** (um toque só): o botão trava e mostra o andamento. Se tocar duas vezes sem querer, sai **uma** etiqueta só. Cada impressão ganha um **lote** no formato `AAMMDD-NN` (ex.: `261019-03`), que reinicia a cada dia.
- **Hoje na cozinha**: lista do dia com o total de etiquetas e de lotes, e o estado de cada impressão. Dá para ver outro dia ou o histórico de um item.
- **Reimprimir**: repete a etiqueta do **mesmo lote** (mesmo número, mesmas datas), com a quantidade que quiser. Impressão nova (botão Imprimir) sempre gera lote novo.

## Avisos que podem aparecer

- **"O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos."**: ligue o PC da cozinha; a etiqueta sai quando ele voltar. Passou de 15 minutos, o pedido expira e é preciso imprimir de novo.
- **"Nenhuma impressora ativa configurada para 40×25 / 100×120"**: peça a um administrador para ativar a impressora em Configurações → Impressoras.
- **"O lote ... foi registrado, mas a etiqueta não entrou na fila"**: o lote existe; use **Reimprimir** (ou avise o administrador se a impressora está mal configurada).
- Erro da impressora (sem papel, tampa aberta): a tela mostra a mensagem e o botão **Tentar de novo** (repete o mesmo lote).
- **"Voltar e editar"**: aparece junto com o erro. Se o erro for de preenchimento (por exemplo, data fora do prazo ou impressora desativada), só esse botão aparece, porque repetir o mesmo pedido falharia igual: corrija o campo e imprima de novo. Nesse caso, imprimir de novo cria um lote novo.
- **"Defina a validade"**: o item ainda não tem prazo cadastrado. Escolha 3, 7, 30 ou 90 dias (ou digite o prazo) para liberar o botão Imprimir. Para resolver de vez, cadastre os prazos em PCP → Itens.
- **Data de fabricação fora do prazo**: o botão Imprimir fica desabilitado com a mensagem; só vale de 7 dias atrás até hoje.
- O botão **Reimprimir** fica desabilitado enquanto aquele lote ainda está na fila ou imprimindo, para não sair etiqueta em dobro.

## Regras importantes

- A etiqueta mostra o dia da semana da fabricação, item, fabricação, validade, conservação, peso, lote e responsável.
- Nada nesta tela altera estoque, receita ou custo.
- **Itens PCP**: ao editar um item (PCP → Itens) há os campos **Validade refrigerado (dias)**, **Validade congelado (dias)** e **Grupo na cozinha** (Recheio, Massa, Outro ou nenhum), e a lista tem o filtro **Grupo na cozinha**. Item criado pelo botão Digitar aparece com o selo **Criado na cozinha**.
- Cada impressão é registrada com quem pediu, quem fabricou e se o prazo foi alterado.

## Dados técnicos (para o Clippy)

| Endpoint | O que faz |
|---|---|
| `GET /api/pcp/etiquetas-cozinha/itens` | itens por aba + contadores |
| `GET /api/pcp/etiquetas-cozinha/favoritos` | 6 mais etiquetados |
| `GET /api/pcp/etiquetas-cozinha/equipe` | responsáveis |
| `GET /api/pcp/etiquetas-cozinha/hoje` | lotes do dia / histórico |
| `POST /api/pcp/etiquetas-cozinha/imprimir` | cria o lote e manda para a fila |
| `POST /api/pcp/etiquetas-cozinha/lotes/:id/reimprimir` | repete o lote |
