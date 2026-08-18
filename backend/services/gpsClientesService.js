// ─────────────────────────────────────────────────────────────────────────────
// Ponto GPS confiável por cliente
//
// A certeza de que um ponto está certo NÃO vem de endereço/CEP (não confiáveis
// no Brasil) e sim de REPETIÇÃO: quando 3+ sinais de GPS, de dias diferentes,
// caem agrupados num raio de ~100 m, aquele lugar é o cliente de verdade.
// Sinais: entregas concluídas (pedidos.gps_entrega), atendimentos do vendedor
// na rua (atendimentos.gps_vendedor) e confirmações "estou na porta" do
// motorista (clientes_gps_sinais, com foto da fachada).
//
// Filtros anti-engano:
//  - sinal dentro do raio da empresa nunca conta;
//  - checkout em lote (entregas de OUTROS clientes concluídas no mesmo lugar e
//    na mesma janela de minutos) é descartado — motorista "baixando" tudo de
//    um ponto só não confirma endereço de ninguém;
//  - por cliente, sinais do mesmo dia a <50 m contam como 1 (dias diferentes).
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const { haversineMetros, parseLatLng, getGeofence } = require('./pontoService');

// Raios e limites (metros) — decididos na proposta aprovada em 07/2026
const RAIO_DUPLICADO_M = 5;    // mesmo ponto de outro cliente → bloqueado sempre
const RAIO_PROXIMO_M = 30;     // perto de outro cliente → só com autorização da logística
const RAIO_EMPRESA_MIN_M = 200; // raio mínimo considerado "dentro da empresa"
const RAIO_CLUSTER_M = 100;    // sinais a até isso um do outro formam grupo
const RAIO_NO_PONTO_M = 150;   // entrega a até isso do cadastro = "no ponto"
const RAIO_FORA_M = 300;       // entrega além disso = "fora" (pergunta na porta)
const AJUSTE_LIVRE_M = 100;    // mover até isso aplica direto sem perder selo
const APROVACAO_M = 300;       // legado — pendência de aprovação desativada em 07/2026 (edição manual vale na hora)
const MIN_SINAIS = 3;
const MIN_DIAS = 2;
const JANELA_LOTE_MIN = 10;    // minutos p/ detectar checkout em lote
const RAIO_LOTE_M = 30;        // mesmo lugar p/ detectar checkout em lote
const DIAS_JANELA_SINAIS = 240; // só considera sinais dos últimos N dias

const CONFIG_KEY = 'gps_clientes_config';

const diaSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const distancia = (a, b) => (a && b) ? haversineMetros(a.lat, a.lng, b.lat, b.lng) : null;

const fmtPonto = (p) => p ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : null;

// ── Configuração (interruptor do bloqueio de pedido) ─────────────────────────

const getConfig = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
    const v = (cfg && typeof cfg.value === 'object' && cfg.value) || {};
    return { exigirNoPedido: v.exigirNoPedido === true };
};

const setConfig = async (patch) => {
    const atual = await getConfig();
    const value = { ...atual, ...patch };
    await prisma.appConfig.upsert({
        where: { key: CONFIG_KEY },
        update: { value },
        create: { key: CONFIG_KEY, value }
    });
    return value;
};

// ── Raio da empresa ──────────────────────────────────────────────────────────

const getEmpresa = async () => {
    const geo = await getGeofence();
    if (!geo.ativo) return null;
    return { lat: geo.lat, lng: geo.lng, raio: Math.max(RAIO_EMPRESA_MIN_M, geo.raioMetros || 0) };
};

const dentroDaEmpresa = (ponto, empresa) =>
    !!(empresa && ponto && haversineMetros(empresa.lat, empresa.lng, ponto.lat, ponto.lng) <= empresa.raio);

// ── Validação de um ponto novo (duplicado / empresa / próximo) ───────────────

