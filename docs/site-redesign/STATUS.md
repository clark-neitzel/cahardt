# STATUS — redesign do site público (para o gerente-entrega)

## Pedido e decisões do dono
Ver `.claude/diario/2026-11-24-redesign-site-publico.md` (pedido palavra por palavra, correção "a página tem que ser a mesma de hoje, só o visual", e as decisões item a item H1–K5). K6 (cabeçalho no checkout do Kit Festa): dono não respondeu → ficou como hoje (sem cabeçalho).

## Arquivos da entrega (só estes; o resto do working tree é de sessões paralelas)
frontend/index.html
frontend/src/pages/Site/{HomeSite,CongeladosSite,Login,FalarVendedor,SiteHeader,SiteFooter}.jsx, siteUtil.js, site.css, siteBase.css
frontend/src/pages/KitFestaSite/{KitFestaSite.jsx,kitfesta.css}
frontend/public/novidade-site-novo.html, frontend/public/novidades.json (entrada site-novo no topo)
backend/manuais/abas/site-congelados.md, backend/manuais/abas/kit-festa.md
docs/site-redesign/**, (diário em .claude/diario fica fora do git)

## Revisor (2 rodadas)
Rodada 1: APROVADO COM RESSALVAS — lógica equivalente provada função a função; api.js sem diff; CSS escopado. Bloqueios (impressão iPad; carrinho no checkout do KF) e ressalvas corrigidos.
Rodada 2: APROVADO sem bloqueios — impressão removida por completo; checkout KF sem header/carrinho; setas e nome restaurados; WhatsApp flutuante da Home existe (HomeSite.jsx ~80/220) com mesma mensagem; build ok. Melhorias: logout de Congelados não zera busca/preparo; comentário impreciso CongeladosSite.jsx:50.

## QA final: APROVADO COM RESSALVAS (app local + banco local, Chrome headless, 1440 e 390; capturas docs/site-redesign/qa/final-*.png)
Passou: Home (seções/ordem, links, WhatsApp flutuante, Minha área → login, Olá Nome, Sair, `/`); Congelados visitante (preço do site, "+" abre login, visitante até checkout, busca, preparo, grupos, ficha X/Esc/fora/setas, nutricional conferida à mão em 3 produtos, adicionar pela ficha); Congelados cliente (login CNPJ/CPF, criar senha, reset até a tela do código, preço do cliente 38,95 × 44,13 do site, Você sempre pede, Recomprar, Repetir último ignorando indisponível, mínimo bloqueando, indisponível, entrega × retirada, data sugerida, encaixe, telefone só sem cadastro, pedido #65 criado, texto do WhatsApp idêntico ao HEAD, carrinho persiste, Falar com vendedor com marcador, fab Ver pedido); Kit Festa (seções, filtros sem Mais pedidos/contagem, selo, login CPF, nome no cabeçalho, barra do mínimo, bloqueio abaixo do mínimo, cupom válido/inválido, crédito, use só um, checkout sem cabeçalho/carrinho, voltar do checkout, calendário/horários/CEP, pedido registrado + link wa.me idêntico ao HEAD, rótulo Redes sociais ok); geral (sem scroll horizontal 320/390/768/1440, console limpo, inputs brancos em dark mode, selos sem sobreposição, CSS isolado por inspeção).
FALHOU (leve): sair da conta em Congelados mantém busca/preparo marcados → em correção.
Não testado: indicação positiva do KF; entrega do KF até "Pedido registrado" (só formulário+CEP); /lista/:token com lista real; comparação visual do app interno (só prova de isolamento por CSS); fotos reais/mapa (local não tem); nada em iPhone/iPad reais (dialog da ficha no Safari iOS, fab com barra do Safari, PWA, teclado iOS).
Observações iguais ao HEAD (não são da entrega): clique duplo simultâneo cria 2 pedidos em Congelados (sem idempotência no backend); dia sem horário aparece "disponível" no calendário do KF.

## Testes com dados reais de produção
Só leitura (GET) como visitante para capturas da comparação (docs/site-redesign/comparacao/). Nenhum fluxo logado foi exercitado contra produção.
