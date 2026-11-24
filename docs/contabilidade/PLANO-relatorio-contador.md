# PLANO — Relatório completo para o contador (Contabilidade)

Autor: arquiteto · 24/11/2026 · Porte: **GRANDE** (financeiro/fiscal; 3 etapas) · Mockup aprovado: `docs/contabilidade/proposta-relatorio-contador.html`
Equipe: `dev-backend` + `dev-frontend` em paralelo (contrato da seção 3 é a costura) → `qa-testador` + `revisor-codigo` → `gerente-entrega`.

Legenda: **[LI]** = li o código e confirmei · **[SUP]** = suposição/decisão de projeto (não é fato do código).

---

## 0. Entendimento do pedido

O contador vê "Matéria Prima — R$ 71.325,83" e pergunta "de quem? de quê?". O dono quer, embaixo de cada categoria: fornecedor → nota → produtos, com a soma fechando; e um Excel/CSV com TODOS os dados visíveis (vencimento, pagamento, forma, banco…), **uma linha por produto**. Interpretação adotada: a visão "Por categoria (DRE)" do Contas a Pagar vira árvore; o "Abrir até" controla a profundidade em tela, impressão e CSV; nada de reclassificar categoria; só ler e somar.

## 1. Mapa do código atual (confirmado lendo)

- `backend/routes/contabilidadeRoutes.js`
  - `GET /relatorio-pagar` linhas 403–627. Ramo `categorias` 506–544 **[LI]**: só usa `whereConta` (emissão, fornecedor, categoria). **Ignora vencDe/vencAte/pagDe/pagAte/status/documento/forma/banco** — mas a tela ainda mostra os filtros de vencimento e pagamento nessa visão (AbaPagar.jsx 156–165): hoje eles não fazem nada. Linhas do ramo não têm `valorPago`, por isso `resumo.pagoTotal` (linha 614) dá 0 = o bug do "Pago R$ 0,00" **[LI]**.
  - `take: LIMITE_LINHAS + 1` (8000) **sem `orderBy`** → se estourar, corta um pedaço arbitrário e só marca `truncado` **[LI]**.
  - `SELECT_CONTA_PAGAR` (392–398) não traz parcelas, pagamentos nem itens **[LI]**.
  - `resolverDocPagar` (368) devolve só 4 tipos: NFE, NFSE, IMPORTADO_CA, SEM_DOC **[LI]**. O mockup mostra "Fatura/Guia/Recibo/Contrato/NFC-e": **não existem no sistema** (ver seção 9).
  - `/pacote-mes` (1015+) **não chama** `/relatorio-pagar` nem a função do ramo categorias; monta seus próprios CSVs com consultas próprias (item 03 por emissão, item 04 pagamentos) **[LI]**. Não é afetado se eu só ADICIONAR código.
- Consumidor de `/relatorio-pagar`: **só** `AbaPagar.jsx:52` (grep no repo inteiro: `backend`, `frontend/src`, `docs`; sem import dinâmico) **[LI]**. `financeiroGerencial*` lê `contaPagarRateio` por conta própria (não usa essa rota).
- Frontend: `AbaPagar.jsx` (353 linhas) monta `CAB`/`linhaCsv` por visão; KPI "Filtros ativos" (linha 117); `comum.js` tem `imprimirConteudo`/`imprimirTabela` no **padrão ANTIGO** (só `@media print`, `@page` sempre paisagem 10mm, ignora `@page` do chamador) **[LI]**.
- **Achado:** `ContabilidadePage.jsx:99` tem uma **cópia própria** de `imprimirConteudo` (padrão antigo), separada de `comum.js` **[LI]**. Consumidores de `comum.js`: AbaPagar, AbaExtratos, AbaNotas (imprimirTabela) e AbaPacote (só download). Referência moderna com largura configurável: `frontend/src/pages/Relatorios/RelatorioVendas.jsx:204` (`imprimirConteudo(estilos, html, larguraMm)`) — **é melhor modelo que o ReceitaDetalhe** para paisagem.

---

## 2. Respostas às 9 perguntas

### P1 — Rateio × itens (onde vão frete, desconto, IPI/ST, arredondamento) [LI] `notasEntrada.js:121–158, 1797–1880`
Ao gerar a conta de uma NF-e, `calcularRateio(vNF, itens, padrão)` distribui **o valor TOTAL da nota (vNF)** entre as categorias **proporcionalmente à soma de `vProd` de cada categoria**; a última categoria absorve o centavo de arredondamento. Logo, **cada `ContaPagarRateio.valor` já contém a fatia proporcional de frete, seguro, outras despesas, IPI/ST e desconto da nota** — não existe lugar separado. Cada `NotaEntradaItem` guarda `categoria`/`categoriaDespesaId` (gravado no mesmo fluxo, `gravarCategoria:true`, linha 1535) e `valorTotal` = vProd.
**Regra do relatório (exata):** para cada (conta, categoria-do-rateio):
`linha de ajuste = rateio.valor − Σ(valorTotal dos itens dessa categoria)`.
Rótulo "Frete e outros valores da nota" (valor pode ser negativo se houve desconto). Só emite a linha se `|ajuste| ≥ 0,005`. Resultado: Σ(produtos) + ajuste = rateio.valor **por construção**, centavo a centavo, sem recalcular nada.
Casamento item↔rateio: pelo **nome da categoria** (`item.categoriaDespesa?.nome || item.categoria`, vazio → "Sem categoria"; o ramo atual usa o mesmo fallback, linha 521). Item que não casa com nenhum rateio (nota antiga/categoria renomeada/item sem categoria): se a conta tem 1 rateio → vai nele; se tem vários → vai para o rateio de **maior valor** com `divergente:true`, e o ajuste desse rateio absorve a diferença (a soma continua fechando). Contador `resumo.avisos.itensSemCategoriaCorrespondente`.
Base de verdade do total: **sempre o rateio** (como a visão antiga), nunca a soma dos itens.

### P2 — Despesa manual com `CompraItem` [LI] (`compraEstoqueService`, `contasPagar.js:1219`)
- `CompraItem` não tem categoria. Despesa manual **não cria rateio** (grep: só `notasEntrada`, `importacaoCaService`, `caExtratoService` criam `ContaPagarRateio`) → tem categoria única na conta (`categoriaDespesaId`/`categoria`). Itens vão para essa categoria; ajuste = `valor da categoria − Σ CompraItem.valorTotal` (rótulo "Outros valores / diferença da despesa"; a própria rota PUT /itens já avisa que a soma não precisa bater).
- Conta manual **com** rateio e itens (não existe hoje, mas pode vir de conciliação): aplica a regra de "item sem correspondência" da P1 (maior rateio, `divergente:true`).
- **Fonte dos itens, por conta (decisão determinística):** se a conta tem `notaEntrada` com itens → `NotaEntradaItem`. Senão → `CompraItem` com `contaPagarId = conta.id`, `estornado=false`. **Nunca os dois** — nota de entrada gera `CompraItem` com `notaEntradaId` preenchido e `contaPagarId` (notaEstoqueService.js:300–309); somar os dois duplicaria (armadilha).
- Campos do `CompraItem`: produto = `descricaoFornecedor`; qtd = `quantidadeFornecedor`; un = `unidadeFornecedor`; valor unit. = `valorTotal / quantidadeFornecedor` (6 casas; vazio se qtd 0); NCM/CFOP/código = vazio (não existem aí) **[SUP: dono aceita vazio; alternativa futura: NCM do `Produto` via `produtoId`, +1 consulta]**.

