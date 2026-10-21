# Nota de entrega — Como Fazer só para quem tem ficha de funcionário ou é da gestão

> Pedido do dono em 21/10/2026: o menu e o conteúdo apareciam para todos; quem não tem cadastro (vendedor, escritório) via conteúdo de todos os setores.
> Veredito do gerente de entrega: **LIBERADO**. Publicado em 21/10/2026 (commit fc18d2d4). Conferência em produção abaixo.

## O que mudou (em termos de uso)

- **O item "Como Fazer" do menu agora só aparece para** quem tem cadastro de funcionário ligado ao seu usuário **ou** é da gestão (administrador, quem edita o Como Fazer ou quem vê o painel). Vendedor e escritório sem ficha deixam de ver o menu.
- **Quem sem ficha chegar na tela mesmo assim** (link salvo, por exemplo) vê um cartão simples: "Seu usuário ainda não está ligado a um funcionário. Peça ao RH para ligar o seu cadastro." Nenhum conteúdo é mostrado.
- **O servidor também barra:** abrir um conteúdo, ver rotinas do dia, lista de encarregados, preencher rotina e chamar o encarregado respondem "peça ao RH" para quem não tem ficha e não é gestão. Esconder o menu não é a única proteção.
- **Quem tem ficha e o tablet do setor ficam exatamente como antes.**

## Decisão de desenho (para você confirmar ou mudar)

A **gestão sem ficha de funcionário continua vendo tudo** e **pode preencher rotina e chamar o encarregado**, como já podia. Se quiser que a gestão sem ficha só consulte e não execute, é uma mudança pequena em cada uma dessas duas funções.

## O que foi testado e por quem

- **Dev:** o servidor devolve ao menu se a pessoa pode ver; a tela inicial mostra o cartão quando não tem cadastro; o menu só aparece depois da resposta do servidor (enquanto carrega ou se falhar, fica escondido e tenta de novo).
- **Revisor:** aprovado; achou 4 rotas ainda abertas e 3 detalhes do menu, tudo corrigido.
- **QA (navegador, computador e celular):** 7 de 7. Menu no computador e na gaveta do celular só para quem tem ficha ou gestão e nunca para o vendedor sem ficha; trocar de usuário não herda o menu do anterior; vendedor sem ficha abrindo a tela ou um conteúdo direto recebe mensagem amigável; as 6 rotas do servidor recusam sem criar nada no banco; funcionário e tablet idênticos a antes; falha de rede ao consultar se recupera; build.
- **Gerente de entrega:** mudança conferida (só o Como Fazer; o arquivo do menu tem também trabalho de outra entrega, que não entra); build e checagem de sintaxe passaram; conferi no código que `aprender` e `confirmar` já recusam quem não tem ficha e que a lista de setores do `/me` só traz nomes, não conteúdo.

## Conferido em produção

Feito pelo gerente de projeto em 21/10/2026, depois do deploy:

- [x] **Telas novas no ar** — os arquivos publicados do app já trazem o cartão "ainda não está ligado a um funcionário" e a trava de quem não tem cadastro.
- [x] **Sem login, o módulo continua recusando** ("entre para continuar").
- [ ] **O servidor devolvendo o bloqueio de verdade** — só dá para ver com login: abra o Como Fazer com um usuário sem ficha de funcionário (vendedor, por exemplo) e confirme que o item sumiu do menu. Provado no ambiente de testes pelo QA.

- [ ] Telas novas no ar (o app publicado contém o texto do cartão "ainda não está ligado a um funcionário")
- [ ] Sem login, o módulo continua respondendo "entre para continuar"
- [ ] Com login de um vendedor sem ficha: sem item "Como Fazer" no menu (dono confere)
- [ ] Com login de funcionário: o menu aparece e tudo funciona como antes (dono confere)

## O que você precisa conferir (um minuto)

1. Entre com um usuário de vendedor/escritório sem ficha: o menu não deve ter "Como Fazer". Se alguém que **deveria** ver ficou sem, falta ligar o usuário à ficha dele no RH (Funcionários).
2. Entre com um funcionário da Cozinha: menu e conteúdo normais.

## Pendências e observações

- **Aviso cosmético:** se alguém sem ficha abrir um documento direto por link, a mensagem aparece numa caixa rosa em vez do cartão neutro. Não afeta a proteção.
- **Não testado:** voltar para o app depois de mais de 5 minutos em outra aba (a releitura do menu) e iPad real.
- **Sem página de novidade nem texto novo para o grupo:** não há tela nova, só mudança de quem enxerga. Manual do Clippy do Como Fazer atualizado.
