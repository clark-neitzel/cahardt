// Ficha editável do PAINEL DO BOT (nov/2026): opções, editar cadastro, inativar e contexto.
// Prisma mockado — nunca toca banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
process.env.ANALYTICS_API_KEY = process.env.ANALYTICS_API_KEY || 'chave-teste-analytics-agentes';

const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const CHAVE = process.env.ANALYTICS_API_KEY;
const LEITURA = { 'x-analytics-key': CHAVE };
const PAINEL = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'painel-Leticia' };
const ANA = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'ana' };
const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js', 'services/clienteContatoService.js', 'services/clienteHistoricoService.js',
    'services/analyticsConsultaService.js', 'services/analyticsRegistroService.js', 'services/analyticsComum.js',
    'services/analyticsClienteFichaService.js', 'services/clienteCadastroCompletoService.js',
    'services/clienteInativacaoService.js', 'services/clienteClassificacaoService.js', 'services/clienteTelefonesService.js',
    'services/analyticsCadastroEdicaoService.js', 'services/whatsappClienteService.js', 'middlewares/analyticsAuth.js',
    'services/cidadeService.js', 'services/clienteEnderecoHistoricoService.js',
];
const CIDADES = [
    { id: 'c1', nome: 'Balneário Camboriú', uf: 'SC', chave: 'balneario camboriu', ativo: true, fundidaEmId: null },
    { id: 'c2', nome: 'Itajaí', uf: 'SC', chave: 'itajai', ativo: true, fundidaEmId: null },
];
const CATEGORIAS = [{ id: 'cat1', nome: 'Lanchonete', cicloPadraoDias: 7, ativo: true }, { id: 'cat9', nome: 'Velha', cicloPadraoDias: 7, ativo: false }];

const TABELAS = [
    { id: '1000', idCondicao: 'AVISTA', nomeCondicao: 'À vista', ativo: true, acrescimoPreco: 0, valorMinimo: 100, qtdParcelas: 1, parcelasDias: 0 },
    { id: '2000', idCondicao: 'B14', nomeCondicao: 'Boleto 14d', ativo: true, acrescimoPreco: 3, valorMinimo: 150, qtdParcelas: 1, parcelasDias: 14 },
    { id: '9000', idCondicao: 'VELHA', nomeCondicao: 'Velha', ativo: false, acrescimoPreco: 0, valorMinimo: null },
];
const VENDEDORES = [{ id: 'v1', nome: 'Carla', ativo: true }, { id: 'v2', nome: 'Pabla', ativo: true }, { id: 'v9', nome: 'Saiu', ativo: false }];

