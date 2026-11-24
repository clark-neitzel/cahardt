# PLANO — Usuário externo (contador): só enxerga e só alcança a Contabilidade

Autor: arquiteto · 24/11/2026 · Porte: **média-grande** (toca permissões e segurança de API; equipe completa).
Pedido do dono: "o contador tem acesso à aba de contabilidade, não tem dashboard, não pega veículo, não tem aba de tarefas, não tem para apertar o que não tem acesso ok".
Decisão do dono: interruptor explícito **"Usuário externo (contador)"** no painel de permissões, chave `Usuario_Externo`.

Tudo abaixo foi conferido no código (caminho:linha de `~/Projetos/CA-Hardt`). O que é suposição está marcado **[SUPOSIÇÃO]**.

---

## 0. Regra única (a definição que front e back repetem IGUAL)

```
externo = !permissoes.admin && permissoes.Usuario_Externo === true
```

- Ausente / false / não-booleano = usuário comum = comportamento de hoje (critério nº 1).
- `admin` ignora o interruptor.
- Escolha de escopo (importante): **externo = SÓ Contabilidade**. Mesmo que o dono ligue outras permissões (ex.: Contas a Pagar) no mesmo cadastro, elas ficam sem efeito para o externo, no menu E na API. Motivo: front e back precisam concordar exatamente; uma lista fixa de 1 área é a única forma simples de garantir isso. Ampliar no futuro = acrescentar um item nas DUAS listas (ver §3 e §4).
- Há uma coluna antiga `vendedores.acesso_externo` (schema.prisma:905, selo "EXTERNO" em `ListaVendedores.jsx`, checkbox em `NovoUsuarioModal.jsx`) que só esconde a pessoa dos seletores de vendedor/motorista. **Não é a mesma coisa e NÃO deve ser reaproveitada**: o `/auth/me` e o `authMiddleware` não a leem, e há usuários externos/parceiros existentes que mudariam de comportamento (viola o critério nº 1). Os dois conceitos ficam separados; o texto do painel explica a diferença. **Depende do dono**: se quiser fundir os dois no futuro, é outra tarefa.

---

## 1. Inventário — o que um logado sem nenhuma permissão (além da Contabilidade) vê/recebe hoje

### 1.1 Menu (App.jsx, componente `Layout`)

| # | Item | Onde | Hoje | Para o externo |
|---|---|---|---|---|
| 1 | "Tarefas" fixo | desktop `App.jsx:578`; mobile `:707` | todo logado | **some** |
| 2 | "Como Fazer" | desktop `:579` e mobile `:716` (`usePodeVerComoFazer`) | quem o servidor liberar | **some** (e o hook nem roda: passar `null` como chave) |
| 3 | "Dashboard" fixo | desktop `:580`; mobile `:723` | todo logado | **some** |
| 4 | Favoritos | desktop `:581`; mobile `:728` | por usuário | fica (só mostra telas permitidas; `/auth/menu-favoritos` entra na lista de permitidos) |
| 5 | Grupos do menu | `desktopSections` `:439-518` + filtro por perfil `:330-343`/`:541` | externo cai em "vendedor" → grupo Administração (1 item) é escondido (`GRUPOS_POR_PERFIL.vendedor` não tem Administração e `items.length >= 2` falha) | **pular o filtro por perfil**; o menu mostra só o grupo Administração → Contabilidade |
| 6 | "Ver menu completo" / dica "Faltou alguma tela?" | desktop `:596-618`; mobile `:772-790` | `!perfil.gestor` | **some** (não há o que revelar) |
| 7 | Logo "Hardt App" (link para `/`) | `:559`, `:631` | todo logado | fica; `/` redireciona para a tela dele (§2) |
| 8 | Botão atualizar (refresh), nome, Sair | `:623-645`, `:640` | todo logado | **ficam** (úteis; sem rota de API protegida) |

### 1.2 Botões de topo / rodapé

| # | Item | Onde | Para o externo |
|---|---|---|---|
| 9 | `DiarioPegarVeiculo` | desktop `:623`; mobile `:673` | **não montar** |
| 10 | `DiarioCheckout` | desktop `:624`; mobile `:674` | **não montar** |
| 11 | `VisitorBar` (barra de visitantes; chama `/visitors/stats` ANTES de checar permissão, `VisitorBar.jsx:43`) | `:652` | **não montar** (e `visitorBar` no padding `:657` passa a ser `visitorBar && !externo`) |

### 1.3 Componentes globais montados no layout (todos fazem chamada de API a cada N min)

