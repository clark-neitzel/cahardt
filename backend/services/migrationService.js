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
            `CREATE UNIQUE INDEX IF NOT EXISTS "condicoes_pagamento_nome_key" ON "condicoes_pagamento"("nome");`,

            // ContaAzulConfig
            `CREATE TABLE IF NOT EXISTS "conta_azul_config" (
                "id" TEXT NOT NULL,
                "accessToken" TEXT NOT NULL,
                "refreshToken" TEXT NOT NULL,
                "expiresIn" INTEGER NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "conta_azul_config_pkey" PRIMARY KEY ("id")
            );`,

            // Vendedores (Added manually to fix missing table error)
            `CREATE TABLE IF NOT EXISTS "vendedores" (
                "id" TEXT NOT NULL,
                "nome" TEXT NOT NULL,
                "email" TEXT,
                "id_legado" TEXT,
                "flex_mensal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
                "flex_disponivel" DECIMAL(12, 2) NOT NULL DEFAULT 0,
                "ativo" BOOLEAN NOT NULL DEFAULT true,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
            );`,

            // Update 02: Link Cliente -> Vendedor
            `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "id_vendedor" TEXT;`,

            // App Configs (Configurações do Sistema)
            `CREATE TABLE IF NOT EXISTS "app_configs" (
                "key" TEXT NOT NULL,
                "value" JSONB NOT NULL,
                CONSTRAINT "app_configs_pkey" PRIMARY KEY ("key")
            );`,

            // Update 03: Canais de Atendimento (Array de Strings)
            // Update 03: Canais de Atendimento (Array de Strings)
            `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "Formas_Atendimento" TEXT[];`,

            // Update 04: Tabela de Preços (Condições Avançadas)
            `CREATE TABLE IF NOT EXISTS "tabela_precos" (
                "id" TEXT NOT NULL,
                "id_condicao" TEXT NOT NULL,
                "nome_condicao" TEXT NOT NULL,
                "tipo_pagamento" TEXT,
                "opcao_condicao" TEXT,
                "qtd_parcelas" INTEGER NOT NULL DEFAULT 1,
                "parcelas_dias" INTEGER NOT NULL DEFAULT 0,
                "acrescimo_preco" DECIMAL(10, 2) NOT NULL DEFAULT 0,
                "parcelas_percentuais" DECIMAL(10, 2) NOT NULL DEFAULT 100,
                "exige_banco" BOOLEAN NOT NULL DEFAULT false,
                "banco_padrao" TEXT,
                "ativo" BOOLEAN NOT NULL DEFAULT true,
                "obs" TEXT,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "tabela_precos_pkey" PRIMARY KEY ("id")
            );`,

            // Seed Tabela de Preços (Idempotent: ON CONFLICT DO UPDATE/NOTHING)
            `INSERT INTO "tabela_precos" ("id", "id_condicao", "nome_condicao", "tipo_pagamento", "opcao_condicao", "qtd_parcelas", "parcelas_dias", "acrescimo_preco", "parcelas_percentuais", "exige_banco", "banco_padrao", "ativo", "updated_at") VALUES
            ('1000', 'AVISTA_DIN', 'À vista - Dinheiro', 'DINHEIRO', 'À vista', 1, 1, 0, 100, false, '1dc7f96e-7658-4e0c-8d0a-5c5980234c90', true, NOW()),
            ('1001', 'AVISTA_PIX', 'À vista - Pix', 'PIX', 'À vista', 1, 1, 0, 100, false, 'ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0', true, NOW()),
            ('1002', 'BOL_7', '7 dias - Boleto', 'BOLETO_BANCARIO', '1x', 1, 7, 2.5, 100, true, 'ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0', true, NOW()),
            ('1003', 'BOL_14', '14 dias - Boleto', 'BOLETO_BANCARIO', '1x', 1, 14, 4, 100, true, 'ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0', true, NOW()),
            ('1004', 'BOL_21', '21 dias - Boleto', 'BOLETO_BANCARIO', '1x', 1, 21, 5, 100, true, null, true, NOW()),
            ('1005', 'BOL_28', '28 dias - Boleto', 'BOLETO_BANCARIO', '1x', 1, 28, 6, 100, true, 'ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0', true, NOW()),
            ('1007', 'CARD_DEB', 'Cartão - Débito', 'CARTAO', null, 1, 1, 4, 100, false, null, true, NOW()),
            ('1008', 'CARD_CRED', 'Cartão - Crédito', 'CARTAO', null, 1, 1, 4, 100, false, null, true, NOW())
            ON CONFLICT ("id") DO UPDATE SET
                "id_condicao" = EXCLUDED."id_condicao",
                "nome_condicao" = EXCLUDED."nome_condicao",
                "tipo_pagamento" = EXCLUDED."tipo_pagamento",
                "opcao_condicao" = EXCLUDED."opcao_condicao",
                "qtd_parcelas" = EXCLUDED."qtd_parcelas",
                "parcelas_dias" = EXCLUDED."parcelas_dias",
                "acrescimo_preco" = EXCLUDED."acrescimo_preco",
                "parcelas_percentuais" = EXCLUDED."parcelas_percentuais",
                "exige_banco" = EXCLUDED."exige_banco",
                "banco_padrao" = EXCLUDED."banco_padrao",
                "ativo" = EXCLUDED."ativo",
                "updated_at" = NOW();`
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
