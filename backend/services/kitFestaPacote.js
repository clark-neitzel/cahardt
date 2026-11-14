// Identifica item "pacote" no catálogo do Kit Festa (ex.: linha G-MINI 500 g)
// e conta só as CAIXAS para o mínimo do pedido e para o minCaixas do cupom.
//
// Como o Clarkson deve cadastrar (aba Kit Festa dos pedidos online):
//   1. Criar a categoria/grupo "Congelados" — o slug deve ficar "congelados".
//   2. Adicionar os 6 pacotes G-MINI 500 g nessa categoria.
//   3. Preço Kit Festa = 15,00 (não deixar em branco: o sistema usaria o
//      valorVenda do produto, que não é R$ 15).
//   4. Unidades por caixa = 1 (não deixar 25).
//
// Um item conta como PACOTE se QUALQUER uma destas for verdadeira:
//   - a categoria tem slug "congelados" (ou contém "congelado");
//   - unidadesPorCaixa === 1.
// Pacotes NÃO entram na contagem do mínimo de 4 caixas nem do cupom.

const SLUG_CONGELADOS = 'congelados';
const UNIDADE_PACOTE = 'pacote 500 g';
const TAG_ENCAIXE = '[ENCAIXE]';
const TAG_CADASTRO = '[CADASTRO]';

function slugCategoria(kp) {
    const c = kp?.categoria;
    if (c && typeof c === 'object') {
        return String(c.slug || c.Slug || '').trim().toLowerCase();
    }
    return String(kp?.categoriaSlug || kp?.categoria || '').trim().toLowerCase();
}

function ehPacoteKitFesta(kp) {
    if (!kp) return false;
    if (kp.pacote === true) return true;
    const slug = slugCategoria(kp);
    if (slug === SLUG_CONGELADOS || slug.includes('congelado')) return true;
    const un = Number(kp.unidadesPorCaixa ?? kp.unidades);
    return Number.isFinite(un) && un === 1;
}

function rotuloUnidade(kp) {
    if (ehPacoteKitFesta(kp)) return UNIDADE_PACOTE;
    const un = Number(kp?.unidadesPorCaixa ?? kp?.unidades) || 25;
    return `caixa de ${un}`;
}

function quantidadeCaixasParaMinimo(itens, resolverProduto) {
    let caixas = 0;
    let pacotes = 0;
    for (const it of itens || []) {
        const qtd = parseInt(it.quantidade, 10) || 0;
        if (qtd <= 0) continue;
        const prod = typeof resolverProduto === 'function' ? resolverProduto(it) : (it.produto || it);
        if (ehPacoteKitFesta(prod) || ehPacoteKitFesta(it)) pacotes += qtd;
        else caixas += qtd;
    }
    return { caixas, pacotes, totalItens: caixas + pacotes };
}

function textoResumoQuantidades({ caixas, pacotes }) {
    const partes = [];
    if (caixas > 0) partes.push(`${caixas} caixa${caixas === 1 ? '' : 's'}`);
    if (pacotes > 0) partes.push(`${pacotes} pacote${pacotes === 1 ? '' : 's'}`);
    return partes.join(' + ') || '0 caixas';
}

function marcarEncaixe(observacoes) {
    const atual = String(observacoes || '').trim();
    if (atual.includes(TAG_ENCAIXE)) return atual;
    const aviso = `${TAG_ENCAIXE} Horário estava cheio; o pedido só vale depois que a equipe confirmar.`;
    return atual ? `${aviso} ${atual}` : aviso;
}

function temEncaixe(observacoes) {
    return String(observacoes || '').includes(TAG_ENCAIXE);
}

function formatarBlocoCadastro(dados = {}) {
    const linhas = [];
    const endPartes = [
        dados.logradouro,
        dados.numero ? `nº ${dados.numero}` : null,
        dados.complemento || null,
        dados.bairro || null,
        (dados.cidade && dados.uf) ? `${dados.cidade}/${dados.uf}` : (dados.cidade || dados.uf || null),
        dados.cep ? `CEP ${String(dados.cep).replace(/\D/g, '')}` : null,
    ].filter(Boolean);
    if (dados.nome) linhas.push(`Nome: ${dados.nome}`);
    if (dados.cpf) linhas.push(`CPF/CNPJ: ${dados.cpf}`);
    if (dados.telefone) linhas.push(`Telefone: ${dados.telefone}`);
    if (endPartes.length) linhas.push(`Endereço: ${endPartes.join(', ')}`);
    if (dados.email) linhas.push(`E-mail: ${dados.email}`);
    if (dados.extra) linhas.push(String(dados.extra));
    if (!linhas.length) return '';
    return `${TAG_CADASTRO}\n${linhas.join('\n')}`;
}

function mesclarObservacoesCadastro(observacoes, dados) {
    const bloco = formatarBlocoCadastro(dados);
    if (!bloco) return String(observacoes || '').trim() || null;
    const atual = String(observacoes || '').trim();
    if (!atual) return bloco;
    if (atual.includes(TAG_CADASTRO)) {
        return `${atual.replace(/\[CADASTRO\][\s\S]*$/m, '').trim()}\n${bloco}`.trim();
    }
    return `${atual}\n${bloco}`;
}

function parsearBlocoCadastro(observacoes) {
    const texto = String(observacoes || '');
    const idx = texto.indexOf(TAG_CADASTRO);
    if (idx < 0) return null;
    const bloco = texto.slice(idx + TAG_CADASTRO.length).trim();
    const pegar = (rotulo) => {
        const m = bloco.match(new RegExp(`${rotulo}:\\s*([^\n]+)`, 'i'));
        return m ? m[1].trim() : null;
    };
    const end = pegar('Endereço');
    const parsed = { nome: pegar('Nome'), cpf: pegar('CPF/CNPJ'), telefone: pegar('Telefone'), email: pegar('E-mail'), enderecoTexto: end };
    if (end) {
        const cep = end.match(/CEP\s*(\d{8}|\d{5}-?\d{3})/i);
        if (cep) parsed.cep = cep[1].replace(/\D/g, '');
        const cidUf = end.match(/([^,/]+)\s*\/\s*([A-Za-z]{2})\b/);
        if (cidUf) { parsed.cidade = cidUf[1].trim(); parsed.uf = cidUf[2].toUpperCase(); }
        const num = end.match(/n[ºo°]?\s*([0-9A-Za-z\-]+)/i);
        if (num) parsed.numero = num[1];
    }
    return parsed;
}

module.exports = {
    SLUG_CONGELADOS,
    UNIDADE_PACOTE,
    TAG_ENCAIXE,
    TAG_CADASTRO,
    slugCategoria,
    ehPacoteKitFesta,
    rotuloUnidade,
    quantidadeCaixasParaMinimo,
    textoResumoQuantidades,
    marcarEncaixe,
    temEncaixe,
    formatarBlocoCadastro,
    mesclarObservacoesCadastro,
    parsearBlocoCadastro,
};
