# Nota de entrega — Inadimplência visível, Entregas 2 e 3 (telas + novidade) — 14/10/2026

**Publicado:** commit 4b2ba1a5 (`deployMarker inadimplencia-e2-2026-10-14`). Mockup aprovado: docs/mockups/inadimplencia-telas.html.

## O que mudou
- **Selo vermelho** "Em atraso R$ X · N dias" ao lado do nome do cliente em Pedidos, Clientes, Rota, Atendimentos, Contas a Receber, Caixa, Carga, Mapa, fila do Site e checkout do motorista. **Selo amarelo** "A confirmar" para quem pagou na entrega por Pix/cartão/dinheiro e o escritório ainda não conferiu (não é dívida, não trava).
- Clicar no selo abre a janela **"Contas em aberto"** (a mesma em todo o app), com "Cobrar agora (WhatsApp)" e "Abrir no Contas a Receber" para quem tem permissão.
- Ficha do cliente: faixa fixa + aba **Financeiro**. Pedidos: filtro **"Só clientes em atraso"** (lembrado por usuário).
- **Aprovar, faturar ou converter um especial** de cliente com venda travada só com a permissão "vender para inadimplente": botão laranja **"Assumir responsabilidade e aprovar"** (nome vai para a observação). Sem permissão: botão cinza e o servidor recusa. Mesmo para a **fila do site/Ana** ("Aguardando liberação de um responsável"). Bonificação não trava. A Ana não mudou.
- Novo Pedido passa a respeitar a carência: trava só após 3 dias e R$ 50 (antes travava no 1º dia).
- Motorista vê faixa amarela "Este cliente tem R$ X em atraso. Ofereça receber agora." (chave em Configurações).
- Central de Pendências: bloco "Pedidos aguardando liberação (cliente em atraso)".
- Configurações › card **"Venda a inadimplente"** (só admin): carência, valor mínimo, prazo do "a confirmar", funcionário fora, motorista vê o atraso; "Última mudança: quem · quando".
- Novidade para o grupo + Clippy avisando; manuais de 14 abas atualizados.

## Quem testou
Dev (build, 46 testes do cálculo, ledger do caixa). QA em 2 rodadas (118 capturas): 16 telas, celular e desktop, dados reais em cópia de produção; 1ª rodada reprovou (botões estourando no celular, faixa do motorista sumindo no boleto), 2ª aprovou. Revisor em 2 rodadas (achou popup colado no componente errado que derrubaria Contas a Receber; corrigido). Gerente de entrega refez build/lint/testes, provou o 403 no servidor e mediu 3 telas no celular.

## Confira (1 minuto cada)
1. Pedidos → Especiais → "Só clientes em atraso": só pedidos de quem deve, com selo; toque no selo abre a janela.
2. Especial de cliente em atraso com um vendedor sem permissão: botão cinza "Só um responsável pode liberar". Com você: laranja "Assumir responsabilidade…".
3. Configurações → "Venda a inadimplente": mude a carência e veja "Última mudança".
4. Pedidos Online → Site: pedido de cliente em atraso com "Aguardando liberação de um responsável".
5. Quem está com o app aberto precisa atualizar (ícone de refresh).

## Pendente / fora
- iPad/iPhone real (testado no Chrome simulando celular). "Cobrar agora" só se prova em produção.
- Duplo clique em "Aprovar" pode mostrar erro na 2ª chamada (dado fica certo; já era assim).
- Dashboards somam pedidos excluídos/cancelados (manual explica) — decisão sua.
- 8 Kit Festa "não entregues" com título aberto; erro pré-existente "Erro ao buscar audit logs" em Configurações (routes/caixa.js).
- Conferir no painel de permissões quem deve ter "Vender p/ cliente com contas em aberto".

## Texto para o grupo
⚠️ *Novidade no Hardt App: inadimplência visível*
Agora dá para ver, em todas as telas, quem está em atraso:
🔴 *selo vermelho* = devendo (valor e dias)
🟡 *selo amarelo* = pagamento "a confirmar" (pendência do escritório)
⛔ Venda a prazo só trava com mais de 3 dias e R$ 50 de atraso. Travou? Venda à vista ou peça a um responsável liberar.
🤖 A Ana segue igual: o pedido entra na fila e espera liberação.
👉 Veja as telas: https://cahardt-github.xrqvlq.easypanel.host/novidade-inadimplencia.html
