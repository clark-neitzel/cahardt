#!/bin/bash

# Migration script para adicionar colunas NCM e conta_azul_updated_at
# Execute no Render Shell: bash scripts/apply_migration.sh

echo "🔧 Aplicando migration: NCM e Conta Azul Updated At..."

# Executar SQL via Prisma
npx prisma db execute --stdin <<SQL
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP;
SQL

echo "✅ Migration aplicada!"

# Verificar colunas
echo "📋 Verificando colunas criadas..."
npx prisma db execute --stdin <<SQL
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'produtos' 
AND column_name IN ('ncm', 'conta_azul_updated_at')
ORDER BY column_name;
SQL

echo "✅ Concluído!"
