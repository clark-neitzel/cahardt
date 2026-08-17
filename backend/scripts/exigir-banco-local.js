/**
 * Trava de ambiente para scripts de seed/teste que ESCREVEM no banco.
 *
 * Por que existe: os scripts de fixture criam usuários com senha conhecida, produtos,
 * despesas e movimentações — e o modo `--limpar` APAGA linhas. Rodar isso dentro do
 * container de produção (basta um `node scripts/seed-...`) faria estrago silencioso.
 * Até 08/2026 a única proteção era um comentário no cabeçalho do script.
 *
 * Como usar — PRIMEIRA LINHA executável do script, antes de qualquer consulta:
 *     require('dotenv').config();
 *     require('./exigir-banco-local')('seed dos cenários de correção de despesa');
 *
 * Regra: só passa se a DATABASE_URL apontar para um servidor LOCAL (localhost /
 * 127.0.0.1 / ::1) E para um banco de nome claramente não-produtivo
 * (`hardt_local`, ou terminado em `_local` / `_teste` / `_test`).
 * Falha fechado: sem DATABASE_URL, URL ilegível ou NODE_ENV=production, aborta.
 * Não existe variável de escape — se precisar rodar em outro banco, mude o banco.
 */

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const BANCOS_PERMITIDOS = /^(hardt_local|.+_local|.+_testes?|.+_test)$/i;

function descrever(url) {
    // Nunca imprimir a URL crua (tem senha) — só host/banco.
    try {
        const u = new URL(url);
        return { host: u.hostname, banco: decodeURIComponent(u.pathname || '').replace(/^\//, '') };
    } catch {
        return null;
    }
}

function abortar(rotulo, motivo, detalhe) {
    console.error('\n⛔ ABORTADO — este script só roda no banco LOCAL.');
    console.error(`   Script: ${rotulo}`);
    console.error(`   Motivo: ${motivo}`);
    if (detalhe) console.error(`   ${detalhe}`);
    console.error('   Esperado: DATABASE_URL em localhost/127.0.0.1 e banco "hardt_local"');
    console.error('             (ou nome terminado em _local / _teste / _test).');
    console.error('   Nada foi lido nem escrito no banco.\n');
    process.exit(1);
}

/**
 * @param {string} rotulo  nome do script, só para a mensagem de erro
 */
module.exports = function exigirBancoLocal(rotulo = 'script de seed/teste') {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
        abortar(rotulo, 'NODE_ENV=production.');
    }
    const url = process.env.DATABASE_URL;
    if (!url) abortar(rotulo, 'DATABASE_URL não está definida.');

    const alvo = descrever(url);
    if (!alvo) abortar(rotulo, 'não consegui interpretar a DATABASE_URL.');
    if (!HOSTS_LOCAIS.has(alvo.host)) {
        abortar(rotulo, `o banco NÃO é local (host "${alvo.host}").`, `Banco: "${alvo.banco || '(sem nome)'}"`);
    }
    if (!BANCOS_PERMITIDOS.test(alvo.banco || '')) {
        abortar(rotulo, `o nome do banco não é de desenvolvimento ("${alvo.banco || '(sem nome)'}").`, `Host: "${alvo.host}"`);
    }
    console.log(`🔒 Banco local confirmado: ${alvo.banco} @ ${alvo.host}`);
};
