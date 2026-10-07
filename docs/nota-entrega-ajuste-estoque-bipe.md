# Nota de entrega — Ajuste de Estoque: Enter com confirmação, leitor de código de barras e painel fixo

Data: 07/10/2026 · Veredito do gerente de entrega: **LIBERADO COM PENDÊNCIA** (as pendências são as coisas que só você consegue testar: leitor de verdade, iPad, iPhone).
O único item que reprovava (aparência da página de anúncio) foi corrigido e conferido em captura de tela.

---

## O que mudou (para quem usa)

Tudo nesta entrega é na tela **Produção/Estoque → Ajuste de Estoque**. Nenhuma outra tela mudou.

**1. Lançar pede confirmação antes de gravar**
- Digitou a quantidade e apertou **Enter** → abre uma **janela verde** "Confirmar ENTRADA". Apertou **Enter de novo** → grava. **Esc** → desiste, nada é lançado.
- Clicou em **− Saída** (com o motivo escrito) → abre uma **janela vermelha** "Confirmar SAÍDA".
- A janela mostra: código e nome do produto, o **+N / −N** bem grande, o estoque disponível **de → para** (se for ficar abaixo de zero, avisa em vermelho "Vai ficar negativo!") e o motivo.
- Os botões **+ Entrada** e **− Saída** continuam funcionando; eles só passam pela mesma janela.
- Saída sem motivo continua barrada **antes** da janela (o cursor pula para o campo Motivo, como já era).
- Depois de confirmar, Quantidade e Motivo se limpam e o cursor volta na Quantidade, pronto para o próximo.
- Se der erro ao gravar (rede, servidor), a janela fecha, os números ficam no formulário para tentar de novo e aparece o aviso.
- Dois Enters seguidos ou um clique duplo **não lançam em dobro** (provado pelo testador).

**2. Leitor de código de barras USB**
- Com um leitor USB plugado (ele funciona como um teclado), **bipe a etiqueta do pacote** e o produto é escolhido sozinho, mesmo que esteja fora do filtro de categoria. O cursor vai para a Quantidade e aparece o aviso "Bipado <código>" por 1,5 s.
- O sistema procura o código primeiro na **etiqueta de PCP** ligada ao produto; se não achar, no **EAN** do cadastro do produto.
- **Bipou o mesmo produto de novo: soma +1 pacote** na Quantidade (3 bipes = 3). O primeiro bipe só seleciona (quantidade começa em zero).
- Bipou **outro produto** com quantidade já digitada: troca de produto, zera e avisa "Troquei para …".
- **Código que não existe:** aviso vermelho. Se já tiver um produto escolhido, aparece o botão **"Vincular ao <produto>"** — grava o código nesse produto e nos próximos bipes ele já é achado. Só quem pode dar entrada/saída naquele produto vê o botão.
- Se o código já for de outro produto, ou se o produto já tiver outro código cadastrado, o sistema recusa e diz qual (para trocar, edite o cadastro do produto).
- Os números do leitor **não ficam** digitados na Quantidade nem na Busca. Digitar o código à mão continua funcionando como antes.
- **Com a janela de confirmação aberta, o bipe é ignorado** — o Enter do leitor **não confirma** o lançamento; aparece "Confirme ou cancele o lançamento antes de bipar". Isso vale também para o bipe que chega "atrasado" (se a janela abriu enquanto o sistema ainda procurava o código).
- Produto de categoria que o usuário não pode mexer: aviso vermelho, nada é escolhido.
- Quantidade acima de **10.000** num lançamento só não abre a janela ("Quantidade muito alta — confira se não foi o leitor"). Trava de segurança contra os dígitos do leitor caírem no campo.

