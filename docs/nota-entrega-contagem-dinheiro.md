# Nota de entrega — Contar o dinheiro no Caixa + campos de número seguros

**Data:** 19/10/2026
**Veredito do portão de entrega:** LIBERADO COM PENDÊNCIA (pode publicar; há duas coisas a fazer antes do push e algumas que só você consegue conferir depois).
**Branch:** `e3-campo-numero` (worktree `~/Projetos/CA-Hardt-e3`, HEAD `357e1ca4`) — inclui os dois commits que já estão na `main` (`1dba89ef`, `361210bc`). Nada foi publicado ainda.

---

## O que mudou (para quem usa o app)

1. **Scroll do mouse não mexe mais em número.** Rolar a roda do mouse em cima de um campo de quantidade ou valor não soma nem subtrai nada — a página rola normalmente.
2. **Campo de número só aceita número, no sistema inteiro.** Letras, "e", "+" não entram. Em campo de valor (R$, litros, %) entra vírgula ou ponto, e os dois valem como decimal ("12,5" e "12.5" dão o mesmo). Em campo de quantidade inteira, só dígitos. Isso valeu para 126 campos em 53 telas (Caixa, Pedidos, Estoque, PCP, Kit Festa, Financeiro, Configurações, Produtos, Vendedores, Clientes, RH, Veículos, Diário).
3. **Botão "Contar o dinheiro" no Caixa.** Quem recebe o envelope do motorista abre o cartão "Conferência do dinheiro" e clica em **Contar o dinheiro**: conta nota a nota e moeda a moeda, pode anotar "outros valores" (cheque, vale) e uma observação, e salva. Fica gravado **quem contou, a hora, o total e as peças**. **Não fecha o caixa, não pede motivo nem senha** — é só a contagem. Pode contar de novo quantas vezes quiser; as anteriores ficam no histórico do dia. Quem tem permissão de conferir vê o botão **Usar na conferência**, que abre o "Conferir e fechar" já preenchido com a contagem.
4. **No computador a contagem cabe na tela, sem rolagem.** O modal ficou largo, em três colunas (cédulas / moedas e outros / total e botões). No iPad fica em duas ou três colunas; no celular vira abas (Cédulas, Moedas, Outros) com o total e o botão fixos no rodapé.
5. **Botão "Quebra de caixa" na conferência.** Quando o dinheiro não bate, aparecem dois botões acima do motivo: **Quebra de caixa** (preenche sozinho "Quebra de caixa (falta)" ou "(sobra)", conforme o caso, e trava o texto) e **Outro motivo…** (libera para digitar). A regra de limite de quebra e senha do autorizador não mudou.
6. **(Correção de bug antigo que apareceu no caminho)** Senha errada do autorizador **não desloga mais** ninguém. Antes, errar a senha na conferência do dinheiro, na devolução ou no GPS derrubava o usuário para a tela de login e perdia tudo que estava preenchido. Agora o app mostra "Senha incorreta", mantém a janela aberta com a contagem, limpa só a senha e põe o cursor nela.

Também: manual do Caixa (Clippy) atualizado com a aba "Contar o dinheiro sem fechar" e "Motivo Quebra de caixa"; página de novidade criada e registrada (o Clippy vai balançar avisando a equipe).

## O que foi testado e por quem

**Conferido por mim (gerente de entrega), com saída de comando:**
- `npm run build` do frontend: **passou** (`✓ built in 5.67s`).
- `node --check` nos 3 arquivos de backend alterados: OK. `npx prisma validate`: válido.
- Schema do banco **só adiciona** (tabela nova `caixa_contagens` e coluna opcional `motivo_tipo`); nenhum campo removido.
- `grep type="number"` no frontend: sobrou só o comentário dentro do próprio `CampoNumero`.
- `novidades.json` é JSON válido com a entrada no topo; a página de novidade tem `og:title`/`og:description`, **sem** `og:image`, **sem** botão "Abrir o app", 5 seções já abertas e 38 elementos de mock com legendas.
- Senha errada em `backend`: as 4 respostas `401` viraram `403` (só `pontoPublicRoutes` mantém 401, e é rota pública sem token — correto).
- Transações do Prisma nos arquivos tocados já têm timeout de 20 s; a nova rota de contagem não usa transação (é um único `create`, com idempotência por `id`).
- Nenhum segredo entrou no repositório.
- Olhei as capturas: modal em 1280 sem rolagem e em 3 colunas; abas no 375; chip "Quebra de caixa" travando o texto; senha errada mantendo a janela aberta (toast vermelho + campo limpo). São telas reais do app local, batem com o desenho aprovado em `docs/mockups/conferencia-dinheiro-v2.html`.

**Dev backend (curl, 13 cenários + 5 complementares):** contagem válida 201; repetida 200 (sem duplicar); vazia 400; denominação inválida 400; sem acesso 403; senha errada 403; `id` reaproveitado em outro vendedor 409; data inválida 400; acima do limite 400; caixa já conferido 400; `/resumo` traz contagens e `motivoTipo`; conferir com QUEBRA_DE_CAIXA grava "(falta)"/"(sobra)" montado pelo servidor; desfazer limpa.