function banco(extra = {}) {
    const c = {
        UUID: 'cli-1', Nome: 'Cantinho do Sabor LTDA', NomeFantasia: 'Cantinho do Sabor', Ativo: true, Documento: null, Perfis: null,
        End_Estado: 'SC', End_Cidade: 'Balneário Camboriú', Telefone: '996293920', Telefone_Celular: null, Telefone_Comercial: null,
        whatsapp: null, Dia_de_venda: null, Dia_de_entrega: null, Condicao_de_pagamento: null, condicoes_pagamento_permitidas: ['2000'],
        idVendedor: null, Email: null, Tipo_Pessoa: null, End_Logradouro: null, End_Numero: null, End_Bairro: null, End_CEP: null,
        Observacoes_Gerais: 'cliente reativado', observacaoComercialFixa: null, ...extra,
    };
    const mem = {
        c, historico: [], audit: [], trilha: [], fiscal: undefined, whats: null, classificacao: null, prefs: [], contatos: [{ id: 'ct1', clienteUuid: 'cli-1', nome: 'Dona Maria', telefone: '34471023', ultimoContatoEm: null }],
        solicitacoes: [{ id: 's1', clienteId: 'cli-1', status: 'pendente', motivo: 'fechou', solicitadoPor: 'ana', origem: 'api_agente', createdAt: new Date() }],
    };
    const comVend = (x) => ({ ...x, whatsapp: mem.whats ? { numeros: mem.whats } : x.whatsapp, vendedor: VENDEDORES.find((v) => v.id === x.idVendedor) || null });
    Object.assign(mem, {
        cliente: {
            findUnique: async ({ where }) => (where.UUID === c.UUID ? comVend(c) : null),
            findMany: async () => [comVend(c)],
            update: async ({ data }) => { Object.assign(c, data); return comVend(c); },
        },
        tabelaPreco: {
            findUnique: async ({ where }) => TABELAS.find((t) => t.id === where.id) || null,
            findMany: async ({ where } = {}) => TABELAS.filter((t) => (where?.ativo ? t.ativo : true)),
        },
        vendedor: {
            findUnique: async ({ where }) => VENDEDORES.find((v) => v.id === where.id) || null,
            findMany: async ({ where } = {}) => VENDEDORES.filter((v) => (where?.ativo ? v.ativo : true) && (!where?.id?.in || where.id.in.includes(v.id))),
        },
        clienteWhatsapp: { upsert: async ({ create }) => { mem.whats = create.numeros; return create; } },
        clienteAlteracao: { createMany: async ({ data }) => { mem.historico.push(...data); return { count: data.length }; }, count: async () => 0, findMany: async () => [] },
        auditLog: {
            create: async ({ data }) => { mem.audit.push(data); return data; },
            findMany: async () => [{ acao: 'CLIENTE_ALTERADO', usuarioNome: 'Fulano', createdAt: new Date('2026-03-01T12:00:00Z'), detalhes: JSON.stringify({ mudancas: { idVendedor: { de: 'v1', para: null } } }) }],
        },
        clienteContato: {
            findUnique: async ({ where }) => mem.contatos.find((x) => x.id === where.id) || null,
            findMany: async ({ where } = {}) => mem.contatos.filter((x) => !where?.clienteUuid || x.clienteUuid === where.clienteUuid),
            update: async ({ where, data }) => { const x = mem.contatos.find((y) => y.id === where.id); Object.assign(x, data); return { ...x }; },
        },
        clienteClassificacao: {
            findUnique: async () => (mem.classificacao ? { clienteId: 'cli-1', classificacao: mem.classificacao } : null),
            findMany: async () => (mem.classificacao ? [{ clienteId: 'cli-1', classificacao: mem.classificacao }] : []),
            upsert: async ({ create }) => { mem.classificacao = create.classificacao; return create; },
            delete: async () => { mem.classificacao = null; },
        },
        clienteTelefonePreferencia: {
            findUnique: async () => mem.prefs[0] || null,
            upsert: async ({ create, update }) => { if (mem.prefs[0]) Object.assign(mem.prefs[0], update); else mem.prefs.push({ ...create }); return mem.prefs[0]; },
            updateMany: async () => ({ count: 0 }),
        },
        contaReceber: { findMany: async () => [] },
        contaPagar: { findMany: async () => [] },
        pedido: { findMany: async (args) => (args?.distinct ? [] : [{ id: 'p1', numero: 77, dataVenda: new Date('2026-02-10T12:00:00Z'), cancelado: false, especial: false, statusEntrega: 'ENTREGUE', situacaoCA: 'FATURADO', itens: [{ quantidade: 2, valor: 60 }] }]) },
        pedidoItem: { findMany: async () => [] },
        atendimento: { findMany: async () => [{ id: 'a1', tipo: 'VISITA', observacao: 'Disse que vai fechar a loja', acaoLabel: 'Não comprou', criadoEm: new Date('2026-10-01T12:00:00Z'), proximaVisita: null, vendedor: { nome: 'Carla' } }] },
        clienteInativacaoSolicitacao: {
            updateMany: async ({ where, data }) => { let n = 0; for (const s of mem.solicitacoes) if (s.clienteId === where.clienteId && s.status === where.status) { Object.assign(s, data); n++; } return { count: n }; },
            count: async () => mem.solicitacoes.length,
            findMany: async () => mem.solicitacoes,
        },
        clienteWhatsappStatus: { upsert: async () => ({}), findUnique: async () => null },
        fornecedor: { findMany: async () => [] },
        cidade: { findMany: async () => CIDADES },
        cidadePendente: { upsert: async () => ({}), findMany: async () => [] },
        categoriaCliente: {
            findUnique: async ({ where }) => CATEGORIAS.find((x) => x.id === where.id) || null,
            findMany: async ({ where } = {}) => CATEGORIAS.filter((x) => (where?.ativo ? x.ativo : true)),
        },
        clienteFiscal: { upsert: async ({ create }) => { mem.fiscal = create.inscricaoEstadual; return create; } },
        clienteEnderecoLog: {
            findFirst: async () => null,
            create: async ({ data }) => { mem.trilha.push(data); return { id: `t${mem.trilha.length}`, ...data }; },
        },
    });
    return mem;
}

