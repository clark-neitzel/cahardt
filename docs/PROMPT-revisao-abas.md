# Prompt — Criar o manual de cada aba

> **Como usar:** abra uma conversa nova com o Claude Code neste projeto e cole o texto abaixo (a partir de "Você vai criar...").
> A regra que mantém esses manuais atualizados já está no `CLAUDE.md` (seção "Manual das Abas — manter em dia").

---

Você vai criar o **manual de cada aba** do app CA-Hardt (frontend React/Vite, backend Node/Express/Prisma). Objetivo: um documento por aba explicando **o que ela é, o que faz, como se usa (fluxo real) e o que ela afeta** — servindo de ajuda de uso e de referência para futuras alterações. Escreva em **português do Brasil, linguagem simples** (o dono é leigo em programação).

**Baseie-se no CÓDIGO REAL, não no nome das rotas:**
- A lista de abas e as permissões estão no menu (Sidebar) em `frontend/src/App.jsx`.
- Para cada aba, ABRA o(s) componente(s) em `frontend/src/pages/...` e descreva o fluxo como ele realmente funciona. Exemplo concreto: **criar um pedido NÃO começa na aba "Pedidos"** — começa na aba **Rota**, no card do cliente, botão "Novo Pedido", que abre `/pedidos/novo?clienteId=...` (`frontend/src/pages/Rota/RotaLeads.jsx`).

**Onde salvar (1 arquivo por aba, para gastar poucos tokens ao consultar):**
- Crie a pasta `backend/manuais/abas/`.
- Um arquivo por aba: `backend/manuais/abas/<slug>.md` (ex.: `pedidos.md`, `rota.md`, `contas-receber.md`).
- Um índice `backend/manuais/abas/README.md` com uma linha por aba (nome, rota, 1 frase, link).

**Template de cada `backend/manuais/abas/<slug>.md`:**
```markdown
---
aba: <Nome>
rota: <rota principal>
permissao: <chave de permissão ou "todos">
---
# <Nome>
## O que é
## O que dá pra fazer aqui
## Como fazer (passo a passo real)
## Permissões necessárias
## Depende de / Interfere em   (outras telas, serviços, integração Conta Azul)
## Arquivos no código   (frontend e backend)
```

**Abas a cobrir (todas, do menu):** Dashboard, Catálogo, Pedidos, Rel. Pedidos, Rel. Vendas, Delivery, Rota, Leads, Atendimentos, Análise IA, Clientes, Embarque, Entregas, Caixa, Despesas, Auditoria de Entregas, Contas a Receber, Produtos, Vendedores, Mensagens Agendadas, Veículos, Sincronizar, Currículos, PCP (Itens, Receitas, Ordens, Painel, Calendário, Estoque PCP, Sugestões, Dashboard), Estoque (Posição, Ajuste, Histórico), Configurações (Gerais, Preços, Bancos, Metas, Categorias).

**Regras:**
- Faça uma análise COMPLETA de cada aba; **não invente** telas/fluxos — confirme no código.
- Ao atualizar um manual já existente, **não remova itens importantes**; só edite o que mudou.
- Use `.agent/skills/*/SKILL.md` como apoio técnico, mas o manual da aba é o passo a passo de USO + o que ela afeta.

**Comece** listando as abas e me mostrando o manual de UMA aba (ex.: Pedidos) para eu validar o formato antes de gerar todas.
