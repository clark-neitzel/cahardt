# Análise de setembro/2026 — o que os indicadores dizem e onde não dá para confiar

> Base: cópia local do banco de produção (backup de 06/10/2026 22:05), só leitura. Período: 01/09 a 30/09/2026. Valores em R$.
> Todos os números abaixo saíram de consultas feitas agora; onde é estimativa, está escrito "estimativa".

**Resumo em 6 linhas**
1. Receita, devoluções e despesas **batem ao centavo** entre indicadores, DRE e SQL direto. Esses três números são confiáveis.
2. O **resultado de setembro nos Indicadores (-R$ 88,7 mil) está errado para baixo**: a matéria-prima é contada duas vezes (R$ 61,9 mil como despesa e de novo dentro do custo do produto). A DRE (-R$ 8,6 mil) erra para o outro lado: não tem custo do produto.
3. **21,7% da receita (R$ 62,7 mil) vendeu sem custo nenhum** (28 produtos). Por isso margem e ponto de equilíbrio ainda não são confiáveis.
4. O custo congelado dos produtos fabricados está **inflado em ~R$ 11,7 mil** por um vínculo errado do insumo "Água" (água de torneira ligada à compra de água mineral).
5. **"Uso e consumo" existe em dois lugares**, e nenhum é uma categoria de despesa: é a *categoria de produto* "Material de Uso e Consumo" (336 produtos, tudo misturado) e a despesa "Copa e Cozinha" (73% é ingrediente).
6. **Milheiro: nenhuma ficha está errada hoje** — as fichas só estão certas porque o custo do produto "manda" no custo do insumo. Há 2 itens armadilha (R$ 85,00 e R$ 100,16 por "unidade" se alguém mexer).

---

## 1. Setembro/2026 pelos indicadores (nível completo)

| Linha | Valor | % da receita líquida |
|---|---:|---:|
| Receita bruta | 288.840,56 | 114,6% |
| (-) Devoluções (32, ativas) | -10.319,82 | -4,1% |
| (-) Impostos sobre vendas (origem: **pago** na competência: DAS 26.105,69 + ICMS ST 271,02 + retidos 113,33) | -26.490,04 | -10,5% |
| **Receita líquida** | **252.030,70** | 100% |
| (-) CPV (fabricado) | -69.904,41 | -27,7% |
| (-) CMV (revenda + sem classe; 5.748,36 é "sem classe") | -10.276,66 | -4,1% |
| **Lucro bruto** | **171.849,63** | **68,2%** |
| (-) Despesas variáveis | -86.120,61 | -34,2% |
| **Margem de contribuição (MC)** | **85.729,02** | **34,0%** |
| (-) Despesas fixas | -174.472,72 | -69,2% |
| **Resultado operacional** | **-88.743,70** | **-35,2%** |
| Ponto de equilíbrio (fixas ÷ MC%) | 513.155,06 | |
| Margem de segurança | -103,6% | |

Alíquota do Simples não está configurada, por isso o imposto vem do que foi pago no mês (o DAS pago em setembro provavelmente se refere ao mês anterior; a conferir com o contador).

**Cobertura do custo:** 2.281 itens vendidos. **Real: 0 (0%)** — todos "estimados" (o custo congelado foi gravado de uma vez em 06/10, depois das vendas). **Sem custo conhecido: 460 itens = R$ 62.663,57 = 21,7% da receita** (contam como custo zero). Avisos do sistema: 100% estimado; 460 itens sem custo; "nenhuma categoria marcada como Compra de estoque".

### Conferência (3 caminhos)
| Item | Indicadores | DRE | SQL direto | Bate? |
|---|---:|---:|---:|---|
| Receita bruta (685 pedidos faturados/especiais, sem bonificação) | 288.840,56 | 288.840,56 | 288.840,56 | sim |
| Devoluções ativas (32) | 10.319,82 | 10.319,82 | 10.319,82 | sim |
| Despesas por competência | 287.083,37 | 287.083,37 | 287.083,37 (628 contas; 144 com rateio; 4 canceladas = 664,50 ficam fora) | sim |
| Receita líquida | 252.030,70 | 278.520,74 | — | **não, por desenho** |
| Resultado | -88.743,70 | -8.562,63 | — | **não** |

**Por que a DRE e os Indicadores divergem (explicado ao centavo):**
- Receita líquida: a DRE não tira os impostos da receita (eles ficam nas despesas, R$ 26.490,04). Diferença 278.520,74 - 252.030,70 = 26.490,04. Só muda a apresentação.
- Resultado: -88.743,70 - (-8.562,63) = **-80.181,07 = CPV 69.904,41 + CMV 10.276,66**. A DRE trata a compra como custo (não tem CPV). Os Indicadores tiram o custo da ficha **e** a compra de matéria-prima das despesas. É dupla contagem de ~R$ 61,9 mil (só a categoria "Matéria Prima").
- Outra diferença: a DRE mostra "Receita especial = 0", mas 168 pedidos especiais somam **R$ 48.832,66 (16,9% da receita)**. Estão todos dentro de "faturada". Defeito de rótulo da DRE.
- A MC% balança por causa disso: ago 8%, set 34% (últimos 6 meses: 23,8 / 30,6 / 16,6 / 25,3 / 8,0 / 34,0). É a data da compra, não o negócio.

