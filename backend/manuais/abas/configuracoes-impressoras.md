---
aba: Config — Impressoras
rota: /config/impressoras
permissao: admin (somente administradores)
---

# Config — Impressoras (impressão direta de etiquetas)

## O que é

A tela que liga o sistema às etiquetadoras da cozinha (Zebra) **sem abrir a janela de impressão**. Em vez de imprimir pelo navegador, o sistema grava um **pedido de impressão numa fila** e um pequeno programa instalado no computador da cozinha (o **agente**) busca o pedido e manda direto para a impressora. Funciona do iPad, do celular ou do computador — quem clica não precisa estar perto da impressora.

Conceitos:
- **Agente** = o programa instalado no PC da cozinha (o PC que tem as Zebras ligadas por USB). Cada PC tem o seu, com uma **senha própria** (token).
- **Impressora** = cada Zebra cadastrada aqui, ligada a um agente. Guarda a linguagem (EPL2 ou ZPL), o tamanho da etiqueta (40x25 ou 100x120) e os ajustes finos.
- **Fila** = a lista de pedidos de impressão e o que aconteceu com cada um.

> Esta tela é só para **administradores**. Quem tem a permissão de etiquetas do PCP apenas escolhe a impressora na hora de imprimir (nas telas de etiqueta que usam a impressão direta).

---

## O que dá pra fazer aqui

- **Criar um agente** (um por PC). O sistema mostra a senha **uma única vez** e entrega o arquivo **instalador** (`.bat`) já preparado para aquele PC.
- Ver se cada agente está **online** (verde), **instável** (amarelo) ou **offline** (vermelho), a versão do agente e quando falou com o sistema pela última vez
- **Atualizar a lista** de impressoras que o Windows do PC enxerga
- **Trocar a senha (rotacionar o token)** de um agente — a senha antiga para de valer na hora
- **Revogar** um agente (corta o acesso dele)
- **Cadastrar uma impressora**: escolher o agente, escolher a impressora **da lista do Windows**, informar linguagem, tamanho, colunas e ajustes
- **Testar a impressão** de uma impressora (quatro botões, ver abaixo)
- Acompanhar a **fila** de impressão: pendente, enviando, impresso, erro, expirado, cancelado — com a mensagem de erro quando houver
- **Reenviar** um pedido (cria um pedido novo igual) e **cancelar** um que ainda está pendente

---

## Como usar

### 1. Instalar o agente no PC da cozinha (uma vez)

1. No PC da cozinha, abra o sistema, vá em **Configurações → Impressoras** e crie o agente (dê um nome, por exemplo "PC da cozinha").
2. Baixe o **instalador** que aparece junto com a senha. (A senha só aparece agora; se perder, use **Trocar senha**.)
3. Clique com o **botão direito** no arquivo baixado e escolha **Executar como administrador**.
4. Espere a mensagem verde **"Agente instalado e funcionando"**. O instalador oferece apagar o próprio arquivo no final — responda **S** (o arquivo tem a senha dentro).
5. Volte ao sistema: a bolinha do agente fica **verde** em poucos segundos e as impressoras do PC aparecem na lista para cadastrar.

O agente passa a ligar sozinho com o Windows, **sem precisar de ninguém logado**, e se atualiza sozinho quando sai versão nova. O instalador também desliga a suspensão/hibernação do PC (o PC precisa ficar ligado). Para remover o agente existe o arquivo **desinstalador** (link discreto "Baixar desinstalador" na janela da senha).

### 2. Cadastrar a impressora

1. Clique em **Nova impressora**.
2. Escolha o **agente** e a **impressora do Windows** (da lista que o agente enviou).
3. Informe a **linguagem**: a Zebra TLP 2844 usa **EPL2**; a de etiqueta grande (ZDesigner) usa **ZPL** (o teste abaixo descobre qual das duas funciona).
4. Informe o **tamanho** (40x25 ou 100x120). Na 40x25 o rolo tem **2 etiquetas lado a lado** (2 colunas, rolo de 84 mm).
5. A impressora nasce **inativa** (aparece com a etiqueta cinza **Inativa**) — só entra em uso depois que o teste sair certo. Os botões de teste funcionam mesmo inativa. Depois de testar, clique em **Ativar** na linha da impressora.