### P3 — Conta sem itens (energia, salário, imposto, IMPORTADO_CA, NFS-e)
Uma linha por categoria do rateio (ou 1 se não há rateio), `produto` vazio, `descricao` = `conta.descricao`, `referenteA` = mês de `competencia`. Sem linha de ajuste. Vale também para NF-e cujos itens vieram zerados.
**Limitação v1 [LI]:** NF recebida **vinculada a parcela já lançada** (`NotaEntradaParcela`, `notasEntrada.js:1285`: "contaPagarId NÃO é tocado") não tem itens ligados à conta → sai como "sem itens". É o caso típico das contas importadas do CA. `resumo.avisos.contasComNotaVinculadaSemProdutos` conta quantas. Cobrir isso exige ratear `valorVinculado` entre contas — fica **fora da v1** (decisão D4).

### P4 — Várias parcelas, pago/aberto, juros/multa/desconto
Fatos [LI]: `ParcelaPagar.valorPago` = Σ ledger `valorPago` **sem** juros/multa e **sem** desconto (`recalcularParcelaEConta`, contasPagarCaSyncService.js:118–133); a quitação nominal é `valorPago + desconto` (contasPagar.js:212–217); juros/multa são extra, fora do limite.
Definições por **conta** (ledger `estornado=false`, parcelas não `CANCELADO`):
- `pago` = Σ `valorPago`; `desconto` = Σ `desconto`; `jurosMulta` = Σ(`juros`+`multa`); `aberto` = `valorBase − pago − desconto`, com `valorBase` = Σ valor dos rateios (= valor da conta; local: 0 divergências em 426 contas).
- Strings da célula: vencimentos = datas das parcelas ordenadas, `dd/mm/aaaa` unidas por `"; "`; datas de pagamento / formas / bancos / "baixado por" = **valores distintos** do ledger, ordenados, unidos por `"; "`. `Parcelas` = `"pagas/total"` (ex.: `1/2`).
- **Rateio exato do último centavo** — função pura `ratear(totalCentavos, pesosCentavos[])` (inteiros em centavos): todas as linhas `round(total·peso/Σpesos)` exceto a de **maior peso (empate: a primeira)**, que recebe `total − Σ(outras)`. Soma = total, sempre. Soma de pesos 0 → tudo na 1ª linha. Aplicada em 2 níveis: (1) conta → categorias (peso = valor do rateio); (2) categoria → linhas (produtos + ajuste; peso = valor da linha). Faz o mesmo para `pago`, `desconto`, `jurosMulta`; `aberto` da linha = `valor − pago − desconto` (identidade, não rateada de novo).
- **Juros/multa/desconto — escolha: RATEAR igual** (mesma função). Motivo: a coluna fica somável, como Pago/Em aberto; repetir exigiria "não somar" e o contador somaria errado. Cabeçalhos: "Juros e multa (rateado)", "Desconto (rateado)". Juros/multa **não** entram na identidade `valor = pago + desconto + aberto` (são acréscimo; caixa = pago + juros + multa). Linha com peso negativo (ajuste de desconto) pode receber pago negativo; soma continua exata (aceito, raro).
- `aberto < 0` (pagou além) não é "clampado" (quebraria a identidade): marca `conta.avisos` e conta em `resumo.avisos.pagoAcimaDoValor`.
- Situação `st`: `Pago` (conta QUITADO) · `Parcial` (PARCIAL) · `Vencido` (há parcela não paga com vencimento < hoje em SP) · `Aberto`.

### P5 — Filtro de período na visão detalhada e significado de "Pago"
Hoje a visão ignora venc/pag (acima). **Decisão: o período da visão detalhada é a EMISSÃO** (`dataEmissao`, o mesmo do ramo atual, do Pacote 03 e do KPI antigo) — assim "soma do CSV = total da visão antiga" é testável. Filtros "Vencimento" e "Pagamento (baixa)" ficam **escondidos** quando a visão é Por categoria (eram enganosos). `fornecedor` e `categoria` continuam (conta-level). Documento/forma/banco/status continuam não se aplicando (já escondidos) — o aviso "sem documento fiscal" faz o papel do documento. Contas com `dataEmissao` nulo somem quando há período (local: 0; produção: conferir — o backfill da Fase 0 as preencheu).
**"Pago" nessa visão = tudo que já foi pago das contas emitidas no período, até hoje** (não "pago dentro do período"). O rótulo da tela deve dizer "Pago (até hoje)". "Pago *até a data X*" é a Posição em aberto (etapa 3).

### P6 — Volume e desempenho
Mesmo endpoint, `detalhe=1` opcional. Sem `detalhe`: só soma por categoria + `pago/aberto` (1 consulta de contas já com parcelas+ledger aninhados, em lote do Prisma — sem N+1). Com `detalhe=1`: +2 consultas de itens (`NotaEntradaItem where notaEntradaId in`, `CompraItem where contaPagarId in`, listas em blocos de 1000 ids) + conciliação (já existe `idsConciliadosPagar`) + anexos (`anexoService.idsContasComAnexo`) + bancos. ≈ 8 consultas fixas, independentes do nº de contas. Frontend **sempre** pede `detalhe=1` na visão categorias; o parâmetro existe para o Pacote do Mês/IA poderem chamar leve no futuro. Payload normalizado (contas 1×, linhas referenciam `contaId`) + gzip (`compression()` já ligado, `backend/index.js:111`). Estimativa mês: ~300 contas, ~3.000 linhas ≈ 1 MB JSON. **Teto novo `LIMITE_LINHAS_DETALHE = 20000` linhas** + `orderBy` determinístico; estourou → `resumo.truncado=true`.
**Regra de segurança: se `truncado`, o CSV é bloqueado** (botão desabilitado com a mensagem "período grande demais — o arquivo sairia incompleto") — relatório incompleto indo ao contador é pior que erro. Hoje o CSV exporta truncado em silêncio.

### P7 — Compatibilidade [LI]
Único consumidor: `AbaPagar.jsx`. Só **adicionar**: em `linhas[]` da visão categorias os campos antigos (`id, categoria, classificacao, natureza, grupoDre, contas, valor, percentual`) ficam **idênticos**; acrescento `valorPago`, `valorAberto`, `desconto`, `grupoDreOrdem`, `foraDre`. `resumo` mantém `linhas, valorTotal, pagoTotal, truncado` (`pagoTotal` passa a ser real) + novos. `/pacote-mes` intocado. Nenhuma outra rota muda de contrato.

