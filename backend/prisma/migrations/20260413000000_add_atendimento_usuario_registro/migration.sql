-- Rastreia o usuário real que registrou o atendimento (pode ser diferente do vendedor responsável do cliente)
ALTER TABLE "atendimentos" ADD COLUMN "usuario_registro_id" TEXT;

ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_usuario_registro_id_fkey"
  FOREIGN KEY ("usuario_registro_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "atendimentos_usuario_registro_id_idx" ON "atendimentos"("usuario_registro_id");
