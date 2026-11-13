-- Pessoas que atendem o WhatsApp do cliente (API /api/analytics/v1 e ficha do cliente).
-- Não mexe em Telefone / Telefone_Celular / cliente_whatsapps: o número da empresa
-- continua onde já estava. O deploy cria esta tabela via `prisma db push`.
-- A cópia dos telefones existentes (contato sem nome) roda no boot do backend
-- (clienteContatoService.migrarTelefonesExistentes) — db push não executa INSERT.

CREATE TABLE "cliente_contatos" (
    "id" TEXT NOT NULL,
    "cliente_uuid" TEXT NOT NULL,
    "nome" TEXT,
    "nome_chave" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL,
    "telefone_chave" TEXT NOT NULL,
    "papel" TEXT,
    "nota" TEXT,
    "ultimo_contato_em" TIMESTAMP(3),
    "origem" TEXT NOT NULL DEFAULT 'CADASTRO',
    "criado_por" TEXT,
    "atualizado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_contatos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_contatos_cliente_uuid_telefone_chave_nome_chave_key"
    ON "cliente_contatos"("cliente_uuid", "telefone_chave", "nome_chave");

CREATE INDEX "cliente_contatos_telefone_chave_idx" ON "cliente_contatos"("telefone_chave");

ALTER TABLE "cliente_contatos"
    ADD CONSTRAINT "cliente_contatos_cliente_uuid_fkey"
    FOREIGN KEY ("cliente_uuid") REFERENCES "clientes"("UUID")
    ON DELETE CASCADE ON UPDATE CASCADE;
