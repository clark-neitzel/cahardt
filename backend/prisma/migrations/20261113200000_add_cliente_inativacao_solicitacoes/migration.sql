-- Pedidos de inativação de cliente (o agente pede, uma pessoa aprova no app).
-- Aditiva: só cria a tabela. Sem FK para "clientes" (no teto de 1600 colunas; nada é alterado lá).
-- O deploy cria via `prisma db push`.

CREATE TABLE "cliente_inativacao_solicitacoes" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "detalhe" TEXT,
    "solicitado_por" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'api_agente',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "decidido_por_id" TEXT,
    "decidido_por_nome" TEXT,
    "decidido_em" TIMESTAMP(3),
    "observacao_decisao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_inativacao_solicitacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cliente_inativacao_solicitacoes_cliente_id_status_idx" ON "cliente_inativacao_solicitacoes"("cliente_id", "status");
CREATE INDEX "cliente_inativacao_solicitacoes_status_created_at_idx" ON "cliente_inativacao_solicitacoes"("status", "created_at");
