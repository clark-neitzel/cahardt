# Plano — Cadastro de Setores (Como Fazer / ficha do funcionário)

Pedido do dono (20/10): "cadastrar os setores, editar, e assim mudar em todo lugar o nome do setor."
Porte: **média-grande** (tabela nova + 1 tela + troca da lista fixa em ~12 pontos; toca Como Fazer em produção e o tablet já pareado). Fluxo: dev-backend → dev-frontend → QA + revisor → gerente-entrega.

## 1. Entendimento
Hoje os 4 setores são constantes no código. Passa a existir a tabela `setores`; **renomear altera só `nome`**. O `codigo` (COZINHA, ESTOQUE…) é a chave que `Funcionario.setor`, `ComoFazerConteudo.setores` (é `String[]`, não JSON) e `AppConfig como_fazer_aparelhos` já guardam — **zero migração de dados**, tablets pareados continuam valendo (a chave do aparelho é por `codigo`; o link usa `codigo.toLowerCase()`).

## 2. Mapa do código atual (lido)
Backend
- `backend/services/comoFazerAuthService.js:18-25` — constante `SETORES` + `setorPorSlug`/`setorPorCodigo` (exportadas :189). Consumidores: `comoFazerRoutes.js:44,58,170` (slug do tablet/parear), `comoFazerService.js:143` (`me`), `:151,:168,:301` (`home`/`encarregados`), `:540-557` (`SETORES_COD`, valida `setores` do conteúdo — hoje calculado UMA vez no load do módulo), `comoFazerPainelService.js:21,32,118,165,173`.
- `backend/controllers/funcionarioController.js:209-213` — validação `['COZINHA','ESTOQUE','EXPEDICAO','MOTORISTA']`.
- `backend/scripts/seedComoFazer.js:12,42,74` — conteúdos de exemplo com `setores:['COZINHA']` (continua válido: COZINHA é semeado).
- `backend/prisma/schema.prisma:1124` (`Funcionario.setor`), `:4710` (`ComoFazerConteudo.setores`). Comentários citam os 4 valores — atualizar o comentário.
- Aparelhos: `comoFazerAuthService.js:30-48` (`gerarChaveAparelho(codigo)`, `chaveConfere(codigo)`).
- Padrão de cadastro simples a copiar: `backend/routes/cidades.js` (montada em `backend/index.js:167` com `authMiddleware`; leitura = qualquer logado; escrita = `podeGerir`: `admin || configuracoes===true || configuracoes.edit===true`; `permissoes.configuracoes` é OBJETO — nunca `!!`), `backend/services/cidadeService.js:32-45` (cache + `invalidarCache`).
- Boot: `backend/index.js:258-266` chama `migrationService.run()` antes do `listen`; schema via `prisma db push` no `npm start` (`backend/package.json`).

Frontend — lista fixa HOJE (trocar pela lista do servidor)
- `frontend/src/services/comoFazerService.js:123-128` — `export const SETORES` (**atenção: aqui `slug` = CODIGO MAIÚSCULO**, ao contrário do backend onde `slug` é minúsculo). Todos os importadores abaixo.
- `pages/RH/FuncionarioFicha.jsx:223-226` — 4 `<option>` fixas (+ `:91` estado `setor`).
- `pages/RH/comoFazer/TabConteudos.jsx:4,16 (default ['COZINHA']),42` — MultiSelect.
- `pages/RH/comoFazer/EditorConteudo.jsx:4,261` — MultiSelect.
- `pages/RH/comoFazer/TabTreinamentos.jsx:5,21 (filtro salvo default 'COZINHA'),80`.
- `pages/RH/comoFazer/TabRotinas.jsx:3,74`.
- `pages/RH/comoFazer/RelatorioComoFazer.jsx:26` — array literal `['COZINHA','ESTOQUE','EXPEDICAO','MOTORISTA']`.
- `pages/RH/comoFazer/PareamentoTablet.jsx:4,32` (usa `s.slug` maiúsculo; `parear(slug.toLowerCase())` na ~:15).
- `pages/ComoFazer/ComoFazerHome.jsx:4,83-86` — `nomeSetor`, emoji dos chips e fallback `SETORES.map` quando `dados.setores` vem vazio.
- `pages/ComoFazer/ConteudoPagina.jsx:6,159-160` — nomes dos setores do conteúdo.
- `pages/ComoFazer/EntrarSetor.jsx:4,12-13,78` — título do tablet (`setor.emoji setor.nome`).
- Sem lista fixa mas repassam o código: `components/ComoFazer/FimTreinamento.jsx:19`, `PedirPinEncarregado.jsx`, `SetorTablet.jsx:18`, `App.jsx:846` (`/setor/:slug/*`; e `:391-393` tablet sem menu). Nada a mudar.
- Menu/rotas Configurações: `App.jsx:26-27` (lazyComRetry), `:489-501` (grupo Configurações, `showConfig`), `:992-993` (`<PrivateRoute tab="configuracoes">`).