**QA do Caixa (clicando, 1280/1024×768/768×1024/375):** contar, contar de novo (histórico), usar na conferência, conferir sem diferença, com falta dentro e acima da quebra (autorizador + senha), chave desligada, caixa conferido/fechado/sem movimento, dono do próprio caixa só com "Acessar Caixa", backend fora (toast, nada perdido), quantidade absurda (123456). Primeira rodada **reprovou** pelo bug da senha deslogar; re-teste aprovou nos 4 pontos (conferência, devolução ×2, pedido de autorização) e confirmou que editar após falha grava a nova contagem. Capturas: `docs/mockups/evidencias-contagem/` e `qa/`, `qa/re1/` (no worktree principal `~/Projetos/CA-Hardt`).

**QA da troca de campos (clicando):** Caixa (adiantamento 150,5; km; despesa 45,5 L / R$ 250,75), devolução 1,5 e 2, conferência de devolução, checkout do motorista 150 e 100,25, PIX, veículos 55,5, vendedores 12,5/2,5, permissões 7,5, metas 15000,5, comissões, tabela de preços negativo, etiquetas, filtro de embarque, Novo Pedido (frete 12,5, valor 50,5, quantidade + Enter), Estoque (Enter lança), PCP, Clientes, Kit Festa, Régua, Configurações; 390 px sem scroll horizontal; console limpo. Capturas: `docs/mockups/evidencias-contagem/e3/` e `qa/e3/`.

**Revisor de código:** aprovou as duas partes; todas as ressalvas (milhar, arredondamento, max, inserção sem colar, vírgula inicial, zero à esquerda, ",5") foram **corrigidas** nos commits seguintes e re-revisadas — não só respondidas.

## O que você precisa conferir (um minuto cada)

1. **No iPad e no iPhone de verdade:** abrir Caixa → Contar o dinheiro e digitar uma quantidade. Tem que abrir o **teclado numérico**; Enter pula para a próxima nota. Em Configurações → Tabela de Preços, no campo de acréscimo %, conferir que dá para digitar o sinal de menos (nesse campo o teclado é o comum, de propósito, para o "−" existir).
2. **Folha impressa do caixa:** depois de conferir um caixa com "Quebra de caixa", imprimir a folha e ver se sai "— Quebra de caixa (falta)" ao lado da diferença. O código imprime o mesmo texto gravado; só não foi clicado na impressora.
3. **Depois do deploy, em produção:** abrir o Caixa de hoje de um motorista e clicar em Contar o dinheiro, salvar e ver o chip "Contado por … às …". Isso prova que a tabela nova foi criada no banco de produção.

## Três decisões de comportamento que a equipe tomou — diga se concorda

- **Produto que não aceita fração:** se alguém digitar "3,5" na quantidade, a vírgula não entra e fica **35**. Produto com fração continua aceitando 3,5. Se preferir que a vírgula trave em "3", é ajuste pequeno.
- **Acréscimo % na Tabela de Preços aceita número negativo** (o servidor já aceitava; agora a tela também). Se não quiser desconto por ali, dá para travar.
- **Caso raro de exibição:** em três telas (cidade na meta, km do alerta do veículo, painel de estoque), se o usuário digita "0" e a tela zera o campo logo em seguida, o "0" fica aparecendo até ele clicar fora. Só visual, não grava errado.

## Pendente / ficou de fora

- **Antes do push (obrigatório):** subir o `deployMarker` em `backend/routes/adminExec.js:55` (ainda está `'impressao-direta-e1-2026-10-15'`) — sem isso não dá para provar que o backend novo subiu. Mesclar `e3-campo-numero` na `main` e decidir se as pastas de evidência (`docs/mockups/evidencias-contagem/`, hoje sem commit nos dois worktrees) entram no repositório.
- **Depois do deploy:** confirmar `GET /api/admin-exec/ping` com o marcador novo, `GET /api/caixa/contagem-dinheiro?data=AAAA-MM-DD` respondendo 200 (e não 404/500), e o item 3 acima.
- **Não testado em aparelho real** (só emulado): iPad/iPhone.
- **Defeito antigo, fora deste pedido:** clicar duas vezes muito rápido em "Salvar" na Nova Despesa cria duas despesas (não tem a trava que a contagem tem). Fica para outra entrega se quiser.
- **Telas da troca em massa que o QA não abriu uma a uma** (~20 menores, ex.: Modal de Amostra, PIX avulso, Cobranças da rota, Diário checkout/gateway): a troca é de um componente só, revisada no diff, e o build passou — risco baixo, mas não foram clicadas.

## Texto pronto para o grupo do WhatsApp

```
💵 *Novidade no Hardt App: contar o dinheiro no Caixa*

Quem recebe o envelope do motorista agora conta o dinheiro direto no app:
📲 Caixa → cartão *Conferência do dinheiro* → *Contar o dinheiro*
✅ Conta nota por nota e moeda por moeda, com "outros valores" (cheque, vale)
🕒 Fica registrado *quem contou e a hora* — sem fechar o caixa e sem senha
🔁 Pode contar de novo; as contagens anteriores ficam no histórico do dia
🧮 Quem confere pode usar a contagem pronta com *Usar na conferência*
⚖️ Na conferência com diferença, um clique em *Quebra de caixa* preenche o motivo

E em todo o sistema: campo de número *não aceita mais letra* e a roda do mouse *não muda mais o valor*.

Veja como funciona, com as telas:
https://cahardt-github.xrqvlq.easypanel.host/novidade-contagem-dinheiro.html

(Atualize o app no ícone ↻ antes de usar)
```
