# Nota de entrega — Navegação & Design + Vendas (12/09/2026)

**Veredito do gerente de entrega: LIBERADO COM PENDÊNCIA.** Commitado em `f1088c59` e publicado no GitHub em 12/09/2026; o EasyPanel já colocou no ar (as páginas de novidade respondem).

## Publicação
O commit e o push foram feitos por esta sessão. Existe trabalho de OUTRAS sessões (PIX/Asaas pós-quitação e API da IA v1.6.0) mexido na árvore mas **fora deste commit** de propósito. Não use `git add -A` / `git commit -a`, senão ele entra junto sem ter sido conferido.

## O que mudou (por tela)
- **Visual novo (5 telas piloto: Clientes, Embarques, Contas a Receber, Pedidos, Rota):** cabeçalho igual em todas, um único botão verde de ação (o resto vai num menu "⋯"), lista vazia explica o que fazer, avisos (toasts) no tema verde.
- **Menu lateral por função:** vendedor, motorista, escritório e PCP veem só os grupos que usam. Botão "Ver menu completo" no rodapé mostra tudo; a preferência fica salva por pessoa. Favoritos continuam mesmo com o grupo escondido.
- **Central de Pendências (menu → Central de Pendências):** uma tela reúne pedidos para aprovar, NF-e a emitir, caixas a conferir, notas recebidas, produção e tarefas atrasadas, com botão de ação na linha. Quem vê: admin, quem tem Fluxo de Caixa/DRE, ou a permissão nova **"Central de Pendências"** no painel de permissões.
- **Cursor no lugar (sua queixa):** no Ajuste de Estoque, depois de lançar, o cursor volta para Quantidade; Enter lança. Clique duplo não lança duas vezes (também no Inventário e no Contas a Pagar). Etiquetas: fechar o modal volta o foco na busca. Contas a Pagar: "+ Adicionar produto" já cai na quantidade.
- **Novo Pedido:** cada produto já comprado mostra "Última vez: N un em dd/mm"; botão "Repetir último pedido" pré-carrega a última compra de cada item; clique duplo em Salvar não cria pedido em dobro (defeito antigo, corrigido de passagem).
- **Rota (card do cliente):** nome grande, uma badge, botões Atender e Pedido lado a lado; detalhes em "Ver mais"; depois de criar o pedido aparece "Ver pedido #N".
- **Ficha do cliente:** aba nova "Qualidade dos dados" com GPS e WhatsApp do cliente, com os mesmos selos das telas de auditoria em lote, e botões para ajustar ali mesmo.
- **Pedidos Online:** Site (Congelados) e Kit Festa viraram uma entrada só, com abas. Links e favoritos antigos redirecionam.
- **Correção escondida:** os filtros salvos por usuário estavam sendo apagados a cada recarregar da página (bug antigo do hook compartilhado). Corrigido e retestado, inclusive trocando de usuário no mesmo navegador.
- Manuais do Clippy atualizados (pendências, pedidos-online, clientes, rota, pedidos, estoque, embarque, contas a receber, kit festa, site, menu) e 8 páginas de novidade registradas para o Clippy avisar a equipe.

## O que foi testado, e por quem
- QA clicou em tudo no app local com Chrome automatizado (desktop e 375px), com 103 capturas de tela: contadores da Central conferidos contra o banco, ação de aprovar pelo painel, permissão sem/ com acesso (403 na API, "Acesso negado" na tela), foco por teclado 3x seguidas, clique duplo, "Última vez" comparado com a query real, trava de estoque no item repetido, menus de 5 usuários de perfis diferentes, filtros sobrevivendo a 3 recarregamentos. Onde reprovou (clique duplo no estoque, "#null" no card da Rota, filtros não salvando, lista vazia sem botão), o dev corrigiu e o QA retestou — tudo passou na 2ª rodada.
- Revisor de código aprovou cada pedaço; eu conferi por amostragem: build do frontend passou (árvore de trabalho e só o índice, isolado), sintaxe dos 4 arquivos de backend OK, JSON de novidades válido, nenhum segredo no diff, permissão igual no front e no back, rotas com `lazyComRetry`, arquivos protegidos (NF de devolução, WhatsApp, IA, schema) intocados, CLAUDE.md ganhou só a exceção `raio-proprio`.

