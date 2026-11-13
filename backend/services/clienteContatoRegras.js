// Regras dos contatos do cliente, sem banco. Quem grava é clienteContatoService.
const { erro, texto } = require('./analyticsComum');
const { chaveTelefone } = require('../utils/telefoneChave');

function telefoneUtil(raw) {
    const telefone = String(raw ?? '').replace(/\D/g, '');
    if (telefone.length < 10 || telefone.length > 13) return null;
    const chave = chaveTelefone(telefone);
    // DDD + 8 dígitos. Celular com 9º dígito cai na mesma chave de 10.
    if (chave.length !== 10) return null;
    return { telefone, chave };
}

function nomeChave(nome) {
    return String(nome || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function exigirAgente(agente) {
    const s = String(agente || '').trim();
    if (!s) throw erro(400, 'Informe o cabeçalho x-analytics-agent (qual agente está agindo).', 'AGENTE_OBRIGATORIO');
    if (s.length > 80 || !/^[\p{L}\p{N} ._:@-]{1,80}$/u.test(s)) {
        throw erro(400, 'x-analytics-agent inválido (até 80 caracteres: letras, números, espaço, . _ : @ -).', 'AGENTE_INVALIDO');
    }
    return s;
}

function lerInstante(v, nome) {
    if (v == null || String(v).trim() === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw erro(400, `${nome} não é uma data.`, 'DATA_INVALIDA');
    if (d.getTime() > Date.now() + 24 * 3600 * 1000) {
        throw erro(400, `${nome} está longe demais no futuro.`, 'DATA_INVALIDA');
    }
    if (d.getFullYear() < 2000) throw erro(400, `${nome} é antiga demais.`, 'DATA_INVALIDA');
    return d;
}

function lerOpcional(body, campo, max) {
    if (!Object.prototype.hasOwnProperty.call(body, campo)) return { presente: false, valor: undefined };
    return { presente: true, valor: texto(body[campo], max, { nome: campo }) };
}

/**
 * Lê o corpo de criar/atualizar. Telefone obrigatório só na criação (a API
 * de agentes e a tela). No PATCH, telefone ausente = não mexe no número.
 */
function lerEntrada(body, { telefoneObrigatorio = false } = {}) {
    const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nome = lerOpcional(src, 'nome', 120);
    const papel = lerOpcional(src, 'papel', 40);
    const nota = lerOpcional(src, 'nota', 500);
    let telefone = { presente: false, valor: null };
    if (telefoneObrigatorio || Object.prototype.hasOwnProperty.call(src, 'telefone')) {
        const info = telefoneUtil(src.telefone);
        if (!info) {
            throw erro(400, 'Telefone inválido. Informe DDD + número (com ou sem 55, com ou sem o 9).', 'TELEFONE_INVALIDO');
        }
        telefone = { presente: true, valor: info };
    }
    let ultimo = { presente: false, valor: undefined };
    if (Object.prototype.hasOwnProperty.call(src, 'ultimoContatoEm')) {
        ultimo = { presente: true, valor: lerInstante(src.ultimoContatoEm, 'ultimoContatoEm') };
    }
    return {
        nome: nome.presente ? nome.valor : null,
        nomePresente: nome.presente,
        papel,
        nota,
        telefone,
        ultimo,
    };
}

function dadosUpdate(entrada, incluirNome) {
    const dados = {};
    if (incluirNome && entrada.nomePresente) {
        dados.nome = entrada.nome;
        dados.nomeChave = nomeChave(entrada.nome);
    }
    if (entrada.papel.presente) dados.papel = entrada.papel.valor;
    if (entrada.nota.presente) dados.nota = entrada.nota.valor;
    if (entrada.ultimo.presente) dados.ultimoContatoEm = entrada.ultimo.valor;
    if (entrada.telefone.presente) {
        dados.telefone = entrada.telefone.valor.telefone;
        dados.telefoneChave = entrada.telefone.valor.chave;
    }
    return dados;
}

function dadosCreate(entrada) {
    return {
        nome: entrada.nome || null,
        nomeChave: nomeChave(entrada.nome),
        telefone: entrada.telefone.valor.telefone,
        telefoneChave: entrada.telefone.valor.chave,
        papel: entrada.papel.presente ? entrada.papel.valor : null,
        nota: entrada.nota.presente ? entrada.nota.valor : null,
        ultimoContatoEm: entrada.ultimo.presente ? entrada.ultimo.valor : null,
    };
}

function dadosPatch(entrada) {
    const dados = dadosUpdate(entrada, true);
    if (!Object.keys(dados).length) throw erro(400, 'Nada para gravar.', 'NADA_PARA_GRAVAR');
    return dados;
}

const porIdade = (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0);

/**
 * Decide se a gravação cria uma pessoa nova ou preenche uma que já existe.
 * Mesmo nome (sem acento, sem maiúscula) no mesmo número atualiza.
 * Nome novo no mesmo número cria outra pessoa.
 * Primeiro nome aprendido preenche o contato que ainda estava sem nome.
 * Sem nome, quando já existe pessoa nomeada naquele número: recusa (409).
 */
function decidirGravacao(existentes, entrada) {
    const lista = existentes || [];
    const chaveNome = nomeChave(entrada.nome);
    const semNome = lista.filter((c) => !nomeChave(c.nome));
    if (chaveNome) {
        const mesmo = lista.filter((c) => nomeChave(c.nome) === chaveNome);
        if (mesmo.length) {
            return { acao: 'atualizar', id: mesmo.sort(porIdade)[0].id, aprendeuNome: false, dados: dadosUpdate(entrada, true) };
        }
        if (semNome.length) {
            return { acao: 'atualizar', id: semNome.sort(porIdade)[0].id, aprendeuNome: true, dados: dadosUpdate(entrada, true) };
        }
        return { acao: 'criar', dados: dadosCreate(entrada) };
    }
    if (semNome.length) {
        return { acao: 'atualizar', id: semNome.sort(porIdade)[0].id, aprendeuNome: false, dados: dadosUpdate(entrada, false) };
    }
    if (lista.length) {
        const e = erro(409, 'Este WhatsApp já tem pessoa cadastrada. Informe o nome para atualizar ou para incluir outra pessoa.', 'INFORME_O_NOME');
        e.contatos = lista;
        throw e;
    }
    return { acao: 'criar', dados: dadosCreate(entrada) };
}

function temNonoDigito(telefone) {
    let d = String(telefone || '').replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    return d.length === 11;
}

function melhorNumero(a, b) {
    const an = temNonoDigito(a.telefone);
    const bn = temNonoDigito(b.telefone);
    if (an !== bn) return an;
    return a.prioridade < b.prioridade;
}

/** Um contato por chave, a partir dos telefones já gravados no cadastro. */
function telefonesDoCadastro({ Telefone, Telefone_Celular, Telefone_Comercial, numeros } = {}) {
    const itens = [];
    const push = (raw, prioridade) => {
        const info = telefoneUtil(raw);
        if (!info) return;
        itens.push({ ...info, prioridade });
    };
    push(Telefone_Celular, 1);
    for (const n of numeros || []) push(n, 2);
    push(Telefone, 3);
    push(Telefone_Comercial, 4);
    const porChave = new Map();
    for (const item of itens) {
        const atual = porChave.get(item.chave);
        if (!atual || melhorNumero(item, atual)) porChave.set(item.chave, item);
    }
    return [...porChave.values()];
}

function iso(d) {
    if (!d) return null;
    const x = d instanceof Date ? d : new Date(d);
    return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

function serializarContato(c) {
    return {
        id: c.id,
        clienteId: c.clienteUuid,
        nome: c.nome || null,
        telefone: c.telefone,
        papel: c.papel || null,
        nota: c.nota || null,
        ultimoContatoEm: iso(c.ultimoContatoEm),
        origem: c.origem || null,
        criadoPor: c.criadoPor || null,
        atualizadoPor: c.atualizadoPor || null,
        criadoEm: iso(c.createdAt),
        atualizadoEm: iso(c.updatedAt),
    };
}

function escolherFalarCom(contatos) {
    const comConversa = (contatos || []).filter((c) => nomeChave(c.nome) && c.ultimoContatoEm);
    if (!comConversa.length) return null;
    comConversa.sort((a, b) => new Date(b.ultimoContatoEm) - new Date(a.ultimoContatoEm));
    return comConversa[0];
}

function montarBlocoCliente(cliente, contatosRaw, extra = {}) {
    const data = [...(contatosRaw || [])].sort(ordenarContatos).map(serializarContato);
    const falarCom = escolherFalarCom(data);
    return {
        clienteId: cliente.UUID,
        nome: cliente.NomeFantasia || cliente.Nome,
        razaoSocial: cliente.Nome,
        ativo: cliente.Ativo !== false,
        cidade: cliente.End_Cidade || null,
        estado: cliente.End_Estado || null,
        falarCom,
        perguntarQuem: !falarCom,
        pessoas: data.filter((c) => c.nome),
        total: data.length,
        data,
        ...extra,
    };
}

function ordenarContatos(a, b) {
    const au = a.ultimoContatoEm ? new Date(a.ultimoContatoEm).getTime() : 0;
    const bu = b.ultimoContatoEm ? new Date(b.ultimoContatoEm).getTime() : 0;
    if (au !== bu) return bu - au;
    const an = nomeChave(a.nome);
    const bn = nomeChave(b.nome);
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    return an.localeCompare(bn, 'pt');
}

module.exports = {
    telefoneUtil,
    nomeChave,
    exigirAgente,
    lerInstante,
    lerEntrada,
    decidirGravacao,
    dadosPatch,
    telefonesDoCadastro,
    serializarContato,
    escolherFalarCom,
    montarBlocoCliente,
    ordenarContatos,
};
