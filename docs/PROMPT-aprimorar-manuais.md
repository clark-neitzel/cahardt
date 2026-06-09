# Prompt — Aprimorar os manuais (completude + sub-abas + permissões)

> **Por quê:** o Clippy responde com base nos manuais. Hoje faltam funções/sub-abas em alguns manuais e as permissões não batem com o código (o Clippy chega a negar coisas que o usuário PODE fazer, ex.: motorista registrando entrega).
>
> **Como usar:** abra a conversa dos manuais e cole o texto abaixo (a partir de "Você vai aprimorar...").

---

Você vai aprimorar os manuais das abas do app CA-Hardt (em `backend/manuais/abas/*.md`) e o assistente Clippy. Escreva em português simples (o dono é leigo). Baseie-se SEMPRE no código real, nunca invente.

**PARTE 1 — Completude (todas as funções + todas as sub-abas)**
Para cada aba, abra o componente em `frontend/src/pages/...` e garanta que o manual cubra:
- TODAS as funções/botões/ações da tela (criar, editar, filtrar, buscar, imprimir, exportar, dar baixa, aprovar, reverter, excluir, etc.), com o passo a passo real de cada uma.
- TODAS as sub-abas/abas internas da tela. Ex.: a tela **Rota** tem as sub-abas "Atendimento", "Atendidos", "Entregas" e "Entregues" — documente cada uma (o que é e como usar). Faça o mesmo em qualquer tela que tenha abas internas.
- Na seção "## Como fazer (passo a passo real)", use um subtítulo por função, em ordem, com passos numerados.

**PARTE 2 — Permissões corretas**
Fontes da verdade:
- `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` → objeto `DEFAULT_PERMISSIONS` tem TODAS as chaves. ATENÇÃO: `catalogo`, `pedidos`, `rota`, `clientes`, `produtos`, `vendedores`, `sync`, `configuracoes` são OBJETOS `{ view, edit, ... }`; `estoque` é array; `pcp` é objeto; o resto são booleanos (ex.: `Pode_Executar_Entregas`).
- `frontend/src/contexts/AuthContext.jsx` → `hasPermission(tab, action='view')` (admin libera tudo; objeto → usa `[action]`, padrão `view`).
- `frontend/src/App.jsx` → cada `<Route>` usa `<PrivateRoute tab="<perm>">` (qual permissão libera VER a tela).
Para cada manual, reescreva "## Permissões necessárias" com a verdade: qual permissão VÊ a tela e qual permissão libera cada AÇÃO (use os nomes reais das chaves).

**PARTE 3 — Telas que faltam**
Há telas no código sem manual (não aparecem no menu lateral). Caso crítico conhecido: **"Minhas Entregas (Motorista)"** — `/minhas-entregas` (`PainelMotorista`), permissão `Pode_Executar_Entregas` — onde o motorista **registra e dá baixa em entregas** (também pela sub-aba "Entregas" dentro da tela Rota). Crie o manual que faltar e documente esse fluxo. Procure outras telas fora do menu e cubra também.

**PARTE 4 — Atualizar o Clippy (código), em `backend/services/copilotoService.js`**
- Tabela `ABAS`: adicione as telas que faltam (ex.: minhas-entregas) e permita MAIS DE UMA permissão por aba (acesso se QUALQUER uma valer). Ex.: entregas acessível a quem tem `Pode_Ver_Todas_Entregas` OU `Pode_Executar_Entregas`.
- Função `podeAcessar`: corrija para espelhar o `hasPermission` — para chaves objeto `{ view, edit }` (catalogo, pedidos, rota, clientes, produtos, vendedores, sync, configuracoes) checar `.view` (NÃO "qualquer campo truthy", senão `clientes:"vinculados"` engana); `estoque` (array) tem itens; `pcp` (objeto) algum `true`; boolean → o valor; `admin` → libera tudo.

**No fim, me mostre:** lista de manuais alterados, sub-abas documentadas, manuais novos criados, e o diff de `ABAS` + `podeAcessar`.
