-- AlterTable
ALTER TABLE "devolucoes" ADD COLUMN "processado_ca" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "devolucoes" ADD COLUMN "parcela_ca_id" TEXT;
ALTER TABLE "devolucoes" ADD COLUMN "pdf_boleto_url" TEXT;
ALTER TABLE "devolucoes" ADD COLUMN "wizard_etapa" TEXT;
