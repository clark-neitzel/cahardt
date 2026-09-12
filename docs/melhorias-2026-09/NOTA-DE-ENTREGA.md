# Nota de entrega — Diagnóstico e propostas de melhoria do CA-Hardt (setembro/2026)

**O que foi feito.** Cinco "consultores" (design, experiência de uso, segurança, automação e conexões externas) olharam o sistema inteiro — todas as 62 telas do menu, as ~20 rotinas automáticas e as 17 ligações com serviços de fora — sem mexer em nada do app. O resultado virou 6 páginas para abrir no navegador, com o problema explicado em linguagem simples, o desenho da tela proposta (com números apontando cada parte) e o esforço estimado (P/M/G). Nada foi alterado nem publicado no sistema: é só leitura para o senhor decidir.

**Como abrir.** Pasta `~/Projetos/CA-Hardt/docs/melhorias-2026-09/`. Dê dois cliques em **`index.html`** — é a capa; o menu no topo leva às outras páginas. Funciona sem internet e também no celular (melhor no computador ou iPad, porque os desenhos de tela de computador ficam apertados na tela pequena).

**O que cada página traz.**
- `index.html` — resumo do que os 5 encontraram, a tabela das 16 propostas e a ordem sugerida em 3 meses.
- `01-navegacao-design.html` — menu enxuto por perfil (vendedor vê 6 itens, não 62), tela de Início com todas as pendências do dia e o padrão visual único.
- `02-vendas.html` — alerta de pendência e "repetir último pedido" na hora de vender, card da Rota mais limpo, ficha do cliente com GPS/WhatsApp, fila única dos pedidos do site/Kit Festa/Ana.
- `03-logistica-caixa.html` — linha do tempo do pedido (aprovado → NF → entregue → recebido), Embarque + Mapa numa tela, Caixa do Motorista com abas.
- `04-financeiro.html` — 5 telas gerenciais viram abas de uma só; Recebíveis e Compras juntos; avisos diários que hoje não existem.
- `05-producao.html` — Sugestões + Ordens numa tela, cálculo de produção sozinho às 5h, painel do chão de fábrica fica como está.
- `06-seguranca-conexoes.html` — as 3 urgências de segurança, a tabela de brechas, a Central de Segurança e a Central de Conexões (saúde das 17 integrações num painel só).
- `relatorios/` — os 5 relatórios técnicos completos, para quem for executar.

**O que foi testado.** QA abriu as 7 páginas no Chrome em 375px, 400px e 1200px, em duas rodadas: sem rolagem lateral, sem erro, todos os links e âncoras funcionando, cada número do desenho batendo com a legenda. Um revisor comparou o texto das páginas com os 5 relatórios (números, esforços, nomes) e as correções foram aplicadas. O gerente de entrega repetiu por amostragem (páginas 05 e 06 nas duas larguras, ordem dos números, links da capa) e confirmou que **nenhuma senha, chave ou token** aparece em nenhum arquivo.

**O que o senhor precisa decidir.**
1. Segurança — as 3 urgências da página 06 (limite de tentativas na senha do painel de manutenção, criptografar o backup que vai para o Drive, atualizar bibliotecas). São pequenas e independentes; sugerimos autorizar já.
2. Por qual área começar — a capa sugere: 1º mês segurança + letra/botões + menu por perfil; 2º mês Central de Conexões + Assistente de Pedido; 3º mês fusões do Financeiro e Painel do Pedido. Basta responder "começa por X".
3. Conexões novas (e-mail da NF ao cliente, Open Finance, impressora de etiqueta em rede) — só entram se o senhor quiser.

**O que ficou de fora / pendente.**
- Áreas olhadas que não ganharam proposta própria nesta rodada: Produtos/Estoque, RH (ponto/folha), Tarefas, Contabilidade, Kit Festa admin, Catálogo e Clippy — os consultores viram e não acharam ganho grande o bastante para uma tela nova agora; os relatórios em `relatorios/` registram o que foi visto.
- Os desenhos são propostas, não telas prontas; os números dentro deles (clientes, valores) são exemplos.
- Testado só no Chrome do Mac; não foi aberto em iPad/iPhone real (são páginas simples, risco baixo).
- Nenhuma proposta foi implementada — cada uma vira uma tarefa separada, com a equipe completa, quando o senhor liberar.
