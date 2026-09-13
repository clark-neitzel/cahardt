# Mapa de Clientes (fase 1) — nota de entrega

**Veredito do gerente de entrega (12/09/2026): LIBERADO COM PENDÊNCIA.**

## O que mudou (em termos de uso)

- Em **Clientes** apareceu o botão **Mapa** (ao lado de Saúde GPS). Ele abre a tela `/clientes/mapa`.
- No mapa, cada cliente com ponto GPS vira um pino. Dá para **colorir** os pinos por dia de entrega, dia de venda, categoria, vendedor, WhatsApp ou cidade. Cliente com dois dias aparece com o pino **em fatias**.
- A **legenda** mostra a contagem de cada cor e serve de filtro (clicar esconde/mostra aquela cor). Os **filtros** (cidade, bairro, categoria, vendedor — inclusive quem já saiu —, dias, WhatsApp, GPS, ativo/inativo) ficam **lembrados** ao reabrir a tela.
- Clicar no pino abre o **painel** com a ficha resumida e **edição rápida**: dia de entrega, dia de venda, categoria e vendedor salvam na hora, sem sair do mapa. WhatsApp usa o mesmo popup de sempre.
- Aba **Vizinhos**: pares de clientes a poucos metros um do outro que são atendidos em **dias diferentes** (o raio padrão é 1.000 m; quem tem `clientes.edit`/admin pode gravar outro padrão).
- Aba **Paradas por dia** e aba **Sem GPS** (quem ainda não tem ponto e por isso não aparece no mapa).
- No celular o painel sobe de baixo (arrasta pela alça).
- **Correção de bug antigo, fora do mapa:** salvar a ficha do cliente com poucos campos (ex.: só o celular) **apagava** o ciclo de compra personalizado, religava o "insight" e apagava a observação comercial fixa. Corrigido: só muda o que foi enviado. Toda mudança de dia/vendedor/categoria/celular agora fica registrada na auditoria (`CLIENTE_ALTERADO`).
- Respostas do servidor passaram a sair **compactadas** (gzip): a carga do mapa caiu de ~670 KB para ~86 KB. Isso vale para o app inteiro.

## O que foi testado, e por quem

- **Dev backend**: os 4 endpoints com curl (200), raio inválido (400), salvar raio sem permissão (403), PATCH parcial preservando ciclo/insight/observação, linhas gravadas na auditoria.
- **QA (clicando)**: PASSOU COM RESSALVAS — as duas ressalvas (clique duplo no Salvar; alça do painel no celular) foram corrigidas e **retestadas OK**. Gzip, "sem dia" unificado e legenda conferidos.
- **Revisor de código**: aprovado; todos os achados foram corrigidos (não só respondidos).
- **Gerente de entrega**: build do frontend rodado (`✓ built in 5.16s`), design system (pílulas, tokens, `SelectBusca`/`MultiSelect`, `useFiltrosSalvos`, `lazyComRetry`), mobile (`max-w-full overflow-x-hidden`, bottom-sheet), permissão front = back (Salvar padrão: `admin || clientes.edit` nos dois lados; listagem segue a mesma regra de visibilidade da lista de Clientes), manual do Clippy + índice + tabela `ABAS`, novidade sem `og:image`, com 9 mocks de tela e 47 legendas, accordions abertos, sem número do banco local em manual/novidade, schema não tocado por esta entrega, sem segredo no código, `compression` instalado e presente no `package.json`/lock.

## O que você precisa conferir (1 minuto cada)

1. **iPad/Safari real**: abrir Clientes → Mapa, tocar num pino, arrastar o painel pela alça, salvar um dia de entrega. Foi testado só em navegador de mesa simulando celular.
2. **Em produção, após o deploy**: perguntar ao Clippy "como vejo vizinhos atendidos em dias diferentes?" — ele deve apontar o Mapa de Clientes. Só funciona depois que o backend publicar.

## O que ficou pendente ou de fora

- **Não testado**: a mensagem de "sem permissão" ao trocar WhatsApp para usuário **sem** `clientes.edit` e **sem** `pedidos.edit` (não existe usuário assim no ambiente local). O backend recusa (403); só a exibição da mensagem na tela não foi vista.
- O último ajuste do dev (evitar uma chamada duplicada de Vizinhos ao trocar filtro) passou no build e foi lido pelo gerente (uma única chamada por mudança, resposta velha descartada), mas **não teve reteste do QA clicando**. Risco baixo; conferir no item 1 acima que a aba Vizinhos carrega.
- **Atenção ao publicar**: a entrada do Mapa em `novidades.json` **já foi para o GitHub** junto com o commit anterior de outra sessão (`d385dfc4`). Enquanto esta entrega não for publicada, o Clippy em produção pode anunciar "Mapa de Clientes" apontando para uma página que ainda não existe. **Publicar esta entrega logo em seguida** resolve.
- Fase 2 (arrastar pino, mover cliente de rota em lote, etc.) não faz parte desta entrega.

