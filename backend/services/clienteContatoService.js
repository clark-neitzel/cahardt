// Contatos (pessoas) do cliente. A tabela não substitui Telefone / Telefone_Celular:
// aqueles campos continuam sendo o número da empresa. Aqui fica quem atende.
const crypto = require('crypto');
const prisma = require('../config/database');
const { erro, idOpcional } = require('./analyticsComum');
const { chaveTelefone } = require('../utils/telefoneChave');
const regras = require('./clienteContatoRegras');
const historico = require('./clienteHistoricoService');

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

function resumoHistorico(row) {
    return [row.nome, row.telefone, row.papel].filter(Boolean).join(' · ');
}

// Histórico de alterações (cliente_alteracoes). Best-effort: nunca lança.
function telaDoAtor(ator) {
    return ator?.agente ? 'API /analytics/v1' : (ator?.tela || 'Cadastro > Pessoas do WhatsApp');
}

function historicoCriado(row, ator) {
    return historico.registrarEvento({
        clienteId: row.clienteUuid, entidade: 'contato', entidadeId: row.id, acao: 'criado',
        ator, tela: telaDoAtor(ator), resumo: resumoHistorico(row),
    });
}

function historicoDiff(antes, depois, ator) {
    return historico.registrarDiff({
        clienteId: depois.clienteUuid, entidade: 'contato', entidadeId: depois.id,
        ator, tela: telaDoAtor(ator), antes, depois, campos: historico.CAMPOS_CONTATO,
    });
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
    // As duas fontes juntas. Se a busca parasse no primeiro contato, um segundo
    // cliente com o mesmo número só no cadastro (migração no meio, contato apagado
    // na ficha, telefone gravado por fora) sumiria — e a Ana escolheria a empresa errada.
    const [rows, legado] = await Promise.all([
        prisma.clienteContato.findMany({
            where: { telefoneChave: info.chave },
            include: { cliente: { select: SEL_CLIENTE } },
        }),
        clientesDoCadastroPorChave(info.chave),
    ]);
    const map = new Map();
    for (const row of rows) {
        if (!row.cliente) continue;
        const id = row.cliente.UUID;
        if (!map.has(id)) map.set(id, { cliente: row.cliente, contatos: [] });
        map.get(id).contatos.push(row);
    }
    for (const c of legado) {
        if (!map.has(c.UUID)) map.set(c.UUID, { cliente: c, contatos: [] });
    }
    const data = [...map.values()].map((g) => regras.montarBlocoCliente(g.cliente, g.contatos, {
        telefoneNoCadastro: g.contatos.length === 0,
    }));
    data.sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt');
    });
    return { telefone: info.telefone, chave: info.chave, encontrados: data.length, data };
}

function enriquecerInformeNome(e) {
    if (e?.codigo === 'INFORME_O_NOME' && Array.isArray(e.contatos)) {
        e.contatos = e.contatos.map(regras.serializarContato);
        e.pessoas = e.contatos.filter((c) => c.nome);
    }
    return e;
}

async function gravar(clienteId, body, ator) {
    const cliente = await exigirCliente(clienteId);
    const entrada = regras.lerEntrada(body, { telefoneObrigatorio: true });
    const quem = rotuloAtor(ator);
    // Duas Anas podem aprender nomes diferentes ao mesmo tempo no contato sem nome.
    // Quem chega depois não sobrescreve: a linha só é preenchida se ainda estiver
    // sem nome. Se outra pessoa já tomou a vaga, a decisão é refeita.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
        const existentes = await prisma.clienteContato.findMany({
            where: { clienteUuid: cliente.UUID, telefoneChave: entrada.telefone.valor.chave },
        });
        let decisao;
        try {
            decisao = regras.decidirGravacao(existentes, entrada);
        } catch (e) {
            throw enriquecerInformeNome(e);
        }
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
                await historicoCriado(row, ator);
                return {
                    status: 201,
                    contato: regras.serializarContato(row),
                    criado: true,
                    atualizado: false,
                    aprendeuNome: false,
                    agente: ator?.agente || null,
                };
            } catch (e) {
                if (e.code === 'P2002') continue;
                throw e;
            }
        }
        if (decisao.aprendeuNome) {
            let claimed;
            try {
                claimed = await prisma.clienteContato.updateMany({
                    where: { id: decisao.id, nomeChave: '' },
                    data: { ...decisao.dados, atualizadoPor: quem },
                });
            } catch (e) {
                if (e.code === 'P2002') continue;
                throw e;
            }
            if (!claimed || claimed.count !== 1) continue;
            const row = await prisma.clienteContato.findUnique({ where: { id: decisao.id } });
            if (!row) continue;
            await auditar('CONTATO_ATUALIZADO', row.id, { ...resumir(row), aprendeuNome: true }, ator);
            await historicoDiff(existentes.find((e) => e.id === row.id) || {}, row, ator);
            return {
                status: 200,
                contato: regras.serializarContato(row),
                criado: false,
                atualizado: true,
                aprendeuNome: true,
                agente: ator?.agente || null,
            };
        }
        try {
            const row = await prisma.clienteContato.update({
                where: { id: decisao.id },
                data: { ...decisao.dados, atualizadoPor: quem },
            });
            await auditar('CONTATO_ATUALIZADO', row.id, { ...resumir(row), aprendeuNome: false }, ator);
            await historicoDiff(existentes.find((e) => e.id === row.id) || {}, row, ator);
            return {
                status: 200,
                contato: regras.serializarContato(row),
                criado: false,
                atualizado: true,
                aprendeuNome: false,
                agente: ator?.agente || null,
            };
        } catch (e) {
            if (e.code === 'P2002') continue;
            throw e;
        }
    }
    throw erro(409, 'Não deu para gravar o contato agora. Tente de novo.', 'CONTATO_EM_DISPUTA');
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
    await historicoDiff(atual, row, ator);
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
    await historicoDiff(atual, row, ator);
    return { contato: regras.serializarContato(row), agente: ator?.agente || null };
}

async function excluir(contatoId, ator, clienteId) {
    const atual = await acharContato(contatoId, clienteId);
    await prisma.clienteContato.delete({ where: { id: atual.id } });
    await auditar('CONTATO_EXCLUIDO', atual.id, resumir(atual), ator);
    await historico.registrarEvento({
        clienteId: atual.clienteUuid, entidade: 'contato', entidadeId: atual.id, acao: 'excluido',
        ator, tela: telaDoAtor(ator), resumo: resumoHistorico(atual),
    });
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
            const novoId = crypto.randomUUID();
            await prisma.clienteContato.create({
                data: {
                    id: novoId,
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
            // A varredura de migração (origem MIGRACAO) não entra: são milhares de linhas
            // criadas pelo sistema, sem ninguém para responsabilizar.
            if (origem !== 'MIGRACAO') {
                await historico.registrarEvento({
                    clienteId: clienteUuid, entidade: 'contato', entidadeId: novoId, acao: 'criado',
                    ator, tela: 'Cadastro > telefone do cliente', resumo: t.telefone,
                });
            }
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