// Retorna null se o ponto é aceitável, ou { codigo, mensagem, clienteConflito }.
// codigo: INVALIDO | EMPRESA | DUPLICADO | PROXIMO (PROXIMO é o único liberável).
const validarPonto = async (pontoStr, clienteUuidIgnorar) => {
    const ponto = parseLatLng(pontoStr);
    if (!ponto || Math.abs(ponto.lat) > 90 || Math.abs(ponto.lng) > 180) {
        return { codigo: 'INVALIDO', mensagem: 'Ponto GPS inválido. Use o mapa para escolher o local.' };
    }

    const empresa = await getEmpresa();
    if (dentroDaEmpresa(ponto, empresa)) {
        return {
            codigo: 'EMPRESA',
            mensagem: 'Este ponto está dentro do raio da empresa — é o endereço da Hardt, não do cliente. Mova o alfinete até a porta do cliente.'
        };
    }

    const outros = await prisma.cliente.findMany({
        where: { Ponto_GPS: { not: null }, Ativo: true, ...(clienteUuidIgnorar ? { UUID: { not: clienteUuidIgnorar } } : {}) },
        select: { UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true }
    });

    let maisPerto = null;
    for (const c of outros) {
        const p = parseLatLng(c.Ponto_GPS);
        if (!p) continue;
        const d = haversineMetros(ponto.lat, ponto.lng, p.lat, p.lng);
        if (!maisPerto || d < maisPerto.distanciaM) {
            maisPerto = { UUID: c.UUID, nome: c.NomeFantasia || c.Nome, distanciaM: d };
        }
    }

    if (maisPerto && maisPerto.distanciaM <= RAIO_DUPLICADO_M) {
        return {
            codigo: 'DUPLICADO',
            mensagem: `Este ponto é o mesmo do cliente "${maisPerto.nome}". Cada cliente precisa do seu próprio ponto — mova o alfinete.`,
            clienteConflito: maisPerto
        };
    }
    if (maisPerto && maisPerto.distanciaM <= RAIO_PROXIMO_M) {
        return {
            codigo: 'PROXIMO',
            mensagem: `Este ponto fica a ${maisPerto.distanciaM} m do cliente "${maisPerto.nome}". Para salvar tão perto é preciso autorização da logística.`,
            clienteConflito: maisPerto
        };
    }
    return null;
};

// ── Autorização por senha (permissão Pode_Autorizar_Ponto_Gps) ───────────────

const validarAutorizador = async ({ vendedorId, senha }, permissaoNecessaria) => {
    if (!vendedorId || !senha) {
        const err = new Error('Escolha o autorizador e digite a senha dele.');
        err.status = 400; throw err;
    }
    const usuario = await prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { id: true, nome: true, senha: true, permissoes: true, ativo: true }
    });
    if (!usuario || !usuario.ativo) {
        const err = new Error('Autorizador não encontrado ou inativo.');
        err.status = 404; throw err;
    }
    const perms = (typeof usuario.permissoes === 'string' ? JSON.parse(usuario.permissoes) : usuario.permissoes) || {};
    if (!perms.admin && !perms[permissaoNecessaria]) {
        const err = new Error(`${usuario.nome} não tem a permissão para autorizar isto.`);
        err.status = 403; throw err;
    }
    if (!usuario.senha) {
        const err = new Error(`${usuario.nome} não tem senha configurada no app.`);
        err.status = 403; throw err;
    }
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) {
        const err = new Error('Senha do autorizador incorreta.');
        err.status = 401; throw err;
    }
    return { id: usuario.id, nome: usuario.nome };
};