**Bug existente descoberto (corrigir junto):** `home()` devolve `setorAtual` = CODIGO ('COZINHA') e `setores[].slug` minúsculo; em `ComoFazerHome.jsx:110` o chip ativo compara `setorAtual === s.slug` ('COZINHA' vs 'cozinha') → nunca destaca, e o emoji do chip (`:85`, `SETORES.find(x=>x.slug===s.slug)`) nunca casa. O contrato novo abaixo resolve (o front compara por `codigo`).

**Divergência de ícones:** o front atual mostra ESTOQUE 📦 / EXPEDICAO 🚚 / MOTORISTA 🛵; sua decisão #2 define ESTOQUE 🧊 / EXPEDICAO 📦 / MOTORISTA 🚚. Seguir a decisão #2 (o dono edita na tela depois).

## 3. Schema Prisma (aditivo — nada removido)
```prisma
model Setor {
  id        String   @id @default(uuid())
  codigo    String   @unique            // COZINHA… estável, nunca muda; é o que os outros registros guardam
  nome      String                       // editável
  icone     String?                      // emoji
  ordem     Int      @default(0)
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("setores")
}
```
Sem FK de `Funcionario.setor`/`ComoFazerConteudo.setores` para a tabela (mantém dados antigos válidos; integridade garantida pelo service). Atualizar apenas os comentários `// COZINHA | ESTOQUE…` nos dois campos.

## 4. Backend (dev-backend) — ordem
1. `schema.prisma`: model `Setor` (+ comentários). `prisma db push` cria a tabela no deploy (tabela nova, não derruba nada).
2. **`backend/services/setoresService.js`** (novo):
   - `SEED` constante: COZINHA "Cozinha" 🍳 ordem 1; ESTOQUE "Estoque" 🧊 2; EXPEDICAO "Expedição" 📦 3; MOTORISTA "Motorista" 🚚 4.
   - `garantirSeed()` — `createMany({ data: SEED, skipDuplicates: true })` **só se `count()===0`** (idempotente, seguro com 2 boots simultâneos pelo `@unique`). Chamada: (a) em `index.js` logo após `migrationService.run()` dentro de `try/catch` próprio (falha do seed NUNCA derruba o boot — só `console.error`); (b) rede de segurança: `listar()` com tabela vazia chama `garantirSeed()` uma vez.
   - `listar({ incluirInativos })` com **cache em memória de 60 s** (`invalidarCache()` em toda escrita; padrão `cidadeService.js:32-45`). Se a leitura do banco falhar e houver cache, usa o cache; se não, devolve `SEED` (tablet nunca fica sem nome).
   - `porSlug(slug)` / `porCodigo(cod)` — **resolvem também setor inativo** (dado antigo não pode virar 404 no painel); quem decide "só ativos" é o chamador. Forma devolvida: `{ id, codigo, slug: codigo.toLowerCase(), nome, icone, ordem, ativo }`. Mantém assinatura de `setorPorSlug/Codigo` em `comoFazerAuthService` para não quebrar chamadores (ver item 4), mas **assíncrona**: todo chamador ganha `await` (a lista abaixo é exaustiva — grep já feito, não há uso em `workers/`, `controllers/`, `adminExec.js`).
   - `gerarCodigo(nome)`: NFD sem acento → maiúsculas → não-alfanumérico vira `_` → trim de `_` → máx 30; vazio → `SETOR`; colisão → `_2`, `_3`…
   - `contarUso(codigo)` → `{ funcionarios: count(Funcionario.setor=codigo), conteudos: count(ComoFazerConteudo where setores has codigo), aparelho: bool }`.
   - `criar({nome, icone})`, `atualizar(id,{nome, icone, ordem, ativo})` (**nunca altera `codigo`**; nome obrigatório 1-40 chars, único ignorando caixa/acento entre os setores — evita "Cozinha"/"cozinha"), `reordenar([{id, ordem}])`, `excluir(id)` (409 `SETOR_EM_USO` se `contarUso` > 0; se 0, apaga e remove a entrada do `como_fazer_aparelhos`).
   - `codigosAtivos()` e `validarCodigo(cod, { permitirAtual })` para as validações.