**Os números estão certos?** Receita, devoluções, despesas: **sim**. CPV/CMV: **não confiável** (100% estimado, 21,7% da receita sem custo, água, custos do CA). MC, resultado, ponto de equilíbrio: **não confiáveis** até marcar "Compra de estoque" e completar os custos. Cenário abaixo (estimativa, setembro):

| Cenário | MC | Resultado | Ponto de equilíbrio | Margem de segurança |
|---|---:|---:|---:|---:|
| Como está | 85,7 mil (34,0%) | -88,7 mil (-35,2%) | 513 mil | -104% |
| + Matéria Prima como compra de estoque (+61,9 mil) | 147,6 mil (58,6%) | -26,9 mil (-10,7%) | 298 mil | -18% |
| + Antecipação de Lucros fora do resultado (+49,0 mil) | 147,6 mil | **+22,1 mil (+8,8%)** | 214 mil | +15% |
| + tirar o erro da Água do custo (+~11,7 mil) | 159,4 mil (63,2%) | +33,9 mil (+13,4%) | 198 mil | +21% |

Esses ajustes não são "maquiagem": o primeiro corrige dupla contagem; o segundo é decisão contábil do dono (retirada de sócio não é despesa); o terceiro corrige um vínculo errado. O custo dos 28 produtos sem custo (ver seção 2) vai puxar o resultado de volta para baixo (~R$ 8 mil, estimativa).

---

## 2. Produtos (setembro)

72 produtos vendidos: 26 fabricados com ficha, 2 revenda, 16 sem classe com custo, **28 sem custo**. Colunas: "custo usado" = custo congelado na venda (é o que entra no CPV); "ficha hoje" = custo da ficha com os preços de hoje.

### 25 maiores por receita
| # | Produto | Classe / fonte | Receita | Custo usado | Ficha hoje | Preço | Markup | MC % | MC R$ |
|--:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4-MINI COXINHA FRANGO C/50 | Fabr./ficha | 35.121 | 11,18 | 5,98 | 28,93 | 2,59 | 61,4 | 21.560 |
| 2 | 7-M-COXINHA AIPIM FRANGO C/30 | Fabr./ficha | 19.322 | 17,29 | 9,52 | 34,69 | 2,01 | 50,2 | 9.696 |
| 3 | 4-MINI BOLINHA QUEIJO C/50 | Fabr./ficha | 17.134 | 9,18 | 7,22 | 29,09 | 3,17 | 68,4 | 11.725 |
| 4 | 6-TORTINHA FRANGO C/REQ C/08 | **sem custo** | 15.178 | — | — | 44,51 | — | — | — |
| 5 | 1-G-COXINHA AIPIM FRANGO C/20 | Fabr./ficha | 13.703 | 20,41 | 11,04 | 43,92 | 2,15 | 53,5 | 7.337 |
| 6 | 4-MINI EMPADA FRANGO C/50 | Sem classe/CA | 11.063 | 7,64 | 7,64 | 48,10 | 6,30 | 84,1 | 9.307 |
| 7 | 1-G-COXINHA TRADICIONAL C/20 | Fabr./ficha | 9.901 | 20,23 | 10,77 | 44,40 | 2,19 | 54,4 | 5.390 |
| 8 | 1-GG-COXINHA FRANGO C/10 | Fabr./ficha | 9.844 | 13,12 | 6,73 | 31,45 | 2,40 | 58,3 | 5.737 |
| 9 | 2-FR-G-COXINHA-AIPIM C/20 | **sem custo** | 9.102 | — | — | 50,29 | — | — | — |
| 10 | 4-MINI TRAVESSEIRO PIZZA C/50 | Fabr./ficha | 8.964 | 8,15 | 4,98 | 28,64 | 3,51 | 71,5 | 6.412 |
| 11 | 3-DOGUINHO 2 SALSICHAS C/08 | Fabr./ficha | 8.649 | 11,76 | 14,58 | 43,68 | 3,71 | 73,1 | 6.320 |
| 12 | 4-MINI CROQUETE CARNE C/50 | Fabr./ficha* | 7.478 | 9,15 | 8,10 | 28,76 | 3,14 | 68,2 | 5.098 |
| 13 | 2-FR-GG-COXINHA FRANGO C/10 | **sem custo** | 7.070 | — | — | 35,53 | — | — | — |
| 14 | 6-TORTINHA PALMITO C/08 | **sem custo** | 6.722 | — | — | 45,42 | — | — | — |
| 15 | 3-HAMBURGAO CHEDDAR/CEBOLA C/05 | Fabr./ficha | 6.371 | 9,73 | 8,21 | 35,79 | 3,68 | 72,8 | 4.638 |
| 16 | 4-MINI KIBE CARNE C/50 | Fabr./ficha* | 5.655 | 12,74 | 12,75 | 42,20 | 3,31 | 69,8 | 3.948 |
| 17 | 6-TORTINHA CAMARÃO C/08 | Sem classe/CA | 4.919 | 11,88 | 11,88 | 54,06 | 4,55 | 78,0 | 3.839 |
| 18 | 4-MINI CHURROS DOCE LEITE C/50 | Fabr./ficha | 4.687 | 19,87 | 7,66 | 28,93 | 1,46 | 31,3 | 1.467 |
| 19 | 7-M-BOLINHA QUEIJO C/30 | Fabr./ficha | 4.341 | 13,82 | 11,66 | 36,48 | 2,64 | 62,1 | 2.696 |
| 20 | H22 - MINI COXINHA FRANGO 2KG | **sem custo** | 4.332 | — | — | 42,06 | — | — | — |
| 21 | 4-MINI SALSICHA C/50 | Fabr./ficha | 4.298 | 9,21 | 6,66 | 29,44 | 3,20 | 68,7 | 2.954 |
| 22 | 3-ENROLADINHO FRANGO C/08 | Fabr./ficha | 4.115 | 11,39 | 7,87 | 32,40 | 2,85 | 64,9 | 2.668 |
| 23 | 2-FR-M-COXINHA FRANGO/AIPIM C/30 | Sem classe/CA | 4.001 | 3,61 | 3,61 | 44,96 | 12,46 | 92,0 | 3.680 |
| 24 | 7-M-TRAVESSEIRO PIZZA C/30 | Sem classe/CA | 3.973 | 4,19 | 4,19 | 36,79 | 8,78 | 88,6 | 3.520 |
| 25 | 1-G-RISOLES CARNE C/10 | Fabr./ficha* | 3.664 | 10,02 | 9,42 | 23,34 | 2,33 | 57,1 | 1.847 |

