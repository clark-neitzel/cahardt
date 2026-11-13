// Contatos (pessoas) do cliente. A tabela não substitui Telefone / Telefone_Celular:
// aqueles campos continuam sendo o número da empresa. Aqui fica quem atende.
const crypto = require('crypto');
const prisma = require('../config/database');
const { erro, idOpcional } = require('./analyticsComum');
const { chaveTelefone } = require('../utils/telefoneChave');
const regras = require('./clienteContatoRegras');

const CHAVE_MIGRACAO = 'cliente_contatos_migracao_v1';

const SEL_CLIENTE = {
    UUID: true,
    Nome: true,
    NomeFantasia: true,
    Ativo: true,
    End_Cidade: true,
    End_Estado: true,
};

function rotuloAtor(ator) {
    return String(ator?.agente || ator?.nome || 'desconhecido').slice(0, 180);
}

async function auditar(acao, entidadeId, detalhes, ator) {
    try {
        await prisma.auditLog.create({
            data: {
                acao,
                entidade: 'ClienteContato',
                entidadeId: String(entidadeId || '-').slice(0, 80),
                detalhes: JSON.stringify(detalhes).slice(0, 8000),
                usuarioId: (ator?.agente ? `agente:${ator.agente}` : (ator?.id || '-')).slice(0, 180),
                usuarioNome: rotuloAtor(ator),
            },
        });
    } catch (e) {
        console.error('[ClienteContato] falha ao gravar AuditLog (operação já efetivada):', e.message);
    }
}

async function exigirCliente(id) {
    const clienteId = idOpcional(id, 'clienteId');
    if (!clienteId) throw erro(400, 'Informe o cliente.', 'ID_INVALIDO');
    const c = await prisma.cliente.findUnique({ where: { UUID: clienteId }, select: SEL_CLIENTE });
    if (!c) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    return c;
}

async function acharContato(contatoId, clienteId) {
    const id = idOpcional(contatoId, 'contato');
    if (!id) throw erro(400, 'Informe o contato.', 'ID_INVALIDO');
    const row = await prisma.clienteContato.findUnique({ where: { id } });
    if (!row || (clienteId && row.clienteUuid !== clienteId)) {
        throw erro(404, 'Contato não encontrado.', 'NAO_ENCONTRADO');
    }
    return row;
}

function resumir(row) {
    return {
        clienteId: row.clienteUuid,
        nome: row.nome || null,
        telefone: row.telefone,
        papel: row.papel || null,
    };
}

async function listar(clienteId) {
    const cliente = await exigirCliente(clienteId);
    const rows = await prisma.clienteContato.findMany({ where: { clienteUuid: cliente.UUID } });
    rows.sort(regras.ordenarContatos);
    return regras.montarBlocoCliente(cliente, rows);
}

async function clientesDoCadastroPorChave(chave) {
    const candidatos = await prisma.cliente.findMany({
        where: {
            OR: [
                { Telefone: { not: null } },
                { Telefone_Celular: { not: null } },
                { Telefone_Comercial: { not: null } },
                { whatsapp: { isNot: null } },
            ],
        },
        select: {
            ...SEL_CLIENTE,
            Telefone: true,
            Telefone_Celular: true,
            Telefone_Comercial: true,
            whatsapp: { select: { numeros: true } },
        },
    });
    return candidatos.filter((c) =>
        chaveTelefone(c.Telefone) === chave
        || chaveTelefone(c.Telefone_Celular) === chave
        || chaveTelefone(c.Telefone_Comercial) === chave
        || (c.whatsapp?.numeros || []).some((n) => chaveTelefone(n) === chave)
    );
}

async function buscarPorTelefone(telefoneRaw) {
    const info = regras.telefoneUtil(telefoneRaw);
    if (!info) {
        throw erro(400, 'Telefone inválido. Informe DDD + número (com ou sem 55, com ou sem o 9).', 'TELEFONE_INVALIDO');
    }
    const rows = await prisma.clienteContato.findMany({
        where: { telefoneChave: info.chave },
        include: { cliente: { select: SEL_CLIENTE } },
    });
    let data;
    if (rows.length) {
        const map = new Map();
        for (const row of rows) {
            if (!row.cliente) continue;
            const id = row.cliente.UUID;
            if (!map.has(id)) map.set(id, { cliente: row.cliente, contatos: [] });
            map.get(id).contatos.push(row);
        }
        data = [...map.values()].map((g) => regras.montarBlocoCliente(g.cliente, g.contatos, { telefoneNoCadastro: false }));
    } else {
        const legado = await clientesDoCadastroPorChave(info.chave);
        data = legado.map((c) => regras.montarBlocoCliente(c, [], { telefoneNoCadastro: true }));
    }
    data.sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt');
    });
    return { telefone: info.telefone, chave: info.chave, encontrados: data.length, data };
}

