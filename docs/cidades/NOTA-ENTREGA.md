# Nota de entrega — Padronização de cidades (fase 2 estendida + fase 4)

**Veredito do gerente de entrega (14/09/2026): LIBERADO COM PENDÊNCIA.**

## O que mudou (no uso)
- **Campo Cidade virou lista com busca** em Novo Cliente, ficha do cliente, novo lead (Rota) e editar lead (Leads).
  Escolhendo da lista, a cidade entra com a grafia exata que já existe ("Itapoá", "Jaraguá do Sul").
  Cidade que ainda não existe entra pelo botão **Usar "…"** (ou Enter) e é arrumada sozinha (Sao bento do sul → Sao Bento do Sul).
  Se a lista não carregar, o campo segue aceitando texto — o cadastro nunca trava.
- **Cidade que vem da consulta por CNPJ** já entra arrumada (a Receita devolve em MAIÚSCULO).
- **Todos os menus com busca do app ignoram acento e maiúscula**: "itapoa" acha "Itapoá", "acucar" acha "Açúcar".
  Vale também para a busca de cliente e de produto dentro do Novo Pedido.
- **Editar lead agora exige cidade** (mesma regra do novo lead).
- **Backfill (só rota de administração, ainda NÃO rodado em produção):** aceita lista aprovada, apelidos de erro de digitação,
  regra "somar" para metas por cidade em duplicidade, snapshot de reversão com cada registro alterado, reversão por arquivo,
  uma transação por tabela com timeout de 20 s.
- Manuais do Clippy (clientes, leads, rota) e página de novidade (`novidade-cidades.html`, registrada em `novidades.json`).

## O que foi testado e por quem
- **Dev:** backfill em banco local (dry-run, aprovado divergente, real com somar/apelido/aprovado, idempotência, reversão) — detalhado em `STATUS.md`.
- **QA (clicando):** campo Cidade nos 4 cadastros, "Usar …", busca sem acento nos menus e no Novo Pedido — PASSOU COM RESSALVAS.
  As 2 ressalvas foram corrigidas (Esc no ComboBusca agora limpa a busca; "Informe a cidade" ao editar lead), **sem reteste do QA** — conferidas por leitura do código pelo gerente.
- **Revisor:** aprovado; ressalvas corrigidas (Novo Pedido sem acento; rota duplicada `/clientes/cidades` removida).
- **Gerente:** `npm run build` ✓ (5,1 s); `node --check` no service e no adminExec ✓; dicionário do frontend idêntico ao do backend ✓;
  `chaveBusca`/`normalizarCidade` testadas em node ("ITAPOA" → "Itapoá", "SAO BENTO DO SUL" → "Sao Bento do Sul"); snapshot em `../uploads` (volume) ✓;
  5 transações com `timeout 20000 / maxWait 10000` ✓; nenhum segredo no diff ✓; novidade sem `og:image`, sem "Abrir o app", accordions abertos, 9 telas com 14 legendas ✓.

## O que o dono precisa conferir (1 minuto, depois do deploy)
1. Clientes → Novo Cliente → tocar em **Cidade**, digitar `itapoa` → deve aparecer "Itapoá"; digitar uma cidade inventada → aparece **Usar "…"**.
2. Com a lista aberta, apertar **Esc** e abrir de novo → a busca deve vir vazia.
3. Leads → editar um lead, apagar a cidade e salvar → deve avisar "Informe a cidade".

## Pendente / fora desta entrega
- **Backfill em produção NÃO rodou.** Depende de: aprovação da lista de cidades pelo dono → dry-run → aplicar → publicar de novo → `GET /backfill-cidades-snapshots` ainda listar o arquivo (prova de que o snapshot sobreviveu ao deploy).
- **Comissão retroativa**: após o backfill, decidir se recalcula meta/bônus dos meses em que a grafia divergente zerou o realizado por cidade.
- Reteste do QA nos 2 pontos corrigidos (Esc e validação) — cobertos pela conferência do dono acima.
- Achado do QA, fora do escopo, **não incluído**: `frontend/src/pages/PCP/EtiquetaForm.jsx:295` usa Fragment nas opções e deixa o menu de produto vazio (ver memória "SelectBusca: Fragment = menu vazio"). Abrir tarefa própria.
- Ajuste pequeno para a próxima vez que tocar: rótulo "Cidade" do editar lead sem `*` apesar de obrigatório; `STATUS.md` ainda diz "Fase 4 não iniciada".
