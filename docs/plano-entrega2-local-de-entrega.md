# Plano — Entrega 2: "Local de entrega" (arquiteto, 25/11/2026)

**Regra única (sem perguntar ao motorista):** endereço do PEDIDO → local de entrega do CLIENTE → cadastro.
**Inegociável:** (1) nota fiscal NÃO é tocada (cadastro = endereço dos documentos); (2) cliente SEM local de entrega se comporta IDÊNTICO a hoje (rota, motorista, congelados, mapa) — mudança estritamente aditiva, com fallback e flags.

## Descobertas que mudam o desenho
1. Tabela `clientes` está no teto de colunas do Postgres (schema.prisma ~:523) → local de entrega do cliente = **tabela lateral 1-1** (como ClienteGps/ClienteFiscal/ClienteWhatsapp). NENHUMA coluna nova em `clientes`.
2. Também NÃO mexer na tabela `pedidos` (66 colunas, índices que o db push derrubaria) → tabela lateral 1-1 para o pedido.
3. NÃO reaproveitar `ClienteEnderecoLog`/`clienteEnderecoHistoricoService` (snapshot é do CADASTRO; `restaurar()` gravaria em `clientes`). Log próprio: `clientes_local_entrega_log`.
4. Hoje o motorista IGNORA o endereço do pedido do Kit Festa (usa só Cliente.Ponto_GPS/End_*: PainelMotorista.jsx:46-54, embarquesMapa.js:156). Passa a respeitar — só atrás de flag.
5. `EntregarEm.jsx` tem 2 origens (pedido/cadastro) + Retirada; a variante "Local de entrega do cliente" é nova.
6. Regra do Mapa que NÃO quebra: itens do mesmo cliente andam juntos (`chaveLocal` embarquesMapa.js:443; `chaveCliente` MapaExpedicao.jsx:173). Não mexer no agrupamento.
7. Usuário externo (contador) é "nega por padrão" (authMiddleware.js:6-11): rota nova já nasce bloqueada; NÃO adicionar em ROTAS_EXTERNO.

## Modelo de dados (só acrescenta)
**ClienteLocalEntrega** (`clientes_local_entrega`, PK `clienteUuid` FK clientes, Cascade): `ativo` Boolean default true; logradouro, numero, complemento, bairro, cidade, estado, cep, referencia (String?); `pontoGps` String? ("lat,lng"); `selo`, `sugestao` String?, `seloEm` DateTime?; criadoPorId, criadoPorNome, atualizadoPorNome, createdAt, updatedAt. Em `Cliente`: só a linha de relação `localEntrega ClienteLocalEntrega?`.
**ClienteLocalEntregaLog** (`clientes_local_entrega_log`): id, clienteUuid (FK), tipo (CRIACAO/ALTERACAO/DESATIVACAO/PONTO), origem (CADASTRO/MOTORISTA/ANA/…), antes Json?, depois Json, camposAlterados String[], autorId, autorNome, posicaoAutor, motivo, createdAt. `@@index([clienteUuid, createdAt])` declarado no schema.
**PedidoLocalEntrega** (`pedidos_local_entrega`, PK `pedidoId` FK pedidos, Cascade): `modo` String? ('AVULSO' | 'CADASTRO' | null); mesmos campos de endereço + referencia + pontoGps opcionais; `destinoConcluido` String? ('PEDIDO'|'LOCAL_CLIENTE'|'CADASTRO') + `concluidoEm` (carimbo do lugar onde se entregou, gravado no /concluir). Linha só é criada quando destino ≠ CADASTRO ou há avulso. Em `Pedido`: só relação `localEntrega PedidoLocalEntrega?`.
**clientes_gps_sinais**: coluna aditiva `alvo String @default("CADASTRO")` (CADASTRO|LOCAL).
Deploy: `prisma db push` só cria tabelas + 1 coluna com default (seguro, sem --accept-data-loss).
**Flags** (AppConfig, chave `local_entrega_config`, padrão gps_clientes_config, cache 30s, TUDO DESLIGADO por padrão; só admin liga): `editor`, `exibir`, `operacao` (motorista + concluir/voto GPS + Caixa + prioridade), `mapa` (mapa expedição + roteirização). Desligou → consumidor volta ao caminho antigo na hora.

