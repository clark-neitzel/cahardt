-- Migration: Adicionar colunas NCM e Conta Azul Updated At
-- Execute este SQL no Render Shell ou via psql

-- Adicionar coluna NCM
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;

-- Adicionar coluna conta_azul_updated_at  
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP;

-- Verificar se as colunas foram criadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'produtos' 
AND column_name IN ('ncm', 'conta_azul_updated_at')
ORDER BY column_name;
