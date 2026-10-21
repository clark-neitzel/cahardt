# PLANO: comprovantes das despesas + anexos múltiplos no Contas a Pagar + lançamento da despesa do motorista

Arquiteto, 21/10/2026, somente leitura (versão salva pelo gerente de projeto). Substitui a fatia 3C do `PLANO-dia3.md`.

## 0. Premissas do dono × código

| Premissa | Veredito |
|---|---|
| Despesa do motorista não está no Contas a Pagar | **Certo.** `routes/despesas.js` não referencia `contaPagar`; `POST /veiculos/:id/abastecimento` (`routes/veiculos.js:248-293`) também cria `Despesa` direto. |
| Entra só no Caixa | **Certo.** `caixa.js:321, 438-444, 795 (valorAPrestar = adiantamento + recebido + faltas + cobranças + títulos − totalDespesas), 2381, 2448, 2610`; `caixaConferenciaService.js:85, 732`; `veiculoService.js:106, 264`. |
| Não aparece na DRE | **Certo e é furo financeiro hoje.** DRE lê só `ContaPagar` (`financeiroGerencialService.js:393-420`); Fluxo de Caixa realizado (`:162`) e Saldos por Conta (`:518`) leem `pagamentoParcelaPagar`. Combustível/pedágio/hotel/manutenção pagos em dinheiro pelo motorista não entram. |
| Lançar no Contas a Pagar duplicaria a saída do caixa | **Não duplica se a conta nascer já quitada na Caixinha.** O risco real é o escritório já ter lançado à mão a mesma despesa. |
| Permissão `Pode_Editar_ContasPagar` | **Não existe.** Reais: `Pode_Acessar_Contas_Pagar` (ver) e `Pode_Baixar_Contas_Pagar` (escrever; `contasPagar.js:6-7, 74, 83`; front `ContasPagarPage.jsx:380`). |
| Vincular a uma NF | Já existe: `POST /notas-entrada/:id/vincular-parcelas` (`notasEntrada.js:1152`) e `GET :id/parcelas-compativeis` (`:1052`); não cria conta. NFC-e de posto não chega pelo DFe (só NF-e 55): combustível quase sempre é só foto do cupom. |
| A foto vai no anexo da conta | Hoje só **um** PDF por conta (`pdfPath`, `contasPagar.js:30-47, 473-546`), só PDF, 30 MB; imagem recusada (`fileFilter :55`). |
| (descoberta) Segurança | `backend/index.js:130-137` serve `/uploads` inteiro publicamente, bloqueando só `certificado`, `notas-xml`, `cache-fiscal`. PDFs de boleto/NF em `uploads/contas-pagar` são acessíveis por URL direta (não adivinhável: `Date.now()`+uuid). Anexos novos NÃO repetem isso. |
| (descoberta) Contabilidade | `contabilidadeRoutes.js:392, 500, 606` usa `temAnexo: !!conta.pdfPath`: conta só com foto apareceria "sem anexo" ao contador. `:367-370` decide tipo de documento pela `origem`: origem nova precisa de ramo. |

## 1. Regra contábil (a lei desta entrega)

Hoje: dinheiro das entregas é baixado nos títulos a receber na conferência do Caixa, bruto, na conta financeira "Caixinha" (`contaEspecieId()` em `recebimentoEntregaService.js:56`; uso em `caixa.js:2770-2832`). A `Despesa` só reduz o **valor a prestar** (`caixa.js:795`); nenhuma saída é lançada na Caixinha. Logo o saldo da Caixinha fica maior que o dinheiro real e a DRE maior que o lucro real.

Despesa do motorista aprovada vira **uma** `ContaPagar`:
- `origem: 'DESPESA_MOTORISTA'`; uma parcela já `QUITADO`;
- um `PagamentoParcelaPagar` com `formaPagamento:'DINHEIRO'`, `contaFinanceiraCaId = contaEspecieId()`, `dataPagamento = dataReferencia`, `origem:'CAIXA_MOTORISTA'`, `statusEnvioCA:'NAO_ENVIAR'`;
- `statusEnvioCA:'NAO_ENVIAR'` na conta (`CA_SOMENTE_LEITURA` já ligado, `contasPagar.js:22`);
- `competencia` e `dataEmissao` = `dataReferencia`;
- `categoriaDespesaId` por `categoriaDespesaService.idPorNome` (`:51`).