## Função única de resolução (`backend/utils/enderecoEntrega.js`, já existe, puro, com testes)
`resolverLocalEntrega({ cliente, clienteLocal, pedidoLocal, kitFesta })`, ordem:
1. Kit Festa modo=retirada → RETIRADA (já existe em resumoKitFesta)
2. pedidoLocal.modo='AVULSO' → PEDIDO (texto + ponto avulso se houver)
3. pedidoLocal.modo='CADASTRO' → CADASTRO à força
4. kitFesta.enderecoEntrega preenchido → PEDIDO (texto livre, sem ponto)
5. clienteLocal.ativo → LOCAL_CLIENTE
6. senão → CADASTRO
Retorno `{ origem, texto, endereco{...}, ponto, cidade, divergeCadastro }`.
**Regra de ouro do ponto:** GPS vem SEMPRE do mesmo lugar do endereço. PEDIDO usa ponto do avulso ou null; LOCAL_CLIENTE usa ponto do local ou null; NUNCA cai em Cliente.Ponto_GPS.
**Idêntico a hoje:** origem CADASTRO → consumidor roda o código antigo SEM alteração; `localEntrega` só aparece na resposta quando origem ≠ CADASTRO (JSON byte a byte igual p/ quem não tem local).
Carregador em lote `anexarLocalEntrega(pedidos)`: 1 query em pedidos_local_entrega + 1 em clientes_local_entrega (sem N+1).

## Consumidores (resumo; detalhes por fatia)
EntregarEm.jsx (F5) · pedidoService.js:376-381/:996 e deliveryService.js:217-285 (F5) · PainelMotorista.jsx:46-54 e :184 (F6) · routes/entregas.js /pendentes, amostras, /:id, prioridade (F6) · CheckoutEntregaModal.jsx:657-670 AlertaGpsFaltante (F6) · entregas.js:567-800 /concluir e seloEntrega (F2, ALTO) · gpsClientesRoutes.js na-porta + gpsClientesService.js coletarSinais/avaliar/saude (F2, ALTO) · routes/caixa.js:461/:581 selo GPS (F6) · AuditoriaEntregas.jsx / ModalDetalheEntrega.jsx (F6) · embarquesMapa.js:107-171/:234-253/:1058 (F7, ALTO) · MapaExpedicao.jsx:376 gpsAjustado só p/ itens CADASTRO (F7) · roteirizacao.js:75-107/:322 (F7, ALTO) · embarques.js:227, DetalhesCargaModal.jsx romaneio (F8) · etiquetaPedido.js:44-45 (F8) · googleCalendarService.js (F9) · amostras montarAmostra (nível cliente, sem avulso) · NovoPedido.jsx seletor "Entregar em" (F4) · ListaPedidos.jsx detalhe (F4/F5).

## NÃO MUDA (fica no cadastro de propósito)
focusNfeEmissaoService, impressaoLoteService.js:107-108/:347 (DANFE/recibo/pedido impresso), reciboEspecialPdf.js, ImpressaoPedido.jsx, NF de devolução/bonificação, ModalDevolucao · iaClienteService.js e todo /api/ia-consulta/v1 (contrato congelado; local entra na Entrega 3 como campo NOVO) · filtros por cidade/bairro do cadastro (pedidoService.js:199-200, pedidoController.js:1466+) · congeladosService.js e site de Congelados · mapaClientesService, carteiraService, analytics*, leadService, atendimentoService · webhookService.js:412 · validarPedidoEnviar (gpsClientesService.js:637) continua exigindo GPS do CADASTRO · cobrança de rota segue no cadastro (pergunta 1 abaixo).
Também: não mudar chaveLocal/chaveCliente; não alterar criar/atualizar do pedido (pedidoController.js:390/:565, pedidoService.criar :407) nem travas pós-faturamento; sem índice em `pedidos`; sem `<select>` nativo (SelectBusca); sem window.open/iframe; página de novidade sem "Abrir o app" e sem og:image; não afrouxar detecção de checkout em lote do GPS.