// ── Coleta de sinais de um conjunto de clientes ──────────────────────────────
//
// Devolve Map<clienteUuid, [{ ponto:{lat,lng}, dia:'YYYY-MM-DD', fonte }]>
// já com os filtros anti-engano aplicados.
const coletarSinais = async (clienteUuids) => {
    const desde = new Date(Date.now() - DIAS_JANELA_SINAIS * 24 * 60 * 60 * 1000);
    const empresa = await getEmpresa();
    const filtroCliente = clienteUuids ? { clienteId: { in: clienteUuids } } : {};

    // Entregas concluídas com GPS dos clientes avaliados
    const entregas = await prisma.pedido.findMany({
        where: {
            gpsEntrega: { not: null },
            statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] },
            dataEntrega: { gte: desde },
            ...filtroCliente
        },
        select: { clienteId: true, gpsEntrega: true, dataEntrega: true },
        orderBy: { dataEntrega: 'asc' }
    });

    // Para detectar checkout em lote é preciso enxergar as entregas dos OUTROS
    // clientes nos mesmos dias. Sem filtro (saúde geral) já veio tudo; com
    // filtro, busca as entregas dos dias envolvidos (limitado a 60 dias).
    let todasEntregas = entregas;
    if (clienteUuids && clienteUuids.length > 0 && entregas.length > 0) {
        const dias = [...new Set(entregas.map(e => diaSP(e.dataEntrega)))].slice(-60);
        const ranges = dias.map(d => ({
            dataEntrega: { gte: new Date(d + 'T00:00:00-03:00'), lte: new Date(d + 'T23:59:59-03:00') }
        }));
        todasEntregas = await prisma.pedido.findMany({
            where: { gpsEntrega: { not: null }, statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] }, OR: ranges },
            select: { clienteId: true, gpsEntrega: true, dataEntrega: true },
            orderBy: { dataEntrega: 'asc' }
        });
    }

    // Detectar checkout em lote: entrega cujo GPS coincide (<30 m) com a entrega
    // de OUTRO cliente concluída a menos de 10 min — descarta as duas.
    const parsed = todasEntregas
        .map(e => ({ ...e, ponto: parseLatLng(e.gpsEntrega), ts: new Date(e.dataEntrega).getTime() }))
        .filter(e => e.ponto);
    const emLote = new Set();
    for (let i = 0; i < parsed.length; i++) {
        for (let j = i + 1; j < parsed.length; j++) {
            const a = parsed[i], b = parsed[j];
            if (b.ts - a.ts > JANELA_LOTE_MIN * 60000) break; // ordenado por data
            if (a.clienteId !== b.clienteId && distancia(a.ponto, b.ponto) <= RAIO_LOTE_M) {
                emLote.add(i); emLote.add(j);
            }
        }
    }

    const porCliente = new Map();
    const push = (clienteId, ponto, dia, fonte) => {
        if (!ponto) return;
        if (dentroDaEmpresa(ponto, empresa)) return; // sinal na empresa nunca conta
        if (!porCliente.has(clienteId)) porCliente.set(clienteId, []);
        const lista = porCliente.get(clienteId);
        // Mesmo dia + <50 m de um sinal já registrado do cliente = repetição, conta 1
        if (lista.some(s => s.dia === dia && distancia(s.ponto, ponto) <= 50)) return;
        lista.push({ ponto, dia, fonte });
    };

    parsed.forEach((e, i) => {
        if (emLote.has(i)) return;
        if (clienteUuids && !clienteUuids.includes(e.clienteId)) return;
        push(e.clienteId, e.ponto, diaSP(e.dataEntrega), 'ENTREGA');
    });

    const atendimentos = await prisma.atendimento.findMany({
        where: { gpsVendedor: { not: null }, clienteId: { not: null }, criadoEm: { gte: desde }, ...filtroCliente },
        select: { clienteId: true, gpsVendedor: true, criadoEm: true }
    });
    for (const a of atendimentos) {
        push(a.clienteId, parseLatLng(a.gpsVendedor), diaSP(a.criadoEm), 'ATENDIMENTO');
    }

    const confirmacoes = await prisma.clienteGpsSinal.findMany({
        where: { createdAt: { gte: desde }, ...(clienteUuids ? { clienteUuid: { in: clienteUuids } } : {}) },
        select: { clienteUuid: true, ponto: true, createdAt: true }
    });
    for (const s of confirmacoes) {
        push(s.clienteUuid, parseLatLng(s.ponto), diaSP(s.createdAt), 'NA_PORTA');
    }

    return porCliente;
};

// ── Agrupamento: maior grupo de sinais num raio de 100 m ─────────────────────

const clusterizar = (sinais) => {
    if (!sinais || sinais.length === 0) return null;
    let melhor = null;
    for (const centroCandidato of sinais) {
        const grupo = sinais.filter(s => distancia(s.ponto, centroCandidato.ponto) <= RAIO_CLUSTER_M);
        if (!melhor || grupo.length > melhor.grupo.length) melhor = { grupo };
    }
    const grupo = melhor.grupo;
    const dias = [...new Set(grupo.map(s => s.dia))];
    if (grupo.length < MIN_SINAIS || dias.length < MIN_DIAS) return null;
    const centro = {
        lat: grupo.reduce((s, g) => s + g.ponto.lat, 0) / grupo.length,
        lng: grupo.reduce((s, g) => s + g.ponto.lng, 0) / grupo.length
    };
    return { centro, quantidade: grupo.length, dias: dias.length, fontes: grupo.map(g => g.fonte) };
};

// ── Avaliar um cliente e gravar o selo em clientes_gps ───────────────────────

