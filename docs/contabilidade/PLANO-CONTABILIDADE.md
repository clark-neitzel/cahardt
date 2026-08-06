# Plano — Área "Contabilidade" (Administração) — v2

> Objetivo: acabar com o vai-e-vem de dúvidas da contabilidade. Área nova em
> **Administração → Contabilidade**, acessada pelo contador com **cadastro próprio e
> permissão exclusiva (somente consulta)**.
>
> Mockup aprovação: `docs/contabilidade/mockup-contabilidade.html` (v2 — visual sóbrio/compacto)
> Status: **PLANO — nada implementado ainda.**
> Decisões do dono (06/08/2026): rateio DRE visível; fornecedor pelo cadastro; notas de
> entrada mostram suas parcelas; exportação em toda aba; corrigir armadilhas de ID/datas;
> sugestões extras aprovadas; permissão nova para o contador.

## Exportação — padrão de TODAS as abas

- **CSV** (padrão do Relatório de Vendas: `;`, BOM, vírgula decimal) — respeita filtros e colunas.
- **PDF / Imprimir** — impressão na própria página (`@media print`, padrão iPad), "Salvar como PDF".
- **OFX** — só na aba Extratos (re-exportar o extrato no formato que sistemas contábeis leem). Nas demais abas OFX não se aplica.
- **ZIP** — XMLs (aba Notas) e Pacote do Mês.

## Fase 0 — Fundação: corrigir as "armadilhas" (IDs e datas)

O dono confirmou: falta de vínculo formal complica a conciliação — corrigir antes de construir os relatórios.

1. **`contaFinanceiraCaId` vira vínculo de verdade** (hoje é texto solto sem FK em `Parcela`, `PagamentoParcela`, `PagamentoParcelaPagar`, `ContaPagar`, `ExtratoLancamento`, `ExtratoImportacao`, `ConciliacaoGrupo`, `TransferenciaConta`, `AjusteSaldoConta`):
   - rota admin `diag-contas-financeiras-orfas`: lista valores que não existem em `ContaFinanceira`;
   - corrigir órfãos (criar a conta faltante inativa ou apontar para a certa);
   - só então adicionar as `@relation` no schema (adicionar FK **não** dropa coluna — seguro para o `db push`; mas com órfão no banco o push falha, por isso a limpeza vem antes).
2. **Categoria por nome → por ID**: nova coluna `categoriaDespesaId` em `ContaPagar`/`ContaPagarRateio`/`NotaEntradaItem` (a coluna `categoria` texto fica como legado, regra do schema), backfill pelo nome, FK para `CategoriaDespesa`.
3. **Datas que faltam** (adicionar coluna é seguro):
   - `ContaPagar.dataEmissao` (backfill: `NotaEntrada.emissao` → `competencia` → `criadoEm`); `competencia` passa a ser sempre preenchida no lançamento;
   - `NotaEntrada.dataEntrada` (backfill: `entradaRegistradaEm` → `criadoEm`); preenchida em todo caminho novo (gerar conta, vincular, registrar entrada);
   - Receber já tem `createdAt` em conta e parcela — só expor.
4. Normalizar `formaPagamento` legada ("À vista - Dinheiro: R$ 250,36" → "Dinheiro") por script de backfill + normalização na leitura.

## As 5 abas

### 1. Contas a Receber (relatório dinâmico, motor do Relatório de Vendas)
- Visões **Títulos (competência — por data de criação)** e **Recebimentos (caixa — 1 linha por baixa, `PagamentoParcela` com `estornado:false`)**.
- Colunas (pílulas, ordem arrastável, **salvas por usuário**): pedido, criação, cliente+CNPJ/CPF, nota fiscal (NF-e CA / NF-e app / Especial sem nota / Importada CA — nº, série, chave), vencimento, valor, forma, banco da baixa, data baixa, status, vendedor, baixado por, desconto+motivo, conciliado?, origem, condição.
- Filtros `FiltroPeriodo` + `useFiltrosSalvos`; excluir ruído (EXCLUIDO/CANCELADO/bonificação/estornos).

