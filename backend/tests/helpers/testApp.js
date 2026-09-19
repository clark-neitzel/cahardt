// Monta um Express mínimo (só express.json() + a rota sob teste), com o Prisma
// trocado por um mock ANTES da rota (e dos services por trás dela) serem exigidos.
// Não importa backend/index.js inteiro de propósito: index.js sobe schedulers,
// roda migrationService e conecta um PrismaClient real ao DATABASE_URL do
// ambiente — pesado, com efeito colateral, e exatamente o que a diretriz do
// dono pede para NUNCA acontecer num teste automatizado.
const path = require('path');
const express = require('express');
const { stubModule, limparCacheContendo } = require('./mockPrisma');

const DATABASE_MODULE = path.join(__dirname, '../../config/database.js');

/**
 * @param {string} mountPath - ex.: '/api/asaas'
 * @param {string} routerAbsPath - caminho absoluto do arquivo da rota (path.join(__dirname, '../../routes/asaasRoutes.js'))
 * @param {object} mockPrisma - instância criada por makeMockPrisma()
 * @param {string[]} [cacheFragmentsToReset] - fragmentos extra de caminho a limpar do require.cache
 *   antes de re-requerer a rota (services que a rota usa e que capturam `prisma` no top-level).
 *
 * IMPORTANTE — só recebe o mock "fresco" quem está na lista: o router (sempre) e
 * qualquer módulo cujo caminho bata com um fragmento de `cacheFragmentsToReset`.
 * Qualquer outro módulo que a rota exija por baixo dos panos e que já tenha sido
 * carregado numa chamada ANTERIOR de montarApp() (nesta mesma suite/processo)
 * continua com a referência antiga do `require.cache` — inclusive se esse módulo
 * também captura `prisma` no topo do arquivo. Exemplo real: `middlewares/authMiddleware.js`
 * é exigido por várias rotas; na 1ª vez que qualquer teste monta um app que passa por
 * ele, ele entra no cache e fica lá. Se você for testar uma rota AUTENTICADA (que
 * depende do authMiddleware consultar o Prisma, ex. buscar o usuário do token),
 * adicione o caminho dele a `cacheFragmentsToReset` — senão o middleware vai
 * enxergar o mockPrisma de um teste anterior (ou nenhum), não o deste teste.
 */
function buildApp(mountPath, routerAbsPath, mockPrisma, cacheFragmentsToReset = []) {
    const restaurar = stubModule(DATABASE_MODULE, mockPrisma);
    // Remove do cache a rota + os arquivos indicados, para que capturem o prisma mockado
    // (eles fazem `const prisma = require('../config/database')` uma vez, no topo do arquivo).
    limparCacheContendo(routerAbsPath, ...cacheFragmentsToReset);

    const router = require(routerAbsPath);

    const app = express();
    app.use(express.json());
    app.use(mountPath, router);
    // Handler de erro simples — replica o comportamento real (não deixa erro não tratado
    // derrubar o processo, e o teste consegue ver o status ao invés de um crash do node:test).
    app.use((err, req, res, _next) => {
        console.error('[testApp] erro não tratado na rota sob teste:', err);
        res.status(500).json({ error: 'Erro interno (teste).' });
    });

    restaurar(); // o cache do módulo da rota já capturou o mock; não precisa manter o stub global

    return app;
}

module.exports = { buildApp };
