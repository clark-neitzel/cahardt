// Contatos do cliente: chave de telefone, regra de gravar, e a API /api/analytics/v1.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
process.env.ANALYTICS_API_KEY = process.env.ANALYTICS_API_KEY || 'chave-teste-analytics-agentes';

const { chaveTelefone } = require('../utils/telefoneChave');
const regras = require('../services/clienteContatoRegras');
const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const CHAVE = process.env.ANALYTICS_API_KEY;
const AGENTE = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'ana' };
const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js',
    'services/clienteContatoService.js',
    'services/analyticsConsultaService.js',
    'services/analyticsRegistroService.js',
    'services/analyticsComum.js',
    'middlewares/analyticsAuth.js',
];

test('chave de telefone ignora 55, máscara e o 9º dígito', () => {
    const base = chaveTelefone('47999998888');
    assert.equal(base, '4799998888');
    assert.equal(chaveTelefone('+55 (47) 99999-8888'), base);
    assert.equal(chaveTelefone('5547999998888'), base);
    assert.equal(chaveTelefone('4799998888'), base);
    assert.equal(regras.telefoneUtil('123'), null);
    assert.equal(regras.telefoneUtil('4733334444').chave, '4733334444');
    assert.equal(regras.telefoneUtil('554733334444').chave, '4733334444');
});

test('migração junta o mesmo número e prefere o celular com o 9', () => {
    const tels = regras.telefonesDoCadastro({
        Telefone: '4733334444',
        Telefone_Celular: '47999998888',
        Telefone_Comercial: '47 9999-8888',
        numeros: ['5547999998888'],
    });
    assert.equal(tels.length, 2);
    const cel = tels.find((t) => t.chave === chaveTelefone('47999998888'));
    assert.equal(cel.telefone, '47999998888');
});

test('primeiro nome preenche quem estava sem nome; outro nome cria outra pessoa', () => {
    const entrada = (nome) => regras.lerEntrada(
        nome ? { nome, telefone: '47999998888', papel: 'dona' } : { telefone: '47999998888' },
        { telefoneObrigatorio: true },
    );
    const sem = { id: '1', nome: null, createdAt: '2026-01-01' };
    const aprendeu = regras.decidirGravacao([sem], entrada('Maria'));
    assert.equal(aprendeu.acao, 'atualizar');
    assert.equal(aprendeu.id, '1');
    assert.equal(aprendeu.aprendeuNome, true);
    assert.equal(aprendeu.dados.nome, 'Maria');
    assert.equal(aprendeu.dados.nomeChave, 'maria');

    const maria = { id: '1', nome: 'Maria', createdAt: '2026-01-01' };
    const deNovo = regras.decidirGravacao([maria], entrada('máRia'));
    assert.equal(deNovo.acao, 'atualizar');
    assert.equal(deNovo.aprendeuNome, false);

    const joao = regras.decidirGravacao([maria], entrada('João'));
    assert.equal(joao.acao, 'criar');
    assert.equal(joao.dados.nome, 'João');

    assert.throws(
        () => regras.decidirGravacao([maria], entrada(null)),
        (e) => e.codigo === 'INFORME_O_NOME',
    );
});

test('falarCom é a última pessoa com nome e conversa registrada', () => {
    const f = regras.escolherFalarCom([
        { nome: 'Maria', ultimoContatoEm: '2026-11-01T12:00:00.000Z' },
        { nome: 'João', ultimoContatoEm: '2026-11-10T12:00:00.000Z' },
        { nome: null, ultimoContatoEm: '2026-11-12T12:00:00.000Z' },
    ]);
    assert.equal(f.nome, 'João');
    assert.equal(regras.escolherFalarCom([{ nome: 'Maria', ultimoContatoEm: null }]), null);
});

