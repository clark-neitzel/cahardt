-- CreateTable
CREATE TABLE "receita_versao_log" (
    "id" TEXT NOT NULL,
    "receita_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "alteracoes" JSONB NOT NULL,
    "alterado_por_id" TEXT,
    "alterado_por_nome" TEXT,
    "alterado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receita_versao_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receita_versao_log_receita_id_idx" ON "receita_versao_log"("receita_id");

-- AddForeignKey
ALTER TABLE "receita_versao_log" ADD CONSTRAINT "receita_versao_log_receita_id_fkey" FOREIGN KEY ("receita_id") REFERENCES "receitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