async function comApp(mem, fn) {
    const s = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try { await fn(s.request); } finally { await s.close(); }
}

test('cadastro-opcoes: vendedores e tabelas ATIVOS, dias, classificações e motivos', async () => {
    await comApp(banco(), async (request) => {
        const r = await request('GET', '/api/analytics/v1/cadastro-opcoes', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.vendedores.map((v) => v.nome), ['Carla', 'Pabla']);
        assert.deepEqual(r.body.tabelas.map((t) => t.id), ['1000', '2000']);
        assert.deepEqual(r.body.dias, ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']);
        assert.ok(r.body.motivosInativacao.some((m) => m.valor === 'fechou'));
    });
});

test('editar: só agente do painel; agente comercial (ana) e sem agente são recusados', async () => {
    await comApp(banco(), async (request) => {
        const a = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', { headers: ANA, body: { diaVenda: ['SEG'] } });
        assert.equal(a.status, 403);
        assert.equal(a.body.codigo, 'AGENTE_SEM_PERMISSAO');
        const b = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', { headers: LEITURA, body: { diaVenda: ['SEG'] } });
        assert.equal(b.status, 400);
        assert.equal(b.body.codigo, 'AGENTE_OBRIGATORIO');
    });
});

test('editar: telefone sem DDD, dia inválido, tabela inativa e vendedor inativo voltam 400 com a lista de erros (nada gravado)', async () => {
    const mem = banco();
    await comApp(mem, async (request) => {
        const r = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', {
            headers: PAINEL,
            body: { diaVenda: ['SEG', 'XYZ'], tabelaPrecoId: '9000', vendedorId: 'v9', telefones: { celular: '99629-3920' } },
        });
        assert.equal(r.status, 400);
        assert.equal(r.body.codigo, 'DADOS_INVALIDOS');
        assert.deepEqual(r.body.erros.map((e) => e.campo).sort(), ['diaVenda', 'tabelaPrecoId', 'telefones.celular', 'vendedorId']);
        assert.match(r.body.erros.find((e) => e.campo === 'telefones.celular').mensagem, /Falta o DDD/);
        assert.equal(mem.c.Dia_de_venda, null);
        assert.equal(mem.historico.length, 0);
    });
});

test('editar: completa o cadastro, grava telefone sem 55, classifica, define o preferido e sai da lista', async () => {
    const mem = banco();
    await comApp(mem, async (request) => {
        const r = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', {
            headers: PAINEL,
            body: {
                diaVenda: 'qua,seg', diaEntrega: ['QUI'], tabelaPrecoId: '1000', vendedorId: 'v2',
                telefones: { celular: '+55 (47) 99111-2222', telefone: '' },
                contatos: [{ id: 'ct1', telefone: '47 3447-1023' }],
                classificacao: 'CLIENTE', telefonePreferido: '47991112222',
            },
        });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(mem.c.Dia_de_venda, 'SEG,QUA');
        assert.equal(mem.c.Dia_de_entrega, 'QUI');
        assert.equal(mem.c.Condicao_de_pagamento, '1000');
        assert.deepEqual(mem.c.condicoes_pagamento_permitidas, ['2000', '1000']);   // favorita entra nas permitidas
        assert.equal(mem.c.idVendedor, 'v2');
        assert.equal(mem.c.Telefone_Celular, '47991112222');                       // sem o 55
        assert.equal(mem.c.Telefone, null);
        assert.equal(mem.contatos[0].telefone, '4734471023');
        assert.equal(mem.classificacao, 'CLIENTE');
        assert.deepEqual(mem.prefs[0].ordem, ['4791112222']);
        assert.equal(r.body.resolvido, true);
        assert.deepEqual(r.body.grupos, []);
        assert.equal(r.body.ficha.vendedor.nome, 'Pabla');
        // histórico com o agente do painel como autor; auditoria CLIENTE_ALTERADO
        assert.ok(mem.historico.some((h) => h.campo === 'Dia_de_venda' && h.autorNome === 'painel-Leticia' && h.origem === 'api_agente'));
        assert.ok(mem.historico.some((h) => h.campo === 'classificacao'));
        assert.equal(mem.audit[0].acao, 'CLIENTE_ALTERADO');
        assert.ok(JSON.parse(mem.audit[0].detalhes).mudancas.idVendedor);
    });
});