### P8 — Migrar a impressão (`comum.js`) agora?
**Recomendo migrar `comum.js` NESTA entrega.** Razões: a árvore longa e paisagem é justamente o caso que quebra no iPad (o padrão antigo foi a causa do bug de Receitas); é entregar o relatório principal com impressão sabidamente frágil. Risco controlado: manter a **mesma assinatura** `imprimirConteudo(estilos, html)` + 3º parâmetro opcional `larguraMm` (padrão 277 = A4 paisagem − 2×10mm), honrar `@page` do chamador com padrão `A4 landscape; margin:10mm` (comportamento atual). Copiar o corpo de `RelatorioVendas.jsx:204–252`. Efeito: Pagar, Extratos e Notas (via `imprimirTabela`) mudam de mecanismo → **QA tem que imprimir/pré-visualizar as 3 abas**. A **cópia local de `ContabilidadePage.jsx:99`** (Receber): trocar por `import { imprimirConteudo } from './comum'` (remove duplicata; entra naturalmente na etapa 2, que mexe nesse arquivo). Se o dono preferir risco mínimo: migrar só na etapa 1 o `comum.js` e a cópia do Receber na etapa 2 — é o que o plano assume. Não migrar fora da pasta Contabilidade (Financeiro/*, RH/*, PCP/* continuam pendência do CLAUDE.md).

### P9 — Dados para o QA [LI] consultei `hardt_local` (somente leitura)
Local tem: 426 contas, 482 rateios (65 contas com 2+ rateios, vindas de importação do CA), 9 categorias `FORA_DRE`, 9 contas sem categoria, 1 conta com 2+ parcelas, 367 baixas, 4 contas manuais com `CompraItem`, **0 notas de entrada e 0 itens de nota**. Faltam: nota com itens/frete, rateio de nota, parcela paga + aberta com juros/multa/desconto. **Precisa de seed**: `backend/scripts/seed-cenarios-relatorio-contador.js`, modelado em `seed-cenarios-correcao-despesa.js`, **1ª linha executável** `require('./exigir-banco-local')('seed-cenarios-relatorio-contador.js')`, carimbo `QA-REL-CONTADOR` na `descricao`/`fornecedorNome`, modo `--limpar` que apaga só o carimbo. Todas as emissões em **08/2026** (QA filtra Este mês = agosto/2026). Cenários (todos com fornecedor próprio do carimbo; cada um com a soma esperada documentada no cabeçalho do script):
1. NF-e 3 categorias, itens de 333,33 + frete + vNF 1.000,01 (testa arredondamento do último centavo e ajuste).
2. NF-e 2 categorias com **frete** (ajuste positivo) e a categoria padrão usada por 1 item.
3. NF-e 1 categoria com **desconto** maior que o frete (ajuste **negativo**).
4. Conta **2 parcelas**: 1ª paga (juros 1,50 + multa 0,50 + desconto 2,00, banco/forma preenchidos, ledger conciliado em 1 caso), 2ª aberta e vencida.
5. Conta 3 parcelas, 1 paga + pagamento **estornado** (não pode contar).
6. Despesa manual com 2 `CompraItem` (sem nota) — usar o fluxo `registrarCompras` como o seed existente faz.
7. Conta sem itens (energia) paga, 1 parcela.
8. Conta numa categoria `FORA_DRE` (usar uma das 9 existentes, ex.: "Antecipação de Lucros", ou criar uma do carimbo com `classificacao:'FORA_DRE'`).
9. Conta **sem categoria** e sem rateio (aparece em "Sem categoria").
10. Conta `SEM_DOC` (manual, sem nota/chave) — alimenta o aviso "lançamentos sem documento fiscal".
11. NF-e legada: itens com `categoria=null` e 2 rateios (testa `divergente:true`).
12. NF-e emitida por **NFC-e** (chave com modelo 65) para o rótulo do tipo.
O QA também usa os dados reais locais (65 contas com 2+ rateios) para a prova "soma = visão antiga".

---

## 3. Contrato da API — etapa 1 (`dev-backend` entrega, `dev-frontend` consome)

`GET /api/contabilidade/relatorio-pagar?visao=categorias&detalhe=1&emissaoDe=YYYY-MM-DD&emissaoAte=YYYY-MM-DD[&fornecedor=texto][&categoria=a,b]`
Permissão: a mesma (`checkAcesso`: `perms.admin || perms.Pode_Acessar_Contabilidade`) — **nenhuma rota nova de permissão**; o front já espelha (`ContabilidadePage` guarda a aba).
Sem `detalhe=1`: resposta idêntica à de hoje + campos novos de resumo/linhas, **sem** `contas` e `itens`.

Regras gerais: valores em **reais com 2 casas (number)**; datas **ISO** (`2026-08-04T15:00:00.000Z`) — o front formata em `America/Sao_Paulo` com `fmtData` (igual ao resto); strings concatenadas ("; ") são montadas **no backend** (uma fonte da verdade, a mesma serve futuramente ao Pacote). Tudo somável é marcado `soma`.

```jsonc
{
  "visao": "categorias", "detalhe": true,
  "resumo": {
    "linhas": 51,                    // nº de categorias (compat.)
    "valorTotal": 258123.45,         // soma de todas as categorias (compat.)
    "pagoTotal": 187001.10,          // AGORA REAL (era 0)
    "abertoTotal": 71122.35,
    "descontoTotal": 12.00, "jurosMultaTotal": 31.50,
    "dre":      { "categorias": 43, "valor": 221000.00, "pago": 160000.00, "aberto": 61000.00 },   // classificacao != FORA_DRE
    "foraDre":  { "categorias": 8,  "valor": 37123.45,  "pago": 27001.10,  "aberto": 10122.35 },   // classificacao == FORA_DRE
    "semDocumento": { "contas": 9, "valor": 4212.80 },       // doc.tipo === 'SEM_DOC' (NÃO conta IMPORTADO_CA)
    "contas": 312, "truncado": false,
    "avisos": { "itensSemCategoriaCorrespondente": 0, "contasComNotaVinculadaSemProdutos": 14,
                "contasValorDivergenteDasParcelas": 0, "pagoAcimaDoValor": 0 }
  },
  "bancos": [{ "id": "...", "nome": "Sicredi" }],
  "linhas": [                        // resumo por categoria — campos antigos INTACTOS + novos
    { "id": "Matéria Prima", "categoria": "Matéria Prima", "classificacao": "OPERACIONAL", "natureza": "VARIAVEL",
      "grupoDre": "Custos variáveis", "contas": 45, "valor": 71325.83, "percentual": 27.63,
      "valorPago": 52341.33, "valorAberto": 18984.50, "desconto": 0, "grupoDreOrdem": 1, "foraDre": false }
  ],
  // somente com detalhe=1:
  "contas": [                        // UMA entrada por conta (dados repetidos nas linhas ficam aqui)
    { "id": "uuid", "fornecedor": "Moinho Vale do Trigo Ltda", "fornecedorDoc": "12345678000190",
      "descricao": "NF-e 45812 — Moinho…", "origem": "NFE",
      "documento": { "tipo": "NFE", "rotulo": "NF-e", "numero": "45812", "chave": "4126…(44)" },  // rotulo: NF-e|NFC-e|NFS-e|Importada (antiga)|Sem documento
      "emissao": "2026-08-04T…", "referenteA": "08/2026",             // competencia → MM/AAAA
      "parcelas": "1/2", "vencimentos": "03/09/2026; 03/10/2026",
      "situacao": "Parcial",                                           // Pago|Parcial|Aberto|Vencido
      "datasPagamento": "10/09/2026", "formas": "PIX", "bancos": "Sicredi", "baixadoPor": "Maria",
      "conciliado": "Parcial",                                         // Sim|Não|Parcial|"" (sem baixa)
      "temAnexo": true, "valorNota": 8060.00,                          // = conta.valorTotal; NÃO somar
      "pagoConta": 4030.00, "descontoConta": 0, "jurosMultaConta": 0, "abertoConta": 4030.00,
      "avisos": [] }                                                    // 'VALOR_DIVERGE_PARCELAS' | 'PAGO_ACIMA' | 'ITEM_SEM_CATEGORIA' | 'NOTA_VINCULADA_SEM_PRODUTOS'
  ],
  "itens": [                         // UMA entrada por linha do CSV, já na ordem final do relatório
    { "contaId": "uuid", "categoria": "Matéria Prima",
      "tipoLinha": "PRODUTO",        // PRODUTO | AJUSTE | SEM_ITENS
      "produto": "Farinha de trigo tipo 1 — saco 25 kg",              // AJUSTE: "Frete e outros valores da nota"; SEM_ITENS: ""
      "codigoFornecedor": "FAR-25", "ncm": "11010010", "cfop": "5101",
      "quantidade": 80, "unidade": "SC", "valorUnitario": 96.5,
      "valor": 7720.00,               // soma  ← "Valor nesta categoria"
      "pago": 3860.00, "aberto": 3860.00, "desconto": 0.00, "jurosMulta": 0.00,   // soma
      "divergente": false, "semEstoqueMotivo": null }
  ]
}
```
Invariantes que o backend **garante** e o QA verifica:
- I1. `Σ itens.valor` (todas as linhas) = `resumo.valorTotal` = Σ `linhas[].valor` (visão antiga) = Σ `ContaPagarRateio.valor` (+ `valorTotal` das contas sem rateio) das contas filtradas. Centavo a centavo.
- I2. Para cada `(contaId, categoria)`: Σ `itens.valor` = valor do rateio daquela categoria; Σ por categoria = `linhas[].valor` dessa categoria.
- I3. Σ `itens.pago` = `resumo.pagoTotal` = Σ ledger `valorPago` (não estornado) das contas; idem `desconto`, `jurosMulta`; `valor = pago + desconto + aberto` em cada linha.
- I4. `contas[].valorNota` **não** entra em nenhuma soma.
- Ordem de `itens`: grupo DRE (ordem do `GrupoDre`; FORA_DRE por último, sem grupo no fim) → categoria (valor desc) → fornecedor (valor desc) → emissão → nº da nota → `numeroItem` (ajuste sempre por último na nota).
- Contas `CANCELADO` não entram (como hoje). Baixa estornada não conta.

**Constantes/ajudantes novos, no backend** — novo arquivo `backend/services/contabilidadeRelatorioService.js` (a rota fica fina; arquivo de rotas já tem 1.207 linhas): `ratear()`, `montarPagarDetalhado(filtros, prisma)`, `rotuloDocumento(conta)` (NFC-e = `chaveNfe` com 44 dígitos e posições 20–21 == `65`; é determinístico, não suposição de nome), `juntarUnicos()`. Reaproveitar, **sem alterar**, `round2`, `diaIni/diaFim`, `toList`, `idsConciliadosPagar`, `resolverDocPagar` — exportá-los do `contabilidadeRoutes.js` por `module.exports.helpers` ou passá-los por parâmetro (preferir mover para o service **só o que for novo**, sem refatorar o resto).

### 3.1 Mapeamento das 33 colunas do CSV (Pagar) → origem

| # | Coluna | Origem |
|---|---|---|
| 1 | Categoria | `itens.categoria` (nome do `ContaPagarRateio.categoria`, ou da conta se sem rateio; vazio → "Sem categoria") |
| 2 | Classificação | `CategoriaDespesa.classificacao` (+ `natureza` se ≠ A_DEFINIR), rótulo legível |
| 3 | Grupo DRE | `CategoriaDespesa.grupoDre.nome` (FORA_DRE → "Fora do resultado") |
| 4 | Fornecedor | `Fornecedor.razaoSocial` ‖ `nomeFantasia` ‖ "—" |
| 5 | CNPJ / CPF | `Fornecedor.cnpjCpf` formatado com `formatarDoc` de `utils/documento.js` (CNPJ alfanumérico — **não** normalizar na mão) |
| 6 | Tipo de documento | `documento.rotulo` (`resolverDocPagar` + modelo 65 → NFC-e) |
| 7 | Nº do documento | `ContaPagar.numeroNota` |
| 8 | Chave de acesso | `ContaPagar.chaveNfe` (como **texto** no CSV: prefixar `="…"` ou apóstrofo para o Excel não virar notação científica — armadilha real de 44 dígitos) |
| 9 | Descrição do lançamento | `ContaPagar.descricao` |
| 10 | Emissão | `ContaPagar.dataEmissao` |
| 11 | Referente a | `ContaPagar.competencia` → MM/AAAA |
| 12 | Parcelas | `pagas/total` de `ParcelaPagar` (não canceladas) |
| 13 | Vencimento(s) | `ParcelaPagar.dataVencimento` unidas por "; " |
| 14 | Situação | calculada (P4) |
| 15 | Data(s) de pagamento | `PagamentoParcelaPagar.dataPagamento` (estornado=false) distintas, "; " |
| 16 | Forma de pagamento | `PagamentoParcelaPagar.formaPagamento` distintas |
| 17 | Banco / conta | `contaFinanceiraCaId` → `ContaFinanceira.nomeBanco` (fallback "Conta desconhecida", igual ao existente) |
| 18 | Juros e multa (rateado) | Σ(`juros`+`multa`) do ledger, rateado |
| 19 | Desconto (rateado) | Σ `desconto` do ledger, rateado |
| 20 | Conciliado com extrato | `idsConciliadosPagar` (Sim/Não/Parcial) |
| 21 | Baixado por | `PagamentoParcelaPagar.registradoPor.nome` distintos |
| 22 | Produto | `NotaEntradaItem.descricao` · `CompraItem.descricaoFornecedor` · ajuste: "Frete e outros valores da nota" · sem itens: vazio |
| 23 | Código no fornecedor | `NotaEntradaItem.codigoFornecedor` (CompraItem: vazio) |
| 24 | NCM | `NotaEntradaItem.ncm` (CompraItem: vazio) |
| 25 | CFOP | `NotaEntradaItem.cfop` (CompraItem: vazio) |
| 26 | Qtd | `NotaEntradaItem.quantidade` · `CompraItem.quantidadeFornecedor` |
| 27 | Un | `NotaEntradaItem.unidade` · `CompraItem.unidadeFornecedor` |
| 28 | Valor unitário | `NotaEntradaItem.valorUnitario` · `CompraItem` = `valorTotal / quantidadeFornecedor` |
| 29 | Valor nesta categoria | `itens.valor` (**somável**) |
| 30 | Pago | `itens.pago` (**somável**) |
| 31 | Em aberto | `itens.aberto` (**somável**) |
| 32 | Total da nota (não somar) | `ContaPagar.valorTotal` |
| 33 | Anexo PDF | `!!pdfPath` ou `anexoService.idsContasComAnexo` → "Sim"/"" |

Formato do arquivo: `;` + BOM UTF-8 + decimais com vírgula (`fmtNumCsv`), como todo CSV da área. **Valor da coluna 29 numérico puro** (sem "R$") para o Excel somar. Cabeçalhos entre aspas como `baixarCsv`. Escapar `"` (`csvTexto`). Proteção contra fórmula (`=`,`+`,`-`,`@` no início de texto livre como descrição/produto): prefixar apóstrofo — dado de fornecedor é entrada externa.

**CSV nos níveis menores que Produto** (regra do "Abrir até" valer no arquivo): o front agrega as linhas do nível escolhido (chave: categoria / +fornecedor / +conta), somando `valor/pago/aberto/desconto/jurosMulta`; colunas dos níveis mais fundos ficam vazias (ex.: nível Fornecedor: colunas 6–28 de documento/produto vazias exceto fornecedor/CNPJ). Colunas 29–31 somam sempre. Coluna 32 só no nível Nota/Produto.

---

## 4. Plano de execução — ETAPA 1 (detalhe)

### 4.1 `dev-backend` — ordem
1. **Criar `backend/services/contabilidadeRelatorioService.js`**: `ratear`, `juntarUnicos`, `rotuloDocumento`, `montarPagarDetalhado`. Testes unitários **de script** (arquivo `backend/scripts/teste-ratear-contabilidade.js`, sem banco, com `assert`): `ratear(1000.01 → [333.33,333.33,333.33])` soma exata; peso negativo; soma de pesos 0; total 0; 1 linha; centavo ímpar.
2. **Alterar o ramo `categorias`** de `/relatorio-pagar` (`contabilidadeRoutes.js:506–544`) para chamar o service. Manter `whereConta` (inclui o filtro `categoria` que hoje traz a conta inteira — preservar esse comportamento). Acrescentar `orderBy` e o teto novo. Manter `linhas[]` com os campos antigos e acrescentar os novos (seção 3).
   - Consulta única de contas: `SELECT_CONTA_PAGAR` + `notaEntrada:{select:{id,tipo}}`, `competencia`, `parcelas:{where:{status:{not:'CANCELADO'}}, select:{valor,dataVencimento,status, pagamentos:{where:{estornado:false}, select:{id,valorPago,juros,multa,desconto,dataPagamento,formaPagamento,contaFinanceiraCaId,registradoPor:{select:{nome:true}}}}}}`. **Validar cada campo no `schema.prisma` antes** (regra do projeto: campo inexistente derruba a rota) — todos os campos acima conferidos **[LI]**.
   - Itens só com `detalhe=1`: `notaEntradaItem.findMany({ where:{ notaEntradaId:{in}}, select:{ notaEntradaId, numeroItem, codigoFornecedor, descricao, ncm, unidade, quantidade, valorUnitario, valorTotal, cfop, categoria, semEstoqueMotivo, categoriaDespesa:{select:{nome:true}} }, orderBy:{numeroItem:'asc'} })` e `compraItem.findMany({ where:{ contaPagarId:{in}, estornado:false, notaEntradaId:null }, select:{ contaPagarId, descricaoFornecedor, quantidadeFornecedor, unidadeFornecedor, valorTotal, criadoEm } })`. Blocos de 1000 ids. **Fonte por conta: P2.** (O `where notaEntradaId:null` já exclui as compras geradas por nota — a fonte-de-nota é só `NotaEntradaItem`.)
   - Contagem de `contasComNotaVinculadaSemProdutos`: 1 consulta `notaEntradaParcela.groupBy`/`findMany` por `parcelaPagar.contaPagarId in`, só para contas sem itens.
3. **Não tocar** `visao=contas|pagamentos`, `/pacote-mes`, `SELECT_CONTA_PAGAR` (se precisar de campos extras, criar `SELECT_CONTA_PAGAR_DETALHE` à parte — o outro select é compartilhado por 3 visões e pelo Pacote).
4. Teste com `curl` autenticado (conta com permissão) contra o backend local: conferir I1–I4 com script de soma (`jq`/node). Rodar também com o usuário **sem** `Pode_Acessar_Contabilidade` → 403.
5. Escrever o **seed** (P9) e rodar `node backend/scripts/seed-cenarios-relatorio-contador.js`; guardar a saída esperada de cada cenário no cabeçalho do script. `--limpar` testado.
6. Atualizar `backend/manuais/abas/contabilidade.md` (Pagar → Por categoria: árvore, Abrir até, Fora do resultado, Pago/Em aberto, CSV de 33 colunas, aviso sem documento fiscal, busca por produto, limitação da nota vinculada).

**Consome do frontend:** nada. **Entrega ao frontend:** o JSON da seção 3 (copiar o exemplo para o PR).

### 4.2 `dev-frontend` — ordem (pode começar em paralelo contra um JSON-fixture da seção 3)
1. **`comum.js`**: (a) migrar `imprimirConteudo` ao modo de impressão (P8) mantendo assinatura + `larguraMm` opcional; (b) novos exports reutilizáveis nas 3 etapas: `fmtPct(v)` (vírgula, 1 casa: `24,7%`), `csvLinhas`/`baixarCsv` com BOM já existente (adicionar `csvDados(cabecalhos, linhas)` que aplica o escape anti-fórmula), `fmtDocFormatado` (usa `formatarDoc`), `somarPor(linhas, chaves, campos)` (agrega para o "Abrir até" no CSV/impressão), `imprimirArvore(titulo, subtitulo, linhasPlanas, nivel)` que reaproveita `imprimirConteudo`.
2. **Novo `frontend/src/pages/Admin/Contabilidade/ArvoreRelatorio.jsx`** — componente genérico (serve Pagar, Receber e Posição): recebe `nos` (já agrupados) + `colunas` + `nivelAberto` + `renderNota`; linhas expansíveis, cabeçalho de grupo com subtotal, tabela no desktop e **cartões empilhados no mobile (≥320px, sem scroll horizontal)**; produto em mini-linha de 2 linhas (nome / `qtd × unit = total`). Tap target ≥44px no expandir.
3. **Novo `frontend/src/pages/Admin/Contabilidade/pagarDetalhe.js`** — funções **puras** (testáveis): `construirArvore(resp, {busca, soSemDoc})`, `totais(arvoreVisivel)`, `linhasCsv(resp, nivel, filtros)` (33 colunas, ordem do mockup `HP`), `cabecalhoCsv`. **Todos os totais da tela são calculados a partir de `itens` (somas de centavos em inteiro)** — uma só fonte; `resumo` do servidor serve de conferência (se divergir, mostrar aviso discreto "totais divergentes", nunca esconder).
4. **`AbaPagar.jsx`** (só o ramo `ehCategorias`):
   - 4 KPIs no lugar do "Filtros ativos" (Total lançado · Entra no resultado · Fora do resultado · Pago/Em aberto); o contador de filtros vira chip no cabeçalho do card "Filtros". KPIs das outras visões ficam como hoje, mas **a visão categorias passa a ler `pagoTotal` real**.
   - `Abrir até` (Categoria/Fornecedor/Nota/Produto) com `useFiltrosSalvos('contabilidade-pagar', …)` — chave nova `nivel` dentro do mesmo objeto (mescla com o salvo, não quebra). **Não** persistir busca de texto nem o toggle "ver só sem documento".
   - Busca "Fornecedor ou produto…": o `fornecedor` atual continua enviando ao servidor; o novo texto de produto/nota filtra **no cliente** sobre `itens` (e os totais da tela recalculam sobre o que está visível; badge "filtrado" no topo).
   - Esconder Vencimento e Pagamento (baixa) nesta visão; não contar no nº de filtros.
   - Aviso âmbar "N lançamentos sem documento fiscal — R$ X. Ver só esses" (`resumo.semDocumento`).
   - Percentual com vírgula (`fmtPct`) também no resumo de categorias e na impressão.
   - CSV: 33 colunas no nível Produto; agregado nos níveis menores; **desabilitado se `truncado`**; nome `contabilidade-pagar-categorias-<nivel>-<de>_<ate>.csv`.
   - Impressão: título, período, nível, subtotais por Grupo DRE e bloco "Fora do resultado"; paisagem; **respeita o nível**; sem quebra de linha no meio de uma nota (`break-inside: avoid` no cabeçalho+itens curtos).
   - Colunas Pago / Em aberto por categoria (tela, impressão, CSV).
   - Estados: carregando, vazio, erro, truncado. Nunca interpolar campo opcional sem guarda (`undefined` vira texto na tela).
5. `SelectBusca` para o "Abrir até" se for lista (4 opções: pode ser grupo de pílulas como o seletor de visão — **escolher pílulas**, é o padrão visual da própria aba e cabe em 375px com scroll horizontal/quebra).
6. `npm run build` (obrigatório antes de qualquer commit). Teste manual em 375px, 768px e 1280px.

**Consome do backend (campos):** `resumo.{valorTotal,pagoTotal,abertoTotal,descontoTotal,jurosMultaTotal,dre,foraDre,semDocumento,contas,truncado,avisos}`, `linhas[].{categoria,classificacao,natureza,grupoDre,grupoDreOrdem,foraDre,contas,valor,percentual,valorPago,valorAberto}`, `contas[].*` e `itens[].*` conforme a seção 3, `bancos`.

---

## 5. Esboço — ETAPA 2: Contas a Receber "Por cliente (com produtos)"
- **Backend** (`/relatorio-receber`, mesmo `detalhe=1`; função nova no service, mesma `ratear`): cliente → pedido/nota → produtos. Fonte dos produtos: `PedidoItem` (`descricao`, `quantidade`, `valor`, `produto.nome/ncm/unidade`) — **dividir o valor da conta pelos itens** pelo mesmo mecanismo (item = linha; desconto/frete do pedido = linha de ajuste). **Devolução** (`Devolucao` ATIVA + `NotaFiscalApp tipo=DEVOLUCAO`, como o item 07 do Pacote) entra como linha negativa embaixo da nota de origem; pedido **especial** = "Sem nota" (roxo); pedido `bonificacao` fora do faturado (como `SEM_RUIDO_OR`). Recebimentos por forma e banco: `PagamentoParcela` (ledger `estornado=false`; `confirmado=false` marcado como pendente, igual ao Pacote 02).
- **CFOP da venda:** fonte confiável **só** em `NotaFiscalApp.payloadEnviado.items[].cfop` (Focus) — conferido `focusNfeEmissaoService.js` (5101/5102/6101/6102, 5910/6910, 1949/2949 nas devoluções) **[LI]**. Notas antigas do CA (`pedido.nfeNumero` sem `NotaFiscalApp`) **não têm CFOP** → coluna vazia. Quadro "Faturado por tipo de operação" só soma o que tem CFOP e mostra "sem CFOP: R$ X" para fechar o total. Se o dono quiser a coluna "100%", ela fica de fora para o histórico CA (avisar o dono).
- **CSV 29 colunas** (array `HR` do mockup). **Frontend:** 3ª pílula na `ContabilidadePage` (arquivo grande: 612 linhas; criar `AbaReceberDetalhe.jsx` e importar), reusar `ArvoreRelatorio`, `Abrir até` (Cliente/Nota/Produto), trocar a cópia local de `imprimirConteudo` pela de `comum.js`.
- Riscos próprios: pedido com itens editados após a nota; valor da parcela ≠ Σ itens (frete/flex) → linha de ajuste; conta sem pedido (IMPORTADA) → "sem itens".

## 6. Esboço — ETAPA 3: aba "Posição em aberto"
- Parâmetro único `posicaoEm=YYYY-MM-DD` (padrão: último dia do mês anterior). Pagar: saldo em T = `valor da parcela − Σ(ledger não estornado com dataPagamento ≤ T: valorPago + desconto)` para parcelas de contas **emitidas até T** e não canceladas (cancelamento depois de T: usar `atualizadoEm`? **não há data de cancelamento confiável — verificar**; conta cancelada hoje é excluída → pode divergir de uma foto antiga; documentar como limitação). Receber idem com `PagamentoParcela`. Estorno posterior a T muda o passado — a "foto" é recalculada, não congelada (decisão D8: congelar snapshot exigiria tabela nova → fora do escopo).
- Faixas: a vencer / 1–30 / 31–60 / +60 dias de atraso **contados de T** (`T − vencimento`). Agrupa fornecedor → nota (pagar) e cliente → nota (receber), com `Abrir até`. Reusa `ArvoreRelatorio` + `ratear` não é necessário (nível de parcela).
- Aba nova em `ContabilidadePage.jsx` (`ABAS`) + `AbaPosicao.jsx`; endpoint novo `GET /api/contabilidade/posicao-em-aberto?lado=pagar|receber&posicaoEm=` (**rota nova → mesma `checkAcesso`**; copiar a entrada em `copilotoService.ABAS` não precisa mudar, é a mesma aba "contabilidade").
- Mockup tem "Posição em: ‹ 31/08/2026 ›" → usar `FiltroPeriodo`? Não serve (é data única); criar input de data simples com setas de mês. Decidir na etapa.

---

## 7. Arquivos — resumo por dev (etapa 1)

| Dev | Arquivo | Ação |
|---|---|---|
| backend | `backend/services/contabilidadeRelatorioService.js` | **criar** |
| backend | `backend/routes/contabilidadeRoutes.js` | alterar só o ramo `categorias` do `/relatorio-pagar` (+ exportar/injetar helpers) |
| backend | `backend/scripts/teste-ratear-contabilidade.js` | **criar** (teste puro) |
| backend | `backend/scripts/seed-cenarios-relatorio-contador.js` | **criar** (com `exigir-banco-local`) |
| backend | `backend/manuais/abas/contabilidade.md` | atualizar |
| frontend | `frontend/src/pages/Admin/Contabilidade/comum.js` | alterar (impressão modo-impressão + helpers) |
| frontend | `frontend/src/pages/Admin/Contabilidade/ArvoreRelatorio.jsx` | **criar** |
| frontend | `frontend/src/pages/Admin/Contabilidade/pagarDetalhe.js` | **criar** |
| frontend | `frontend/src/pages/Admin/Contabilidade/AbaPagar.jsx` | alterar (ramo categorias, KPIs, CSV, impressão) |
| frontend | `frontend/public/novidade-contabilidade-relatorio.html` + 1 entrada no topo de `frontend/public/novidades.json` | criar / editar **por último**, conferindo `git diff` (outra sessão mexe no `novidades.json`) |

**Fora da pasta Contabilidade (inevitável):** apenas `novidades.json` (entrada nova no topo) e o HTML de novidade. `copilotoService.js` **não precisa mudar** (rota/permissão iguais). Não tocar `backend/index.js`, `ContasPagarPage.jsx`, outros manuais (estão com mudança alheia no working tree).
Git: add explícito por arquivo; `git diff --cached --stat` vazio antes; não commitar nada fora da lista (CLAUDE.md/.gitignore/ReceitaDetalhe.jsx já estão sujos por outra sessão).

---

## 8. Riscos e o que pode quebrar

1. **Totais que não fecham** (risco nº 1): dois lugares calculando (backend e front). Mitigação: front deriva tudo de `itens`; backend garante I1–I4; QA confere nos 3 meios. Nunca recalcular rateio a partir de `Σ vProd` — usar o valor gravado.
2. **Duplicar itens** (NotaEntradaItem + CompraItem de nota): regra de fonte única por conta (P2).
3. **`Prisma not/notIn exclui null`** (memória do projeto): ao filtrar itens sem categoria/`classificacao`, usar `OR` com `null`. Aqui a maior parte do filtro de classificação é em memória (JS), não no `where`.
4. **Timezone**: `dataEmissao`/vencimentos gravados às 12:00 -03:00 (`parseVencimento`); formatar sempre com `timeZone:'America/Sao_Paulo'` (`fmtData`); nunca `toISOString().slice(0,10)` no front. No backend, strings pt-BR com `toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})` (igual `cData`).
5. **Chave de acesso (44 dígitos) e NCM/CNPJ no Excel** viram notação científica/perdem zero à esquerda → forçar texto no CSV. **Fórmula injetada** em texto vindo de fornecedor → apóstrofo.
6. **Impressão**: migrar `comum.js` afeta Extratos e Notas (QA obrigatório nelas); iPad: `print()` síncrono no clique, restauração por `afterprint/focus/pointerdown/visibilitychange`. Árvore longa: sem `position:sticky/absolute` em `#area-impressao`.
7. **Desempenho**: IN com milhares de ids (blocos de 1000); resposta ~1 MB gzip; teto 20.000 linhas; CSV bloqueado se truncado.
8. **Permissão**: nada novo; `checkAcesso` já vale (`perms.admin || perms.Pode_Acessar_Contabilidade`). Contador "externo" só tem essa permissão — o relatório **não pode** depender de nenhuma outra (ex.: não exibir link para a Nota/Contas a Pagar, que ele não acessa; PDF anexado não abre para ele → coluna só "Sim/Não").
9. **LGPD**: salário por pessoa/CPF — mockup mascarava CPF; o CSV leva `cnpjCpf` inteiro. Decisão D6.
10. **Concorrência de sessões**: `AbaPagar.jsx`/`comum.js` não aparecem como modificados na outra sessão (git status), mas `novidades.json` sim → editar por último.
11. **Memória do navegador** em iPad: 3.000 linhas na árvore → renderizar nós recolhidos sob demanda (só montar filhos de nós abertos); no nível Produto padrão "tudo aberto" pode pesar → o padrão do "Abrir até" é **Fornecedor**, e "Produto" renderiza em blocos (Carregar mais por categoria).
12. Pagamento **estornado depois** muda pago/aberto retroativamente — esperado (ledger não estornado).

## 9. Onde discordo do mockup / o dono precisa decidir

Discordâncias técnicas:
- **Tipos de documento "Fatura/Guia/Recibo/Contrato"** (exemplos do mockup) não existem no sistema. Real: NF-e, NFC-e (derivada da chave), NFS-e, Importada (antiga), Sem documento. O contador verá "Sem documento" para energia/salário — o aviso "9 sem documento fiscal" **vai contar energia, salário e imposto** (são `SEM_DOC`). Sugiro que o dono aceite isso ou que se crie depois um "tipo de lançamento" no cadastro (fora de escopo).
- **"Fora do resultado: 8 categorias"** do mockup vem das 3 categorias que o dono *pretende* marcar. O plano usa **só `classificacao === 'FORA_DRE'` do banco hoje** (local: 9) — não reclassifica nada. Se produção ainda tem "Antecipação de Lucros" como operacional, ela continuará dentro do resultado até o dono/contador reclassificar na tela de categorias (decisão D1).
- Mockup espera "Vencido" no status do documento: cálculo depende do dia da consulta (relatório impresso hoje ≠ amanhã). Mantido, com data do relatório no cabeçalho.
- CSV agregado por nível (decisão D2) é consequência de "vale para o CSV"; o arquivo que o contador usa para filtrar/somar é o de **Produto**.

Decisões do dono (com recomendação):
- **D1** Reclassificar Antecipação de Lucros / Empréstimos / Imobilizado como FORA_DRE? Não faço eu; recomendo confirmar com o contador e marcar na tela existente.
- **D2** CSV nos níveis menores sai agregado (plano) ou o CSV é sempre por produto? Recomendo: nível Produto como padrão do botão CSV e agregado só se escolher outro.
- **D3** Juros/multa/desconto **rateados** nas linhas (plano) em vez de repetidos. Recomendo rateado.
- **D4** NF vinculada depois (caso das contas importadas do CA) sai **sem produtos** na v1. Cobrir exige trabalho extra (ratear `valorVinculado`). Recomendo aceitar na v1 e medir pelo aviso `contasComNotaVinculadaSemProdutos`.
- **D5** "Pago" = pago até hoje das contas emitidas no período (não "pago no período").
- **D6** CPF completo no arquivo e **salário por pessoa**: recomendo mascarar CPF de pessoa física (`***.123.***-**`) no CSV e na tela, só liberando se o contador pedir.
- **D7** CompraItem (despesa manual) sai sem NCM/CFOP/código.
- **D8** (etapa 3) Foto "congelada" do fim do mês (tabela nova) × recalculada na hora (plano).
- **D9** CSV bloqueado quando o período estoura 20.000 linhas.

## 10. Pontos de verificação (QA e revisor)

### Critérios de aceite (todos verificáveis) — etapa 1
1. Com o seed, na tela Por categoria (agosto/2026), cada categoria abre em fornecedor → nota → produtos; cada nota mostra emissão, vencimento(s), data/forma/banco do pagamento e situação.
2. **Soma fecha**: para cada (conta, categoria) do seed, Σ produtos + linha "Frete e outros valores da nota" = valor do rateio (cenários 1, 2, 3 e 11 com centavo quebrado e ajuste negativo).
3. **Soma do CSV (coluna "Valor nesta categoria") = Total lançado da tela = Σ da visão antiga por categoria** (comparar com `GET …?visao=categorias` sem `detalhe`, e com `select sum(valor) from contas_pagar_rateio …` por SQL no `hardt_local`), no mês do seed **e** em "Todo o período" com os dados reais locais (65 contas com 2+ rateios). Diferença = 0,00.
4. Σ "Pago" + Σ "Em aberto" + Σ "Desconto (rateado)" = Σ "Valor nesta categoria", centavo a centavo; Σ "Pago" = Σ ledger não estornado (cenário 5 com estorno **não** conta). KPI "Pago" ≠ R$ 0,00 quando há baixa.
5. Cenário 4: célula de vencimentos tem as duas datas separadas por "; "; "Parcelas" = `1/2`; situação "Parcial"/"Vencido" correta.
6. "Abrir até" Categoria/Fornecedor/Nota/Produto: tela, impressão (pré-visualização) e CSV mostram **o mesmo nível e os mesmos totais**; trocar o nível mantém total; a escolha volta ao reabrir a tela (persistência por usuário); a busca **não** persiste.
7. Grupos DRE com subtotal; bloco "Fora do resultado" com as categorias `FORA_DRE` e subtotal próprio; nenhuma categoria reclassificada (`select count(*), classificacao from categorias_despesa group by 2` igual antes/depois).
8. Aviso "N lançamentos sem documento fiscal — R$ X" bate com o cenário 10 + energia/salário; "Ver só esses" filtra e recalcula.
9. Busca por produto ("farinha") mostra só as linhas que casam, com totais recalculados e indicação de filtrado.
10. Percentuais com vírgula em tela, impressão e CSV; CSV abre no Excel com `;`, acentos corretos, chave de acesso e NCM como texto, 33 colunas na ordem do mockup.
11. Conta sem itens → 1 linha, produto vazio, descrição do lançamento; conta sem categoria aparece em "Sem categoria"; conta manual com `CompraItem` mostra os produtos (e não duplica).
12. Mobile **375px**: árvore navegável, sem scroll horizontal, toques ≥44px, valores legíveis; tabela vira cartões.
13. Impressão (Chrome desktop + iPad/Safari standalone se possível): só a folha do relatório, paisagem, sem a tela do app; **e** Extratos e Notas ainda imprimem normalmente (regressão do `comum.js`).
14. Truncamento: forçar `LIMITE_LINHAS_DETALHE` baixo em teste → banner + CSV bloqueado.
15. Usuário sem `Pode_Acessar_Contabilidade` → 403 na API e aba inacessível; usuário só com essa permissão consegue gerar tudo (nenhuma chamada a rota que exija outra permissão).
16. Visões "Contas" e "Pagamentos" e o `/pacote-mes?mes=2026-08` (ZIP abre, item 03 e 04 com os mesmos totais de antes) **inalterados**.
17. `npm run build` do frontend passa; sem `console.error`; nenhum `undefined`/`NaN` visível.
18. Manual `contabilidade.md` atualizado; página de novidade + entrada no `novidades.json` (sem `og:image`, accordions abertos, mockups com legendas numeradas, sem botão "Abrir o app").

### O revisor confere
- Nenhuma alteração de `schema.prisma` (etapa 1 não precisa); `select` só com campos do schema; nenhum `$transaction` novo (rotas são GET); sem consulta dentro de loop; helpers reaproveitados; sem `window.open`/iframe; `useFiltrosSalvos` para nível e filtros, `usePeriodoSalvo` para período; `SelectBusca` se houver select; `rounded-full` nos botões; tokens do tema; `fmtData` com fuso SP; nada de `${campoOpcional}` sem guarda.

## 11. O que NÃO fazer
- Não recalcular o rateio pelos itens, não "consertar" a diferença de centavos fora da linha de ajuste, não deixar o ajuste sumir quando é negativo.
- Não somar `NotaEntradaItem` e `CompraItem` da mesma conta.
- Não usar `valorTotal` da conta como base do Pago/Em aberto por categoria — a base é o rateio.
- Não mudar `SELECT_CONTA_PAGAR`, `resolverDocPagar`, nem o ramo `contas`/`pagamentos`; não renomear campo de `linhas[]`/`resumo`.
- Não tocar em `classificacao`/`grupoDre` de categoria; não escrever nada no banco (rotas GET; o seed só roda local).
- Não carregar `detalhe` no Pacote do Mês nesta entrega.
- Não persistir busca de texto; não usar `<select>` nativo; não usar `window.open`/iframe para imprimir; não cachear a resposta.
- Não commitar arquivos da outra sessão (`CLAUDE.md`, `.gitignore`, `ReceitaDetalhe.jsx`, `backend/index.js`, `ContasPagarPage.jsx`, manuais alheios).
- Etapa 1 não precisa de teste "em produção atravessando deploy" (não grava arquivo/pasta), mas **precisa de conferência em produção depois do deploy**: abrir a visão no mês corrente, conferir I1 contra a visão antiga e o tempo de resposta (banco compartilhado é lento) antes do dono usar.

## 12. Porte
Etapa 1 **grande** (financeiro, contrato novo, 3 meios de saída); etapa 2 **grande**; etapa 3 **média**. Publicar e conferir cada etapa antes da seguinte.

---

## 13. DECISÕES DO GERENTE DE PROJETO (24/11/2026) — valem SOBRE o texto acima quando houver conflito

O dono aprovou ("pode implementar") sem responder às decisões; valem os padrões abaixo.

- **G1 (D2) — CSV SEMPRE por produto.** O dono disse: "preciso de todos os dados que são visíveis, cada produto em uma linha". O arquivo tem sempre as 33 colunas no nível Produto, qualquer que seja o "Abrir até". **Não implementar CSV agregado** (ignorar o parágrafo "CSV nos níveis menores" da seção 3.1 e o `somarPor` para CSV). "Abrir até" vale para **tela e impressão**. Nome do arquivo sem o nível.
- **G2 (D3)** Juros/multa e desconto rateados (somáveis). Cabeçalhos do CSV: "Juros e multa" e "Desconto" (sem "(rateado)").
- **G3 (D4)** Nota vinculada depois a parcela já lançada: fica sem produtos na v1. Mostrar na tela uma linha discreta (cinza) quando `resumo.avisos.contasComNotaVinculadaSemProdutos > 0`: "N lançamentos têm nota vinculada, mas os produtos ainda não aparecem aqui." — é assim que vamos medir em produção.
- **G4 (D5)** Rótulo do KPI e da coluna: "Pago (até hoje)".
- **G5 (D6)** CNPJ/CPF completo e formatado, igual às outras visões do mesmo relatório (que já mostram o documento inteiro). Não mascarar.
- **G6 (D7)** Despesa manual sem NCM/CFOP/código: aceito.
- **G7 (D9)** CSV bloqueado quando `truncado`, com mensagem clara pedindo período menor.
- **G8 — Tipos de documento reais** (NF-e, NFC-e, NFS-e, Importada (antiga), Sem documento). O aviso "sem documento fiscal" **não é alerta âmbar**: é linha informativa cinza — "N lançamentos sem nota fiscal (salários, impostos e contas de consumo entram aqui) — R$ X · Ver só esses".
- **G9 — "Fora do resultado"** = só categorias com `classificacao === 'FORA_DRE'` no banco. Não reclassificar nada.
- **G10 — Impressão:** migrar `comum.js` para o modo de impressão nesta entrega (P8). QA imprime Pagar, Extratos e Notas.
- **G11 — Arquivos fora da pasta Contabilidade:** só `frontend/public/novidade-*.html`, `frontend/public/novidades.json` (outra sessão também mexe: editar por último, só acrescentar a entrada no topo) e o `deployMarker` em `backend/routes/adminExec.js` (uma linha, para conferir o deploy). Há outra sessão ativa no repositório: **não** tocar em `backend/index.js`, `ContasPagarPage.jsx`, manuais alheios; **não** usar `git add`/`git commit`/`git stash`/`git checkout` — quem commita é o gerente.
- **G12 — Etapa 1 é o alvo desta rodada.** Etapas 2 e 3 só depois da etapa 1 publicada.

---

## 14. Desvios do contrato (backend)

Nenhum campo do contrato da seção 3 mudou de nome ou formato. Diferenças de comportamento a saber:
- `resumo.avisos.contasComNotaVinculadaSemProdutos` e `itensSemCategoriaCorrespondente` dependem dos itens: **sem `detalhe=1`** o primeiro vem `null` (o segundo `0`). Com `detalhe=1` vêm calculados. (O frontend sempre pede `detalhe=1`.)
- Resposta com `detalhe=1` traz também `detalhe: true` no topo (acréscimo).
- `contas[].avisos` pode incluir `NOTA_VINCULADA_SEM_PRODUTOS` (só com `detalhe=1`).
- Conta cuja nota tem itens mas **todos com valor 0** é tratada como "sem itens" (linha SEM_ITENS).
- `contas[].situacao`: ordem de decisão = Pago (conta QUITADO) → Parcial (PARCIAL) → Vencido → Aberto; logo conta PARCIAL com parcela vencida mostra "Parcial".
- Truncamento: com `detalhe=1` o teto é 20.000 linhas de `itens` (corta por conta inteira, em ordem de emissão); sem `detalhe`, 8.000 contas como antes. Em ambos `resumo.truncado=true`.
