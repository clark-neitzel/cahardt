-- Adicionar coluna NCM à tabela produtos
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;

-- Verificar se a coluna foi criada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'produtos' AND column_name = 'ncm';
