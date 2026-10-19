# Nota de entrega — E2: aba "Etiquetas da Cozinha" (recheios, massas e itens sem receita)

**Data:** 19/10/2026
**Veredito do gerente de entrega:** **LIBERADO COM PENDÊNCIA** — pode commitar e publicar. O que falta só você consegue fazer: imprimir um recheio de verdade pelo iPad nas duas Zebras e cadastrar as validades dos itens (passo a passo na seção 3).

---

## 1. O que mudou (em termos de uso)

No menu **PCP** apareceu o item **"Etiq. Cozinha"**. É uma tela só para a cozinha etiquetar recheio, massa e qualquer outra coisa que não tem receita, usando a impressão direta que já funciona desde a E1 (a etiqueta sai na Zebra sem abrir janela de impressão).

**Como usar em 3 toques:**
1. **Toque no item** (blocos grandes, separados em Favoritos / Recheios / Massas / Outros / Todos, com busca por pedaço do nome).
2. **Confira a validade** — a tela já sugere o prazo cadastrado no item e mostra a data final por extenso ("vence quinta, 22/10"). A fabricação vem como Hoje (dá para escolher Ontem ou outra data de até 7 dias atrás). Trocar Refrigerado por Congelado troca a validade sugerida sozinho. Peso é opcional e só aparece na etiqueta.
3. **Toque em Imprimir.** O botão trava, mostra "Enviando… → Imprimindo… → Saiu" e a etiqueta sai na Zebra com **lote** (formato `AAMMDD-NN`, ex.: `261019-03`, reinicia todo dia), fabricação, validade, conservação, peso e **quem fez**.

**Outros pontos da tela:**
- **Digitar**: para um item que não está na lista, você escreve o nome. Se já existir um com o mesmo nome (mesmo com acento ou maiúscula diferente), o sistema usa o que já existe; senão cria um só, na aba Outros. Esse item **não entra no Estoque PCP** e aparece em Itens PCP com o selo "Criado na cozinha".
- **Hoje na cozinha**: lista do que já foi etiquetado no dia (total de etiquetas e de lotes, estado de cada impressão: na fila, imprimindo, saiu, não saiu).
- **Reimprimir**: repete a etiqueta do **mesmo lote** (mesmo número, mesmas datas), com a quantidade que quiser. O botão fica travado enquanto aquele lote ainda está na fila, para não sair em dobro.
- **Se o PC da cozinha estiver desligado**, a tela avisa e a etiqueta fica na fila por 15 minutos; sai sozinha quando ele voltar.
- **Se a impressora der erro** (sem etiqueta, tampa aberta), aparece a mensagem e o botão "Tentar de novo".
- **Toque duplo ou falha de rede** nunca gera duas etiquetas nem dois lotes.

**Em Itens PCP** (PCP → Itens → editar), apareceram 3 campos novos: **Validade refrigerado (dias)**, **Validade congelado (dias)** e **Grupo na cozinha** (Recheio / Massa / Outro / nenhum). É daí que a tela da cozinha puxa a validade sugerida e decide em qual aba o item aparece. Vale para item criado no PCP e para item importado do cadastro de Produtos. A lista de Itens PCP ganhou o filtro "Grupo na cozinha".

**O que não mudou:** etiquetas de produto (80×100 com código de barras) e etiquetas das caixas do Kit Festa continuam como antes. Nada nesta tela mexe em estoque, receita ou custo.

---

## 2. O que foi testado e por quem

**Conferido por mim (gerente de entrega), hoje, no disco local:**
- Build do frontend: passou (`✓ built in 5.84s`).
- Testes do backend: **68 passaram, 0 falharam** (inclui os testes novos do lote `AAMMDD-NN` e da faixa 1..730 dos campos da cozinha).
- `npx prisma validate`: schema válido. **Nada foi removido** do schema — só entrou a tabela `etiquetas_cozinha_lotes` e a relação com a fila de impressão.
- Nenhum `window.print`, `window.open` ou iframe nos arquivos da aba (a impressão é só pela fila da E1).
- Permissão igual no front e no back: administrador ou `pcp.etiquetas`.
- Nenhum segredo (token, senha, chave) no diff.
- Manual da aba criado (`pcp-etiquetas-cozinha.md`), índice e tabela do Clippy atualizados; manuais de Itens PCP e Estoque PCP ganharam a nota dos campos novos e do item "criado na cozinha".
- `novidades.json` válido com a entrada no topo; página de novidade sem `og:image`, sem "Abrir o app", 8 accordions todos abertos, 3 mockups de tela com 37 legendas numeradas.
- `deployMarker` do `/admin-exec/ping` virou `etiquetas-cozinha-e2-2026-10-19` (é como vou confirmar que a versão nova subiu).

**dev-backend** (curls gravados em `docs/etiquetas-cozinha/evidencias-e2/`):
- Imprimir item cadastrado 40×25 qtd 3 → lote `261019-01`, trabalho na fila, aviso de PC desligado (201).
- Mesmo pedido repetido (mesmo `requisicaoId`) → devolve o **mesmo** lote, não cria outro (200, `repetido: true`).
- Validade alterada marca `validadeAlterada: true`; congelado 90 d igual à sugerida fica `false`.
- "Digitar" nome novo cria item `SUB-0011`; repetir com outra caixa/acento reaproveita o mesmo item; nome de item inativo reativa em vez de duplicar.
- Sem impressora ativa → 409 com mensagem em português, **sem** criar lote nem item.
- Impressora mal configurada → lote fica registrado, aviso explica, e o retry com o mesmo `requisicaoId` reenfileira sem segundo lote.
- Item criado na cozinha **não aparece** no Estoque PCP; classificação automática em simulação não grava nada.
- Data futura, responsável inexistente e usuário sem permissão → 400/400/403.

