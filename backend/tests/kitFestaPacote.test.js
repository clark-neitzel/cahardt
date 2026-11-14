// Pacotes 500 g no Kit Festa: identificação, mínimo de caixas, cupom, ENCAIXE e pré-cadastro.
const test = require('node:test');
const assert = require('node:assert/strict');
const pacote = require('../services/kitFestaPacote');

const caixa = { id: 'c1', unidadesPorCaixa: 25, categoria: { slug: 'salgados' }, precoKitFesta: 45 };
const packSlug = { id: 'p1', unidadesPorCaixa: 1, categoria: { slug: 'congelados' }, precoKitFesta: 15 };
const packSoUnidade = { id: 'p2', unidadesPorCaixa: 1, categoria: { slug: 'outros' }, precoKitFesta: 15 };
const packSoSlug = { id: 'p3', unidadesPorCaixa: 25, categoria: { slug: 'congelados' }, precoKitFesta: 15 };

test('identifica pacote por slug congelados ou unidadesPorCaixa=1', () => {
    assert.equal(pacote.ehPacoteKitFesta(caixa), false);
    assert.equal(pacote.ehPacoteKitFesta(packSlug), true);
    assert.equal(pacote.ehPacoteKitFesta(packSoUnidade), true);
    assert.equal(pacote.ehPacoteKitFesta(packSoSlug), true);
    assert.equal(pacote.ehPacoteKitFesta({ pacote: true, unidadesPorCaixa: 25 }), true);
    assert.equal(pacote.rotuloUnidade(caixa), 'caixa de 25');
    assert.equal(pacote.rotuloUnidade(packSlug), 'pacote 500 g');
});

test('mínimo e cupom minCaixas ignoram pacotes', () => {
    const itens = [
        { kitFestaProdutoId: 'c1', quantidade: 4 },
        { kitFestaProdutoId: 'p1', quantidade: 6 },
    ];
    const mapa = { c1: caixa, p1: packSlug };
    const q = pacote.quantidadeCaixasParaMinimo(itens, (it) => mapa[it.kitFestaProdutoId]);
    assert.equal(q.caixas, 4);
    assert.equal(q.pacotes, 6);
    assert.equal(q.totalItens, 10);
    assert.equal(pacote.textoResumoQuantidades(q), '4 caixas + 6 pacotes');
    // só pacotes: não atinge o mínimo de 4 caixas
    const soPack = pacote.quantidadeCaixasParaMinimo(
        [{ kitFestaProdutoId: 'p1', quantidade: 8 }],
        () => packSlug,
    );
    assert.equal(soPack.caixas, 0);
    assert.equal(soPack.pacotes, 8);
});

test('marca ENCAIXE uma vez só', () => {
    const a = pacote.marcarEncaixe(null);
    assert.match(a, /\[ENCAIXE\]/);
    assert.match(a, /equipe confirmar/);
    assert.equal(pacote.marcarEncaixe(a), a);
    assert.equal(pacote.temEncaixe(a), true);
    assert.equal(pacote.temEncaixe('pedido normal'), false);
});

test('bloco de cadastro vai e volta nas observações', () => {
    const bloco = pacote.formatarBlocoCadastro({
        nome: 'Maria Silva',
        cpf: '52998224725',
        telefone: '47999999999',
        logradouro: 'Rua das Flores',
        numero: '100',
        bairro: 'Centro',
        cidade: 'Joinville',
        uf: 'SC',
        cep: '89200000',
        email: 'maria@example.com',
    });
    assert.match(bloco, /\[CADASTRO\]/);
    const obs = pacote.mesclarObservacoesCadastro('[WhatsApp IA] festa sábado', {
        nome: 'Maria Silva',
        cpf: '52998224725',
        logradouro: 'Rua das Flores',
        numero: '100',
        cidade: 'Joinville',
        uf: 'SC',
        cep: '89200-000',
        email: 'maria@example.com',
    });
    assert.match(obs, /\[WhatsApp IA\]/);
    const parsed = pacote.parsearBlocoCadastro(obs);
    assert.equal(parsed.nome, 'Maria Silva');
    assert.equal(parsed.cpf, '52998224725');
    assert.equal(parsed.email, 'maria@example.com');
    assert.equal(parsed.cidade, 'Joinville');
    assert.equal(parsed.uf, 'SC');
    assert.equal(parsed.cep, '89200000');
    assert.equal(parsed.numero, '100');
});
