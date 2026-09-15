# Nota de entrega — Padronização de cidades (fase 2 estendida + fase 4)

**Veredito do gerente de entrega (14/09/2026): LIBERADO COM PENDÊNCIA.**

## O que mudou (no uso)
- **Campo Cidade virou lista com busca** em Novo Cliente, ficha do cliente, novo lead (Rota) e editar lead (Leads).
  Escolhendo da lista, a cidade entra com a grafia exata que já existe ("Itapoá", "Jaraguá do Sul").
  Cidade que ainda não existe entra pelo botão **Usar "…"** (ou Enter) e é arrumada sozinha (Sao bento do sul → Sao Bento do Sul).
  Se a lista não carregar, o campo segue aceitando texto — o cadastro nunca trava.
- **Cidade que vem da consulta por CNPJ** já entra arrumada (a Receita devolve em MAIÚSCULO).
- **Todos os menus com busca do app ignoram acento e maiúscula**: "itapoa" acha "Itapoá", "acucar" acha "Açúcar".
  Vale também para a busca de cliente e de produto dentro do Novo Pedido.
- **Editar lead agora exige cidade** (mesma regra do novo lead).
- **Backfill (só rota de administração, ainda NÃO rodado em produção):** aceita lista aprovada, apelidos de erro de digitação,
  regra "somar" para metas por cidade em duplicidade, snapshot de reversão com cada registro alterado, reversão por arquivo,
  uma transação por tabela com timeout de 20 s.
- Manuais do Clippy (clientes, leads, rota) e página de novidade (`novidade-cidades.html`, registrada em `novidades.json`).

## O que foi testado e por quem
- **Dev:** backfill em banco local (dry-run, aprovado divergente, real com somar/apelido/aprovado, idempotência, reversão) — detalhado em `STATUS.md`.
- **QA (clicando):** campo Cidade nos 4 cadastros, "Usar …", busca sem acento nos menus e no Novo Pedido — PASSOU COM RESSALVAS.
  As 2 ressalvas foram corrigidas (Esc no ComboBusca agora limpa a busca; "Informe a cidade" ao editar lead), **sem reteste do QA** — conferidas por leitura do código pelo gerente.
- **Revisor:** aprovado; ressalvas corrigidas (Novo Pedido sem acento; rota duplicada `/clientes/cidades` removida).
- **Gerente:** `npm run build` ✓ (5,1 s); `node --check` no service e no adminExec ✓; dicionário do frontend idêntico ao do backend ✓;
  `chaveBusca`/`normalizarCidade` testadas em node ("ITAPOA" → "Itapoá", "SAO BENTO DO SUL" → "Sao Bento do Sul"); snapshot em `../uploads` (volume) ✓;
  5 transações com `timeout 20000 / maxWait 10000` ✓; nenhum segredo no diff ✓; novidade sem `og:image`, sem "Abrir o app", accordions abertos, 9 telas com 14 legendas ✓.

## O que o dono precisa conferir (1 minuto, depois do deploy)
1. Clientes → Novo Cliente → tocar em **Cidade**, digitar `itapoa` → deve aparecer "Itapoá"; digitar uma cidade inventada → aparece **Usar "…"**.
2. Com a lista aberta, apertar **Esc** e abrir de novo → a busca deve vir vazia.
3. Leads → editar um lead, apagar a cidade e salvar → deve avisar "Informe a cidade".

## Pendente / fora desta entrega
- **Backfill em produção NÃO rodou.** Depende de: aprovação da lista de cidades pelo dono → dry-run → aplicar → publicar de novo → `GET /backfill-cidades-snapshots` ainda listar o arquivo (prova de que o snapshot sobreviveu ao deploy).
- **Comissão retroativa**: após o backfill, decidir se recalcula meta/bônus dos meses em que a grafia divergente zerou o realizado por cidade.
- Reteste do QA nos 2 pontos corrigidos (Esc e validação) — cobertos pela conferência do dono acima.
- Achado do QA, fora do escopo, **não incluído**: `frontend/src/pages/PCP/EtiquetaForm.jsx:295` usa Fragment nas opções e deixa o menu de produto vazio (ver memória "SelectBusca: Fragment = menu vazio"). Abrir tarefa própria.
- Ajuste pequeno para a próxima vez que tocar: rótulo "Cidade" do editar lead sem `*` apesar de obrigatório; `STATUS.md` ainda diz "Fase 4 não iniciada".

---

# Nota de entrega — Cadastro oficial de cidades (fase 5, backend + frontend)

**Veredito do gerente de entrega (15/09/2026): LIBERADO COM PENDÊNCIA** — pode commitar e publicar
**na ordem da seção "Pendente"** (backend primeiro, semente, só depois o frontend).

## O que mudou (no uso)
- **Existe uma lista oficial de cidades** (Configurações → Cidades). Todo campo Cidade do app — Novo Cliente, ficha do cliente,
  novo/editar lead, fornecedor, bairro do Kit Festa, meta por cidade — **só aceita cidade dessa lista**, com a UF ao lado.
  O botão **Usar "…"** (texto livre) acabou.
- **Cidade nova** entra por **"Cadastrar nova cidade…"** (nome + UF). Se já existir uma parecida, o app pergunta "Você quis dizer…?".
  Quem pode cadastrar cliente ou editar Rota pode cadastrar cidade; os demais veem o aviso "peça ao escritório".