\* ficha com insumo sem preço (Caldo de Carne). Os 25 maiores = R$ 229,6 mil dos R$ 288,8 mil (79%).

**Leitura:** as coxinhas e minis (o grosso da receita) estão com "custo usado" até 2× a "ficha hoje" (ex.: 4-MINI COXINHA 11,18 contra 5,98). Duas causas medidas: (1) o erro da Água (+R$ 2,05 por pacote em 26 produtos = **R$ 11.744 no mês**); (2) preços de insumo que subiram durante o período (peito de frango 17,49 → 23,60). Custo de setembro: congelado 72.562 | recalculado com preço do dia 59.739 | ficha de hoje 47.010 (fabricados).

### (a) Produtos SEM custo — R$ 62.666 = 21,7% da receita (28 produtos)
| Grupo | Produtos | Receita | Observação |
|---|--:|---:|---|
| 6-TORTINHA (frango, palmito), 4-MINI EMPADA PALMITO | 3 | 25.228 | sem ficha; **precisam de ficha** |
| 2-FR (coxinhas, empanado, risoles) | 5 | 20.440 | existe produto "irmão" com ficha (1-G, 1-GG, 7-M) |
| H22 mini 2 kg | 8 | 13.887 | irmão = 4-MINI (ficha existe) |
| -HF c/25 e G-MINI/COXINHA | 11 | 2.091 | irmão = linha 4-MINI/7-M |
| Outros (7-M-COXINHA LING.BLUMEN.) | 1 | 1.020 | |

**Estimativa** de custo usando a ficha do irmão (H22 = 4-MINI × 2÷1,5 kg; 2-FR = 1-G/1-GG/1-G-EMPANADO/RISOLES; 14 produtos, R$ 35.346 de receita): custo ~R$ 7.684 → MC ~78%. Não é custo real: só para saber o tamanho.

### (b) Parecem revenda mas não têm a marca "revenda"
- Só 2 produtos de revenda de verdade (2-FR-BOLINHO DE CARNE e 2-FR-ESPETINHO, **já marcados**; MC 32% e 27%, markup 1,47 e 1,38 — **margem baixa**, ver recomendação).
- **Hemmer, bebidas, molhos, café, maionese, catchup: não são vendidos** — estão no cadastro como "Material de Uso e Consumo" com preço de venda 0 (são insumo/consumo interno). Nada a marcar.
- Casos pontuais vendidos "por engano" como produto: peito de frango, mussarela, carne moída, linguiça, café, CIF etc. (R$ ~2,8 mil em todo o histórico; em setembro: linguiça R$ 23, frango R$ 19). Sem efeito relevante.
- Os 12 produtos "Sem classe/CA" (R$ 31,5 mil) são, na verdade, **fabricados sem ficha** (tortinha camarão/carne, empada, 7-M travesseiro/croquete, 2-FR…): ver (c).