| # | Componente | Linha App.jsx | API que chama | Para o externo |
|---|---|---|---|---|
| 12 | `PendenciaRotaGateway` (bloqueia o app inteiro) | `:810` | `GET /atendimentos/pendencias-rota` | **não montar** (hoje só pula com admin/`Isento_Ponto`, `PendenciaRotaGateway.jsx:31`) |
| 13 | `DiarioGateway` ("Como você trabalhará hoje?") | `:813` | `/diarios/iniciar` etc. | **não montar** |
| 14 | `AlertaFaturamento` | `:816` | `GET /pedidos/pendente-faturamento` | **não montar** |
| 15 | `AlertaPedidoConvertido` | `:819` | `GET /pedidos/avisos-convertidos` | **não montar** |
| 16 | `AlertaPagamentoAposQuitacao` | `:823` | `GET /pedidos/avisos-pagamento-apos-quitacao` (já se esconde se não admin, mas chama a API) | **não montar** |
| 17 | `AlertaPedidosNaoEnviados` | `:826` | `GET /pedidos/meus-nao-enviados` | **não montar** |
| 18 | `AlertaComissao` (`ComissaoVendedor.jsx`) | `:829` | `GET /comissoes/minha` | **não montar** |
| 19 | `AlertaTarefas` (pop-up + som) | `:832` | `GET /tarefas/pendentes` | **não montar** |
| 20 | `AlertaAutorizacaoDevolucao` | `:835` | `/caixa/autorizacoes-devolucao/pendentes` (só com permissão) | **não montar** |
| 21 | `AlertaPedidosSite` ("pedidos novos esperando") | `:838` | `/congelados/pedidos-novos` (só kitFesta/admin) | **não montar** |
| 22 | `AlertaDevolucaoRefItem` | `:845` | `/config-notas/devolucao-ref-item` (só o dono) | **não montar** |
| 23 | `Clippy` | `:847` | `/api/copiloto` + `/novidades.json` | **não montar** (recomendação aceita: anuncia novidades internas e ajuda a navegar por telas que ele não tem) |

### 1.4 Contextos / hooks que chamam a API no abrir do app

| # | Item | Arquivo | Para o externo |
|---|---|---|---|
| 24 | `DiarioProvider` → `GET /diarios/status` ao abrir e a cada 30 s/5 min (`DiarioContext.jsx:21-64`) — fica FORA do `Layout`, então desmontar no Layout não basta | `contexts/DiarioContext.jsx` | **não buscar** (setar `loading:false` e sair) |
| 25 | `buscarTokenMidia` → `GET /auth/midia-token` (`AuthContext.jsx:29`, chamado `:97`, `:195`, `:215`) | `contexts/AuthContext.jsx` | **não buscar** (o token de mídia abre `/uploads/funcionarios` e `/uploads/curriculos`; o contador não precisa) |
| 26 | `useMenuFavoritos` → `GET /auth/menu-favoritos` | `hooks/useMenuFavoritos.js` | fica (permitido) |
| 27 | `useVersionCheck` → `GET /api/version` (público, sem auth) | `hooks/useVersionCheck.js` | fica |
| 28 | `usePerfil` → só chama `/metas/dashboard` se for entregador | `hooks/usePerfil.js` | nada a fazer (externo nunca é entregador na prática; **não mexer em `usePerfil`**) |

### 1.5 Rotas `<PrivateRoute>` sem `tab` (abertas a qualquer logado) — `App.jsx`

`/` (RootRoute → `HomeRedirect` → `DashboardHome`, `:176-183`), `/dashboard-vendedor` (`:890`), `/tabela-nova` (`:893`), `/tarefas` (`:894`), `/como-fazer/*` (`:896`), `/delivery/config` (`:917`), `/veiculos/pendencias` (`:956`), todas as `/pcp/*` (`:972-993`, 22 rotas), `/estoque`, `/estoque/historico`, `/estoque/inventario`, `/estoque/posicao` (`:996-999`), `/admin/mensagens` (`:1013`).
Mais os redirecionamentos `/kit-festa-admin`, `/site-admin`, `/financeiro/contas-receber` (`:923,924,948`) que levam a rotas privadas.
Rotas públicas (`/login`, `/candidatura`, `/ponto/:token`, `/setor/*`, `/kit-festa`, `/inicio`, `/congelados`, `/lista/:token`) não mudam.

→ **Para o externo, o `PrivateRoute` passa a permitir só `/admin/contabilidade`**; qualquer outro caminho redireciona (§2).

### 1.6 Chamadas de API do fluxo normal do externo (TUDO que pode acontecer — é a lista de permitidos do servidor)

Verificado em `frontend/src/pages/Admin/Contabilidade/*` (grep de `api.`, `fetch`, `window.open`: só estas) e em `backend/routes/contabilidadeRoutes.js` (8 rotas GET, linhas 155, 404, 765, 782, 921, 943, 958, 997):

