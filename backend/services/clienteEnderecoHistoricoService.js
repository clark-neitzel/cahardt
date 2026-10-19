// ─────────────────────────────────────────────────────────────────────────────
// Histórico do ENDEREÇO do cliente (texto + ponto no mapa): quem mudou, quando,
// ver a versão antiga e restaurar. Plano: docs/plano-historico-endereco-cliente.md
//
// Tabela `clientes_endereco_log`: 1 linha = 1 gravação, com snapshot COMPLETO
// antes/depois (7 campos End_* + Ponto_GPS). O ponto continua indo para
// ClienteGpsLog (selo "quem atualizou o GPS", Saúde GPS) — a linha nova aponta
// para ele em `gpsLogId`, e é isso que evita o mesmo evento aparecer 2 vezes.
//
// REGRA: gravar a trilha NUNCA pode derrubar nem desfazer o ato principal —
// `registrar` engole o erro (log [EnderecoHistorico]) e nunca roda dentro de
// $transaction.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { Prisma } = require('@prisma/client');
const { haversineMetros, parseLatLng } = require('./pontoService');

const CAMPOS_TEXTO = ['End_Logradouro', 'End_Numero', 'End_Complemento', 'End_Bairro', 'End_Cidade', 'End_Estado', 'End_CEP'];
const CAMPOS = [...CAMPOS_TEXTO, 'Ponto_GPS'];
const SELECT_FOTO = Object.fromEntries(CAMPOS.map(c => [c, true]));
const TOLERANCIA_MESMO_PONTO_M = 1; // igual à do selo "quem atualizou" (gpsClientesService)
const ORIGENS_VALIDAS = new Set(['CADASTRO', 'CADASTRO_NOVO', 'ROTA', 'MOTORISTA', 'SAUDE', 'PEDIDO', 'DESFAZER_GPS', 'RESTAURAR', 'SISTEMA']);

// gpsClientesService também usa este service (lazy require dos dois lados evita ciclo)
const gpsService = () => require('./gpsClientesService');

const fmtPonto = (p) => p ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : null;

// ── Snapshot ────────────────────────────────────────────────────────────────

const normTexto = (v) => { const s = String(v ?? '').trim(); return s || null; };

// Linha de cliente (ou objeto parcial) → snapshot normalizado com os 8 campos.
const snapshotDe = (row) => {
    const r = row || {};
    const out = {};
    for (const c of CAMPOS_TEXTO) out[c] = normTexto(r[c]);
    out.End_CEP = out.End_CEP ? (out.End_CEP.replace(/\D/g, '') || null) : null;
    out.Ponto_GPS = fmtPonto(parseLatLng(r.Ponto_GPS));
    return out;
};

const foto = async (uuid, db = prisma) => {
    const c = await db.cliente.findUnique({ where: { UUID: uuid }, select: SELECT_FOTO });
    return c ? snapshotDe(c) : null;
};

const distanciaPontos = (a, b) => {
    const pa = parseLatLng(a), pb = parseLatLng(b);
    if (!pa || !pb) return null;
    return Math.round(haversineMetros(pa.lat, pa.lng, pb.lat, pb.lng));
};

// Lista os campos que mudaram. Chaves ausentes no snapshot (ex.: evento legado só com
// Ponto_GPS) NÃO contam como mudança — só compara o que os DOIS lados têm.
const diferencas = (antes, depois) => {
    const a = antes || {}, d = depois || {};
    const mudou = [];
    for (const c of CAMPOS_TEXTO) {
        if (!(c in a) || !(c in d)) continue;
        const va = c === 'End_CEP' ? String(a[c] ?? '').replace(/\D/g, '') || null : normTexto(a[c]);
        const vd = c === 'End_CEP' ? String(d[c] ?? '').replace(/\D/g, '') || null : normTexto(d[c]);
        if (va !== vd) mudou.push(c);
    }
    if ('Ponto_GPS' in a && 'Ponto_GPS' in d) {
        const pa = parseLatLng(a.Ponto_GPS), pd = parseLatLng(d.Ponto_GPS);
        if (!!pa !== !!pd) mudou.push('Ponto_GPS');
        else if (pa && pd && haversineMetros(pa.lat, pa.lng, pd.lat, pd.lng) >= TOLERANCIA_MESMO_PONTO_M) mudou.push('Ponto_GPS');
    }
    return mudou;
};

