# PLANO — Redesign do site público (Home, Congelados, Kit Festa) e "Minha área"

Plano do arquiteto (24/11/2026), salvo pelo gerente de projeto. Especificação: `BRIEFING.txt`. Referência visual: `proposta-novo-site-hardt.html` (262 KB — ler por grep/trechos, não inteiro).

## 1. Entendimento
Redesign **só visual**: nenhuma mudança em rota de API, service, schema ou regra de negócio. Em Congelados entra uma entrada clara "Minha área / Já sou cliente".

## 2. Inventário que NÃO pode quebrar (roteiro do QA)
Arquivos em `frontend/src/pages/`. Os dois `api.js` (Site e KitFestaSite) **não são tocados**. Linhas aproximadas, do código antes do redesign.

### Congelados (`Site/CongeladosSite.jsx`)
- Sessão: token `@Congelados:token` (api.js:8-9). Boot (~62-79) restaura o perfil; token inválido cai no modo público. Sem sessão, espera config, catálogo e grupos.
- Visitante: vê o catálogo público (`catalogo()`, preço da tabela "Site"). Mínimo = `cfg.minimoSite`.
- `addItem` (~104) abre o modal de login se não houver sessão. Item `indisponivel` não entra no carrinho.
- Cliente logado: efeito (~82-87) carrega `meuCatalogo()` (preço do cliente) e `ultimoPedido`. Mínimo = `condicaoPadrao.valorMinimo` (~125).
- Carrinho em `cg_cart` (~97): guarda só quantidades; preço vem do catálogo ao vivo. Itens fora do catálogo são removidos (~98-105).
- "Você sempre pede" (`comprados`, ~339 e 350-356), filtro "Recomprar", "Repetir último pedido" (~342, `repetirUltimo` ~168, ignora indisponível).
- `below` (~130) e `carrinhoIndisp` (~132) bloqueiam o envio.
- Entrega × retirada: `setModo` (~161). Data sugerida pelo dia regular da rota: `sugeridaISO` (~136-143). `escolherData` (~148-160). `ehEncaixe` (~146).
- Telefone só é pedido se `!cliente?.temCadastroApp`.
- `finalizar` (~207) monta o payload (com `visitante` quando for o caso).
- Tela de confirmação com a mensagem de WhatsApp (~232-270), com aviso de encaixe.
- `Login.jsx`: `onLogin(cliente)` e `onVisitante` (~56-87). Etapas: documento, senha, criar senha, reset, visitante.
- `FalarVendedor.jsx` (usado ~283): `vendedoresSite()` e o marcador `[Vendedor Hardt: Nome]`.
- `useVisitorPing('congelados', ...)` (~96).
- FichaModal (~520+): cálculo ANVISA com `parseValor`, `parseVD`, `fmtNum`, coluna 100g derivada de `pesoPorcao`.
- Card (~651): carrossel de fotos (2,6s), badges "Indisponível" e "Você compra", stepper.
- FinalSite (~695): contato e mapa.

### Home (`Site/HomeSite.jsx`)
- `useVisitorPing('inicio')` (~64); config pública (~66).
- HomeSite também é servido na raiz `/` para deslogado (App.jsx:205) — testar `/` e `/inicio`.
- "Área Restrita" → `/login` (~98). Dois caminhos → `/kit-festa` (~117) e `/congelados` (~135). Contato e mapa ~226.

### Kit Festa (`KitFestaSite/KitFestaSite.jsx`)
- Token separado `@KitFesta:token`, login só por CPF. Boot ~43-49; avaliações ~49; `useVisitorPing('kit-festa')` ~54.
- `minCaixas` ~66 (padrão 4); checkout bloqueado abaixo do mínimo ~394-396 e ~438-439.
- Cupom, indicação e crédito ~349-360 e ~405-424; regra "use só um" ~424.
- Agenda ~460, slots ~543, CEP ~553. Checkout: payload ~778 (`usarCredito`), `criarPedido` ~783, link de WhatsApp ~796.
- `Referral` ~836; rodapé e contato ~913-930.

### ListaPersonalizada (`/lista/:token`)
Independente: usa só `lista.css` (escopo `.lpx`) com `@import` próprio das fontes antigas. **Não tocar.**

## 3. "Minha área"
**Hoje:** o visitante vê o cardápio com o preço da tabela "Site". O cliente cadastrado só descobre o login ao tocar no "+" de um produto (modal `Login`, CPF/CNPJ + senha). Logado, vê o preço dele (`meuCatalogo`), "Você sempre pede" e "Repetir último pedido". O header de Congelados mostra "Sair" mesmo deslogado e **não tem botão "Entrar"** — é o buraco que o pedido resolve.

**O que será feito (só frontend):**
- Botão destacado **"Minha área"** (subtexto "Já sou cliente") no header das 3 páginas e no banner de Congelados.
- Em Congelados o botão abre o `Login` existente. Logado, vira "Olá, Nome" + "Sair".
- Na Home e no Kit Festa o botão navega para `/congelados?entrar=1`; CongeladosSite lê o parâmetro (`useSearchParams`) e abre o modal — **único ponto de costura entre as etapas**.
- Na Home, "Olá, Nome" via `getToken()` + `publicApi.perfil()` (já existem).
- Congelados e Kit Festa têm sessões separadas. No Kit Festa o "Entrar" próprio (CPF) continua existindo; "Minha área" é sempre a de Congelados.

**Leituras mais amplas (não planejadas — decisão do dono):** (a) exigir login antes de ver o cardápio; (b) página com histórico de pedidos (`meusPedidos` já existe no backend, sem tela); (c) painel completo com boleto/PIX/notas (exige backend).