| Chamada | Quem faz |
|---|---|
| `GET /api/contabilidade/relatorio-receber` | `ContabilidadePage.jsx:188` (visões títulos/recebimentos) |
| `GET /api/contabilidade/relatorio-pagar` | `AbaPagar.jsx:65` |
| `GET /api/contabilidade/extrato-conciliado` | `AbaExtratos.jsx:37` |
| `GET /api/contabilidade/extrato-ofx` (blob) | `AbaExtratos.jsx:55` via `baixarArquivoApi` |
| `GET /api/contabilidade/notas-entrada-relatorio` | `AbaNotas.jsx:39` |
| `GET /api/contabilidade/notas-entrada/:id/xml` (blob) | `AbaNotas.jsx:57` |
| `GET /api/contabilidade/notas-entrada-zip` (blob) | `AbaNotas.jsx:54` |
| `GET /api/contabilidade/pacote-mes` (blob) | `AbaPacote.jsx:34` |
| `GET /api/auth/me` | `AuthContext` (abrir/login) — **403 aqui desloga** (`AuthContext.jsx:83`), então TEM que ser permitido |
| `GET /api/auth/menu-favoritos` (+ `PUT` ao clicar estrela) | `useMenuFavoritos` |
| `GET /api/version` | `useVersionCheck` (rota pública, fora do `authMiddleware`) |

`FiltroPeriodo`, `useFiltrosSalvos`, `usePeriodoSalvo` usam só localStorage (nenhuma API). A Contabilidade não abre anexo/PDF (a coluna "Anexo PDF" é só um 📎 informativo).

---

## 2. Tela inicial e digitar rota na barra de endereço

Fonte única no front: `frontend/src/utils/usuarioExterno.js` (NOVO):

```js
export const ROTAS_EXTERNO = ['/admin/contabilidade'];                  // espelha ALLOW do backend
export const ehUsuarioExterno = (p) => !!p && !p.admin && p.Usuario_Externo === true;
export const rotaPermitidaExterno = (pathname) => ROTAS_EXTERNO.some(r => pathname === r || pathname.startsWith(r + '/'));
export const homeDoExterno = (p) => (p?.Pode_Acessar_Contabilidade === true ? '/admin/contabilidade' : null);
```

`AuthContext` expõe `ehExterno = ehUsuarioExterno(user?.permissoes)` no `value` (um lugar só; App, DiarioContext e o próprio AuthContext leem dali).

Comportamento (sem laço):

| Situação do externo | Resultado |
|---|---|
| Entra (login) → `navigate('/')` (`pages/Login/Login.jsx:16,33`) → `RootRoute` → `HomeRedirect` | `HomeRedirect`: se `ehExterno`: `homeDoExterno` existe → `<Navigate to="/admin/contabilidade" replace/>`; não existe → renderiza `SemTelaExterno` (cartão "Sua conta ainda não tem nenhuma tela liberada. Fale com o administrador." + botão Sair). **Nunca** `DashboardHome`. A `telaInicial` do painel é ignorada para o externo (só existe uma tela permitida; `telaInicial` apontando para outra rota seria redirecionada de qualquer forma). |
| Digita `/tarefas`, `/como-fazer`, `/pedidos`, `/pcp/...`, `/estoque`… | `PrivateRoute`: `ehExterno && !rotaPermitidaExterno(pathname)` → `<Navigate to=home replace/>` (home sempre é permitida → sem laço); se não tem home → `SemTelaExterno`. Sem "Acesso negado" e sem tela em branco. |
| `/admin/contabilidade` com Contabilidade desligada | `SemTelaExterno` (não o "Acesso Negado a esta tela" de `PrivateRoute:171`) |
| Rotas públicas (`/login`, `/inicio`...) | inalteradas |

Ordem dentro de `PrivateRoute` (App.jsx:160): `loading` → `erroConexao` → `usandoSnapshot` → `!signed` → **(novo) bloco `ehExterno`** → checagem `tab` atual. Usuário comum nunca entra no bloco novo.

---

## 3. Servidor — comparação e escolha

### Onde as permissões ficam no backend (verificado)
`backend/middlewares/authMiddleware.js:21-37`: o `authMiddleware` **lê `vendedor.permissoes` do BANCO a cada requisição** e sobrescreve as do token (`req.user = {...decoded, permissoes: permissoesAtuais}`). Logo o interruptor vale **na hora, no servidor**, sem novo login. No front, as permissões vêm de `/auth/me` na abertura/login: quem já estiver com o app aberto só enxerga a mudança de menu ao recarregar (e, nesse intervalo, os alertas dele passam a levar 403 — silencioso, os pollers têm `catch`). Aceitável; documentar no manual.

### Quem passa pelo `authMiddleware` (verificado)
Todas as rotas autenticadas importam o mesmo `middlewares/authMiddleware` (montado em `index.js` ou dentro da rota como `verificarAuth`). Exceções que NÃO passam por ele: rotas públicas (kit-festa, congelados, catálogo, ponto, currículos), `ia-consulta`, `analytics`, `admin-exec` (chaves próprias), `impressao-agente`, e `/api/como-fazer` — que é montada "sem authMiddleware", **mas** o `comoFazerAuth` delega o login do app ao mesmo `authMiddleware` (`services/comoFazerAuthService.js:11,152`; token de tablet usa outro segredo e não é de usuário). Ou seja: **o `authMiddleware` é o único funil do usuário logado.**

