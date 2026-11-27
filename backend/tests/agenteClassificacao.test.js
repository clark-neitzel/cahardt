// Classificação das funções de ESCRITA do agente (config/agenteClassificacao.js) contra o CATÁLOGO REAL de rotas.
// O teste principal FALHA quando alguém cria uma rota de escrita numa família da matriz e não a classifica —
// a mensagem lista as chaves que faltam, para o dev classificar no mesmo PR.
const test = require('node:test');
const assert = require('node:assert/strict');

const { catalogoReal } = require('./helpers/agenteMatrizApp');
const classificacao = require('../config/agenteClassificacao');
const padrao = require('../config/agentePoliticaPadrao');
const modulos = require('../config/agenteModulos');

const ACOES = ['ver', 'criar', 'editar', 'excluir', 'estornar', 'baixar'];

test('toda rota de ESCRITA das famílias da matriz está classificada (ou é bloqueio fixo)', () => {
    const faltam = classificacao.naoClassificadas(catalogoReal());
    assert.deepEqual(faltam, [], `\n\nRota(s) de escrita SEM classificação para o agente:\n  ${faltam.join('\n  ')}\n\n`
        + 'Classifique cada uma em backend/config/agenteClassificacao.js (criar / editar / excluir / estornar / baixar / ver),\n'
        + 'ou, se manda/consulta serviço externo, em BLOQUEIO_CHAVES_MATRIZ (backend/config/agentePoliticaPadrao.js).\n');
});

test('o teste acima PEGA uma rota nova: router.post não classificado aparece na lista', () => {
    const comNova = [...catalogoReal(), { chave: 'POST /api/contas-pagar/:p/rota-nova-sem-classificar', metodo: 'POST', exemplo: '/api/contas-pagar/:p/rota-nova-sem-classificar', familia: '/api/contas-pagar', complexa: false }];
    assert.deepEqual(classificacao.naoClassificadas(comNova), ['POST /api/contas-pagar/:p/rota-nova-sem-classificar']);
    // GET novo não precisa de classificação (herda `ver`); família sem módulo e bloqueio fixo também não entram
    const outras = [...catalogoReal(),
        { chave: 'GET /api/contas-pagar/relatorio-novo', metodo: 'GET', exemplo: '/api/contas-pagar/relatorio-novo', familia: '/api/contas-pagar', complexa: false },
        { chave: 'POST /api/rh/novo', metodo: 'POST', exemplo: '/api/rh/novo', familia: '/api/rh', complexa: false },
        { chave: 'POST /api/modulo-inexistente/x', metodo: 'POST', exemplo: '/api/modulo-inexistente/x', familia: '/api/modulo-inexistente', complexa: false }];
    assert.deepEqual(classificacao.naoClassificadas(outras), []);
});

test('nenhuma chave morta: tudo que está classificado ou bloqueado por chave EXISTE no catálogo real', () => {
    const chaves = new Set(catalogoReal().map((e) => e.chave));
    const mortas = [...Object.keys(classificacao.CLASSIFICACAO), ...Object.keys(padrao.BLOQUEIO_CHAVES_MATRIZ)].filter((k) => !chaves.has(k));
    assert.deepEqual(mortas, [], `chaves que não existem mais no sistema: ${mortas.join(', ')}`);
});

test('classificação: ação válida, GET nunca listado, nada classificado E bloqueado por chave ao mesmo tempo', () => {
    for (const [chave, c] of Object.entries(classificacao.CLASSIFICACAO)) {
        assert.ok(ACOES.includes(c.acao), `${chave}: ação inválida ${c.acao}`);
        assert.ok(!chave.startsWith('GET '), `${chave}: GET não é classificado um a um`);
        assert.ok(!padrao.ehBloqueioFixoPorChave(chave), `${chave}: está classificada e também é bloqueio fixo`);
        const [metodo, caminho] = chave.split(' ');
        assert.ok(!padrao.ehBloqueioFixo(metodo, caminho), `${chave}: é bloqueio fixo por prefixo`);
    }
});

