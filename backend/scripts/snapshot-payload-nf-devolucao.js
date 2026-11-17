/**
 * Snapshot OFFLINE do payload da NF-e de DEVOLUCAO (sem banco, sem Focus, sem rede).
 * Prova de regressao de refatoracao de `emitirDevolucao` (focusNfeEmissaoService.js):
 * roda a funcao REAL com `prisma` e `focusNfe.emitir` SUBSTITUIDOS por stubs, captura o
 * payload que iria para a Focus e grava tudo em JSON. Rode antes e depois da mudanca e
 * compare com `diff`.
 *
 * Uso: node backend/scripts/snapshot-payload-nf-devolucao.js <arquivo-saida.json>
 *
 * Nunca usa token/credencial: nenhuma chamada de rede e nenhum banco.
 */
process.env.FOCUS_NFE_AMBIENTE = 'homologacao';
const fs = require('fs');
const path = require('path');

const FIXO = Date.parse('2026-11-17T15:00:00Z');
Date.now = () => FIXO; // agoraBrasilia() e refItemLigada() deterministicos

// ---- stubs (ANTES de carregar o service) ----
let cenario = null;
const prismaStub = {
    devolucao: { findUnique: async () => cenario.dev },
    notaFiscalApp: {
        findUnique: async ({ where }) => (where.ref.startsWith('nf-') ? cenario.notaVenda : null),
        create: async ({ data }) => ({ id: 'n1', ...data }),
        update: async ({ data }) => ({ id: 'n1', ...data }),
        upsert: async () => ({}),
    },
    appConfig: {
        findUnique: async ({ where }) => {
            if (where.key === 'nfe_devolucao_ref_item') return cenario.refItem ? { value: cenario.refItem } : null;
            return null; // focus_nfe_config -> padrao
        },
    },
};
require.cache[require.resolve('../config/database')] = {
    id: 'x', filename: require.resolve('../config/database'), loaded: true, exports: prismaStub,
};
const focusNfe = require('../services/focusNfeService');
let capturado = null;
focusNfe.emitir = async (ref, nota) => { capturado = { ref, nota }; return { httpStatus: 200, data: { status: 'processando_autorizacao' } }; };
require.cache[require.resolve('../services/canhotoService')] = {
    id: 'c', filename: require.resolve('../services/canhotoService'), loaded: true,
    exports: { registrarDeNotaApp: async () => {} },
};
const emissao = require('../services/focusNfeEmissaoService');

// ---- cenarios ----
const prodA = { id: 'uuid-a', codigo: '101', nome: 'Pao de Queijo', ncm: '1905.90.90', unidade: 'PT', nfeRevenda: false };
const prodB = { id: 'uuid-b', codigo: '202', nome: 'Refrigerante', ncm: '', unidade: 'UN', nfeRevenda: true, nfeCest: '0300700' };
const prodC = { id: 'uuid-c', codigo: '', nome: 'Produto Sem Codigo', ncm: null, unidade: null, nfeRevenda: false };
const prodX = { id: 'uuid-x', codigo: '999', nome: 'Nao Consta', ncm: '19059090', unidade: 'PT', nfeRevenda: false };
const itensVenda = [
    { numero_item: 1, codigo_produto: '101', descricao: 'Pao de Queijo', quantidade_comercial: 10 },
    { numero_item: 2, codigo_produto: '202', descricao: 'Refrigerante', quantidade_comercial: 5 },
    { numero_item: 3, codigo_produto: 'uuid-c', descricao: 'Produto Sem Codigo', quantidade_comercial: 3 },
];
const notaVenda = {
    id: 'nv', status: 'AUTORIZADO', numero: 1234, chave: '42261108766459000102550010000012341000012349',
    criadoEm: new Date('2026-11-10T14:00:00Z'), payloadEnviado: { items: itensVenda },
};
const it = (id, produto, q, v) => ({ id, produtoId: produto.id, produto, quantidade: q, valorUnitario: v });
const clienteSC = {
    Nome: 'MERCADO SANTA CLARA LTDA', NomeFantasia: 'Mercado Santa Clara', Documento: '12.345.678/0001-90',
    End_Logradouro: 'Rua das Flores', End_Numero: 55, End_Complemento: 'Sala 2', End_Bairro: 'Centro',
    End_Cidade: 'Joinville', End_Estado: 'SC', End_CEP: '89201-000', Telefone: '(47) 99999-0000',
    fiscal: { inscricaoEstadual: '255.372.744' },
};
const dev = (cliente, itens, extra = {}) => ({
    id: 'dev-1', status: 'ATIVA', tipo: 'NORMAL', notaDevolucaoCA: null, itens, cliente,
    pedidoOriginal: { id: 'ped-1', numero: 4821, especial: false, bonificacao: false, dataVenda: new Date('2026-11-10T12:00:00Z'), nfeChave: null, nfeNumero: null, ...extra },
});

const CENARIOS = {
    'sc-cnpj-com-ie': { dev: dev(clienteSC, [it('i1', prodA, 2, 12.5), it('i2', prodB, 1, 7.3), it('i3', prodC, 3, 4.1)]), notaVenda },
    'pr-interestadual-cnpj-sem-ie': {
        dev: dev({ ...clienteSC, Nome: 'COMERCIO CURITIBA LTDA', NomeFantasia: 'COMERCIO CURITIBA LTDA', End_Estado: 'pr', End_Complemento: '', Telefone: null, fiscal: null },
            [it('i1', prodA, 4, 11.11), it('i2', prodB, 2, 3.333)]),
        notaVenda,
    },
    'cpf-sc': {
        dev: dev({ ...clienteSC, Nome: 'JOAO DA SILVA', NomeFantasia: null, Documento: '123.456.789-09', fiscal: null }, [it('i1', prodA, 1, 9.99)]),
        notaVenda,
    },
    'item-nao-casa-erro': { dev: dev(clienteSC, [it('i1', prodA, 1, 5), it('i2', prodX, 1, 5)]), notaVenda },
    'sc-cnpj-ref-item-desligada': { dev: dev(clienteSC, [it('i1', prodA, 2, 12.5)]), notaVenda, refItem: 'nunca' },
    'cadastro-sem-documento-erro': { dev: dev({ ...clienteSC, Documento: '' }, [it('i1', prodA, 1, 5)]), notaVenda },
    'cadastro-sem-endereco-erro': { dev: dev({ ...clienteSC, End_Bairro: '', End_CEP: null }, [it('i1', prodA, 1, 5)]), notaVenda },
    'sem-itens-erro': { dev: dev(clienteSC, [it('i1', prodA, 0, 5)]), notaVenda },
};

(async () => {
    const saida = {};
    const log = console.log; const warn = console.warn;
    console.log = () => {}; console.warn = () => {};
    for (const [nome, c] of Object.entries(CENARIOS)) {
        cenario = c; capturado = null;
        try { await emissao.emitirDevolucao('dev-1'); saida[nome] = { ok: true, ...capturado }; }
        catch (e) { saida[nome] = { ok: false, erro: e.message, capturado }; }
    }
    console.log = log; console.warn = warn;
    const destino = process.argv[2];
    if (!destino) { console.error('informe o arquivo de saida'); process.exit(1); }
    fs.writeFileSync(path.resolve(destino), JSON.stringify(saida, null, 2) + '\n');
    for (const [n, r] of Object.entries(saida)) console.log(n.padEnd(34), r.ok ? 'payload ok' : 'erro: ' + r.erro.slice(0, 70));
})();
