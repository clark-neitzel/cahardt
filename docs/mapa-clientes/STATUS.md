# Mapa de Clientes — andamento (retomar daqui se a sessão cair)

Plano: docs/mapa-clientes/PLANO.md (arquiteto, 12/09/2026). Fase 1.
Decisões do dono: aba Mapa dentro de Clientes; raio vizinho padrão 1000 m (config editável na tela).
Working tree tem ~20 arquivos de OUTRA sessão — commit só com `git add` explícito (lista na seção 9 do plano).

## Etapas
- [x] Arquiteto — plano pronto
- [x] dev-backend (rotas /api/mapa-clientes, fix PATCH clienteController 4.4, audit_logs, manual Clippy) — 12/09, testado com curl no backend local (porta 3100, banco hardt_local): 200 nos 4 endpoints, 400 raio=5, 403 PUT sem clientes.edit, PATCH parcial preserva ciclo/insight/observação, 2 linhas em audit_logs. Payload GET / ≈ 670 KB no local (1.154 clientes), ~86 KB com gzip (compression() adicionado no index.js). Correções do revisor aplicadas (texto admin no manual, select enxuto nos vizinhos, gzip). Não commitado.
- [x] dev-frontend (tela /clientes/mapa, DayPicker.jsx, rota App.jsx, botão Mapa em ListaClientes, novidade + novidades.json, build OK 12/09) — codificado contra o contrato da seção 3; backend ainda não existia local ao testar, integração real pendente para o QA
- [ ] qa-testador + revisor-codigo
- [x] correções frontend (QA/revisor, 12/09): anti clique duplo por ref no Salvar; alça do sheet não engole toque após arraste; vizinhos com guarda de resposta velha e 1 chamada por troca de filtro; salvar não refaz o GET completo (vizinhos refeitos 1× pelo efeito em dm.dados, sem chamada extra); legenda "· N clientes"; N/D conta como "sem dia" em legenda, chips e paradas
- [x] gerente-entrega → nota de entrega
- [x] commit (add explícito) + push + conferir deploy

## Fase 1.1 — perfis (fornecedor no mapa) + compras no período (13/09)
Pedido do dono: (1) fornecedor aparecendo no mapa; (2) filtrar quem comprou / não comprou num período.
- [x] dev-backend (13/09, não commitado):
  - `GET /api/mapa-clientes/` — cada cliente ganha `perfis: string[]` (da coluna `Perfis`, que tem DOIS formatos reais: `["Cliente","Fornecedor"]` e `[{"perfil":"FORNECEDOR"}]`; normalizado em maiúsculas; vazio/inválido → `["CLIENTE"]`) e `opcoes.perfis = [{valor,total}]`. Sem filtro no backend (frontend filtra em memória).
  - Por que fornecedor aparecia: o cadastro "Também é fornecedor" deixa o contato `Ativo:true` com os dois perfis — no local, 78 ativos são CLIENTE+FORNECEDOR e só 2 (inativos) são só FORNECEDOR. Ou seja, o que aparece no mapa é cliente que também é fornecedor; o filtro de perfil no frontend resolve (padrão: só CLIENTE).
  - `GET /api/mapa-clientes/compras?de=&ate=&ativo=` → `{ de, ate, uuids, total }` com `WHERE_PEDIDO_RECEITA` (projecaoVendasService) por `dataVenda`, mesma visibilidade/`ativo` do GET /. Vazio = sem limite; formato inválido/`de > ate` = 400. Sem índice novo: ~10 ms no local (já existe `@@index([dataVenda])`).
  - Testes curl (backend local 3100, JWT de teste): perfis presentes nos dois GETs; compras 200 nos 3 recortes e total bate com SQL direto; 400 em `2026-13-01`, `2026-02-31`, `abc`, `de>ate`; 401 sem token; vendedor com `clientes != todos` recebe só os seus.
  - Manual `backend/manuais/abas/mapa-clientes.md` atualizado (filtro Perfil + Compras no período).
- [x] dev-frontend — Fase 1.1 (13/09, build OK, não commitado):
  - `FILTROS_PADRAO.perfis = ['CLIENTE']` (fornecedor some por padrão) e `compras = 'qualquer'`; filtro em memória em `useDadosMapa` (cliente sem `perfis` conta como CLIENTE); `filtradosBase` (sem o filtro de compras) alimenta o cartão "Comprou no período".
  - `usePeriodoSalvo('mapa-clientes', 'todo')` + `FiltroPeriodo` ao lado do SelectBusca Compras (`FiltrosMapa.jsx`); GET `/mapa-clientes/compras?de&ate&ativo` só com o filtro ≠ qualquer, guarda de resposta velha, erro em toast; "Filtros · N" conta período fora do padrão, compras e perfil ≠ padrão; Limpar chama `periodoCtl.limpar()`. Enquanto a lista não chega, o mapa não filtra (não pisca vazio).
  - Ponto GPS: `ModalPontoGps` montado na página (mesmo da ficha, origem CADASTRO) aberto pelo painel (`DrawerCliente`) e pela aba Sem GPS (`ListaSemGps`); modo "Marcar no mapa" (faixa + cursor crosshair + prévia + "Salvar aqui") grava por `gpsClientesService.salvarPonto`; `atualizarLocal` aceita `patch.gps` → pino se move / entra no mapa sem recarregar; `semMudanca`/`pendente`/`offline` tratados; PROXIMO manda usar o modal (autorização). Botões só com `admin | Pode_Editar_GPS | clientes.edit | Pode_Executar_Entregas` (espelho da rota).
  - Novidade `novidade-mapa-clientes.html` (accordion + Tela 4 com pins), `novidades.json` (resumo + data 13/09), manual (parte do GPS; Perfil/Compras já estavam).
  - A provar no aparelho: toque no mapa no iPhone/iPad em modo marcação (Leaflet `click` após tap), sheet recolhida deixa o mapa livre; cliente sem GPS entra no mapa ao salvar.
- [ ] qa-testador + revisor-codigo → gerente-entrega