async function gravar(clienteId, body, ator) {
    const cliente = await exigirCliente(clienteId);
    const entrada = regras.lerEntrada(body, { telefoneObrigatorio: true });
    const existentes = await prisma.clienteContato.findMany({
        where: { clienteUuid: cliente.UUID, telefoneChave: entrada.telefone.valor.chave },
    });
    let decisao;
    try {
        decisao = regras.decidirGravacao(existentes, entrada);
    } catch (e) {
        if (e.codigo === 'INFORME_O_NOME' && Array.isArray(e.contatos)) {
            e.contatos = e.contatos.map(regras.serializarContato);
            e.pessoas = e.contatos.filter((c) => c.nome);
        }
        throw e;
    }
    const quem = rotuloAtor(ator);
    if (decisao.acao === 'criar') {
        try {
            const row = await prisma.clienteContato.create({
                data: {
                    id: crypto.randomUUID(),
                    clienteUuid: cliente.UUID,
                    ...decisao.dados,
                    origem: ator?.agente ? 'AGENTE' : 'CADASTRO',
                    criadoPor: quem,
                    atualizadoPor: quem,
                },
            });
            await auditar('CONTATO_CRIADO', row.id, resumir(row), ator);
            return {
                status: 201,
                contato: regras.serializarContato(row),
                criado: true,
                atualizado: false,
                aprendeuNome: false,
                agente: ator?.agente || null,
            };
        } catch (e) {
            if (e.code !== 'P2002') throw e;
            const deNovo = await prisma.clienteContato.findMany({
                where: { clienteUuid: cliente.UUID, telefoneChave: entrada.telefone.valor.chave },
            });
            let segunda;
            try {
                segunda = regras.decidirGravacao(deNovo, entrada);
            } catch (err) {
                if (err.codigo === 'INFORME_O_NOME' && Array.isArray(err.contatos)) {
                    err.contatos = err.contatos.map(regras.serializarContato);
                    err.pessoas = err.contatos.filter((c) => c.nome);
                }
                throw err;
            }
            if (segunda.acao !== 'atualizar') {
                throw erro(409, 'Já existe uma pessoa com esse nome neste WhatsApp.', 'CONTATO_REPETIDO');
            }
            decisao = segunda;
        }
    }
    let row;
    try {
        row = await prisma.clienteContato.update({
            where: { id: decisao.id },
            data: { ...decisao.dados, atualizadoPor: quem },
        });
    } catch (e) {
        if (e.code === 'P2002') throw erro(409, 'Já existe uma pessoa com esse nome neste WhatsApp.', 'CONTATO_REPETIDO');
        throw e;
    }
    await auditar('CONTATO_ATUALIZADO', row.id, { ...resumir(row), aprendeuNome: !!decisao.aprendeuNome }, ator);
    return {
        status: 200,
        contato: regras.serializarContato(row),
        criado: false,
        atualizado: true,
        aprendeuNome: !!decisao.aprendeuNome,
        agente: ator?.agente || null,
    };
}

async function atualizar(contatoId, body, ator, clienteId) {
    const atual = await acharContato(contatoId, clienteId || null);
    const entrada = regras.lerEntrada(body, { telefoneObrigatorio: false });
    const dados = regras.dadosPatch(entrada);
    let row;
    try {
        row = await prisma.clienteContato.update({
            where: { id: atual.id },
            data: { ...dados, atualizadoPor: rotuloAtor(ator) },
        });
    } catch (e) {
        if (e.code === 'P2002') throw erro(409, 'Já existe uma pessoa com esse nome neste WhatsApp.', 'CONTATO_REPETIDO');
        throw e;
    }
    await auditar('CONTATO_ATUALIZADO', row.id, resumir(row), ator);
    return { contato: regras.serializarContato(row), agente: ator?.agente || null };
}