### (c) Fabricados sem ficha vigente
12 produtos, R$ 31.511 de receita, custo vindo do campo "custo médio" do Conta Azul (R$ 5.858 = 18,6% da receita). Valores repetidos e suspeitos: **7,64 em 5 produtos diferentes** (4-MINI EMPADA e as 4 G-MINI 500GR), 3,61–4,44 para pacotes C/30 (os irmãos com ficha custam 9,5–17,3). Se o custo fosse ~38,7% da receita (média dos que têm ficha), seriam ~R$ 12,2 mil (+R$ 6,3 mil de custo, estimativa).
Também: 4 fabricados com ficha incompleta — falta o preço do insumo **CALDO CARNE KG** (afeta 15 fichas: croquete, kibe, risoles de carne, calzone de carne). Fichas desatualizadas (>5%): 24.

### (d) Markup ou MC absurdos
| Produto | Markup / MC | Causa provável |
|---|---|---|
| 2-FR-M-COXINHA FRANGO/AIPIM C/30 | 12,5× / 92% | custo do CA (3,61) para pacote de 30; sem ficha |
| 7-M-TRAVESSEIRO PIZZA, 7-M-CROQUETE, 2-FR-RISOLES CARNE, 6-TORTINHA FRANGO/PALMITO, 4-MINI EMPADA FRANGO | 6,3–8,8× / 84–89% | idem: custo do CA desatualizado ou por unidade, sem ficha |
| G-MINI 500GR (4 itens) | 1,33–1,37× / 25–27% | custo 7,64 copiado de outro produto (pacote de 1,5 kg) vendido a ~R$ 10 |
| 4-MINI CHURROS DOCE DE LEITE | 1,46× / 31% | custo congelado 19,87 contra ficha hoje 7,66 (Água + preço do insumo); com ficha de hoje o MC iria a ~74% |
| FILEZINHO FGO CONG BDJ 1KG | 0,08× / -1.136% | custo de uma **caixa** (182,88) tratado como custo do kg; 1 unidade, R$ 15 |
| DESINCRUSTANTE (uso e consumo) / FGO COXINHA ASA | 0,98× / 1,0× | vendido pelo preço de compra (sem margem) |

Nenhum milheiro entra aqui (ver seção 3).

**Recomendação por grupo:** (1) criar ficha para tortinha/empada (PCP → Receitas); (2) copiar a ficha do irmão para 2-FR, H22, HF, G-MINI e ajustar o peso; (3) zerar o "custo médio do CA" desses 12 depois de ter ficha; (4) revenda (espetinho, bolinho): markup 1,4× é baixo para a faixa de 2,3–3,7× dos fabricados — rever preço ou fornecedor; (5) coxinha AIPIM/tradicional G e M estão com MC 50–54%: abaixo da média e com peito de frango +35% em 8 semanas.

---

## 3. Milheiro

Fichas vigentes: 86. Insumos com unidade de múltiplo: **MI/milh/ML** (4 itens), **CX/PC/PCT/FD/GL/bld** (rótulos; o custo está sempre "por kg/litro", coerente).
Como o estoque é contado: **em UNIDADES**, nunca em milheiros. Saco 27×38: 42.000 un em estoque, custo 0,31/un; etiqueta BOPP fosco (EMB-002): 21.600 un, 0,151/un. A entrada da nota converte com `fator_conversao = 1000` (34,5 MIL → 34.500 un; 21,6 ML → 21.600 un). Logo **o certo é corrigir o custo do insumo (÷1000), não a quantidade na ficha**: a ficha usa 1,000 (1 saco/1 etiqueta por pacote), correto em unidades. Mudar a quantidade para 0,001 quebraria a baixa de estoque.

| Item PCP | Rótulo | Custo no item | Estoque PCP | Usado em | Situação hoje |
|---|---|---:|---:|---|---|
| 118-001 SACO 27X38 HARDT | milh | 0,34 | 42.000 un (produto) | 27 linhas de ficha vigente, qtd 1,000 | **certo**: ficha usa custo do produto 0,31/un. Só trocar rótulo para UN e custo do item 0,34 → 0,31 |
| EMB-002 ETIQ BOPP FOSCO 100x120 | ML | 0,151 | 21.600 un | 15 linhas de ficha, qtd 1,000 | **certo** (0,151/un). Só o rótulo |
| **000083 ETIQUETA BOPP CONGELADO 100x80** | MI | **100,16** | PCP 0 / produto 57 | 12 fichas, qtd 1,000 | **armadilha**: certo só porque o produto tem custo 0,11. Sem isso, cada pacote custaria R$ 100,16 |
| **EMB-003 ETIQUETAS COUCHE 40x40** | MI | **85,00** | **5,500** | nenhuma ainda | **errado**: a NF 52430 (26/08, 5,5 MI) entrou com fator 1 → 5,5 "unidades" a R$ 85 |