const avaliarERegistrar = async (cliente, sinaisDoCliente) => {
    const cluster = clusterizar(sinaisDoCliente || []);
    const ponto = parseLatLng(cliente.Ponto_GPS);
    let selo = null, sugestao = null, distanciaCadastroM = null;

    if (cluster) {
        distanciaCadastroM = ponto ? distancia(ponto, cluster.centro) : null;
        if (ponto && distanciaCadastroM <= RAIO_NO_PONTO_M) {
            selo = 'CONFIRMADO';
        } else {
            selo = 'SUSPEITO';
            sugestao = fmtPonto(cluster.centro);
        }
    }

    await prisma.clienteGps.upsert({
        where: { clienteUuid: cliente.UUID },
        update: { selo, sugestao, seloEm: new Date() },
        create: { clienteUuid: cliente.UUID, selo, sugestao, seloEm: new Date() }
    });

    return { selo, sugestao, distanciaCadastroM, cluster };
};

// Reavaliar 1 cliente (chamado após checkout de entrega / confirmação na porta)
const reavaliarCliente = async (clienteUuid) => {
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteUuid },
        select: { UUID: true, Ponto_GPS: true }
    });
    if (!cliente) return null;
    const mapa = await coletarSinais([clienteUuid]);
    return avaliarERegistrar(cliente, mapa.get(clienteUuid) || []);
};

// ── Selo de uma entrega (para o Caixa) ───────────────────────────────────────

// status: NO_PONTO | FORA | SEM_GPS (entrega sem GPS) | SEM_PONTO (cliente sem cadastro)
const seloEntrega = (gpsEntrega, pontoClienteStr) => {
    const e = parseLatLng(gpsEntrega);
    const c = parseLatLng(pontoClienteStr);
    if (!e) return { status: 'SEM_GPS', distanciaM: null };
    if (!c) return { status: 'SEM_PONTO', distanciaM: null };
    const d = distancia(e, c);
    return { status: d <= RAIO_FORA_M ? 'NO_PONTO' : 'FORA', distanciaM: d };
};

// ── Registrar mudança de ponto (com regras de aprovação) ─────────────────────

const registrarMudanca = async ({ clienteUuid, pontoNovo, autor, origem, posicaoAutor, autorizacao }) => {
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteUuid },
        select: { UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true, gps: true }
    });
    if (!cliente) { const err = new Error('Cliente não encontrado.'); err.status = 404; throw err; }

    const problema = await validarPonto(pontoNovo, clienteUuid);
    let autorizadoPor = null;
    if (problema) {
        if (problema.codigo === 'PROXIMO' && autorizacao) {
            autorizadoPor = await validarAutorizador(autorizacao, 'Pode_Autorizar_Ponto_Gps');
        } else {
            const err = new Error(problema.mensagem);
            err.status = 422;
            err.codigo = problema.codigo;
            err.clienteConflito = problema.clienteConflito || null;
            throw err;
        }
    }

    const antigo = parseLatLng(cliente.Ponto_GPS);
    const novo = parseLatLng(pontoNovo);
    const dist = antigo ? distancia(antigo, novo) : null;
    const pontoNovoFmt = fmtPonto(novo);

    // Nada mudou (mesmo lugar, <5 m): não grava nem loga
    if (antigo && dist !== null && dist < RAIO_DUPLICADO_M) {
        return { aplicado: false, pendente: false, semMudanca: true };
    }

    const dadosLog = {
        clienteUuid,
        tipo: 'MUDANCA',
        pontoAntigo: cliente.Ponto_GPS || null,
        pontoNovo: pontoNovoFmt,
        distanciaM: dist,
        autorId: autor?.id || null,
        autorNome: autor?.nome || null,
        posicaoAutor: posicaoAutor || null,
        origem: origem || null,
        autorizadoPorId: autorizadoPor?.id || null,
        autorizadoPorNome: autorizadoPor?.nome || null
    };

    // Decisão do dono (07/2026): edição manual VALE NA HORA, sempre — quem está
    // na rua sabe onde o cliente fica; aprovar cada ajuste é impraticável.
    // A aprovação da logística ficou só para o que já era dela (autorização de
    // ponto colado em outro cliente) e a Saúde GPS trabalha com SUGESTÕES
    // (entregas concluídas longe do ponto). Pendências antigas ainda podem ser
    // decididas lá (decidirPendencia), mas nenhuma nova é criada aqui.

    await prisma.$transaction(async (tx) => {
        await tx.cliente.update({ where: { UUID: clienteUuid }, data: { Ponto_GPS: pontoNovoFmt } });
        // Mudança relevante zera o selo — a repetição das próximas entregas valida
        if (dist === null || dist > AJUSTE_LIVRE_M) {
            await tx.clienteGps.upsert({
                where: { clienteUuid },
                update: { selo: null, sugestao: null, seloEm: new Date() },
                create: { clienteUuid, selo: null, sugestao: null, seloEm: new Date() }
            });
        }
        await tx.clienteGpsLog.create({ data: { ...dadosLog, status: 'APLICADO' } });
    }, { timeout: 20000, maxWait: 10000 });

    return { aplicado: true, pendente: false };
};

