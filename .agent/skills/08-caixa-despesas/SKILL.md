---
name: 08-caixa-despesas
description: "💰 MÓDULO CAIXA DIÁRIO E DESPESAS. Obrigatório consultar antes de mexer no CaixaDiario, Despesas do Motorista, conferência de caixa, relatório de prestação de contas ou classificação debitaCaixa."
---

# 08 MÓDULO CAIXA DIÁRIO E DESPESAS

> ⚠️ Este módulo cobre o controle financeiro diário do motorista: adiantamento, despesas de rota, recebimentos por entrega e prestação de contas.

---

## 1. CONCEITOS FUNDAMENTAIS

### O que é o Caixa Diário
Cada motorista tem um **CaixaDiario** por dia (`vendedorId + dataReferencia` UNIQUE). Este caixa:
- Registra o **adiantamento** recebido ao sair
- Agrega todas as **despesas** da rota do dia
- Agrega todos os **pagamentos recebidos** nas entregas
- Calcula o **valor a prestar** ao voltar

```
Valor a Prestar = Adiantamento + Total Recebido em Caixa - Total Despesas
```

### Status do CaixaDiario
| Status | Descrição |
|---|---|
| `ABERTO` | Dia em andamento, motorista pode editar despesas |
| `FECHADO` | Motorista fechou — snapshot dos totais gerado |
| `CONFERIDO` | Admin financeiro conferiu e aprovou |

---

## 2. SISTEMA DE CLASSIFICAÇÃO `debitaCaixa` (CRÍTICO)

### O que define se um pagamento "debita o caixa"
O campo `debitaCaixa` na `TabelaPreco` define se um tipo de pagamento é recebido **pelo motorista em espécie** (entra no caixa dele) ou não:

| Tipo de Pagamento | `debitaCaixa` | Lógica |
|---|---|---|
| Dinheiro, PIX | `true` | Motorista recebeu — deve prestar contas |
| Boleto, Prazo | `false` | Cobrado depois — não passa pelo caixa |
| Fiado Escritório | `false` | Escritório assume — não vai para o caixa |
| Fiado Vendedor | `true` | Vendedor responsável — entra no caixa dele |

### Lógica de Classificação (Hierarquia)
```javascript
// 1. Escritório assumindu? → NÃO debita
if (pagamento.escritorioResponsavel) { debitaCaixa = false; }
// 2. Vendedor responsável? → DEBITA
else if (pagamento.vendedorResponsavelId) { debitaCaixa = true; }
// 3. Nome do pagamento real na TabelaPreco? → Usar campo debitaCaixa da tabela
else if (mapaCondicoesPorNome[pagamento.formaPagamentoNome] !== undefined) {
    debitaCaixa = mapaCondicoesPorNome[pagamento.formaPagamentoNome];
}
// 4. Fallback: condição original do pedido
else { debitaCaixa = condicaoInfo?.debitaCaixa || false; }
```

> **IMPORTANTE:** A classificação deve ser feita pelo **nome do pagamento REAL** que o motorista registrou no checkout (`formaPagamentoNome`), **nunca** pela condição original do pedido, pois o cliente pode ter pagado diferente do previsto.

---

## 3. DESPESAS

### Categorias de Despesa
```
MERCADORIA_EMPRESA   — Compra de mercadoria para venda pelo escritório
COMBUSTIVEL          — Abastecimento (campos extras: litros, kmNoAbastecimento, veiculoId)
PEDAGIO_BALSA        — Pedágio ou balsa
HOTEL_HOSPEDAGEM     — Hospedagem durante a rota
MANUTENCAO_VEICULO   — Reparo/troca de peças (campo extra: tipoManutencao)
OUTRO                — Outros
```

### Campos Especiais por Categoria
```javascript
// COMBUSTIVEL
{ veiculoId: uuid, litros: 40.5, kmNoAbastecimento: 150000 }

// MANUTENCAO_VEICULO
{ tipoManutencao: 'PNEU' | 'LAMPADA' | 'OLEO' | 'FILTRO' | 'OUTRO' }
```

