-- Adiciona campo controlaEstoque na tabela categorias_produto
ALTER TABLE "categorias_produto" ADD COLUMN IF NOT EXISTS "controla_estoque" BOOLEAN NOT NULL DEFAULT false;