// ── Pendências (aprovação da logística) ──────────────────────────────────────

const decidirPendencia = async (logId, aprovar, decisor, motivo) => {
    const log = await prisma.clienteGpsLog.findUnique({ where: { id: logId } });
    if (!log || log.status !== 'PENDENTE') {
        const err = new Error('Pendência não encontrada (já decidida?).'); err.status = 404; throw err;
    }
    const decisao = { decididoPorId: decisor.id, decididoPorNome: decisor.nome, decididoEm: new Date(), motivo: motivo || null };

    if (!aprovar) {
        await prisma.clienteGpsLog.update({ where: { id: logId }, data: { status: 'REJEITADO', ...decisao } });
        return { aplicado: false };
    }

    await prisma.$transaction(async (tx) => {
        await tx.cliente.update({ where: { UUID: log.clienteUuid }, data: { Ponto_GPS: log.pontoNovo } });
        await tx.clienteGps.upsert({
            where: { clienteUuid: log.clienteUuid },
            update: { selo: null, sugestao: null, seloEm: new Date() },
            create: { clienteUuid: log.clienteUuid, selo: null, sugestao: null, seloEm: new Date() }
        });
        await tx.clienteGpsLog.update({ where: { id: logId }, data: { status: 'APLICADO', ...decisao } });
    }, { timeout: 20000, maxWait: 10000 });

    return { aplicado: true };
};

// Migração única (07/2026): com o fim da pendência de aprovação, as mudanças
// que ficaram PENDENTES são aplicadas nos cadastros automaticamente no boot —
// eram edições legítimas de quem estava na rua (regra nova: editou, valeu).
// Guardada por flag no appConfig para rodar uma vez só.
const PENDENCIAS_FLAG_KEY = 'gps_pendencias_legadas_aplicadas';
const aplicarPendenciasLegadas = async () => {
    const flag = await prisma.appConfig.findUnique({ where: { key: PENDENCIAS_FLAG_KEY } });
    if (flag) return { jaRodou: true, aplicadas: 0 };

    // Ordem cronológica: se o mesmo cliente tem mais de uma, a mais recente vence
    const pendentes = await prisma.clienteGpsLog.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { createdAt: 'asc' }
    });

    const decisor = { id: null, nome: 'Sistema — aprovação automática (regra 07/2026)' };
    let aplicadas = 0;
    for (const log of pendentes) {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.cliente.update({ where: { UUID: log.clienteUuid }, data: { Ponto_GPS: log.pontoNovo } });
                await tx.clienteGps.upsert({
                    where: { clienteUuid: log.clienteUuid },
                    update: { selo: null, sugestao: null, seloEm: new Date() },
                    create: { clienteUuid: log.clienteUuid, selo: null, sugestao: null, seloEm: new Date() }
                });
                await tx.clienteGpsLog.update({
                    where: { id: log.id },
                    data: { status: 'APLICADO', decididoPorNome: decisor.nome, decididoEm: new Date(), motivo: 'Aplicada automaticamente: edição manual passou a valer na hora.' }
                });
            }, { timeout: 20000, maxWait: 10000 });
            aplicadas++;
        } catch (e) {
            // Cliente apagado etc.: pula e segue — não pode travar o boot
            console.error(`[GpsClientes] pendência legada ${log.id} não aplicada:`, e.message);
        }
    }

    await prisma.appConfig.upsert({
        where: { key: PENDENCIAS_FLAG_KEY },
        update: { value: { em: new Date().toISOString(), aplicadas } },
        create: { key: PENDENCIAS_FLAG_KEY, value: { em: new Date().toISOString(), aplicadas } }
    });
    if (aplicadas) console.log(`[GpsClientes] ${aplicadas} pendência(s) de ponto GPS aplicadas nos cadastros (migração 07/2026).`);
    return { jaRodou: false, aplicadas };
};

