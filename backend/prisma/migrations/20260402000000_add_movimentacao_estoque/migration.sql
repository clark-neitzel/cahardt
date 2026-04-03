-- CreateTable: movimentacoes_estoque
CREATE TABLE IF NOT EXISTS "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "pedido_id" TEXT,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "observacao" TEXT,
    "estoque_antes" DECIMAL(12,3) NOT NULL,
    "estoque_depois" DECIMAL(12,3) NOT NULL,
    "sinc_ca" BOOLEAN NOT NULL DEFAULT false,
    "erro_ca" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_fkey"
    FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_vendedor_id_fkey"
    FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_produto_id_idx" ON "movimentacoes_estoque"("produto_id");
CREATE INDEX "movimentacoes_estoque_vendedor_id_idx" ON "movimentacoes_estoque"("vendedor_id");
CREATE INDEX "movimentacoes_estoque_created_at_idx" ON "movimentacoes_estoque"("created_at");
