// Mock mínimo do client Prisma para os testes de webhook/API externa.
//
// Por quê: os testes deste diretório NUNCA podem tocar o banco real (nem o
// hardt_local) — são testes de contrato HTTP (auth + formato do payload), não
// testes de integração de banco. Este helper substitui `backend/config/database.js`
// no require.cache ANTES da rota/service ser exigida, então todo `require('../config/database')`
// (rota, service, ou qualquer coisa por trás) enxerga este objeto fake.
//
// Qualquer chamada a um model/método não stubado explicitamente EXPLODE (throw),
// em vez de devolver undefined silenciosamente — é para o teste avisar alto se
// o código sob teste tocar em algo que a gente esqueceu de mockar.

function naoStubado(model, method) {
    return async (...args) => {
        throw new Error(
            `[mockPrisma] prisma.${model}.${method}() não foi stubado neste teste. ` +
            `Args: ${JSON.stringify(args)}`
        );
    };
}

/**
 * Cria um prisma fake. `overrides` é um objeto { modelName: { metodo: fn, ... } }.
 * Métodos não listados em overrides[model] explodem se chamados.
 */
function makeMockPrisma(overrides = {}) {
    return new Proxy({}, {
        get(_target, model) {
            if (model === 'then') return undefined; // evita await acidental tratar o proxy como thenable
            const modelOverrides = overrides[model] || {};
            return new Proxy({}, {
                get(_t, method) {
                    if (method === 'then') return undefined;
                    if (typeof modelOverrides[method] === 'function') return modelOverrides[method];
                    return naoStubado(String(model), String(method));
                }
            });
        }
    });
}

/** Substitui um módulo no require.cache pelo `fakeExports` e devolve uma função de restauração. */
function stubModule(absolutePath, fakeExports) {
    const resolved = require.resolve(absolutePath);
    const anterior = require.cache[resolved];
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: fakeExports };
    return () => {
        if (anterior) require.cache[resolved] = anterior;
        else delete require.cache[resolved];
    };
}

/** Remove do cache todo módulo cujo caminho contenha um dos fragmentos dados — força re-require "fresco". */
function limparCacheContendo(...fragmentos) {
    for (const key of Object.keys(require.cache)) {
        if (fragmentos.some(f => key.includes(f))) delete require.cache[key];
    }
}

module.exports = { makeMockPrisma, stubModule, limparCacheContendo };