**3. A tela não "pula" mais (computador, iPad e zoom)**
- A partir de 768 px de largura (computador, iPad e navegador com zoom 150%/200%): **só a lista de produtos rola**; o painel da direita fica parado.
- Se o painel não couber na tela, ele rola **por dentro**, e a **Quantidade com os botões + Entrada / − Saída fica sempre fixa no pé**, à vista.
- Ordem no painel do computador: card do produto → Motivo → Últimos lançamentos (rolam) → **Quantidade → botões** (fixos no pé).
- No **celular** (abaixo de 768 px): a lista some ao escolher, e a **Quantidade com os botões vira uma barra fixa no rodapé** da tela; "Voltar à lista" ficou maior (44 px, fácil de tocar). Os últimos lançamentos aparecem abaixo, com espaço para nada ficar escondido atrás da barra.
- Clicar num card no computador já põe o cursor na Quantidade (no celular não, para o teclado não abrir sozinho).

**4. Manual, Clippy e anúncio**
- Manual da aba `backend/manuais/abas/estoque-ajuste.md` atualizado com tudo acima (o Clippy passa a responder isso depois de publicar o backend).
- Página de novidade para o grupo e entrada em `novidades.json` (o Clippy balança avisando a equipe).
- Regra nova no `CLAUDE.md` para que toda tela "lista + painel" siga o mesmo padrão daqui para frente.

---

## O que foi testado e por quem

- **Build do frontend**: rodado por mim, gerente de entrega, agora: `✓ built in 5.95s`, sem erro. O CSS gerado contém a regra de altura da janela (100vh com fallback e 100dvh).
- **Revisor de código** (3 rodadas): reprovou a 1ª (bipe confirmava a janela, hook desligava no carregamento, trocas de produto perdidas, altura 100vh, vincular sobrescrevia EAN), tudo corrigido e conferido no código por mim. Aprovou a 2ª e a 3ª.
- **Testador (QA)**, clicando na tela de verdade (Chrome automatizado, app local), com capturas e scripts guardados:
  - Janela verde e vermelha abrindo; Enter confirma, Esc cancela; 2 Enters rápidos = 1 lançamento só.
  - Bipe com a janela aberta (verde e vermelha): ignorado, saldo intacto, aviso na tela. Bipe durante o carregamento da lista: funciona. Bipe "em voo" quando a janela abre: descartado. Clique manual em outro produto durante um bipe: vale o clique.
  - 3 bipes seguidos do mesmo produto = +3. Produto fora do filtro de categoria é escolhido. Código inexistente → aviso com "Vincular"; vincular OK (200) e recusa quando já tem código (409), com a mensagem certa na tela.
  - Usuário só com permissão de entrada: "− Saída" desabilitado. Produto de categoria sem permissão: 403 e aviso.
  - Teto: 10.001 não abre a janela; 10.000 abre.
  - Layout: página sem rolagem sobrando (altura do documento = altura da janela) em 1440, 1280, 1024, 960 e 768 px, com e sem a barra de visitantes do site, logado como admin e como usuário comum. Barra fixa no rodapé em 720×450, 375×812, 375×667 e 320×568, sem rolagem lateral, último lançamento visível acima da barra.
  - Outras telas (Pedidos, Clientes, Dashboard) abertas em 1440 e 375 sem regressão.
- **Checklist do projeto conferido por mim**: permissão do front igual à do back (o botão Vincular só aparece para quem o servidor também aceita); nenhuma transação, upload, impressão ou `<select>` novo; tela já carregada com `lazyComRetry`; nenhum segredo no diff; o SQL novo do backend usa exatamente as colunas que existem no banco (`etiquetas_produtos.codigo_barras`, `produtos.ean`); códigos de produto citados na novidade são do catálogo real (3081, 5569, H22MI4), não de teste.

---

## Item que reprovava (já corrigido)

A página de anúncio estava sem o estilo dos accordions (títulos apareciam como botões cinza). O bloco de CSS foi copiado da página de referência e a captura em 375 px mostra os 4 blocos como cartões brancos com ícone verde, sem scroll horizontal.