**Linhas a corrigir (dado, equipe):**
| Onde | Atual | Proposto |
|---|---|---|
| EMB-003: estoque PCP | 5,500 (MI) | 5.500 un (unidade UN) |
| EMB-003: custo do item | 85,0000 | 0,0850 |
| 000083: custo do item | 100,1600 | 0,1002 (unidade UN) |
| 000083: estoque PCP | 0 (as 15 MI de 08/06 nunca entraram) | conferir contagem física e lançar em unidades |
| 118-001 e EMB-002: unidade | milh / ML | UN |
| 118-001: custo do item | 0,3400 | 0,3069 (última compra 20/07) |

**000083 — as 12 fichas** (todas com qtd 1,000 → **mantém 1,000**): 1-G-COXINHA AIPIM C/20; 1-G-COXINHA TRADICIONAL C/20; 1-G-EMPANADO SALSICHA C/10; 4-MINI BOCADINHO PALMITO C/50; 1-G-RISOLES PIZZA C/10; 1-G-RISOLES CARNE C/10; 4-MINI BOLINHA QUEIJO C/50; 7-M-COXINHA AIPIM C/30; 7-M-BOLINHA QUEIJO C/30; 1-GG-COXINHA FRANGO C/10; 7-M-COXINHA CALABRESA C/30; 7-M-COXINHA KIBE C/20. Nenhuma linha de ficha precisa mudar de quantidade.

---

## 4. Categorias de despesa

73 categorias; nenhuma marcada "Compra de estoque"; **nenhuma "A_DEFINIR"** em natureza; 2 em "A_CLASSIFICAR" (Uniformes R$ 651,38 e IRRF R$ 32,96 em 3 meses → sugestão: Pessoal / fixa); **nenhuma "FORA_DRE"** (a opção existe e ninguém usa).

| Categoria | Natureza | Bloco DRE | Set/26 | 3 meses | Proposta |
|---|---|---|---:|---:|---|
| Matéria Prima | VARIAVEL | Custos variáveis | 61.878,33 | 213.879,18 | MARCAR compra de estoque |
| Antecipação de Lucros | FIXA | Pessoal | 48.976,30 | 127.206,46 | FORA do resultado (retirada de sócios) |
| Salários | FIXA | Pessoal | 31.460,71 | 114.401,32 | ok (fixa) |
| DAS SIMPLES | VARIAVEL | Impostos sobre vendas | 26.105,69 | 52.929,61 | ok (imposto s/ venda) |
| Serviços Tercerizado | FIXA | Pessoal | 38.170,72 | 41.071,00 | ok; conferir se há mão de obra variável |
| Empréstimos de Bancos | FIXA | Financeiras | 4.505,38 | 27.919,72 | separar juros x principal (principal fora) |
| Combustíveis | VARIAVEL | Veículos e entregas | 8.946,20 | 27.034,64 | ok (variável, entrega) |
| Embalagens | VARIAVEL | Custos variáveis | 0,00 | 24.595,20 | MARCAR compra de estoque |
| Empréstimos de Outras Instituições | FIXA | Financeiras | 8.413,06 | 24.439,18 | separar juros x principal |
| Energia Elétrica | VARIAVEL | Custos variáveis | 7.663,04 | 22.933,65 | ok (variável de produção) |
| Copa e Cozinha | FIXA | Administrativas | 10.231,77 | 22.296,01 | quebrar: ~73% é ingrediente (ver abaixo) |
| Parcelamento do Simples Nacional | FIXA | Financeiras | 8.745,42 | 19.924,42 | dívida antiga: tirar do operacional |
| Benefícios aos Funcionários | FIXA | Pessoal | 4.125,00 | 17.795,42 | ok (fixa) |
| Manutenção de Veículos | FIXA | Veículos e entregas | 2.991,60 | 15.285,68 | ok (fixa); pode ser variável de entrega |
| Materiais para Revenda | VARIAVEL | Custos variáveis | 0,00 | 11.151,40 | MARCAR compra de estoque |
| GAS GLP | VARIAVEL | Custos variáveis | 3.585,06 | 10.932,71 | ok (variável de produção) |
| Materiais de Limpeza e de Higiene | FIXA | Administrativas | 2.359,94 | 10.546,94 | ok (fixa) |
| Compra | VARIAVEL | Custos variáveis | 0,00 | 9.234,75 | renomear: só tem SERVIÇO (contador, software) -> Administrativas/fixa |
| Manutenção Predial | FIXA | Administrativas | 405,00 | 8.142,57 | ok (fixa) |
| Outras Imobilizações por Aquisição | VARIAVEL | Administrativas | 0,00 | 8.045,15 | FORA do resultado (investimento) |
| Veículos | FIXA | Veículos e entregas | 4.422,26 | 7.762,26 | ok (fixa) |
| Leasing - Veículos | FIXA | Veículos e entregas | 0,00 | 6.635,72 | ok (fixa) |
| Plano de Saúde Sócios | FIXA | Sócios | 1.977,97 | 5.503,82 | ok (Sócios) |
| Pró-labore | FIXA | Sócios | 0,00 | 5.340,00 | ok (Sócios) |
| Honorários Contábeis | FIXA | Administrativas | 1.660,90 | 4.971,80 | ok (fixa) |
| Materiais de Escritório | FIXA | Administrativas | 1.180,31 | 4.039,31 | ok (fixa) |
| FGTS e Multa de FGTS | VARIAVEL | Pessoal | 1.943,70 | 4.035,62 | ok; natureza FIXA (acompanha folha) |
| Honorários Advocatícios | FIXA | Administrativas | 0,00 | 3.492,75 | ok (fixa) |
| Telefonia e Internet | FIXA | Administrativas | 359,79 | 2.618,41 | ok (fixa) |
| Comissões de Vendedores | VARIAVEL | Custos variáveis | 607,59 | 2.571,88 | ok (variável) |
| Seguros de Veículos | FIXA | Veículos e entregas | 1.451,70 | 2.462,89 | ok |
| IPTU | FIXA | Administrativas | 837,03 | 2.325,45 | ok |
| Vale-Alimentação | FIXA | Pessoal | 525,00 | 2.025,00 | ok |
| (outras 40 categorias) | | | | 14.256,93 | ok |

