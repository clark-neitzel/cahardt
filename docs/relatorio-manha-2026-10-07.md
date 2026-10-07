# Bom dia — relatório da noite de 06 → 07/10/2026

Tudo que está aqui já está **no ar** e os ajustes de dados já foram **aplicados em produção**.
Leia os 3 blocos na ordem: (1) o que fazer hoje, (2) setembro como ficou, (3) o que a noite descobriu.
Detalhes técnicos: `docs/nota-entrega-indicadores-gestao.md`, `docs/nota-entrega-indicadores-etapa3.md`,
`docs/analise-setembro-2026.md`.

---

## 1. O que VOCÊ faz hoje (ordem de impacto; ~40 min no total)

| # | Ação | Onde | Efeito no resultado de setembro |
|--:|---|---|---:|
| 1 | **Antecipação de Lucros → "Fora do resultado"** (é retirada de sócio, não despesa). Confirmar com o contador. | Financeiro → Categorias de Despesa → classificação FORA_DRE | **+R$ 49,0 mil** (resultado vai de -2,6% para cerca de +17%) |
| 2 | **Criar ficha** das 3 tortinhas (frango, palmito, camarão) e da mini empada de palmito/frango — hoje vendem R$ 25 mil/mês com custo zero ou custo "chutado" do Conta Azul (7,64 repetido em 5 produtos). | PCP → Receitas | custo real entra (estimativa: -R$ 8 a 10 mil) |
| 3 | **Confirmar 13 referências de custo "prováveis"** (produtos -HF e os que diferem só em DE/DA/DO). Lista no fim deste arquivo. | Financeiro → Margem & Custo → produto → Custo de referência | tira R$ 10 mil de receita do "sem custo" |
| 4 | **Dividir "Copa e Cozinha"**: 73% do que está lá é ingrediente (queijo, carnes BRF, chocolate). Reclassificar para Matéria Prima nas notas; sobra café/água/descartáveis. | Notas Recebidas / Contas a Pagar | +R$ 7,5 mil/mês |
| 5 | **Classificar as 2 categorias "a definir"** (fixa ou variável). | alerta "Classificar agora" na tela | MC/equilíbrio completos |
| 6 | **Metas**: digite (não use "sugerir pela média": a média inclui meses com erro). Sugestão de partida: MC 60%, resultado 10%, perda 2%, rendimento 97%. | Indicadores → botão alvo (Metas) | semáforo passa a seguir a meta |
| 7 | **Gerente de produção**: dar a permissão "Indicadores (só produção)" e pedir que ela finalize **3 ordens reais** informando a quantidade produzida de verdade. | Usuários → Permissões / PCP → Painel | liga o bloco Produção com dado real |

Depois disso me diga e eu ligo o aviso do Clippy da novidade "Metas" para a equipe (deixei desligado de propósito até a gerente validar as ordens).

---

## 2. Setembro/2026 como está na tela agora

| Linha | R$ | % da receita líquida |
|---|--:|--:|
| Receita bruta (685 pedidos) | 288.840,56 | 114,6 |
| (−) Devoluções (32) | −10.319,82 | −4,1 |
| (−) Impostos pagos no mês (DAS + ST) | −26.490,04 | −10,5 |
| **Receita líquida** | **252.030,70** | 100,0 |
| (−) CPV — custo do que fabricamos e vendemos | −50.534,83 | −20,1 |
| (−) CMV — revenda e produtos sem classe | −9.393,91 | −3,7 |
| **Lucro bruto** | **192.101,96** | **76,2** |
| (−) Despesas variáveis (comissão, frete, taxas…) | −24.242,28 | −9,6 |
| **Margem de contribuição** | **167.859,68** | **66,6** |
| (−) Despesas fixas (inclui R$ 49 mil de Antecipação de Lucros) | −174.472,72 | −69,2 |
| **Resultado operacional** | **−6.613,04** | **−2,6** |
| Ponto de equilíbrio | 261.971 | |
| Margem de segurança | −3,9% | |