3. **`backend/routes/setores.js`** (novo) montada em `index.js` como `app.use('/api/setores', authMiddleware, require('./routes/setores'))` (ao lado da linha 167). Permissão copiada de `cidades.js`: leitura qualquer logado (o RH precisa listar na ficha mesmo sem Configurações); escrita `podeGerir` (`admin || configuracoes===true || configuracoes.edit===true`), erro 403 `{ok:false,error,codigo:'SEM_PERMISSAO'}`.
   - `GET /api/setores?todos=1` → `{ ok:true, setores:[{ id, codigo, slug, nome, icone, ordem, ativo, uso:{funcionarios, conteudos} }], permissoes:{ gerir:bool } }`. Sem `?todos=1`: só ativos, **sem** `uso` (mais leve, para dropdowns).
   - `POST /api/setores` `{nome, icone?}` → 201 `{ok, setor}` (ordem = último+1).
   - `PUT /api/setores/:id` `{nome?, icone?, ordem?, ativo?}` → `{ok, setor}`. Desativar com uso: **permitido**, resposta traz `uso` (a tela avisa antes, ver §6); desativar não apaga nada.
   - `PUT /api/setores/ordem` `{ itens:[{id,ordem}] }` (declarar ANTES de `/:id`).
   - `DELETE /api/setores/:id` → 200 ou 409 `{codigo:'SETOR_EM_USO', uso}`.
   - Audit log da renomeação/desativação se o projeto já tem util de auditoria (grep `auditLog` — usar o mesmo padrão; opcional).
4. Trocar a lista fixa nos serviços (todos passam a `await setoresService`):
   - `comoFazerAuthService.js:18-25`: remover a constante; `setorPorSlug/Codigo` viram wrappers async de `setoresService.porSlug/porCodigo`; remover `SETORES` do `module.exports` (:189) **depois** de trocar todos os consumidores.
   - `comoFazerRoutes.js:44,58,170`: `await auth.setorPorSlug(...)`. Tablet (`/tablet/:setor/funcionarios` e `/entrar`) em setor **inativo** → 404 `SETOR_INATIVO` ("Este setor foi desativado pelo RH."); `/admin/tablet/:setor/parear` em inativo → 409. A resposta de `/tablet/:setor/funcionarios` (:52) passa a `setor:{ slug, nome, icone }` (campo novo, aditivo) — é daí que o tablet lê o título.
   - `comoFazerService.js`: `me()` (:143) → `setores: ativos.map({ codigo, slug, nome, icone, ordem })`; `home()` (:151,168) itera sobre ativos, cada item `{ codigo, slug, nome, icone, ordem, total, pendentes }` e **`setorAtual` continua sendo o CODIGO** (contrato já usado); fallback `|| 'COZINHA'` (:151,:301) vira "primeiro setor ativo" (se nenhum, `null` e `itens:[]`); `SETORES_COD` (:540) vira consulta em tempo de execução dentro do validador (não mais constante de módulo — senão setor criado depois seria "inválido" até reiniciar). Conteúdo já salvo com setor desativado: ao **editar** um conteúdo, códigos que já estavam no conteúdo continuam aceitos; códigos novos precisam estar ativos.
   - `comoFazerPainelService.js:21,32,118,165,173`: `setorCodigo()` async; fallback 'COZINHA' → primeiro ativo; `resumo()` (:165) soma sobre `listar()` (ativos) em vez de `auth.SETORES`.
   - `funcionarioController.js:209-213`: `validarCodigo(cod, { permitirAtual: funcionarioAtual.setor })` — aceita setor ativo, ou o mesmo setor que o funcionário já tem mesmo se inativo (editar outro campo da ficha não pode falhar); mensagem 400 `Setor inválido ou desativado.` Para isso o `atualizar` precisa ler o setor atual do funcionário só quando `setor` vier no body.
   - `seedComoFazer.js`: sem mudança (COZINHA existe), só garantir que o script chame `garantirSeed()` antes se rodar isolado.