## 4. Etapas
### Etapa A — base + Home
- Cria `Site/SiteHeader.jsx`, `Site/SiteFooter.jsx`, `Site/siteBase.css`.
- Altera `HomeSite.jsx` e `frontend/index.html` (Montserrat + Plus Jakarta Sans por `<link>`, mesmo padrão já usado; **não remover** Oswald/Bitter/Kaushan).
- **Contrato `SiteHeader`:** `ativo` (`'inicio'|'congelados'|'kitfesta'`), `logo`, `cfg`, `sessao` (`{ nome, onEntrar, onSair }` — `onEntrar` ausente = navega para `/congelados?entrar=1`), `carrinho` (`{ qtd, onAbrir }`, opcional), `acoes` (nó React, ex.: Falar com vendedor), `areaRestrita` (bool, só Home).
- **Contrato `SiteFooter`:** `cfg`, `logo`.
- **Classes:** tudo sob escopo `.hd`, prefixo `.hd-` (`.hd-btn`, `.hd-btn-outline`, `.hd-btn-gold`, `.hd-card`, `.hd-input`, `.hd-chip`...). Tokens `--hd-*` com os valores da seção 3 do briefing.

### Etapa B — Congelados (depois de A)
- Altera `CongeladosSite.jsx`, `site.css`, `Login.jsx`, `FalarVendedor.jsx` (os dois últimos só visual). Cria `Site/imprimirFicha.js`.
- Banner + "Minha área"; filtros em linha única + busca + preparo + descrição do grupo; card novo; FichaModal em `<dialog>`; drawer claro; confirmação; `?entrar=1`.

### Etapa C — Kit Festa (depois de A, em paralelo com B)
- Altera `KitFestaSite.jsx`, `kitfesta.css`, `KitFestaSite/Login.jsx` (só visual).
- Header unificado, hero, "Como funciona", barra sticky de progresso do mínimo (reaproveita `boxes`/`minCaixas`), cards, drawer, checkout.

### Etapa D — fechamento
QA + revisor → gerente-entrega. Manuais `backend/manuais/abas/site-congelados.md` e `kit-festa.md`; `novidade-<slug>.html` com mockups + `novidades.json`; texto do grupo.

## 5. Riscos
1. **Impressão da ficha.** `<dialog>` com `showModal()` fica em top-layer e o `body > *:not(#area-impressao){display:none}` não o esconde. Correto: no clique em Imprimir, `dialog.close()` e, **no mesmo clique (síncrono)**, chamar o padrão `imprimirConteudo` do CLAUDE.md com o HTML da ficha montado em `#area-impressao` (A4, tabela ANVISA). Não clonar o DOM do dialog. Referência: `PCP/ReceitaDetalhe.jsx`. Nunca `window.open`/iframe.
2. **CSS vazando / camada "TEMA STARBUCKS".** `site.css` e `kitfesta.css` entram no bundle global. CSS novo 100% sob `.hd`, `.cg`, `.kf` — nenhum seletor solto (`button`, `input`, `body`). A camada global do `index.css` (azul→verde, `button.rounded`→pílula) pode atingir o site. QA compara o app interno antes/depois.
3. **Dark Mode nos inputs.** Hoje `.cg` (site.css:12) e `.kf` (kitfesta.css:10) usam `color-scheme:dark` → trocar para `light`; fundo `#fff` e texto `#141d17` explícitos em todo input/textarea/select, inclusive `<input type="date">`.
4. **`<dialog>`/`closedby` no Safari iOS.** Fallback de clique no backdrop (`e.target === dialog`) obrigatório; `overscroll-behavior: contain`.
5. **Imagens pesadas.** Só frontend: `loading="lazy"`, `decoding="async"`, `fetchpriority="high"` só no hero, `width`/`height`. Logo de upload e `box.gif` não são trocados nesta entrega.
6. Fontes antigas ficam no `index.html` (ListaPersonalizada e outras páginas).
7. Raiz `/` serve HomeSite para deslogado.
8. Filtros novos de Congelados filtram só no cliente; busca por texto não é persistida.
9. Rota nova só com `lazyComRetry`; não animar `box-shadow`; sem `position:absolute` com offset negativo em grid.

## 6. Critérios de aceite
- **A:** build verde; header/footer iguais nas 3 páginas com `aria-current`; Home clara; 390px e 1440px sem scroll horizontal.
- **B:** inventário de Congelados inteiro passa clicando — visitante vê preço do site e é barrado no "+" com o login; login CPF e CNPJ, criar senha, reset; preço do cliente, "Você sempre pede", repetir último; mínimo, indisponível, entrega × retirada, data sugerida, encaixe; ficha ANVISA de 3 produtos; impressão A4 limpa; mensagem de WhatsApp idêntica à de hoje; "Minha área" abre login a partir das 3 páginas.
- **C:** mínimo de caixas; cupom, indicação, crédito; calendário, slots, CEP; checkout até o WhatsApp; login por CPF; barra de progresso acompanha o carrinho.
- **Geral:** nenhum diff em `backend/` (exceto manuais) nem nos `api.js`; app interno sem mudança de aparência; inputs brancos em Dark Mode.

## 7. NÃO fazer
Alterar `api.js`, rotas ou `/api/ia-consulta`; `window.open`/iframe para imprimir; `React.lazy`; tocar em `Financeiro/`, `backend/` (sessões paralelas) ou no git; link "Abrir o app" na novidade.

## 8. Decisões tomadas pelo gerente (confirmar com o dono na entrega)
1. "Minha área" = botão de entrada + login existente (sem histórico de pedidos).
2. Imagens: sem troca de arquivos nesta entrega.
3. Kit Festa mantém o "Entrar" próprio; "Minha área" leva a Congelados.
4. "Área Restrita" só na Home.