### 3. Testar

- Botões **Teste de texto (EPL2)** e **Teste de texto (ZPL)**: imprimem 3 linhas simples. A que sair **legível** mostra qual é a linguagem certa da impressora; a outra pode sair lixo ou nada — é normal, é assim que se descobre.
- Botão **Etiqueta de exemplo**: imprime uma etiqueta fictícia "RECHEIO DE TESTE" no layout real, para conferir margens, as duas colunas, o tamanho da letra e se nada ficou cortado.
- Botão **Teste de imagem**: prova que a impressora aceita etiqueta **em imagem** (é assim que saem as etiquetas de produto e as caixas). Deve sair: **moldura, quadrado preto no canto superior esquerdo, letra F, dois códigos de barras e um QR**. Se sair **em negativo** (fundo preto), ligue **Inverter imagem** em Editar (veja Ajustes finos).
- Se algo sair deslocado, os **ajustes** (posição das colunas, deslocamento, densidade) corrigem sem mexer em código.

#### Ajustes finos (imagem)
Em **Editar impressora → Ajustes finos (imagem)** (seção recolhida; só administrador):
- **Inverter imagem (pequena/EPL2)**: liga se o teste de imagem sair em negativo.
- **Compressão da imagem (grande/ZPL)**: Z64 (padrão, mais leve) ou HEX (mais pesado e mais compatível; use se a Z64 sair truncada ou lixo).
- **Deslocar para a direita / para baixo (dots)**: de 0 a 200 (8 dots = 1 mm). Corrige imagem deslocada na etiqueta; não aceita número negativo.

Na **Fila**, cada pedido mostra o tipo (Teste de impressão, Etiqueta de produto, Caixa Kit Festa/Delivery, Cozinha) e, quando existir, o que foi impresso (ex.: o produto ou o pedido).


---

## Dúvidas comuns

- **A bolinha está vermelha.** O agente não falou com o sistema há mais de 2 minutos: o PC da cozinha está desligado, sem internet ou o programa parou. Ligue o PC / confira a internet. O agente volta sozinho.
- **O pedido ficou "Pendente" e depois "Expirado".** Ninguém buscou a tempo (padrão: 15 minutos). Etiqueta velha **nunca** sai sozinha depois — reenvie o pedido.
- **Deu erro "Impressora offline / sem etiqueta".** A etiquetadora está desligada, sem rolo, com a tampa aberta ou etiqueta enroscada. Resolva e use **Reenviar**.
- **A etiqueta saiu duas vezes.** O agente guarda o que já imprimiu para evitar isso; se acontecer, avise quem cuida do sistema.
- **Perdi a senha do agente.** Use o botão **Trocar senha**: aparece uma nova senha e um novo instalador (a antiga deixa de valer). Rode o novo instalador no PC.
- **Suspeito que a senha vazou.** Use **Trocar senha** (ou **Revogar**) na hora.
- **Saiu lixo ou nada na impressora.** Linguagem errada. Teste a outra (EPL2 ou ZPL) e corrija o cadastro.
- **A impressão pelo navegador (Kit Festa, etiqueta de produto) mudou?** Não. Continua como antes; esta fila é um caminho à parte.


## Etiquetas atuais pela Zebra (10/2026)
As etiquetas de produto (100 × 120) e as das caixas Kit Festa/Delivery (40 × 25) agora também saem por esta fila, como **imagem**: PCP → Etiquetas, Pedidos Online → Kit Festa e Delivery ganharam o botão **Imprimir na Zebra**. Na **Fila** o tipo aparece como etiqueta de produto ou caixa Kit Festa, com a **referência** (produto/pedido). Precisa de uma impressora ativa de cada tamanho (100×120 ZPL e 40×25 EPL2) neste cadastro. O ajuste fino (polaridade, posição, compressão) continua nos ajustes da impressora; o aumento do código de barras para 3 pontos é feito no aparelho (`localStorage etiquetas:eanModuloDots`) pelo time técnico.