const temAlgumDado = (snap) => !!snap && CAMPOS.some(c => normTexto(snap[c]));

// ── Gravação (sempre best-effort) ───────────────────────────────────────────

// Devolve o id da linha criada, ou null (nada mudou / falhou). NUNCA lança.
const registrar = async ({
    clienteUuid, antes, depois, tipo = 'ALTERACAO', origem, autor, posicaoAutor,
    gpsLogId, restauradoDeId, restauradoLado, restauradoPartes, autorizadoPorNome, motivo
}) => {
    try {
        const snapDepois = snapshotDe(depois);
        let snapAntes = null;
        let campos;
        let distancia = null;
        if (tipo === 'CRIACAO') {
            campos = CAMPOS.filter(c => snapDepois[c]);
        } else {
            snapAntes = snapshotDe(antes);
            campos = diferencas(snapAntes, snapDepois);
            if (!campos.length) return null;
            distancia = distanciaPontos(snapAntes.Ponto_GPS, snapDepois.Ponto_GPS);
        }
        // Corrida com o reconciliador: se uma linha SISTEMA recém-criada (<60 s) cobre exatamente
        // esta mudança (mesmo `depois`), ela vira a linha COM autor em vez de duplicar o evento.
        if (autor && tipo !== 'CRIACAO') {
            const ult = await prisma.clienteEnderecoLog.findFirst({
                where: { clienteUuid }, orderBy: { createdAt: 'desc' },
                select: { id: true, tipo: true, createdAt: true, antes: true, depois: true }
            });
            if (ult && ult.tipo === 'SISTEMA' && (Date.now() - ult.createdAt.getTime()) < 60000
                && !diferencas(ult.depois, snapDepois).length && !diferencas(ult.antes, snapAntes).length) {
                await prisma.clienteEnderecoLog.update({
                    where: { id: ult.id },
                    data: {
                        tipo, origem: ORIGENS_VALIDAS.has(origem) ? origem : (origem ? String(origem).slice(0, 40) : null),
                        autorId: autor.id || null, autorNome: autor.nome || null, posicaoAutor: posicaoAutor || null,
                        gpsLogId: gpsLogId || null, restauradoDeId: restauradoDeId || null,
                        restauradoLado: restauradoLado || null, restauradoPartes: restauradoPartes || null,
                        autorizadoPorNome: autorizadoPorNome || null, motivo: motivo || null
                    }
                });
                return ult.id;
            }
        }
        const row = await prisma.clienteEnderecoLog.create({
            data: {
                clienteUuid, tipo,
                origem: ORIGENS_VALIDAS.has(origem) ? origem : (origem ? String(origem).slice(0, 40) : null),
                antes: snapAntes === null ? Prisma.DbNull : snapAntes, // Json? nunca recebe null puro
                depois: snapDepois,
                camposAlterados: campos, distanciaPontoM: distancia,
                autorId: autor?.id || null, autorNome: autor?.nome || null,
                posicaoAutor: posicaoAutor || null,
                gpsLogId: gpsLogId || null,
                restauradoDeId: restauradoDeId || null,
                restauradoLado: restauradoLado || null,
                restauradoPartes: restauradoPartes || null,
                autorizadoPorNome: autorizadoPorNome || null,
                motivo: motivo || null
            },
            select: { id: true }
        });
        return row.id;
    } catch (e) {
        console.error('[EnderecoHistorico] falha ao gravar trilha (ato principal já efetivado):', e.message);
        return null;
    }
};

// ── Reconciliador (rede de segurança p/ escritas fora do controller) ────────

