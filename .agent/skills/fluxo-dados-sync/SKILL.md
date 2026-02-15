---
name: fluxo-dados-sync
description: Padrão de sincronização entre Conta Azul (Mock) e App Hardt
---

# Fluxo de Sincronização (Sync)

O sistema mantém uma cópia local dos dados do ERP (Conta Azul) para performance e funcionamento offline/híbrido.

## Estrutura

1.  **Origem**: `ContaAzulService` (Mocks ou API Real).
2.  **Destino**: Banco de Dados PostgreSQL (Prisma).
3.  **Lógica**: `Upsert` (Update or Insert).

## Regras de Negócio

### Produtos
- Chave de Ligação: `contaAzulId` (UUID vindo do ERP).
- Campos Sincronizados: Nome, Valor, Estoque, Status.
- Campos Locais (Não sobrescritos): Imagens, Descrições personalizadas (se houver flag).

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
