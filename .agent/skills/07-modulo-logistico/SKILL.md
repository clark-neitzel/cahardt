---
name: 07-modulo-logistico
description: "🚚 MÓDULO LOGÍSTICO COMPLETO. Obrigatório consultar antes de mexer em Embarques, Entregas, Checkout do Motorista, Permissões de Entregador ou CheckoutEntregaModal."
---

# 07 MÓDULO LOGÍSTICO — Embarques, Entregas e Permissões

> ⚠️ Este módulo cobre todo o ciclo logístico: formação de carga, despacho, checkout do motorista e auditoria financeira.

---

## 1. ARQUITETURA GERAL

### Fluxo Completo
```
Pedido FATURADO (Conta Azul)
    ↓
PainelEmbarque → NovaCargaModal → Embarque criado (status PENDENTE)
    ↓
PainelMotorista ou RotaLeads (aba Entregas) → CheckoutEntregaModal
    ↓
Pedido com statusEntrega = ENTREGUE | ENTREGUE_PARCIAL | DEVOLVIDO
    ↓
AuditoriaEntregas (Admin) ou CaixaDiario (Motorista)
```

### Arquivos Backend
| Arquivo | Responsabilidade |
|---|---|
| `backend/routes/embarques.js` | CRUD de Embarques, formação de carga, despacho |
| `backend/routes/entregas.js` | CRUD de Entregas, checkout motorista, edição admin |
| `backend/routes/formasPagamentoEntrega.js` | Formas de pagamento exclusivas para entrega |

### Arquivos Frontend
| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/pages/Admin/Embarques/PainelEmbarque.jsx` | Lista e gerencia embarques ativos |
| `frontend/src/pages/Admin/Embarques/NovaCargaModal.jsx` | Criação de nova carga (seleciona pedidos + motorista) |
| `frontend/src/pages/Admin/Embarques/AuditoriaEntregas.jsx` | Auditoria financeira de entregas concluídas |
| `frontend/src/pages/Motorista/Entregas/PainelMotorista.jsx` | Tela principal do motorista (app mobile) |
| `frontend/src/pages/Motorista/Entregas/CheckoutEntregaModal.jsx` | Modal de baixa na entrega (motorista) |
| `frontend/src/pages/Rota/RotaLeads.jsx` | Inclui abas Entregas e Entregues para motoristas que também fazem vendas |
| `frontend/src/services/entregasService.js` | Serviço das rotas de entrega |

---

## 2. SISTEMA DE PERMISSÕES LOGÍSTICAS (CRÍTICO)

### ⚠️ PROBLEMA HISTÓRICO QUE JÁ OCORREU
O campo `permissoes` do `Vendedor` é um **JSON armazenado como STRING** no banco. Os middlewares e o frontend **DEVEM sempre fazer parse** antes de checar flags.

```javascript
// ERRADO (vai dar erro/false negativo sempre)
if (req.user.permissoes.admin) { ... }

