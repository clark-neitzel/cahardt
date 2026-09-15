# Pedido ao time do CA-Hardt — dados pra Ana tirar o pedido semanal (v1.6.0 proposta)

**De:** Bot WhatsApp Hardt Salgados (Ana)
**Para:** dev do CA-Hardt
**Data:** 2026-09-09
**Contexto:** vamos colocar a Ana pra tirar o pedido semanal dos clientes recorrentes de
congelados, começando por 5 clientes em modo assistido (o pedido nasce **AGUARDANDO** na fila
de aprovação de vocês, exatamente como já faz o `POST /congelados/pedido` do contrato v1.4).
Pra isso a Ana precisa enxergar o cliente do jeito que a vendedora enxerga: o que ele compra,
quando recebe, o que está em promoção, o que está em falta. Hoje a API devolve o histórico só
com número, data e total — sem itens não dá pra montar o "pedido de sempre".

→ Mesma regra permanente: o bot NÃO acessa o banco de vocês. Tudo por endpoint na
`/api/ia-consulta/v1`, mesma auth `x-ia-api-key`. Tudo abaixo é **aditivo** (nada quebra o v1.5).

Ordem de prioridade: **1, 2 e 8 destravam o piloto**; 3 a 6 melhoram; 7 é ajuste do que já existe.

---

## 1. Histórico com itens e pedidos em aberto (prioridade máxima)

### 1a. `POST /cliente/historico-pedidos` ganha `comItens` e devolve pedidos futuros

**Request:**

```json
{ "telefone": "5547999991234", "limite": 5, "comItens": true }
```

**Response (`dados`)** — mesmo formato de hoje, com `itens[]` em cada pedido e a inclusão dos
pedidos **ainda não entregues** (AGUARDANDO / aprovados com entrega futura):

```json
{
  "reconhecido": true,
  "cliente": { "nome": "Posto Maiochi Brutherdal" },
  "pedidos": [
    {
      "numero": 48213,
      "data": "2026-09-08",
      "dataEntrega": "2026-09-09",
      "status": "AGUARDANDO",
      "statusEntrega": "PENDENTE",
      "tipo": "NORMAL",
      "total": 789.19,
      "origem": "WHATSAPP_IA",
      "itens": [
        { "produtoId": 1021, "nome": "Coxinha Frango c/ Aipim 60g c/30", "quantidade": 8, "unidade": "PCT", "precoUnit": 46.06 },
        { "produtoId": 1088, "nome": "Doguinho 2 Salsichas 220g c/08", "quantidade": 3, "unidade": "PCT", "precoUnit": 48.57 }
      ]
    }
  ]
}
```

- `produtoId` = o mesmo `id` que o catálogo já devolve (é como a Ana liga "o que ele comprou"
  ao "o que existe pra vender").
- Os pedidos em aberto são o que diz pra Ana **"este cliente já tem pedido nesta semana"** —
  ela então pergunta se precisa de mais, em vez de puxar o pedido de novo.
- `origem` (se existir no pedido) ajuda a Ana a saber se foi ela, o site ou a vendedora.

### 1b. Reconhecimento devolve o último pedido

`POST /congelados/reconhecer-telefone` e `POST /cliente/reconhecer-telefone` passam a incluir
`ultimoPedido` (mesmo objeto de pedido acima, com itens). Evita uma segunda chamada no caminho
de cada mensagem.

## 2. Produtos que o cliente já comprou (agregado)

Novo `POST /cliente/produtos-comprados`

**Request:** `{ "telefone": "5547999991234" }`

**Response (`dados`):**

```json
{
  "reconhecido": true,
  "produtos": [
    { "produtoId": 1021, "nome": "Coxinha Frango c/ Aipim 60g c/30", "ultimaCompra": "2026-09-01", "vezes": 14, "qtdMedia": 7, "unidade": "PCT" },
    { "produtoId": 1130, "nome": "Enroladinho Calabresa c/10", "ultimaCompra": "2026-07-14", "vezes": 5, "qtdMedia": 2, "unidade": "PCT" }
  ]
}
```

