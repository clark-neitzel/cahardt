const prisma = require('../config/database');

const iaLogController = {
    listar: async (req, res) => {
        try {
            const {
                dataInicio,
                dataFim,
                clienteId,
                vendedorId,
                disparadoPor,
                usuarioId,
                sucesso,
                busca,
                page = 1,
                limit = 50,
            } = req.query;

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
            const offset = (pageNum - 1) * limitNum;

            // Datas — padrão: hoje
            const agora = new Date();
            const inicioDia = new Date(agora); inicioDia.setHours(0, 0, 0, 0);
            const fimDia = new Date(agora); fimDia.setHours(23, 59, 59, 999);

            const inicio = dataInicio ? new Date(dataInicio + 'T00:00:00') : inicioDia;
            const fim = dataFim ? new Date(dataFim + 'T23:59:59') : fimDia;

            // Montar cláusulas WHERE dinamicamente
            const conditions = [
                `l."criado_em" >= '${inicio.toISOString()}'`,
                `l."criado_em" <= '${fim.toISOString()}'`,
            ];
            if (clienteId) conditions.push(`l."cliente_id" = '${clienteId.replace(/'/g, "''")}'`);
            if (vendedorId) conditions.push(`l."vendedor_id" = '${vendedorId.replace(/'/g, "''")}'`);
            if (disparadoPor) conditions.push(`l."disparado_por" = '${disparadoPor.replace(/'/g, "''")}'`);
            if (usuarioId) conditions.push(`l."disparado_por_usuario_id" = '${usuarioId.replace(/'/g, "''")}'`);
            if (sucesso === 'true') conditions.push(`l."sucesso" = true`);
            if (sucesso === 'false') conditions.push(`l."sucesso" = false`);
            if (busca) {
                const b = busca.replace(/'/g, "''");
                conditions.push(`(c."Nome" ILIKE '%${b}%' OR c."NomeFantasia" ILIKE '%${b}%')`);
            }

            const where = conditions.join(' AND ');

            const dataRows = await prisma.$queryRawUnsafe(`
                SELECT
                    l.id, l."criado_em" as "criadoEm", l."cliente_id" as "clienteId",
                    c."Nome" as "clienteNome", c."NomeFantasia" as "clienteNomeFantasia",
                    l."vendedor_id" as "vendedorId",
                    l."disparado_por" as "disparadoPor",
                    l."disparado_por_usuario_id" as "disparadoPorUsuarioId",
                    l."atendimento_id" as "atendimentoId",
                    l.modelo,
                    l."prompt_enviado" as "promptEnviado",
                    l."dados_entrada" as "dadosEntrada",
                    l."resposta_ia" as "respostaIa",
                    l."tokens_prompt" as "tokensPrompt",
                    l."tokens_resposta" as "tokensResposta",
                    l."tokens_total" as "tokensTotal",
                    l."duracao_ms" as "duracaoMs",
                    l.sucesso,
                    l."erro_msg" as "erroMsg"
                FROM "ia_analise_logs" l
                LEFT JOIN "clientes" c ON c."UUID" = l."cliente_id"
                WHERE ${where}
                ORDER BY l."criado_em" DESC
                LIMIT ${limitNum} OFFSET ${offset}
            `);

            const [countRow] = await prisma.$queryRawUnsafe(`
                SELECT COUNT(*)::int as total
                FROM "ia_analise_logs" l
                LEFT JOIN "clientes" c ON c."UUID" = l."cliente_id"
                WHERE ${where}
            `);

            const [resumo] = await prisma.$queryRawUnsafe(`
                SELECT
                    COUNT(*)::int AS total,
                    SUM(CASE WHEN l.sucesso THEN 1 ELSE 0 END)::int AS sucesso,
                    SUM(CASE WHEN NOT l.sucesso THEN 1 ELSE 0 END)::int AS erro,
                    COALESCE(SUM(l."tokens_total"), 0)::int AS "tokensTotal",
                    ROUND(AVG(CASE WHEN l.sucesso THEN l."duracao_ms" END))::int AS "duracaoMedia"
                FROM "ia_analise_logs" l
                LEFT JOIN "clientes" c ON c."UUID" = l."cliente_id"
                WHERE ${where}
            `);

            // Formatar dados para o frontend
            const data = dataRows.map(row => ({
                id: row.id,
                criadoEm: row.criadoEm,
                clienteId: row.clienteId,
                cliente: { Nome: row.clienteNome, NomeFantasia: row.clienteNomeFantasia },
                vendedorId: row.vendedorId,
                disparadoPor: row.disparadoPor,
                disparadoPorUsuarioId: row.disparadoPorUsuarioId,
                atendimentoId: row.atendimentoId,
                modelo: row.modelo,
                promptEnviado: row.promptEnviado,
                dadosEntrada: row.dadosEntrada,
                respostaIa: row.respostaIa,
                tokensPrompt: row.tokensPrompt,
                tokensResposta: row.tokensResposta,
                tokensTotal: row.tokensTotal,
                duracaoMs: row.duracaoMs,
                sucesso: row.sucesso,
                erroMsg: row.erroMsg,
            }));

            const total = countRow.total;

            res.json({
                data,
                total,
                totalPages: Math.ceil(total / limitNum),
                page: pageNum,
                resumo: {
                    total: resumo.total,
                    sucesso: resumo.sucesso,
                    erro: resumo.erro,
                    tokensTotal: resumo.tokensTotal || 0,
                    duracaoMedia: resumo.duracaoMedia,
                },
            });
        } catch (error) {
            console.error('[iaLogController.listar]', error);
            res.status(500).json({ error: 'Erro ao listar logs de análise da IA.' });
        }
    },
};

module.exports = iaLogController;