Por que não duplica: a saída passa a ser lançada uma única vez (na Caixinha, que não tinha saída); o valor a prestar continua vindo da tabela `despesas` (nenhuma fórmula do Caixa muda); a DRE soma `ContaPagar` e nunca lê `Despesa`; conciliação (`conciliacaoBancariaService.js:369`) só carrega pagamentos de conta com extrato importado: **provar por diag que a Caixinha não tem extrato**. Fluxo de Caixa e Saldos por Conta passam a mostrar a saída real, **mudando números históricos**: backfill é decisão do dono.
Pontos de criação de `pagamentoParcelaPagar` (9) que não podem pegar o novo: `contasPagar.js:801, 1281, 1349`; `notasEntrada.js:1896`; `importacaoCaService.js:649`; `conciliacaoBancariaService.js:1308, 2544, 2739, 2849`; `contasPagarCaSyncService.js:750` (só empurra `statusEnvioCA='ENVIAR'`). Estorno: `contasPagar.js:1402` trata `origem==='CA'`; `CAIXA_MOTORISTA` deve cair no ramo "estorno local simples" (`adminExec.js:6956`).

## 2. Modelo de dados (100% aditivo)

Regra de ouro: **nenhuma coluna nova em `despesas` nem `contas_pagar`** (tabelas quentes; `db push` recusa UNIQUE em tabela com dados). Tudo em tabelas novas; nas antigas só campos de relação inversa (sem coluna).

### 2a. `anexos` (genérica)
```prisma
model Anexo {
  id             String   @id @default(uuid())
  entidadeTipo   String   @map("entidade_tipo")   // CONTA_PAGAR | DESPESA | (futuro: NOTA_ENTRADA...)
  entidadeId     String   @map("entidade_id")
  tipo           String   @default("OUTRO")        // COMPROVANTE | NF | BOLETO | CONTRATO | OUTRO
  nomeOriginal   String   @map("nome_original")
  mime           String
  tamanho        Int
  sha256         String   @map("sha256")
  caminho        String   @db.Text                 // path gravado, sempre sob uploads/
  chaveLegado    String?  @unique @map("chave_legado") // 'pdf:<contaId>' idempotência do backfill
  criadoPorId    String?  @map("criado_por_id")
  criadoPorNome  String?  @map("criado_por_nome")
  criadoEm       DateTime @default(now()) @map("criado_em")
  ativo          Boolean  @default(true)
  removidoEm     DateTime? @map("removido_em")
  removidoPorId  String?  @map("removido_por_id")
  @@index([entidadeTipo, entidadeId, ativo])
  @@index([sha256])
  @@map("anexos")
}
```
- Soft delete; arquivo só apagado do disco quando nenhum anexo ativo aponta para o mesmo `caminho` (foto da despesa e da conta compartilham arquivo).
- `sha256` NÃO é unique: duplicidade vira **aviso** no upload, nunca bloqueio.
- Tipos: PDF, JPEG, PNG, WebP, XML; validar mime E magic number; 30 MB PDF/XML; fotos do app já comprimidas (≤ 6 MB).
- Pasta: `path.join(__dirname, '../uploads/anexos/<entidadeTipo>/<yyyy-mm>/')`, nome `<hex16>.<ext>`.
- **Rota autenticada, nunca URL pública**: `index.js` ganha bloqueio 403 de `/uploads/anexos` e `/uploads/contas-pagar` (ao lado de 130-137), **depois** de grepar o frontend por `/uploads/contas-pagar`.

