// Funções PURAS do service de local de entrega (sem banco) + carregador em lote com o prisma simulado.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../config/database');
const svc = require('../services/localEntregaService');
const { resolverLocalEntrega } = require('../utils/enderecoEntrega');

const { validarEndereco, prepararGravacaoCliente, prepararGravacaoPedido } = svc;
const status = (fn) => { try { fn(); return null; } catch (e) { return e.status || 'sem-status'; } };

test('validarEndereco: CEP vira 12345-678; CEP curto -> 400', () => {
    assert.equal(validarEndereco({ cep: '89203000' }).cep, '89203-000');
    assert.equal(validarEndereco({ cep: '89203-000' }).cep, '89203-000');
    assert.equal(status(() => validarEndereco({ cep: '123' })), 400);
    assert.equal(validarEndereco({ cep: '' }).cep, null);
});

test('validarEndereco: UF em maiúsculas, 2 letras', () => {
    assert.equal(validarEndereco({ estado: 'sc' }).estado, 'SC');
    assert.equal(status(() => validarEndereco({ estado: 'Santa Catarina' })), 400);
    assert.equal(status(() => validarEndereco({ estado: 'S1' })), 400);
});

test('validarEndereco: limites de tamanho e tipos', () => {
    assert.equal(status(() => validarEndereco({ logradouro: 'x'.repeat(201) })), 400);
    assert.equal(validarEndereco({ logradouro: 'x'.repeat(200) }).logradouro.length, 200);
    assert.equal(status(() => validarEndereco({ referencia: 'x'.repeat(501) })), 400);
    assert.equal(status(() => validarEndereco({ logradouro: { a: 1 } })), 400);
    assert.equal(status(() => validarEndereco([])), 400);
    assert.equal(status(() => validarEndereco(null)), 400);
});

test('validarEndereco: strings aparadas; vazio vira null; ausente fica undefined', () => {
    const e = validarEndereco({ logradouro: '  Rua X  ', numero: '   ' });
    assert.equal(e.logradouro, 'Rua X');
    assert.equal(e.numero, null);
    assert.equal(e.bairro, undefined);
    assert.equal(e.pontoGps, undefined);
});

test('validarEndereco: ponto GPS válido/ inválido / fora de faixa', () => {
    assert.equal(validarEndereco({ pontoGps: ' -26.3, -48.8 ' }).pontoGps, '-26.3,-48.8');
    assert.equal(validarEndereco({ pontoGps: null }).pontoGps, null);
    assert.equal(validarEndereco({ pontoGps: '' }).pontoGps, null);
    assert.equal(status(() => validarEndereco({ pontoGps: '99,500' })), 400);
    assert.equal(status(() => validarEndereco({ pontoGps: 'abc' })), 400);
});

test('validarEndereco: caractere nulo (\\u0000) em qualquer campo -> 400', () => {
    for (const c of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep', 'referencia']) {
        assert.equal(status(() => validarEndereco({ [c]: 'a\u0000b' })), 400, c);
    }
    assert.equal(status(() => validarEndereco({ pontoGps: '1,2\u0000' })), 400);
    assert.equal(status(() => prepararGravacaoPedido('AVULSO', { logradouro: 'a\u0000' })), 400);
});

test('validarEndereco: exigirConteudo (avulso) recusa só referência', () => {
    assert.equal(status(() => validarEndereco({ referencia: 'portão azul' }, { exigirConteudo: true })), 400);
    assert.equal(status(() => validarEndereco({ pontoGps: '-26.3,-48.8' }, { exigirConteudo: true })), null);
});

// ── regras de gravação do cliente (função pura) ──
const existente = {
    ativo: true, logradouro: 'Rua Dona Francisca', numero: '500', complemento: null, bairro: 'Atiradores',
    cidade: 'Joinville', estado: 'SC', cep: '89203-000', referencia: null, pontoGps: '-26.3,-48.8', selo: 'CONFIRMADO', sugestao: null, seloEm: null,
};