### (a) Devem ser "Compra de estoque" (saem da despesa, ficam só no CPV/CMV)
Matéria Prima (set 61.878; 3m 213.879), Embalagens (3m 24.595), Materiais para Revenda (3m 11.151). **Cuidado:** dos R$ 177,4 mil de matéria-prima comprados em 3 meses, R$ 27 mil não alimentam ficha nenhuma (ex.: caixa de tortinha 5.180, farinhas Maletti/Weissgold) — são de produtos sem ficha, então o custo só aparece no CPV quando a tortinha/empada ganhar ficha. Sem marcar não há como o CPV ser conferido contra o gasto real.
### (b) Sem natureza/bloco, ou no bloco errado
- "Compra" (R$ 9.234 em 3 meses, bloco "Custos variáveis"): só tem **serviço** (contador 1.660,90, consultoria, ContaAzul, SCC…). Mover para Administrativas/fixa e renomear.
- "Outras Imobilizações" (8.045) e "Antecipação de Lucros" (127.206): fora do resultado. "Parcelamento do Simples" (19.924) e empréstimos (52.359): separar juros de principal.
- FGTS está como variável; acompanha a folha (fixa). Efeito pequeno (R$ 1,9 mil).

### (c) "Uso e consumo" — o que tem dentro
**Não existe categoria de despesa com esse nome.** Há dois baldes:

**1) Categoria de PRODUTO "Material de Uso e Consumo": 336 produtos** (de 640 no cadastro). Pelo conteúdo (peça de Bongo, cabos, alimentos), parece ser o destino padrão dos itens novos de nota, e virou depósito (hipótese, não verificada no código). Compras nos últimos 3 meses nessa categoria: **R$ 58.974 (set R$ 22.841)**. Agrupando pelo nome (palavras-chave; aproximado):
| Grupo | Produtos | Compras 3 meses | Compras set | Estoque no sistema |
|---|--:|---:|---:|---:|
| **Combustível e gás** (diesel, gasolina, GLP) | 11 | 41.934 | 14.572 | **38.330** |
| Limpeza, higiene, EPI | 41 | 5.332 | 2.738 | 5.058 |
| Alimento/ingrediente (queijo, leite cond., azeite, carnes BRF…) | 66 | 4.711 | 2.603 | 3.850 |
| Peça de veículo/mecânica, lubrificante | 42 | 2.422 | 1.052 | 1.387 |
| Copa (café, água, suco) | 19 | 2.229 | 1.001 | 1.926 |
| Embalagem (saco de lixo etc.), escritório, roupa, utensílio, elétrica, outros | 157 | 2.346 | 876 | 4.267 |
**Achado grave de estoque:** diesel, gasolina e GLP só têm ENTRADA (61, 56 e 6 lançamentos) e **nenhuma saída**: o sistema mostra 1.861 L de diesel, 1.609 L de gasolina e 1.461 de GLP = **R$ 38,3 mil de estoque que não existe**. Não muda a DRE (o gasto vai para Combustíveis/GLP), mas infla estoque e confunde o inventário. Além disso, ~76% dos 336 produtos (257) não tiveram nenhuma compra nos últimos 3 meses (ferragem, peça de Bongo/Mobi, cabos, rolamentos: cadastro velho).