## Decisão em aberto para você (R1 do plano)

Hoje, **qualquer usuário que enxerga a tela de Clientes** pode alterar dia de entrega, dia de venda, vendedor e categoria — no mapa e na ficha. É como a ficha **já funcionava**; o mapa só facilita. Se quiser que isso exija `clientes.edit`, é um ajuste pequeno (front e back), mas muda também a ficha do cliente. Diga se quer restringir ou deixar como está.

## Texto para o grupo do WhatsApp

*🗺️ Novidade: Mapa de Clientes*

Em *Clientes* agora tem o botão *Mapa*: todos os clientes com GPS num mapa, coloridos por *dia de entrega*, dia de venda, categoria, vendedor, WhatsApp ou cidade (cliente com 2 dias aparece com o pino em fatias).

✅ Clique no pino e mude dia de entrega, dia de venda, categoria e vendedor *na hora*, sem sair do mapa
✅ Aba *Vizinhos*: quem mora pertinho um do outro mas é atendido em dias diferentes
✅ Aba *Sem GPS*: quem ainda falta marcar o ponto
✅ Filtros ficam lembrados; funciona no celular

Como usar: https://cahardt-github.xrqvlq.easypanel.host/novidade-mapa-clientes.html

---

# Fase 1.1 (13/09/2026) — Perfil, Compras no período e ponto GPS no mapa

**Veredito do gerente de entrega: LIBERADO COM PENDÊNCIA.**

## O que mudou

- **Filtro Perfil**: por padrão o mapa mostra **só clientes**; fornecedor fica de fora. (O que aparecia como "fornecedor no mapa" era cliente que também está marcado como fornecedor na ficha — o filtro resolve, sem mexer no cadastro.)
- **Filtro Compras no período**: seletor de período igual ao do Financeiro + "comprou / não comprou". Conta só pedido que vale como venda (mesma régua da comissão e das metas); devolução não tira o cliente de "comprou". Um cartão mostra quantos compraram no período.
- **Ponto GPS direto no mapa**: no painel do cliente e na aba Sem GPS há o botão **Alterar/Cadastrar ponto GPS** (mesmo popup da ficha: endereço, coordenada ou arrastar) e **"Marcar no mapa"** — toca no lugar e confirma. O pino se move ou entra no mapa na hora. Mesmas travas do módulo GPS (ponto perto de outro pede autorização pelo popup).

## O que foi testado

- **Dev backend**: curl — perfis nos dois formatos do banco; `/compras` bate com consulta direta no banco; datas inválidas e `de > ate` → 400; sem token → 401; vendedor vê só os seus.
- **QA (clicando)**: aprovado, sem defeito funcional.
- **Revisor**: aprovado; achados corrigidos (manual, contador de filtros, faixa sobre a legenda, novidade).
- **Gerente**: build `✓ built` (exit 0); `FiltroPeriodo`/`usePeriodoSalvo` e `SelectBusca` (nenhum `<select>` nativo); permissão dos botões GPS no front = rota do backend (`admin | Pode_Editar_GPS | clientes.edit | Pode_Executar_Entregas`); `WHERE_PEDIDO_RECEITA` reutilizado; schema não tocado; sem `$transaction`; sem segredo; manual sem número do banco local; novidade sem `og:image`, 5 accordions abertos, 12 mocks, `novidades.json` válido e só com a linha do Mapa.

## O que você precisa conferir

1. **No iPhone/iPad real**: abrir Clientes → Mapa → tocar num pino → **Marcar no mapa** → tocar no lugar → Salvar aqui. Conferir que o toque é reconhecido e que o pino se move. Não foi testado em aparelho.

## Pendente / de fora

- Ocultação dos botões GPS para usuário **sem** permissão não foi vista na tela (todo usuário local tem permissão); o backend recusa com 403 de qualquer forma.
- Offline: só o popup de GPS trata; "Marcar no mapa" precisa de rede.

## Texto complementar para o WhatsApp

*🗺️ Mapa de Clientes — atualização*

✅ Filtro *Perfil*: por padrão só clientes (fornecedor fica de fora)
✅ Filtro *Compras no período*: quem comprou ou não comprou no período que você escolher
✅ *Ponto GPS pelo mapa*: no painel do cliente ou na aba Sem GPS, toque em *Marcar no mapa*, escolha o lugar e confirme — o pino entra na hora

Detalhes: https://cahardt-github.xrqvlq.easypanel.host/novidade-mapa-clientes.html