**Leitura:** a fábrica está praticamente no zero em setembro **com a retirada de sócio dentro das despesas**. Tirando a retirada (item 1), setembro fecha perto de **+R$ 42 mil (+17%)**, antes do custo das tortinhas (item 2), que puxa uns R$ 8–10 mil para baixo. Resultado honesto esperado: **em torno de +R$ 32 mil (+13%)**.

**Antes da noite, a mesma tela dizia −R$ 88,7 mil (−35%).** A diferença era erro de dado, não negócio (bloco 3).

**Confiança nos números:** receita, devoluções e despesas batem ao centavo com a DRE e com a soma direta dos pedidos. O custo ainda é **100% estimado** (foi reconstruído ontem) e **326 itens (R$ 39,7 mil, 15,8% da receita) seguem sem custo** — quase tudo tortinhas, empada e as variações -HF/H22 do item 3. A partir de hoje toda venda nova congela o custo real na hora do faturamento.

**Produtos (25 maiores):** as coxinhas e minis têm markup entre 3,6× e 4,8× e MC de 72–80%. Fora da curva: 1-G-RISOLES CARNE (markup 2,8×, MC 64%) e 7-M-BOLINHA QUEIJO (3,2×, 69%). Custo subiu 8–13% em 4 semanas nas 5 coxinhas principais (peito de frango); preço não mudou.

**Clientes:** top 10 = 27% da receita; o maior (Renato Festas) é 7,1% em só 4 entregas, MC 64%. Margem fina (<25%): KI-Cuca, Patrik Coutinho, Paradinha da Márcia, Ana Lúcia, Andreia Kleineschmidt — clientes pequenos.

---

## 3. O que a noite descobriu e corrigiu (já aplicado)

| Problema | Tamanho | O que foi feito |
|---|--:|---|
| Matéria-prima contada **duas vezes** (como despesa e dentro do custo do produto) | R$ 61,9 mil/mês | Matéria Prima, Embalagens e Materiais para Revenda marcadas "Compra de estoque" |
| Água mineral (6 garrafas, R$ 14,94) ligada ao insumo **"Água" da ficha** — cada pacote ganhava +R$ 2,05 de custo | R$ 11,7 mil/mês em 26 produtos | compra movida para "Água Mineral s/gás"; "Água" voltou a R$ 0,02/L |
| Insumos em **milheiro** com custo "por unidade" (etiqueta a R$ 100,16 e R$ 85,00 a peça) | bomba-relógio em 12 fichas | custo ÷ 1000, unidade UN, estoque da EMB-003 em unidades, vínculo do fornecedor com fator 1000 |
| 28 produtos vendidos **sem custo** (21,7% da receita) | R$ 62,7 mil de receita | 7 produtos (2-FR, H22, G-MINI) passaram a usar a ficha do produto "irmão" × fator; 908 vendas históricas recalculadas; sobram 23 (item 2 e 3 acima) |
| Custo congelado das vendas antigas estava inflado | 507 → 439 mil | tudo reestimado com preço do dia da venda |

**O que foi criado no sistema (Etapa 3):** metas por indicador (botão alvo), perda/rendimento/custo real por ordem de produção (apurado ao finalizar a ordem; nunca trava a finalização), custo de referência na Margem & Custo, custo de entrega por **parada** (98,7% dos pedidos têm embarque), semáforo calculado no servidor.