- **Consulta de CNPJ:** se a Receita devolver uma cidade que não está na lista, o app pergunta "cadastrar ou escolher outra?" antes de gravar.
- **Tela Configurações → Cidades:** buscar, editar nome/UF (reescreve os registros que usam a cidade), inativar/reativar,
  **fundir** duas cidades repetidas (com Simular antes e arquivo de reversão) e aba **Pendências** — cidades que chegaram sozinhas
  pela Conta Azul ou pela IA do WhatsApp ficam ali para o escritório cadastrar ou apontar para a certa.
- **O que chega automático nunca trava:** sincronização do Conta Azul, fornecedores do CA e leads criados pela IA continuam
  entrando mesmo com cidade desconhecida (vira pendência). A API da IA (`/v1`) não mudou nada de formato.
- Mapa de Clientes: o filtro de cidade mostra "Cidade · UF".
- Manuais do Clippy: novo `config-cidades.md` + clientes, leads, rota, metas, mapa. Página de novidade `novidade-cidades.html`
  (já registrada em `novidades.json`).

## O que foi testado e por quem
- **Dev-backend** (banco local): semente (58 cidades, idempotente), resolver/sugestões, 400 `CIDADE_NAO_CADASTRADA` nos 7 pontos
  estritos, modo tolerante com pendência (CA e IA), fusão com snapshot e reversão, renomear, inativar em uso — detalhado no `STATUS.md`.
- **QA clicando:** bloco 1 (7 formulários, Receita/CNPJ, mobile) 11/11; bloco 2 (tela Cidades) passou com 1 defeito
  (a simulação da fusão mostrava zero) → corrigido no `PlanoFusao`, build OK, **sem reteste do QA**.
- **Revisor:** aprovado após 3 costuras corrigidas (`incluirInativas` aceito no backend, `podeGerirCidades` exige `.edit`,
  UF por extenso do CA via `ufDeTexto`).
- **Gerente (conferido por conta própria):** `npm run build` ✓ (5,3 s); `node --check` em 35 arquivos ✓; `npx prisma validate` ✓;
  schema só ACRESCENTA (`Cidade`, `CidadePendente`) ✓; permissão criar/gerir idêntica back × front (`configuracoes.edit`, não `.view`) ✓;
  IA v1: rota `criar-lead` tolerante, resposta igual, doc aditivo ✓; 6 transações com `timeout 20000 / maxWait 10000` ✓;
  snapshot em `../uploads` (volume) ✓; `SelectBusca` na UF e na fusão ✓; cards mobile na tela Cidades ✓; ABAS/README/manual ✓;
  novidade sem `og:image`, sem "Abrir o app", 4 accordions abertos, 43 legendas ✓; nenhum segredo ✓.
  **O defeito corrigido sem reteste foi provado pela API:** `POST /cidades/:id/fundir {dryRun:true}` no servidor local devolveu
  `resumo.totalLinhas: 1` e `tabelas:[{clientes, 1, "Abatiá" → "Araquari"}]` — exatamente os campos que o `PlanoFusao` lê.

## O que o dono precisa conferir (1 minuto, DEPOIS de publicar back + semente + front)
1. Clientes → Novo Cliente → Cidade: digitar `itapoa` → aparece "Itapoá · SC"; digitar uma cidade inventada → aparece só **Cadastrar nova cidade…**.
2. Configurações → Cidades → escolher uma cidade → **Fundir** em outra → **Simular**: a prévia tem que mostrar o número de registros (não zero). **Não confirmar.**
3. Configurações → Cidades → aba **Pendências**: deve abrir vazia (ou com as cidades que o CA trouxe).

## Pendente / fora desta entrega (ordem obrigatória)
1. Publicar o **backend** e conferir `GET /api/admin-exec/ping` → `deployMarker: cidades-cadastro-2026-09-14`.
2. Rodar a **semente em produção**: `POST /api/admin-exec/cidades-semente {"dryRun":true}` → conferir → `{"dryRun":false}`.
   Completar a UF das cidades que saírem em `semUf` (ambíguas) na tela Cidades.
3. **Prova do volume:** fazer uma fusão/renomeação de teste (ou reaproveitar snapshot) → **publicar de novo** →
   `GET /api/admin-exec/backfill-cidades-snapshots` ainda tem que listar o arquivo.
4. Só então publicar o **frontend** (sem a semente o campo Cidade fica sem opções).
5. **Backfill dos dados antigos** (fase 3) continua parado: aguarda as **8 respostas do dono** sobre a lista aprovada/apelidos/regra das metas.
6. Sync do Conta Azul e worker de fornecedores só foram exercitados pelo `resolver` tolerante (sem token do CA local) — observar a aba Pendências na 1ª semana.
7. Reteste do QA na simulação de fusão — coberto pelo item 2 da conferência do dono.

## Texto para o grupo do WhatsApp
📍 *Novidade no Hardt App: cadastro oficial de cidades*

Agora o app tem UMA lista de cidades. Todo campo *Cidade* (cliente, lead, fornecedor, bairro do Kit Festa, meta) só aceita cidade dessa lista — acabou "Itapoá" escrita de três jeitos.

✅ Cidade nova? Toque em *Cadastrar nova cidade…* (nome + UF). Se já existir uma parecida, o app avisa.
✅ Consulta de CNPJ: se vier cidade desconhecida, ele pergunta antes de gravar.
✅ Escritório: *Configurações → Cidades* para editar, fundir repetidas e resolver pendências.

Veja como funciona: https://cahardt-github.xrqvlq.easypanel.host/novidade-cidades.html
