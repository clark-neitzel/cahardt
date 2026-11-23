# PLANO — Conferência da Carga pelo motorista (1ª etapa: no toque, sem bipe)

Autor: arquiteto (19/11/2026), gravado e corrigido pelo gerente de projeto. `[C]` = confirmado no código, `[S]` = suposição/decisão.
Desenho aprovado: `frontend/public/proposta-conferencia-motorista.html`. Base reaproveitada: `docs/separacao-carga/PLANO.md`.

## 0. Resumo para o dono
1. Tela nova "Conferir carga (motorista)" para quem tiver a permissão nova que o dono liga no painel.
2. **Admin vê TODAS as cargas pendentes; quem não é admin vê só as cargas em que é o motorista** (decisão do dono; o arquiteto havia proposto o contrário para admin — prevalece a do dono). Sempre só cargas com pedido pendente de entrega.
3. Conta do zero; não vê o que a separação contou, só aviso na linha quando a separação marcou falta.
4. Letra grande, LEVAR / CONFERI / FALTA, carga inteira ou por pedido, ordem dos pedidos. Funciona sem internet, igual à Separação.
5. Falta com motivo: "Não veio" ou "Vem depois".
6. Por pedido: bolsas e uma etiqueta por bolsa, na mesma Zebra.
7. Concluir → Embarque mostra "conferida por João às 06:42, N faltas"; sem conferir → "saiu sem conferência".
8. Cartão da entrega (Minhas Entregas e Rota → Entregas) mostra bolsas e o que faltou do pedido.
9. Não muda: Separação, pedido, nota, estoque, carga, folha impressa, conferência por bipagem da doca. Nada bloqueia a entrega.
10. Falta por cliente só existe se conferir "por pedido".
11. **Requisito duro do dono: sem internet funciona; fechar e abrir o app de novo SEM sinal volta para a conferência com carga e toques guardados** (ver frente C).

## 1. Nomes
Já existe "Conferência de carga" da doca (`conferenciaCargaService.js`, `Embarque.conferenciaConcluidaEm`, `ConferenciaCargaPanel.jsx`). Tudo novo se chama **ConferenciaMotorista** (tabelas, service, rota `/api/conferencia-motorista`, URL `/conferencia-motorista`, permissão `Pode_Conferir_Carga_Motorista`). Rótulo na tela: "Conferir carga (motorista)".

Lista do motorista NÃO usa `conferenciaConcluidaEm: null` (a doca pode concluir antes e a carga sumiria). Filtro: `responsavelId = ele` (ou todas, se admin / `Pode_Ver_Todas_Entregas`), `dataSaida >= ontem (Brasília)`, `pedidos some {cancelado:false, devolucaoFinalizada:false, statusEntrega:'PENDENTE'}`. Sem teto de data.

## 2. Reaproveitar × duplicar (decisão)
- **Banco:** 4 tabelas novas espelhadas, só aditivas, no fim do `schema.prisma`: `conferencia_motorista_cargas` (`embarqueId @unique`), `..._linhas`, `..._pedidos`, `..._conclusoes` (mesmos campos das `separacao_carga*`). NÃO usar coluna `tipo` nas tabelas existentes.
- **Backend:** `backend/services/conferenciaMotoristaService.js` copiado/adaptado de `separacaoCargaService.js` (cabeçalho "ESPELHO de…"). **Zero edição** em `separacaoCargaService.js`, nas tabelas e rotas da Separação.
- **Frontend:** parametrizar hook/storage/componentes por um objeto `config` com padrão idêntico ao atual da Separação:
  - `frontend/src/pages/Logistica/SeparacaoCarga/config.js` com `CONFIG_SEPARACAO` e `CONFIG_CONFERENCIA` (tipo, prefixoStorage `separacao_carga_v1`/`conferencia_motorista_v1`, service, origemImpressao, chavePrefImpressora, motivos, textos, rotaOffline).
  - `separacaoStorage.js` → `criarStorage(prefixo)`; exports nomeados atuais continuam no prefixo antigo.
  - `useSeparacaoCarga.js` aceita `config` (padrão `CONFIG_SEPARACAO`): trocar os usos de `separacaoCargaService` (~214, 261, 321, baixar), `origem:'SEPARACAO'` em `enviarEtiquetas` (~471), textos 403/404, import do storage.
  - `separacaoCalculo.js`: só MOTIVO_* e função de rótulo por config.
  - `LinhaSeparacao`, `BarraCarga`, `ListaPorPedido`, `FicouFaltando`: prop opcional `textos` (e `aviso` na linha); sem a prop renderiza igual a hoje. Grepar literais "Separ", "Separei", "Concluir separação".
  - Página nova `frontend/src/pages/Logistica/ConferenciaMotorista/ConferenciaMotoristaPage.jsx`. Reaproveitados sem mudar: `etiquetaBolsa.js`, `separacaoCarga.css` (`.sepc`), `AvisoCargaMudou`.
