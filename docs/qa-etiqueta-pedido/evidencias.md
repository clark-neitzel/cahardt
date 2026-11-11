# QA etiqueta do pedido (11/11/2026, hardt_local, Chrome headless)
Veredito: APROVADO COM RESSALVAS (ver observacoes). Scripts em scratchpad da sessao; capturas nesta pasta.
- Normal #136 (3 itens): botao Tag, previa PEDIDO/#136, 1 etiqueta, sem "SEM VALOR COMERCIAL" (01b)
- Especial ZZ#186 com 25 itens: 2 etiquetas (1/2 itens 1-16, 2/2 itens 17-25), 25 `.it` no DOM, sem "+N" (02a); copias 2 => "2 etiquetas x 2 copias = 4"
- POST /api/impressao/etiquetas: chaves origem, requisicaoId, impressoraId, referencia, bitmaps(2), sequencia [0,1,0,1], SEM copias; fila: tipo ETIQUETA_PEDIDO, copias=1, 4 blocos ^XA; duplo clique => 1 POST, botao desabilitado
- Navegador: #area-impressao com 4 .pg, ordem 1/2,2/2,1/2,2/2, app escondido (display none), classe modo-impressao; restaura por afterprint ou 2 toques (1 toque nao basta, por desenho do util)
- Bonificacao: BONIFICACAO + BN#, rodape SEM VALOR COMERCIAL (04). Cancelado (bonif e especial): botao presente e abre (05)
- Amostra: sub-aba (07) e faixa Cargas (08) abrem o modal; SOLICITADA -> PREPARACAO pelo navegador e pela Zebra; PREPARACAO nao muda; pedido normal nao chama etiqueta-impressa
- 403 sem pedidos.view (Producao); copias=2 => 400; indice invalido => 400; sem sequencia => 400; 2 impressoras sem impressoraId => 400
- Mobile 375: sem scroll horizontal (lista, modal, especial), botoes 44px (10a-10d). Fila mostra "Etiqueta de pedido" (11). Build ok.
- Dados restaurados (fila, itens extras, status das amostras).
- Re-teste apos correcao da paginacao (re-*.png): especial 25 itens com nomes MUITO longos => 3 etiquetas 1 coluna, 25 .it, 0 fora da lista, aviso 'sai em 3 etiquetas', nomes truncados com reticencias (1 coluna); #136 => 1 etiqueta; #591 (9 itens, nomes ~34 car.) => 2 etiquetas (8+1); mesmo #591 com nomes <=16 car. => 1 etiqueta 2 colunas sem truncar; AM#50 abre normal. Dados restaurados.
- Re-teste final (re2-*.png): #591 real => 1 etiqueta, 9 itens, 2 colunas, nome ate 2 linhas, 0 sobrepostos/0 fora da lista; ZZ#186 25 itens longos => 2 etiquetas (8 em 1 col + 17 em 2 col), 25 .it, 0 fora/0 sobrepostos, nome max 2 linhas dentro da celula; Zebra ZZ#186 copias 2 => 1 POST (sequencia [0,1,0,1], sem copias), fila 4 blocos ^XA; #136, BN#39, AM#50, cancelado OK sem undefined; mobile 375 sem scroll horizontal. Dados e fila restaurados.
- Re-teste 3 (re3-*.png, codigo com nomeCortaEm1Col): #591 => 1 etiqueta, 1 coluna, 9 itens, 0 fora, sem reticencias; ZZ#186 + nomes 75 car. => 2 etiquetas, 25 .it, ambas 1 coluna (0 paginas de 2 col), 0 .nm acima de 2 linhas, aviso [data-aviso-nome-cortado] exibido. Dados restaurados.