### Opções

| | (a) lista de permitidos em middleware global (`index.js`) | (b) bloqueio pontual nas rotas abertas | **(c) RECOMENDADA — mesma lista de permitidos, dentro do `authMiddleware`** |
|---|---|---|---|
| Como | `app.use('/api', mw)` que decodifica o JWT e consulta o banco | `if (externo) return 403` em cada rota/controller sem checagem de permissão | 5 linhas em `authMiddleware.js`, logo depois de montar `permissoesAtuais` |
| Consulta extra ao banco | **+1 por requisição de TODO usuário** (o mw global teria de decodificar e buscar o vendedor antes do `authMiddleware`) | 0 | **0** (já tem as permissões em mãos) |
| Tocar `index.js` | sim (conflita com a outra sessão) | não | **não** |
| Esquecer rota nova | seguro (nega por padrão) | **inseguro**: rota nova nasce aberta; há dezenas de rotas abertas (pcp, estoque, tarefas, diários, pedidos, clientes...) | seguro (nega por padrão) |
| Risco de quebrar a Contabilidade | baixo (lista = §1.6) | baixo | **baixo (mesma lista)** |

Por que não (b): o `authMiddleware` é usado em ~34 arquivos de rota mais montagens do `index.js`; cada rota nova ou controller sem checagem de permissão seria um buraco. Por que não (a): mesma proteção que (c), porém com custo de banco extra e mexendo em `index.js`, que tem mudança alheia não commitada.

### Desenho (c) — `backend/middlewares/authMiddleware.js` (único arquivo de produção do servidor)

Logo após `permissoesAtuais` e antes de `req.user = ...`:

```js
// Usuário externo (contador): só a Contabilidade e o mínimo da sessão. Nega por padrão.
if (!permissoesAtuais.admin && permissoesAtuais.Usuario_Externo === true) {
    const caminho = String(req.originalUrl || '').split('?')[0].toLowerCase();
    const ok = !caminho.includes('..') &&
        /^\/api\/(auth\/(me|menu-favoritos)|contabilidade)(\/|$)/.test(caminho);
    if (!ok) return res.status(403).json({ error: 'Usuário externo: acesso restrito à Contabilidade.', codigo: 'USUARIO_EXTERNO' });
}
```

Notas para o dev:
- Usar `req.originalUrl` (vale tanto quando o middleware é aplicado em `app.use('/api/x', authMiddleware, router)` quanto dentro do router). **Minúsculas**: o roteamento do Express é case-insensitive por padrão, então a comparação também precisa ser (a lista é só de "permitidos", então maiúscula só passa se for de fato uma rota permitida).
- A lista de permitidos deve morar numa constante exportada com comentário "espelha `ROTAS_EXTERNO` do frontend (`utils/usuarioExterno.js`)". `/api/auth/midia-token` fica FORA da lista de propósito.
- Resposta 403 (não 401): o interceptor do axios só desloga em 401 (`services/api.js:22`) e o `AuthContext` só apaga o token em 401/403 do `/auth/me` — que é permitido. Não reintroduzir logout por erro de rede.
- Não mexer em `index.js`. **Se algum dia for preciso**, o ponto seria logo abaixo do `app.use('/api', no-store)` (index.js:156-161) e o `git diff` atual do arquivo tem só 2 linhas alheias (comentário + `app.use('/uploads', require('./middlewares/uploadsProtegidos'))`, linhas 147-148); a inserção não colide, mas o commit tem de ser feito com `git add -p` ou depois da outra sessão commitar.

### Furo conexo (recomendado, fase 2 — depende da outra sessão)
`middlewares/uploadsProtegidos.js` (commit `da3d85c4`, "passo 1 de 2"; o `app.use` dele em `index.js` é justamente a mudança não commitada da outra sessão) aceita qualquer login válido para `/uploads/funcionarios/**` e `/uploads/curriculos/**` e só consulta `ativo`. Um externo com Bearer poderia abrir documento de funcionário se soubesse o caminho. Correção: em `usuarioAtivo` selecionar também `permissoes` e devolver `false` para externo. **Fazer só depois que a outra sessão commitar o passo 2**, para não gerar conflito; não bloqueia esta entrega (o front não gera esses links para o externo). Pedir ao dono que ciente.

---

## 4. Painel de permissões — `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx`

Estado atual (conferido): `DEFAULT_PERMISSIONS` (linha 125 `Isento_Ponto`), `BOOL_INDEX` (linha 256; `Isento_Ponto` na 259), JSX da seção `secaoAcesso` (linha 742; Isento de Ponto em 779-794). O defeito antigo foi existir só o índice — **precisa dos três**:

