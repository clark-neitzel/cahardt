-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN "formas_atendimento_visiveis" TEXT[] DEFAULT ARRAY[]::TEXT[];
