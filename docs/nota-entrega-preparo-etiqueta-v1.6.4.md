# Nota de entrega — Preparo do site vindo da etiqueta (API da IA v1.6.4)

**Status do portão de entrega (16/09/2026): LIBERADO COM PENDÊNCIA.**
Pendência que só o dono fecha: abrir o site depois do deploy e conferir 3 produtos (abaixo), e decidir o rótulo
do produto já frito que vai ao forno.

## O que mudou (para o dono)

- No **site de congelados**, o rótulo pequeno de preparo do card ("Para fritar", "Para assar", "Somente aquecer",
  "Cozinhar" ou "Assar ou fritar") agora vem do **Modo de Preparo da etiqueta do produto** (PCP → Etiquetas),
  e não mais do texto fixo por categoria. O texto por categoria continua existindo só como **reserva**
  (produto sem etiqueta ou com texto que o sistema não consegue classificar).
- O mesmo vale para o catálogo do cliente logado, para a ficha, para os itens de pedido/histórico e para o
  que a **Ana (IA do WhatsApp)** enxerga.
- **Números nos 51 produtos reais do site:** 25 mudam de sentido (mostravam "Somente Aquecer" e a etiqueta manda
  fritar/assar), 23 mudam só de texto ("Precisa Fritar" → "Para fritar"), 3 ficam como estão (caem na reserva).
- Segurança do classificador: frase com "não"/"sem" logo antes do verbo não conta ("Não fritar, assar em forno"
  vira "Para assar"); "pré-aquecido", "pré-frito" e "pré-cozido" são ignorados; dois verbos viram "Assar ou fritar".
- A API da IA sobe para **1.6.4** com aviso informativo; campos novos `preparoOrigem` e `modoPreparo`.
  Nenhum campo antigo mudou de nome ou de tipo.

## O que foi testado

- **Revisor de código:** aprovado; 2 apontamentos (site público carregava promoções à toa; negação muito ampla)
  corrigidos e provados.
- **QA:** site desktop e 375px, ficha do produto, API pública e da IA, regressão do carrinho e do admin de
  categorias; achado "pré-frito" corrigido e provado com 10 frases.
- **Gerente de entrega (conferência própria):**
  - `node --check` nos 4 arquivos de backend: OK. `npm run build` do frontend: OK (5,5 s).
  - Classificador rodado com 11 frases (negação, negação distante, "pré-frito", 2 verbos, micro-ondas, água
    fervente, vazio, "não recomendamos fritura"): todas com o resultado esperado.
  - Backend local: `GET /api/congelados-publico/catalogo` devolve `preparo`, `preparoOrigem`, `modoPreparo`
    (e NÃO devolve `preparoTipo`, como antes). Catálogo da IA responde `versao 1.6.4`, aviso de 16/09 no topo,
    `preparoTipo` `null` no rótulo combinado e `COZIDO`/`ASSADO`/`FRITO`/`PRONTO` nos demais.
  - Contagem de consultas ao banco: o site público faz 3 consultas (produto, config, etiqueta) e **zero em
    promoção**; o caminho da IA reaproveita as etiquetas e faz só a consulta de promoção.
  - `historico-pedidos` com itens e `produtos-comprados`: preparo com origem correta. O `produtos-comprados`
    tinha ficado de fora na 1ª rodada (só categoria, sem `preparoOrigem`) — reprovado, corrigido pelo dev e
    reconferido por mim com `curl`: cód. 3059 sai "Assar ou fritar" / origem ETIQUETA / `preparoTipo null`;
    3063 sai "Para fritar" / CATEGORIA; produto sem nenhuma fonte sai `""` / `null` / `null`.
  - Página de novidade `frontend/public/novidade-preparo-etiqueta.html`: DOCTYPE completo, `og:title` e
    `og:description` sem `og:image`, sem link "Abrir o app", 3 telas mockadas com 10 pins e legendas, os 3
    produtos pendentes listados, `novidades.json` válido com a entrada no topo. Estava com 3 dos 4 accordions
    fechados (regra: todos abertos) — reprovado, corrigido pelo dev-frontend, reconferido: 4 abertos, 0 fechados.
  - Diff sem nenhum segredo. Manuais `site-congelados.md` e `pcp-etiquetas.md` coerentes com o código.

## Novidade para a equipe

- Link (após publicar): `https://cahardt-github.xrqvlq.easypanel.host/novidade-preparo-etiqueta.html`
- O Clippy avisa sozinho pela entrada em `novidades.json` ("Preparo do site vem da etiqueta").
- Texto para o grupo do WhatsApp:

> *Preparo do site agora vem da etiqueta* 🏷️
> O selo "Para fritar / Para assar / Somente aquecer" dos produtos do site de Congelados passou a sair do campo *Modo de Preparo* da etiqueta (PCP → Etiquetas). 25 produtos estavam com o preparo errado e foram corrigidos de uma vez.
> ⚠️ Faltam 3 etiquetas sem modo de preparo: Bolinho de carne frito 150g (3065), Coxinha de linguiça 22g (H22MI5) e Churros 22g (H22MI3).
> Detalhes: https://cahardt-github.xrqvlq.easypanel.host/novidade-preparo-etiqueta.html

## O que o dono confere em produção (1 minuto)

Abrir o site de congelados e olhar o rótulo de preparo em 3 produtos da tabela
(`docs/preparo-site-antes-depois.md`): **H22MI2 Bolinha de Queijo 22g → "Para fritar"**,
**3086 Doguinho → "Para assar"**, **3071 Calzone Frango → "Para assar"**.

## Pendências

1. **Decisão do dono:** produto já frito de fábrica (nome com "FRITO") cuja etiqueta manda forno sai
   "Para assar". Se preferir "Aquecer no forno", é um ajuste pequeno no classificador (precisa olhar o nome).
2. **3 produtos sem modo de preparo na etiqueta** (caem na reserva por categoria): completar no PCP → Etiquetas:
   **3065** (Bolinho Carne Frito), **H22MI5** (Festa Coxinha Linguiça 22g), **H22MI3** (Festa Churros 22g).
3. A Ana só vê o rótulo novo depois de publicar o backend.