// Se já existe trilha e o endereço atual difere do `depois` da última linha, alguém
// mexeu sem passar pelos ganchos (fusão de cidades, script, restore de backup...).
// Grava linha SISTEMA ("detectado em"). Cliente sem nenhuma linha NÃO ganha baseline.
const reconciliar = async (uuid) => {
    try {
        const ultima = await prisma.clienteEnderecoLog.findFirst({
            where: { clienteUuid: uuid }, orderBy: { createdAt: 'desc' }, select: { id: true, depois: true }
        });
        if (!ultima) return;
        const atual = await foto(uuid);
        if (!atual) return;
        if (!diferencas(ultima.depois, atual).length) return;
        // Risco aceito e documentado: 2 listagens simultâneas ainda podem criar 2 linhas SISTEMA
        // idênticas (sem trava no banco). A reconferência abaixo reduz a janela; o `registrar` com
        // autor absorve a SISTEMA recente quando ela é só a mesma mudança de um PATCH em andamento.
        // Reconfere imediatamente antes de criar (corrida entre 2 abas)
        const recheck = await prisma.clienteEnderecoLog.findFirst({
            where: { clienteUuid: uuid }, orderBy: { createdAt: 'desc' }, select: { id: true }
        });
        if (recheck?.id !== ultima.id) return;
        await registrar({ clienteUuid: uuid, antes: ultima.depois, depois: atual, tipo: 'SISTEMA', origem: 'SISTEMA' });
    } catch (e) {
        console.error('[EnderecoHistorico] reconciliador falhou:', e.message);
    }
};

// ── Listagem unificada ──────────────────────────────────────────────────────

let _registroDesdeCache = null;
const registroDesde = async () => {
    if (_registroDesdeCache) return _registroDesdeCache;
    const r = await prisma.clienteEnderecoLog.aggregate({ _min: { createdAt: true } });
    const d = r._min.createdAt;
    if (d) _registroDesdeCache = d.toISOString(); // imutável depois que existe
    return d ? d.toISOString() : null;
};

const eventoDeEndereco = (l, origensRestauradas, statusGps) => ({
    id: l.id,
    fonte: 'ENDERECO',
    tipo: l.tipo,
    // Se a linha aponta para um ClienteGpsLog que foi desfeito/rejeitado, a tela mostra isso
    status: (l.gpsLogId && statusGps.get(l.gpsLogId)) || 'APLICADO',
    origem: l.origem || null,
    autorNome: l.tipo === 'SISTEMA' ? null : (l.autorNome || null),
    em: l.createdAt.toISOString(),
    antes: l.antes || null,
    depois: l.depois,
    textoRegistrado: true,
    camposAlterados: l.camposAlterados || [],
    distanciaPontoM: l.distanciaPontoM ?? distanciaPontos(l.antes?.Ponto_GPS, l.depois?.Ponto_GPS),
    restauradoDe: l.restauradoDeId
        ? {
            eventoId: l.restauradoDeId,
            em: origensRestauradas.get(l.restauradoDeId)?.em || null,
            autorNome: origensRestauradas.get(l.restauradoDeId)?.autorNome || null,
            lado: l.restauradoLado || null,
            partes: l.restauradoPartes || null
        }
        : null,
    restauravel: {
        antes: !!l.antes && temAlgumDado(l.antes),
        depois: temAlgumDado(l.depois)
    },
    autorizadoPorNome: l.autorizadoPorNome || null
});

const eventoLegado = (g) => ({
    id: `gps:${g.id}`,
    fonte: 'GPS_LEGADO',
    tipo: 'MUDANCA_GPS',
    status: g.status,
    origem: g.origem || null,
    autorNome: g.autorNome || null,
    em: g.createdAt.toISOString(),
    antes: { Ponto_GPS: g.pontoAntigo || null },
    depois: { Ponto_GPS: g.pontoNovo || null },
    textoRegistrado: false,
    camposAlterados: ['Ponto_GPS'],
    distanciaPontoM: g.distanciaM ?? distanciaPontos(g.pontoAntigo, g.pontoNovo),
    restauradoDe: null,
    restauravel: { antes: !!g.pontoAntigo, depois: !!g.pontoNovo },
    autorizadoPorNome: g.autorizadoPorNome || null
});

