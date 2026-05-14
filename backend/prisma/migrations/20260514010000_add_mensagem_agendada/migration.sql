-- CreateTable
CREATE TABLE "mensagens_agendadas" (
    "id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "dias_semana" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_envio" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mensagens_agendadas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mensagens_agendadas" ADD CONSTRAINT "mensagens_agendadas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