- Janela sugerida: últimos 12 meses. Ordenado por `ultimaCompra` desc.
- É o que permite ao nosso código dizer "este produto sumiu do padrão dele há 8 semanas" e
  aplicar a regra de promoção certa (item que ele já compra × item que ele não compra).

## 3. Promoções vigentes

Novo `GET /congelados/promocoes`

**Response (`dados`):**

```json
{
  "promocoes": [
    {
      "produtoId": 1130,
      "nome": "Enroladinho Calabresa c/10",
      "tipo": "PRECO",
      "precoPromo": 21.90,
      "precoNormal": 24.08,
      "condicao": "a partir de 2 pct",
      "validoAte": "2026-09-14",
      "tabelas": ["*"]
    }
  ]
}
```

- `tipo`: `PRECO` (preço promocional) ou `LEVE_MAIS` (ex.: leve 10, pague 9). Se vocês tiverem
  outros, listem.
- `tabelas`: pra quais tabelas de preço vale (`"*"` = todas). A Ana só usa a promoção que vale
  pra tabela do cliente.
- Como a Ana usa (regra nossa, fica no nosso código): cliente que **já compra** o item só recebe
  a promoção como incentivo a **levar mais** (nunca pra baixar o preço do que ele já levaria);
  cliente que **não compra ou parou** recebe a promoção cheia.

## 4. Criar pedido: preço promocional por item e origem

Ajuste em `POST /congelados/pedido` (v1.4), aditivo:

```json
{
  "telefone": "5547999991234",
  "itens": [
    { "id": 1021, "quantidade": 8 },
    { "id": 1130, "quantidade": 2, "promocaoId": 77 }
  ],
  "origem": "WHATSAPP_IA",
  "observacaoInterna": "Cliente aceitou a promoção do enroladinho (2 pct).",
  "idempotencyKey": "…"
}
```

- `promocaoId` (ou `precoUnit` se preferirem): a Ana **nunca inventa preço** — só referencia a
  promoção que veio do endpoint 3. O recálculo continua do lado de vocês.
- `observacaoInterna`: texto que só a equipe vê na aprovação (a Leticia entende o que a Ana
  combinou). Diferente de `observacoes`, que é do cliente.
- `origem: "WHATSAPP_IA"` pra filtrar/auditar os pedidos da Ana na fila de vocês.

## 5. Situação financeira — só pro painel da equipe (⚠️ não vira tool da IA)

Novo `POST /cliente/situacao`

**Request:** `{ "telefone": "5547999991234" }`

**Response (`dados`):**

```json
{ "reconhecido": true, "inadimplente": true, "titulosVencidos": 1, "valorVencido": 355.14, "vencidoDesde": "2026-09-02" }
```

- Decisão do Clarkson: **a Ana não fala de cobrança e não muda o atendimento**. O bot só usa
  isso pra avisar a Leticia e o financeiro no painel/WhatsApp interno quando um pedido da Ana
  entrar pra um cliente inadimplente. Mesma regra 🔒 do `/cliente/buscar`: nunca exposto à IA.

## 6. Disponibilidade / falta

Uma das duas opções, a que for mais simples pra vocês:

- **(a)** campo `disponivel: false` (e opcional `previsaoRetorno`) nos itens do
  `/congelados/catalogo` e `/congelados/reconhecer-telefone`; ou
- **(b)** novo `GET /congelados/indisponiveis` → `{ "produtos": [{ "produtoId", "nome", "previsaoRetorno" }] }`.

Sem isso a Ana pergunta pra vendedora pelo WhatsApp a cada falta (já vamos ter esse caminho,
mas ele custa tempo da Leticia).

## 7. Corte de pedido e entrega realizada

- `diasVenda`/`diasEntrega` já vêm no reconhecimento. Falta a **hora de corte** do pedido por
  rota/cliente (ex.: `"horaCorte": "17:00"`) — hoje a vendedora sabe de cabeça. Pode entrar no
  mesmo objeto do reconhecimento.
- Novo `GET /cliente/pedido/:numero` (ou campos a mais no histórico): `statusEntrega`,
  `entregueEm`, `entregador`. Uso: responder "meu pedido chegou?" sem incomodar a logística.

