// Prova do formato das informações complementares (montagem do payload de VENDA). Uso: node scripts/teste-infos-adicionais-nfe.js
const svc = require('../services/focusNfeEmissaoService');
const cli = (extra) => ({ id: 'c1', Nome: 'PADARIA PAO QUENTE LTDA', NomeFantasia: 'Padaria Pão Quente', Documento: '11222333000181', IE: '123456789',
    End_Logradouro: 'Rua A', End_Numero: '10', End_Bairro: 'Centro', End_Cidade: 'Joinville', End_Estado: 'SC', End_CEP: '89200000', End_Cidade_Codigo: '4209102', End_Municipio_IBGE: '4209102', ...extra });
const ped = (c, obs) => ({ id: 'p1', numero: 4821, observacoes: obs, cliente: c, nomeCondicaoPagamento: 'Boleto', dataVenda: new Date(),
    itens: [{ quantidade: 10, valor: 12.5, produto: { codigo: '1', nome: 'Pao', ncm: '19059090', unidade: 'PT' } }] });
(async () => {
    for (const [t, c, o] of [['CNPJ+fantasia, sem obs', cli(), null], ['CNPJ+fantasia, com obs', cli(), 'Entregar na porta\r\ndos fundos #2'],
        ['fantasia == razão', cli({ NomeFantasia: 'padaria pao quente  ltda' }), null]]) {
        try { const n = await svc.montarNotaVenda(ped(c, o)); console.log(`--- ${t}\n${n.informacoes_adicionais_contribuinte}\n`); }
        catch (e) { console.log(`--- ${t}: ERRO ${e.message}`); }
    }
    process.exit(0);
})();