### 2b. `pdfPath` legado
Nunca remover. Backfill idempotente `POST /api/admin-exec/anexos-migrar-pdf-contas-pagar?dry=1`: para cada conta com `pdfPath`, cria `Anexo(CONTA_PAGAR, tipo OUTRO, application/pdf, chaveLegado 'pdf:<contaId>')` apontando para o arquivo existente (`localizarPdf`, `contasPagar.js:38`); não move nem copia; `createMany({skipDuplicates:true})`; conta cujo arquivo sumiu entra no relatório (diag `adminExec.js:3594-3647`). **Dupla escrita** enquanto a tela antiga existir: `POST/DELETE /:id/pdf` continuam gravando `pdfPath` e refletem em `anexos` pelo `chaveLegado`. `formatarConta` (`contasPagar.js:149-150`) mantém `temPdf`/`pdfNome` e ganha `qtdAnexos`/`temAnexo`. `contabilidadeRoutes.js:392, 500, 606`: `!!pdfPath || qtdAnexos > 0` (um `groupBy`).

### 2c. Vínculo despesa → conta, e comprovante
```prisma
model DespesaLancamento {
  id            String   @id @default(uuid())
  despesaId     String   @unique @map("despesa_id")    // trava de idempotência
  contaPagarId  String   @map("conta_pagar_id")
  modo          String                                  // CRIADA | VINCULADA_CONTA | VINCULADA_NF
  notaEntradaId String?  @map("nota_entrada_id")
  criadoPorId   String   @map("criado_por_id")
  criadoPorNome String?  @map("criado_por_nome")
  criadoEm      DateTime @default(now()) @map("criado_em")
  desfeitoEm    DateTime? @map("desfeito_em")
  @@index([contaPagarId])
  @@map("despesa_lancamentos")
}
model DespesaComprovante {
  id                String   @id @default(uuid())
  despesaId         String   @unique @map("despesa_id")
  anexoId           String?  @map("anexo_id")
  status            String   @default("SEM_COMPROVANTE") // CONFERIDA | DIVERGENTE | RECUSADA | IA_INDISPONIVEL | SEM_COMPROVANTE | ACEITA
  motivos           Json?
  leitura           Json?    // {valor,data,hora,litros,precoLitro,posto,cnpj,numero}
  semComprovanteMotivo String? @map("sem_comprovante_motivo")
  cupomCnpj         String?  @map("cupom_cnpj")
  cupomNumero       String?  @map("cupom_numero")
  aceitaPorId       String?  @map("aceita_por_id")
  aceitaPorNome     String?  @map("aceita_por_nome")
  aceitaEm          DateTime? @map("aceita_em")
  aceitaMotivo      String?  @map("aceita_motivo")
  criadoEm          DateTime @default(now()) @map("criado_em")
  atualizadoEm      DateTime @updatedAt @map("atualizado_em")
  @@index([status])
  @@index([cupomCnpj, cupomNumero])
  @@map("despesa_comprovantes")
}
```
Foto da despesa → anexo da conta: ao lançar, cria segundo `Anexo(CONTA_PAGAR, COMPROVANTE)` com o **mesmo** `caminho` e `sha256`. Duplicidade de cupom: sha256 + (cupomCnpj, cupomNumero) nos últimos 90 dias.

### 2d. Vincular a uma NF
Escritório decide por despesa: **A) Lançar nova** (padrão; se houver NF-e depois, vincula à parcela dessa conta pelo `vincular-parcelas` existente; confirmar que `DESPESA_MOTORISTA` aparece em `parcelas-compativeis`); **B) Vincular a conta existente** (escritório já tinha lançado): grava `DespesaLancamento(modo VINCULADA_CONTA)`, copia a foto como anexo da conta, NÃO cria conta nem pagamento; só se valor igual (±0,01); se a conta já tem baixa em banco, avisa "a saída já foi lançada em <banco>" e exige confirmação.