- **Regra de ouro:** a Separação está em uso pelo dono. Mudança nela = mecânica, padrão idêntico; regressão completa antes do QA.

## 3. Escopo "só as dele" [C]
`Embarque.responsavelId` obrigatório; `Vendedor.id = req.user.id`; mesmo critério de `routes/entregas.js:232/259`. Regra do servidor em **list, baixar e sincronizar**: admin ou `Pode_Ver_Todas_Entregas` vê/escreve em qualquer carga; os demais só onde `responsavelId === req.user.id`, senão 403 `CARGA_DE_OUTRO_MOTORISTA`. **Admin: padrão = todas** (`?todas=1` no front por padrão para admin), com filtro "Só as minhas" (`useFiltroSalvo('conferencia-motorista:minhas', false)`). A permissão nova NÃO exige `Pode_Executar_Entregas` nem `Pode_Acessar_Embarque`. Carga reatribuída: o aparelho antigo recebe 403, para de insistir e GUARDA o que tinha (não descarta).

## 4. Offline — pontos a trocar (grep feito)
Criar `frontend/src/utils/rotasOffline.js` com `ehRotaOffline(pathname)` e `rotaOfflinePara(snapshot)` (devolve `/separacao-carga`, `/conferencia-motorista` ou null conforme permissão do snapshot e qual `:ultima` existe; se as duas, a mais recente). Trocar:
1. `contexts/AuthContext.jsx:11` `ROTA_OFFLINE` → lista.
2. `AuthContext.jsx:14-16` `temSeparacaoEmAndamento` → checar as 2 chaves (`separacao_carga_v1:<uid>:ultima` e `conferencia_motorista_v1:<uid>:ultima`).
3. `AuthContext.jsx:~112-130` (caminhoOk, podeSeparar, `caminho === '/'`): `Pode_Separar_Carga` **ou** `Pode_Conferir_Carga_Motorista === true`.
4. `App.jsx:165` PrivateRoute `startsWith('/separacao-carga')` → `ehRotaOffline`.
5. `App.jsx:190` RootRoute `Navigate to="/separacao-carga"` fixo → `rotaOfflinePara`.
6. `App.jsx:341` `filtrarSecoesPorPerfil`: exceção também para `/conferencia-motorista` (perfil motorista só tem ['Vendas','Financeiro']; a Logística some se sobrar 1 item — crítico).
7. `contexts/DiarioContext.jsx:29`, 8. `components/Diario/DiarioGateway.jsx:74`, 9. `components/PendenciaRotaGateway.jsx:176` → `ehRotaOffline`.
10. `App.jsx` ~44 (`lazyComRetry`) e ~1004 (`<PrivateRoute tab="Pode_Conferir_Carga_Motorista">`).
Não precisam mudar [C]: `lazyComRetry.js`/`main.jsx` (só pelo item da frente C), `sw.js` (só pelo item da frente C), o efeito de revalidar silenciosamente.

## 5. Contrato de API (a costura — seguir à risca)
Prefixo `/api/conferencia-motorista`, em `backend/index.js` com `authMiddleware`, logo abaixo do mount de `/api/separacao-carga`. Erros `{ error:'português', codigo }`. Datas ISO. Corpos de sincronizar/estado idênticos aos de `docs/separacao-carga/PLANO.md` (seções 2.2 e 2.3): ops L/P/O/X, valor absoluto, carimbo `c`, idempotência por `requisicaoId`, ≤300 ops, bolsas 0..20.
Gate `exigirConferencia`: `perms.admin || perms.Pode_Conferir_Carga_Motorista === true`, senão 403.

**5.1 `GET /cargas?todas=0|1`** → `{ agora, cargas:[{ id, numero, dataSaida:'YYYY-MM-DD', motorista, motoristaId, minha:boolean, versao, totalPedidos, conferencia:{ iniciada, concluidaEm, concluidaPorNome } }] }`. `todas=1` só vale para admin ou `Pode_Ver_Todas_Entregas` (para os demais é ignorado: resposta filtrada).

