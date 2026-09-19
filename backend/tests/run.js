// Runner da suite: lista os arquivos *.test.js (recursivo) e chama `node --test`
// passando os caminhos como argumentos explícitos.
//
// Por quê não usar glob direto no `npm test` (`node --test "tests/**/*.test.js"`):
// o glob POSITIONAL do `node --test` só é suportado a partir do Node 22 — no
// Node 20 (a versão da imagem de produção, node:20-alpine, ver backend/Dockerfile)
// o padrão entre aspas chega ao Node como uma string literal, não bate nenhum
// arquivo, e a suite roda "com sucesso" sem testar nada (0 testes = falso positivo
// pior que travar). Passar aqui os caminhos já resolvidos por `fs` funciona em
// qualquer versão do Node, porque não depende de expansão de glob nem do shell.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TESTS_DIR = __dirname;

function listarArquivosDeTeste(dir) {
    const resultado = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const caminho = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
            if (entrada.name === 'helpers') continue; // não são testes, só suporte
            resultado.push(...listarArquivosDeTeste(caminho));
        } else if (entrada.isFile() && entrada.name.endsWith('.test.js')) {
            resultado.push(caminho);
        }
    }
    return resultado;
}

const arquivos = listarArquivosDeTeste(TESTS_DIR);

if (arquivos.length === 0) {
    console.error('[tests/run.js] Nenhum arquivo *.test.js encontrado em', TESTS_DIR);
    process.exit(1);
}

console.log(`[tests/run.js] Rodando ${arquivos.length} arquivo(s) de teste:`);
arquivos.forEach(f => console.log('  -', path.relative(process.cwd(), f)));

const resultado = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', ...arquivos],
    { stdio: 'inherit' }
);

process.exit(resultado.status ?? 1);