1. `DEFAULT_PERMISSIONS`: `Usuario_Externo: false,` (junto de `Isento_Ponto`, linha ~125).
2. `BOOL_INDEX` (sec `'acesso'`, depois da linha 259):
   `{ sec: 'acesso', path: 'Usuario_Externo', nome: 'Usuário externo (contador)', desc: 'Pessoa de fora da empresa: só vê e só acessa a Contabilidade. Sem dashboard, tarefas, veículo, pop-ups ou assistente. As demais permissões ficam sem efeito.', kw: 'externo contador contabilidade escritorio terceiro parceiro de fora restrito', noBulk: true }`
   — `noBulk: true` garante que perfis rápidos (`aplicarPerfil`, linha ~574) e "Marcar tudo/Limpar" (`loteSecao`, linha ~594) nunca liguem nem desliguem. Entrada no índice também é o que faz o **histórico** (`diffHistorico`, linha 661) mostrar "ligou/desligou Usuário externo" e a busca achar o interruptor.
3. JSX em `secaoAcesso`, logo depois do bloco "Isento de Ponto" (linha ~794), no mesmo padrão e dentro de `{!permissoes.admin && (...)}`: faixa cor âmbar/roxa, `role="switch"`, `onClick={() => toggleBool('Usuario_Externo')}`, `aria-checked={!!permissoes.Usuario_Externo}`.
   Texto simples: título "Usuário externo (contador)"; subtítulo "A pessoa só vê a Contabilidade (somente consulta). Não aparece dashboard, tarefas, veículo, avisos nem o assistente."
   **Aviso dinâmico (recomendado — evita criar externo sem tela):** quando ligado, uma linha embaixo: se `permissoes.Pode_Acessar_Contabilidade` → "✓ Contabilidade liberada." senão (âmbar) "⚠ A Contabilidade está desligada — esta pessoa não terá nenhuma tela. Ligue 'Contabilidade (só consulta)' na seção Administração." Mais: "Outras permissões ligadas neste cadastro não terão efeito enquanto esta chave estiver ligada." A chave `acessoExterno` (selo EXTERNO da lista) é outra coisa — só esconde dos seletores.
- O `ToggleIndex` (linha 703) já renderiza a entrada na busca/lista da seção sem código extra.
- Compatibilidade sagrada: nenhuma chave existente muda; o `handleSave` (linha 608) continua enviando o objeto `permissoes` inteiro (`vendedorService.atualizar`); o backend grava o objeto como veio (`vendedorController.js:178`) e o histórico guarda antes/depois (`:241-251`) — **nenhuma mudança no backend de usuários**. Efeito colateral inofensivo: ao salvar qualquer usuário o objeto passa a conter `Usuario_Externo: false` (mesmo padrão de `Isento_Ponto: false`); o servidor só reconhece `=== true`.
- "Copiar de outro usuário" copia também o interruptor (copiar de um externo gera outro externo; esperado).

---

## 5. Clippy e novidades
- **Clippy: esconder para o externo** (recomendação aceita). Mudança: `App.jsx:847` ganha `&& !externo`; o servidor já nega `/api/copiloto` (não está na lista). O interruptor existente `Pode_Ver_Clippy` não precisa mudar.
- **Página de novidade para o grupo: NÃO cabe** (confirmado). Só o dono usa o interruptor; a mudança não é visível para a equipe. Adicionar entrada em `frontend/public/novidades.json` faria o Clippy balançar para todos por algo que não os afeta — e o arquivo está com mudança alheia não commitada. Dispensar a regra de anúncio e **avisar o dono disso**.

---

## 6. Manuais / Clippy (`backend/manuais/abas/`)
- `vendedores.md`: novo item da seção "Acesso e Conta" (logo após o 9 do Clippy, linha ~71): "Usuário externo (contador)" — o que faz, que ignora outras permissões, que não entra em perfis/Marcar tudo, que admin é ignorado, e a diferença para o selo EXTERNO (`acessoExterno`). Citar que no servidor vale na hora e no app da pessoa ao recarregar.
- `contabilidade.md`: nova seção "Como o contador entra": cadastro com Contabilidade + Usuário externo → cai direto na Contabilidade, menu só com ela, sem dashboard/tarefas/veículo/avisos; se não tiver a permissão, aparece "sem tela liberada".
- `menu-favoritos.md`: sem mudança. `README.md` (índice): sem linha nova (nenhuma aba nova).
- **`copilotoService.ABAS` (services/copilotoService.js:91-94): não muda** — nenhuma rota ou permissão de tela nova/alterada (Contabilidade continua `/admin/contabilidade` + `Pode_Acessar_Contabilidade`).
- Arquivos de manual `contas-a-pagar.md`, `curriculos.md`, `rh-funcionarios.md` estão modificados pela OUTRA sessão: não tocar. `vendedores.md` e `contabilidade.md` estão limpos.

---

## 7. Arquivos a alterar, por dev, em ordem

