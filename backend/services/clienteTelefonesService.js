// Telefones do cliente para WhatsApp: lista única (cadastro + pessoas do WhatsApp), na ORDEM
// PREFERIDA, com a situação de cada número e a pendência "Telefone incompleto" (nov/2026).
//
// Regras (pedido do Clarkson, 13/11):
//  - "É necessário ter 55?" A Z-API exige 55 + DDD + número. Quem tem DDD + número recebe o 55 na
//    hora (status 'normalizado', não incomoda ninguém). Sem DDD / DDD inexistente / dígitos errados /
//    "55 no lugar do DDD" = 'incompleto' → aparece em "Cadastros pra acertar" para a Leticia acertar.
//  - Cliente com 2+ números: a equipe escolhe a ORDEM (o 1º é o preferido). O bot tenta o preferido
//    primeiro; sem resposta, passa pro próximo. O número que respondeu fica marcado como "funcionando"
//    e o bot começa por ele na próxima vez.
//  - A ordem fica em `cliente_telefone_preferencia` (tabela lateral, sem FK — `clientes` está no teto
//    de colunas). Toda troca vai para o histórico de alterações.
const prisma = require('../config/database');
const { erro, idOpcional } = require('./analyticsComum');
const { chaveTelefone } = require('../utils/telefoneChave');
const { avaliarTelefone } = require('../utils/telefoneWhatsapp');
const historico = require('./clienteHistoricoService');

const TELA = 'Cadastro > Telefones do WhatsApp';
const MAX_ORDEM = 20;

// Ordem padrão (sem preferência gravada): celular, números de WhatsApp do cadastro, telefone,
// comercial e depois as pessoas do WhatsApp (contato com conversa mais recente primeiro).
const FONTES = {
    celular: 'Celular',
    whatsapp: 'WhatsApp do cadastro',
    telefone: 'Telefone',
    comercial: 'Telefone comercial',
    contato: 'Pessoa do WhatsApp',
};

const final4 = (n) => String(n || '').replace(/\D/g, '').slice(-4);
const chaveDe = (raw) => chaveTelefone(raw) || String(raw ?? '').replace(/\D/g, '');

/**
 * Pura. Monta a lista de telefones do cliente.
 *  cli: { Telefone, Telefone_Celular, Telefone_Comercial, End_Estado, whatsapp: { numeros } }
 *  contatos: linhas de cliente_contatos ({ id, nome, telefone, ultimoContatoEm })
 *  pref: linha de cliente_telefone_preferencia (ou null)
 * Devolve { telefones: [...], preferido, funcionando, pendencia }.
 */