function memoria() {
    const clientes = [{
        UUID: 'cli-1',
        Nome: 'Padaria do Zé Ltda',
        NomeFantasia: 'Padaria do Zé',
        Ativo: true,
        End_Cidade: 'Blumenau',
        End_Estado: 'SC',
        Telefone: null,
        Telefone_Celular: '47911112222',
        Telefone_Comercial: null,
        whatsapp: null,
    }];
    const contatos = [];
    const audits = [];
    const combina = (row, where) => {
        if (!where) return true;
        if (where.clienteUuid && row.clienteUuid !== where.clienteUuid) return false;
        if (where.telefoneChave && row.telefoneChave !== where.telefoneChave) return false;
        if (where.id && row.id !== where.id) return false;
        return true;
    };
    const anexar = (row, include) => {
        if (!include?.cliente) return { ...row };
        const cli = clientes.find((c) => c.UUID === row.clienteUuid);
        return { ...row, cliente: cli ? { ...cli } : null };
    };
    return {
        audits: () => audits,
        contatos,
        cliente: {
            findUnique: async ({ where }) => clientes.find((c) => c.UUID === where.UUID) || null,
            findMany: async () => clientes.map((c) => ({ ...c })),
        },
        clienteContato: {
            findMany: async ({ where, include } = {}) => contatos.filter((c) => combina(c, where)).map((c) => anexar(c, include)),
            findUnique: async ({ where }) => {
                const row = contatos.find((c) => c.id === where.id);
                return row ? { ...row } : null;
            },
            create: async ({ data }) => {
                const row = {
                    nome: null, papel: null, nota: null, ultimoContatoEm: null,
                    origem: 'CADASTRO', criadoPor: null, atualizadoPor: null,
                    createdAt: new Date(), updatedAt: new Date(),
                    ...data,
                };
                contatos.push(row);
                return { ...row };
            },
            update: async ({ where, data }) => {
                const row = contatos.find((c) => c.id === where.id);
                if (!row) { const e = new Error('não achei'); e.code = 'P2025'; throw e; }
                Object.assign(row, data, { updatedAt: new Date() });
                return { ...row };
            },
        },
        auditLog: {
            create: async ({ data }) => { audits.push(data); return data; },
        },
    };
}

function appCom(mock) {
    return buildApp('/api/analytics', ROUTER, makeMockPrisma(mock), CACHE);
}