### dev-backend (1º — o front depende só do contrato abaixo)
1. `backend/middlewares/authMiddleware.js` — bloco do §3 (único arquivo de produção).
2. `backend/scripts/seed-cenarios-relatorio-contador.js` — acrescentar usuários de QA (§8) no array `USUARIOS` (linha 58). `limpar()` já apaga por id (linha 82). Só roda em banco local.
3. `backend/manuais/abas/vendedores.md` e `contabilidade.md` (§6).
NÃO tocar: `backend/index.js`, `uploadsProtegidos.js` (fase 2), `iaConsultaRoutes`/`/api/ia-consulta/v1` (intocados), `schema.prisma` (nenhum campo novo: a chave vive no JSON `permissoes`).

**Contrato entre os devs:** (i) a chave é `permissoes.Usuario_Externo` (booleano) e a regra é `!admin && === true`; (ii) o servidor permite para o externo apenas `GET/PUT /api/auth/menu-favoritos`, `GET /api/auth/me`, `/api/contabilidade/*` (+ `/api/version`, que já é público) e responde `403 {codigo:'USUARIO_EXTERNO'}` ao resto; (iii) `ROTAS_EXTERNO` no front = `['/admin/contabilidade']`.

### dev-frontend (2º)
1. `frontend/src/utils/usuarioExterno.js` — NOVO (§2).
2. `frontend/src/contexts/AuthContext.jsx` — expor `ehExterno` no `value`; `buscarTokenMidia` não busca para externo (a decisão precisa usar o `userData` recebido, pois `user` do estado ainda não foi atualizado quando é chamado em `:97`/`:195`: passar o usuário como argumento ou checar `ehUsuarioExterno(userData.permissoes)` antes de chamar).
3. `frontend/src/contexts/DiarioContext.jsx` — `carregarStatus` e o efeito de revisão: se `ehExterno` → `setDiarioStatus(prev => ({...prev, loading:false}))` e não chamar `/diarios/status`.
4. `frontend/src/App.jsx`:
   - `PrivateRoute` (`:160`): bloco do externo (§2); mensagem `SemTelaExterno`.
   - `HomeRedirect` (`:176`): externo → home ou `SemTelaExterno`.
   - `Layout`: `const { ehExterno: externo } = useAuth()`; `usePodeVerComoFazer(externo ? null : user?.id)` (`:400`); `secoesFiltradasPorPerfil` e `desktopSectionsVisiveis` ignoram o filtro por perfil quando `externo`; esconder itens 1-3, 6, 9-11 e embrulhar os itens 12-23 em `{!externo && (...)}`; `visitorBar && !externo` (`:652` e `:657`).
   - Cuidado com as regras de hooks: todas as chamadas de hook ficam ACIMA do `return` antecipado (`:409`); só o JSX é condicional.
5. `frontend/src/components/SemTelaExterno.jsx` — NOVO (card no design system: `bg-white rounded-xl border`, botão Sair em pílula; funciona em 375px).
6. `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` — §4.
7. `cd frontend && npm run build` antes de entregar.
NÃO tocar: `usePerfil.js`, `DashboardHome.jsx`, os componentes `Alerta*`/gateways (basta não montá-los — menos arquivos, menos risco para os usuários comuns), `services/api.js`, `sw.js`.

---

## 8. Dados de QA
O seed atual (`seed-cenarios-relatorio-contador.js:58-59`) cria `qa.contador` (só Contabilidade) e `qa.semcontabilidade` (só Contas a Pagar), senha `qa123456`. **Não basta** ligar o interruptor no `qa.contador`: ele é o grupo de controle ("contador comum, sem a chave" — prova que quem não tem a chave NÃO mudou). Acrescentar ao seed (ids com o mesmo `CARIMBO`):
- `qa.externo` — `{ Pode_Acessar_Contabilidade: true, Usuario_Externo: true }`
- `qa.externo.semtela` — `{ Usuario_Externo: true }` (prova a tela "sem tela liberada")
- `qa.vendedor` — perfil vendedor comum (`catalogo.view, pedidos.view/edit, clientes.view, rota.view`) para comparar menu/dashboard/pop-ups antes×depois
- `qa.motorista` — `{ Pode_Executar_Entregas, Pode_Acessar_Caixa, Pode_Fazer_Devolucao }`
- admin: usar o admin que já existe no `hardt_local` (e um teste extra: admin com `Usuario_Externo:true` deve continuar admin).
Além disso, um passe pelo PAINEL: abrir `qa.contador`, ligar o interruptor, salvar, conferir o histórico ("ligou Usuário externo"), recarregar, e desligar de novo. O QA compara contra `main` limpo (rodar o vendedor e o motorista ANTES de aplicar a mudança — captura de menu/dashboard — e DEPOIS).

---

## 9. Riscos