const desfazerMudanca = async (logId, decisor) => {
    const log = await prisma.clienteGpsLog.findUnique({ where: { id: logId } });
    if (!log || log.tipo !== 'MUDANCA' || log.status !== 'APLICADO') {
        const err = new Error('Só mudanças aplicadas podem ser desfeitas.'); err.status = 400; throw err;
    }
    await prisma.$transaction(async (tx) => {
        await tx.cliente.update({ where: { UUID: log.clienteUuid }, data: { Ponto_GPS: log.pontoAntigo } });
        await tx.clienteGpsLog.update({
            where: { id: logId },
            data: { status: 'DESFEITO', decididoPorId: decisor.id, decididoPorNome: decisor.nome, decididoEm: new Date() }
        });
    }, { timeout: 20000, maxWait: 10000 });
    // Selo recalculado fora da transação (não pode derrubar o desfazer)
    try { await reavaliarCliente(log.clienteUuid); } catch (e) { console.error('[GpsClientes] reavaliar pós-desfazer:', e.message); }
    return { ok: true };
};

// ── Cliente balcão ───────────────────────────────────────────────────────────

const setBalcao = async (clienteUuid, ativo, autor) => {
    await prisma.clienteGps.upsert({
        where: { clienteUuid },
        update: { balcao: !!ativo, balcaoPorId: autor.id, balcaoPorNome: autor.nome, balcaoEm: new Date() },
        create: { clienteUuid, balcao: !!ativo, balcaoPorId: autor.id, balcaoPorNome: autor.nome, balcaoEm: new Date() }
    });
    try {
        await prisma.clienteGpsLog.create({
            data: { clienteUuid, tipo: ativo ? 'BALCAO_ON' : 'BALCAO_OFF', status: 'APLICADO', autorId: autor.id, autorNome: autor.nome }
        });
    } catch (e) { console.error('[GpsClientes] log balcão (já aplicado):', e.message); }
    return { balcao: !!ativo };
};

// ── Bloqueio de pedido sem GPS (chamado no ENVIAR) ───────────────────────────

// Retorna null (pode enviar) ou a mensagem de bloqueio.
const validarPedidoEnviar = async (clienteId) => {
    const cfg = await getConfig();
    if (!cfg.exigirNoPedido) return null;
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteId },
        select: { Ponto_GPS: true, Nome: true, NomeFantasia: true, gps: { select: { balcao: true } } }
    });
    if (!cliente) return null;
    if (cliente.gps?.balcao) return null;
    if (parseLatLng(cliente.Ponto_GPS)) return null;
    const nome = cliente.NomeFantasia || cliente.Nome;
    return `O cliente "${nome}" está sem ponto de GPS. Defina o ponto no mapa (ou marque como Cliente Balcão, se ele compra e retira na empresa) para enviar o pedido.`;
};

// ── Saúde geral dos pontos (tela do escritório) ──────────────────────────────

const saude = async () => {
    const empresa = await getEmpresa();
    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true },
        select: {
            UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true,
            idVendedor: true, vendedor: { select: { nome: true } },
            gps: true
        }
    });

    const comPonto = clientes
        .map(c => ({ ...c, _p: parseLatLng(c.Ponto_GPS) }))
        .filter(c => c._p);

    // Duplicados / muito próximos entre si (<30 m)
    const duplicados = [];
    for (let i = 0; i < comPonto.length; i++) {
        for (let j = i + 1; j < comPonto.length; j++) {
            const a = comPonto[i], b = comPonto[j];
            const d = haversineMetros(a._p.lat, a._p.lng, b._p.lat, b._p.lng);
            if (d <= RAIO_PROXIMO_M) {
                duplicados.push({
                    distanciaM: d, exato: d <= RAIO_DUPLICADO_M,
                    clientes: [a, b].map(c => ({ UUID: c.UUID, nome: c.NomeFantasia || c.Nome, vendedor: c.vendedor?.nome || null }))
                });
            }
        }
    }

    const naEmpresa = comPonto
        .filter(c => dentroDaEmpresa(parseLatLng(c.Ponto_GPS), empresa))
        .map(c => ({ UUID: c.UUID, nome: c.NomeFantasia || c.Nome, vendedor: c.vendedor?.nome || null, ponto: c.Ponto_GPS }));

    // Recalcular selo de todos com sinais
    const mapaSinais = await coletarSinais(null);
    const suspeitos = [];
    let confirmados = 0;
    for (const c of clientes) {
        const sinais = mapaSinais.get(c.UUID) || [];
        if (sinais.length === 0 && !c.gps?.selo) continue; // nada a avaliar nem a limpar
        const r = await avaliarERegistrar(c, sinais);
        if (r.selo === 'CONFIRMADO') confirmados++;
        if (r.selo === 'SUSPEITO') {
            suspeitos.push({
                UUID: c.UUID, nome: c.NomeFantasia || c.Nome,
                vendedor: c.vendedor?.nome || null, idVendedor: c.idVendedor || null,
                ponto: c.Ponto_GPS || null, sugestao: r.sugestao,
                distanciaM: r.distanciaCadastroM, sinais: r.cluster?.quantidade || 0, dias: r.cluster?.dias || 0
            });
        }
    }

    const semGps = clientes
        .filter(c => !parseLatLng(c.Ponto_GPS) && !c.gps?.balcao)
        .map(c => ({ UUID: c.UUID, nome: c.NomeFantasia || c.Nome, vendedor: c.vendedor?.nome || null }));

    const balcoes = clientes.filter(c => c.gps?.balcao)
        .map(c => ({ UUID: c.UUID, nome: c.NomeFantasia || c.Nome, por: c.gps?.balcaoPorNome || null }));

    const pendencias = await prisma.clienteGpsLog.findMany({
        where: { status: 'PENDENTE' },
        include: { cliente: { select: { Nome: true, NomeFantasia: true } } },
        orderBy: { createdAt: 'desc' }
    });

    return {
        kpis: {
            total: clientes.length,
            repetidos: duplicados.length,
            naEmpresa: naEmpresa.length,
            suspeitos: suspeitos.length,
            semGps: semGps.length,
            confirmados,
            balcoes: balcoes.length,
            pendencias: pendencias.length
        },
        duplicados, naEmpresa, suspeitos, semGps, balcoes,
        pendencias: pendencias.map(p => ({
            id: p.id, clienteUuid: p.clienteUuid,
            cliente: p.cliente?.NomeFantasia || p.cliente?.Nome || '—',
            pontoAntigo: p.pontoAntigo, pontoNovo: p.pontoNovo, distanciaM: p.distanciaM,
            autor: p.autorNome, posicaoAutor: p.posicaoAutor, origem: p.origem, criadoEm: p.createdAt
        })),
        config: await getConfig()
    };
};

