-- Números em que a equipe confirmou que o "55" é DDD (RS) e não o código do país
-- (cliente daqui com telefone do RS). Aditiva: só uma coluna com default. O deploy cria via `prisma db push`.

ALTER TABLE "cliente_telefone_preferencia" ADD COLUMN IF NOT EXISTS "ddd55_confirmados" TEXT[] DEFAULT ARRAY[]::TEXT[];
