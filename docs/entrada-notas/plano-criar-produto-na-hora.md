# Criar produto na hora a partir da nota de entrada — plano (26/11/2026)

Pedido do dono: (1) "Criar produto novo" na conferência/correção de nota passa a PEDIR CONFIRMAÇÃO ao próprio
usuário (diálogo simples Confirmar/Cancelar — sem aprovação de terceiro, sem senha, sem permissão extra) e
CRIA O PRODUTO NA HORA no cadastro, já vinculando o item (`PROD:<id>`); (2) a busca "Nosso produto" RECARREGA
a lista de produtos toda vez que é aberta. Produto criado e nota não salva = produto fica no cadastro (aceito).

## Backend — `backend/routes/notasEntrada.js` (dev-backend)

Rota nova `POST /api/notas-entrada/:id/criar-produto`.

- **Permissão**: novo middleware `checkCriarProdutoNota` = `admin || Pode_Baixar_Contas_Pagar || Pode_Corrigir_Entrada_Estoque`
  (o painel de correção/lançamento é aberto por quem só tem `Pode_Corrigir_Entrada_Estoque`). Ler a chave exata do
  objeto de permissões (nunca `!!perms.x` em objeto pai); usar `req._perms` como os outros middlewares.
- **Refatorar sem mudar comportamento**: extrair de `processarItensConferencia` (~l.1493) a função
  `criarProdutoDoItem(tx, nota, itemNota, cp, usuarioId)` (produtoService.criar com nomeOrigemNota/notaOrigemId,
  EAN cai p/ `itemNota.ean`, NCM inválido vira null e nunca trava, espelho PCP via `pcpItemService.importar` quando
  `tipoPcpDaCategoria`). Usada pelo POST antigo E pela rota nova. Extrair também `validarCriarProduto(cp)` (mesma
  validação/mensagens de `validarItensBody`) e `montarOpcaoProduto(p)` (mesmo formato e mesmo `sub` de `GET /itens-pcp`,
  usado nos dois lugares).
- **Corpo**: `{ itemId?, nome, categoria, categoriaProdutoId?, controlaEstoque? (true|false|null), unidade, ean?, ncm? }`.
  `itemId` opcional; se vier tem de pertencer à nota (400 "Item informado não pertence a esta nota."). Nota inexistente 404;
  NFS-e recusa. `fator` NÃO vai para a rota (fica no front).
- **Fluxo**: carregar nota/item fora da transação → `prisma.$transaction(async tx => …, { timeout: 20000, maxWait: 10000 })`
  → dentro: `pg_advisory_xact_lock(hashtext('criar-produto:' + nome.trim().toLowerCase()))` → procurar produto de mesmo nome
  (insensitive): existe e `notaOrigemId === nota.id` → devolve ele (`jaExistia:true`, idempotência); existe de OUTRA origem → 409
  `{ error, codigo:'PRODUTO_DUPLICADO', existente:<opcao> }`; não existe → `criarProdutoDoItem`.
- **Auditoria FORA da transação**, em try/catch: `auditLog.create({ acao:'CRIAR_PRODUTO_NOTA', entidade:'Produto', entidadeId,
  detalhes:'Produto "X" (categoria Y) criado a partir da nota <id> / item "<descrição>" por <usuário>.', usuarioId, usuarioNome })`.
  Sem chamada de rede dentro da transação.
- **Resposta 201**: `{ ok:true, jaExistia:false, produto:{id,codigo,nome,categoria,unidade,controlaEstoque},
  opcao:{tipo:'PRODUTO',grupo:'Produtos',id,value:'PROD:<id>',nome,unidade,sub,controlaEstoque:true|false},
  opcaoPcp:{tipo:'ITEM_PCP',grupo:'Insumos (PCP)',id,value:'PCP:<id>',nome,unidade,sub}|null, itemPcpId }`.
  `controlaEstoque` efetivo vem de `estoqueService.produtoControlaEstoque`. `opcaoPcp` só quando o espelho foi criado (MP/EMB).
