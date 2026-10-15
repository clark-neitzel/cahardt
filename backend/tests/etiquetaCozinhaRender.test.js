// Geradores de etiqueta da Cozinha (EPL2 40x25 em 2 colunas / ZPL 100x120 / testes de impressão).
// Funções puras — sem banco nem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderEpl2Pequena, renderZplGrande, renderTeste, _internos } = require('../services/etiquetaCozinhaRender');

const base = {
    nome: 'Recheio de frango', fabricacao: '2026-10-15', validade: '2026-10-18', conservacao: 'REFRIGERADO',
    pesoGramas: 2000, lote: '261015-03', responsavelIniciais: 'MA', responsavelNome: 'Maria Aparecida', quantidade: 2,
};
const imp40 = { linguagem: 'EPL2', tamanho: '40x25', colunas: 2, larguraRoloMm: 84, gapDots: 24, removerAcentos: true };
const imp100 = { linguagem: 'ZPL', tamanho: '100x120', dpi: 203, removerAcentos: true };

const epl = (d, i = imp40) => renderEpl2Pequena(d, i).toString('ascii');
const conta = (txt, re) => (txt.match(re) || []).length;

test('EPL2: quantidade par = N/2 formulários com as 2 colunas e um único P', () => {
    const t = epl({ ...base, quantidade: 4 });
    assert.match(t, /\nq672\n/);
    assert.match(t, /\nQ200,24\n/);
    assert.equal(conta(t, /^P\d+$/gm), 1);
    assert.match(t, /^P2$/m);
    assert.equal(conta(t, /^LO/gm), 2, 'faixa preta nas duas colunas');
    assert.match(t, /^LO16,0,48,200$/m);
    assert.match(t, /^LO352,0,48,200$/m);
});

test('EPL2: quantidade ímpar = pares + 1 etiqueta sozinha na coluna 1', () => {
    const t = epl({ ...base, quantidade: 3 });
    assert.equal(conta(t, /^P\d+$/gm), 2);
    const [f1, f2] = t.split(/^N$/m).filter((x) => /P\d/.test(x));
    assert.match(f1, /^P1$/m);
    assert.equal(conta(f1, /^LO/gm), 2);
    assert.equal(conta(f2, /^LO/gm), 1, 'sobra: só uma coluna');
    assert.match(f2, /^LO16,/m);
    assert.doesNotMatch(f2, /^LO352,/m);
});

test('EPL2: quantidade 1 e quantidade inválida viram 1 etiqueta; teto 200', () => {
    assert.equal(conta(epl({ ...base, quantidade: 1 }), /^LO/gm), 1);
    assert.equal(conta(epl({ ...base, quantidade: 0 }), /^LO/gm), 1);
    assert.match(epl({ ...base, quantidade: 9999 }), /^P100$/m);
});

test('EPL2: impressora com 1 coluna imprime N formulários de uma etiqueta', () => {
    const t = epl({ ...base, quantidade: 5 }, { ...imp40, colunas: 1 });
    assert.match(t, /^P5$/m);
    assert.equal(conta(t, /^LO/gm), 1);
});

test('EPL2: nome curto usa a fonte maior; nome longo cai para fonte menor e no máximo 2 linhas de nome', () => {
    const curto = epl({ ...base, nome: 'Frango', quantidade: 1 });
    assert.match(curto, /^A72,6,0,4,1,1,N,"FRANGO"$/m);
    const longo = epl({ ...base, nome: 'Recheio de frango com catupiry e requeijao cremoso especial da casa', quantidade: 1 });
    const linhasNome = longo.split('\n').filter((l) => /^A72,(6|\d+),0,[234],1,1,N,/.test(l) && !/VAL|FAB|REFRIG/.test(l));
    assert.ok(linhasNome.length <= 2 + 0, 'nome em no máximo 2 linhas: ' + linhasNome.length);
    for (const l of longo.split('\n').filter((x) => /^A/.test(x))) {
        const m = /"(.*)"$/.exec(l);
        assert.ok(m[1].length <= 26, 'linha cabe no limite: ' + l);
    }
});

