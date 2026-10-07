# PLANO — Ajuste de Estoque: Enter com confirmação, leitor de código de barras, painel fixo
Aprovado pelo dono em 07/10/2026. Proposta: `docs/propostas/proposta-ajuste-estoque-enter-bipe-scroll.html`.

## Decisões do dono
1. Enter na Quantidade = ENTRADA, com janela VERDE de confirmação (Enter confirma, Esc cancela). Botão "− Saída" com motivo = janela VERMELHA. Botões continuam funcionando (passam pela mesma janela).
2. Leitor de código de barras **USB** (depois sem fio). Comporta-se como teclado.
3. O código a procurar é o **código de barras da ETIQUETA** (`EtiquetaProduto.codigoBarras`, já ligada ao produto por `produtoId`). Fallback: `Produto.ean`.
4. Painel da direita fixo, só a lista rola. Tem que funcionar em tela com **zoom** (painel rola por dentro se não couber; botões sempre acessíveis).
5. **Seleção por clique continua funcionando normal.**
6. Bipe repetido do mesmo produto soma **+1 PT** (padrão; dono não respondeu caixa × pacote — avisar na entrega).

## Contrato backend ↔ frontend (FIXO — os dois lados seguem isto)
- `GET /api/estoque/codigo-barras/:codigo`
  - 200 → `{ produto: <mesmo formato de um item de GET /api/estoque/posicao>, origem: 'etiqueta' | 'ean' }`
  - 404 → `{ erro: 'Código de barras não cadastrado' }`
  - Procura 1º `EtiquetaProduto.codigoBarras = codigo` com `produtoId` não nulo (se várias, a mais recente), 2º `Produto.ean = codigo`. Compara o código normalizado (só dígitos/letras, sem espaços).
- `POST /api/estoque/codigo-barras/vincular` body `{ produtoId, codigo }`
  - Grava `Produto.ean = codigo` (é o fallback de busca). Exige a mesma permissão de quem pode dar ajuste (ENTRADA ou SAIDA) — reusar `getPermsFromDB` como `/ajuste`.
  - 200 → `{ ok: true, produto: <mesmo formato> }`
  - 409 → `{ erro: 'Este código já pertence ao produto <codigo> <nome>' }` quando outra etiqueta/produto já tem o código.
  - 400 → `{ erro }` se faltar campo.
- `frontend/src/services/estoqueService.js`: `buscarPorCodigoBarras(codigo)` e `vincularCodigoBarras(produtoId, codigo)`.

## Frontend — `frontend/src/pages/Estoque/PainelEstoque.jsx`
- Janela de confirmação (componente local ou `components/ConfirmarAjusteModal.jsx`): produto, +N/−N, Disponível de → para (alerta se ficar negativo), motivo; Enter confirma / Esc cancela; foco inicial no botão Confirmar; anti-duplo-clique (`salvandoRef`). Depois de confirmar: limpa Quantidade e Motivo e devolve o foco à Quantidade.
- Detector de bipe: hook reutilizável `frontend/src/hooks/useLeitorCodigoBarras.js` — listener `keydown` em captura no `document`; pacote de ≥8 caracteres (teclas de 1 char) com intervalo entre teclas ≤ 60 ms e terminado em Enter; ao reconhecer: `preventDefault` do Enter, **restaura o valor do campo focado** ao que era antes do pacote (os dígitos do leitor não ficam na Quantidade/Busca) e chama `onCodigo(codigo)`. Ignorar quando a janela de confirmação estiver aberta. Digitação humana (mesmo rápida) não dispara.
- Ao bipar: busca na API; produto achado → seleciona (mesmo fora do filtro de categoria), zera Quantidade, foca Quantidade, chip "📟 Bipado <código>" por 1,5 s; mesmo produto já selecionado → Quantidade +1; produto diferente com quantidade digitada → troca, zera e toast "Troquei para X". Não achado → toast vermelho com botão "Vincular ao <produto selecionado>" (só se houver produto selecionado) → POST vincular → toast ok.
- Layout desktop (`lg:`): raiz da tela com altura da janela (`lg:h-[calc(100dvh-<altura do header do app>)]`, com fallback `100vh`), coluna esquerda `overflow-y-auto`, coluna direita `overflow-y-auto` sem `sticky`; dentro do painel, bloco card+Quantidade+Motivo+botões fica no topo (sticky interno) e "Últimos lançamentos" rola embaixo. Mobile (< lg) **sem mudança** (lista some ao selecionar, "Voltar à lista"). Testar com zoom 150% e 200% no navegador: nada corta, botões acessíveis, sem scroll horizontal.
- Clique nos cards continua selecionando normalmente.
- Manual `backend/manuais/abas/estoque-ajuste.md` + novidade `frontend/public/novidade-ajuste-estoque-bipe.html` (mockups com pins, accordions abertos, sem og:image, sem botão abrir app) + entrada no topo de `frontend/public/novidades.json`.
- Regra nova no `CLAUDE.md` (seção Responsividade): "Tela lista + painel de ação (mestre-detalhe): a lista rola, o painel não; painel maior que a tela rola por dentro mantendo os botões visíveis; vale também com zoom".