// CERTO — buscar direto do banco e fazer parse
const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};
```

> Este helper `getPerms` existe em `embarques.js`, `entregas.js`, `caixa.js` e `despesas.js`. **Sempre reutilize este padrão.**

### Flags de Permissão Logística
```json
{
  "Pode_Acessar_Embarque": false,    // Ver painel de embarques / expedição
  "Pode_Executar_Entregas": false,   // Ser motorista — ver e dar baixa em entregas
  "Pode_Ver_Todas_Entregas": false,  // Ver entregas de TODOS os motoristas (auditoria)
  "Pode_Ajustar_Entregas": false     // Editar/estornar lançamentos de entrega (admin financeiro)
}
```

### Hierarquia de Acesso
| Permissão | O que libera |
|---|---|
| `admin: true` | Tudo — bypassa todas as verificações |
| `Pode_Acessar_Embarque` | Painel de Expedição (`/admin/embarques`) |
| `Pode_Executar_Entregas` | App Motorista (`/minhas-entregas`) + abas Entregas/Entregues em RotaLeads |
| `Pode_Ver_Todas_Entregas` | Ver entregas de QUALQUER motorista (combina com `Pode_Executar_Entregas`) |
| `Pode_Ajustar_Entregas` | Estornar e editar lançamentos de entrega |

### Verificação no Frontend (AuthContext)
```jsx
// Em AuthContext.jsx, hasPermission() trata flags booleanas diretas:
const podeEntregas = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Executar_Entregas);
const podeAjustar = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Ajustar_Entregas);
```

> **ATENÇÃO:** O `refreshUser()` foi adicionado ao `AuthContext.jsx` para garantir que permissões salvas no banco apareçam imediatamente após login sem necessidade de logout/login. Use `refreshUser()` ao carregar telas de logística.

---

## 3. EMBARQUES (`embarques.js`)

### Endpoints
| Método | Path | Descrição |
|---|---|---|
| `GET` | `/api/embarques` | Lista embarques ativos/recentes |
| `POST` | `/api/embarques` | Cria novo embarque (formação de carga) |
| `GET` | `/api/embarques/:id` | Detalhe do embarque com pedidos |
| `PATCH` | `/api/embarques/:id/despachar` | Marca embarque como despachado |
| `DELETE` | `/api/embarques/:id` | Remove embarque (somente PENDENTE) |

### Seleção de Motoristas (NovaCargaModal)
Para listar motoristas elegíveis na seleção, filtrar usuários com:
```javascript
// Parse das permissoes (STRING no banco!)
const perms = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
return !!(perms.admin) || !!(perms.Pode_Executar_Entregas);
```

### Pedidos Elegíveis para Embarque
Buscar pedidos com `statusEnvio = 'FATURADO'` e `embarqueId = null` (ainda não despachados):
```javascript
where: { statusEnvio: 'FATURADO', embarqueId: null }
```

---

## 4. ENTREGAS (`entregas.js`)

### Status do Campo `statusEntrega` no Pedido
| Valor | Descrição |
|---|---|
| `PENDENTE` | Aguardando entrega (padrão ao entrar em embarque) |
| `ENTREGUE` | Entregue 100% |
| `ENTREGUE_PARCIAL` | Entregue com devolução de parte |
| `DEVOLVIDO` | 100% devolvido ao estoque |

### Endpoints de Entrega
| Método | Path | Permissão | Descrição |
|---|---|---|---|
| `GET` | `/api/entregas/pendentes` | Entregador ou Ver Todas | Lista pedidos PENDENTES da carga do motorista |
| `GET` | `/api/entregas/concluidas` | Entregador ou Ver Todas | Lista entregas CONCLUÍDAS (últimas 50) |
| `POST` | `/api/entregas/:id/concluir` | Entregador | Registra baixa da entrega (checkout) |
| `PATCH` | `/api/entregas/:id/editar` | Ajustador | Edita lançamento já concluído |
| `DELETE` | `/api/entregas/:id/estorno` | Ajustador | Estorna entrega → volta a PENDENTE |
| `GET` | `/api/entregas/auditoria` | Auditor | Lista global de entregas (sem filtro de motorista) |

### Lógica `verTodas` nas Listagens
```javascript
const perms = req._perms || {};
const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas;
const where = { statusEntrega: 'PENDENTE', embarqueId: { not: null } };
if (!verTodas) where.embarque = { responsavelId: req.user.id };
```

### Enriquecimento com Condição de Pagamento
O pedido salva `opcaoCondicaoPagamento` = `opcaoCondicao` da TabelaPreco (NÃO o `idCondicao`).
```javascript
// CORRETO — buscar por opcaoCondicao
const tabelas = await prisma.tabelaPreco.findMany({
    where: { opcaoCondicao: { in: condicoesCodigos } },
    select: { opcaoCondicao: true, nomeCondicao: true, idCondicao: true }
});
```

---

## 5. CHECKOUT DO MOTORISTA (`CheckoutEntregaModal.jsx`)

### Fluxo de Steps
1. **Step 1** — Seleção de Status Físico (ENTREGUE | ENTREGUE_PARCIAL | DEVOLVIDO)
2. **Step 2** — Registro de Devoluções (apenas se PARCIAL)
3. **Step 3** — Registro de Pagamentos (caixa)

### Formas de Pagamento no Checkout
O modal combina duas fontes:
1. **Formas de Entrega** (`/api/pagamentos-entrega`) — Customizadas pelo escritório (ex: "Fiado Escritório")
2. **Condições de Pagamento** (`/api/tabela-precos`) — Padrões do Conta Azul (ex: "7 dias - Boleto")

```javascript
// Estrutura unificada de _selectId para evitar conflitos de ID entre fontes
{
    _selectId: 'tabela_' + t.idCondicao,  // Para condições da TabelaPreco
    _selectId: f.id,                       // Para FormaPagamentoEntrega
    _grupo: 'Condições de Pagamento' | 'Formas de Entrega'
}
```

### Payload de Conclusão
```javascript
// POST /api/entregas/:id/concluir
{
    statusFinal: 'ENTREGUE' | 'ENTREGUE_PARCIAL' | 'DEVOLVIDO',
    gpsEntrega: 'lat,lng',     // Capturado do GPS do dispositivo
    itensDevolvidos: [...],    // Array de { produtoId, quantidadeDevolvida, valorBaseItem }
    pagamentos: [
        {
            formaPagamentoEntregaId: null | uuid,  // null se for condição da tabela
            formaPagamentoNome: 'string',
            valor: 0.00,
            vendedorResponsavelId: null | uuid,    // Se o vendedor ficou responsável
            escritorioResponsavel: false            // Se o escritório assumiu
        }
    ]
}
```

---

## 6. INTEGRAÇÃO COM `RotaLeads.jsx`

O componente `RotaLeads.jsx` foi expandido para incluir abas **Entregas** e **Entregues** para motoristas que também fazem visitas comerciais:

```javascript
const ABAS = [
    { id: 'atendimento', label: 'Atendimento', ... },
    { id: 'atendidos', label: 'Atendidos', ... },
    { id: 'entregas', label: 'Entregas', ... },    // NOVO
    { id: 'entregues', label: 'Entregues', ... },  // NOVO
];
```

Carregar entregas apenas quando a aba for ativada:
```javascript
useEffect(() => {
    if (aba === 'entregas') carregarEntregas('pendentes');
    if (aba === 'entregues') carregarEntregas('concluidas');
}, [aba, carregarEntregas]);
```

---

## 7. MIGRAÇÕES SQL NECESSÁRIAS (REFERÊNCIA)

> Sempre adicionar ao `migrationService.js` ao alterar o schema.

Tabelas adicionadas neste módulo:
- `embarques` — Cargas logísticas
- `pedido_pagamento_real` — Pagamentos recebidos na entrega
- `entrega_itens_devolvidos` — Itens devolvidos pelo motorista
- `formas_pagamento_entrega` — Formas de pagamento customizadas para entrega

Campo adicionado:
```sql
ALTER TABLE "tabela_precos" ADD COLUMN IF NOT EXISTS "debita_caixa" BOOLEAN DEFAULT FALSE;
```

---

## 8. ANTI-PATTERNS CONHECIDOS

❌ **NÃO verificar** `req.user.permissoes.admin` diretamente — o campo é string JSON no banco.
❌ **NÃO usar** `permissoes.master` — a flag correta é `permissoes.admin`.
❌ **NÃO buscar** pedidos elegíveis para embarque por `statusEnvio = 'ENVIADO'` — deve ser `'FATURADO'`.
❌ **NÃO misturar** `idCondicao` com `opcaoCondicao` — são campos diferentes na `tabelaPreco`.
