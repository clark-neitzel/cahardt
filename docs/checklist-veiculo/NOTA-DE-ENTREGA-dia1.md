# Nota de entrega — Checklist do veículo com foto + IA (Dia 1, modo teste)

Gerente de entrega, 20/10/2026 à noite. Para começar a testar na manhã de 21/10.

**Veredito: LIBERADO COM PENDÊNCIA** (pode publicar; o que só se prova em produção e no celular de verdade está listado no fim, em "Prova em produção" e "O que você precisa conferir").

---

## 1. O que mudou (na prática)

**Para o motorista (Presencial ou "Pegar veículo"):**
- No lugar das 6 caixinhas, ele **tira fotos do veículo** com a câmera do celular, uma por quadradinho: frente com placa, lateral direita, lateral esquerda, traseira, painel, água do radiador, baú (ou porta-malas no carro de passeio) e, às **segundas e quintas**, a vareta de óleo. Carro **particular** só pede a foto do painel.
- Ao tocar num quadradinho abre a tela **"Tire assim"**, com a foto modelo daquele veículo (se o escritório cadastrou) e a instrução escrita. Depois, a câmera.
- Cada foto sobe na hora e a **IA confere**: lê a placa e o KM do painel, procura pneu murcho, luz de aviso, nível de água/óleo. Foto que não dá para avaliar volta em vermelho ("Refazer") com o motivo.
- No botão **Conferir e iniciar**, o app compara: placa da foto com a do veículo escolhido, KM do painel com o KM digitado, e os problemas apontados. Se houver algo, mostra a tela de problemas com o aviso fixo de período de teste e dois botões: **Corrigir agora** (volta para as fotos) ou **Seguir mesmo assim (teste)** (abre o dia).
- **Nada trava o início do dia nesta fase**: IA fora do ar, foto que não sobe ("Tentar de novo" / "Pular esta foto (teste)"), veículo sem foto modelo — em todos os casos o dia abre. As travas de antes (KM final de ontem pendente, pendência de rota, veículo já em uso) continuam valendo normalmente.
- Se o motorista fechar o app no meio, as fotos já enviadas voltam ao reabrir.

**Para o escritório (menu Veículos):**
- Cada veículo tem agora um **Tipo**: Carga, Passeio ou Particular. É o tipo que decide quais fotos o motorista tira. **Todos os veículos nascem como "Carga"** — veja o item 3.
- Na ficha do veículo, duas abas novas: **Fotos modelo** (enviar/substituir a foto de referência de cada ângulo) e **Checklists** (lista do que cada motorista fotografou, com resultado, decisão, KM lido × digitado e miniaturas).
- Cadastrar/editar veículo e enviar foto modelo agora exigem a permissão **"Editar Veículos"** também no servidor (antes só a tela escondia o botão).

**O que fica guardado:** todas as fotos, o resultado da IA por foto, os problemas, a decisão do motorista e os horários — na ficha do veículo e no banco.

**Chave de emergência:** existe uma chave no servidor (`checklist_foto_modo`) que, em DESLIGADO, devolve as 6 caixinhas antigas para todo mundo, sem publicar nada. Nesta entrega ela só é acionada pela equipe técnica (por API, só administrador). O botão na tela é do Dia 2.

---

## 2. O que foi testado e por quem

- **Build do frontend**: passou (5,7 s). Schema do banco: válido, **só adições** (nenhum campo removido). Sintaxe dos 11 arquivos de backend: OK. Conferido por mim.
- **QA (clicando, app local + navegador automatizado, inclusive em 375 px)**: 46 capturas em `docs/checklist-veiculo/evidencias-qa/`. Passaram: tipos de veículo e quadradinhos por tipo; fotos modelo (subir e substituir); "Tire assim" com e sem modelo; **upload com IA real** (gpt-6-luna, 25 fotos analisadas, 3,8 a 7,7 s cada); refazer foto; vareta só segunda/quinta (relógio simulado) ou com "luz de óleo acesa"; placa de outro veículo e KM diferente aparecendo na tela de problemas com o aviso vindo do servidor; Corrigir / Seguir mesmo assim; dia aberto nos dois casos; aba Checklists; IA fora do ar (foto sobe "sem análise", dia abre); upload falhando com "Tentar de novo" e "Pular"; chave DESLIGADO e falha de configuração voltando às caixinhas; KM de ontem pendente continua barrando; rascunho volta ao reabrir; página de novidade; aba Motoristas antiga continua mostrando ✓/✗.
- **QA, 1ª rodada, REPROVOU** um bug sério (motorista B iniciando o dia pegava o rascunho do motorista A) — corrigido e re-testado.
- **Revisor de código**: 3 rodadas, aprovado; os achados importantes (permissão no servidor para editar veículo; chave sem tela no manual; imagem com falha não se recuperava) foram **corrigidos**, não só respondidos.
- **Conferido por mim, hoje, com o servidor local e a API**:
  - Usuário que só vê veículos: lê fotos modelo e checklists (200), mas **POST de foto modelo, PUT/POST de veículo e troca da chave → 403**. Motorista sem permissão de veículos: lista de checklists → 403; configuração do checklist → 200 (precisa dela para tirar as fotos).
  - Foto modelo enviada pelo admin **gravou em `backend/uploads/veiculos/<id>/modelo/`** (a pasta persistente) e abriu pela URL (HTTP 200).
  - Chave em TESTE; terça-feira sem vareta obrigatória (`varetaHoje:false`).
  - Nenhum segredo no código; nenhuma mensagem de WhatsApp nesta entrega; sem `$transaction` no módulo novo; marcador de deploy `checklist-foto-dia1-2026-10-20`; manual do Clippy (`veiculos.md`) e página de novidade atualizados.