### Regras de Edição
- Motorista pode editar despesas **enquanto o caixa estiver ABERTO**
- Admin (`Pode_Editar_Caixa`) pode editar qualquer despesa a qualquer momento

---

## 4. PERMISSÕES DO MÓDULO

```json
{
  "Pode_Acessar_Caixa": false,   // Acessar, visualizar e lançar próprias despesas
  "Pode_Editar_Caixa": false     // Auditor: ver caixas alheios, editar, conferir
}
```

### Acesso por Perfil
| Ação | Motorista (`Pode_Acessar_Caixa`) | Auditor (`Pode_Editar_Caixa`) | Admin |
|---|---|---|---|
| Ver próprio caixa | ✅ | ✅ | ✅ |
| Lançar despesas próprias | ✅ | ✅ | ✅ |
| Ver caixa de outros | ❌ | ✅ | ✅ |
| Editar despesas alheias | ❌ | ✅ | ✅ |
| Conferir/Fechar caixa | ❌ | ✅ | ✅ |
| Marcar entrega como conferida | ❌ | ✅ | ✅ |

---

## 5. ENDPOINTS (`/api/caixa` e `/api/despesas`)

### Caixa
| Método | Path | Permissão | Descrição |
|---|---|---|---|
| `GET` | `/api/caixa/resumo?data=&vendedorId=` | Acesso | Resumo completo do dia (cria se não existir) |
| `PATCH` | `/api/caixa/adiantamento` | Acesso | Define adiantamento do dia |
| `POST` | `/api/caixa/fechar` | Acesso | Fecha o caixa com snapshot dos totais |
| `POST` | `/api/caixa/conferir` | Editor | Admin confere e aprova o caixa |
| `PATCH` | `/api/caixa/entrega-conferir` | Editor | Marca entrega individual como conferida |
| `GET` | `/api/caixa/relatorio?data=&vendedorId=` | Acesso | Dados completos para relatório A4 |

### Despesas
| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/despesas?data=&vendedorId=` | Lista despesas do dia |
| `POST` | `/api/despesas` | Cria nova despesa |
| `PUT` | `/api/despesas/:id` | Edita despesa (regras de caixa aberto) |
| `DELETE` | `/api/despesas/:id` | Exclui despesa (regras de caixa aberto) |

---

## 6. ESTRUTURA DO SCHEMA PRISMA

```prisma
model Despesa {
  id             String   @id @default(uuid())
  vendedorId     String
  dataReferencia String   // YYYY-MM-DD
  categoria      String
  descricao      String?
  valor          Decimal  @db.Decimal(12, 2)
  
  // Combustivel
  veiculoId         String?
  litros            Decimal? @db.Decimal(10, 3)
  kmNoAbastecimento Int?
  
  // Manutencao
  tipoManutencao    String?
  
  criadoPor  String
  // ... timestamps
}

model CaixaDiario {
  id             String   @id @default(uuid())
  vendedorId     String
  dataReferencia String   // YYYY-MM-DD
  
  adiantamento   Decimal  @default(0)
  status         String   @default("ABERTO") // ABERTO | FECHADO | CONFERIDO
  
  // Snapshots ao fechar
  totalDespesas       Decimal?
  totalRecebidoCaixa  Decimal?    // Só o que debita caixa
  totalRecebidoOutros Decimal?    // Boleto, prazo, etc.
  valorAPrestar       Decimal?    // adiantamento + recebidoCaixa - despesas
  
  conferidoPor String?
  conferidoEm  DateTime?
  obsAdmin     String?
  
  @@unique([vendedorId, dataReferencia])
}

