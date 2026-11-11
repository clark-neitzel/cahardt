# QA — aviso de amostra no WhatsApp (11/11/2026, local hardt_local, sem BOT_WHATSAPP_*)

Veredito: APROVADO (com observações). Chrome headless via puppeteer-core; backend local + Vite.

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Ícone Package em todos, desligado, desktop e 375px | OK. 70 botões no DOM (35 desktop + 35 mobile), todos "desligado" (text-gray-300). 375px: scrollWidth=375, 4 ícones numa linha só por cartão, direita em 330px. |
| 2 | Ligar Josiane/Jociel/Edilson; toast; persiste | OK. Toast "X: aviso de amostra nova ativado"; após reload continuam teal; SQL confirma. Edilson (sem telefone): title "ligado, mas sem telefone cadastrado: não receberá". |
| 3 | Desligar/religar | OK (Jociel). |
| 4 | Criar amostra (cliente, 2 itens, amanhã, obs) | HTTP 201 (AM#59). |
| 5 | Fila | 1 linha: interno / amostra / amostra-nova-<id>-<Jociel> / PENDENTE / sem_url. Nenhuma p/ criadora (Josiane), Junior (sem flag), Edilson (sem tel; log "sem telefone válido: pulado"), Leticia (marcada mas inativa). |
| 6 | Texto | Ver textos-das-mensagens.txt: AM#, destinatário — cidade, dd/mm, quem pediu, itens, obs, frase final; 0 ocorrências de undefined/null/NaN; <1990 chars. |
| 7 | 8 itens + obs 575 chars | 201; 5 itens + "_+3 itens_"; obs cortada com "…"; 586 chars. |
| 8/9 | Lead sem cliente / sem data | "Nome (lead) — Cidade"; "Entrega: sem data". |
| 10 | Idempotência | Ver observação abaixo. |
| 11 | Ninguém marcado | 201, fila não cresceu. Service rejeitando (stub): criar() retorna normal, log [AvisoAmostra]. findMany falhando: idem. |
| 12 | Regressão | /admin/embarques mostra faixa Amostras fora de carga com AM#; Pedidos → Amostras lista AM#; 0 pageerror. Botão Repeat (pedido convertido) segue presente. |

## Item 10 (idempotência) — fato
Chamar `avisarNovaAmostra` 2x extra para a MESMA amostra (AM#59) gerou 2 novas linhas PENDENTE com a mesma referência (3 no total). Não há dedupe local: `botWhatsappService.enviar` sempre faz POST ao bot e registra uma linha; `bot_whatsapp_envios` só tem índice (não unique) em `referencia`; o worker `processarFila` reenvia cada PENDENTE com a mesma referência. A dedupe é do bot (origem+referência -> `duplicado`), então em produção só uma sairia. Na criação normal o disparo é 1x (apenas uma linha por destinatário nos casos 4-9). Não testável aqui sem o bot.

## Observações
- Botões de ação no mobile têm 32x32px (abaixo de 44px), igual aos demais ícones já existentes.
- Nome de lead com espaço sobrando no cadastro gera "Ana, quiosque em barra velha  (lead)" (dado sujo, cosmético).
- Usuários inativos ficam ocultos na lista por padrão ("Mostrar inativos"); Leticia foi marcada via SQL.
- Números AM# pulam (60-62 queimados por requisições 500 minhas, com produtoId inválido; nada gravado).
- Chrome local não é iPad/iPhone; WhatsApp real só provado em produção com o bot.
