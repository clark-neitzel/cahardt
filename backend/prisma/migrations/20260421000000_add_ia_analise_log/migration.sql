-- CreateTable
CREATE TABLE "ia_analise_logs" (
    "id" SERIAL NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "disparado_por" TEXT NOT NULL,
    "disparado_por_usuario_id" TEXT,
    "atendimento_id" TEXT,
    "modelo" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "prompt_enviado" TEXT NOT NULL,
    "dados_entrada" JSONB NOT NULL,
    "resposta_ia" JSONB,
    "tokens_prompt" INTEGER,
    "tokens_resposta" INTEGER,
    "tokens_total" INTEGER,
    "duracao_ms" INTEGER,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "erro_msg" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_analise_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ia_analise_logs_cliente_id_idx" ON "ia_analise_logs"("cliente_id");

-- CreateIndex
CREATE INDEX "ia_analise_logs_criado_em_idx" ON "ia_analise_logs"("criado_em" DESC);

-- CreateIndex
CREATE INDEX "ia_analise_logs_vendedor_id_idx" ON "ia_analise_logs"("vendedor_id");

-- CreateIndex
CREATE INDEX "ia_analise_logs_disparado_por_idx" ON "ia_analise_logs"("disparado_por");

-- AddForeignKey
ALTER TABLE "ia_analise_logs" ADD CONSTRAINT "ia_analise_logs_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE RESTRICT ON UPDATE CASCADE;
