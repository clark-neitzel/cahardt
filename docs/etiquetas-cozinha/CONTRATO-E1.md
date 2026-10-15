# Contrato E1 (backend) — o que foi implementado e onde difere/estende o plano

Base: `PLANO-ARQUITETO.md` 2.3 e 2.4. Nomes de rota e campos do plano foram mantidos. Só há **acréscimos** e 3 decisões de comportamento que o frontend precisa saber.

## Decisões de comportamento (importam para a tela)
1. **Impressora nasce INATIVA** (`ativa=false`) se o `POST /api/impressao/impressoras` não mandar `ativa`. Motivo: plano, risco 5 (só entra em uso depois do teste aprovado). A tela deve oferecer "Ativar" (PUT `{ativa:true}`) depois do teste.
2. **Teste de impressão funciona em impressora inativa** (trabalho `tipo=TESTE` é entregue ao agente mesmo com a impressora inativa). Trabalho de outro tipo só é entregue se a impressora estiver ativa.
3. **ERRO com tentativas sobrando volta a `PENDENTE`** mantendo o texto do erro em `erro` (o plano já previa o reagendamento). Para a tela: `status=PENDENTE` com `erro` preenchido = "deu problema, tentando de novo".

## Acréscimos (não quebram nada do plano)
- `POST /agentes` e `POST /agentes/:id/rotacionar-token` devolvem também `desinstaladorBat` (texto .bat, CRLF). Resposta: `{ agente, token, instaladorBat, desinstaladorBat }`.
- Item de `GET /agentes`: `{ id, nome, ativo, tokenPrefixo, hostname, versaoAgente, ultimoContato, estado('ONLINE'|'INSTAVEL'|'OFFLINE'), online, impressorasWindows[{nome,driver,porta,padrao,status}], impressorasAtualizadasEm, pedirImpressoras, versaoServidor, desatualizado }`. Nunca traz token nem hash.
- `GET /impressoras` (admin): todos os campos da tabela + `agente:{id,nome,ativo}`, `estadoAgente`, `estadoWindows` (`'Pronta'|'Offline'|...|'nao_listada'`). Não-admin com `pcp.etiquetas`: só ativas e só `{id,nome,tamanho,colunas,estadoAgente,estadoWindows}`.
- `GET /fila`: cada item traz `impressora:{nome}`; aceita `?status=` (valida) e `?limit=` (máx 200). Sem `conteudo`.
- `POST /impressoras/:id/teste` → `201 {trabalhoId}`; `ETIQUETA_EXEMPLO` em combinação inválida (ZPL com 40x25, EPL2 com 100x120) responde `400` com mensagem em português.
- `POST /trabalhos/:id/reenviar` → `201 {trabalhoId}` (`410` se o conteúdo já foi apagado, >7 dias). `POST /trabalhos/:id/cancelar` → `409` se não estiver PENDENTE.
- `GET /trabalhos/:id` para quem tem `pcp.etiquetas` só devolve trabalho que a própria pessoa solicitou (senão `404`).
- Agente: `GET /api/impressao-agente/ping` (auth por token, não reivindica trabalho) — usado pelo instalador para validar a conexão. Rate-limit por IP: 240 req/min (`429`).
- `ImpressaoTrabalho.conteudo` é `Bytes?` (nullable) para o worker poder apagar o conteúdo >7 dias.
- Trabalho `ENVIANDO` sem confirmação >90 s só volta à fila se o agente não o estiver informando em `emAndamento`; passou de `maxTentativas` => `ERRO`; passou da validade => `EXPIRADO`.
- URL do instalador: env `IMPRESSAO_URL_PUBLICA` (se existir) > header `Origin` do navegador > `x-forwarded-host`. Em produção, conferir que o `.bat` baixado aponta para o endereço certo (o mesmo que o iPad usa).
- `ultimoContato` é gravado no máximo a cada 10 s (plano dizia 15 s; 10 s evita a bolinha piscar entre verde e amarelo). O `estado` usa também o último contato em memória, então é preciso.

## Ajustes pós-revisão (nada muda para o frontend)
- Contrato do agente: `POST /trabalhos/:id/resultado` também aceita `status:"EXPIRADO"` (grava `EXPIRADO`).
- Entrega por ciclo caiu de 5 para 2 trabalhos (`LOTE_MAX`).
- Rate-limit do agente agora conta só tentativas com token inválido (30/min por IP → 429); requisição com token válido nunca é limitada.
- O endereço do instalador só é aceito com caracteres `[A-Za-z0-9.:/-]`; se nenhum candidato servir, `POST /agentes` e `rotacionar-token` respondem 500 com mensagem pedindo `IMPRESSAO_URL_PUBLICA` (antes de criar/trocar o token).

## Ajustes pós-QA
- `POST /api/impressao/trabalhos/:id/reenviar` aceita `{ requisicaoId }` no corpo (uuid gerado pelo front a cada clique/intenção; 8 a 80 caracteres `[A-Za-z0-9-]`, senão 400). A repetição do mesmo `requisicaoId` devolve `200 {trabalhoId}` do trabalho já criado (a primeira chamada devolve `201`). Sem `requisicaoId`, o servidor usa uma janela de 5 s por trabalho.
- Agente revogado (`ativo:false`) devolve `estado:"OFFLINE"` na hora (e `online:false`); `estadoAgente` das impressoras dele também.
