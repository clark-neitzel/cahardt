# Nota de entrega — Clippy ligado/desligado por usuário

**Data:** 07/10/2026
**Veredito do gerente de entrega:** LIBERADO (ver seção "Pendências" no fim)

---

## O que mudou

Agora dá para **desligar o Clippy (o balão de ajuda do canto da tela) para uma pessoa específica**.

- **Onde fica:** Admin → Usuários → ícone de escudo do usuário (Permissões) → seção **Acesso e Conta** → cartão **"Assistente Clippy"**, logo abaixo de "Barra de Visitantes Online". Também aparece se você digitar "clippy" na busca do painel.
- **Nada muda para ninguém hoje:** todo mundo continua vendo o Clippy, exatamente como antes. A chave já aparece **ligada** para todos os usuários, sem precisar mexer em nada.
- **Só desliga um a um:** o interruptor serve para desligar pessoa por pessoa. Não existe "desligar para todos".
- **Administrador sempre vê:** no painel de um admin o interruptor aparece ligado e travado (não dá para desligar). Mesmo que alguém force a chave no banco, o admin continua vendo.
- **Quem está sem o Clippy não recebe o aviso de novidade** (o balão que balança avisando que saiu coisa nova no sistema). Isso está escrito na própria descrição do interruptor.
- **O balão some depois de recarregar:** se a pessoa estiver com o sistema aberto na hora em que você desligar, o balão continua na tela até ela recarregar a página ou entrar de novo. Se ela clicar e perguntar algo antes disso, recebe a resposta "Assistente desativado para este usuário." (sem erro vermelho).
- **Perfis rápidos e "Marcar tudo / Limpar" não mexem nessa chave:** aplicar um perfil ("Vendedor de campo" etc.) ou usar os botões em lote da seção Acesso **não** liga nem desliga o Clippy. Só o interruptor dele.
- O servidor também bloqueia: quem está desligado não consegue usar o assistente nem por fora da tela.
- O manual da aba Usuários (o que o Clippy usa para responder sobre permissões) foi atualizado com essa chave.

## O que foi testado

- **Revisor de código:** aprovou sem defeitos. Conferiu que a regra é a mesma na tela e no servidor ("só desliga se estiver marcada como desligada; ausente = ligada"), que admin passa sempre, que perfis e lote respeitam a chave, e que o manual condiz com o comportamento real.
- **QA clicando na tela (rodada 1, 10 critérios + 1 extra):** desligar esconde o balão e o sistema para de buscar novidades; o servidor responde "desativado" para quem está desligado; religar faz voltar; usuário sem a chave vê; admin com a chave forçada para desligado continua vendo; aplicar perfil / Marcar tudo / Limpar não alteram a chave; histórico do painel mostra a mudança no sentido certo e "Restaurar versão" volta; modal usável em celular (375px); com o sistema aberto na hora de desligar, a pergunta recebe a mensagem amigável. Única reprovação: o interruptor não aparecia dentro da seção Acesso e Conta (só na busca) — corrigido na rodada 2.
- **Rodada 2 (cartão na seção Acesso e Conta):** capturas de tela do cartão em usuário comum (ligado), em admin (ligado e travado), na busca "clippy" (um resultado só, sem duplicar) e em celular.
- **QA focado (rodada 3) — PASSOU:** clicou no interruptor do próprio cartão → Salvar → banco gravou desligado → clicou de novo → Salvar → banco gravou ligado; no admin o clique não gera alteração. Capturas r3-1 a r3-5. Com isso a condição do gerente foi atendida e a entrega está liberada.
- **Gerente de entrega:** rodou o build do frontend (passou), leu o diff inteiro, conferiu que só o Clippy consome as rotas bloqueadas (o bloqueio não afeta nenhuma outra tela), que o histórico de permissões não registra mudança falsa para usuários antigos, e que nenhum segredo entrou no código.

## O que você precisa saber / conferir

Nada obrigatório. Se quiser ver em um minuto depois de publicar: Admin → Usuários → escudo de qualquer usuário comum → Acesso e Conta → o cartão "Assistente Clippy" aparece ligado. Desligue, salve, entre como aquele usuário no computador: o balão do Clippy não aparece. Religue depois.

## Pendências / o que ficou de fora

- **Sem anúncio no grupo do WhatsApp**, de propósito: é um ajuste administrativo que só o admin usa; a equipe não vê diferença nenhuma (decisão do plano, e concordo).
- **Conferência em produção após o deploy** (só você consegue): abrir o painel de um usuário comum e ver o cartão ligado. Não há arquivo gravado nem migração — risco baixo.
- Detalhe cosmético, sem impacto: como a chave vem ligada para todos, o contador "N permissões ativas" do painel passa a contar uma a mais para cada usuário.

## Arquivos que entram no commit

- `backend/routes/copiloto.js` — bloqueio no servidor (403) para quem está desligado; admin sempre passa
- `backend/manuais/abas/vendedores.md` — manual da aba Usuários (Clippy) com a chave nova
- `frontend/src/App.jsx` — não monta o Clippy para quem está desligado
- `frontend/src/components/Clippy/Clippy.jsx` — mensagem amigável quando o servidor responde "desativado"
- `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` — chave `Pode_Ver_Clippy` (padrão ligada, fora de perfis/lote), cartão na seção Acesso e Conta, entrada na busca, admin travado
- `docs/propostas/PLANO-clippy-por-usuario.md` — plano do arquiteto (recomendo incluir, para ficar o registro das decisões)
- `docs/nota-entrega-clippy-por-usuario.md` — esta nota

Fora do commit (alheios a esta entrega): `docs/proposta-central-cobranca.html`, `docs/proposta-layout-mapa-entregas.html`, `docs/qr-site-congelados.jpg`, `skills/`.