model CaixaEntregaConferida {
  caixaDiarioId String
  pedidoId      String
  conferido     Boolean
  conferidoPor  String?
  conferidoEm   DateTime?
  
  @@unique([caixaDiarioId, pedidoId])
}
```

### Migrações SQL a adicionar em `migrationService.js`
```sql
CREATE TABLE IF NOT EXISTS "despesas" (
  "id" TEXT PRIMARY KEY,
  "vendedor_id" TEXT NOT NULL,
  "data_referencia" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "descricao" TEXT,
  "valor" DECIMAL(12,2) NOT NULL,
  "veiculo_id" TEXT,
  "litros" DECIMAL(10,3),
  "km_no_abastecimento" INTEGER,
  "tipo_manutencao" TEXT,
  "criado_por" TEXT NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "caixa_diario" (
  "id" TEXT PRIMARY KEY,
  "vendedor_id" TEXT NOT NULL,
  "data_referencia" TEXT NOT NULL,
  "adiantamento" DECIMAL(12,2) DEFAULT 0,
  "status" TEXT DEFAULT 'ABERTO',
  "total_despesas" DECIMAL(12,2),
  "total_recebido_caixa" DECIMAL(12,2),
  "total_recebido_outros" DECIMAL(12,2),
  "valor_a_prestar" DECIMAL(12,2),
  "conferido_por" TEXT,
  "conferido_em" TIMESTAMP,
  "obs_admin" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  UNIQUE("vendedor_id", "data_referencia")
);

CREATE TABLE IF NOT EXISTS "caixa_entrega_conferida" (
  "id" TEXT PRIMARY KEY,
  "caixa_diario_id" TEXT NOT NULL,
  "pedido_id" TEXT NOT NULL,
  "conferido" BOOLEAN DEFAULT FALSE,
  "conferido_por" TEXT,
  "conferido_em" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  UNIQUE("caixa_diario_id", "pedido_id")
);

ALTER TABLE "tabela_precos" ADD COLUMN IF NOT EXISTS "debita_caixa" BOOLEAN DEFAULT FALSE;
```

---

## 7. CÁLCULO DO RESUMO DO CAIXA

O endpoint `GET /api/caixa/resumo` retorna:
```json
{
  "caixa": { "id", "status", "adiantamento", "dataReferencia", "obsAdmin" },
  "diario": { "veiculoId", "placa", "kmInicial", "kmFinal", "totalKm" },
  "mediaCombustivel3Meses": 12.5,
  "despesas": [...],
  "totalDespesas": 150.00,
  "entregas": [...],
  "contagens": { "totalEntregas": 10, "entregues": 7, "parciais": 2, "devolvidos": 1 },
  "totalRecebidoCaixa": 800.00,   // Só o que debita caixa (dinheiro, pix)
  "totalRecebidoOutros": 200.00,  // Boletos, prazo
  "totalRecebido": 1000.00,
  "detalhamentoCaixa": [{ "condicao", "valor", "debitaCaixa" }],
  "valorAPrestar": 750.00
}
```

---

## 8. MÉDIA DE CONSUMO DE COMBUSTÍVEL

O sistema calcula automaticamente a média de consumo do veículo (km/L) dos **últimos 3 meses** usando os registros de despesa do tipo `COMBUSTIVEL`:

```javascript
// Lógica: calcular km percorridos entre abastecimentos
// (km do abastecimento N - km do abastecimento N-1) / litros do abastecimento N
totalKm / totalLitros = km/L
```

Esta métrica é exibida no resumo do caixa para ajudar na identificação de anomalias (ex: veículo com consumo muito alto pode indicar roubo ou problema mecânico).

---

## 9. PÁGINAS DO MODULO (FRONTEND)

| Arquivo | Rota | Descrição |
|---|---|---|
| `CaixaDiarioPage.jsx` | `/caixa` | Dashboard principal do caixa do dia |
| `DespesasPage.jsx` | `/despesas` | Lançamento de despesas |
| `RelatorioCaixaPrint.jsx` | `/caixa/impressao` | Relatório A4 para impressão |