1. **Quebrar a Contabilidade bloqueando uma chamada** — mitigado pela lista exata do §1.6 (grep real). Se o dev acrescentar qualquer `api.get` novo na área da Contabilidade, tem de entrar na lista do servidor. Teste: percorrer as 5 abas + Pacote + os 3 downloads (CSV/OFX/XML/ZIP) com o `qa.externo` e conferir zero 403 no console de rede.
2. **Usuário comum mudar de comportamento** — o único código que vale para todos é o bloco do `authMiddleware` (condicional a `Usuario_Externo === true`) e as condicionais `!externo` no front, todas com `externo=false` para comum. Revisor deve ler o diff linha a linha com essa pergunta. `usePerfil` e `DashboardHome` intocados.
3. **Laço de redirecionamento** — `PrivateRoute` só redireciona para uma rota que ele mesmo permite; `HomeRedirect` nunca redireciona para `/`; sem home → componente estático, não redirect.
4. **`/auth/me` com 403 desloga** — por isso está na lista. Qualquer ajuste futuro na lista que o remova trava o externo fora do app.
5. **Divergência front × back** — a lista vive em dois lugares por definição (JS do front e do back). Comentário cruzado nos dois + critério de aceite nº 9. `Usuario_Externo` é booleano: usar `=== true`, nunca `!!perms.x` (regra "permissões são OBJETO, não booleano" — aqui não vale para um flag, mas mantém o espelho exato).
6. **Sessão aberta quando o dono liga a chave** — servidor nega na hora; o app aberto só troca de menu ao recarregar; os pollers falham em silêncio. Documentar.
7. **`gestor` do `usePerfil`** inclui `login` contendo "clark" e `Pode_Ver_Dashboard_Admin` — o externo é decidido ANTES, só pelas permissões; não depender de `usePerfil`.
8. **Outra sessão ativa**: `index.js`, `ContasPagarPage.jsx`, `novidades.json`, manuais `contas-a-pagar/curriculos/rh-funcionarios`, `CLAUDE.md`, `fornecedorPessoaService.js` modificados e não commitados. Este plano não toca em nenhum. Commit com `git diff --cached --stat` conferido e `git add` explícito (memória: sessões paralelas / índice compartilhado).
9. **Upload/Prisma/NF-e/WhatsApp/IA-consulta**: nada disso é tocado (sem upload novo, sem schema, sem `$transaction`, sem mensagem).
10. **Fase 2 (uploads protegidos)** — ver §3; depende da outra sessão.

## 10. O que NÃO fazer
- Não criar campo novo no `schema.prisma` nem reaproveitar `acesso_externo`.
- Não usar bloqueio pontual rota a rota (opção b).
- Não colocar o gate no `index.js` (conflito + consulta extra por request).
- Não fazer o front "esconder" sem o servidor negar, nem o servidor negar sem o front esconder: o critério é as duas pontas.
- Não deslogar por 403 que não seja do `/auth/me`; não mexer no interceptor.
- Não montar e depois esconder por CSS: os componentes não devem NEM montar (senão continuam chamando a API).
- Não alterar `DashboardHome`, `usePerfil`, `Alerta*`, gateways, `sw.js`.
- Não colocar `Usuario_Externo` nos perfis rápidos nem em "Marcar tudo" (`noBulk: true`).
- Não criar página de novidade nem entrada em `novidades.json`.

## 11. Critérios de aceite (verificáveis)

1. **Comuns idênticos**: `qa.vendedor`, `qa.motorista`, `qa.contador` (sem a chave) e o admin têm menu (desktop e mobile), tela inicial, pop-ups e chamadas de API IGUAIS à captura feita antes da mudança. `git diff` não toca `usePerfil.js`/`DashboardHome.jsx`.
2. **Painel**: o interruptor aparece em Acesso e Conta (some quando `admin` está ligado), busca por "contador" o encontra, perfis rápidos e "Marcar tudo/Limpar" NÃO o alteram, o histórico mostra "Usuário externo" ao ligar/desligar, o aviso muda conforme `Pode_Acessar_Contabilidade`, salvar mantém o payload no mesmo formato (objeto `permissoes` inteiro; todas as chaves antigas preservadas).
3. **`qa.externo` entrando (desktop e 375px)**: cai em `/admin/contabilidade` sem passar por dashboard, sem a cortina "Como você trabalhará hoje?", sem "Pegar veículo", sem pop-up algum; menu mostra só Administração → Contabilidade (já visível, sem "Ver menu completo"); sem Tarefas, Dashboard, Como Fazer, Clippy, barra de visitantes; atualizar e Sair funcionam.
4. **Nenhum item clicável do externo leva a "Acesso negado" ou erro.**
5. **Rede do externo**: durante login + 5 abas + Pacote do Mês + downloads CSV/OFX/XML/ZIP, o log de rede só tem `/auth/me`, `/auth/menu-favoritos`, `/version` e `/contabilidade/*`, **todos 200; zero 401/403**; nenhuma chamada a `/diarios`, `/tarefas`, `/pedidos`, `/metas`, `/dashboards`, `/atendimentos`, `/comissoes`, `/visitors`, `/auth/midia-token`, `/como-fazer`.
6. **Rota digitada**: `/`, `/tarefas`, `/como-fazer`, `/pcp/itens`, `/estoque`, `/dashboard-vendedor`, `/pedidos` → redirecionam para `/admin/contabilidade` (sem laço, sem piscar tela de outro módulo); voltar do navegador não prende.
7. **Servidor**: com o token do `qa.externo`, `curl` em `/api/tarefas`, `/api/pedidos`, `/api/diarios/status`, `/api/dashboards/...`, `/api/clientes`, `/api/como-fazer/me`, `/api/copiloto`, `/api/pcp/itens`, `/api/estoque`, `/api/auth/midia-token`, `/api/PEDIDOS` (maiúsculas) → **403 `USUARIO_EXTERNO`**; `/api/auth/me`, `/api/contabilidade/relatorio-receber?...` → 200; o mesmo token do `qa.contador` (sem a chave) continua 200 nas rotas que a permissão dele já liberava.
8. **`qa.externo.semtela`**: login → cartão "sem tela liberada" + Sair; nenhum pop-up; nenhuma chamada além de `/auth/me`.
9. **Espelho**: tabela de rotas permitidas do front (`ROTAS_EXTERNO`) e do back batem exatamente (revisor confere os dois arquivos lado a lado).
10. **Efeito imediato no servidor**: ligar a chave para um usuário já logado → próxima chamada a rota proibida dá 403 sem novo login; desligar → volta ao normal. Admin com a chave ligada continua admin (menu e API completos).
11. **Sessão**: derrubar o backend ou a rede com o externo logado → continua indo para `TelaSemConexao` e NÃO desloga (regra de AuthContext intacta).
12. **Build**: `cd frontend && npm run build` passa; responsividade em 375px conferida na tela do externo e no `SemTelaExterno`.
13. **Manuais** `vendedores.md` e `contabilidade.md` atualizados; `ABAS` inalterada; sem novidade/Clippy balançando.