## Status
- [x] dev-backend (rodadas 1 e 2)
- [x] dev-frontend — build OK. Arquivos: `frontend/src/pages/Estoque/PainelEstoque.jsx`, `frontend/src/components/ConfirmarAjusteModal.jsx` (novo), `frontend/src/hooks/useLeitorCodigoBarras.js` (novo), `frontend/src/services/estoqueService.js`, `backend/manuais/abas/estoque-ajuste.md`, `frontend/public/novidade-ajuste-estoque-bipe.html` (novo), `frontend/public/novidades.json`, `CLAUDE.md` (regra mestre-detalhe). Pendente: QA clicando (zoom 150/200%, bipe real).
- [x] dev-frontend — rodada 2: (1) hook escuta sempre e, com a janela aberta, engole o Enter do leitor (stopImmediatePropagation) + toast "Confirme ou cancele o lançamento antes de bipar"; janela ignora Enter < 80 ms após caractere; (2) hook não desliga mais no loading + teto de 10000 na quantidade; (3) fila de bipes + refs de seleção/quantidade + escolha manual vence bipe em voo + espera de pacote em andamento; (4) altura 100dvh/100vh com --topo-extra (App.jsx) = altura da janela; (5) 2 colunas a partir de md, lista 1 coluna < lg, barra fixa no rodapé < md; (6) Voltar à lista 44 px + scroll-mt; (7) emoji removido, Vincular só com permissão (mensagem 409 do backend exibida); (8) novidade, manual e CLAUDE.md atualizados. Build OK.
- [x] dev-frontend — rodada 3: (1) emoji 📟 removido do og:title e do accordion da novidade (ícone 🔍); (2) bipe em voo descartado se a janela de confirmação abriu (confirmacaoRef + toast "Bipe ignorado: confirme ou cancele o lançamento primeiro"); (3) ConfirmarAjusteModal ignora a tecla espaço; (4) desktop ≥768: clicar no card foca a Quantidade (mobile igual). Build OK.
- [x] dev-frontend — rodada 4: CSS accordions (bloco .acc/.acc-head/.acc-ico/.acc-seta/.acc-corpo copiado de novidade-tarefas.html; capturas em scratchpad/shots3/)
- [x] qa-testador (rodada 1 reprovou; rodada 2 passou clicando)
- [x] revisor-codigo (rodada 1 reprovou; rodadas 2 e 3 aprovaram)
- [x] gerente-entrega — LIBERADO COM PENDÊNCIA (nota em docs/nota-entrega-ajuste-estoque-bipe.md)

## dev-backend — rodada 2

Correção do apontamento do revisor em `POST /api/estoque/codigo-barras/vincular` (`backend/routes/estoqueRoutes.js`):
- O produto agora é lido com `ean` no select. Se já tem `ean` diferente do código normalizado, responde **409** `{ erro: 'Este produto já tem o código <ean atual> cadastrado. Para trocar, edite o produto no cadastro.' }` (sem gravar).
- Igual: 200 idempotente (não faz update). Vazio/null: grava como antes.
- Teste curl local (hardt_local, usuário Producao, produto 3065 sem EAN): vazio -> 200 ok:true; mesmo código de novo -> 200 ok:true; outro código -> 409 com a mensagem acima. EAN devolvido a NULL (valor original) ao final. `node --check` OK. Backend derrubado.