**5.2 `GET /cargas/:embarqueId/baixar`** → igual ao baixar da Separação (pedidos, produtos, assinatura, SEM preço) mais `carga.motoristaId` e
`carga.avisosSeparacao: { porProduto:{ "<produtoId>":{ falta, motivo:"VEM_DEPOIS|NAO_TEM|null" } }, porPedidoProduto:{ "<pedidoId>:<produtoId>":{ falta, motivo } } }`.
SÓ falta e motivo — **NUNCA `quantidadeSeparada`** (decisão A1). Origem: `separacao_carga_linhas` com `tocada && quantidadeSeparada < pedir`; `porPedidoProduto` das linhas `p:<pedido>:<produto>`; `porProduto` da linha `c:<produto>` ou, se só existir `p:`, da soma das `p:*`; motivo misto → null. A **assinatura NÃO inclui os avisos** (mudança na separação não dispara o modal "carga mudou"). 403 `CARGA_DE_OUTRO_MOTORISTA`, 404 `CARGA_NAO_ENCONTRADA`. O estado devolvido não leva nada da Separação.

**5.3 `POST /cargas/:embarqueId/sincronizar`** → igual ao da Separação, mais `avisosSeparacao` na resposta (o ciclo de 30 s atualiza os avisos em silêncio e regrava `:carga` no aparelho, sem modal). Motivo `m` válido: só `NAO_VEIO | VEM_DEPOIS` (outro vira null no servidor). O `X` (conclusão) grava resumo e `versaoEmbarque` **sem subir `Embarque.versao`**.

**5.3b `GET /cargas/:embarqueId/avisos`** → não existe; os avisos vêm no baixar e no sincronizar.

**5.4 Escritório `GET /resumo?ids=a,b,c`** (≤100), gate `checkAcessoEmbarque` exportado de `routes/embarques.js:852` (gate por rota, não no `router.use`):
`{ resumos:{ "<embarqueId>":{ status:"CONFERIDA|EM_ANDAMENTO|NAO_INICIADA", conferidaPorNome, conferidaEm, modo:"CARGA|PEDIDO", faltas, bolsasTotal, saiuSemConferencia, itensFalta:[{ pedido:"#904512 — Mercado Bom Preço", produto, falta, motivo }] } } }` (≤50 itensFalta). `saiuSemConferencia = status != CONFERIDA && (existe pedido da carga com statusEntrega != 'PENDENTE' || dataSaida < hoje Brasília)`, calculado no servidor.

**5.5 Extensão aditiva `GET /api/entregas/pendentes` (`routes/entregas.js:~260`)**: cada pedido ganha `conferenciaMotorista: null | { status:'CONFERIDA|EM_ANDAMENTO', bolsas:number|null, faltas:[{ produto, unidade, falta, motivo }] }`, montado das linhas de escopo PEDIDO e de `...Pedido.bolsas`, 2 queries em lote por `pedidoId`, **dentro de try/catch** (falha nunca derruba o roteiro). Sem preço, sem número separado. Consumidores [C]: `PainelMotorista.jsx` e `pages/Rota/RotaLeads.jsx:2201` (`CardEntregaPendente`, ~959) — os dois precisam do chip. `/api/ia-consulta` NÃO é tocada.

**5.6 Impressão** (`backend/routes/impressaoEtiquetasRoutes.js`, aditivo): `ORIGENS.CONFERENCIA = { tamanho:'100x120', linguagem:'ZPL', tipo:'ETIQUETA_PEDIDO', usaCopias:false, zplSequencia:true }` (~31) e `if (origem === 'CONFERENCIA') return p.Pode_Conferir_Carga_Motorista === true;` (~47). `etiquetaBolsa.js` reaproveitado (mesmo "BOLSA i de N", cliente, cidade). Impressoras: `GET /impressoras?origem=CONFERENCIA`; SelectBusca lembrado em `useFiltroSalvo('etiquetas:impressora:CONFERENCIA')`. Regras offline herdadas do hook ("Imprimir agora", nada sai sozinho). Rótulo da fila: "Bolsas (conferência) Carga #… · #… — cliente".