test('os 13 bloqueios fixos por chave são exatamente os da seção 7 do plano', () => {
    assert.deepEqual(Object.keys(padrao.BLOQUEIO_CHAVES_MATRIZ).sort(), [
        'POST /api/conciliacao-bancaria/identificar-debitos-ca', 'POST /api/conciliacao-bancaria/sincronizar-asaas',
        'POST /api/contas-pagar/:p/reenviar-ca', 'POST /api/contas-receber/:p/sync-ca', 'POST /api/contas-receber/sync-ca/todas',
        'POST /api/embarques/estimar-rotas', 'POST /api/embarques/sugerir-divisao', 'POST /api/estoque/sync-produto/:p',
        'POST /api/pedidos/:p/consultar-ca', 'POST /api/pedidos/:p/enviar-whatsapp', 'POST /api/pedidos/imprimir-lote',
        'POST /api/pedidos/imprimir-lote/checar', 'POST /api/pedidos/imprimir-lote/checar-pedido',
    ].sort());
});

test('só-admin (grupo A do plano) e funções que sempre pedem estão marcadas', () => {
    const soAdmin = Object.entries(classificacao.CLASSIFICACAO).filter(([, c]) => c.soAdmin).map(([k]) => k).sort();
    assert.deepEqual(soAdmin, [
        'PATCH /api/categorias-estoque/:p', 'POST /api/caixa/reabrir-pendentes', 'POST /api/contas-receber/admin/sincronizar',
        'POST /api/estoque/produto/:p/recalcular', 'POST /api/pedidos/avisos-pagamento-apos-quitacao/:p/ciente',
        'PUT /api/caixa/conferencia-dinheiro/config', 'PUT /api/indicadores-gestao/config', 'PUT /api/indicadores-gestao/metas',
    ].sort());
    for (const k of ['POST /api/notas-entrada/:p/registrar-entrada', 'POST /api/conciliacao-bancaria/despesas-lote',
        'POST /api/financeiro-gerencial/por-conta/ajuste', 'POST /api/financeiro-gerencial/grupos-dre']) {
        assert.ok(classificacao.CLASSIFICACAO[k].semprePede, `${k} deveria sempre pedir`);
        assert.equal(classificacao.CLASSIFICACAO[k].acao, 'criar');
    }
    assert.equal(classificacao.CLASSIFICACAO['POST /api/clientes/sync'].morta, true);
});

test('módulos × famílias: toda família de leitura do seed tem módulo, e todo módulo aponta para família que existe', () => {
    const semModulo = padrao.FAMILIAS_LEITURA.filter((f) => !modulos.moduloDaFamilia(f));
    assert.deepEqual(semModulo, []);
    const familias = new Set(catalogoReal().map((e) => e.familia));
    for (const m of modulos.MODULOS) for (const f of m.familias) {
        assert.ok(familias.has(f), `módulo ${m.chave}: família ${f} não existe no catálogo`);
        assert.ok(padrao.FAMILIAS_LEITURA.includes(f), `módulo ${m.chave}: família ${f} não está no seed de leitura (afrouxaria o que hoje é bloqueado)`);
    }
    assert.equal(modulos.MODULOS.length, 14);
});

test('separar FIXO_DURO e FORA_DE_ESCOPO não mudou o bloqueio por prefixo (mesma lista, mesma regex)', () => {
    assert.equal(String(padrao.BLOQUEIO_PREFIXOS),
        String(/^\/api\/(agentes|admin|vendedores|migrations|config|notas-fiscais|asaas|whatsapp-clientes|mensagens-agendadas|cobranca|cobrancas-rota|impressao|copiloto|rh|ponto|curriculos|funcionarios|comissoes|ia-uso|ia-logs|visitors|diarios|gps-clientes)/));
    assert.equal(padrao.grupoBloqueioFixo('GET', '/api/rh/folha'), 'FORA_DE_ESCOPO');
    assert.equal(padrao.grupoBloqueioFixo('GET', '/api/vendedores'), 'FIXO_DURO');
    assert.equal(padrao.grupoBloqueioFixo('POST', '/api/notas-entrada/abc/manifestar'), 'FIXO_DURO');
    assert.equal(padrao.grupoBloqueioFixo('GET', '/api/pedidos'), null);
});

test('rota com efeito externo que fica na matriz tem o texto de aviso (17 da seção 7)', () => {
    const comAviso = Object.entries(classificacao.CLASSIFICACAO).filter(([, c]) => c.aviso).map(([k]) => k);
    assert.equal(comAviso.length, 17);
    assert.match(classificacao.avisoDe('POST /api/notas-entrada/:p/gerar-conta'), /SEFAZ/);
    assert.equal(classificacao.avisoDe('PUT /api/contas-pagar/:p'), null);
});