**Detalhe honesto:** as capturas do QA para o usuário "só ver" (17, 18, 22) saíram da tela errada (a entrada do Diário). Por isso essa parte foi provada por mim pela API, acima — e o botão de enviar na tela só aparece com a permissão (`podeEditar`), conferido no código.

---

## 3. O que você precisa fazer amanhã cedo, ANTES de os motoristas saírem (~10 min por carro)

1. **Tipo dos veículos.** Menu Veículos → lápis do veículo → campo **Tipo do veículo**. Marque os **Unos como "Passeio"** (senão vão pedir foto de baú). Carro particular de alguém → "Particular". Os de carga podem ficar como estão.
2. **Fotos modelo.** Veículos → "Toque para ver ficha completa" → aba **Fotos modelo** → "Enviar foto" em cada ângulo. Dá para fazer com o celular, com o carro no pátio, na posição que você quer que o motorista repita. Sem foto modelo o motorista vê só a instrução escrita (não trava, mas ajuda muito).
3. **Permissão "Editar Veículos".** Usuários → permissões → "Editar Veículos". Quem cadastra veículo ou vai enviar foto modelo precisa dela — a partir de agora o servidor também recusa quem não tem (antes só o botão sumia).
4. **Avise a equipe** com o texto do grupo (seção 7). Amanhã é quarta: a vareta de óleo **não** é obrigatória; quinta (22/10) é.

---

## 4. O que você precisa conferir no aparelho de verdade (ninguém da equipe conseguiu testar isso)

Com o app instalado no celular (atalho) e num carro no pátio, de manhã cedo:
- Ao tocar num quadradinho → "Tire assim" → **Abrir câmera**: abre a **câmera** (não a galeria)?
- **Flash**: o app não controla o flash — o motorista precisa tocar no raio da câmera. Veja se a dica amarela "Pouca luz?..." está visível e se a foto noturna fica usável.
- A foto sobe e muda para "OK" / "Atenção" / "Refazer" em menos de ~15 s?
- Num **iPhone/iPad**, repita o mesmo (o teste foi só em navegador de computador simulando celular).
- Primeiro checklist real: a IA foi calibrada só com imagens sintéticas (não havia foto real de carro no computador). Esperado para amanhã: alguns "Refazer" e "Atenção" a mais do que o ideal. Em modo teste isso não trava; anote o que a IA errou para ajustarmos as frases.

---

## 5. Ressalvas aceitas para este teste (e por quê)

| Não testado | Por que é aceitável em MODO TESTE |
|---|---|
| Câmera nativa, flash, iPhone/iPad, PWA real | É o mesmo `<input capture>` já usado no Como Fazer; se falhar, o motorista pula a foto e o dia abre. Fica para você conferir (seção 4). |
| Persistência das fotos atravessando um deploy em produção | Caminho é `backend/uploads` (provado localmente). Só se prova em produção; está na seção 6. |
| IA dando "OK" numa foto de verdade / placa batendo com `serve=true` | A IA real não aprova imagem sintética. Regra de placa e KM foi provada com leitura real da IA (placa RNB1146 ≠ QAC1A11; KM 99.999 ≠ 84.312). |
| Rota `DELETE /veiculos/:id` ainda sem checagem de permissão no servidor (pré-existente, a tela esconde o botão) | Fora do escopo desta entrega; entra no Dia 2 junto com o endurecimento das rotas antigas. |
| Fotos ficam acessíveis por URL sem login (pasta `/uploads` é pública, nome aleatório) | Risco pré-existente de todo upload do app; aceito para o teste, retenção/proteção no Dia 3. |
| Espaço em disco (~2,4 MB por motorista por dia) | Retenção fica para o Dia 3. |

---

## 6. Prova em produção (preencher pelo gerente de projeto após o deploy)