## Decisões tomadas no seu lugar (e como reverter)
- **Quem é "escritório"** no menu: tem permissão de Financeiro, Notas Fiscais ou Embarque e não é gestor nem entregador. Mudar: `frontend/src/hooks/usePerfil.js`.
- **Central de Pendências é item de menu**, não tela inicial nem cartão do dashboard. Promover depois é simples (telaInicial no painel de permissões).
- **"Repetir último pedido" = última compra de cada item** (não o último pedido exato). Preço é o de hoje, não o da época.
- **Troca de cinza fraco só nas 5 telas piloto**; o resto entra conforme cada tela for tocada.
- **B5 (Ana avisar inadimplência antes do pedido)** ficou de fora — depende de você liberar dado financeiro para o bot.

## O que só você consegue conferir (depois de publicar)
1. Entre com um usuário real do escritório e veja se o menu mostra os grupos certos; se faltar algo, "Ver menu completo" resolve na hora.
2. No iPad, no Ajuste de Estoque: lance 3 entradas seguidas só pelo teclado numérico e veja se o cursor volta e a tela não pula.
3. Abra a Central de Pendências e compare os números com as telas de origem (Pedidos, NF-e, Caixa). O bloco de NF-e pode dar alguns a menos que a fila (critério mais conservador).
4. Confira o bloco "boletos não enviados" contra o Contas a Receber de produção — no banco local não havia massa de dados para provar.

## Pendências e dívidas declaradas
- Telas de lote GPS/WhatsApp continuam com visual próprio (não migraram para o padrão v2). Cinza fraco fora das 5 pilotos. Componente SaudePontos não foi tocado.
- Dica "Faltou alguma tela?" reaparece se a pessoa ligar "Ver menu completo" pelo botão e depois desligar (só some de vez pelo ✕ ou pelo link da própria dica).
- Perfil PCP sem nenhuma permissão de estoque não vê "Produção/Estoque" (é dado de permissão, não bug).
- Na Rota, cliente com transferência ativa pode aparecer duplicado na grade (comportamento antigo, observado pelo QA, não investigado).
- B5 deferido; teste em iPad/Safari real e em produção não feito por esta equipe.

## Commit
`f1088c59` (código) · `7c27e87d` (regras na skill/agentes/CLAUDE.md) · `a3f66b8a` (pacote de diagnóstico)

---

## Textos para o grupo do WhatsApp (copiar e colar, um por vez)

*🎨 Visual novo nas telas mais usadas*
Cabeçalho igual em toda tela, botão de ação sempre verde e listas vazias que explicam o que fazer. Mudou em Expedição, Clientes, Contas a Receber, Pedidos e Rota.
https://cahardt-github.xrqvlq.easypanel.host/novidade-visual-v2.html

*🧭 Menu enxuto para cada função*
O menu lateral agora mostra só o que faz sentido pra quem está usando — vendedor, motorista, escritório ou PCP. Faltou alguma tela? Toca em *Ver menu completo* no rodapé.
https://cahardt-github.xrqvlq.easypanel.host/novidade-menu-por-perfil.html

*🔔 Central de Pendências*
Uma tela só reúne o que está esperando um clique: pedidos p/ aprovar, NF-e, caixas, notas recebidas, produção e tarefas atrasadas — com botão de ação direto na linha.
https://cahardt-github.xrqvlq.easypanel.host/novidade-central-pendencias.html

