# Roteiro de QA — Conferência da Carga pelo motorista (rodada 6)

Rota `/conferencia-motorista`. Especificação: `PLANO.md` (o ADENDO no fim prevalece; critérios na seção 11; offline no adendo B).
Regra de visibilidade: **admin vê todas as cargas pendentes; não-admin só onde `Embarque.responsavelId` = ele**.

## Regras do ambiente
- Trabalhe em `~/Projetos/CA-Hardt` (nunca na pasta do Google Drive). Você NÃO corrige código, NÃO commita, NÃO faz `git add`.
- Banco local `hardt_local` (produção NUNCA). O backend local não sobe backup ao Drive em localhost (confira no log). Há OUTRA sessão com `node` na porta 3000: não derrube; suba o seu backend em porta livre (ex.: 3100) e aponte o proxy do front para ela.
- Ao final: desligue os SEUS servidores e desfaça TODO dado de teste (`conferencia_motorista_*`, separação de teste, usuários de teste, fila de impressão de teste, itens `r6qa-*` e qualquer pedido/embarque que alterar). Confirme: 26 pedidos das cargas 2427/2428 em `PENDENTE`.
- Arquivos de OUTRA sessão no `git status` (CLAUDE.md, ContasPagarPage.jsx, manuais de contas-a-pagar/rh/curriculos, fornecedorPessoaService.js, docs soltos): ignore.

## Material reaproveitável (scratchpad)
`/private/tmp/claude-501/-Users-clarksonneitzel-Library-CloudStorage-GoogleDrive-clarksonneitzel-gmail-com-Meu-Drive-appsheet-Conta-Azul-CA-Hardt/f097c5cc-b30f-470e-9f65-cbbb2d7bedea/scratchpad/`: `lib.js`, `tokens-sepcarga.js`, `srv.js`, `puppet/node_modules/puppeteer-core`, `c/` (roteiros de offline com dois builds c1–c5.js), `conf-setup.js`, `conf-t1.js`…, `tokens-conf.json`. Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (headless). Cargas locais com pedidos: 2427 e 2428 (pedidos sem itens: insira itens temporários `r6qa-` e remova no fim). Crie usuários de teste: motorista A (responsável de uma carga), motorista B, admin, usuário sem permissão; ligue `Pode_Conferir_Carga_Motorista` (melhor pela tela de permissões).

## Pontos de costura para caçar (divergências do backend que o front pode não tratar)
`estado.conclusao.resumo.faltas[].conferido` (a Separação usa `separado`); o motivo em `avisosSeparacao` pode ser `NAO_TEM` (toques da conferência só aceitam `NAO_VEIO|VEM_DEPOIS`); `/resumo` só traz `modo/conferidaEm/conferidaPorNome` quando CONFERIDA; o chip só aparece para pedido com bolsas gravadas ou linhas de escopo PEDIDO (modo CARGA não gera chip); `faltas[].motivo` pode ser null.

## Cenários (prove CLICANDO, celular 375px; evidência = texto do DOM, chaves do localStorage, resposta de API, captura)
1. **Permissão:** sem ela o item some do menu e a rota mostra "Acesso Negado"; ligar em Vendedores → Permissões (Logística, "Conferir Carga (Motorista)") libera sem exigir Executar_Entregas/Embarque; admin sempre entra. O botão "Conferir carga" aparece no header de `/minhas-entregas`. Perfil motorista só 'Vendas/Financeiro' enxerga a Logística com o item.
2. **Visibilidade:** A só vê a dele, só com pedido pendente; B não vê a de A; admin vê todas com o nome do motorista; carga 100% entregue some. Reatribuir o responsável com a tela aberta → 403 `CARGA_DE_OUTRO_MOTORISTA`: "Esta carga é de outro motorista.", guarda os toques, não insiste.
3. **Carga inteira:** LEVAR/CONFERI/FALTA, "Conferi tudo", −/+, digitar número, motivos "Não veio"/"Vem depois", "Ficou faltando", concluir (aviso de linhas não tocadas). Nenhum número "separado" em tela.
4. **Por pedido:** ordem Da carga/Por cidade/Eu escolho (persiste); bolsas 0–20; "Imprimir N etiquetas" gera trabalhos origem `CONFERENCIA` ("BOLSA i de N", em ordem); impressora no SelectBusca lembrada; concluir.
5. **Aviso da separação:** monte falta na Separação (usuário da separação) nos dois níveis (produto e pedido) e confira "Separação avisou: faltam N — vem depois / não tem" nas linhas, inclusive `NAO_TEM`; NENHUM número separado na tela, no `localStorage` nem no `/baixar`. Mudança SÓ nos avisos NÃO dispara o modal "A carga mudou".
6. **Offline (requisito duro do dono):** baixar, desligar a rede, tocar, F5 e reabrir (`/` e `/conferencia-motorista`) volta na MESMA carga com os toques; religar → envia sozinho sem duplicar; etiquetas pedidas offline só saem em "Imprimir agora". Faixa verde só com `garantirOffline ok:true` (build de PRODUÇÃO com service worker, não vite dev); âmbar caso contrário; id do build no painel da barra.
7. **DOIS builds** (PLANO, adendo B, itens 1–7 e variantes i–iv) com a Conferência de ponta a ponta: build N → muda algo visível → build N+1 na mesma porta → atualizar pelo caminho normal (↻ e só reabrir) → servidor DESLIGADO → fechar e reabrir → a Conferência abre na mesma carga com os toques e mostra o id N+1. Também a Separação.
8. **Dois aparelhos** (ou motorista + admin) na mesma carga: último toque por linha vence; linhas diferentes se preservam.
9. **"A carga mudou" no meio** (escritório muda um pedido): modal aparece, resto coerente; **carga entregue no meio**: fecha e avisa sem perder o não enviado.
10. **Embarque:** concluir → selo "Conferida por X HH:MM · N faltas" no card (desktop e mobile) e no modal; carga com pedido entregue ou saída antiga e sem conclusão → "Saiu sem conferência"; derrubar `/resumo` (simule falha) → o Embarque abre normal.
11. **Cartões da entrega:** "N bolsas · Faltou: …" em Meu Roteiro e Rota → Entregas; pedido sem conferência não mostra nada; roteiro não quebra.
12. **375px:** header do Meu Roteiro com os 3 itens (restantes, Conferir carga, Folha) sem scroll horizontal; conferência com A+ no máximo e barra fixa; botões ≥44px; tela "Sem conexão" mostra a linha nova sobre abrir a carga com internet.
13. **Regressão (OBRIGATÓRIA — a Separação está em uso pelo dono):** lista só pendentes, separar, por pedido, bolsas, etiquetas, concluir, offline completo, aviso "a carga mudou", cargas entregues somem; textos e botões idênticos aos de antes (compare com um build do HEAD num servidor à parte no scratchpad); login, logout, 401, `TelaSemConexao` em outra rota sem rede, conferência da doca por bipagem, versão/QR do Embarque, menu por perfil, `novidade-conferencia-motorista.html` abre e `novidades.json` é JSON válido.

## Relatório (curto)
Tabela cenário → PASSOU / FALHOU / NÃO TESTEI com evidência (capturas em `~/Projetos/CA-Hardt/docs/conferencia-motorista/qa/` prefixo `R6-`). Cada falha: passos para reproduzir e o que apareceu. Diga o que NÃO conseguiu testar. Confirme servidores desligados, dados de teste removidos, banco restaurado.
