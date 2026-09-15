# Nota de entrega — Etapa 1 "Conferência de nota cria Produto de verdade"

Branch `feat/entrada-notas-produto` (commits `5e52cd7a` + `c908733d`), ainda **não publicada**.
Veredito do portão de entrega em 15/09/2026.

## Veredito: LIBERADO COM PENDÊNCIA

Pode mesclar e publicar. As pendências abaixo são coisas que só se provam em produção (deploy com
colunas novas) ou que ficaram de fora por decisão do plano — nenhuma é defeito no que foi feito.

### O que o gerente de entrega conferiu (não só leu nos relatórios)

- **Os 2 defeitos do QA estão corrigidos no código** (diff do `c908733d` lido linha a linha):
  o toast final agora separa "Estoque atualizado" de "Registrados só como despesa (categoria não
  controla estoque)" usando o `semEstoque` que o backend já devolvia (`notaEstoqueService.js` l.165);
  a prévia "Entrada convertida" mostra "→ só despesa, não soma estoque" quando o produto novo
  tem categoria que não controla. O campo auxiliar `controlaEstoqueResolvido` fica só na tela —
  o payload da API é montado campo a campo (`montarItensBase` e o painel de correção) e não o inclui.
- **Build do frontend rodado por mim** na worktree: `✓ built in 5.40s`, sem erro.
- **Schema só adiciona**: `Produto.nomeOrigemNota`, `Produto.notaOrigemId` (opcionais, sem
  relation) e `CompraItem.semEstoque` (default `false`). Nada removido.
- **`$transaction`**: 7 em `notasEntrada.js` e 1 nova em `pcpItemRoutes.js`, todas com
  `{ timeout: 20000, maxWait: 10000 }`. `produtoService.criar` tem trava explícita contra rede
  dentro da transação (só relevante se o Conta Azul voltar a receber escrita).
- **Arquivos protegidos intocados**: devolução, NF-e/Focus, WhatsApp, webhook, contabilidade (D5)
  e API de IA — `git diff --name-only` não lista nenhum.
- **Permissão front = back**: rotas novas do PCP (`promover-produto`, `DELETE`) usam a mesma
  `temPermissaoPcp` (`admin || pcp.itens`) das rotas antigas; a tela `/pcp/itens` já é liberada
  por `canPcp('itens')` no `App.jsx`.
- **Manuais do Clippy** atualizados: `notas-recebidas.md`, `produtos.md`, `pcp-itens.md`,
  `pcp-receitas.md`. Sem número de teste vazando (`99001`, `QA TESTE` etc. não aparecem).
- **Novidade**: `novidade-entrada-notas-produto.html` com 5 accordions todos abertos, mockups com
  23 legendas numeradas, sem `og:image`, sem botão "abrir o app"; entrada no topo de `novidades.json`.
- **Sem segredo no repositório** (grep no diff inteiro).
- **Rebase**: `main` avançou 1 commit depois do rebase (`ef0c7e2f`, filtro de Receitas), sem
  arquivo em comum e sem conflito no merge de teste. Os dois pontos que o revisor tinha apontado
  (link morto `/admin/sync`, busca salva do `ItensPcp`) já estão resolvidos na árvore.
- **QA**: 25 cenários clicados, com evidência de banco e de resposta da API, mobile em 375px nas 4 telas.

### Ressalva declarada (aceita)

A correção dos 2 textos (`c908733d`) **não foi reclicada pelo QA** — o dev-frontend só rodou o
build. Aceitei porque é troca de texto condicional em `<span>` que já existia e um `toast()` a mais,
e porque conferi a lógica no diff. Se quiser 100%, é um teste de 1 minuto na primeira nota real
conferida em produção (ver "O que conferir").

---

## Nota para o dono (pronta para colar)

**O que mudou**

Na conferência de Notas Recebidas, cada item da nota agora tem só três caminhos: **Vincular a um
produto** que já existe, **Criar produto novo** ou **Não é estoque**. O "Criar produto novo" cria o
produto de verdade no cadastro (antes criava só um insumo solto no PCP). Ele já vem com o nome da
nota preenchido, pede a categoria (obrigatória) e traz EAN/NCM do XML. Se a categoria for
Matéria-Prima ou Embalagem, o insumo do PCP nasce sozinho, ligado ao produto.