**O que encontrei e NÃO mexi (sua decisão):**
- **"Material de Uso e Consumo"** não é categoria de despesa: é categoria de **produto**, com 336 itens (metade do cadastro) — virou depósito de tudo que entra por nota. Dentro: combustível e gás R$ 41,9 mil em 3 meses, limpeza R$ 5,3 mil, **alimentos R$ 4,7 mil**, peças de veículo R$ 2,4 mil, copa R$ 2,2 mil. 257 desses produtos não têm compra há 3 meses (cadastro velho).
- **Estoque falso de R$ 38,3 mil**: diesel, gasolina e GLP só entram, nunca saem (1.861 L de diesel "em estoque"). Desligar o controle de estoque desses 11 produtos.
- **Roupa e eletrônico** (R$ 575) dentro de Copa e Cozinha: conferir se é despesa pessoal.
- **Categoria "Compra"** (R$ 9,2 mil) só tem serviço (contador, software) e está em "custos variáveis": mover para administrativa.
- **DRE** mostra "Receita especial = 0", mas os especiais são R$ 48,8 mil (16,9%). Defeito de rótulo; os totais estão certos.
- **Caldo de carne sem preço** afeta 15 fichas (croquete, kibe, risoles de carne, calzone).
- **Preço de insumo por caixa lido como kg** (salsicha, cebola, gema): faz a curva de insumos mostrar "−97%"; é o próximo acerto de cadastro.
- **Imposto**: sem alíquota cadastrada a tela usa o DAS pago no mês (provavelmente do mês anterior). Se quiser, cadastre a alíquota do Simples no ⚙ da tela.

---

## 4. Provas e pendências técnicas

- Etapas 1–3 publicadas (commits 9d333bd7 e 96cae483), build e deploy conferidos, DRE/comissão/meta inalteradas (comparadas byte a byte), permissões testadas por API e clicando, mobile 375 px sem rolagem lateral, fluxo real de ordem de produção testado no app local.
- Ajustes rodados em produção às 02:06 com modo teste antes; segunda rodada não altera nada (idempotente).
- **Pendente:** prova "faturar → publicar → custo continua" com pedido real (nenhum pedido foi faturado depois dos deploys de ontem à noite; a primeira venda de hoje prova). iPad real não testado. Aviso semanal por WhatsApp não foi feito (automação proativa: prefiro que você veja antes).

---

## 5. Os 13 pares de referência para você confirmar

Produto sem ficha → ficha de referência (fator). "-HF" supõe mini do mesmo tamanho do pacote de 50.

| Produto | Referência proposta | Fator | Receita set. |
|---|---|--:|--:|
| H22 MINI CROQUETE CARNE 2KG | 4-MINI CROQUETE DE CARNE C/50 | 1,333 | 2.845 |
| H22 MINI BOLINHA QUEIJO 2KG | 4-MINI BOLINHA DE QUEIJO C/50 | 1,333 | 2.745 |
| H22 MINI BOCADINHO PALMITO 2KG | 4-MINI BOCADINHO PALMITO C/50 | 1,333 | 1.196 |
| 2-FR-RISOLES DE PIZZA C/10 | 1-G-RISOLES PIZZA C/10 | 1 | 652 |
| 2-FR-RISOLES DE CARNE C/10 | 1-G-RISOLES CARNE C/10 | 1 | — |
| G-MINI BOLINHA QUEIJO 500GR | 4-MINI BOLINHA DE QUEIJO C/50 | 0,333 | — |
| COXINHA FRANGO C/25-HF | 4-MINI COXINHA FRANGO C/50 | 0,5 | 450 |
| MINI PASTEL CARNE C/25-HF | (sem mini de pastel com ficha) | — | 315 |
| BOLINHA QUEIJO C/25-HF | 4-MINI BOLINHA DE QUEIJO C/50 | 0,5 | 275 |
| TRAVESSEIRO PIZZA C/25-HF | 4-MINI TRAVESSEIRO PIZZA C/50 | 0,5 | 200 |
| MINI SALSICHA C/25-HF | 4-MINI SALSICHA C/50 | 0,5 | 125 |
| CHURROS D. LEITE C/25-HF | 4-MINI CHURROS DOCE LEITE C/50 | 0,5 | 100 |
| BOCADINHO PALMITO C/25-HF / MINI KIBE C/25-HF / EMPADINHA C/24-HF | 4-MINI equivalente | 0,5 | 205 |

Sem referência possível (precisam de ficha própria): 6-TORTINHA (frango, palmito, camarão), 4-MINI EMPADA (palmito, frango), 2-FR-M e 7-M COXINHA LING. BLUMENAU, H22 coxinha linguiça.
