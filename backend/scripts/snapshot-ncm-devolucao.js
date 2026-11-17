// node scripts/snapshot-ncm-devolucao.js
// Compara o payload da NF-e de devolução (venda) e da venda/bonificação ANTES (git HEAD) x DEPOIS,
// com itens de NCM válido/vazio (devem ficar byte-idênticos) e com NCM inválido (só muda a regra nova).
// Tudo com prisma/Focus STUBADOS: não grava no banco nem chama a Focus.
const path = require('path');
const prisma = require('../config/database');
const focus = require('../services/focusNfeService');
const fs = require('fs');
const antigoPath = path.join(__dirname, '../services/_focus_old_tmp.js');
const antigoExiste = fs.existsSync(antigoPath);
if (!antigoExiste) { console.error('Falta services/_focus_old_tmp.js (git show HEAD:backend/services/focusNfeEmissaoService.js)'); process.exit(2); }

const CHAVE = '42' + '2611' + '12345678000199' + '55001' + '000000123' + '1' + '12345678' + '0';
const prodBase = (ncm, cod) => ({ id: 'p' + cod, codigo: cod, nome: 'Produto ' + cod, ncm, unidade: 'PT', nfeRevenda: false });
const cliente = { Nome: 'Cliente Teste', Documento: '11222333000181', End_Logradouro: 'Rua A', End_Numero: '10', End_Bairro: 'Centro', End_Cidade: 'Joinville', End_Estado: 'SC', End_CEP: '89200000', fiscal: { inscricaoEstadual: '255372744' }, NomeFantasia: 'Fantasia' };
const itensDev = ncms => ncms.map((n, i) => ({ id: 'i' + i, produtoId: 'p' + i, quantidade: 2, valorUnitario: 10, produto: prodBase(n, String(100 + i)) }));
const itensPed = ncms => ncms.map((n, i) => ({ id: 'i' + i, produtoId: 'p' + i, quantidade: 2, valor: 10, produto: prodBase(n, String(100 + i)) }));

let capturado = null;
prisma.devolucao.findUnique = async () => DEV;
prisma.appConfig.findUnique = async ({ where }) => where.key === 'nfe_devolucao_ref_item' ? { value: 'nunca' } : null;
prisma.notaFiscalApp.findUnique = async ({ where }) => where.ref.startsWith('nf-') ? { status: 'AUTORIZADO', chave: CHAVE, numero: '123', criadoEm: new Date('2026-11-01T12:00:00Z') } : null;
prisma.notaFiscalApp.create = async ({ data }) => { capturado = data.payloadEnviado; return { id: 'x', ...data }; };
prisma.notaFiscalApp.update = async ({ data }) => ({ id: 'x', ...data });
focus.emitir = async () => ({ httpStatus: 200, data: { status: 'processando_autorizacao' } });
let DEV;
const norm = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'data_emissao' || k === 'data_entrada_saida') ? 'X' : v));

(async () => {
    const velho = require('../services/_focus_old_tmp.js');
    const novo = require('../services/focusNfeEmissaoService.js');
    let falhas = 0;
    const cmp = (nome, a, b) => { const ok = JSON.stringify(norm(a)) === JSON.stringify(norm(b)); console.log((ok ? 'IDENTICO ' : 'DIFERENTE'), nome); if (!ok) falhas++; };

    for (const [rotulo, ncms] of [['NCM validos (8 dig + com pontos)', ['19022000', '1902.20.00', '21069090']], ['NCM vazios', ['', null, '19022000']]]) {
        DEV = { id: 'dev1', numero: 7, status: 'ATIVA', tipo: 'CONTA_AZUL', notaDevolucaoCA: null, cliente, itens: itensDev(ncms), pedidoOriginal: { id: 'ped1', numero: 55, especial: false, bonificacao: false, nfeChave: CHAVE, nfeNumero: '123', dataVenda: new Date('2026-11-01') } };
        capturado = null; await velho.emitirDevolucao('dev1'); const a = capturado;
        capturado = null; await novo.emitirDevolucao('dev1'); const b = capturado;
        cmp('devolucao venda — ' + rotulo, a, b);
        const ped = { numero: 55, cliente, itens: itensPed(ncms), nomeCondicaoPagamento: 'À vista' };
        cmp('montarNotaVenda — ' + rotulo, await velho.montarNotaVenda(ped), await novo.montarNotaVenda(ped));
        cmp('montarNotaBonificacao — ' + rotulo, await velho.montarNotaBonificacao(ped), await novo.montarNotaBonificacao(ped));
    }

    // NCM inválido: devolução cai no padrão (sem lançar); venda/bonificação lançam listando todos
    DEV = { ...DEV, itens: itensDev(['1234', 'abc', '19022000']) };
    capturado = null; const r = await novo.emitirDevolucao('dev1');
    console.log('devolucao com NCM invalido: NAO lancou; codigo_ncm =', capturado.items.map(i => i.codigo_ncm).join(','), '| avisosNcm =', JSON.stringify(r.avisosNcm));
    const pedRuim = { numero: 55, cliente, itens: itensPed(['1234', 'abc', '19022000']), nomeCondicaoPagamento: 'À vista' };
    for (const f of ['montarNotaVenda', 'montarNotaBonificacao']) {
        try { await novo[f](pedRuim); console.log(f, 'NAO LANCOU (ERRO)'); falhas++; } catch (e) { console.log(f, 'lancou ->', e.message); }
    }
    const pedVazio = { numero: 55, cliente, itens: itensPed(['', '19022000']), nomeCondicaoPagamento: 'À vista' };
    const nv = await novo.montarNotaVenda(pedVazio);
    console.log('venda NCM vazio: codigo_ncm =', nv.items.map(i => i.codigo_ncm).join(','), '| avisosNcm =', JSON.stringify(nv.avisosNcm), '| avisosNcm vaza no JSON? ', JSON.stringify(nv).includes('avisosNcm'));
    console.log(falhas ? `FALHAS: ${falhas}` : 'TUDO OK');
    process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(1); });
