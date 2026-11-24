# Novidade para a equipe e manual do Clippy — CA-Hardt

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Anúncio de novidades no grupo do WhatsApp (REGRA — pedido do usuário em 07/2026)

Ao **finalizar qualquer mudança visível para a equipe**, gerar por conta própria uma página de anúncio para o dono mandar no grupo do WhatsApp:

1. Criar `frontend/public/novidade-<slug>.html` — página estática, standalone (HTML completo com `<!DOCTYPE>`), mobile-first, no tema Starbucks do app. **Espelhar `frontend/public/novidade-tarefas.html`** (referência do padrão: hero verde-escuro, mock da funcionalidade, seções em accordion, passos "para começar a usar", demo interativa quando fizer sentido). **Accordions SEMPRE já abertos por padrão** (`class="acc aberto"` em todos) — a equipe não clica para expandir e perdia as informações (pedido do usuário em 07/2026); o clique só serve para recolher.
   - **SEMPRE incluir mockups das telas do app em HTML/CSS** (pedido do usuário em 07/2026): uma seção "As telas do app" com cada tela nova/alterada reproduzida como mock (cards, botões e campos no tema do app), com **legendas numeradas** (pins dourados) explicando cada elemento — onde fica o botão, o que cada campo faz, o que acontece ao salvar. Referência do padrão: `novidade-cadastro-clientes.html` (Telas 1/2/3 com classes `.tela`, `.app-card`, `.pin`, `.legenda`). Isso evita dúvidas da equipe sem precisar de screenshot.
2. Incluir as **meta tags Open Graph** `og:title` e `og:description` — **SEM `og:image`** (pedido do usuário em 07/2026): com a logo 512px o WhatsApp montava um cartão gigante no grupo; sem imagem o preview sai compacto, só título + descrição.
3. O link público fica em `https://cahardt-github.xrqvlq.easypanel.host/novidade-<slug>.html` (nginx serve arquivos reais de `public/` direto; funciona sem login).
   - **SEMPRE registrar a novidade no topo de `frontend/public/novidades.json`** (`{ slug, titulo, resumo, data }`, mais recente primeiro) — é esse manifesto que faz o **Clippy balançar** avisando a equipe no computador; ao clicar, ele abre a página da novidade dentro do app. Sem a entrada no JSON, o anúncio só chega a quem está no grupo do WhatsApp. `titulo` curto (vai no balãozinho do Clippy), `slug` sem o prefixo `novidade-`.
4. Entregar ao usuário: o link + **texto pronto para copiar/colar** no grupo (formatação do WhatsApp: `*negrito*`, emojis, curto).
5. Páginas de anúncio antigas podem ser removidas quando a novidade deixar de ser nova (não acumular).
6. **NÃO incluir botão/link "Abrir o app" (ou similar) na página** — a equipe usa o app pelo atalho instalado (PWA); um link abriria o sistema no navegador comum, fora do atalho. A página é só leitura do anúncio (pedido do usuário em 07/2026).

---

## Manual das Abas e Clippy — atualizar SEMPRE (não esperar o usuário pedir)

Cada aba/tela do app tem um manual em `backend/manuais/abas/<slug>.md` (índice em `backend/manuais/abas/README.md`). Esses manuais são a **fonte de conhecimento do assistente Clippy** (`backend/services/copilotoService.js` lê os arquivos em runtime + a tabela `ABAS` com as rotas/permissões reais). O Clippy passa a usar a versão nova **ao publicar o backend**.

**CHECKLIST OBRIGATÓRIO ao final de TODA alteração no sistema** (faça por conta própria, sem o usuário precisar pedir):
1. Pergunte-se: esta mudança **cria ou altera** alguma função, tela, fluxo ou permissão visível ao usuário?
2. Se SIM:
   - Atualize o manual da aba correspondente (analise a aba inteira; edite só o que mudou; NÃO remova itens importantes).
   - Se for tela/função **NOVA**: crie o manual (`backend/manuais/abas/<slug>.md`), adicione a linha no índice `README.md` e adicione a entrada na tabela `ABAS` em `backend/services/copilotoService.js` (rota real + permissão real).
   - Se a **rota ou permissão** mudou: atualize a tabela `ABAS`.
   - Cubra TODAS as funções e TODAS as sub-abas da tela.
3. Baseie-se no comportamento REAL do código, não no nome das rotas.
4. Ao final, **avise o usuário** o que foi atualizado no manual/Clippy (ou diga que nada precisou).