---

## O que você precisa conferir (só você consegue)

1. **Leitor USB de verdade** (1 minuto): abra Ajuste de Estoque, bipe um pacote com etiqueta do PCP. Tem que escolher o produto e mostrar "Bipado …". Bipe de novo → Quantidade vira 1, de novo → 2. Enter → janela verde → Enter → gravou. Depois, com a janela verde aberta, bipe: tem que aparecer "Confirme ou cancele…" e **não** gravar.
2. **iPad / Safari**: a mesma tela no iPad — lista rola sozinha, painel parado, botões sempre visíveis; janela verde abre e fecha com Enter/Esc (teclado externo) ou toque.
3. **iPhone**: escolha um produto e veja a barra "Quantidade / − Saída / + Entrada" fixa no rodapé; role até o fim dos últimos lançamentos e confira que nada fica escondido atrás da barra.
4. **Zoom real do navegador** (Ctrl/Cmd +): em 150% e 200% nada corta e os botões continuam acessíveis (testado em janela encolhida, mas não com o zoom de verdade).
5. **Duas decisões suas, dá para trocar se preferir:**
   - **Bipe repetido soma 1 pacote** e **o primeiro bipe só seleciona** (quantidade começa em zero). Alternativas: primeiro bipe já contar 1; ou somar a quantidade da caixa em vez de 1 pacote.
   - **Ordem no painel do computador: Motivo em cima, Quantidade e botões no pé** (fixos). Se preferir Quantidade antes do Motivo, é só pedir.

---

## O que ficou pendente ou de fora

- **Tecla espaço na janela de confirmação** (ressalva baixa do revisor, aceita como pendência): a janela bloqueia a tecla espaço ao apertar, mas no Safari/Firefox um botão focado pode disparar ao soltar a tecla. Só afetaria um código de barras **que contenha espaço** — os códigos de etiqueta são só dígitos (EAN-13), então na prática não acontece. Fica anotado para corrigir junto com a próxima mexida nessa janela (bloquear também o `keyup`).
- **Teto de 10.000 por lançamento**: lançamentos maiores precisam ser divididos em dois.
- **EAN antigo com "lixo"** (espaço, hífen) no cadastro do produto: o bipe acha mesmo assim (o sistema limpa antes de comparar), mas o botão **Vincular** recusa com 409 enquanto o EAN antigo for diferente — a saída é editar o cadastro do produto.
- **Balão do Clippy** cobre o canto direito do campo Quantidade em 1440 px enquanto há novidade não lida (ele some ao clicar). É do Clippy, não desta tela.
- **Telas candidatas à mesma regra "lista + painel"** ainda não migradas (ficam para quando forem tocadas): Posição de Estoque, Ficha do Funcionário (RH), Gerenciar Produto.
- **Nenhuma automação com o leitor sem fio** foi testada (o pedido foi USB; o sem fio funciona igual, como teclado, mas não foi provado).

---

## Para o grupo do WhatsApp

Link: https://cahardt-github.xrqvlq.easypanel.host/novidade-ajuste-estoque-bipe.html

Texto pronto:

```
📦 *Novidade no Hardt App — Ajuste de Estoque*

✅ *Confirmação antes de lançar*: digitou a quantidade, Enter → abre a janela *verde* (entrada) ou *vermelha* (saída) mostrando de → para. Enter de novo confirma, Esc cancela. Nada é lançado sem confirmar.

🔍 *Leitor de código de barras*: bipe o pacote e o produto é escolhido sozinho. Bipou de novo = +1. Código novo? Tem o botão *Vincular*.

🖥️ *A tela não pula mais*: só a lista rola, o painel de lançamento fica parado e os botões sempre à vista (no celular, barra fixa no rodapé).

Veja como funciona 👇
https://cahardt-github.xrqvlq.easypanel.host/novidade-ajuste-estoque-bipe.html
```
