---
name: contaazul-pedidos
description: Integração de Pedidos (Vendas) com a API do Conta Azul
---

# Integração de Pedidos - Conta Azul

Esta skill documenta a integração de envio de Pedidos (Vendas) para o Conta Azul, baseada no script legado e nas regras da API.

## 1. Fluxo de Sincronização

1. **Local (App)**: O pedido é criado no app com status inicial.
2. **Status de Envio**:
   - `ABERTO`: Pedido rascunho ou bloqueado (ex: sem saldo flex). O vendedor pode alterar livremente.
   - `ENVIAR`: Pedido finalizado pelo vendedor, pronto para envio. Não pode mais ser alterado.
   - `SINCRONIZANDO`: O worker/script pegou o pedido e está processando com o CA.
   - `RECEBIDO`: Pedido processado com sucesso no CA, recebemos o `id_venda_contaazul`. Intocável.
   - `ERRO`: Ocorreu falha no envio. A mensagem vai para `erro_envio`.
3. **Job Assíncrono**: Um processo em background pega 1 pedido por vez (prioriza `SINCRONIZANDO`, depois `ENVIAR`).
4. **Idempotência e Prevenção de Duplicidade**:
   - Se já existe `id_venda_contaazul`, verifica via `GET /v1/venda/{id}` se consta no CA.
   - Se não tem ID, mas tem `numero`, busca via `GET /v1/venda/busca?numeros={numero}`. Se achar, salva o ID e marca como `RECEBIDO`.
   - Se não existir no CA de forma alguma, gera um novo número (`GET /v1/venda/proximo-numero`) se necessário, constrói o payload e dispara `POST /v1/venda`.

## 2. Estrutura de Envio (Payload POST /v1/venda)

*A integração cria vendas SEM NATUREZA FINANCEIRA, para evitar que o Conta Azul crie lançamentos financeiros não desejados imediatamente ou use categorias incorretas.*

### Payload Base
```json
{
  "id_cliente": "UUID-DO-CLIENTE",
  "numero": 12345, // Adquirido do proximo-numero se não existir
  "situacao": "APROVADO",
  "data_venda": "YYYY-MM-DD", // Data de ENTREGA que o vendedor estipulou
  "observacoes": "Texto livre",
  "id_vendedor": "UUID-DO-VENDEDOR", // Só envia se for UUID v4 válido
  "id_categoria": "UUID-CATEGORIA", // Opcional
  "itens": [
    {
      "id": "UUID-DO-PRODUTO",
      "descricao": "Nome do produto/Obs",
      "quantidade": 10.5,
      "valor": 15.90, // Valor unitário estipulado pelo vendedor (pode ter flex)
      "tipo": "PRODUTO"
    }
  ],
  "condicao_pagamento": {
    "tipo_pagamento": "BOLETO", // Vem de CondicaoPagamento.tipo_pagamento
    "id_conta_financeira": "UUID-CONTA", // Vem de CondicaoPagamento.banco_padrao
    "opcao_condicao_pagamento": "30 dias", // Vem de CondicaoPagamento.opcao_condicao 
    "pagamento_a_vista": false,
    "parcelas": [
      {
        "data_vencimento": "YYYY-MM-DD", // Data Venda + parcelas_dias
        "valor": 166.95, // Soma total dos itens (Neste modelo enviamos 1 parcela pro total)
        "descricao": "Venda 12345"
      }
    ]
  }
}
```

## 3. Regra de Integração de API (Token Auto-Refresh)
**CRÍTICO:** Nunca use `axios.get()` ou `axios.post()` diretamente para interagir com a API do Conta Azul a partir dos Services, pois o Token expira a cada 1 hora.
- Se for fazer um `GET` (como buscar vendas ou próximo número), use o wrapper interno `contaAzulService._axiosGet(url, 'LOG_NAME')` que interceptará falhas `401 Unauthorized` e renovará o token silenciosamente.
- Se for fazer um `POST/PUT` (como enviar a venda), se assegure de capturar o token atual com `contaAzulService.getAccessToken()` e, caso ocorra a falha HTTP `401`, chame `contaAzulService.getAccessToken(true)` para forçar a renovação e tente a requisição novamente.

## 4. Limitações e Regras CA
- O array de itens deve conter apenas produtos cadastrados (`id` de produto válido). `pedido_item_id` ou identificadores similares do app são controles locais apenas.
- Vendedores precisam ser cadastrados no ERP e linkados no Payload via `id_vendedor`.
- Ref: Common Mistakes: `https://developers.contaazul.com/commonmistakes`
- O `proximo-numero` pode falhar e o retorno ser texto puro em vez de JSON. Deve tratar o retorno (`Number(response.body)` vs `JSON.parse`).

### Limitações Fiscais e Logísticas (API v1)
A API Pública `POST /v1/venda` do Conta Azul foca apenas na criação do **Pedido de Venda** (Reserva de Estoque e Provisão Financeira). 
Ela **não suporta** o envio direto de dados para emissão da NF-e, como:
- **Natureza de Operação (CFOP)**
- **Dados da Transportadora / Frete Logístico**

**Solução:** O faturamento da Nota Fiscal deve ocorrer dentro do painel do Conta Azul. A emissão puxará as configurações de Natureza de Operação padrões vinculadas aos produtos/clientes, ou necessitará de preenchimento manual do faturista no ERP antes de emitir a nota. O aplicativo Antigravity apenas envia a venda.