const listar = async (uuid, { limite = 50 } = {}) => {
    const n = Math.min(Math.max(parseInt(limite) || 50, 1), 200);
    const existe = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: { UUID: true } });
    if (!existe) { const e = new Error('Cliente não encontrado'); e.status = 404; throw e; }

    await reconciliar(uuid);

    const [linhas, ligados, legados, desde, atual] = await Promise.all([
        prisma.clienteEnderecoLog.findMany({ where: { clienteUuid: uuid }, orderBy: { createdAt: 'desc' }, take: n }),
        prisma.clienteEnderecoLog.findMany({ where: { clienteUuid: uuid, gpsLogId: { not: null } }, select: { gpsLogId: true } }),
        prisma.clienteGpsLog.findMany({ where: { clienteUuid: uuid, tipo: 'MUDANCA' }, orderBy: { createdAt: 'desc' }, take: n }),
        registroDesde(),
        foto(uuid)
    ]);

    const jaNaTrilha = new Set(ligados.map(l => l.gpsLogId));
    const idsGps = linhas.map(l => l.gpsLogId).filter(Boolean);
    const statusGps = new Map();
    if (idsGps.length) {
        const gl = await prisma.clienteGpsLog.findMany({ where: { id: { in: idsGps } }, select: { id: true, status: true } });
        gl.forEach(g => { if (g.status === 'DESFEITO' || g.status === 'REJEITADO') statusGps.set(g.id, g.status); });
    }
    const legadosSoltos = legados.filter(g => !jaNaTrilha.has(g.id));

    // "Restaurado de": busca data/autor do evento de origem (linha nova ou legado)
    const origens = new Map();
    const idsNovos = [], idsLegado = [];
    for (const l of linhas) {
        if (!l.restauradoDeId) continue;
        if (l.restauradoDeId.startsWith('gps:')) idsLegado.push(l.restauradoDeId.slice(4)); else idsNovos.push(l.restauradoDeId);
    }
    if (idsNovos.length) {
        const r = await prisma.clienteEnderecoLog.findMany({ where: { id: { in: idsNovos } }, select: { id: true, createdAt: true, autorNome: true } });
        r.forEach(x => origens.set(x.id, { em: x.createdAt.toISOString(), autorNome: x.autorNome || null }));
    }
    if (idsLegado.length) {
        const r = await prisma.clienteGpsLog.findMany({ where: { id: { in: idsLegado } }, select: { id: true, createdAt: true, autorNome: true } });
        r.forEach(x => origens.set(`gps:${x.id}`, { em: x.createdAt.toISOString(), autorNome: x.autorNome || null }));
    }

    const eventos = [...linhas.map(l => eventoDeEndereco(l, origens, statusGps)), ...legadosSoltos.map(eventoLegado)]
        .sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0))
        .slice(0, n);

    const u = eventos[0];
    return {
        atual: {
            snapshot: atual,
            ultimaMudanca: u ? { eventoId: u.id, autorNome: u.autorNome, origem: u.origem, em: u.em } : null
        },
        registroDesde: desde,
        eventos
    };
};

// ── Localizar uma versão (evento + lado) ────────────────────────────────────

const erro = (status, codigo, mensagem, extra = {}) => Object.assign(new Error(mensagem), { status, codigo, ...extra });

// Devolve { evento, snapshot, texto } — texto=false quando é legado (só ponto).
const versaoDoEvento = async (uuid, eventoId, lado) => {
    if (lado !== 'antes' && lado !== 'depois') throw erro(400, 'LADO_INVALIDO', 'Lado inválido (use antes ou depois).');
    if (String(eventoId).startsWith('gps:')) {
        const g = await prisma.clienteGpsLog.findFirst({ where: { id: String(eventoId).slice(4), clienteUuid: uuid, tipo: 'MUDANCA' } });
        if (!g) throw erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
        const ponto = lado === 'antes' ? g.pontoAntigo : g.pontoNovo;
        return { evento: g, snapshot: { Ponto_GPS: fmtPonto(parseLatLng(ponto)) }, texto: false };
    }
    const l = await prisma.clienteEnderecoLog.findFirst({ where: { id: String(eventoId), clienteUuid: uuid } });
    if (!l) throw erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
    const snap = lado === 'antes' ? l.antes : l.depois;
    return { evento: l, snapshot: snap ? snapshotDe(snap) : null, texto: true };
};

// ── Geocode de uma versão (só snapshot de evento do PRÓPRIO cliente) ────────