## 6. Permissão `Pode_Conferir_Carga_Motorista` (booleana, `=== true`, front = back)
- `PermissoesModal.jsx`: default false (~43); `BOOL_INDEX` sec `logistica` (~308) — sem isso o dono não liga nem vê no histórico; `MenuToggle` (~1187). Nome "Conferir Carga (Motorista)", desc "Conferir a carga do próprio caminhão no celular (funciona sem internet)".
- Backend: `exigirConferencia` e `podeOrigem('CONFERENCIA')`.
- Frontend: `App.jsx` grupo Logística (~450) com `hasPermission('Pode_Conferir_Carga_Motorista')` + ponto 6 da seção 4. **Botão "Conferir carga" no header do `PainelMotorista`** ao lado de "Folha" (caminho real do motorista, que pode nunca abrir o menu).
- `backend/services/copilotoService.js` ABAS: `{ slug:'conferencia-motorista', nome:'Conferir Carga (Motorista)', rota:'/conferencia-motorista', perm:'Pode_Conferir_Carga_Motorista' }`.
- Manuais: novo `backend/manuais/abas/conferencia-motorista.md` + linha no `README.md`; atualizar `minhas-entregas.md` (chip e botão), `embarque.md` (comprovante), `separacao-carga.md` (1 frase).
- Novidade: `frontend/public/novidade-conferencia-motorista.html` espelhando `novidade-tarefas.html` (mockups com pins das 3 telas: conferência, cartão da entrega, comprovante no Embarque; accordions abertos; og:title/og:description, SEM og:image; SEM botão "Abrir o app") + entrada no topo de `novidades.json` + texto pronto para o grupo. O texto deve dizer que bolsa informada na separação e na conferência são contagens independentes (podem sair 2 etiquetas se os dois imprimirem).

## 7. Bipe (2ª etapa) — sem fechar a porta
Linha já identificada por `produtoId` (`c:<produtoId>`, `p:<pedidoId>:<produtoId>`); o bipe chamará o mesmo `mais(k)`. Depois acrescentar `ean` aditivo em `carga.produtos` e mapa EAN→produtoId baixado. Nada disso agora.

## 8. Execução (3 frentes paralelas)
**Backend:** (1) 4 models no fim do `schema.prisma`, `prisma validate/generate`; (2) `conferenciaMotoristaService.js` (listarCargas(user,todas), montarCarga c/ avisosSeparacao, lerEstado, sincronizar, resumoPorEmbarques, resumoPorPedidos) — conferir cada `select` no schema; (3) `routes/conferenciaMotorista.js` com os gates e a regra "carga é dele" em baixar/sincronizar; (4) `backend/index.js` 2 linhas (há linha de OUTRA sessão no arquivo: não commitar a dela; só deixar editado); (5) `impressaoEtiquetasRoutes.js`; (6) `entregas.js` chip em try/catch; (7) manuais e copilotoService; (8) testes com `curl` com a saída anexada: baixar e sincronizar 2×(idempotência), 2 aparelhos com carimbos trocados, motorista B pedindo carga de A → 403, admin vê todas, payload SEM `quantidadeSeparada`, `/resumo` nos 3 estados, impressão CONFERENCIA 403/201 e SEPARACAO/PEDIDO inalteradas. Sem `$transaction` (se usar: `{ timeout:20000, maxWait:10000 }`).
**Frontend A:** permissão/menu; `rotasOffline.js` + os 10 pontos; `config.js` + storage fábrica + hook parametrizado (**primeiro a regressão da Separação**); service do front; página + props `textos`/`aviso`; chip nos 2 cartões (componente único); comprovante no Embarque (`PainelEmbarque.jsx` ~131/179 e `DetalhesCargaModal.jsx` ~630, um único `/resumo?ids=` junto do fetchData); botão no `PainelMotorista`; novidade; `cd frontend && npm run build`. Design system: SelectBusca, CampoNumero, useFiltroSalvo, lazyComRetry, tema pílula, mobile ≥320px.
**Frente C (service worker, requisito offline do dono):** ver seção 9.