test('editar: o que continua faltando volta em pendencias (não some da lista)', async () => {
    const mem = banco();
    mem.classificacao = 'CLIENTE';
    await comApp(mem, async (request) => {
        const r = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', { headers: PAINEL, body: { diaVenda: ['SEG'] } });
        assert.equal(r.status, 200);
        assert.equal(r.body.resolvido, false);
        assert.ok(r.body.grupos.includes('acertar'));
        assert.deepEqual(r.body.pendencias.map((p) => p.campo), ['diaEntrega', 'tabelaPreco', 'vendedor', 'telefoneIncompleto']);
    });
});

test('inativar: só painel, motivo obrigatório, inativa na hora e fecha o pedido pendente', async () => {
    const mem = banco();
    await comApp(mem, async (request) => {
        const ana = await request('POST', '/api/analytics/v1/clientes/cli-1/inativar', { headers: ANA, body: { motivo: 'fechou' } });
        assert.equal(ana.status, 403);
        const sem = await request('POST', '/api/analytics/v1/clientes/cli-1/inativar', { headers: PAINEL, body: {} });
        assert.equal(sem.status, 400);
        assert.equal(mem.c.Ativo, true);
        const ok = await request('POST', '/api/analytics/v1/clientes/cli-1/inativar', { headers: PAINEL, body: { motivo: 'fechou', detalhe: 'vendedor disse que fechou' } });
        assert.equal(ok.status, 200, JSON.stringify(ok.body));
        assert.equal(mem.c.Ativo, false);
        assert.equal(ok.body.pedidosFechados, 1);
        assert.equal(mem.solicitacoes[0].status, 'aprovada');
        assert.ok(mem.historico.some((h) => h.campo === 'inativacao' && /Fechou/.test(h.valorNovo)));
        const de_novo = await request('POST', '/api/analytics/v1/clientes/cli-1/inativar', { headers: PAINEL, body: { motivo: 'fechou' } });
        assert.equal(de_novo.status, 409);
        const editar = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', { headers: PAINEL, body: { diaVenda: ['SEG'] } });
        assert.equal(editar.status, 409);
    });
});

test('contexto: visitas com a nota do vendedor, pedidos, auditoria com nome do vendedor', async () => {
    await comApp(banco(), async (request) => {
        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/contexto', { headers: LEITURA });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.atendimentos[0].observacao, 'Disse que vai fechar a loja');
        assert.equal(r.body.atendimentos[0].vendedor, 'Carla');
        assert.equal(r.body.pedidos[0].total, 120);
        assert.deepEqual(r.body.auditoria[0].mudancas.idVendedor, { de: 'Carla', para: null });
        assert.equal(r.body.cliente.observacoes, 'cliente reativado');
    });
});