## 3. Fluxo do motorista (F2)
- `NovaDespesaModal.jsx` (369 linhas): passo "Foto do cupom" no fim do `handleSubmit` (~linha 161), sem reordenar a validação de KM.
- Obrigatória em COMBUSTIVEL, MANUTENCAO_VEICULO, PEDAGIO_BALSA (com opção "Sem cupom" + motivo); opcional nas demais. **Modo teste = só marca, nunca trava** (`app_configs` `despesa_comprovante_trava=false`).
- Back: `POST /api/despesas/comprovante/analisar` (multipart; rascunho em `uploads/anexos/_rascunho/<vendedorId>/`; IA fora de transação; devolve `comprovanteRef` com HMAC); `POST/PUT /api/despesas` aceitam `comprovanteRef?` e `semComprovanteMotivo?` e recalculam no servidor; mesma regra em `veiculos.js:248` (abastecimento do escritório, foto opcional).
- `services/cupomDespesaService.js`: reusa `aiProvider.analisarImagem` (`aiProvider.js:177`) e o padrão de `checklistVeiculoIaService.js:309`; nunca lança (falha = `IA_INDISPONIVEL`); compara valor (±0,05), data, litros (±0,5 L), litros ≤ `capacidadeTanque × 1,05`, preço/litro; duplicidade.
- Campos novos opcionais: PWA antigo em cache continua criando despesa sem foto.
- **Quando criar o lançamento no Contas a Pagar:** ação do escritório na conferência do Caixa (por despesa ou "lançar todas do dia"); opcionalmente depois automático ao fechar o caixa atrás de chave desligada; NÃO ao salvar (despesa é editável/excluível enquanto o caixa está aberto, `despesas.js:125-232`; depois do fechamento é imutável, `bloqueioPorCaixaFechado`).

## 4. Fatias
Ordem: F1 sozinha; F2 depende de F1; F3 depende de F1; F4 após F3; F5 por último. F1 isolada em produção e validada (gravar → deploy → ler) antes das demais.

### F1: Anexos múltiplos no Contas a Pagar
**Back:** model `Anexo`; `services/anexoService.js` (`salvar` com mime+magic+sha256 em `../uploads/anexos/...`, `listar`, `abrirStream`, `remover` soft com contagem de referências por `caminho`, `migrarPdfLegado`); rotas `GET /contas-pagar/:id/anexos` (checkAcesso), `POST /contas-pagar/:id/anexos` (checkEscrita, multipart `arquivos` até 10, campo `tipo`), `GET /anexos/:id/arquivo` (autenticada, `inline`, `Cache-Control: private, no-store`), `DELETE /anexos/:id` (checkEscrita), `PATCH /anexos/:id` (tipo); dupla escrita em `/:id/pdf`; `qtdAnexos` em `formatarConta` e listagem; bloqueio de `/uploads/anexos` e `/uploads/contas-pagar` em `index.js` após o grep; rota admin de backfill `?dry=1`; `contabilidadeRoutes` `temAnexo`; boy scout das `$transaction` vizinhas (`timeout:20000, maxWait:10000`).
**Front:** componente novo `frontend/src/components/Anexos/AnexosEntidade.jsx` (props `entidadeTipo`, `entidadeId`, `podeEscrever`): miniaturas de imagem, ícone PDF/XML, visualizador (`ChecklistVeiculo/VisualizadorFotos.jsx` para imagem; PDF por blob em visualizador interno, sem `window.open` externo), adicionar vários (compressão de foto `utils/comprimirFoto.js`), `SelectBusca` para o tipo, quem enviou/quando, remover com confirmação, mobile 2 colunas/44 px. `ContasPagarPage.jsx` (2734 linhas, tocada por outra sessão): edição **mínima**, trocar o bloco "Documento (PDF)" (~2591-2628) pelo componente e manter `temPdf/pdfNome` (2374-2402) até o fim da compat; antes, `git diff HEAD` do arquivo. Selo na lista (`:814`) mostra a contagem. `contasPagarService.js`: métodos novos sem renomear os antigos.
**Aceite QA:** PDF + 2 fotos na mesma conta, abrir cada, remover uma, recarregar; conta antiga com PDF aparece como anexo após o backfill e a UI antiga abre; backfill 2× não duplica; `.exe` renomeado para `.pdf` recusado; 31 MB com erro claro; sem `Pode_Baixar_Contas_Pagar` vê/baixa mas não anexa/remove (front E back); `GET /uploads/anexos/...` direto = 403; 375 px sem scroll horizontal; **prova em produção: anexar → publicar de novo → abrir**.
**Esforço:** B 2,5 d, F 2 d, Q 1,5 d, R 0,5 d. Sem decisão bloqueante.