## 9. Offline garantido (frente C) — requisito do dono, testável
Problema conhecido (nota de 18/11): o `sw.js` só renova a "casca" (index.html e chunks) em navegação a `/` com rede; aparelho atualizado só pelo botão ↻ pode reabrir sem sinal na versão antiga e cair em "Sem conexão". Correção: o service worker passa a **pré-carregar/renovar no cache o `index.html` atual e os chunks das telas offline (Separação e Conferência)** sempre que o app abre com rede (mensagem `postMessage` ao SW a partir do `main.jsx`, também no evento `online`) e ao baixar uma carga; subir a constante `VERSAO` do `sw.js`; manter `/api` nunca interceptado e `index.html`/`sw.js` sem cache longo. Critério de aceite com DOIS builds: instala build N → atualiza para N+1 pelo caminho normal → offline → fecha e reabre (aba nova / PWA) → a tela abre com a carga e os toques. Também: o que acontece se o aparelho nunca abriu a tela antes de ficar sem sinal (deve cair em mensagem clara, não tela branca). Arquivos: `frontend/public/sw.js`, `frontend/src/main.jsx`, `frontend/src/utils/lazyComRetry.js` (só se preciso). NÃO mexer em `useSeparacaoCarga.js` (frente A é dona dele).

## 10. O que pode quebrar
Separação em uso (parametrização) → padrão idêntico + regressão; AuthContext e 3 gateways são do app inteiro (só caminhos de falha mudam; regressão: login, logout, 401, `TelaSemConexao` em outra rota sem rede); `/entregas/pendentes` tem 2 consumidores (campo aditivo, try/catch). Não mexo em `Embarque.versao`, `routes/embarques.js`, `conferenciaCargaService` (doca), `/api/ia-consulta`, pedido/nota/estoque.

## 11. Critérios de aceite (QA clica)
1. Sem permissão: item não aparece, rota "Acesso Negado", `GET /cargas` 403, impressão CONFERENCIA 403. Com ela, libera sem exigir Executar_Entregas/Embarque. Admin sempre entra e vê todas as cargas.
2. Não admin: só as dele com pedido pendente; carga de outro → 403 em baixar/sincronizar; carga 100% entregue some.
3. Carga inteira: LEVAR/CONFERI/FALTA, "Conferi tudo", − e +, digitar, motivo "Não veio"/"Vem depois", "Ficou faltando", concluir (com aviso de linhas não tocadas).
4. Por pedido: ordem Da carga/Por cidade/Eu escolho (persiste), bolsas 0–20, "Imprimir N etiquetas" sai "BOLSA i de N" na Zebra.
5. A1: nenhuma tela/resposta mostra o número separado; "Separação avisou" só quando a separação marcou falta, nos dois níveis.
6. **Offline:** baixar, rede off, tocar, F5 e reabrir pelo ícone: volta na mesma carga com os toques; rede on envia sozinho sem duplicar; etiquetas offline só em "Imprimir agora". **Mais o teste de dois builds da seção 9.**
7. Dois aparelhos (ou motorista + admin): último toque por linha vence; linhas diferentes se preservam.
8. Carga mudou no meio → aviso "A carga mudou"; mudança só nos avisos da separação NÃO dispara o modal.
9. Carga entregue no meio → fecha e avisa sem perder o não enviado.
10. Motorista reatribuído → 403, motivo, guarda o que tinha, não insiste.
11. Embarque: sem conferir e com pedido entregue ou saída anterior a hoje → selo âmbar "Saiu sem conferência"; concluído → "Conferida por João às HH:MM · N faltas" no card e no modal.
12. Cartão da entrega mostra "N bolsas" e "Faltou: …" em Minhas Entregas e Rota → Entregas; roteiro não quebra se a conferência falhar.
13. Regressão: Separação (todos os fluxos, offline), conferência da doca por bipagem, versão/QR do Embarque, etiquetas de Pedido/Produto/Kit Festa/Separação, login, logout, deploy novo, menu por perfil (motorista com só esse item ainda vê a Logística).
14. Revisor: sem `React.lazy`, `<select>` nativo, `window.open`, iframe, `!!perms.x` em objeto; todo `select` Prisma com campo existente; schema só adiciona; build limpo.

## 12. NÃO fazer
Não alterar `separacaoCargaService.js`, `separacao_carga*`, rotas da Separação; não usar `conferenciaConcluidaEm: null` na lista do motorista; não devolver `quantidadeSeparada`; não incluir avisos na assinatura; não subir `Embarque.versao`; não tocar `/api/ia-consulta`; não bloquear entrega por falta de conferência (B1); **não mandar WhatsApp/notificação de falta** (não é ato do cliente; quebra a regra do bot); não gravar arquivo; não esquecer nenhum dos 10 pontos offline; não usar o nome "conferenciaCarga" para o novo.