async function registrarConversa(contatoId, body, ator) {
    const atual = await acharContato(contatoId, null);
    const src = body && typeof body === 'object' ? body : {};
    const em = Object.prototype.hasOwnProperty.call(src, 'em')
        ? regras.lerInstante(src.em, 'em')
        : new Date();
    if (!em) throw erro(400, 'Informe em (data) ou omita para usar agora.', 'DATA_INVALIDA');
    const row = await prisma.clienteContato.update({
        where: { id: atual.id },
        data: { ultimoContatoEm: em, atualizadoPor: rotuloAtor(ator) },
    });
    await auditar('CONTATO_CONVERSA', row.id, {
        ...resumir(row),
        ultimoContatoEm: em.toISOString(),
    }, ator);
    return { contato: regras.serializarContato(row), agente: ator?.agente || null };
}

async function excluir(contatoId, ator, clienteId) {
    const atual = await acharContato(contatoId, clienteId);
    await prisma.clienteContato.delete({ where: { id: atual.id } });
    await auditar('CONTATO_EXCLUIDO', atual.id, resumir(atual), ator);
    return { ok: true, id: atual.id };
}

/**
 * Garante um contato sem nome para cada telefone do cadastro que ainda não
 * tem nenhuma pessoa. Não apaga contato e não tira nome que a Ana já gravou.
 */
async function garantirTelefonesDoCadastro(clienteUuid, fontes, ator = {}, { origem = 'CADASTRO' } = {}) {
    const telefones = regras.telefonesDoCadastro(fontes);
    if (!telefones.length) return { criados: 0 };
    const existentes = await prisma.clienteContato.findMany({
        where: { clienteUuid },
        select: { telefoneChave: true },
    });
    const chaves = new Set(existentes.map((e) => e.telefoneChave));
    let criados = 0;
    const quem = ator?.nome || ator?.agente || null;
    for (const t of telefones) {
        if (chaves.has(t.chave)) continue;
        try {
            await prisma.clienteContato.create({
                data: {
                    id: crypto.randomUUID(),
                    clienteUuid,
                    nome: null,
                    nomeChave: '',
                    telefone: t.telefone,
                    telefoneChave: t.chave,
                    origem,
                    criadoPor: quem,
                    atualizadoPor: quem,
                },
            });
            criados += 1;
            chaves.add(t.chave);
        } catch (e) {
            if (e.code !== 'P2002') throw e;
        }
    }
    return { criados };
}

/**
 * Copia, uma vez, os telefones já gravados no cadastro para contatos sem nome.
 * O deploy usa `prisma db push`, que cria a tabela e não roda SQL de dados —
 * por isso a cópia mora aqui e recomeça do cliente em que parou.
 */
async function migrarTelefonesExistentes({ lote = 150 } = {}) {
    const flag = await prisma.appConfig.findUnique({ where: { key: CHAVE_MIGRACAO } });
    const anterior = (flag && typeof flag.value === 'object' && flag.value) || {};
    if (anterior.feito === true) return { jaFeito: true, criados: anterior.criados || 0, vistos: anterior.vistos || 0 };

    let cursor = anterior.cursor || null;
    let criados = Number(anterior.criados) || 0;
    let vistos = Number(anterior.vistos) || 0;

    for (;;) {
        const clientes = await prisma.cliente.findMany({
            where: cursor ? { UUID: { gt: cursor } } : {},
            orderBy: { UUID: 'asc' },
            take: lote,
            select: {
                UUID: true,
                Telefone: true,
                Telefone_Celular: true,
                Telefone_Comercial: true,
                whatsapp: { select: { numeros: true } },
            },
        });
        if (!clientes.length) break;
        for (const c of clientes) {
            const r = await garantirTelefonesDoCadastro(c.UUID, {
                Telefone: c.Telefone,
                Telefone_Celular: c.Telefone_Celular,
                Telefone_Comercial: c.Telefone_Comercial,
                numeros: c.whatsapp?.numeros || [],
            }, { nome: null }, { origem: 'MIGRACAO' });
            criados += r.criados;
            vistos += 1;
            cursor = c.UUID;
        }
        await prisma.appConfig.upsert({
            where: { key: CHAVE_MIGRACAO },
            update: { value: { feito: false, cursor, criados, vistos } },
            create: { key: CHAVE_MIGRACAO, value: { feito: false, cursor, criados, vistos } },
        });
    }

    const fim = { feito: true, cursor, criados, vistos, em: new Date().toISOString() };
    await prisma.appConfig.upsert({
        where: { key: CHAVE_MIGRACAO },
        update: { value: fim },
        create: { key: CHAVE_MIGRACAO, value: fim },
    });
    return { jaFeito: false, criados, vistos };
}

module.exports = {
    listar,
    buscarPorTelefone,
    gravar,
    atualizar,
    registrarConversa,
    excluir,
    garantirTelefonesDoCadastro,
    migrarTelefonesExistentes,
};