- [ ] `GET /api/admin-exec/ping` devolve `deployMarker: "checklist-foto-dia1-2026-10-20"` → hora: ______
- [ ] Frontend novo no ar (campo **Tipo** aparece no modal de veículo) → hora: ______
- [ ] `GET /api/checklists-veiculo/config/modo` → `{"modo":"TESTE"}` → ______
- [ ] Foto modelo enviada num veículo real → URL: ______
- [ ] **Novo deploy / restart depois disso** → hora: ______
- [ ] A mesma URL ainda abre a foto (prova de que `/uploads` persistiu) → ______
- [ ] Primeiro checklist real de um motorista: id ______ · veredito ______ · tempo da IA ______ ms (tabela `checklist_veiculo_fotos`, colunas `ia_ms`, `ia_tokens`, `ia_modelo`)
- [ ] `openaiConfigurada: true` no ping (a IA usa a mesma chave já em uso; `AI_MODEL_VISAO` **não** precisa ser criada)

Se algo der errado de manhã: administrador chama `PUT /api/checklists-veiculo/config/modo` com `{"modo":"DESLIGADO"}` e todo mundo volta às caixinhas na hora, sem publicar nada.

---

## 7. O que ficou pendente e a ordem das próximas entregas

**Dia 2 (próxima):** selo do checklist no Caixa (escritório vê de manhã quem saiu com problema); botão da chave de emergência na tela de Configurações; "x/N fotos modelo" na lista de veículos; remover foto modelo; OK de pendência de ontem; permissão no servidor para excluir veículo.
**Dia 3:** foto na volta; liberação pelo escritório via WhatsApp + página Liberar/Recusar; cupom do abastecimento na despesa; comparação com a foto modelo; modo TRAVA; retenção/limpeza das fotos e proteção da pasta `/uploads`.
**Depois:** relatório semanal; funcionamento sem sinal (fila offline).

---

## 8. Texto pronto para o grupo do WhatsApp

```
📸 *Novidade no Hardt App: checklist do veículo com foto*

A partir de amanhã, antes de sair com o carro, o app pede *fotos* no lugar das caixinhas: frente, laterais, traseira, painel, água do radiador e baú (vareta de óleo só segunda e quinta).

✅ É só tocar no quadradinho, ver a foto modelo ("Tire assim") e bater a foto.
🤖 O app confere na hora (placa, KM, pneus, luzes, níveis).
⚠️ *Fase de teste:* se der problema, ele avisa e você escolhe *Corrigir agora* ou *Seguir mesmo assim*. Nada trava a saída.
🔦 De noite: ligue o flash da câmera (toque no raio ⚡).

Veja como funciona, com as telas:
https://cahardt-github.xrqvlq.easypanel.host/novidade-checklist-foto.html
```

---

## 9. Arquivos desta entrega (para o `git add` explícito)

**Backend (modificados):** `backend/index.js`, `backend/prisma/schema.prisma`, `backend/routes/adminExec.js`, `backend/routes/veiculos.js`, `backend/services/aiProvider.js`, `backend/services/diarioService.js`, `backend/services/veiculoService.js`, `backend/manuais/abas/README.md`, `backend/manuais/abas/veiculos.md`
**Backend (novos):** `backend/config/checklistVeiculoAngulos.js`, `backend/middlewares/uploadFotoChecklistMiddleware.js`, `backend/routes/checklistsVeiculo.js`, `backend/services/checklistVeiculoIaService.js`, `backend/services/checklistVeiculoService.js`
**Frontend (modificados):** `frontend/public/novidades.json`, `frontend/src/components/Diario/FormVeiculoPresencial.jsx`, `frontend/src/pages/Veiculos/VeiculoFicha.jsx`, `frontend/src/pages/Veiculos/Veiculos.jsx`
**Frontend (novos):** `frontend/public/novidade-checklist-foto.html`, `frontend/src/components/Diario/ChecklistFotos.jsx`, `frontend/src/components/Diario/ChecklistProblemaTela.jsx`, `frontend/src/components/Diario/ImgComFalha.jsx`, `frontend/src/components/Diario/TireAssimModal.jsx`, `frontend/src/pages/Veiculos/ChecklistsVeiculoLista.jsx`, `frontend/src/pages/Veiculos/FotosModeloVeiculo.jsx`, `frontend/src/services/checklistVeiculoService.js`, `frontend/src/utils/comprimirFoto.js`
**Docs:** `docs/propostas/proposta-checklist-foto-ia.html`, `docs/checklist-veiculo/` (plano, esta nota e as 46 evidências, 4,5 MB)

**NÃO entram:** `backend/uploads/**` (como-fazer, funcionarios — dados locais), `skills/`, `docs/etiquetas-cozinha/evidencias*`, `docs/mockups/evidencias-contagem/`, `docs/proposta-central-cobranca.html`, `docs/proposta-layout-mapa-entregas.html`, `docs/qr-site-congelados.jpg` (de outras frentes).