## 8. Padrão único de produto (catálogo, reconhecimento e itens de pedido)

Hoje o nosso código tenta seis nomes de campo pra achar o preço (`preco`, `preco_cliente`,
`valor`, `valor_venda`, `precoCaixa`, `preco_caixa`), três pro id e quatro pra unidades por
embalagem — e o nome vem codificado (`2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR`). Pra Ana
entender "coxinha g / gg / 60gr" ou "dog assado", tamanho, embalagem e preparo precisam ser
**campos**, não pedaços do nome. Pedimos que **todo lugar que devolve produto** (catálogo,
reconhecer-telefone, itens do histórico, itens do pedido criado) use o mesmo objeto:

```json
{
  "id": 1021,
  "codigo": "FR-M-COX-AIP",
  "nome": "Coxinha de Frango com Aipim",
  "nomeSite": "Coxinha de Frango com Aipim 60g (pct 30un)",
  "nomeCompleto": "2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR",
  "linha": "CONGELADOS",
  "grupo": "Salgados fritos",
  "tamanho": "M",
  "pesoUnidadeG": 60,
  "embalagem": { "unidade": "PCT", "unidadesPorEmbalagem": 30, "pesoG": 1800 },
  "preparo": "FRITO",
  "precoTabela": 52.30,
  "precoCliente": 46.06,
  "minimoPorItem": 1,
  "ativo": true,
  "disponivel": true,
  "previsaoRetorno": null,
  "promocao": null,
  "imagem": "https://…/1021.jpg"
}
```

- `nome` curto e humano é o que a Ana fala; **`nomeSite` é o nome exatamente como aparece no
  site** (o cliente que compra pelo site fala desse jeito — ajuda muito no casamento);
  `nomeCompleto` fica pra auditoria/print.
- `tamanho` (P/M/G/GG ou o que vocês usarem) + `pesoUnidadeG` separados: é o que resolve
  "coxinha 60gr" × "coxinha 170gr" × "coxinha g".
- `preparo` (`FRITO` / `ASSADO` / `CRU` / `PRONTO`): resolve "dog assado", "risoles pra fritar".
- `precoCliente` só aparece no reconhecimento (tabela do cliente); no catálogo público é `null`.
- `disponivel` / `previsaoRetorno` / `promocao` são os itens 3 e 6 deste pedido, embutidos.
- Se o cadastro de vocês ainda não tiver `tamanho`/`preparo` separados, pode vir `null` no
  começo — o importante é o **formato ser um só** em todos os endpoints. Apelidos globais
  ("coxinha média") a gente mantém do nosso lado, ligados pelo `id`.

---

## Resumo do que pedimos

| # | Endpoint | Tipo | Destrava |
|---|---|---|---|
| 1a | `POST /cliente/historico-pedidos` + `comItens` + pedidos em aberto | ajuste | pedido de sempre, "já pediu esta semana" |
| 1b | `ultimoPedido` no reconhecer-telefone | ajuste | idem, sem 2ª chamada |
| 2 | `POST /cliente/produtos-comprados` | novo | produto que sumiu, regra de promoção |
| 3 | `GET /congelados/promocoes` | novo | sugestão de venda |
| 4 | `promocaoId` / `observacaoInterna` / `origem` no criar pedido | ajuste | promoção lançada certa, auditoria |
| 5 | `POST /cliente/situacao` | novo (só painel) | aviso interno de inadimplência |
| 6 | disponibilidade no catálogo | ajuste | menos consulta à vendedora |
| 7 | `horaCorte` + entrega realizada | ajuste/novo | prazo certo, "chegou?" |
| 8 | objeto de produto único em todos os endpoints | ajuste | Ana entende tamanho/embalagem/preparo; código para de adivinhar campo |

Quando estiver no ar, mandem os `curl` de exemplo como das outras vezes que a gente pluga e
atualiza o `ia-consulta-api.md` (v1.6.0). Qualquer nome de campo diferente do proposto está ok,
o que importa é o dado.
