---
name: fluxo-dados-sync
description: Padrão de sincronização entre Conta Azul (Mock) e App Hardt
---

# Fluxo de Sincronização (Sync)

O sistema mantém uma cópia local dos dados do ERP (Conta Azul) para performance e funcionamento offline/híbrido.

## Estrutura

1.  **Origem**: API Real do Conta Azul (`contaAzulService.js`).
2.  **Destino**: Banco de Dados PostgreSQL (Prisma).
3.  **Lógica**: `Upsert` (Update or Insert) com comparação de timestamps.

## Regras de Negócio

### Produtos - Sincronização Incremental ⚡

**Estratégia de Performance:**

O sistema implementa **sincronização incremental** para otimizar chamadas de API e reduzir tempo de sync em ~96%:

1. **Busca lista completa** de produtos (`GET /v1/produtos`)
   - Retorna apenas: `id`, `nome`, `codigo_sku`, `status`, `categoria`, `ultima_atualizacao`
   
2. **Compara timestamps** localmente
   - `ultima_atualizacao` (Conta Azul) vs `contaAzulUpdatedAt` (banco local)
   - Usa `Map` para lookup O(1)

3. **Busca detalhes** apenas quando necessário
   - Produto novo (não existe localmente)
   - Produto alterado (timestamps diferentes)
   - **Ignora** produtos com timestamp igual

4. **Salva timestamp** para próxima comparação
   - Usa timestamp da **lista**, não dos detalhes
   - Garante consistência entre comparação e salvamento

**Performance:**
- Sem mudanças: ~5 segundos (0 chamadas de detalhes)
- Com mudanças: ~1-2 minutos (N chamadas, onde N = produtos alterados)
- Ganho: **96% mais rápido** quando não há alterações

**Chave de Ligação:** `contaAzulId` (UUID vindo do ERP)

**Campos Sincronizados:**
- **Identificação**: `nome`, `codigo`, `ean`, `ncm`
- **Preços**: `valorVenda`, `custoMedio`
- **Estoques**: `estoqueDisponivel`, `estoqueReservado`, `estoqueTotal`, `estoqueMinimo`
- **Detalhes**: `unidade`, `categoria`, `descricao`, `status`, `pesoLiquido`
- **Timestamp**: `contaAzulUpdatedAt` ⚠️ **CRÍTICO** - para sync incremental

**Campos Locais (Não sobrescritos):**
- `ativo` - Controle local de visibilidade no app
- `imagens` - Imagens customizadas localmente

**Mapeamento Crítico (API v2):**
```javascript
// ⚠️ ATENÇÃO: Campos estão DENTRO de objetos aninhados
const dadosProduto = {
  valorVenda: p.estoque.valor_venda,      // NÃO p.valor_venda
  custoMedio: p.estoque.custo_medio,      // NÃO p.custo_medio
  estoqueMinimo: p.estoque.minimumStock,  // camelCase! NÃO estoque_minimo
  ncm: p.fiscal?.ncm?.codigo,             // Aninhado em fiscal.ncm
  unidade: p.fiscal?.unidade_medida?.descricao,
  contaAzulUpdatedAt: itemList.ultima_atualizacao  // Da LISTA, não dos detalhes
};
```

### 4. Logging Robusto (OBRIGATÓRIO)
Todo processo de sincronização DEVE implementar logs detalhados salvos no banco de dados (`SyncLog`).

**Regras de Log:**
1.  **Request/Response:** Em caso de erro, salvar URL, Método, Status Code e Body da resposta.
2.  **Transparência:** O usuário final deve conseguir ver o motivo Exato da falha no painel (ex: mensagem de erro da API).
3.  **Auditoria:** Manter histórico de execução com duração e contagem de registros.

### Clientes
- Chave de Ligação: `Documento` (CPF/CNPJ) ou `UUID` (se disponível).
- Campos Sincronizados: Nome, Fantasia, Endereço, Contatos.
- Campos Locais:
    - **Dados Operacionais**: Dia de Entrega, Dia de Venda, GPS, Observações.
    - Estes campos **NÃO** devem ser sobrescritos pelo Sync se estiverem vazios na origem.

## Scripts de Sync
- Localizados em `backend/scripts/`.
- Ex: `sync_clientes_manual.js`, `populate_manual.js`.
- **Atenção**: Scripts manuais rodam no contexto da máquina host. Certifique-se que o banco está acessível (localhost vs docker service name).