*⌨️ O cursor não some mais depois de lançar*
No Ajuste de Estoque, depois de dar entrada ou saída, o cursor volta sozinho pro campo Quantidade. Enter também lança direto.
https://cahardt-github.xrqvlq.easypanel.host/novidade-cursor-no-lugar.html

*🔁 Repetir último pedido*
No Novo Pedido, todo item já comprado mostra a última quantidade e data, e um botão pré-carrega o carrinho com a última compra de cada produto do cliente.
https://cahardt-github.xrqvlq.easypanel.host/novidade-repetir-pedido.html

*🪧 Card da Rota mais limpo*
Nome grande, uma badge, *Atender* e *Pedido* em destaque. O resto continua ali, um toque abaixo em *Ver mais*.
https://cahardt-github.xrqvlq.easypanel.host/novidade-card-rota.html

*🛡️ Qualidade dos Dados na ficha do cliente*
GPS e WhatsApp do cliente numa aba só, dentro da própria ficha — sem abrir as telas de auditoria em lote.
https://cahardt-github.xrqvlq.easypanel.host/novidade-ficha-cliente-qualidade.html

*🛍️ Pedidos Online, tudo num lugar só*
Site (Congelados) e Kit Festa viraram uma entrada de menu só, com uma aba pra cada canal. Nada mudou no funcionamento de cada um.
https://cahardt-github.xrqvlq.easypanel.host/novidade-pedidos-online.html

---

## Complemento 12/09 — prévia do "Repetir último pedido"

**Veredito: LIBERADO.** Estes 4 arquivos estão só na árvore de trabalho (ainda não no índice): `frontend/src/pages/Pedidos/NovoPedido.jsx`, `backend/manuais/abas/pedidos.md`, `frontend/public/novidade-repetir-pedido.html`, `frontend/public/novidades.json`. Adicione-os com `git add` desses 4 caminhos (não `-A`) antes do commit.

**O que mudou:** o botão "Repetir último pedido" saiu do card do cliente e foi para o topo da lista de produtos. Tocar nele **não coloca mais nada direto no carrinho**: abre a prévia "Conferir antes de adicionar", com uma linha por produto — quantidade editável, preço aproximado, situação (disponível / sem estoque / produto não disponível, este sem checkbox), "Selecionar todos" e total. Só entra no carrinho ao confirmar; se o carrinho já tinha itens, um aviso amarelo avisa que será **substituído** e o botão diz "Substituir carrinho por N itens". Quantidade zero ou apagada não conta no total nem no botão.

**Testado:** QA clicou nos 9 critérios (todos PASSOU), inclusive carrinho já cheio, item sem estoque, item fora do catálogo, Esc/foco, clique duplo no confirmar e um pedido real criado (201, 18 itens, valores iguais aos da prévia) e apagado em seguida. Revisor pediu 3 ajustes (quantidade ≤ 0 não conta; rótulo "(aprox.)"; texto "Produto não disponível"), feitos e reconferidos. Gerente: diff dos 4 arquivos sem nada de outras sessões (0 ocorrências de AlertaPagamento/parcelaEfetiva), build passou, JSON válido, novidade com accordions abertos, sem og:image e sem link "abrir o app", manual do Clippy atualizado.

**Dívida registrada:** produto que saiu do catálogo aparece na prévia como "Produto não disponível (código)" em vez do nome, porque `historicoComprasCliente` (backend) não devolve o nome do produto. Não bloqueia (a linha nunca entra no carrinho); corrigir no backend quando essa rota for tocada.

**Texto de WhatsApp atualizado (substitui o de "Repetir último pedido" acima):**

*🔁 Repetir último pedido, agora com conferência*
No Novo Pedido, todo item já comprado mostra a última quantidade e data. E no topo da lista de produtos, o botão *Repetir último pedido* abre uma prévia pra você conferir e ajustar a quantidade de cada item antes de colocar no carrinho — nada entra sem você confirmar.
https://cahardt-github.xrqvlq.easypanel.host/novidade-repetir-pedido.html
