-- Histórico de alterações do cliente (auditoria: quem, quando, de onde, antes → depois).
-- Aditiva: só cria a tabela. Sem FK para "clientes" (o histórico sobrevive ao cadastro)
-- e sem mexer em nenhuma tabela ou dado existente. O deploy cria via `prisma db push`.

CREATE TABLE "cliente_alteracoes" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL DEFAULT 'cliente',
    "entidade_id" TEXT,
    "acao" TEXT NOT NULL DEFAULT 'alterado',
    "campo" TEXT NOT NULL,
    "valor_antigo" TEXT,
    "valor_novo" TEXT,
    "autor_tipo" TEXT NOT NULL,
    "autor_id" TEXT,
    "autor_nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "tela" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_alteracoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cliente_alteracoes_cliente_id_created_at_idx" ON "cliente_alteracoes"("cliente_id", "created_at");
