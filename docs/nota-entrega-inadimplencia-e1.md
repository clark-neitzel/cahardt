# Nota de entrega — Inadimplência visível, Entrega 1 (cálculo) — 14/10/2026

**Publicado:** commit 7240e27d, deploy conferido (`deployMarker inadimplencia-e1-2026-10-14`).

## O que mudou
O sistema voltou a enxergar quem deve de verdade. Desde 07/09, se o motorista apontasse "boleto" na entrega, o sistema tratava como se o cliente tivesse pago — o cliente com boleto vencido sumia do selo vermelho, da Rota, da trava de venda, da Régua de Cobrança e dos painéis. Agora:
- Boleto e venda a prazo **nunca escondem** a dívida.
- Dinheiro, Pix e cartão apontados na entrega ficam "em espera" até o Caixa/banco confirmar; passando de **7 dias** sem confirmar vira aviso amarelo **"a confirmar"** (não trava venda — é pendência do escritório).
- Compra de funcionário e pedido especial ainda não entregue ficam fora. Saldo de até R$ 1 não conta.
- Venda a prazo trava a partir do **3º dia** de atraso e com pelo menos **R$ 50**; o selo vermelho aparece desde o 1º dia. Quem tem "Pode vender a inadimplente" (ou admin) libera e fica registrado como responsável; sem a permissão, só à vista.
- Esses números são ajustáveis pelo administrador, com registro de quem mudou (a tela vem na Entrega 2).

## Conferido em produção (14/10, 19h)
- Sabor Gourmet: antes "em dia"; agora R$ 1.247,08 em atraso, 3 boletos, 57 dias, trava venda a prazo.
- Resumo: antes 18 clientes vermelhos / R$ 4.702; agora **20 clientes / R$ 12.001** (19 travam venda; 4 "a confirmar" com R$ 1.128). Cálculo em 0,2 s.
- As 14 formas de pagamento usadas na entrega classificadas corretamente (boleto nunca como pago).
- Voltaram a aparecer: Panificadora Mendes (R$ 3.516), Sabor Gourmet, Lanchonete Porto, Restaurante Theodoro, Delícias da Dê, Sr. Jaime, Aldori, Elida Neves (126 dias), Rosa dos Ventos, Super Economia, Jeff Cafeteria, Luz & Amaral.
- Saíram por regra: 8 Kit Festa ainda não entregues, 1 compra de funcionário, 1 saldo de R$ 0,10.

## Quem testou
Dev (46 casos de regra + cópia de produção), QA clicando (Clientes, popup, Rota, Novo Pedido com vendedor comum e admin, Régua, painéis, celular; 2 rodadas — a 1ª reprovou por dias de atraso errados e R$ 0,10 na Régua, corrigidos), revisor (2 rodadas), gerente de entrega (refez as provas finais).

## O que o dono precisa conferir (1 minuto)
1. Clientes → "Sabor Gourmet": selo vermelho R$ 1.247,08.
2. Régua de Cobrança → Inadimplentes: a lista cresceu. "Cobrar agora" em um deles: a mensagem sai uma vez só.
3. Um vendedor sem permissão tentando pedido a prazo para o Sabor Gourmet: barrado.

## Pendente
- Entrega 2: selo nas 16 telas, tela de Configurações, botões do popup (mockup aprovado). Até lá, a tela de Novo Pedido ainda barra desde o 1º dia de atraso (no servidor a carência já vale).
- Entrega 3: página de novidade + aviso do Clippy.
- Cobrança automática: conferir no log `[Cobranca]` da manhã seguinte que "em espera"/"a confirmar"/funcionário/especial não entregue não receberam mensagem.
- Decisão do dono: painéis Financeiro/Dashboard ainda somam títulos de pedidos excluídos/cancelados no Conta Azul (o selo ignora) — manter ou tirar?
- Para olhar: 8 pedidos Kit Festa de set/out seguem "não entregues" com título aberto (mais antigo 13/09). Se já foram entregues, marcar — senão nunca entram na cobrança.

## Texto para o grupo (até a página da Entrega 3)
*Inadimplência voltou a aparecer* — o sistema agora mostra em vermelho todo cliente com *boleto vencido*, mesmo que o motorista tenha apontado o boleto na entrega. Alguns clientes que ontem apareciam limpos vão aparecer devendo hoje (é o certo). Venda a prazo trava a partir do 3º dia de atraso e R$ 50; se travar, venda à vista ou fale com quem tem permissão. Pix/dinheiro apontado e ainda não conferido pelo Caixa continua sem travar.