### F2: Comprovante na despesa do motorista (marca e avisa, não trava)
Back: `DespesaComprovante`, `Anexo(DESPESA)`, `cupomDespesaService.js`, rotas da seção 3; `caixa.js` resumo (`:438`) e `/relatorio` incluem `comprovante` resumido (o `map` do `/relatorio` `:2610` não muda, para não vazar leitura da IA no PDF); `GET /despesas/:id/comprovante` (autenticada); `POST /despesas/:id/aceitar` (admin ou `Pode_Editar_Caixa`, idempotente). Front: `NovaDespesaModal.jsx` passo da foto + leitura da IA lado a lado; `DespesasPage.jsx` e `CaixaDiarioPage.jsx` selo; `components/Anexos/` reutilizado. QA: 9 itens da 3C + despesa antiga sem foto continua somando no valor a prestar + IA fora não impede salvar. B 3 d, F 2 d, Q 1,5 d.

### F3: Lançamento no Contas a Pagar (criar ou vincular)
Back: `DespesaLancamento`; `services/despesaContaPagarService.js` `lancar(despesaId,{modo,categoriaDespesaNome,fornecedorId?,contaPagarId?,userId})`; `$transaction` (`timeout:20000, maxWait:10000`) com **só**: `contaPagar.create`+parcela, `pagamentoParcelaPagar.create` (Caixinha, `CAIXA_MOTORISTA`), `recalcularParcelaEConta`, `despesaLancamento.create`; fora da transação e em try/catch: cópia do anexo, audit log, notificações; `P2002` em `despesaId` → "já lançada"; `contaEspecieId()` nulo bloqueia; despesa de caixa ABERTO só com permissão explícita (padrão: caixa fechado/conferido); rotas `POST /despesas/:id/lancar`, `POST /despesas/lancar-lote {data, vendedorId}`, `POST /despesas/:id/desfazer-lancamento` (cancela a conta e estorna o pagamento se a conta não foi alterada depois); `PUT`/`DELETE` de despesa com lançamento ativo bloqueados; `contabilidadeRoutes.js:367-370` ramo `DESPESA_MOTORISTA`. Front: botão "Lançar no Contas a Pagar" no detalhe da despesa (modal: categoria `SelectBusca` sugerida, fornecedor opcional `ComboBusca`, modo Criar/Vincular); selo de origem "Despesa do motorista" em `ContasPagarPage.jsx` + link "ver despesa e foto". QA: combustível R$ 100 lançado → DRE do mês +100 na categoria, Saldos por Conta mostram saída de 100 na Caixinha; duplo clique/lote repetido = 1 conta; **valor a prestar inalterado**; conciliação sem pendência nova; desfazer devolve tudo; não aparece em Notas Recebidas "sem nota" nem vai ao CA. B 3 d, F 2 d, Q 2 d, R 1 d. Equipe completa.

### F4: Visão do escritório e relatórios
Painel "Despesas do dia" na conferência do Caixa (foto + leitura da IA + valor digitado lado a lado, pendências divergente/sem cupom/não lançada, "Aceitar com motivo"); relatório de despesas do motorista por período com coluna "lançada em Contas a Pagar?"; fonte de pendência na Central. B 1 d, F 2 d, Q 1 d.

### F5: Trava no Caixa
Só com `despesa_comprovante_trava` ligada (padrão desligada): Caixa não fecha com despesa obrigatória sem comprovante nem aceite. B 1 d, F 0,5 d, Q 1 d.

## 5. Migração e dados existentes
Despesas antigas continuam como estão; sem conta retroativa automática. Primeiro diag somente leitura `GET /api/admin-exec/diag-despesas-sem-conta` (por mês e categoria: quantidade e valor sem lançamento; o que já bate com `ContaPagar` de mesmo valor e data = possível lançamento manual duplicado; se a conta de espécie tem extrato importado). Dimensionar com o dump de 15 min (`pg_restore -t despesas` para `hoje.despesas`; `SELECT date_trunc('month', data_referencia::date) mes, categoria, count(*), sum(valor::numeric) FROM hoje.despesas GROUP BY 1,2 ORDER BY 1 DESC,2;`). Só depois da decisão do dono, script admin `?dry=1` que lança retroativamente por mês, de trás para frente, com `desfazer` por lote; sugestão: começar do mês corrente para frente.