- Erros: 400 `{error}` (validação / categoria inexistente — mensagem atual "Categoria de estoque X não encontrada…"), 403, 404, 409.
- **Manter** o campo `criarProduto` nos POSTs `gerar-conta`, `registrar-entrada`, `corrigir-entrada-estoque` (contrato inalterado).
- `GET /itens-pcp`: pode ganhar campo opcional `controlaEstoque` na opção (só adição). Formato do array NÃO muda.
- Boy scout: conferir `$transaction` vizinhas neste arquivo (timeout 20000/maxWait 10000; log e API externa fora).
- Manual: `backend/manuais/abas/notas-recebidas.md` — reescrever "Criar produto novo" (~l.97) e parágrafo de correção (~l.132);
  tabela de permissões (~l.309). `copilotoService.js` NÃO muda.

## Frontend — `NotasRecebidasPage.jsx`, `components/ComboBusca.jsx`, `services/notasEntradaService.js` (dev-frontend)

1. `notasEntradaService.criarProduto(notaId, payload)` → `POST /notas-entrada/:id/criar-produto`.
2. `ComboBusca.jsx`: props OPCIONAIS `onAbrir` (chamado só na transição fechado→aberto, no clique do botão) e `carregando`
   (linha "Atualizando lista…" dentro do menu sem bloquear busca nem a lista exibida). Outros usos (CampoCidade, ListaProdutos,
   GerenciarProduto, ContasPagarPage) ficam intocados.
3. Estado da página (~l.464): `recarregarItensPcp()` com proteção de corrida (contador de requisição — só a última resposta vale —
   e promise em voo para não duplicar chamada); `adicionarOpcao(opcao, opcaoPcp)` insere sem duplicar por `value` e invalida
   recarga em voo; falha de recarga mantém a lista atual + toast discreto. Passar `itensPcpCtl = { recarregar, adicionar, carregando }`
   por props: l.769 → NotaExpandida → ConferenciaNota, e DetalheNota → PainelCorrigirEntrada. `ComboProduto` repassa `onAbrir`/`carregando`
   (nos 2 lugares). Não recarregar a cada tecla digitada.
4. `ModalCriarProdutoNota`: botão final "Criar produto" → valida como hoje → abre diálogo de confirmação por cima (padrão modal do projeto:
   `fixed inset-0`, `bg-black/40`, `rounded-2xl`, pílulas; bottom-sheet no mobile): "Vai criar **{nome}** em Produtos, categoria **{categoria}**,
   unidade {unidade}. Fica no cadastro mesmo que você não salve a nota. Confirmar?" [Cancelar] [Criar produto]. Só após Confirmar chama a API.
   Estado `criando` (botões desabilitados, "Criando…") + guarda de reentrância com `useRef`. **Erro: modal fica aberto com tudo digitado**, toast
   com `e.response?.data?.error`. **409 `PRODUTO_DUPLICADO`**: "Já existe o produto X. Usar o existente neste item?" [Usar existente] [Voltar] →
   `adicionar(existente)` e vincula. **Sucesso**: `adicionar(resp.opcao, resp.opcaoPcp)`; `setVinculo(idx, { vinculoValue: resp.opcao.value, fator })`
   (o fator digitado vai para a coluna Conversão); fecha; toast "Produto X criado no cadastro". LER `resp.opcao`/`resp.opcaoPcp`, nunca `resp.produto`.
5. **Remover `v.novo` por inteiro** nos DOIS lugares (ConferenciaNota e PainelCorrigirEntrada): estado `novo`, bloco "produto novo" com chips/Editar/Cancelar,
   spread `criarProduto` do payload (~l.2696-2705 e ~3681-3690), pendência "Preencha nome…", `controlaEstoqueResolvido`, ramos `v.novo ?` em `infoItem`/`linhas`,
   `novo:null` em `marcarSemEstoque`. Sem código morto: `grep v.novo` e `criarProduto` no front deve zerar. Botão "Cancelar" do produto novo some
   (desfazer = trocar o vínculo; produto fica no cadastro — a confirmação já avisa). Chip "Criar produto novo" continua como atalho que abre o modal.