## 12. Porte
**Média-grande**: pouco código (1 funil no servidor, 1 util, ~4 arquivos de front, 1 componente novo), mas toca permissões e acesso a API — pela regra do projeto, equipe completa (dev-backend → dev-frontend → qa-testador + revisor-codigo em paralelo → gerente-entrega).

---

## DECISÕES DO GERENTE DE PROJETO (24/11/2026) — valem sobre o texto acima quando houver conflito

O dono confirmou o comportamento: "o contador tem acesso à aba de contabilidade, não tem dashboard, não pega veículo, não tem aba de tarefas, não tem para apertar o que não tem acesso".

- **G1** Chave `Usuario_Externo` separada da coluna `acesso_externo` (não fundir, não tocar no selo "EXTERNO").
- **G2** Externo = só Contabilidade, mesmo com outras permissões ligadas. O painel deve DIZER isso com clareza ao ligar o interruptor.
- **G3** Servidor: opção (c) — lista de permitidos dentro do `authMiddleware.js`. O dev-backend confere, com o app rodando, TODA chamada que o externo faz no fluxo normal (login, abrir, as 5 abas, Pacote do Mês, 3 downloads, trocar senha se existir, sair) e garante zero 401/403 nesse fluxo; se faltar rota na lista, acrescenta e registra numa seção "Desvios" no fim deste plano. `/auth/me` nunca pode dar 403.
- **G4** Clippy, barra de visitantes, alertas e pop-ups: não montar para o externo.
- **G5** Sem página de novidade nem entrada no `novidades.json` (só o dono usa o interruptor).
- **G6** Fase 2 (`uploadsProtegidos.js`) fica FORA desta entrega.
- **G7** Critério nº 1: quem NÃO tem o interruptor ligado (vendedor, motorista, escritório, admin) fica idêntico a antes — menu, tela inicial, pergunta diária, alertas e respostas da API.
- **G8** Há outra sessão ativa no repositório: não tocar em `backend/index.js`, `ContasPagarPage.jsx`, `novidades.json`, `CLAUDE.md` nem manuais alheios; não usar `git add/commit/stash/checkout/restore`. Quem commita é o gerente.

---

## Desvios (backend) — 24/11/2026

- Lista de permitidos exata do servidor (`CAMINHOS_EXTERNO` em `authMiddleware.js`): `/api/auth/me`, `/api/auth/menu-favoritos` (GET e PUT) e `/api/contabilidade/*`. **Nenhuma rota acrescentada** além do plano (`/api/version` é pública; não passa pelo middleware; não existe logout nem troca de senha autenticados em `/api/auth`).
- Endurecimento além do plano: o servidor também nega caminho com `..`, `//`, `\`, `%2e`, `%2f`, `%5c`, `%00`. Comparação em minúsculas, query/fragmento ignorados. Barra final em `/api/auth/me/` é aceita (continua sendo `/auth/me`).
- `/api/como-fazer/*`: o `comoFazerAuth` traduz o 403 do middleware para `403 { erro, codigo: 'NAO_AUTENTICADO' }` (campo `erro`, não `error`; código diferente). Segue barrado; o front do externo nem chama essa rota.
- O middleware agora também exporta `externoPodeAcessar` e `CAMINHOS_EXTERNO` (uso em teste).