## 13. Estimativa e só-em-aparelho
Backend ~2 d; frontend A ~3,25 d; frente C ~0,75 d; em paralelo ≈ 3 d de desenvolvimento + ~1,5 d de QA/revisão/correção/gerente ≈ **4,5 dias úteis**. Só em aparelho real: iPhone PWA reabrindo sem sinal pelo ícone, Zebra a partir do celular do motorista, A+ e barra fixa em tela pequena, luva, volume real de cargas, teste em produção atravessando um deploy.

## 14. Decisões do dono / do gerente
- "Não veio" + "Vem depois" na conferência; "Não tem" sai (só na Separação) — adotado.
- Faixa "Faltou na carga" para carga inteira: fora desta etapa (opcional +0,25 d).
- Admin vê todas as cargas por padrão (decisão do dono, 19/11).

---

# ADENDO (arquiteto, 19/11) — PREVALECE sobre as seções acima onde houver conflito

## A. Quem vê o quê (substitui a seção 3)
`perms.admin` vê TODAS as cargas pendentes; quem não é admin vê SÓ onde `Embarque.responsavelId === req.user.id`. **Cai** o parâmetro `?todas=`, a exceção por `Pode_Ver_Todas_Entregas` e o filtro "Só as minhas". Vale em listar, baixar e sincronizar (senão 403 `CARGA_DE_OUTRO_MOTORISTA`). Na lista do admin `minha` continua no JSON e a tela mostra o nome do motorista em cada carga. Admin que sincroniza carga de outro grava normalmente (último toque vence; o comprovante guarda o nome de quem conferiu). 5.1 passa a `GET /cargas` (sem query), item `{ id, numero, dataSaida, motorista, motoristaId, minha, versao, totalPedidos, conferencia }`.

## B. OFFLINE garantido — causa raiz e solução definitiva (substitui a seção 9)
Causa [C]: `sw.js` só regrava a casca `/` em navegação exatamente a `/` com rede; o botão ↻ faz `window.location.reload()` na rota atual (`App.jsx:628`/`:663`), então o `index.html` em cache continua o do build antigo; `/assets/` é cache-first e só guarda o que já foi pedido (chunk da tela do build novo nunca foi pedido); deploys comuns não mudam os bytes do `sw.js`, então a instalação (que grava `/`) não reroda; `lazyComRetry`/`main.jsx` (`recarregarPorChunk`) apagam todos os caches e recarregam, deixando a casca offline vazia.
Solução (4 peças, aditivas):
- **(a) Vite:** plugin em `frontend/vite.config.js` (hoje só `react()`) que no `generateBundle` emite `dist/build-info.json` = `{ id, criticos:[/assets/…] }` (fecho transitivo `imports`+`dynamicImports`+CSS do entry `index` e das telas `SeparacaoCargaPage` e `ConferenciaMotoristaPage`, incluindo `etiquetaBolsa`, `etiquetaRaster`, `html2canvas`, `etiquetasFuncionario`; ≈1,5 MB), `define: { __BUILD_ID__ }` com o mesmo `id`, e no `closeBundle` substitui o marcador `__BUILD_ID__` em `dist/sw.js` (assim o `sw.js` muda a cada build e o navegador reinstala o SW a cada deploy). Em dev o marcador fica intacto (SW só registra em PROD).
- **(b) `sw.js`:** `VERSAO = 'hardt-' + BUILD_ID` (caches antigos apagados no `activate`); `install` baixa `/` (`cache:'reload'`) e `/build-info.json` (no-store) e grava todos os `criticos` em `CACHE_ASSETS` — atômico: se algum falhar o `waitUntil` rejeita e a versão antiga continua ativa; `navigate` regrava `/` em TODA navegação SPA bem-sucedida (caminho sem extensão, fora de `/api`; páginas estáticas `novidade-*.html` NÃO são gravadas sob `/`); handler `message {tipo:'GARANTIR_OFFLINE'}` refaz tudo de forma idempotente (`/`, build-info, `criticos` faltantes) e responde `{tipo:'OFFLINE_PRONTO', ok, faltando:[…], buildId}`. `/api` continua NUNCA interceptado.
- **(c) `frontend/src/utils/garantirOffline.js`** (dono: frente C): `garantirOffline(): Promise<{ ok, faltando, buildId }>` chama o SW; sem controlador (1º acesso) ou sem resposta em 20 s → `ok:false`. Chamado (pela frente A, no hook) em `abrirCarga` depois do `baixar` (substitui o `aquecerCache()` atual, que fica complementar) e ao abrir a tela com rede; e (pela frente C) depois de qualquer recarga de `lazyComRetry.js`/`main.jsx`. A faixa verde "Carga baixada neste aparelho — pode entrar na câmara" só aparece se voltou `ok:true`; senão faixa âmbar "Este aparelho ainda não está pronto para ficar sem sinal. Feche e abra o app com internet." (absorve o texto atual de `semControladorSW`). A tela mostra o id do build (`__BUILD_ID__`) num canto discreto do painel da barra da carga (prova para QA e dono).
- **(d) `lazyComRetry.js`/`main.jsx`:** só acrescentam `garantirOffline()` após o recarregamento online (a ordem do fluxo de deploy novo NÃO muda; continua limpando e recarregando uma vez).