test('gravação do cliente: criação exige conteúdo; tipo CRIACAO; sem ponto = pontoPendente', () => {
    assert.equal(status(() => prepararGravacaoCliente(null, validarEndereco({ referencia: 'só ref' }))), 400);
    const r = prepararGravacaoCliente(null, validarEndereco({ logradouro: 'Rua A' }));
    assert.equal(r.tipo, 'CRIACAO');
    assert.equal(r.pontoPendente, true);
    assert.equal(r.dados.ativo, true);
    assert.equal(r.dados.pontoGps, null);
});

test('gravação do cliente: PUT só com referência num local existente funciona (conteúdo vem do mesclado) e mantém o ponto', () => {
    const r = prepararGravacaoCliente(existente, validarEndereco({ referencia: 'portão azul' }));
    assert.deepEqual(r.campos, ['referencia']);
    assert.equal(r.dados.pontoGps, '-26.3,-48.8');
    assert.equal(r.pontoPendente, false);
    assert.equal(r.tipo, 'ALTERACAO');
    assert.equal(r.dados.selo, undefined); // voto do ponto preservado
});

test('gravação do cliente: só complemento também funciona', () => {
    const r = prepararGravacaoCliente(existente, validarEndereco({ complemento: 'Sala 3' }));
    assert.deepEqual(r.campos, ['complemento']);
    assert.equal(r.dados.pontoGps, '-26.3,-48.8');
});

test('gravação do cliente: texto mudou sem ponto novo APAGA o ponto e zera o voto', () => {
    const r = prepararGravacaoCliente(existente, validarEndereco({ numero: '510' }));
    assert.deepEqual(r.campos.sort(), ['numero', 'pontoGps']);
    assert.equal(r.dados.pontoGps, null);
    assert.equal(r.pontoPendente, true);
    assert.equal(r.dados.selo, null);
});

test('gravação do cliente: texto mudou COM ponto novo guarda o ponto novo', () => {
    const r = prepararGravacaoCliente(existente, validarEndereco({ numero: '510', pontoGps: '-26.31,-48.81' }));
    assert.equal(r.dados.pontoGps, '-26.31,-48.81');
    assert.equal(r.pontoPendente, false);
});

test('gravação do cliente: reenvio idêntico = nenhum campo alterado', () => {
    const r = prepararGravacaoCliente(existente, validarEndereco({ logradouro: 'Rua Dona Francisca', numero: '500', cep: '89203000', estado: 'sc' }));
    assert.deepEqual(r.campos, []);
});

test('gravação do cliente: reativar local desativado = tipo REATIVACAO com campo ativo', () => {
    const r = prepararGravacaoCliente({ ...existente, ativo: false }, validarEndereco({ logradouro: 'Rua Dona Francisca' }));
    assert.equal(r.tipo, 'REATIVACAO');
    assert.deepEqual(r.campos, ['ativo']);
});

test('gravação do cliente: apagar todo o conteúdo do mesclado -> 400', () => {
    const e = validarEndereco({ logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null, pontoGps: null });
    assert.equal(status(() => prepararGravacaoCliente(existente, e)), 400);
});

test('gravação do pedido: modo em minúsculas aceito e normalizado; CADASTRO limpa o endereço; modo inválido -> 400', () => {
    assert.equal(prepararGravacaoPedido('avulso', { logradouro: 'Rua Y' }).modo, 'AVULSO');
    const c = prepararGravacaoPedido('cadastro', { logradouro: 'ignorado' });
    assert.equal(c.modo, 'CADASTRO');
    assert.equal(c.logradouro, null);
    assert.equal(status(() => prepararGravacaoPedido('xpto', {})), 400);
    assert.equal(status(() => prepararGravacaoPedido('AVULSO', {})), 400);
});

test('resolverLocalEntrega: modo do pedido em minúsculas também vale', () => {
    const cliente = { End_Logradouro: 'Rua A', End_Numero: '1', Ponto_GPS: '1,2' };
    assert.equal(resolverLocalEntrega({ cliente, pedidoLocal: { modo: 'avulso', logradouro: 'Rua Y' } }).origem, 'PEDIDO');
    assert.equal(resolverLocalEntrega({ cliente, clienteLocal: { ativo: true, logradouro: 'Rua L' }, pedidoLocal: { modo: 'cadastro' } }).origem, 'CADASTRO');
});