const geocodeVersao = async (uuid, eventoId, lado = 'antes') => {
    const { snapshot } = await versaoDoEvento(uuid, eventoId, lado);
    if (!snapshot || (!snapshot.End_Logradouro && !snapshot.End_CEP)) {
        return { geo: null, precisao: null, estimado: true, motivo: 'SEM_ENDERECO' };
    }
    const { geo, precisao } = await gpsService().geocodeEndereco({
        logradouro: snapshot.End_Logradouro, numero: snapshot.End_Numero, bairro: snapshot.End_Bairro,
        cidade: snapshot.End_Cidade, uf: snapshot.End_Estado, cep: snapshot.End_CEP
    });
    if (!geo) return { geo: null, precisao: null, estimado: true, motivo: 'GEOCODE_FALHOU' };
    return { geo: `${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`, precisao, estimado: true, motivo: null };
};

// ── Restaurar ───────────────────────────────────────────────────────────────

// Espelho do validarIe do clienteController (IE de SC tem 9 dígitos).
const erroIeParaUf = (ie, uf) => {
    if (!ie) return null;
    if (String(uf || '').toUpperCase() === 'SC' && String(ie).length !== 9) {
        return 'A Inscrição Estadual atual do cliente (' + ie + ') não é válida para SC (precisa de 9 dígitos). Ajuste a IE antes de restaurar este endereço.';
    }
    return null;
};

/**
 * perms: permissões do usuário (objeto). autor: { id, nome }.
 * Valida TUDO antes de gravar. Idempotente: se a foto atual já é a versão pedida → semMudanca.
 */
