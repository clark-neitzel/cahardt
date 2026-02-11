const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Iniciando migração do Módulo Clientes...');

    const commands = [
        // 1. Tabela Condições de Pagamento
        `CREATE TABLE IF NOT EXISTS "condicoes_pagamento" (
        "id" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "codigo" TEXT,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "condicoes_pagamento_pkey" PRIMARY KEY ("id")
    )`,

        // 2. Tabela Clientes
        `CREATE TABLE IF NOT EXISTS "clientes" (
        "UUID" TEXT NOT NULL,
        "Nome" TEXT NOT NULL,
        "Tipo_Pessoa" TEXT,
        "Documento" TEXT,
        "Email" TEXT,
        "Telefone" TEXT,
        "Ativo" BOOLEAN NOT NULL DEFAULT true,
        "Perfis" TEXT,
        "Perfil_Filtro" TEXT,
        "Data_Criacao" TIMESTAMP(3),
        "Data_Alteracao" TIMESTAMP(3),
        "End_Logradouro" TEXT,
        "End_Numero" TEXT,
        "End_Complemento" TEXT,
        "End_Bairro" TEXT,
        "End_Cidade" TEXT,
        "End_Estado" TEXT,
        "End_CEP" TEXT,
        "End_Pais" TEXT,
        "Codigo" TEXT,
        "Observacoes_Gerais" TEXT,
        "Telefone_Celular" TEXT,
        "Telefone_Comercial" TEXT,
        "Indicador_Inscricao_Estadual" TEXT,
        "Outros_Contatos" TEXT,
        "Atrasos_Pagamentos" DECIMAL(12,2),
        "Atrasos_Recebimentos" DECIMAL(12,2),
        "Pagamentos_Mes_Atual" DECIMAL(12,2),
        "Recebimentos_Mes_Atual" DECIMAL(12,2),
        "Dia_de_entrega" TEXT,
        "Dia_de_venda" TEXT,
        "Condicao_de_pagamento" TEXT,
        "Flex_utilizado" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "Ponto_GPS" TEXT,
        "Situacao_serasa" TEXT,
        "Serasa_consulta" TEXT,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "clientes_pkey" PRIMARY KEY ("UUID")
    )`,

        // 3. Tabela Arquivos
        `CREATE TABLE IF NOT EXISTS "cliente_arquivos" (
        "id" TEXT NOT NULL,
        "cliente_uuid" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "cliente_arquivos_pkey" PRIMARY KEY ("id")
    )`,

        // 4. Índices (User IF NOT EXISTS logic via DO block to avoid errors if they exist)
        `CREATE UNIQUE INDEX IF NOT EXISTS "clientes_Documento_key" ON "clientes"("Documento")`,
        `CREATE INDEX IF NOT EXISTS "clientes_Nome_idx" ON "clientes"("Nome")`,
        `CREATE INDEX IF NOT EXISTS "clientes_Documento_idx" ON "clientes"("Documento")`,
        `CREATE INDEX IF NOT EXISTS "clientes_Codigo_idx" ON "clientes"("Codigo")`,
        `CREATE INDEX IF NOT EXISTS "clientes_End_Cidade_idx" ON "clientes"("End_Cidade")`,
        `CREATE INDEX IF NOT EXISTS "clientes_Perfil_Filtro_idx" ON "clientes"("Perfil_Filtro")`,

        // 5. Foreign Keys (Need check to avoid "relation already exists" or "constraint already exists" errors)
        `DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'clientes_Condicao_de_pagamento_fkey') THEN 
        ALTER TABLE "clientes" ADD CONSTRAINT "clientes_Condicao_de_pagamento_fkey" FOREIGN KEY ("Condicao_de_pagamento") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE; 
      END IF; 
    END $$`,

        `DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'cliente_arquivos_cliente_uuid_fkey') THEN 
        ALTER TABLE "cliente_arquivos" ADD CONSTRAINT "cliente_arquivos_cliente_uuid_fkey" FOREIGN KEY ("cliente_uuid") REFERENCES "clientes"("UUID") ON DELETE CASCADE ON UPDATE CASCADE; 
      END IF; 
    END $$`
    ];

    console.log('📦 Aplicando alterações no banco de dados...');

    for (const cmd of commands) {
        try {
            await prisma.$executeRawUnsafe(cmd);
        } catch (e) {
            console.log('⚠️ Erro/Aviso (pode ignorar se for DUPLICATE):', e.message);
        }
    }

    console.log('✅ Migração de Clientes concluída.');
    await prisma.$disconnect();
}

main();
