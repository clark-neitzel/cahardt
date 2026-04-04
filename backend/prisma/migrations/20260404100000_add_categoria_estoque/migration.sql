CREATE TABLE "categorias_estoque" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "controla_estoque" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categorias_estoque_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categorias_estoque_nome_key" ON "categorias_estoque"("nome");
