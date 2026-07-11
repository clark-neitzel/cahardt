# DANFE — Resumo do manual oficial (MOC 7.0, Anexo II, out/2020)

> Fonte: "Manual de Orientação do Contribuinte — Anexo II — Manual de Especificações
> Técnicas do DANFE e Código de Barras", versão 7.00 (ENCAT). O dono tem o PDF completo;
> este resumo cobre o que interessa à geração da nossa DANFE
> (`GET /api/pedidos/:id/danfe`, lib `@alexssmusica/node-pdf-nfe`, XML vem da API do CA).

## O que é o DANFE (e o que ele NÃO é)

- Documento **auxiliar** impresso: acompanha o trânsito da mercadoria, colhe assinatura do
  recebedor e ajuda a escrituração. **O documento fiscal de verdade é o XML autorizado** —
  a DANFE só representa o conteúdo dele. É proibido imprimir informação que não conste do XML.
- Nossa DANFE usa o **mesmo XML autorizado** que o CA (baixado por
  `GET /v1/notas-fiscais/{chave}`), portanto tem a mesma validade da impressa lá.

## Regras que a nossa geração PRECISA respeitar (checadas em 07/2026 — OK)

| Regra do manual | Item | Status na nossa DANFE |
|---|---|---|
| Fonte Times New Roman ou Courier New | 3.7 | OK — a lib embute Times New Roman |
| Formato A4 retrato conforme Anexo III.02 | 3.6 | OK |
| Código de barras CODE-128C da chave (≥6cm largura, ≥0,8cm altura) | 2 | OK (bwip-js code128) |
| Chave de acesso em 11 blocos de 4 dígitos, negrito | 3.1.1 | OK |
| Campo 1: "Consulta de autenticidade no portal nacional da NF-e..." | 3.9.1 | OK |
| Campo 2: protocolo de autorização de uso + data/hora | 3.9.1 | OK |
| "DANFE" em destaque ≥12pt; nº/série/folha ≥10pt negrito | 3.7.4 | OK |
| FOLHA 1/1 no topo (mesmo com folha única) | 3.10.2 | OK |
| Canhoto (RECEBEMOS DE... / data / assinatura / NF-e nº-série) | leiaute | OK |
| Emitente: razão social + endereço completo + telefone (logo opcional) | 3.1.3 | OK — com logo da Hardt (`backend/assets/logo-danfe.png`) |
| Colunas obrigatórias no quadro de produtos: Código, Descrição, NCM, CST/CSOSN, CFOP, Unidade, Quantidade, V.Unitário, V.Total, BC ICMS, V.ICMS, Alíq. ICMS | 3.1.7 | OK (traz também IPI) |
| Informações adicionais de produto (infAdProd) abaixo do item | 3.1.7 | OK (a lib imprime) |
| Informações Complementares (infCpl + infAdFisco) completas | 3.1.8 | OK |
| Quadro Reservado ao Fisco em branco | 3.1.9 | OK |
| Fatura/Duplicatas (pode ser suprimido/reduzido se não usar) | 3.3.2 | OK — imprimimos Num/Venc/Valor |
| Cálculo do ISSQN pode ser SUPRIMIDO quando não se aplica | 3.3.3 | OK — suprimido (vendemos produto) |
| "SEM VALOR FISCAL" só em homologação (tpAmb=2) | cap. 3 | OK — produção (tpAmb=1) não leva |
| Margens 0,2–0,8 cm | 3.6.2 | OK (layout da lib) |

## Situações que NÃO cobrimos (e está certo assim)

- **Contingência** (FS/FS-DA/EPEC, segundo código de barras): só emitimos DANFE de nota já
  **EMITIDA/autorizada** (status EMITIDA na API do CA) — contingência é problema do emissor (CA).
- **NFC-e (modelo 65)**: não usamos.
- **DANFE Simplificado/Etiqueta**: não usamos.

## Detalhes da API do CA que afetam a DANFE

- `GET /v1/notas-fiscais` exige `data_inicial`/`data_final` (YYYY-MM-DD), range curto (~7 dias;
  30 dias → erro 500) e `tamanho_pagina` ∈ {10,20,50,100}. **`data_final` é exclusiva** (nota de
  hoje só aparece com data_final = amanhã). Filtro `id_venda` disponível.
- `GET /v1/notas-fiscais/{chave}` → XML `nfeProc` completo (string).
- A chave localizada fica cacheada em `Pedido.nfeChave` (a 1ª consulta varre janelas de 7 dias).

## Se o fisco questionar algo na impressão

1. Conferir se a informação questionada consta no XML (a DANFE só espelha o XML — problema de
   conteúdo é na emissão/CA, não na impressão).
2. Comparar com este resumo e com o manual completo (MOC Anexo II).
3. A lib de geração é a `@alexssmusica/node-pdf-nfe` (mantida, usada por ERPs); atualizar a
   versão se surgir exigência nova de leiaute.