O estoque agora obedece a categoria do produto (sua decisão D1): produto de categoria que não
controla estoque (ex.: Material de Uso e Consumo) entra só como despesa e histórico de compra, sem
somar quantidade. A tela avisa isso na prévia e no aviso final. "Não é estoque" ganhou o motivo
**Imobilizado**.

Na ficha do produto aparece "Cadastrado a partir da NF-e X (fornecedor) em data, como '…'" e a
lista de fornecedores que já vieram com ele; NCM e EAN passaram a ser editáveis. Criar produto
pela tela de Produtos também passou a exigir categoria.

Em PCP → Itens, os insumos sem produto por trás ganharam três botões: **Enviar para Produtos**
(vira produto com categoria; se a categoria não for de produção o insumo é inativado e o estoque
dele NÃO é transferido — a tela avisa antes), **Mudar tipo** e **Excluir** (só quando nunca foi
usado; senão o botão fica desabilitado explicando o motivo).

O botão "controla estoque" saiu da tela de Categorias comerciais (sua decisão D4).

**O que foi testado e por quem**

- Backend: 10 cenários por API no banco local (produto novo MP com estoque, Uso e Consumo sem
  estoque, `criarItemPcp` recusado, promover órfão, excluir usado/limpo, mudar tipo).
- QA: 25 cenários clicando na tela (desktop e celular 375px), conferindo o banco depois de cada
  ação — inclusive erro (sem categoria não salva) e regressão do vínculo com produto existente.
- Revisor: diff inteiro lido; aprovado. Gerente: reconferiu os pontos acima e rodou o build.

**O que você precisa conferir em produção (1 minuto cada)**

1. **Depois do deploy**, abrir Notas Recebidas e conferir uma nota criando um produto de categoria
   que NÃO controla estoque: a prévia deve dizer "→ só despesa, não soma estoque" e o aviso final
   deve vir separado ("Registrados só como despesa"). Essa foi a última correção e não foi reclicada
   pelo QA.
2. Abrir a ficha de um produto criado assim (Admin → Produtos) e ver o bloco "Cadastrado a partir
   da NF-e".
3. O deploy cria 3 colunas novas no banco (`prisma db push` normal, sem risco de perda — só
   adiciona). Se o backend não subir, o erro estará nesse passo; me avise.

**O que ficou pendente ou de fora**

- **Prévia para produto já existente**: quando você vincula a um produto que já está cadastrado, o
  combo não informa se a categoria dele controla estoque, então a prévia continua dizendo "soma no
  estoque" mesmo que não vá somar. O dado grava certo; só o texto é otimista. Corrigir exige mexer
  na rota `/itens-pcp` (próximo passo pequeno, se quiser).
- **Os 112 insumos órfãos** do PCP ficam como estão — a tela nova é para você tratá-los aos poucos
  (Enviar para Produtos / Mudar tipo / Excluir).
- **Contabilidade (D5)** fica para outra entrega, como combinado.
- **Código dos insumos espelhados**: produto criado pela nota nasce sem código, então o insumo PCP
  espelho pode ficar com código vazio ou com sufixo `-MP`/`-EMB` (comportamento antigo do
  `importar`, só fica mais visível agora).
- **Se um dia o Conta Azul voltar a receber escrita**, a criação de produto pela conferência e a
  promoção de órfão vão parar com um erro proposital (a criação roda dentro da transação e não pode
  chamar a internet). Quem religar isso precisa tirar a criação de dentro da transação.
- Nada foi testado em produção ainda — esta nota vale para o ambiente local.

**Texto para o grupo do WhatsApp**

> 📦 *Novidade no sistema: nota de entrada cria Produto de verdade*
> Na conferência de Notas Recebidas cada item agora tem 3 caminhos: 🔗 Vincular a um produto, ➕ Criar produto novo ou 🚫 Não é estoque.
> "Criar produto novo" cria o produto no cadastro (não mais insumo solto no PCP), já com nome, EAN e NCM da nota. Matéria-Prima e Embalagem geram o insumo do PCP sozinhos.
> Produto de categoria que não controla estoque entra só como despesa — a tela avisa.
> Em PCP → Itens, insumo sem produto ganhou *Enviar para Produtos*, *Mudar tipo* e *Excluir*.
> Detalhes com as telas: https://cahardt-github.xrqvlq.easypanel.host/novidade-entrada-notas-produto.html
