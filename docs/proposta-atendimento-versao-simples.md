# Rota de atendimento — proposta mínima (26/10/2026)

Baseada no código atual (RotaLeads.jsx, ModalAtendimento.jsx, atendimentoService.js), não na proposta do Codex.
**O card não muda.** Mudam 3 regras de processo. Nada implementado ainda.

## Como funciona hoje (confirmado no código)
- O cliente só sai da aba "Atendimento" (e vira "Atendidos") se teve atendimento **hoje** ou pedido criado **hoje**.
  Pedido de ontem/anteontem não conta: o cliente aparece como pendente no dia da rota.
- A cobrança de pendência (tela que trava o app) olha o dia útil anterior + hoje. Pedido de 2 dias antes também não conta.
- Lead entra na rota toda semana enquanto não for FINALIZADO/CONVERTIDO. "Sem potencial" é só uma ação, não finaliza.
  Cadastro de lead não avisa se já existe parecido (daí os 8 "Merc carmim").
- Não existe jeito de "pausar" cliente: ou está Ativo (volta toda semana) ou é desativado (some de tudo).

## 3 mudanças

**1. Pedido dos últimos 2 dias conta como atendido** (pequena)
- Mesma regra que já existe para "pedido hoje", só alargando a janela para hoje + 2 dias anteriores, nos 3 lugares: lista da rota, badge do card e cobrança de pendência.
- Badge do card passa a dizer "Com Pedido · ontem · #1234" (hoje diz "Com Pedido · 14:32").
- Cliente vai para a aba "Atendidos", igual acontece com pedido de hoje. A entrega não muda.

**2. Lead para de voltar sozinho** (média)
- "Sem potencial" finaliza o lead: sai da rota, fica no histórico e na busca.
- Lead só volta à rota se tiver "próxima visita" marcada ou se foi criado há menos de 30 dias. Sem isso, cai numa lista "Leads parados" do gestor, não na rota do vendedor.
- Ao cadastrar: aviso "Já existe Merc Carmim a 30 m — é o mesmo?" (nome parecido ou GPS perto). Só avisa, não impede.
- Os 108 leads do Jociel: o gestor revisa uma vez pelo Painel (finaliza ou marca próxima visita). Depois a regra segura o resto.

**3. "Pausar visitas até (data)"** (pequena)
- Nova ação no modal de atendimento que já existe (as ações são configuráveis em Configurações).
- Cliente pausado sai da rota e da pendência até a data; volta sozinho depois. Aparece em "Pausados" no Painel de Atendimentos.
- Nada é apagado nem desativado. Resolve o "não passo mais lá, mas não quero perder".

## O que NÃO mexer agora
Card, modal, abas, painel, dashboard e metas ficam como estão. Os números do painel passam a refletir as regras acima sem alteração.

## Decisões do dono
1. Mudança 1: cliente com pedido recente vai para "Atendidos" (recomendado) ou fica em "Atendimento" só com o aviso?
2. Mudança 2: 30 dias para lead sem próxima visita sair da rota está bom?
3. Mudança 3: quem pode pausar: vendedor e gestor (recomendado) ou só gestor?
