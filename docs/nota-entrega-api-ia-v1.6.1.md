# Nota de entrega — API da IA v1.6.1 (15/09/2026)

**Veredito do gerente de entrega: LIBERADO COM PENDÊNCIA** (detalhes no fim).

## O que mudou (em termos de uso)

Ajustes que o dono pediu sobre a v1.6.0, para a Ana (bot do WhatsApp) responder melhor sobre produto:

1. **Produto passa a usar os Dados da Etiqueta do PCP** quando o produto tem etiqueta ativa:
   - o nome curto que a Ana fala vira o nome digitado na etiqueta (limpo, sem código);
   - peso por unidade, unidades por pacote e peso do pacote saem da etiqueta (antes vinham "lidos" do nome do sistema);
   - dois campos novos: `modoPreparo` (texto literal do "Modo de Preparo" da etiqueta, para a Ana citar) e `etiqueta` (código de barras, alérgenos, tem glúten, tem lactose, como armazenar).
2. **Tipo de preparo (frito/assado/pronto/cru) continua vindo só do rótulo da categoria** — o revisor barrou a versão que adivinhava isso pelo texto livre da etiqueta (frases como "Não fritar, assar…" viravam "frito"). Corrigido antes desta liberação.
3. **Lista de promoções ganha um bloco `regras`**: explica em português, para a IA, como as promoções funcionam (preço fixo × condicional, como a condição é avaliada, como aplicar no pedido).
4. **Lista de indisponíveis ganha `orientacao`**: "Sem previsão no sistema — a Ana deve perguntar ao responsável", para a IA não inventar prazo de retorno.
5. Versão da API passa para **1.6.1**. Nenhum campo antigo foi removido ou renomeado (só acréscimos) — o bot que está no ar não quebra.
6. Guia novo para o time do bot: `docs/api-ia-v1.6.1-para-o-bot.md` (autocontido, sem segredo, com a base de produção e curls prontos).

## O que foi testado e por quem

- **Dev**: testes locais. **Revisor de código**: aprovado depois da correção do item 2.
- **Gerente de entrega (esta conferência, por conta própria)**:
  - `node --check` nos 3 arquivos JS alterados: OK.
  - Backend local subiu com o seed de teste; chamadas reais à API:
    - `/status` → versão `1.6.1`, avisos e envelope `meta/dados` intactos; sem chave → 401; chave errada → 401.
    - `/congelados/catalogo` da IA → produto com etiqueta trouxe `nomeCurto` da etiqueta, peso/unidades/peso do pacote da etiqueta, `modoPreparo` e `etiqueta{...}` preenchidos; produto sem etiqueta trouxe `modoPreparo: null` e `etiqueta: null`; `preparoTipo` veio do rótulo da categoria mesmo quando o texto da etiqueta dizia "assar" (a correção do revisor está valendo).
    - `/congelados/promocoes` → 2 promoções (fixa e condicional) + bloco `regras` com as 7 chaves documentadas.
    - `/congelados/indisponiveis` → lista + `orientacao` com o texto combinado.
    - `/congelados/reconhecer-telefone` (cliente de teste) → o objeto de produto com os campos novos também chega nesse caminho, `ultimoPedido` segue array, preço do cliente e promoção com acréscimo da condição dele.
    - **Catálogo público do site** (`/api/congelados-publico/catalogo`) → sem nenhum campo novo (os campos só-IA não vazaram para o site).
  - Comparação campo a campo do produto entre a 1.6.0 publicada e agora: nada sumiu; só entraram `modoPreparo` e `etiqueta`.
  - Guia do bot lido inteiro: base de produção confere (a rota responde lá, 401 sem chave), nomes de campo iguais ao código, curls válidos, nenhum segredo, códigos de erro batem com o código.
  - Nenhum token/senha/chave em arquivo do repositório.

## O que o dono precisa fazer

1. **Publicar** (commit + push) — o Clippy/manual não muda: essa API não tem tela.
2. **Depois do deploy, 1 minuto**: no terminal, rodar
   `curl -H "x-ia-api-key: <a chave>" https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1/status`
   e conferir que aparece `"versaoApi":"1.6.1"`.
3. **Mandar o guia** `docs/api-ia-v1.6.1-para-o-bot.md` ao time do bot (a chave vai por fora, nunca dentro do arquivo).

## Pendências / ressalvas (nenhuma muda comportamento)

- **Só se prova em produção**: os produtos reais precisam ter etiqueta ativa cadastrada no PCP para os campos novos virem preenchidos; sem etiqueta, vêm `null` (comportamento esperado, documentado para o bot).
- **Três retoques de texto para o dev fazer antes do commit** (1 minuto, sem retestar):
  1. `backend/scripts/seed-ia-consulta-v160-local.sql`, linhas 26 e 34: os comentários ainda falam em "preparoTipo via regex" e "fallback do preparoTipo pro modo_preparo" — é justamente o que foi removido; ajustar para não confundir o próximo QA.
  2. `docs/api-ia-v1.6.1-para-o-bot.md`, linha 22: "Chave configurada errada no servidor → 503" — o 503 acontece quando a chave **não está configurada** no servidor (env ausente); chave diferente devolve 401.
  3. `docs/api-ia-v1.6.1-para-o-bot.md`, seção 6 (exemplo de resposta): os valores 39.90 / 38.00 / 44.13 e o nome "Coxinha Tradicional de Frango G (pct 20un)" vêm do banco de teste local; trocar por valores claramente ilustrativos (ex.: `"…"`) para o time do bot não achar que são preços reais.