test('API: aprende o nome, acha com e sem 55/9, registra a conversa e não apaga', async () => {
    const mem = memoria();
    const { close, request } = await startTestServer(appCom(mem));
    try {
        const semAgente = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: { 'x-analytics-key': CHAVE },
            body: { telefone: '47999998888' },
        });
        assert.equal(semAgente.status, 400);
        assert.equal(semAgente.body.codigo, 'AGENTE_OBRIGATORIO');

        const semNome = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: AGENTE,
            body: { telefone: '47999998888' },
        });
        assert.equal(semNome.status, 201);
        assert.equal(semNome.body.criado, true);
        assert.equal(semNome.body.contato.nome, null);
        assert.equal(semNome.body.contato.origem, 'AGENTE');
        const id = semNome.body.contato.id;

        const maria = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: AGENTE,
            body: { nome: 'Maria', telefone: '+55 (47) 99999-8888', papel: 'dona' },
        });
        assert.equal(maria.status, 200);
        assert.equal(maria.body.aprendeuNome, true);
        assert.equal(maria.body.contato.id, id);
        assert.equal(maria.body.contato.nome, 'Maria');
        assert.equal(mem.contatos.length, 1);
        assert.equal(mem.audits().some((a) => a.usuarioNome === 'ana' && a.acao === 'CONTATO_ATUALIZADO'), true);

        const semNomeDeNovo = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: AGENTE,
            body: { telefone: '47999998888' },
        });
        assert.equal(semNomeDeNovo.status, 409);
        assert.equal(semNomeDeNovo.body.codigo, 'INFORME_O_NOME');
        assert.ok(semNomeDeNovo.body.pessoas.some((p) => p.nome === 'Maria'));

        const deNovo = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: AGENTE,
            body: { nome: 'máRia', telefone: '4799998888', nota: 'Prefere de manhã' },
        });
        assert.equal(deNovo.status, 200);
        assert.equal(deNovo.body.atualizado, true);
        assert.equal(mem.contatos.length, 1);
        assert.equal(deNovo.body.contato.nota, 'Prefere de manhã');

        const joao = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: AGENTE,
            body: { nome: 'João', telefone: '5547999998888', papel: 'gerente' },
        });
        assert.equal(joao.status, 201);
        assert.equal(mem.contatos.length, 2);

        const conversa = await request('POST', `/api/analytics/v1/contatos/${joao.body.contato.id}/conversa`, {
            headers: AGENTE,
            body: {},
        });
        assert.equal(conversa.status, 200);
        assert.ok(conversa.body.contato.ultimoContatoEm);

        const por55 = await request('GET', '/api/analytics/v1/contatos/por-telefone?telefone=5547999998888', {
            headers: { 'x-analytics-key': CHAVE },
        });
        assert.equal(por55.status, 200);
        assert.equal(por55.body.chave, '4799998888');
        assert.equal(por55.body.encontrados, 1);
        assert.equal(por55.body.data[0].nome, 'Padaria do Zé');
        assert.equal(por55.body.data[0].falarCom.nome, 'João');
        assert.equal(por55.body.data[0].perguntarQuem, false);

        const sem9 = await request('GET', '/api/analytics/v1/contatos/por-telefone?telefone=4799998888', {
            headers: { 'x-analytics-key': CHAVE },
        });
        assert.equal(sem9.body.data[0].falarCom.id, joao.body.contato.id);

        const lista = await request('GET', '/api/analytics/v1/clientes/cli-1/contatos', {
            headers: { 'x-analytics-key': CHAVE },
        });
        assert.equal(lista.status, 200);
        assert.equal(lista.body.total, 2);
        assert.equal(lista.body.falarCom.nome, 'João');

        const patch = await request('PATCH', `/api/analytics/v1/contatos/${id}`, {
            headers: AGENTE,
            body: { papel: 'compras' },
        });
        assert.equal(patch.status, 200);
        assert.equal(patch.body.contato.papel, 'compras');
        assert.equal(patch.body.contato.nome, 'máRia');

        const apaga = await request('DELETE', `/api/analytics/v1/contatos/${id}`, { headers: AGENTE });
        assert.equal(apaga.status, 405);
        assert.equal(apaga.body.codigo, 'SEM_EXCLUSAO');
        assert.equal(mem.contatos.length, 2);

        const invalido = await request('GET', '/api/analytics/v1/contatos/por-telefone?telefone=123', {
            headers: { 'x-analytics-key': CHAVE },
        });
        assert.equal(invalido.status, 400);
        assert.equal(invalido.body.codigo, 'TELEFONE_INVALIDO');

        const antes = mem.contatos.length;
        const legado = await request('GET', '/api/analytics/v1/contatos/por-telefone?telefone=47911112222', {
            headers: { 'x-analytics-key': CHAVE },
        });
        assert.equal(legado.status, 200);
        assert.equal(legado.body.encontrados, 1);
        assert.equal(legado.body.data[0].telefoneNoCadastro, true);
        assert.equal(legado.body.data[0].perguntarQuem, true);
        assert.equal(legado.body.data[0].total, 0);
        assert.equal(mem.contatos.length, antes);

        const sumiu = await request('POST', '/api/analytics/v1/clientes/nao-existe/contatos', {
            headers: AGENTE,
            body: { nome: 'Ana', telefone: '47988887777' },
        });
        assert.equal(sumiu.status, 404);
        assert.equal(sumiu.body.codigo, 'NAO_ENCONTRADO');
    } finally {
        await close();
    }
});
