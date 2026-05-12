#!/usr/bin/env node
/**
 * Importa um backup JSON (gerado por GET /api/admin-exec/export-full-db)
 * para o banco local, substituindo todos os dados existentes.
 *
 * Uso: node scripts/import-from-backup.js <arquivo.json>
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

// Ordem garante integridade referencial no INSERT (deps primeiro).
// O TRUNCATE desabilita FKs via session_replication_role, mas a ordem
// ainda importa para evitar erros de NOT NULL em colunas de FK na inserção.
const TABLE_ORDER = [
    'categorias_produto', 'categorias_estoque', 'categorias_cliente',
    'condicoes_pagamento', 'tabela_precos', 'contas_financeiras',
    'formas_pagamento_entrega', 'delivery_categorias',
    'app_configs', 'conta_azul_config',
    'vendedores', 'veiculos',
    'produtos', 'produto_imagens',
    'clientes', 'cliente_arquivos',
    'leads', 'embarques',
    'amostras', 'amostra_itens',
    'pedidos', 'pedido_itens', 'pedido_pagamentos_reais',
    'entrega_itens_devolvidos', 'movimentacoes_estoque',
    'atendimentos',
    'devolucoes', 'devolucao_itens',
    'diario_vendedor', 'despesas',
    'caixa_diario', 'caixa_entrega_conferida',
    'contas_receber', 'parcelas',
    'promocoes', 'promocao_condicao_grupos', 'promocao_condicoes',
    'cliente_insights', 'ia_analise_logs',
    'roteirizacoes',
    'meta_mensal_vendedor', 'meta_cidades', 'meta_produtos', 'meta_promocoes',
    'delivery_status', 'delivery_permissoes', 'delivery_webhook_logs',
    'audit_logs', 'manutencao_alertas',
    'itens_pcp', 'receitas', 'receita_itens', 'receita_versao_log',
    'ordens_producao', 'ordens_consumo', 'agenda_producao',
    'movimentacoes_pcp', 'sugestoes_producao',
    'sync_logs',
];

// Tabelas com colunas SERIAL que precisam ter as sequences resetadas após import.
const SEQUENCES = [
    { table: 'leads',             col: 'numero' },
    { table: 'embarques',         col: 'numero' },
    { table: 'amostras',          col: 'numero' },
    { table: 'devolucoes',        col: 'numero' },
    { table: 'ia_analise_logs',   col: 'id' },
    { table: 'ordens_producao',   col: 'numero' },
];

function escapeVal(v, colType) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) {
        if (colType === 'ARRAY') {
            // Coluna text[], int[], etc. — formato literal PostgreSQL
            if (v.length === 0) return "'{}'";
            const items = v.map(item => {
                if (item === null) return 'NULL';
                const s = typeof item === 'object' ? JSON.stringify(item) : String(item);
                return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
            });
            return "'" + '{' + items.join(',') + '}' + "'";
        }
        // jsonb ou outro — formato JSON
        return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
    }
    if (typeof v === 'object') {
        return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
    }
    // coluna jsonb com valor string precisa de JSON encoding (com aspas dentro do literal)
    if (colType === 'jsonb') {
        return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
    }
    return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
    const backupFile = process.argv[2];
    if (!backupFile) {
        console.error('Uso: node import-from-backup.js <backup.json>');
        process.exit(1);
    }
    if (!fs.existsSync(backupFile)) {
        console.error(`Arquivo não encontrado: ${backupFile}`);
        process.exit(1);
    }

    console.log(`Lendo backup: ${backupFile}`);
    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    console.log(`Exportado em: ${backup._exportedAt}`);

    const tablesPresentes = TABLE_ORDER.filter(t => Array.isArray(backup[t]));
    const totalRows = tablesPresentes.reduce((s, t) => s + backup[t].length, 0);
    console.log(`Tabelas: ${tablesPresentes.length} | Linhas totais: ${totalRows}\n`);

    // Pré-carrega colunas reais (nome + tipo) para lidar com schema drift e formatar arrays corretamente
    const tableColumns = {};
    for (const table of tablesPresentes) {
        const result = await prisma.$queryRawUnsafe(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
            table
        );
        tableColumns[table] = {
            names: new Set(result.map(r => r.column_name)),
            types: Object.fromEntries(result.map(r => [r.column_name, r.data_type])),
        };
    }

    // Usa interactive transaction para que SET LOCAL se aplique a todas as queries
    await prisma.$transaction(async (tx) => {
        // Desabilita FK constraints e triggers na sessão atual
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

        // Trunca todas as tabelas de uma vez (mais rápido, sem respeitar FKs)
        const toTruncate = [...tablesPresentes].reverse().join('", "');
        await tx.$executeRawUnsafe(`TRUNCATE TABLE "${toTruncate}" RESTART IDENTITY CASCADE`);
        console.log('Tabelas limpas.\n');

        // Insere em ordem de dependência
        for (const table of tablesPresentes) {
            const rows = backup[table];
            if (!rows.length) {
                console.log(`  [${table}] vazio`);
                continue;
            }

            const allCols = Object.keys(rows[0]);
            const { names: colNames, types: colTypes } = tableColumns[table];
            const cols = allCols.filter(c => colNames.has(c));
            if (cols.length < allCols.length) {
                const skipped = allCols.filter(c => !colNames.has(c));
                console.warn(`  [${table}] colunas ignoradas (schema drift): ${skipped.join(', ')}`);
            }
            const colList = cols.map(c => `"${c}"`).join(', ');
            let ok = 0;
            let err = 0;

            for (const row of rows) {
                const vals = cols.map(c => escapeVal(row[c], colTypes[c])).join(', ');
                try {
                    await tx.$executeRawUnsafe(`SAVEPOINT sp_row`);
                    await tx.$executeRawUnsafe(
                        `INSERT INTO "${table}" (${colList}) VALUES (${vals})`
                    );
                    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT sp_row`);
                    ok++;
                } catch (e) {
                    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_row`);
                    err++;
                    if (err <= 2) console.warn(`    ⚠ ${table}: ${e.message.slice(0, 120)}`);
                }
            }
            console.log(`  [${table}] ${ok} inseridos${err ? ` | ${err} erros` : ''}`);
        }

        // Reabilita FKs
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'origin'`);

    }, { timeout: 600_000 }); // 10 min

    // Reseta sequences FORA da transaction (DDL implica commit em alguns drivers)
    console.log('\nResetando sequences...');
    for (const { table, col } of SEQUENCES) {
        if (!backup[table]?.length) continue;
        try {
            await prisma.$executeRawUnsafe(
                `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'),
                 COALESCE((SELECT MAX("${col}") FROM "${table}"), 1))`
            );
            console.log(`  ✓ ${table}.${col}`);
        } catch (e) {
            console.warn(`  ⚠ sequence ${table}.${col}: ${e.message}`);
        }
    }

    console.log('\n✓ Importação concluída!');
}

main()
    .catch((e) => {
        console.error('\n✗ Erro fatal:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