### 2. Contas a Pagar
- Visões **Contas (competência)**, **Pagamentos (caixa)** e **Por categoria (DRE)**.
- **Rateio DRE aberto por linha**: conta com itens de categorias diferentes aparece "RATEADA" e expande as linhas do rateio (matéria-prima × uso e consumo × …). Totais por categoria **sempre pelo rateio** (`ContaPagarRateio`), nunca só pela categoria principal. Card-resumo por categoria com a classificação (Operacional/Financeiro · Fixa/Variável) vinda de `CategoriaDespesa`/`GrupoDre`.
- Pagamentos: `PagamentoParcelaPagar` (`estornado:false`), valor efetivo = `valorPago + juros + multa`; colunas juros/multa/desconto opcionais; anexo PDF.
- Fornecedor sempre pelo **cadastro** (`fornecedorId`), CNPJ junto.

### 3. Extratos + Conciliação
- Extrato importado (OFX bancos / Asaas / CA) por conta+período com coluna **Identificação**: 1↔1 (pedido/NF/quem baixou), grupo (N títulos + diferença e motivo), transferência interna (fora da DRE), ignorado (motivo), pendente (destacado).
- Export: **CSV com conciliação**, PDF, impressão e **OFX**.
- Nunca somar extrato + ledger no mesmo total (linhas `ca-*` derivam do ledger — dupla contagem).

### 4. Notas de Entrada (produto e serviço)
- Lista com sub-abas Todas / Produto (NF-e) / Serviço (NFS-e); fornecedor do cadastro; emissão + **entrada** (campo novo da Fase 0); XML para baixar; ZIP do mês.
- **Cada nota mostra suas parcelas a pagar** (vencimento, valor, situação e banco), cobrindo os 3 destinos:
  - `GEROU CONTAS A PAGAR` (via duplicatas → `ParcelaPagar`);
  - `VINCULADA` a parcelas já lançadas (`NotaEntradaParcela` — sem esse caminho as NFs de contrato somem do relatório);
  - `SEM PAGAMENTO` (bonificação/amostra/comodato, pelo `motivoEntrada`).
- Notas de **saída** ficam na tela Notas Fiscais existente + Pacote do Mês.

### 5. Pacote do Mês (ZIP num clique) — sugestões aprovadas incluídas
CSV+PDF receber e pagar (com rateio DRE) · extratos com conciliação por conta (CSV+OFX) · XMLs saída (vendas+devoluções, app e CA) · XMLs entrada (NF-e + NFS-e) · transferências/ajustes de saldo · **tarifas e taxas Asaas** · **posição de estoque no fim do mês (custo médio)** · **devoluções do mês com NF própria**.

## Permissão do contador

- Chave nova `Pode_Acessar_Contabilidade` ("Contabilidade (consulta)"), grupo Financeiro do painel de permissões (**entrada no BOOL_INDEX obrigatória**).
- Rotas `/api/contabilidade/*` são **somente leitura** (GET/export) — dá para liberar ao escritório sem risco; nenhuma ação de escrita nessa área.
- Dono cria o cadastro do contador em Usuários com só essa permissão ligada; a tela inicial dele cai direto na Contabilidade.

## Implementação

- **Backend**: `backend/routes/contabilidadeRoutes.js` — `relatorio-receber`, `relatorio-pagar` (+rateio), `extrato-conciliado`, `notas-entrada` (+parcelas), exports (CSV no front; OFX e ZIP com `archiver` em streaming no back).
- **Frontend**: `frontend/src/pages/Admin/ContabilidadePage.jsx` (5 abas), menu em Administração, `lazyComRetry`. Padrões: `FiltroPeriodo`, `useFiltrosSalvos` (incl. colunas visíveis+ordem — corrigindo o gap do Relatório de Vendas), `SelectBusca`, mobile (tabela→cards), impressão na própria página, build antes do commit.
- Manual da aba + Clippy + página de novidade ao publicar cada fase.

## Fases

0. **Fundação** — órfãos de conta financeira + FKs, categoria por ID, datas de emissão/entrada, normalização de forma de pagamento. (Mexe em schema/produção — testar atravessando um deploy.)
1. **Contas a Receber** + criação da aba, menu e permissão do contador.
2. **Contas a Pagar** com rateio DRE.
3. **Extratos com identificação** (CSV/OFX).
4. **Notas de Entrada com parcelas + Pacote do Mês.**