5. `GET /api/funcionarios` (:83) segue devolvendo `setor` = código; **adicionar** `setorNome` (resolvido da tabela) é opcional e aditivo — não obrigatório pois o front resolve pela lista.
6. Bumpar `deployMarker` do `/admin-exec/ping` (`adminExec.js:67`, hoje `como-fazer-fase1-2026-10-20`) para algo como `setores-2026-10-20`.
7. Manuais/Clippy (no mesmo commit): criar `backend/manuais/abas/config-setores.md` + linha no `README.md` do índice + entrada em `ABAS` de `backend/services/copilotoService.js` (junto de `config-cidades`, ~:122): `{ slug:'config-setores', nome:'Configurações — Setores', rota:'/config/setores', perm:'configuracoes' }`. Ajustar `como-fazer.md` (:24,:37,:73 — "setor" agora é o cadastro de Setores, nomes mudam na hora), `rh-funcionarios.md` (:50 — remover a lista fixa "Cozinha, Estoque, Expedição ou Motorista"), `rh-como-fazer-painel.md` (:34, :56 — idem; e avisar que desativar setor tira o tablet dele do ar).

## 5. Frontend (dev-frontend) — ordem (depende do contrato do §4)
1. `frontend/src/services/setorService.js` (novo): `listar({todos})`, `criar`, `atualizar`, `reordenar`, `excluir` (axios `api`, `/setores`).
2. `frontend/src/hooks/useSetores.js` (novo): busca `GET /setores` (ativos) com cache de módulo + `invalidarSetores()`; devolve `{ setores, carregando, erro, nomeDe(codigo), iconeDe(codigo) }`. **Costura / fallback:** se a lista vier vazia ou der erro, `nomeDe(codigo)` devolve o próprio código com a 1ª letra maiúscula (ex.: "Cozinha"), os selects continuam mostrando o valor atual do registro (nunca ficam em branco) e a tela mostra aviso discreto "Não consegui carregar os setores" — **não** reintroduzir a lista fixa. Convenção única: tudo no front usa `codigo` MAIÚSCULO como valor; `slug` só para URL.
3. Substituir `SETORES` (e apagar a constante de `comoFazerService.js:123-128` ao final):
   - `FuncionarioFicha.jsx:221-227`: `<option>` geradas de `useSetores()`; se o `form.setor` atual não estiver na lista (setor desativado), incluir uma `<option>` extra "NomeAntigo (desativado)" com o valor atual — evita o select zerar e apagar o setor ao salvar. Helper de opções devolve **array**, nunca Fragment (lição SelectBusca).
   - `TabConteudos.jsx:16,42`, `EditorConteudo.jsx:261`: `MultiSelect options={setores} valueKey="codigo" labelKey="nome"`; default de `TabConteudos` = primeiro setor ativo (não 'COZINHA' fixo). No Editor, códigos já salvos e desativados continuam aparecendo (como selecionados, rotulados "(desativado)").
   - `TabTreinamentos.jsx:21,80`: se o filtro salvo (`useFiltrosSalvos`) apontar para código que não existe mais/está inativo, cair no primeiro ativo; opções com `codigo`.
   - `TabRotinas.jsx:74`: idem, `value={codigo}`.
   - `RelatorioComoFazer.jsx:26`: percorrer `setores.map(s=>s.codigo)` da lista em vez do array literal (esperar `carregando` terminar antes do `Promise.all`).
   - `PareamentoTablet.jsx:32`: lista de `useSetores()`; `s.slug` do servidor (minúsculo) para `parear(...)`/`links` (hoje usa maiúsculo e faz `.toLowerCase()` — manter o `.toLowerCase()` por segurança).
   - **Telas que valem também no tablet (sem login do app → não podem chamar `/api/setores`, que exige authMiddleware):** `ComoFazerHome.jsx:83-86` usa `dados.setores` da `/home` (campos `codigo,slug,nome,icone`); chip ativo = `setorAtual === s.codigo`; `nomeSetor` vem de `dados.setores.find(codigo===setorAtual)`; **remover** o fallback `SETORES.map` (se `dados.setores` vier vazio mostrar só os itens, sem chips). `ConteudoPagina.jsx:159-160` usa `me.setores` (`useComoFazerMe`) para mapear código→nome (cai para o código capitalizado se não achar). `EntrarSetor.jsx:12-13,78` pega título do `setor` devolvido por `/tablet/:slug/funcionarios`; enquanto carrega mostra "Como Fazer"; erro `SETOR_INVALIDO`/`SETOR_INATIVO` → tela clara "Este setor não existe mais / foi desativado. Fale com o RH.".
