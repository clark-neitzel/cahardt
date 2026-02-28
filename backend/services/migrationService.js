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
                "updated_at" = NOW();`,

            // Update 05: Contas Financeiras (Bancos)
            `CREATE TABLE IF NOT EXISTS "contas_financeiras" (
                "id" TEXT NOT NULL,
                "nome_banco" TEXT NOT NULL,
                "tipo_uso" TEXT NOT NULL,
                "ativo" BOOLEAN NOT NULL DEFAULT true,
                "ultima_captura_em" TIMESTAMP(3),
                "fonte_venda_id" TEXT,
                "obs" TEXT,
                "opcao_condicao" TEXT,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "contas_financeiras_pkey" PRIMARY KEY ("id")
            );`,

            // Seed Contas Financeiras
            `INSERT INTO "contas_financeiras" ("id", "nome_banco", "tipo_uso", "ativo", "ultima_captura_em", "fonte_venda_id", "opcao_condicao", "updated_at") VALUES
            ('1dc7f96e-7658-4e0c-8d0a-5c5980234c90', 'Caixinha', 'DINHEIRO', true, '2026-02-01T12:58:20.667Z', '5bf9e998-34bf-4e6a-8e20-9e4b34c4b053', 'À vista', NOW()),
            ('ed4798c2-f8e3-4e87-9ff3-8f264dcf6aa0', 'Conta Azul', 'BOLETO_BANCARIO', true, '2026-01-22T20:45:40.396Z', '4e83e2f3-3950-47f5-9d5d-c43974506dfa', '1x', NOW()),
            ('dc83b583-4a49-47c4-b238-c7d14ab77d5f', 'Acredicoop', 'BOLETO_BANCARIO', true, '2026-01-22T20:48:03.238Z', '4e83e2f3-3950-47f5-9d5d-c43974506dfa', '1x', NOW()),
            ('f756dd56-4946-493e-9343-0a2e2fdfe681', 'Sicoob', 'BOLETO_BANCARIO', true, '2026-01-28T23:14:10.915Z', '4e83e2f3-3950-47f5-9d5d-c43974506dfa', '1x', NOW())
            ON CONFLICT ("id") DO UPDATE SET
                "nome_banco" = EXCLUDED."nome_banco",
                "tipo_uso" = EXCLUDED."tipo_uso",
                "ativo" = EXCLUDED."ativo",
                "ultima_captura_em" = EXCLUDED."ultima_captura_em",
                "fonte_venda_id" = EXCLUDED."fonte_venda_id",
                "opcao_condicao" = EXCLUDED."opcao_condicao",
                "updated_at" = NOW();`,

            // Update 06: Campos NCM e Data Conta Azul Atualizada em Produtos
            `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;`,
            `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP(3);`,

            // Update 07: Adicionar condicoes_pagamento_permitidas no Cliente
            `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "condicoes_pagamento_permitidas" TEXT[] DEFAULT ARRAY[]::TEXT[];`,

            // Update 08: Criação da Tabela de Pedidos
            `CREATE TABLE IF NOT EXISTS "pedidos" (
                "id" TEXT NOT NULL,
                "numero" INTEGER,
                "data_venda" TIMESTAMP(3) NOT NULL,
                "observacoes" TEXT,
                "id_conta_financeira" TEXT,
                "id_categoria" TEXT,
                "tipo_pagamento" TEXT,
                "opcao_condicao_pagamento" TEXT,
                "qtd_parcelas" INTEGER NOT NULL DEFAULT 1,
                "primeiro_vencimento" TIMESTAMP(3),
                "intervalo_dias" INTEGER NOT NULL DEFAULT 0,
                "status_envio" TEXT NOT NULL DEFAULT 'ABERTO',
                "id_venda_contaazul" TEXT,
                "erro_envio" TEXT,
                "enviado_em" TIMESTAMP(3),
                "flex_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
                "lat_lng" TEXT,
                "cliente_id" TEXT NOT NULL,
                "vendedor_id" TEXT,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updated_at" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
            );`,
            `CREATE INDEX IF NOT EXISTS "pedidos_status_envio_idx" ON "pedidos"("status_envio");`,
            `CREATE INDEX IF NOT EXISTS "pedidos_vendedor_id_idx" ON "pedidos"("vendedor_id");`,
            `CREATE INDEX IF NOT EXISTS "pedidos_cliente_id_idx" ON "pedidos"("cliente_id");`,

            // Update 09: Criação da Tabela de Itens de Pedidos
            `CREATE TABLE IF NOT EXISTS "pedido_itens" (
                "id" TEXT NOT NULL,
                "descricao" TEXT,
                "quantidade" DECIMAL(12,3) NOT NULL,
                "valor" DECIMAL(12,2) NOT NULL,
                "valor_base" DECIMAL(12,2) NOT NULL,
                "flex_gerado" DECIMAL(12,2) NOT NULL DEFAULT 0,
                "pedido_id" TEXT NOT NULL,
                "produto_id" TEXT NOT NULL,
                CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
            );`,

            // Update 10: Remove FK de CondicaoPagamento em clientes (agora campo livre com ID da TabelaPreco)
            `DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_Condicao_de_pagamento_fkey'
                ) THEN
                    ALTER TABLE "clientes" DROP CONSTRAINT "clientes_Condicao_de_pagamento_fkey";
                END IF;
            END $$;`,

            // Update 11: Login Vendedor (App Hardt)
            `ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "login" TEXT;`,
            `ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "senha" TEXT;`,
            `ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "permissoes" JSONB;`,
            `CREATE UNIQUE INDEX IF NOT EXISTS "vendedores_login_key" ON "vendedores"("login");`,

            // Update 12: Sync Data Alteracao Cliente
            `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP(3);`,

            // Update 13: Sincronização Bidirecional de Vendas (Pedidos alterados no CA)
            `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "revisao_pendente" BOOLEAN NOT NULL DEFAULT false;`,
            `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP(3);`,

            // Update 14: Campo situacao_ca (status oficial do CA: APROVADO, FATURADO, EM_ABERTO, CANCELADO)
            // CORRIGIDO: Campo estava no schema.prisma mas nunca foi adicionado ao banco de produção.
            `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "situacao_ca" TEXT;`,

            // Update 15: Sistema de Promoções — Tabela principal de promoções
            `CREATE TABLE IF NOT EXISTS "promocoes" (
                "id" TEXT NOT NULL,
                "produto_id" TEXT NOT NULL,
                "nome" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "preco_promocional" DECIMAL(10,2) NOT NULL,
                "data_inicio" TIMESTAMP(3) NOT NULL,
                "data_fim" TIMESTAMP(3) NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'ATIVA',
                "criado_por" TEXT NOT NULL,
                "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "encerrado_por" TEXT,
                "encerrado_em" TIMESTAMP(3),
                "encerrada_antes_previsto" BOOLEAN,
                CONSTRAINT "promocoes_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "promocoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
            );`,
            `CREATE INDEX IF NOT EXISTS "promocoes_produto_id_idx" ON "promocoes"("produto_id");`,
            `CREATE INDEX IF NOT EXISTS "promocoes_status_idx" ON "promocoes"("status");`,

            // Update 16: Sistema de Promoções — Grupos de condições (lógica OU entre grupos)
            `CREATE TABLE IF NOT EXISTS "promocao_condicao_grupos" (
                "id" TEXT NOT NULL,
                "promocao_id" TEXT NOT NULL,
                CONSTRAINT "promocao_condicao_grupos_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "promocao_condicao_grupos_promocao_id_fkey" FOREIGN KEY ("promocao_id") REFERENCES "promocoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
            );`,
            `CREATE INDEX IF NOT EXISTS "promocao_condicao_grupos_promocao_id_idx" ON "promocao_condicao_grupos"("promocao_id");`,

            // Update 17: Sistema de Promoções — Condições dentro dos grupos (lógica E dentro do grupo)
            `CREATE TABLE IF NOT EXISTS "promocao_condicoes" (
                "id" TEXT NOT NULL,
                "grupo_id" TEXT NOT NULL,
                "tipo" TEXT NOT NULL,
                "produto_id" TEXT,
                "quantidade_minima" DECIMAL(12,3),
                "valor_minimo" DECIMAL(12,2),
                CONSTRAINT "promocao_condicoes_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "promocao_condicoes_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "promocao_condicao_grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE
            );`,
            `CREATE INDEX IF NOT EXISTS "promocao_condicoes_grupo_id_idx" ON "promocao_condicoes"("grupo_id");`,

            // Update 18: Sistema de Promoções — Campos de snapshot de promoção em pedido_itens
            `ALTER TABLE "pedido_itens" ADD COLUMN IF NOT EXISTS "em_promocao" BOOLEAN NOT NULL DEFAULT false;`,
            `ALTER TABLE "pedido_itens" ADD COLUMN IF NOT EXISTS "promocao_id" TEXT;`,
            `ALTER TABLE "pedido_itens" ADD COLUMN IF NOT EXISTS "nome_promocao" TEXT;`,
            `ALTER TABLE "pedido_itens" ADD COLUMN IF NOT EXISTS "tipo_promocao" TEXT;`,

            // Update 19: Adiciona coluna valor_minimo na tabela de preços
            `ALTER TABLE "tabela_precos" ADD COLUMN IF NOT EXISTS "valor_minimo" DECIMAL(12,2) DEFAULT 0;`,

            // Update 20: Adiciona coluna id_conta_financeira ao pedido
            `ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "id_conta_financeira" TEXT;`
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
