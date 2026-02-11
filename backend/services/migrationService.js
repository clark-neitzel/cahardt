const prisma = require('../config/database');

const migrationService = {
    run: async () => {
        console.log('🚀 [MigrationService] Iniciando verificação de migrações manuais...');

        const commands = [
            // init_clientes (Idempotent)
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
                "Data_Criacao" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
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
                "updated_at" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "clientes_pkey" PRIMARY KEY ("UUID")
            );`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "clientes_Documento_key" ON "clientes"("Documento");`,
            `CREATE INDEX IF NOT EXISTS "clientes_Nome_idx" ON "clientes"("Nome");`,

            // update_01_nome_fantasia
            `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "NomeFantasia" TEXT;`,
            `CREATE INDEX IF NOT EXISTS "clientes_NomeFantasia_idx" ON "clientes"("NomeFantasia");`,

            // CondicaoPagamento
            `CREATE TABLE IF NOT EXISTS "condicoes_pagamento" (
                "id" TEXT NOT NULL,
                "nome" TEXT NOT NULL,
                "codigo" TEXT,
                "ativo" BOOLEAN NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "condicoes_pagamento_pkey" PRIMARY KEY ("id")
            );`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "condicoes_pagamento_nome_key" ON "condicoes_pagamento"("nome");`
        ];

        for (const [index, cmd] of commands.entries()) {
            try {
                await prisma.$executeRawUnsafe(cmd);
                // console.log(`✅ [MigrationService] Comando ${index + 1} executado.`);
            } catch (e) {
                console.warn(`⚠️ [MigrationService] Aviso no comando ${index + 1}: ${e.message}`);
                // Não throw error para não travar o server se for erro de "já existe" que o IF NOT EXISTS não pegou
            }
        }

        console.log('🏁 [MigrationService] Verificação concluída.');
    }
};

module.exports = migrationService;