test('editar (13/11): identificação, e-mail, IE, endereço com cidade oficial, observações, canais, categoria, permitidas e nome da pessoa', async () => {
    const mem = banco({ Condicao_de_pagamento: '1000' });
    await comApp(mem, async (request) => {
        const r = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', {
            headers: PAINEL,
            body: {
                razaoSocial: '  Cantinho do Sabor Lanches LTDA ', nomeFantasia: 'Cantinho', documento: '11.222.333/0001-81', email: 'compras@cantinho.com.br',
                inscricaoEstadual: '123.456.789', indicadorIe: 'contribuinte',
                endereco: { logradouro: 'Rua 1500', numero: '820', complemento: '', bairro: 'Centro', cidade: 'itajai', estado: 'sc', cep: '88330-000' },
                observacoes: 'Entregar pelos fundos\nfecha 14h', observacaoComercial: 'Sempre oferecer o kit',
                canais: ['whatsapp', 'Presencial'], categoriaId: 'cat1', tabelasPermitidas: ['2000'],
                contatos: [{ id: 'ct1', nome: 'Maria (dona)', papel: 'dona' }],
            },
        });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(mem.c.Nome, 'Cantinho do Sabor Lanches LTDA');
        assert.equal(mem.c.NomeFantasia, 'Cantinho');
        assert.equal(mem.c.Documento, '11222333000181');
        assert.equal(mem.c.Tipo_Pessoa, 'JURIDICA');
        assert.equal(mem.c.Email, 'compras@cantinho.com.br');
        assert.equal(mem.fiscal, '123456789');
        assert.equal(mem.c.Indicador_Inscricao_Estadual, 'CONTRIBUINTE');
        assert.equal(mem.c.End_Cidade, 'Itajaí');                         // grafia oficial da lista
        assert.equal(mem.c.End_Estado, 'SC');
        assert.equal(mem.c.End_CEP, '88330000');
        assert.equal(mem.c.End_Complemento, null);
        assert.equal(mem.c.Observacoes_Gerais, 'Entregar pelos fundos\nfecha 14h');
        assert.equal(mem.c.observacaoComercialFixa, 'Sempre oferecer o kit');
        assert.deepEqual(mem.c.Formas_Atendimento, ['Presencial', 'Whatsapp']);
        assert.equal(mem.c.categoriaClienteId, 'cat1');
        assert.deepEqual(mem.c.condicoes_pagamento_permitidas, ['2000', '1000']);   // a favorita entra junto
        assert.equal(mem.contatos[0].nome, 'Maria (dona)');
        assert.equal(mem.contatos[0].papel, 'dona');
        assert.equal(mem.contatos[0].telefone, '34471023');                         // telefone não veio = não mexe
        assert.equal(mem.trilha.length, 1);                                         // trilha do endereço com o agente
        assert.equal(mem.trilha[0].autorNome, 'painel-Leticia');
        assert.ok(mem.historico.some((h) => h.campo === 'Nome' && h.autorNome === 'painel-Leticia'));
        assert.ok(mem.historico.some((h) => h.campo === 'Inscricao_Estadual'));
        assert.ok(JSON.parse(mem.audit[0].detalhes).mudancas.categoriaClienteId);
        // a ficha devolvida já traz os campos separados pra tela
        assert.equal(r.body.ficha.cliente.enderecoCampos.cidade, 'Itajaí');
        assert.equal(r.body.ficha.cliente.observacaoComercial, 'Sempre oferecer o kit');
    });
});

test('editar (13/11): cidade fora da lista, CNPJ inválido, e-mail ruim, IE de SC curta e CEP curto voltam 400 e nada é gravado', async () => {
    const mem = banco();
    await comApp(mem, async (request) => {
        const r = await request('PATCH', '/api/analytics/v1/clientes/cli-1/cadastro', {
            headers: PAINEL,
            body: { documento: '11.222.333/0001-00', email: 'sem-arroba', inscricaoEstadual: '1234', endereco: { cidade: 'Cidade Inventada', cep: '8833' }, razaoSocial: '  ', categoriaId: 'cat9' },
        });
        assert.equal(r.status, 400);
        assert.deepEqual(r.body.erros.map((e) => e.campo).sort(), ['categoriaId', 'documento', 'email', 'endereco.cep', 'endereco.cidade', 'inscricaoEstadual', 'razaoSocial']);
        assert.equal(mem.c.Nome, 'Cantinho do Sabor LTDA');
        assert.equal(mem.c.End_Cidade, 'Balneário Camboriú');
        assert.equal(mem.historico.length, 0);
        assert.equal(mem.trilha.length, 0);
    });
});

test('cadastro-opcoes (13/11): categorias ativas, canais e indicadores de IE', async () => {
    await comApp(banco(), async (request) => {
        const r = await request('GET', '/api/analytics/v1/cadastro-opcoes', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.categorias.map((c) => c.id), ['cat1']);
        assert.deepEqual(r.body.canais, ['Presencial', 'Whatsapp', 'Telefone']);
        assert.ok(r.body.indicadoresIe.some((i) => i.valor === 'NAO_CONTRIBUINTE'));
    });
});