**2) Despesa "Copa e Cozinha" (set R$ 10.232; 3 meses R$ 22.296)** — vira rateio da nota do item marcado "Copa e Cozinha". Em setembro, nos itens da nota (R$ 10.287,64):
| O que é de verdade | Set | 3 meses |
|---|---:|---:|
| Ingrediente / matéria-prima (composto lácteo, carnes BRF, chocolate Callebaut, queijos, leite condensado, creme de avelã…) | 7.502 (73%) | 13.562 |
| Café, água, suco, descartáveis (copa de verdade) | 1.353 | 2.725 |
| Utensílio/equipamento (balança, espátula, biscoiteira) | 494 | 1.461 |
| Roupa/eletrônico pessoal (calça, "pares eletrônica") — **não é da empresa?** | 575 | 591 |
| Limpeza | 291 | 1.269 |
| Embalagem | 73 | 132 |
**Proposta:** (1) subir ~R$ 7,5 mil/mês de ingrediente de "Copa e Cozinha" (fixa) para "Matéria Prima" (compra de estoque): resultado de setembro +R$ 7,5 mil (+3 pontos); (2) criar "Utensílios e Equipamentos" (fixa) e "Consumo da copa (café/água)" (fixa); (3) as compras de roupa/eletrônico (R$ 575) conferir se são despesa pessoal (Sócios); (4) mudar o padrão de nova entrada de "Uso e Consumo" para "a classificar" com obrigatoriedade de escolher.

---

## 5. Insumos e entradas

Só 6 insumos têm série de preço de 8 semanas (os demais não têm compras ligadas à ficha ou só têm uma). Alertas do mês: 0 insumos com 3 altas seguidas.
| Insumo | Início → fim (8 sem.) | Variação | Peso no CPV | Custo na ficha hoje |
|---|---|---:|---:|---:|
| PEITO FRANGO COZIDO KG | 17,49 → 23,60 | **+34,9%** | **19,8%** | 20,50 |
| FARINHA PARA EMPANAR KG | 9,90 → 6,00 | -39,4% | 6,0% | 8,86 |
| SALSICHA DOGUINHO KG | 98,90 → 8,69 | -91,2% (**artefato**: 1ª compra veio por caixa) | 4,6% | 13,59 |
| SALSICHA P/ EMPANADO KG | 11,69 → 5,60 | -52,1% | 1,9% | 5,60 |
| GEMA LÍQUIDA | 78 → 26 | -66,7% (unidade UN × kg) | 1,5% | 30,00 |
| CEBOLA IN NATURA KG | 35 → 1,10 | -96,9% (**artefato**) | ~0 | 0,13 |
Três das cinco "grandes quedas" são erro de unidade/caixa na compra, não preço real. Insumos que mais pesam: peito de frango (19,8%), farinha de empanar (6%), salsicha (4,6%). **A ficha usa preço velho:** frango 20,50 (pago 23,60), farinha 8,86 (pago 6,00), salsicha 13,59 (pago 8,69).
Compras ligadas a insumos: dos R$ 177,4 mil de matéria-prima comprados em 3 meses, R$ 150,5 mil (85%) alimentam fichas; **R$ 27,0 mil** não (farinhas Maletti/Weissgold, caixa de tortinha, leite composto, chocolate).

**Entradas:** a semana de 05–11/10 está vazia (backup é de 06/10). Última semana fechada (28/09–04/10): 23 notas, 40 linhas, ~R$ 17,4 mil; 7 linhas são insumo de ficha (frango 304 kg a 23,60, queda de 4% sobre 24,59; salsicha 160 kg a 8,69; amido 25 kg a 5,89, queda de 14,5%; **cebolinha 12,92 e 12,01 contra 4,55 antes (+164%)** — a ficha usa 0,04/kg). O resto é combustível, gás, sacos de lixo e limpeza (limpa-chapa +26,5%).
**Custo parado (sem compra há 60 dias):** 19 de 54 insumos de ficha, entre eles: leite em pó, aroma de fumaça, hortelã, páprica, nata, goma xantana, aroma de requeijão, orégano, caldo de mar, pimentão, Caldo de Carne (**sem preço nenhum**), fermento e melhorador (último 02/07), linguiça calabresa (07/07), trigo p/ kibe (19/06), etiqueta 000083 (08/06). O custo deles na ficha é "chute".

---

## 6. Clientes (top 10 por receita, setembro)
| # | Cliente | Receita | Entregas | Desconto médio* | MC % | % receita sem custo |
|--:|---|---:|--:|---:|---:|---:|
| 1 | Schlickmann & Coelho (Renato Festas) | 20.569,90 | 4 | -2,5% | 64,3 | 0 |
| 2 | Dorival C. Rodrigues (Panificadora Belém) | 8.978,86 | 7 | -1,4% | 61,3 | 4 |
| 3 | Panificadora Neumann | 7.889,10 | 4 | -0,4% | 69,6 | 25 |
| 4 | Panificadora Camila | 7.263,09 | 3 | 2,9% | **98,6** | **100** |
| 5 | Maria Fernanda Coelho | 7.240,96 | 1 | -1,4% | 65,1 | 0 |
| 6 | Panificadora e Conf. Mendes | 5.825,67 | 4 | 0,4% | 77,0 | 46 |
| 7 | Nanna Carboni Confeitaria | 5.629,03 | 5 | -0,3% | 60,2 | 4 |
| 8 | Supermercados Nova Esperança | 5.318,46 | 6 | -8,2% | 66,8 | 44 |
| 9 | Lucas Figueiro Varela | 5.288,36 | 4 | -2,2% | 71,6 | 31 |
| 10 | Costa & Filhos (posto) | 4.592,79 | 3 | -4,7% | 85,8 | 72 |

