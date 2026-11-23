# Roteiro de QA — rodada 7 (reteste das correções)

Mesmas regras de ambiente do `QA-ROTEIRO.md` desta pasta (leia a seção "Regras do ambiente" e "Material reaproveitável": banco `hardt_local` nunca produção, seu backend em porta livre, não derrube o `node` da porta 3000 de outra sessão, não editar código, não commitar, limpar TODO dado de teste ao final e confirmar 26 pedidos de 2427/2428 em `PENDENTE`). Testar em build de PRODUÇÃO (com service worker), celular 375px. Capturas em `docs/conferencia-motorista/qa/` com prefixo `R7-`.

Mudou (não commitado; `git diff`): `PainelMotorista.jsx` (botões do header), `separacaoCarga.css` (linha de ações `.acts`/`.tudo`), `useSeparacaoCarga.js` (etiquetas offline `exigeToque`, faixa `garantirOffline` com último ok guardado em `localStorage` chave `hardt:offline-casca-ok`), `PainelEmbarque.jsx` e `DetalhesCargaModal.jsx` (resumo sem bloquear o carregamento), `textos.js`/`ConferenciaMotoristaPage.jsx` (aviso de amostras), `TelaSemConexao.jsx`.

## Cenários
1. **D1:** Meu Roteiro (`/minhas-entregas`) em 375px com a permissão de conferir e com pedidos: o botão "Conferir carga" legível (texto branco sobre verde), alinhado com "Folha", ambos ≥44px, sem scroll horizontal. Compare com a captura antiga `R6-12-minhas-entregas-375.png`.
2. **D2:** Separação E Conferência, 375px, letra padrão e A+ no máximo, carga inteira e por pedido: o botão "✓ …tudo" aparece inteiro (pode descer para a linha de baixo), sem scroll horizontal e sem texto cortado ("✓ Co…"). Em desktop/tablet a linha continua igual à de antes (compare com o build do HEAD num servidor à parte no scratchpad). Os botões −/+ continuam do mesmo tamanho.
3. **D3 (o mais importante):** pedir etiqueta de bolsa (a) sem rede de verdade (servidor desligado) e (b) com a rede "ligada" mas a API bloqueada (simula Wi-Fi sem saída). Voltar o sinal e esperar >60 s: NENHUM job de impressão pode ser criado sozinho; a faixa amarela mostra "Imprimir agora"; ao tocar, sai exatamente 1 job. Repetir na Separação (origem SEPARACAO) e na Conferência (origem CONFERENCIA). Verifique no `localStorage` `:estado` que o item da fila tem `exigeToque:true`. Também: com rede normal, pedir etiqueta continua imprimindo na hora (sem exigir toque extra).
4. **D4:** abrir a carga com rede (faixa verde); cortar a rede (modo avião E "Wi-Fi sem saída"); fechar e reabrir: a faixa continua VERDE no mesmo build. Apagar a chave `hardt:offline-casca-ok` (ou trocar de build com a rede cortada): âmbar. Com rede, o resultado real prevalece.
5. **Embarque lento:** atrasar 10 s ou derrubar `/api/conferencia-motorista/resumo`: a lista e o modal da carga abrem sem esperar; o selo aparece depois ou nunca; sem erro na tela.
6. **Aviso de amostras:** na Conferência o texto diz "confira à parte"; na Separação continua "separe à parte".
7. **Regressão rápida da Separação e da Conferência:** carga inteira, por pedido, bolsas, concluir, offline com reabertura sem servidor (build N → N+1 já foi provado, basta uma reabertura offline), selo no Embarque, chip na entrega.

## Relatório (curto)
Tabela cenário → PASSOU / FALHOU / NÃO TESTEI com evidência e capturas `R7-`. Cada falha: passos e o que apareceu. Diga o que não testou. Confirme servidores desligados e banco restaurado.