## Voto GPS — "Você está na porta?" / Saúde GPS (lógica exata, F2)
Hoje: `coletarSinais` (gpsClientesService.js:172) junta entregas concluídas com gpsEntrega (240 dias), atendimentos do vendedor e "na porta"; tudo vota em Cliente.Ponto_GPS; cliente sem ponto → 1º "na porta" vira o ponto (gpsClientesRoutes.js:166-183).
Regra nova:
1. `/concluir` recebe o destino resolvido (mesmo código/flag `operacao`): CADASTRO → nada muda, não grava linha lateral. LOCAL_CLIENTE → grava destinoConcluido='LOCAL_CLIENTE', selo compara com local.pontoGps (local com texto mas sem ponto → SEM_PONTO e pergunta "na porta"). PEDIDO (avulso/Kit Festa) → destinoConcluido='PEDIDO', NÃO pergunta "na porta" (perguntarNaPorta=false), NÃO reavalia selo.
2. `coletarSinais` do cadastro ignora entregas carimbadas PEDIDO/LOCAL_CLIENTE: `NOT: { localEntrega: { is: { destinoConcluido: { in: [...] } } } }`. PROVAR com query de teste que pedido SEM linha lateral continua entrando (armadilha not/notIn exclui null — ver memória reference_prisma_not_exclui_null). Detecção de "checkout em lote" (:206-233) continua olhando TODAS (anti-engano). Atendimento do vendedor continua no cadastro. "Na porta" alvo=CADASTRO continua como hoje. Entregas antigas (sem carimbo) continuam contando.
3. Função nova `avaliarLocal(clienteUuid)`: sinais = entregas LOCAL_CLIENTE + "na porta" alvo='LOCAL'; mesmo `clusterizar` (3 sinais, 2 dias, 100 m); grava selo/sugestao em ClienteLocalEntrega; não mexe em ClienteGps.
4. `/na-porta` ganha `alvo` (padrão CADASTRO, idêntico a hoje). Motorista só envia alvo=LOCAL quando /concluir devolveu destino 'LOCAL_CLIENTE'; "1º ponto aplica na hora" vale p/ o ponto do LOCAL se existir sem ponto; servidor decide o alvo pelo pedidoId da entrega (não confia só no app); destino PEDIDO → 400 com mensagem clara.
5. Bordas: cliente balcão sem selo/voto; local desativado → pendentes voltam ao cadastro, carimbadas ficam órfãs e ignoradas; DEVOLVIDO não vota; editar avulso→cadastro só enquanto statusEntrega=PENDENTE; 2 pedidos mesmo cliente/dia com destinos diferentes → cada um carimba o seu; entregas antigas em Joinville (legado sem carimbo) continuam sugerindo trocar GPS → F10 reclassifica.
6. `saude()` (:653): KPIs não mudam; sugestão do cadastro some sozinha p/ quem passa a ter entregas carimbadas; lista "locais suspeitos" é aditiva (F10 opcional).

## Telas
- **Cadastro do cliente** (DetalheCliente.jsx, card novo abaixo do endereço ~:1742): selo "🔒 Usado só para documentos e cobrança. A nota fiscal não é alterada por nada abaixo."; toggle "Entrega em outro local"; campos logradouro/número/bairro/cidade/UF/CEP/referência; ponto GPS com geocodificação (reusa gpsClientesService.geocodeEndereco) e mapa; histórico do local. Permissão: PUT texto = admin || Pode_Editar_GPS || clientes.edit (espelha podeEditarCadastroCA :123); PUT só do ponto inclui Pode_Executar_Entregas (espelha podeEditarPontoGps :125). Frontend espelha backend exatamente (permissões são OBJETO, não booleano). NÃO reusar ModalPontoGps (amarrado ao cadastro) → criar `ModalPontoLocalEntrega` (mesmo mapa, validação leve lat/lng).
- **Novo pedido** (NovoPedido.jsx): bloco "Entregar em" só quando o cliente tem local ou o usuário quer avulso; 3 opções: local do cliente (padrão), cadastro, outro endereço. Cliente sem local → bloco não aparece, tudo como hoje. Gravação em 2 passos: criar/atualizar INTOCADOS; depois do criar, frontend chama `PUT /api/pedidos/:id/local-entrega`; se o 2º passo falhar o pedido já está salvo e o toast diz "informe o endereço de novo no pedido". Também no Delivery/Pedidos: ação "Alterar local de entrega" enquanto statusEntrega=PENDENTE e não cancelado (guard de permissão copia deliveryService.setHoraEntrega). PWA mobile 375px.
- **Delivery/Pedidos:** EntregarEm com 3 tags: "Endereço do pedido" (verde), "Local de entrega do cliente" (nova), "Endereço do cadastro" (cinza); aviso amarelo "Diferente do cadastro" vale p/ pedido e local.

