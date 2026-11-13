-- Classificação manual do cadastro (cliente / fornecedor / cliente e fornecedor).
-- Aditiva: só cria a tabela. Sem FK para "clientes" (no teto de 1600 colunas; nada é alterado lá).
-- A classificação automática é calculada ao vivo e NÃO é gravada aqui. Sem INSERT.
-- O deploy cria via `prisma db push`.

CREATE TABLE "cliente_classificacao" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "classificacao" TEXT NOT NULL,
    "atualizado_por_tipo" TEXT NOT NULL DEFAULT 'usuario',
    "atualizado_por_id" TEXT,
    "atualizado_por_nome" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_classificacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_classificacao_cliente_id_key" ON "cliente_classificacao"("cliente_id");
