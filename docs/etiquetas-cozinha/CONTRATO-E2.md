# Contrato E2 (backend) — Etiquetas da Cozinha

Base: `PLANO-ARQUITETO.md` 2.5. Rotas em `/api/pcp/etiquetas-cozinha` (JWT; permissão `admin || pcp.etiquetas`, senão `403 {error}`). Erros: `{ error }` em português. Evidências: `docs/etiquetas-cozinha/evidencias-e2/`.

## Respostas (onde o plano deixava em aberto ou onde há acréscimo)
- `GET /itens?grupo=RECHEIO|MASSA|OUTRO|FAVORITOS|TODOS&busca=` → **`{ itens:[{id,codigo,nome,tipo,unidade,grupoCozinha,origem,validadeRefrigeradoDias,validadeCongeladoDias,ultimoTamanho,ultimaConservacao}], contadores:{FAVORITOS,RECHEIO,MASSA,OUTRO,TODOS} }`**. `grupoCozinha` vem sempre preenchido (item sem grupo = `OUTRO`). Contadores **não** dependem da busca. `grupo` inválido = 400. Prazos `null` = item sem prazo cadastrado.
- `GET /favoritos` → **`{ itens:[...mesmo formato], fonte:'USUARIO'|'GERAL' }`** (objeto, não array; `GERAL` = fallback quando o usuário não etiquetou nada em 30 dias).
- `GET /equipe` → `{ equipe:[{id,nome,iniciais,eu}] }` (o usuário logado sempre primeiro, `eu:true`). Inclui vendedores ativos com `pcp.etiquetas` **e administradores ativos**.
- `GET /hoje?data=` (padrão hoje) ou `?de=&ate=&itemPcpId=` → `{ data, lotes:[{id,lote,loteData,itemPcpId,nomeImpresso,fabricacao,validade,validadeDias,validadeAlterada,conservacao,pesoGramas,quantidade,tamanho,impressoraId,responsavelId,responsavelNome,criadoPorNome,reimpressoes,createdAt,statusImpressao,erroImpressao}], totais:{lotes,etiquetas} }`. `data` é `null` no modo histórico. `statusImpressao` = status do trabalho mais recente do lote (`PENDENTE|ENVIANDO|IMPRESSO|ERRO|EXPIRADO|CANCELADO`) ou `null`. Máx. 500 lotes. Datas inválidas = 400.
- `POST /imprimir` body como no plano (`requisicaoId` 8..80 `[A-Za-z0-9-]`; `itemPcpId` **ou** `nomeLivre`; `fabricacao`; `conservacao`; `validadeDias` **ou** `validade`; `pesoGramas?` inteiro em GRAMAS; `quantidade` 1..200; `tamanho`; `impressoraId?`; `responsavelId`).
  - `201` primeira vez; **`200` + `repetido:true`** se o `requisicaoId` já existia (nunca cria 2º lote; se o 1º pedido gravou o lote mas não enfileirou, o retry enfileira).
  - Resp: `{ lote:{...formato acima, statusImpressao}, trabalho:{id,status}|null, agente:{estado:'ONLINE'|'INSTAVEL'|'OFFLINE'}, aviso?, itemCriado?:{id,codigo,nome}, repetido? }`. Acompanhar o andamento com `GET /api/impressao/trabalhos/:trabalho.id` (E1).
  - `aviso` (texto pronto): agente OFFLINE → "O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos."; falha ao enfileirar → lote **fica registrado**, `trabalho:null` e `aviso` explica (usar Reimprimir).
  - `itemCriado:{id,codigo,nome,itemReativado}` vem quando usou `nomeLivre` (item novo **ou** já existente reaproveitado). A busca por nome olha os SUB **ativos** primeiro; se só existir um **inativo** com esse nome, ele é **reativado** (mesmo código, mantém histórico, sem duplicata) e vem `itemReativado:true`.
  - **Idempotência:** `requisicaoId` repetido devolve o lote ANTIGO mesmo que o corpo seja diferente (item, quantidade, datas...). O corpo novo é ignorado; o front deve gerar `requisicaoId` novo a cada intenção de impressão.
  - Erros: `400` validação (mensagens em PT); `409` nenhuma impressora ativa do tamanho (ou impressora com linguagem errada); `400` se houver >1 ativa do tamanho e faltar `impressoraId` (hoje há 1 de cada: não precisa mandar); `503` não conseguiu reservar número de lote.
  - `validadeAlterada` só é `true` quando o item tem prazo sugerido e o prazo enviado difere dele.
- `POST /lotes/:id/reimprimir` body opcional `{quantidade?, impressoraId?, requisicaoId?}` → `201` (ou `200` se o mesmo `requisicaoId` repetir; **front deve mandar um uuid por clique**) `{ lote:{... reimpressoes atualizado}, trabalho, agente, aviso? }`. `404` lote inexistente; `502` se não conseguiu enfileirar. O contador `reimpressoes` é informativo: se o update falhar depois da etiqueta já na fila, responde 201 normalmente.
- `GET /lotes/:id` → `{ lote, trabalhos:[{id,tipo,status,copias,tentativas,erro,pedidoEm,impressoEm,solicitadoPorNome}] }`.

## Itens PCP (`/api/pcp/itens`)
`POST` e `PUT /:id` aceitam `validadeRefrigeradoDias`, `validadeCongeladoDias` (inteiro 1..730, `null`/`''` limpa) e `grupoCozinha` (`RECHEIO|MASSA|OUTRO`, `null`/`''` limpa), **inclusive em item importado** (com produto). Inválido = 400. `GET /api/pcp/itens` já devolve os 4 campos novos (incl. `origem`: `CADASTRO|COZINHA`). `GET /api/pcp/estoque/posicao` **não lista** `origem=COZINHA`.

## Admin
`POST /api/admin-exec/etiquetas-cozinha-classificar[?aplicar=1]` — simulação por padrão; classifica SUB ativo sem grupo cujo nome começa com "Recheio"/"Massa".

## Observações
- Lote `AAMMDD-NN` usa o dia de HOJE (dia da impressão), não a data de fabricação.
- Local (hardt_local) é compartilhado com outros agentes: há impressoras de teste ativas lá; por isso nos testes usei `impressoraId` explícito.