4. **Tela `frontend/src/pages/Configuracoes/Setores.jsx`** (novo; espelhar `Cidades.jsx`/`CategoriasEstoque.jsx` — classes de botão `btnPrim/btnSec/btnIcone`, `Modal` com `rounded-t-2xl` no mobile, 44px de toque, `useAuth` para espelhar `podeGerir` exatamente igual ao backend: `admin || configuracoes===true || configuracoes?.edit===true`, nunca `!!perms.configuracoes`):
   - Lista: ícone (emoji), nome, código (cinza, só leitura), nº de funcionários e de conteúdos, badge Ativo/Inativo (verde / vermelho), ordem. Desktop tabela, mobile cards. Reordenar por setas ↑↓ (mais confiável no iPad que drag) que chamam `PUT /setores/ordem`.
   - "Novo setor" (modal: nome + ícone emoji), "Editar" (nome, ícone; código mostrado e travado com texto "o código interno não muda — só o nome"), "Desativar/Reativar", "Excluir" (só visível/habilitado quando `uso` = 0; senão tooltip/aviso).
   - Aviso ao desativar setor em uso: "Setor X tem N funcionário(s) e M conteúdo(s). Eles continuam cadastrados, mas o setor some das escolhas e o tablet dele fica fora do ar. Confirmar?".
   - Após salvar chamar `invalidarSetores()` e recarregar.
   - Sem `SelectBusca` necessário (não há dropdown); se houver, usar `SelectBusca`.
5. `App.jsx`: `lazyComRetry` para `Setores` (:~27), item `{ to:'/config/setores', icon: Users2/Tags (ícone já importado ou importar do lucide e **conferir import**), label:'Setores' }` no grupo Configurações (:~500, depois de Cidades), `<Route path="/config/setores" element={<PrivateRoute tab="configuracoes"><ConfigSetores /></PrivateRoute>} />` (:~993).
6. `npm run build` obrigatório. Manual/Clippy e página `novidade-setores.html` (+ entrada no topo de `frontend/public/novidades.json`, sem og:image, accordions abertos, mockups com legendas numeradas) conforme CLAUDE.md.

## 6. Contrato resumido (a costura)
| Rota | Quem chama | Resposta (campos novos em negrito) |
|---|---|---|
| `GET /api/setores[?todos=1]` | RH/ficha/painel/config (app logado) | `{ok, setores:[{id,codigo,slug,nome,icone,ordem,ativo,uso?}], permissoes:{gerir}}` |
| `GET /api/como-fazer/me` | app e tablet | `setores:[{slug, nome, **codigo, icone, ordem**}]` (só ativos) |
| `GET /api/como-fazer/home` | app e tablet | `setores:[{slug, nome, total, pendentes, **codigo, icone, ordem**}]`; `setorAtual` = codigo (inalterado) |
| `GET /api/como-fazer/tablet/:slug/funcionarios` | tablet | `setor:{slug, nome, **icone**}`; **404 `SETOR_INATIVO`** novo |
Nenhum campo existente é removido/renomeado (nenhuma API pública `/api/ia-consulta` envolvida — grep confirmou que não referencia setor).