\* desconto = 1 - receita ÷ valor-base do cadastro; negativo = vendido acima do base. MC do cliente = receita - custo do produto - custo de entrega estimado (R$ 26,06 por entrega, estimativa). **Margens acima de 80% não são reais**: o produto estava sem custo (Camila 100%, Sinuelo 100%, Costa 72%).
**Quem vende muito e deixa pouco:** com custo confiável, os que deixam menos: Mendes/Neumann/Nova Esperança. O alerta do sistema para MC < 25% em setembro: **Mercearia Helck 15%, KI-Cuca 19,2%, Jociel Alonsio 19,3%, Mercado Cargnin 22,6%, Damares C. Dias 24%** — todos fora do top 10 (clientes pequenos). O maior cliente (Renato Festas) é **7,1% da receita em apenas 4 entregas** e a MC 64%: é o último a perder o desconto. Dependência: 10 clientes = 27% da receita (R$ 78,6 mil). Neumann e Joaquina de Mello (Nanna Carboni) são 100% pedidos "especiais" (sem nota), que somam 16,9% da receita no mês.

---

## 7. O que eu faria primeiro (máx. 10)

**Cadastro que o dono faz na tela**
| # | O que fazer (passos) | Efeito em setembro (estimativa) |
|--:|---|---|
| 1 | **Marcar "Compra de estoque"** em Matéria Prima, Embalagens e Materiais para Revenda. *Financeiro → Categorias de Despesa → abrir a categoria → ligar "Compra de estoque".* Fazer junto com o item 3. | Resultado +R$ 61,9 mil (-35,2% → -10,7%); MC 34% → 58,6%; ponto de equilíbrio 513 mil → 298 mil |
| 2 | **Antecipação de Lucros → "Fora do resultado"** (retirada de sócio). *Mesma tela, trocar classificação para FORA_DRE.* Confirmar com o contador; empréstimos e parcelamento do Simples são o próximo passo. | +R$ 49,0 mil → resultado **+R$ 22,1 mil (+8,8%)** |
| 3 | **Fichas para os 28 produtos sem custo**: tortinhas e empada de palmito (R$ 25,2 mil) e copiar a ficha do irmão para 2-FR/H22/HF (R$ 35,3 mil). *PCP → Receitas → Nova ficha.* | Tira R$ 62,7 mil de "custo zero"; custo real ~R$ 8 mil a mais (estimativa); MC mais honesta |
| 4 | **Quebrar "Copa e Cozinha"**: ingrediente vai para Matéria Prima (após o item 1). *Editar a categoria na nota/conta.* | +R$ 7,5 mil por mês no resultado |
| 5 | **Rever preço da revenda (espetinho/bolinho) e das coxinhas G/M** (MC 27–54%, peito de frango +35%). | Cada +5% de preço nas 5 coxinhas principais (R$ 87,9 mil de receita) ≈ +R$ 4,4 mil/mês |

**Correção de código/dado (equipe)**
| # | O que fazer | Efeito |
|--:|---|---|
| 6 | **Insumo "Água"**: a compra de 26/08 (água mineral 6×1,5 L, R$ 14,94) está ligada ao item "Água" (torneira, R$ 0,02/L) e infla 26 produtos em R$ 2,05/pacote. Mover a compra para o produto "Água Mineral s/gás", refazer o custo congelado (backfill) | CPV -R$ 11,7 mil (+4,6 pontos de MC) |
| 7 | **Custo congelado 100% estimado**: depois do item 6, regravar; e trocar o "custo médio do CA" dos 12 produtos sem ficha por custo de ficha | evita erro de até R$ 6 mil/mês no CMV |
| 8 | **Estoque falso de combustível/gás**: desligar controle de estoque desses 11 produtos (ou lançar a saída por consumo/abastecimento) | limpa R$ 38,3 mil de estoque inexistente |
| 9 | **"Uso e Consumo" e "Compra"**: criar regra na entrada de nota (nova mercadoria não nasce em "Uso e Consumo"), reclassificar 66 alimentos, renomear/mover "Compra"; corrigir os itens milheiro (EMB-003 e 000083) e o preço de insumo errado (caixa x kg: salsicha, cebola, gema) | evita R$ 85–100 por pacote em ficha futura; limpa o cadastro |
| 10 | **DRE**: linha "Receita especial" sempre zero (168 pedidos, R$ 48,8 mil caem em "faturada"); mostrar a visão com CPV | rótulo/leitura; sem efeito no resultado |

*Ordem sugerida:* 6 → 3 → 1+2 → 4 → 7 → resto. Marcar a matéria-prima (1) antes de ter custo nos 28 produtos (3) melhora o resultado "no papel" mas esconde custo — por isso 1 e 3 andam juntos.
