# PLANO: Clippy ligado/desligado por usuário (07/10/2026, arquiteto)

## Objetivo
Chave por usuário em Admin → Usuários → Permissões controlando se a pessoa vê o assistente Clippy. Todos continuam vendo (comportamento atual); a chave serve para DESLIGAR. Admin sempre vê.

## Decisões
- **Chave:** `Pode_Ver_Clippy`, semântica "ausente = true; só `=== false` desliga". Regra única nos dois lados: `admin === true || Pode_Ver_Clippy !== false`. Nunca usar `!!` ou `!perm`.
- **Painel (`PermissoesModal.jsx`):** `DEFAULT_PERMISSIONS.Pode_Ver_Clippy = true` (senão o switch aparece desligado para todos, pois `getBoolPath` faz `!!undefined`); entrada no `BOOL_INDEX` seção `acesso` com `noBulk: true` (senão perfil rápido / "Marcar tudo" / "Limpar" desligam o Clippy). O `ToggleIndex` genérico já renderiza o switch. Não entra em `PERFIS.chaves`. Sem backfill.
- **Backend espelha:** `backend/routes/copiloto.js` ganha `router.use` antes de `/status` e `/chat`: se `admin !== true && perms.Pode_Ver_Clippy === false` → `403 { error: 'Assistente desativado para este usuário.' }`. Grep de consumidores de `/api/copiloto` antes de fechar.
- **App.jsx:801:** `{(isAdmin || user?.permissoes?.Pode_Ver_Clippy !== false) && <Clippy />}` — desmonta o componente (sem fetch de novidades.json). `Clippy.jsx` não muda.
- **Efeito colateral:** quem está sem o Clippy não recebe o aviso de novidade (balão). Dizer isso na descrição do switch e no manual.
- **Manual:** `backend/manuais/abas/vendedores.md`, parte de Permissões/Acesso: chave "Assistente Clippy" (ligada para todos, só desliga individualmente, fora de perfis/lote, admin sempre vê, sem avisos de novidade quando desligado). Tabela ABAS não muda.
- **Novidade para o grupo:** NÃO (ajuste administrativo, só o admin usa).
- **Aba aberta:** o balão some só após recarregar/relogar; clique antes disso recebe 403 e o Clippy deve mostrar mensagem amigável (não tela vermelha).

## Arquivos
- `backend/routes/copiloto.js` (guard + comentário do cabeçalho)
- `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` (DEFAULT_PERMISSIONS ~151, BOOL_INDEX ~244)
- `frontend/src/App.jsx` (~801)
- `backend/manuais/abas/vendedores.md`

## Critérios de aceite (QA clicando)
1. Permissões de usuário comum antigo → seção Acesso: switch "Assistente Clippy" LIGADO sem ninguém mexer; busca "clippy" acha o item.
2. Desligar + Salvar → logar como ele em ≥1280px: balão não aparece; sem chamadas a /novidades.json nem /api/copiloto.
3. Com o token dele, POST /api/copiloto/chat e GET /api/copiloto/status → 403 com a mensagem.
4. Religar + Salvar → após recarregar o Clippy volta e /chat responde 200.
5. Usuário sem a chave no JSON / criado novo: vê o Clippy.
6. Admin com `false` gravado à força: continua vendo e a rota responde.
7. Aplicar perfil "Vendedor de campo" e "Marcar tudo/Limpar" da seção Acesso: Clippy DESLIGADO continua desligado; ligado continua ligado.
8. Histórico do painel mostra "Assistente Clippy" no sentido certo; "Restaurar versão" volta.
9. Mobile (<lg): igual a hoje; modal de permissões usável em 375px.
10. Build passa.

## Porte: pequeno (mas mexe em permissões → QA + revisor + gerente).

## Status
- [x] dev-backend
- [x] dev-frontend
- [x] dev-frontend — rodada 2: cartão na seção Acesso
- [x] qa-testador (rodada 1: 9/10 + extra; reprovou só o cartão na seção; rodada 3 focada: PASSOU)
- [x] revisor-codigo (aprovado sem defeitos)
- [x] gerente-entrega — LIBERADO (docs/nota-entrega-clippy-por-usuario.md)