// ── anexarLocalEntrega com o prisma simulado ──
test('anexarLocalEntrega: só anexa quando a origem é diferente de CADASTRO', async () => {
    const orig = {
        a: prisma.pedidoLocalEntrega.findMany, b: prisma.clienteLocalEntrega.findMany,
    };
    prisma.pedidoLocalEntrega.findMany = async () => [{ pedidoId: 'p2', modo: 'AVULSO', logradouro: 'Rua Y', numero: '9', pontoGps: null }];
    prisma.clienteLocalEntrega.findMany = async () => [{ clienteUuid: 'c3', ativo: true, logradouro: 'Rua L', cidade: 'Joinville', pontoGps: '-26.3,-48.8' }];
    try {
        const cli = (id) => ({ UUID: id, End_Logradouro: 'Rua A', End_Numero: '1', End_Cidade: 'Jaraguá', Ponto_GPS: '1,2' });
        const pedidos = [
            { id: 'p1', clienteId: 'c1', cliente: cli('c1'), kitFestaPedido: null },                 // sem nada -> CADASTRO
            { id: 'p2', clienteId: 'c2', cliente: cli('c2'), kitFestaPedido: null },                 // avulso -> PEDIDO
            { id: 'p3', clienteId: 'c3', cliente: cli('c3'), kitFestaPedido: null },                 // local do cliente -> LOCAL_CLIENTE
            { id: 'p4', clienteId: 'c4', cliente: cli('c4'), kitFestaPedido: { modo: 'retirada' } }, // retirada
        ];
        const r = await svc.anexarLocalEntrega(pedidos);
        assert.equal(r, pedidos); // muta e devolve o mesmo array
        assert.equal('localEntrega' in pedidos[0], false);
        assert.equal(pedidos[1].localEntrega.origem, 'PEDIDO');
        assert.equal(pedidos[1].localEntrega.ponto, null);
        assert.equal(pedidos[2].localEntrega.origem, 'LOCAL_CLIENTE');
        assert.equal(pedidos[2].localEntrega.ponto, '-26.3,-48.8');
        assert.equal(pedidos[3].localEntrega.origem, 'RETIRADA');
        assert.deepEqual(await svc.anexarLocalEntrega([]), []);
    } finally {
        prisma.pedidoLocalEntrega.findMany = orig.a;
        prisma.clienteLocalEntrega.findMany = orig.b;
    }
});

// ── config: falha de leitura NÃO regrava as outras flags ──
test('gravarConfig: se a leitura do estado atual falhar, propaga o erro e não grava nada', async () => {
    const orig = { f: prisma.appConfig.findUnique, u: prisma.appConfig.upsert };
    let upserts = 0;
    prisma.appConfig.findUnique = async () => { throw new Error('banco fora'); };
    prisma.appConfig.upsert = async () => { upserts++; return {}; };
    try {
        await assert.rejects(() => svc.gravarConfig({ editor: true }, { id: 'u1', nome: 'Admin' }), /banco fora/);
        assert.equal(upserts, 0);
        // consumidores falham FECHADO: tudo desligado
        const cfg = await svc.lerConfig();
        assert.deepEqual(cfg, { editor: false, exibir: false, operacao: false, mapa: false });
    } finally {
        prisma.appConfig.findUnique = orig.f;
        prisma.appConfig.upsert = orig.u;
    }
});

test('gravarConfig: só aceita boolean estrito e ignora chaves desconhecidas', async () => {
    const orig = { f: prisma.appConfig.findUnique, u: prisma.appConfig.upsert };
    let gravado = null;
    prisma.appConfig.findUnique = async () => ({ value: { editor: false, exibir: true } });
    prisma.appConfig.upsert = async ({ update }) => { gravado = update.value; return {}; };
    try {
        await assert.rejects(() => svc.gravarConfig({ editor: 'sim' }), (e) => e.status === 400);
        const r = await svc.gravarConfig({ mapa: true, foo: true }, { id: 'u1', nome: 'Admin' });
        assert.deepEqual(r, { editor: false, exibir: true, operacao: false, mapa: true });
        assert.deepEqual(gravado, r);
    } finally {
        prisma.appConfig.findUnique = orig.f;
        prisma.appConfig.upsert = orig.u;
    }
});