// ── Divergências da carteira do vendedor (aviso na tela inicial) ─────────────

const divergenciasDoVendedor = async (vendedorId) => {
    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true, idVendedor: vendedorId, gps: { selo: 'SUSPEITO' } },
        select: { UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true, gps: { select: { sugestao: true, seloEm: true } } }
    });
    return clientes.map(c => {
        const ponto = parseLatLng(c.Ponto_GPS);
        const sug = parseLatLng(c.gps?.sugestao);
        return {
            UUID: c.UUID, nome: c.NomeFantasia || c.Nome,
            ponto: c.Ponto_GPS || null, sugestao: c.gps?.sugestao || null,
            distanciaM: (ponto && sug) ? distancia(ponto, sug) : null
        };
    });
};

// ── Endereço escrito × ponto GPS (selo nos cards da rota organizada) ─────────
// Geocodifica o endereço cadastrado (Nominatim por endereço → BrasilAPI por CEP,
// mesmo padrão do kitFestaService) e mede a distância até o Ponto_GPS. É uma
// ESTIMATIVA: geocoding por endereço erra fácil dezenas de metros — serve para
// apontar divergência grande, não para corrigir ponto.

const geocodeCache = new Map(); // chave = endereço normalizado → { geo, precisao, em }
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

// Política de uso do Nominatim público: no máximo 1 requisição/segundo.
// Reserva de "vez" síncrona (Node single-thread) — chamadas concorrentes se enfileiram.
const NOMINATIM_INTERVALO_MS = 1100;
let nominatimProximaVez = 0;
const esperarVezNominatim = () => {
    const agora = Date.now();
    const espera = Math.max(0, nominatimProximaVez - agora);
    nominatimProximaVez = Math.max(agora, nominatimProximaVez) + NOMINATIM_INTERVALO_MS;
    return espera ? new Promise(r => setTimeout(r, espera)) : Promise.resolve();
};