function montarTelefones(cli, contatos = [], pref = null) {
    const c = cli || {};
    const uf = c.End_Estado || null;
    const porChave = new Map();
    const ordemPadrao = [];
    const add = (raw, fonte, extra = {}) => {
        const bruto = String(raw ?? '').trim();
        if (!bruto || !bruto.replace(/\D/g, '')) return;
        const chave = chaveDe(bruto);
        let item = porChave.get(chave);
        if (!item) {
            const av = avaliarTelefone(bruto, { uf });
            item = {
                chave,
                numero: av.numero,                 // 55 + DDD + número (o que vai para a Z-API) ou null
                bruto,                             // como está no cadastro
                final: final4(bruto),
                status: av.status,                 // ok | normalizado | incompleto
                valido: !!av.numero,
                motivo: av.motivo,
                rotuloMotivo: av.rotulo,
                fontes: [],
                pessoas: [],
            };
            porChave.set(chave, item);
            ordemPadrao.push(chave);
        }
        if (!item.fontes.includes(fonte)) item.fontes.push(fonte);
        if (extra.pessoa && !item.pessoas.includes(extra.pessoa)) item.pessoas.push(extra.pessoa);
        if (extra.contatoId && !item.contatoId) item.contatoId = extra.contatoId;
    };
    add(c.Telefone_Celular, 'celular');
    for (const n of c.whatsapp?.numeros || []) add(n, 'whatsapp');
    add(c.Telefone, 'telefone');
    add(c.Telefone_Comercial, 'comercial');
    const contatosOrd = [...(contatos || [])].sort((a, b) => {
        const au = a.ultimoContatoEm ? new Date(a.ultimoContatoEm).getTime() : 0;
        const bu = b.ultimoContatoEm ? new Date(b.ultimoContatoEm).getTime() : 0;
        return bu - au;
    });
    for (const p of contatosOrd) add(p.telefone, 'contato', { pessoa: p.nome || null, contatoId: p.id });

    // ordem: a preferida (só chaves que ainda existem), depois o resto na ordem padrão
    const gravada = (pref?.ordem || []).filter((k) => porChave.has(k));
    const ordem = [...new Set([...gravada, ...ordemPadrao])];
    const funcionandoChave = pref?.funcionandoChave && porChave.has(pref.funcionandoChave) ? pref.funcionandoChave : null;
    const telefones = ordem.map((k, i) => ({
        ...porChave.get(k),
        ordem: i + 1,
        preferencial: false,
        funcionando: k === funcionandoChave,
        funcionandoEm: k === funcionandoChave && pref?.funcionandoEm ? new Date(pref.funcionandoEm).toISOString() : null,
    }));
    // preferido = o 1º número VÁLIDO da ordem (número incompleto nunca é o preferido)
    const pref1 = telefones.find((t) => t.valido) || null;
    if (pref1) pref1.preferencial = true;
    return {
        telefones,
        ordemDefinida: gravada.length > 0,
        preferido: pref1 ? pref1.numero : null,
        funcionando: telefones.find((t) => t.funcionando)?.numero || null,
        pendencia: pendenciaTelefone(telefones),
    };
}

/** Pura. { campo: 'telefoneIncompleto', rotulo, numeros: [{ bruto, final, motivo, rotuloMotivo }] } ou null. */
function pendenciaTelefone(telefones) {
    const ruins = (telefones || []).filter((t) => t.status === 'incompleto');
    if (!ruins.length) return null;
    return {
        campo: 'telefoneIncompleto',
        rotulo: 'Telefone incompleto',
        semNumeroValido: !(telefones || []).some((t) => t.valido),
        numeros: ruins.map((t) => ({ bruto: t.bruto, final: t.final, motivo: t.motivo, rotuloMotivo: t.rotuloMotivo })),
    };
}

/** Lê a preferência; se a tabela ainda não existe (deploy no meio) devolve null sem quebrar. */
async function lerPreferencia(clienteId) {
    try {
        return await prisma.clienteTelefonePreferencia.findUnique({ where: { clienteId } });
    } catch (e) {
        console.error('[ClienteTelefones] preferência indisponível, usando a ordem padrão:', e?.message || e);
        return null;
    }
}

const SEL_TEL = {
    UUID: true, Nome: true, NomeFantasia: true, Ativo: true, End_Estado: true,
    Telefone: true, Telefone_Celular: true, Telefone_Comercial: true,
    whatsapp: { select: { numeros: true } },
};

async function exigirCliente(clienteId) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const cli = await prisma.cliente.findUnique({ where: { UUID: id }, select: SEL_TEL });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    return cli;
}

/** GET — lista ordenada (o 1º válido é o preferido). */
async function listar(clienteId) {
    const cli = await exigirCliente(clienteId);
    const [contatos, pref] = await Promise.all([
        prisma.clienteContato.findMany({ where: { clienteUuid: cli.UUID }, select: { id: true, nome: true, telefone: true, ultimoContatoEm: true } }),
        lerPreferencia(cli.UUID),
    ]);
    return { clienteId: cli.UUID, nome: cli.NomeFantasia || cli.Nome, ...montarTelefones(cli, contatos, pref) };
}

function quemDe(ator) {
    const porAgente = !!ator?.agente;
    return {
        porAgente,
        dados: {
            atualizadoPorTipo: porAgente ? 'agente' : 'usuario',
            atualizadoPorId: porAgente ? `agente:${String(ator.agente).slice(0, 80)}` : (ator?.id ? String(ator.id).slice(0, 80) : null),
            atualizadoPorNome: String(porAgente ? ator.agente : (ator?.nome || ator?.login || 'desconhecido')).slice(0, 180),
        },
        historico: porAgente ? { agente: ator.agente } : { id: ator?.id || null, nome: ator?.nome || ator?.login || null },
    };
}