**dev-frontend + QA (capturas em `docs/etiquetas-cozinha/evidencias/e2/` e `.../e2/qa/`)** — 194 capturas; eu abri e conferi:
- Fluxo completo até "Saiu da impressora" com a linha em Hoje na cozinha (`desk-08-saiu.png`).
- Erro da impressora com "Tentar de novo" e "Voltar e editar" no celular 375 px (`qa/08-m375-erro.png`).
- Gaveta no celular como bottom-sheet, chips grandes, "3 d · sugerida" marcado (`qa/08-m375coz-gaveta.png`).
- PC desligado: aviso amarelo + "na fila" + botão Reimprimir travado (`fix-d1-d4-fila.png`).
- Hoje na cozinha com saiu / na fila / não saiu e Reimprimir (`qa/05-reimprimir-1280.png`).
- Itens PCP com os 3 campos novos (`qa/07-form-itempcp-1280.png`); página de novidade no celular (`qa/09-novidade-375-topo.png`).
- QA testou com 3 perfis (admin, Josiane com a permissão, Producao sem a permissão → tela "sem permissão"), iPad paisagem e retrato, celular 320/375 px com teclado aberto, sem rede, sem impressora.
- QA apontou 3 defeitos (impressora inativa aparecendo para admin, lista sem recarregar, validação de data) — **todos corrigidos e re-testados** com captura `fix-*`.

**revisor-codigo**: aprovou backend e frontend; as 4 ressalvas do backend foram aplicadas e provadas com curl (`curls-8-ressalvas-revisor.txt`).

---

## 3. O que você precisa fazer

**1. Cadastrar validade e grupo nos itens (uma vez só).**
Em **PCP → Itens**, abra cada recheio e massa e preencha *Validade refrigerado (dias)*, *Validade congelado (dias)* e *Grupo na cozinha*. Item sem prazo aparece na cozinha com o aviso "defina a validade" e a pessoa tem que escolher o prazo na hora — funciona, mas é um toque a mais.
**Atalho:** se preferir, eu rodo a **classificação automática em simulação** (olha o começo do nome: "Recheio de…" vira Recheio, "Massa de…" vira Massa, nada é gravado) e te mostro a lista para você aprovar antes de aplicar. Os prazos em dias continuam sendo você quem define.

**2. Imprimir um recheio de verdade pelo iPad (1 minuto).**
Com o PC PRODUCAO ligado e o agente online (Configurações → Impressoras, bolinha verde):
- PCP → Etiq. Cozinha → toque em um recheio → Pequena 40×25, quantidade 3 → Imprimir. Confira no papel: lote, datas, nome de quem fez.
- Repita com uma massa na **Grande 100×120**, quantidade 1.
- Toque em **Reimprimir** na linha de "Hoje na cozinha" e confira que saiu o **mesmo lote**.
- Se puder: um item com acento ("Açúcar…"), um nome comprido, um congelado 90 dias, e um teste com o PC desligado (tem que aparecer o aviso amarelo e sair quando ligar).

**3. Mandar o anúncio no grupo** (texto pronto na seção 5). O Clippy já vai balançar sozinho avisando a equipe no computador.

---

## 4. O que ficou pendente ou de fora

- **Entrega 3 (próxima):** etiquetas de **produto** (80×100 com código de barras) e etiquetas das **caixas do Kit Festa** passando também pela fila da Zebra, sem janela de impressão. Hoje continuam como antes.
- **Favoritos** só se montam com o uso: a aba mostra os 6 itens que a pessoa mais etiquetou nos últimos 30 dias (enquanto ela não etiquetou nada, mostra os 6 mais usados por todos).
- **Teste em Safari/iPad real** não foi feito pela equipe (QA usou navegador automatizado nas medidas do iPad). É o item 2 acima.
- **Popups do administrador** ("Pedidos novos esperando", "Faturamento", "Hora da tarefa") aparecem por cima da gaveta quando o admin está na tela. É comportamento antigo do app, não desta entrega; a cozinha (usuário comum) não vê esses popups. Se incomodar, trato separado.
- **Usuário sem `Isento_Ponto`** cai no portão "Como você trabalhará hoje?" antes de qualquer tela — também pré-existente.
- `custoUnitario` vindo `null` ao editar item PCP: pré-existente, não é desta entrega (provado com PUT real antes e depois).
- As **capturas PNG** das evidências ficam fora do commit (tamanho); só os `.txt`/`.md` entram.

---

## 5. Texto pronto para o grupo do WhatsApp

```
🏷️ *Novidade no Hardt App: Etiquetas da Cozinha*

Agora dá pra etiquetar recheio, massa e qualquer item da cozinha direto do iPad ou do celular, *sem tela de impressão*. 🖨️

*Como usar (3 toques):*
1️⃣ Menu *PCP → Etiq. Cozinha* e toque no item
2️⃣ Confira a validade (o app já sugere) e quem fez
3️⃣ Toque em *Imprimir* — a etiqueta sai na Zebra com lote, fabricação e validade

✏️ Item que não está na lista? Toque em *Digitar*.
🔁 Precisa de outra igual? *Reimprimir* em "Hoje na cozinha" (mesmo lote).
⚠️ Se o PC da cozinha estiver desligado, o app avisa e a etiqueta sai quando ele ligar.

Veja como funciona, com as telas explicadas:
https://cahardt-github.xrqvlq.easypanel.host/novidade-etiquetas-cozinha.html
```
