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
- [ ] commit (add explícito) + push + conferir deploy