## Fatias (cada uma vai ao ar sozinha, flags desligadas)
- **F1 Base invisível (backend):** schema (3 tabelas + coluna alvo) · enderecoEntrega.js `resolverLocalEntrega` + `anexarLocalEntrega` + testes · `services/localEntregaService.js` (obterDoCliente, gravarDoCliente, desativar, gravarPontoDoCliente, gravarDoPedido/limparDoPedido; log fora de $transaction; se transação, {timeout:20000,maxWait:10000}; é o serviço que a Entrega 3 (Ana) chamará: `gravarDoCliente({clienteUuid, endereco, origem:'ANA', autor})` → `{gravado, pontoPendente}`) · rotas NOVAS sem tocar as existentes: GET|PUT|DELETE /api/clientes/:uuid/local-entrega, PUT /api/clientes/:uuid/local-entrega/ponto, PUT|DELETE /api/pedidos/:id/local-entrega, GET|POST /api/local-entrega/config (POST só admin) · bump `deployMarker` em routes/adminExec.js:67. Aceite: flags off → nenhum consumidor da lista alterado no git diff; npm test passa; db push local cria só tabelas.
- **F2 Voto GPS correto (backend, ALTO):** /concluir, na-porta, coletarSinais, avaliarLocal, seloEntrega com ponto alternativo. Flag `operacao`. Vem ANTES do motorista ver o local. Script de cenários: cliente A sem local (idêntico) × cliente B com local.
  - **⚠️ Avisos herdados da F1 (obrigatórios):** (a) quem consumir consulta a flag (`exibir`/`operacao`/`mapa`) ANTES de chamar `anexarLocalEntrega`/usar `localEntrega` — com a flag desligada a resposta tem que ficar byte a byte igual a hoje (o carregador não olha flag). (b) `resolverLocalEntrega` pode devolver LOCAL_CLIENTE com `texto: null` quando o local só tem ponto GPS (e PEDIDO com `ponto: null`) — o consumidor trata texto nulo. (c) **ANTES de qualquer sinal `alvo='LOCAL'` ser gravado**, `gpsClientesService.js` (`coletarSinais`, `clienteGpsSinal.findMany`, ~:246) passa a filtrar `alvo: 'CADASTRO'` — senão o voto do local contamina o ponto do cadastro.
- **F3 Editor do local no cadastro (frontend):** card + ModalPontoLocalEntrega + histórico. Flag `editor` fica OFF até F5-F7 no ar.
- **F4 Local por pedido (frontend):** NovoPedido (só o bloco novo, sem refatorar arquivo de 3.352 linhas), "Alterar local" em Pedidos/Delivery, pedidoService.detalhar devolvendo localEntrega.
- **F5 Exibição (back+front), flag `exibir`:** EntregarEm 3 variantes, deliveryService, pedidoService, ListaPedidos, DeliveryKanban.
- **F6 Motorista (back+front, MÉDIO/ALTO), flag `operacao`, só depois de F2:** entregas.js (/pendentes, amostras, /:id, prioridade), PainelMotorista, CheckoutEntregaModal (alerta GPS e "na porta"), EntregarAmostraModal, caixa.js (selo), AuditoriaEntregas, ModalDetalheEntrega.
- **F7 Mapa e roteirização (ALTO), flag `mapa`:** embarquesMapa.js, roteirizacao.js, MapaExpedicao.jsx. Geocodifica texto do local/avulso; se não achar → "sem localização" com motivo, NUNCA cai no pino do cadastro.
- **F8 Carga/romaneio/etiqueta, flag `exibir`:** embarques.js:227, DetalhesCargaModal, etiquetaPedido.js.
- **F9 Agenda Google:** googleCalendarService.js.
- **F10 (opcional):** botão "Reclassificar entregas anteriores perto deste local" (≤150 m, idempotente, com confirmação e log) + bloco "locais suspeitos" na Saúde GPS.
Fechamento de cada fatia: manuais das abas afetadas (clientes, pedidos, delivery, entregas/minhas-entregas, embarques-mapa, embarque, saude-pontos-gps, caixa, auditoria-entregas) + tabela ABAS do copilotoService se rota/permissão mudar; novidade-<slug>.html com mockups numerados + novidades.json só quando as flags forem ligadas; bump deployMarker.

## Regressão (QA) — critérios
Cliente A (sem local) é a base: salvar JSON de GET /entregas/pendentes, GET /embarques/mapa, POST /roteirizar, GET /pedidos (pág 1), GET /delivery/pedidos, GET /embarques/:id ANTES e DEPOIS de cada fatia → diff vazio para A. Motorista: Maps abre ponto do cadastro como hoje; Saúde GPS: mesmos suspeitos/sugestões; Mapa: mesmos pinos e "mover leva tudo".
Cliente B (local em Joinville, cadastro em Jaraguá): cadastro mostra os dois; DANFE/payload Focus continuam com cadastro; pedido novo vem com "Entregar em" no local; Delivery/Pedidos/romaneio/etiqueta mostram Joinville com a tag certa; motorista Maps em Joinville, concluir no local NÃO sugere trocar GPS do cadastro, avulso não pergunta "na porta"; mapa/roteirização com pino em Joinville, avulso sem ponto → "sem localização"; Caixa compara com o local, avulso sem selo; mobile 375px sem scroll horizontal; `npm run build` e `npm test` passam; após deploy de cada fatia conferir em produção e só então ligar a flag.
Revisor: checklist "focus*/DANFE/ia-consulta não mudaram no diff".

## Perguntas ao dono (padrão adotado se sem resposta)
1. Cobrança em rota (`cobrancaRota`) do cliente com local: fica no CADASTRO (padrão). Amostra segue o local.
2. Reclassificar entregas antigas (F10): botão com confirmação (padrão), não automático.