## 6. Riscos
1. `ContasPagarPage.jsx`: componente novo + edição mínima; `git diff HEAD` do arquivo antes; índice git compartilhado (`git diff --cached --stat` vazio, add+commit na mesma linha); avisar a outra sessão.
2. `$transaction` sempre com `{timeout:20000,maxWait:10000}`; IA, arquivo, log, notificação fora.
3. Upload `../uploads/anexos` (contar níveis a partir de `routes/`/`services/`; `grep -rn "uploads/" backend`); prova em produção atravessando deploy.
4. Permissões front = back: ver/baixar anexo = `Pode_Acessar_Contas_Pagar`; anexar/remover/lançar = `Pode_Baixar_Contas_Pagar`; despesa: `Pode_Acessar_Caixa`/`Pode_Editar_Caixa`; permissão é objeto: testar com perfil limitado.
5. PWA: rota de arquivo `no-store`; não usar URL pública.
6. Datas: `dataReferencia` é texto `YYYY-MM-DD`; converter com fuso America/Sao_Paulo (`parseVencimento`); nunca `new Date('YYYY-MM-DD')` sem fuso.
7. DRE: depois da F3 sobe nas categorias mapeadas; avisar o dono; `indicadoresCustoService` marca `compraDeEstoque` por categoria: `MERCADORIA_EMPRESA` não deve cair em categoria de compra de estoque sem decisão.
8. Conciliação: provar por diag que a Caixinha não tem extrato; testar a tela antes e depois.
9. `/api/ia-consulta/v1` não é tocado (grep).
10. Backup diário de uploads: ~300 KB/foto × 30/dia ≈ 9 MB/dia ≈ 3,3 GB/ano; medir `uploads/` antes.
11. Costura back × front: QA clica o fluxo completo; dev-front recebe exemplos de resposta reais.

## 7. O que NÃO fazer
Não remover `pdfPath`/`temPdf`/`pdfNome`; não mover/renomear PDF existente; IA/arquivo/log/webhook fora de `$transaction`; não criar conta ao salvar a despesa; não baixar em conta financeira de banco (só Caixinha); não alterar a fórmula do valor a prestar (`caixa.js:795`, `caixaConferenciaService.js:85`); erro no lançamento nunca desfaz nem bloqueia a despesa; não servir anexo por `/uploads` público; `window.open` não para documento interno; `SelectBusca`, não `<select>`; não persistir busca por texto; nenhuma coluna/UNIQUE nova em `despesas` ou `contas_pagar`; não tocar em NF-e de devolução, WhatsApp, `/ia-consulta/v1`.

## 8. Decisões do dono (com sugestão)
1. Lançamento automático ou pelo escritório? **Escritório por 2 semanas; depois automático no fechamento do caixa, por chave.**
2. Categoria padrão: COMBUSTIVEL→"Combustível", PEDAGIO_BALSA→"Pedágio", MANUTENCAO_VEICULO→"Manutenção de veículos", HOTEL_HOSPEDAGEM→"Hospedagem/viagem", MERCADORIA_EMPRESA→definir (dupla contagem de custo), OUTRO→escritório escolhe; mapa em `app_configs`; dono confirma nomes reais.
3. Fornecedor obrigatório? **Opcional** (posto raramente cadastrado).
4. Retroativo? **Não lançar histórico; começar do mês seguinte**; se quiser, só depois do diag.
5. Foto obrigatória: combustível, manutenção, pedágio; hotel/mercadoria/outro opcionais; começar em modo teste.
6. Retenção do comprovante: **5 anos**; sem apagar automático nesta entrega.
7. Anexo público ou autenticado: **autenticado**.
8. Quem anexa/remove: `Pode_Baixar_Contas_Pagar`; remover só o autor ou admin.
9. Despesa lançada, motorista ainda edita? **Não**; escritório desfaz, edita e lança de novo.
10. Conta já lançada à mão: **"Vincular a conta existente"** em vez de criar de novo.

## 9. Porte
Grande (financeiro). Equipe completa. Total F1–F5: B ≈ 10,5 d, F ≈ 8,5 d, Q ≈ 7 d, R ≈ 2,5 d. Publicar F1 isolada primeiro.
