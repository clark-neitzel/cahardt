-- Ordem preferida dos telefones do cliente + último número que respondeu no WhatsApp.
-- Aditiva: só cria a tabela. Sem FK para "clientes" (no teto de 1600 colunas; nada é alterado lá).
-- Sem INSERT: sem linha = ordem padrão. O deploy cria via `prisma db push`.

CREATE TABLE "cliente_telefone_preferencia" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "ordem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "funcionando_chave" TEXT,
    "funcionando_em" TIMESTAMP(3),
    "funcionando_por" TEXT,
    "atualizado_por_tipo" TEXT NOT NULL DEFAULT 'usuario',
    "atualizado_por_id" TEXT,
    "atualizado_por_nome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_telefone_preferencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_telefone_preferencia_cliente_id_key" ON "cliente_telefone_preferencia"("cliente_id");