## 7. Riscos
- **Deploy com tabela vazia:** `db push` cria a tabela vazia e o boot semeia; rede de segurança no `listar()` + fallback `SEED` em memória. Janela de deploy: front antigo com back novo continua funcionando (front antigo usa lista fixa e códigos; back segue aceitando os 4). Back antigo + front novo: `GET /api/setores` 404 → hook cai no fallback (nome capitalizado) sem quebrar.
- **Tablet já pareado:** chave guardada em `como_fazer_aparelhos[codigo]` e no localStorage do aparelho por `slug` minúsculo — ambos inalterados porque `codigo` nunca muda. Teste obrigatório: renomear e confirmar que o tablet não pede novo link. Se alguém EXCLUI setor (só sem uso) a chave é removida — correto.
- **Desativar setor com funcionários:** eles somem da grade do tablet (404 SETOR_INATIVO) — intencional e avisado na tela; conteúdos ficam intactos. Reativar restaura tudo.
- **Constante calculada no load** (`SETORES_COD`, `comoFazerService.js:540`) faria setor novo ser rejeitado até reiniciar — por isso vira consulta dinâmica.
- **Cache de 60 s:** renomear aparece em até 60 s só se houver mais de uma instância; na instância única `invalidarCache()` torna imediato. Front: o hook recarrega ao montar a tela.
- **Conflito `slug` maiúsculo (front) × minúsculo (back):** fonte de bug real hoje (chip ativo). Convenção do §5.2.
- **Permissões:** leitura aberta a logado × escrita `configuracoes.edit`; o front de Setores espelha exatamente (objeto, não booleano). Perfil "Producao" deve ser testado.
- **Nome duplicado/ícone vazio** e nomes longos quebrando chips (`truncate`, máx 40).
- **`seedComoFazer`** continua válido; não mexer nele além de chamar o seed se rodar isolado.
- Sensíveis do CLAUDE.md: nenhuma dessas áreas é tocada (NF-e, WhatsApp, ia-consulta, upload, financeiro). Prisma: nenhum `$transaction` necessário (operações simples); se `reordenar` usar transação, `{ timeout:20000, maxWait:10000 }`.

## 8. O que NÃO fazer
- Não deixar renomear alterar `codigo`; não migrar `Funcionario.setor`/`conteudo.setores` para id.
- Não manter a lista fixa como "fallback" no front (esconderia setor novo/renomeado); fallback só capitaliza o código.
- Não chamar `/api/setores` de telas que rodam no tablet (sem login).
- Não permitir excluir setor em uso; não fazer o seed sobrescrever setores já editados (só roda com tabela vazia).
- Não usar `<select>` nativo, `!!perms.configuracoes`, nem `React.lazy` no App.jsx.

## 9. Critérios de aceite (QA clica de verdade, desktop + 375px + tablet)
1. Deploy limpo: `GET /api/setores` devolve os 4 (nomes/ícones do seed); Configurações → Setores aparece no menu só para quem tem Configurações; usuário sem permissão não vê a rota e recebe 403 na escrita.
2. **Renomear "Cozinha" → "Cozinha Quente"** e ver o nome novo: na ficha do funcionário (select Setor), na Home do Como Fazer (chip + subtítulo), nos chips, no painel (Treinamentos, Rotinas, Aparelhos, Relatório, seletor de setor do Editor/Novo conteúdo), na página de conteúdo e no título do tablet `/setor/cozinha`. **Sem perder** o pareamento do tablet (não pede novo link), os funcionários na grade de fotos nem os conteúdos/treinamentos.
3. **Criar "Limpeza"**: código `LIMPEZA` gerado; atribuí-lo a um funcionário (ficha, salvar, recarregar mantém) e a um conteúdo novo (e publicar); aparece chip na Home; gerar link de pareamento `/setor/limpeza` funciona e o funcionário entra no tablet.
4. **Desativar setor em uso** → aviso com contagem de funcionários/conteúdos; após confirmar some dos dropdowns, tablet dele responde "desativado", dados preservados; reativar restaura. Excluir: bloqueado com uso, permitido sem uso.
5. Editar ficha de funcionário cujo setor está desativado não zera nem rejeita o setor; trocar para outro funcionando.
6. Ordem: setas mudam a ordem e ela vale nos chips/dropdowns.
7. Fallback: derrubar `/api/setores` (simular erro) → ficha, editor e painel não quebram nem ficam em branco; mensagem de erro clara.
8. Chip ativo da Home agora destaca o setor selecionado (bug antigo) e mostra emoji.
9. `npm run build` ok; sem scroll horizontal em 375px; botões ≥44px; manuais/ABAS/novidade publicados; produção: depois do deploy, `ping` com o `deployMarker` novo e `GET /api/setores` respondendo (não 404).

## 10. Checklist do revisor
Grep final por `'COZINHA'|'ESTOQUE'|'EXPEDICAO'|'MOTORISTA'` e `SETORES` em `backend/` e `frontend/src/` (restam só: seed do service, `seedComoFazer`, comentários); todo `await` nos `setorPor*`; `codigo` nunca em `data` do update; `permissoes.configuracoes` tratado como objeto; hook sem lista fixa; `lazyComRetry` e import do ícone no `App.jsx`; nenhum campo removido de resposta existente.
