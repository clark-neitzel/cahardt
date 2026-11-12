-- Sugestões registradas pelos agentes comerciais (API /api/analytics/v1).
-- Não altera pedido nem financeiro. O deploy do app também cria esta tabela
-- via `prisma db push` (script start); este arquivo existe para o histórico
-- de migrations.

CREATE TABLE "sugestoes_agente" (
    "id" TEXT NOT NULL,
    "sugestao_id" TEXT NOT NULL,
    "agente" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGERIDA',
    "vendedor_id" TEXT,
    "cliente_id" TEXT,
    "lead_id" TEXT,
    "prova_texto" TEXT,
    "prova_por" TEXT,
    "prova_em" TIMESTAMP(3),
    "aprovado_por" TEXT,
    "historico" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sugestoes_agente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sugestoes_agente_sugestao_id_key" ON "sugestoes_agente"("sugestao_id");
CREATE INDEX "sugestoes_agente_status_idx" ON "sugestoes_agente"("status");
CREATE INDEX "sugestoes_agente_vendedor_id_idx" ON "sugestoes_agente"("vendedor_id");
CREATE INDEX "sugestoes_agente_cliente_id_idx" ON "sugestoes_agente"("cliente_id");
CREATE INDEX "sugestoes_agente_lead_id_idx" ON "sugestoes_agente"("lead_id");
CREATE INDEX "sugestoes_agente_criado_em_idx" ON "sugestoes_agente"("criado_em");

ALTER TABLE "sugestoes_agente" ADD CONSTRAINT "sugestoes_agente_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sugestoes_agente" ADD CONSTRAINT "sugestoes_agente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sugestoes_agente" ADD CONSTRAINT "sugestoes_agente_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