const restaurar = async (uuid, eventoId, { lado = 'antes', partes = 'tudo', autor, perms = {}, autorizacao, posicaoAutor } = {}) => {
    if (!['antes', 'depois'].includes(lado)) throw erro(400, 'LADO_INVALIDO', 'Lado inválido (use antes ou depois).');
    if (!['tudo', 'texto', 'ponto'].includes(partes)) throw erro(400, 'PARTES_INVALIDAS', 'Partes inválidas (use tudo, texto ou ponto).');

    // Mesma régua do PATCH /clientes/:uuid (sem permissão nova)
    const podeEditarCadastro = !!(perms.admin || perms.clientes?.edit || perms.Pode_Editar_GPS);
    const podeEditarGPS = !!(perms.admin || perms.Pode_Editar_GPS || perms.clientes?.edit || perms.Pode_Executar_Entregas);
    const querTexto = partes === 'tudo' || partes === 'texto';
    const querPonto = partes === 'tudo' || partes === 'ponto';
    if (querTexto && !podeEditarCadastro) throw erro(403, 'SEM_PERMISSAO', 'Sem permissão para restaurar o endereço escrito deste cliente.');
    if (querPonto && !podeEditarGPS) throw erro(403, 'SEM_PERMISSAO', 'Sem permissão para restaurar o ponto GPS deste cliente.');

    const cliente = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: { UUID: true, fiscal: { select: { inscricaoEstadual: true } } } });
    if (!cliente) throw erro(404, 'CLIENTE_NAO_ENCONTRADO', 'Cliente não encontrado');

    const { snapshot: alvo, texto: eventoTemTexto } = await versaoDoEvento(uuid, eventoId, lado);
    if (!alvo || !temAlgumDado(alvo)) throw erro(400, 'VERSAO_VAZIA', 'Esta versão não tem dados para restaurar.');
    const textoUtil = !!(normTexto(alvo.End_Logradouro) && normTexto(alvo.End_Cidade));
    if (querTexto && !eventoTemTexto) throw erro(400, 'PARTE_INDISPONIVEL', 'Este registro antigo só guardou o ponto no mapa — o endereço escrito dele não foi registrado. Restaure só o ponto.');

    const partesIgnoradas = [];
    let restaurarTexto = querTexto;
    let restaurarPonto = querPonto;
    if (restaurarTexto && !textoUtil) {
        // Versão sem endereço escrito aproveitável: nunca zera os End_* (vão para a NF-e)
        if (partes === 'texto') throw erro(400, 'VERSAO_VAZIA', 'Esta versão não tem endereço escrito (rua e cidade) para restaurar.');
        restaurarTexto = false;
        partesIgnoradas.push({ parte: 'texto', motivo: 'VERSAO_SEM_TEXTO' });
    }
    if (restaurarPonto && !parseLatLng(alvo.Ponto_GPS)) {
        if (partes === 'ponto') throw erro(400, 'VERSAO_VAZIA', 'Esta versão não tem ponto no mapa.');
        restaurarPonto = false;
        partesIgnoradas.push({ parte: 'ponto', motivo: 'VERSAO_SEM_PONTO' }); // não apaga o ponto atual
    }

    const antes = await foto(uuid);

    // Texto alvo (cidade resolvida pelo cadastro oficial)
    let textoAlvo = null;
    if (restaurarTexto) {
        textoAlvo = {};
        for (const c of CAMPOS_TEXTO) textoAlvo[c] = alvo[c] ?? null;
        if (textoAlvo.End_Cidade) {
            try {
                textoAlvo.End_Cidade = await require('./cidadeService').resolver(textoAlvo.End_Cidade, { modo: 'estrito' });
            } catch (cidErr) {
                if (!cidErr.codigo) throw cidErr;
                throw erro(cidErr.status || 400, cidErr.codigo, cidErr.message, {
                    cidade: cidErr.cidade, sugestoes: cidErr.sugestoes || [], cidadeInativa: cidErr.cidadeInativa || undefined
                });
            }
        }
        const msgIe = erroIeParaUf(cliente.fiscal?.inscricaoEstadual, textoAlvo.End_Estado);
        if (msgIe) throw erro(400, 'IE_INCOMPATIVEL_UF', msgIe);
    }

    const textoMudou = restaurarTexto && diferencas(
        Object.fromEntries(CAMPOS_TEXTO.map(c => [c, antes[c]])),
        Object.fromEntries(CAMPOS_TEXTO.map(c => [c, textoAlvo[c]]))
    ).length > 0;
    const pontoMudou = restaurarPonto && diferencas({ Ponto_GPS: antes.Ponto_GPS }, { Ponto_GPS: alvo.Ponto_GPS }).length > 0;

    if (!textoMudou && !pontoMudou) {
        return { ok: true, semMudanca: true, partesAplicadas: [], partesIgnoradas, atual: antes };
    }

    const dadosTexto = textoMudou
        ? Object.fromEntries(CAMPOS_TEXTO.map(c => [c, textoAlvo[c]]))
        : null;
    const partesAplicadas = [];
    let gpsLogId = null;
    let autorizadoPorNome = null;

    if (pontoMudou) {
        // Passa por validarPonto + selo + ClienteGpsLog (origem RESTAURAR); com texto junto,
        // vai atômico na MESMA transação via extraCliente. Valida antes de qualquer escrita.
        const r = await gpsService().registrarMudanca({
            clienteUuid: uuid, pontoNovo: alvo.Ponto_GPS, autor, origem: 'RESTAURAR',
            posicaoAutor: posicaoAutor || null, autorizacao: autorizacao || null,
            trilha: false, extraCliente: dadosTexto || undefined
        });
        gpsLogId = r.logId || null;
        autorizadoPorNome = r.autorizadoPorNome || null;
        if (r.aplicado) partesAplicadas.push('ponto');
        if (r.aplicado || r.textoAplicado) { if (textoMudou) partesAplicadas.unshift('texto'); }
    } else if (textoMudou) {
        await prisma.cliente.update({ where: { UUID: uuid }, data: dadosTexto });
        partesAplicadas.push('texto');
    }

    const depois = await foto(uuid);
    const novoId = await registrar({
        clienteUuid: uuid, antes, depois, tipo: 'RESTAURACAO', origem: 'RESTAURAR',
        autor, posicaoAutor, gpsLogId, autorizadoPorNome,
        restauradoDeId: String(eventoId), restauradoLado: lado, restauradoPartes: partes
    });

    return {
        ok: true,
        semMudanca: partesAplicadas.length === 0,
        partesAplicadas, partesIgnoradas,
        eventoId: novoId,
        atual: depois
    };
};

module.exports = {
    CAMPOS, CAMPOS_TEXTO, snapshotDe, foto, diferencas, registrar, reconciliar,
    listar, geocodeVersao, restaurar
};