const resumoOrdem = (lista) => lista.map((t, i) => `${i + 1}º …${t.final}`).join(', ') || null;

/**
 * PUT — grava a ordem. body.ordem: lista de números (como digitados, com ou sem 55/9) ou de chaves;
 * o 1º é o preferido. Número que não é do cliente → 400. Lista vazia → volta à ordem padrão.
 */
async function definirOrdem(clienteId, body, ator) {
    const cli = await exigirCliente(clienteId);
    const bruta = body?.ordem;
    if (!Array.isArray(bruta)) throw erro(400, 'Envie "ordem": a lista dos números, o preferido primeiro.', 'ORDEM_INVALIDA');
    if (bruta.length > MAX_ORDEM) throw erro(400, `No máximo ${MAX_ORDEM} números.`, 'ORDEM_INVALIDA');
    const atual = await listar(cli.UUID);
    const doCliente = new Map(atual.telefones.map((t) => [t.chave, t]));
    const chaves = [];
    for (const n of bruta) {
        const k = chaveDe(n);
        if (!k || !doCliente.has(k)) throw erro(400, `O número …${final4(n)} não está no cadastro deste cliente.`, 'TELEFONE_NAO_E_DO_CLIENTE');
        if (!chaves.includes(k)) chaves.push(k);
    }
    const antesTxt = atual.ordemDefinida ? resumoOrdem(atual.telefones) : 'ordem padrão';
    const quem = quemDe(ator);
    if (!chaves.length) {
        await prisma.clienteTelefonePreferencia.updateMany({ where: { clienteId: cli.UUID }, data: { ordem: [], ...quem.dados } });
    } else {
        await prisma.clienteTelefonePreferencia.upsert({
            where: { clienteId: cli.UUID },
            create: { clienteId: cli.UUID, ordem: chaves, ...quem.dados },
            update: { ordem: chaves, ...quem.dados },
        });
    }
    const depois = await listar(cli.UUID);
    const depoisTxt = chaves.length ? resumoOrdem(depois.telefones) : 'ordem padrão';
    if (antesTxt !== depoisTxt) {
        await historico.registrar({
            clienteId: cli.UUID, ator: quem.historico, tela: quem.porAgente ? 'API /analytics/v1' : TELA,
            mudancas: [{ campo: 'ordemTelefones', de: antesTxt, para: depoisTxt }],
        });
    }
    return depois;
}

/** POST (bot) — o número respondeu no WhatsApp: vira o "funcionando" (o bot começa por ele). */
async function marcarFuncionando(clienteId, body, ator) {
    const cli = await exigirCliente(clienteId);
    const k = chaveDe(body?.telefone);
    const atual = await listar(cli.UUID);
    const tel = atual.telefones.find((t) => t.chave === k);
    if (!k || !tel) throw erro(400, 'Esse telefone não está no cadastro deste cliente.', 'TELEFONE_NAO_E_DO_CLIENTE');
    const quem = quemDe(ator);
    const em = new Date();
    const dados = { funcionandoChave: k, funcionandoEm: em, funcionandoPor: quem.dados.atualizadoPorNome };
    await prisma.clienteTelefonePreferencia.upsert({
        where: { clienteId: cli.UUID },
        create: { clienteId: cli.UUID, ordem: [], ...dados, ...quem.dados },
        update: dados,
    });
    if (!tel.funcionando) {
        const antes = atual.telefones.find((t) => t.funcionando);
        await historico.registrar({
            clienteId: cli.UUID, ator: quem.historico, tela: quem.porAgente ? 'API /analytics/v1' : TELA,
            mudancas: [{ campo: 'telefoneFuncionando', de: antes ? `…${antes.final}` : null, para: `…${tel.final}` }],
        });
    }
    return listar(cli.UUID);
}

module.exports = { FONTES, montarTelefones, pendenciaTelefone, listar, definirOrdem, marcarFuncionando, lerPreferencia, SEL_TEL };