test('EPL2: nome de 50+ caracteres é cortado com ponto, sem estourar', () => {
    const nome = 'A'.repeat(20) + ' ' + 'B'.repeat(20) + ' ' + 'C'.repeat(20) + ' ' + 'D'.repeat(20);
    const t = epl({ ...base, nome, quantidade: 1 });
    assert.match(t, /\."$/m);
});

test('EPL2: acento sai em ASCII; aspas e barra são escapadas', () => {
    const t = epl({ ...base, nome: 'Açúcar "refinado" \\ fino', quantidade: 1 });
    assert.match(t, /ACUCAR/);
    assert.match(t, /\\"REFINADO\\"/);
    assert.match(t, /\\\\/);
    assert.ok(!/[^\x00-\x7f]/.test(t));
});

test('EPL2: dia da semana e datas — virada de mês/ano, sem UTC', () => {
    const t = epl({ ...base, fabricacao: '2026-12-31', validade: '2027-01-02', quantidade: 1 });
    assert.match(t, /"QUI 31\/12"/); // 31/12/2026 é quinta
    assert.match(t, /"02\/01"/);
    assert.equal(_internos.diaSemana('2026-10-15'), 4);
});

test('EPL2: rodapé tem peso e lote; peso vazio é omitido', () => {
    const t = epl({ ...base, quantidade: 1 });
    assert.match(t, /"FAB 15\/10 2,0kg"/);
    assert.match(t, /"REFRIG L261015-03 MA"/);
    const s = epl({ ...base, pesoGramas: null, conservacao: 'CONGELADO', quantidade: 1 });
    assert.match(s, /"FAB 15\/10"/);
    assert.match(s, /"CONGEL L261015-03 MA"/);
});

test('EPL2: ajustes de calibração deslocam as colunas', () => {
    const t = epl({ ...base, quantidade: 2 }, { ...imp40, ajustes: { col1X: 20, col2X: 360, offsetY: 4 } });
    assert.match(t, /^LO20,4,48,200$/m);
    assert.match(t, /^LO360,4,48,200$/m);
});

test('ZPL: estrutura básica, quantidade e dpi', () => {
    const z = renderZplGrande({ ...base, quantidade: 3 }, imp100).toString('utf8');
    assert.match(z, /^\^XA/);
    assert.match(z, /\^PW800\n\^LL960/);
    assert.match(z, /\^PQ3,0,1,N/);
    assert.match(z, /\^XZ\n$/);
    assert.match(z, /QUINTA - 15\/10/);
    assert.match(z, /REFRIGERADO 0-4 C/);
    assert.match(z, /\^FD18\/10\/2026\^FS/);
    assert.match(z, /Lote: 261015-03/);
    const z300 = renderZplGrande({ ...base, quantidade: 1 }, { ...imp100, dpi: 300 }).toString('utf8');
    assert.match(z300, /\^PW1182\n\^LL1419/);
});

test('ZPL: ^ ~ \\ no nome não quebram o comando', () => {
    const z = renderZplGrande({ ...base, nome: 'Recheio ^FO0,0 ~DG \\ teste', quantidade: 1 }, imp100).toString('utf8');
    const campo = z.split('\n').find((l) => /\^FB/.test(l));
    assert.ok(campo, 'campo do nome existe');
    assert.equal(conta(campo, /\^FD/g), 1);
    assert.doesNotMatch(campo.split('^FD')[1].replace(/\^FS$/, ''), /\^/);
});

test('ZPL: nome longo diminui a fonte; 3 linhas no máximo', () => {
    const f1 = _internos.escolherFonteZplNome('FRANGO', 720, 3);
    const f2 = _internos.escolherFonteZplNome('RECHEIO DE FRANGO COM CATUPIRY E REQUEIJAO CREMOSO ESPECIAL DA CASA HARDT', 720, 3);
    assert.ok(f1.h > f2.h);
    assert.ok(f2.linhas.length <= 3);
    const f3 = _internos.escolherFonteZplNome('X'.repeat(300), 720, 3);
    assert.equal(f3.h, 52);
    assert.ok(f3.linhas.length <= 3);
});

test('ZPL: rotação 180 liga ^POI; 90 troca PW/LL', () => {
    assert.match(renderZplGrande(base, { ...imp100, rotacao: 180 }).toString(), /\^POI/);
    assert.match(renderZplGrande(base, { ...imp100, rotacao: 90 }).toString(), /\^PW960\n\^LL800/);
});

test('Teste de impressão: 3 variantes geram conteúdo válido', () => {
    const e = renderTeste('TEXTO_EPL2', imp40).toString();
    assert.match(e, /^\nN\n/);
    assert.match(e, /\nP1\n$/);
    const z = renderTeste('TEXTO_ZPL', imp100).toString();
    assert.match(z, /^\^XA/);
    assert.match(z, /\^XZ\n$/);
    assert.match(renderTeste('ETIQUETA_EXEMPLO', imp40).toString(), /RECHEIO DE TESTE/);
    assert.match(renderTeste('ETIQUETA_EXEMPLO', imp100).toString(), /RECHEIO DE TESTE/);
    assert.throws(() => renderTeste('ETIQUETA_EXEMPLO', { ...imp100, tamanho: '40x25' }), /100x120/);
    assert.throws(() => renderTeste('XYZ', imp40), /inválido/);
});
