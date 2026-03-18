const prisma = require('../config/database');

const migrationController = {
    // Aplicar migration de NCM
    applyNcmMigration: async (req, res) => {
        try {
            console.log('🔧 Aplicando migration: Adicionar coluna NCM...');

            // Adicionar coluna NCM
            await prisma.$executeRawUnsafe(`
                ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;
            `);

            console.log('✅ Coluna NCM adicionada com sucesso!');

            // Verificar se a coluna foi criada
            const result = await prisma.$queryRawUnsafe(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'produtos' AND column_name = 'ncm';
            `);

            res.json({
                success: true,
                message: 'Coluna NCM adicionada com sucesso!',
                verification: result
            });

        } catch (error) {
            console.error('❌ Erro ao aplicar migration:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Aplicar migration de Contas a Receber
    applyContasReceberMigration: async (req, res) => {
        try {
            console.log('🔧 Aplicando migration: Criar tabelas de Contas a Receber...');

            // Criar tabela contas_receber
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "contas_receber" (
                    "id" UUID NOT NULL,
                    "pedido_id" UUID UNIQUE,
                    "cliente_id" VARCHAR(255) NOT NULL,
                    "origem" VARCHAR(50) NOT NULL DEFAULT 'ESPECIAL',
                    "valor_total" DECIMAL(12, 2) NOT NULL,
                    "status" VARCHAR(50) NOT NULL DEFAULT 'ABERTO',
                    "observacao" TEXT,
                    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id"),
                    CONSTRAINT "contas_receber_pedido_id_key" UNIQUE ("pedido_id"),
                    CONSTRAINT "contas_receber_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE RESTRICT,
                    CONSTRAINT "contas_receber_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL
                );
            `);

            // Criar índices para contas_receber
            await prisma.$executeRawUnsafe(`
                CREATE INDEX IF NOT EXISTS "contas_receber_cliente_id_idx" ON "contas_receber"("cliente_id");
            `);
            await prisma.$executeRawUnsafe(`
                CREATE INDEX IF NOT EXISTS "contas_receber_status_idx" ON "contas_receber"("status");
            `);

            // Criar tabela parcelas
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "parcelas" (
                    "id" UUID NOT NULL,
                    "conta_receber_id" UUID NOT NULL,
                    "numero_parcela" INTEGER NOT NULL,
                    "valor" DECIMAL(12, 2) NOT NULL,
                    "data_vencimento" TIMESTAMP(3) NOT NULL,
                    "data_pagamento" TIMESTAMP(3),
                    "valor_pago" DECIMAL(12, 2),
                    "forma_pagamento" VARCHAR(50),
                    "baixado_por_id" VARCHAR(255),
                    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
                    "observacao" TEXT,
                    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id"),
                    CONSTRAINT "parcelas_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE CASCADE,
                    CONSTRAINT "parcelas_baixado_por_id_fkey" FOREIGN KEY ("baixado_por_id") REFERENCES "vendedores"("id") ON DELETE SET NULL
                );
            `);

            // Criar índices para parcelas
            await prisma.$executeRawUnsafe(`
                CREATE INDEX IF NOT EXISTS "parcelas_conta_receber_id_idx" ON "parcelas"("conta_receber_id");
            `);
            await prisma.$executeRawUnsafe(`
                CREATE INDEX IF NOT EXISTS "parcelas_data_vencimento_idx" ON "parcelas"("data_vencimento");
            `);
            await prisma.$executeRawUnsafe(`
                CREATE INDEX IF NOT EXISTS "parcelas_status_idx" ON "parcelas"("status");
            `);

            console.log('✅ Tabelas de Contas a Receber criadas com sucesso!');

            res.json({
                success: true,
                message: 'Tabelas de Contas a Receber criadas com sucesso!'
            });

        } catch (error) {
            console.error('❌ Erro ao aplicar migration:', error);
            res.status(500).json({ error: error.message });
        }
    },

    // Sincronizar ContsReceber com pedidos existentes
    syncContasReceber: async (req, res) => {
        try {
            console.log('🔄 Iniciando sincronização de Contas a Receber...');

            // Buscar todos os pedidos que NÃO têm conta a receber
            // Inclui: RECEBIDO, FATURADO, SINCRONIZANDO, etc - qualquer que tenha sido "processado"
            const pedidosSemConta = await prisma.pedido.findMany({
                where: {
                    statusEnvio: { not: 'ABERTO' }, // Exclude apenas pedidos ainda em ABERTO (não finalizados)
                    contaReceber: null
                },
                include: {
                    itens: true,
                    cliente: { select: { Nome: true, NomeFantasia: true } }
                }
            });

            console.log(`📊 Encontrados ${pedidosSemConta.length} pedidos sem contas a receber`);

            let criadas = 0;
            const resultados = [];
            for (const pedido of pedidosSemConta) {
                try {
                    // Calcular valor total do pedido
                    const valorTotal = pedido.itens.reduce((sum, item) => {
                        return sum + (Number(item.valor) * Number(item.quantidade));
                    }, 0);

                    // Calcular parcelas
                    const numParcelas = pedido.qtdParcelas || 1;
                    const intervalo = pedido.intervaloDias || 0;
                    const baseDate = pedido.primeiroVencimento || pedido.dataVenda;
                    const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

                    const parcelasData = [];
                    for (let i = 0; i < numParcelas; i++) {
                        const vencimento = new Date(baseDate);
                        vencimento.setDate(vencimento.getDate() + (i * intervalo));
                        const val = i === numParcelas - 1
                            ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
                            : valorParcela;
                        parcelasData.push({
                            numeroParcela: i + 1,
                            valor: val,
                            dataVencimento: vencimento
                        });
                    }

                    // Criar conta a receber
                    await prisma.contaReceber.create({
                        data: {
                            pedidoId: pedido.id,
                            clienteId: pedido.clienteId,
                            origem: pedido.especial ? 'ESPECIAL' : 'FATURADO_CA',
                            valorTotal: Math.round(valorTotal * 100) / 100,
                            status: 'ABERTO',
                            parcelas: { create: parcelasData }
                        }
                    });

                    criadas++;
                    const msg = `✅ Pedido ${pedido.numero} (${pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}) - R$ ${(valorTotal).toFixed(2)} - ${numParcelas} parcela(s)`;
                    console.log(msg);
                    resultados.push({ success: true, numero: pedido.numero, valor: valorTotal, parcelas: numParcelas });
                } catch (err) {
                    const msg = `❌ Erro ao processar pedido ${pedido.numero}: ${err.message}`;
                    console.error(msg);
                    resultados.push({ success: false, numero: pedido.numero, erro: err.message });
                }
            }

            console.log(`\n✨ Sincronização concluída: ${criadas}/${pedidosSemConta.length} contas criadas`);

            res.json({
                success: true,
                message: `Sincronização concluída: ${criadas} contas criadas de ${pedidosSemConta.length} pedidos`,
                criadas,
                total: pedidosSemConta.length,
                resultados
            });
        } catch (error) {
            console.error('❌ Erro ao sincronizar contas a receber:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = migrationController;