const geocodeEndereco = async ({ logradouro, numero, bairro, cidade, uf, cep }) => {
    const chave = [logradouro, numero, bairro, cidade, uf, cep].map(v => String(v || '').trim().toLowerCase()).join('|');
    const emCache = geocodeCache.get(chave);
    if (emCache && (Date.now() - emCache.em) < GEOCODE_TTL_MS) return emCache;

    let resultado = null;
    try {
        await esperarVezNominatim();
        const q = [[logradouro, numero].filter(Boolean).join(' '), bairro, cidade, uf, 'Brasil'].filter(Boolean).join(', ');
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'HardtApp/1.0' } }).then(x => x.json());
        if (r?.[0]?.lat && r?.[0]?.lon) resultado = { geo: { lat: +r[0].lat, lng: +r[0].lon }, precisao: 'endereco' };
    } catch (_) { }
    if (!resultado && cep) {
        try {
            const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${String(cep).replace(/\D/g, '')}`).then(x => x.json());
            const c = r?.location?.coordinates;
            if (c?.latitude && c?.longitude) resultado = { geo: { lat: +c.latitude, lng: +c.longitude }, precisao: 'cep' };
        } catch (_) { }
    }

    const salvo = { ...(resultado || { geo: null, precisao: null }), em: Date.now() };
    geocodeCache.set(chave, salvo);
    if (geocodeCache.size > 2000) geocodeCache.delete(geocodeCache.keys().next().value);
    return salvo;
};

const enderecoVsGpsCliente = (c) => {
    const ponto = parseLatLng(c.Ponto_GPS);
    if (!ponto) return Promise.resolve({ comparavel: false, motivo: 'SEM_GPS' });
    if (!c.End_Logradouro && !c.End_CEP) return Promise.resolve({ comparavel: false, motivo: 'SEM_ENDERECO' });
    return geocodeEndereco({
        logradouro: c.End_Logradouro, numero: c.End_Numero, bairro: c.End_Bairro,
        cidade: c.End_Cidade, uf: c.End_Estado, cep: c.End_CEP
    }).then(({ geo, precisao }) => {
        if (!geo) return { comparavel: false, motivo: 'GEOCODE_FALHOU' };
        return {
            comparavel: true,
            distanciaM: Math.round(haversineMetros(ponto.lat, ponto.lng, geo.lat, geo.lng)),
            precisao // 'endereco' = achou a rua/número; 'cep' = só o centro do CEP (mais grosseiro)
        };
    });
};

const SELECT_ENDERECO = {
    UUID: true, Ponto_GPS: true, End_Logradouro: true, End_Numero: true,
    End_Bairro: true, End_Cidade: true, End_Estado: true, End_CEP: true
};

const enderecoVsGps = async (uuid) => {
    const c = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: SELECT_ENDERECO });
    if (!c) { const e = new Error('Cliente não encontrado.'); e.status = 404; throw e; }
    return enderecoVsGpsCliente(c);
};

// Coordenada do endereço escrito (para centrar o mapa do "Ajustar ponto" no endereço)
const geocodeEnderecoDoCliente = async (uuid) => {
    const c = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: SELECT_ENDERECO });
    if (!c) { const e = new Error('Cliente não encontrado.'); e.status = 404; throw e; }
    if (!c.End_Logradouro && !c.End_CEP) return { geo: null, motivo: 'SEM_ENDERECO' };
    const { geo, precisao } = await geocodeEndereco({
        logradouro: c.End_Logradouro, numero: c.End_Numero, bairro: c.End_Bairro,
        cidade: c.End_Cidade, uf: c.End_Estado, cep: c.End_CEP
    });
    if (!geo) return { geo: null, motivo: 'GEOCODE_FALHOU' };
    return { geo: `${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`, precisao };
};

// Lote (máx. 10 por chamada): o frontend manda os clientes da rota em pedaços,
// e cada pedaço volta assim que geocodificado (na 1ª vez ~1s/endereço não cacheado).
const enderecoVsGpsLote = async (uuids) => {
    const lista = [...new Set((uuids || []).filter(u => typeof u === 'string'))].slice(0, 10);
    if (!lista.length) return {};
    const clientes = await prisma.cliente.findMany({ where: { UUID: { in: lista } }, select: SELECT_ENDERECO });
    const resultado = {};
    for (const c of clientes) {
        resultado[c.UUID] = await enderecoVsGpsCliente(c); // sequencial de propósito (vez do Nominatim)
    }
    return resultado;
};

module.exports = {
    RAIO_PROXIMO_M, RAIO_FORA_M, RAIO_NO_PONTO_M,
    getConfig, setConfig, getEmpresa,
    validarPonto, validarAutorizador,
    registrarMudanca, decidirPendencia, desfazerMudanca,
    setBalcao, validarPedidoEnviar, seloEntrega,
    reavaliarCliente, saude, divergenciasDoVendedor,
    enderecoVsGps, enderecoVsGpsLote, geocodeEnderecoDoCliente,
    geocodeEndereco, // reusado pelo mapa de divisão de cargas (posição aproximada por endereço)
    aplicarPendenciasLegadas
};