6. Prévia de custo/estoque (~l.2630-2700 e ~3635-3690): usa `opcao = itensPcp.find(value)`; `unidadeNossa = opcao.unidade`;
   `controlaEstoqueItem = opcao.controlaEstoque ?? null`.
7. Mobile 375px sem scroll horizontal, botões `min-h-[44px]`. Rodar `cd frontend && npm run build`.
8. Novidade: `frontend/public/novidade-produto-na-nota.html` (espelhar `novidade-tarefas.html`: accordions `class="acc aberto"`, mockups com pins numerados,
   og:title/og:description, SEM og:image, SEM link "Abrir o app") + entrada no topo de `frontend/public/novidades.json` (`{slug:'produto-na-nota',titulo,resumo,data:'2026-11-26'}`).

## Costura (vigiar)
Formato de `opcao`/`opcaoPcp` idêntico ao de `/itens-pcp`; front lê `resp.opcao`/`resp.opcaoPcp`; 409 com `codigo:'PRODUTO_DUPLICADO'` e `existente`.

## Riscos
Duplicata por duplo clique (lock + idempotência + 409); corrida da lista (contador + adicionar invalida recarga em voo); regressão do POST antigo na extração;
permissão front=back; `avaliarItensDaNota`/custo fora da curva com `PROD:` recém-criado (sem histórico — não pode disparar aviso 409 indevido).

## NÃO fazer
Não remover `criarProduto` do backend; não renomear `/itens-pcp` nem mudar o formato do array; sem permissão nova/senha/aprovação; sem auditLog nem rede dentro da
`$transaction`; sem `!!perms.x`; não perder o digitado do modal em erro; não bloquear o menu ao atualizar; NÃO tocar em `ContasPagarPage.jsx`, `fornecedorPessoaService.js`,
`backend/index.js`, `ConciliacaoBancariaPage.jsx`, manuais de contas-a-pagar/curriculos/rh-funcionarios (outras frentes sujas na árvore). NÃO commitar.

## Critérios de aceite (QA clicando)
1 criar → confirmar → produto em Produtos com nome na nota/nota de origem; 2 cancelar no diálogo não cria; 3 dois itens da mesma nota: criar no 1, achar no 2 sem recarregar
a página, criar o mesmo nome de novo oferece "usar o existente"; 4 produto da nota 1 aparece na nota 2 sem recarregar; 5 duplo clique = 1 produto; 6 categoria inexistente: erro claro,
modal aberto com tudo digitado; 7 MP/Embalagem cria produto + espelho PCP, categoria comum só o produto; 8 combo mostra "Atualizando lista…" sem travar, erro de rede mantém a lista;
9 salvar nota com produto recém-criado: custo/estoque corretos; 10 painel Corrigir/Lançar (modo corrigir e lançar) com usuário só `Pode_Corrigir_Entrada_Estoque`;
11 sem as duas permissões: sem botão e curl = 403; 12 mobile 375px; 13 POST antigo com `criarProduto` (curl) continua criando; 14 depois de criar, trocar o vínculo funciona e o produto permanece;
15 `npm run build` passa.

## Arquivos desta tarefa (commit com `git add` explícito; `git diff --cached --stat` vazio antes)
`backend/routes/notasEntrada.js`, `backend/manuais/abas/notas-recebidas.md`, `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx`, `frontend/src/components/ComboBusca.jsx`,
`frontend/src/services/notasEntradaService.js`, `frontend/public/novidade-produto-na-nota.html` (novo), `frontend/public/novidades.json`, este plano.