**Aparelho que nunca abriu a tela antes de ficar sem sinal:** (1) já tem o SW novo → a casca está pré-carregada; offline a tela ABRE, sem carga → "Sem internet e nenhuma carga baixada neste aparelho — abra a carga com sinal antes de entrar na câmara"; (2) nunca baixou carga/nunca abriu logado depois da atualização → o `AuthContext` só usa snapshot com `:ultima` (`AuthContext.jsx:14-16`), então cai em `TelaSemConexao` (por desenho: nada para mostrar, nada se perde); (3) ainda com o SW antigo → o 1º acesso online depois do deploy busca o `sw.js` novo e instala o precache; a faixa âmbar/`GARANTIR_OFFLINE` confirmam antes de entrar na câmara; (4) o iOS apagou o armazenamento → nada garante; a faixa reverifica a cada abertura com sinal (risco residual, só se prova em aparelho real).

**Prova (QA, DOIS builds, saída anexada):** 1) build N copiado para `build-N/`; muda algo visível; build N+1 em `build-N1/` (ids diferentes). 2) servir N com fallback SPA e proxy `/api` ao backend local, porta fixa (mesma origem). 3) logar com a conta de teste, abrir `/conferencia-motorista`, baixar carga, esperar faixa verde, 5 toques, anotar id e `caches.keys()`. 4) parar N, subir N+1 na MESMA porta; atualizar pelo caminho normal (↻ e, em outra rodada, só reabrir): `build-info.json` com id N+1; `caches.keys()` com `hardt-<N+1>` e sem N; todos os `criticos` em cache; faixa verde; tela mostra id N+1. 5) parar o servidor por completo (offline de verdade), fechar a aba e reabrir (janela nova e, se der, `--app=`): abrir `/` e `/conferencia-motorista` direto → abre na mesma carga com os 5 toques e id N+1; repetir `/separacao-carga`. 6) variantes: (i) atualizar só navegando para rota ≠ `/`; (ii) perfil novo que nunca abriu a tela e vai offline sem carga (esperado `TelaSemConexao`; com carga baixada antes, abre); (iii) deploy N→N+1 com o aparelho já offline (abre o N, nunca quebra); (iv) regressão com rede: deploy novo ainda faz o recarregamento único (sem laço) e depois `GARANTIR_OFFLINE` repõe o cache; outra rota sem rede mostra `TelaSemConexao`. 7) real: iPhone/iPad standalone na produção atravessando um deploy, modo avião.

## C. Ajustes
- Riscos novos: `sw.js` e `vite.config.js` afetam o app inteiro — regressão do SW em todas as telas (assets cache-first, navegação rede-primeiro, `/api` nunca interceptado); falha no precache segura a atualização do SW (atômico; o app segue na versão antiga e tenta no próximo ciclo); cada deploy apaga e refaz o cache (~1,5 MB), intencional.
- Estimativa: frontend ≈ 4,25 d, backend ≈ 2,0 d; **prazo corrido da 1ª etapa ≈ 5,5 dias úteis**.
- Em aparelho real, soma-se: iPhone/iPad standalone atravessando um deploy (item 7).
- Posse de arquivos: frente C = `sw.js`, `main.jsx`, `lazyComRetry.js`, `vite.config.js`, `garantirOffline.js`; frente A = hook, páginas, componentes, `App.jsx`, `AuthContext.jsx` etc. (A só CHAMA `garantirOffline`, não o escreve); backend separado.
