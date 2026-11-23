# Roteiro de QA — rodada 8: carga já separada não aceita mais pedido

Regras do ambiente: as mesmas de `QA-ROTEIRO.md` (leia "Regras do ambiente" e "Material reaproveitável"). Banco `hardt_local` (produção NUNCA). Você não corrige código, não commita, não faz `git add`. PORTAS: outro QA usa 3200/4190 e há um `node` de outra sessão na 3000: suba o SEU backend na porta 3300 e o servidor do front em porta livre (ex.: 4300). Não derrube processo que não seja seu. No fim: desligue seus servidores, apague TODO dado de teste (cargas/separações/conclusões/usuários/pedidos alterados), restaure os pedidos ao estado inicial e confirme com contagens.

## Regra (pedido do dono, 23/11/2026)
"Depois de ter separado a carga não pode mais adicionar pedidos a essa carga, terá que fazer uma nova carga. E avisar porque não pode incluir mais um pedido." "Separada" = existe conclusão em `separacao_carga_conclusoes` (a Separação concluída). Separação só iniciada NÃO trava.

## O que mudou (não commitado; `git diff`)
Backend: `backend/services/cargaSeparadaGuard.js` (novo), `backend/routes/embarques.js` (`POST /:id/pedidos`), `backend/routes/embarquesMapa.js` (`POST /aplicar-divisao`): 409 `{ error:'Esta carga já foi separada na câmara fria, então não dá mais para incluir pedidos nela. Crie uma nova carga para este pedido.', codigo:'CARGA_JA_SEPARADA', embarqueId, numero }` (+ `cargasSeparadas`, `conflitos` no mapa). Frontend: `frontend/src/pages/Admin/Embarques/MapaExpedicao.jsx` (toast único de 10 s, NÃO recarrega o mapa nem limpa o rascunho), `AdicionarPedidosModal.jsx` (toast 10 s), `ConferenciaCargaPanel.jsx` (aviso "Carga já separada").

## Cenários (CLICANDO, desktop 1280px e celular 375px; evidência = texto do DOM, resposta de API, banco, captura `R8-*`)
1. **Modal "Atrelar Notas FATURADAS"** (Embarque → carga → Adicionar pedidos): em carga SEM separação, atrelar funciona como antes. Em carga com separação CONCLUÍDA (crie a conclusão no `hardt_local`: linha em `separacao_cargas` + `separacao_carga_conclusoes` para o `embarqueId`, ou use a tela de Separação para concluir de verdade), selecione um pedido e confirme: aparece o toast com a mensagem COMPLETA e legível (~10 s), o pedido NÃO entra na carga (confira no banco `pedidos.embarque_id`), e o modal não quebra. Em carga com separação INICIADA e não concluída: atrelar funciona.
2. **Mapa das Entregas**: arraste um pedido para a carga já separada e aplique: toast único com a mensagem + "Carga já separada: #N", o mapa NÃO recarrega e o rascunho continua na tela; depois mova o pedido para outra carga (sem separação) e aplique: passa. Um 409 comum (outro tipo de conflito de arranjo) continua com o texto antigo e recarregando o mapa. Tirar pedido de carga separada (destino nenhum) continua funcionando.
3. **Conferência por bipe** (painel da carga): bipar um pedido que não está na carga separada e "adicionar à carga": aviso vermelho "Carga já separada" com a mensagem inteira, fixo no painel, sem cortar.
4. **Carga nova com o mesmo pedido** (Embarque → Nova carga → atrelar o pedido) continua funcionando; remover pedido de carga separada continua funcionando.
5. **Mobile 375px** dos toasts/avisos: sem scroll horizontal, texto legível.
6. **Regressão rápida:** Embarque abre normal (lista, detalhe de carga, conferência por bipagem, versão e QR), Mapa das Entregas abre, Separação continua funcionando.
7. **Amostras** (comportamento esperado, só registrar): amostra pode entrar em carga separada (não bloqueada por decisão); diga o que viu.

## Relatório (curto)
Tabela cenário → PASSOU / FALHOU / NÃO TESTEI com evidência. Cada falha: passos e o que apareceu. O que não conseguiu testar. Confirme limpeza e servidores desligados.
