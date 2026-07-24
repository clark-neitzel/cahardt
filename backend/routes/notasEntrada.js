/**
 * Notas Recebidas (NF-e capturadas na SEFAZ) — Fase 2 do módulo financeiro.
 *
 * Caixa de entrada das notas emitidas contra o nosso CNPJ:
 *   listar/detalhar, baixar XML, ignorar/reativar e GERAR CONTA A PAGAR a partir
 *   da nota (com de-para produto do fornecedor → item PCP, lembrado por CNPJ).
 *
 * Permissões (padrão do contasPagar.js):
 *   ver   → admin ou Pode_Acessar_Notas_Recebidas
 *   ações → admin ou Pode_Baixar_Contas_Pagar
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const sefazDfeService = require('../services/sefazDfeService');
const nfseAdnService = require('../services/nfseAdnService');
const { montarDanfeHtml } = require('../services/danfeHtmlService');
const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');
const googleDriveService = require('../services/googleDriveService');
// CNPJ ALFANUMÉRICO: documento/chave podem conter letras — normalizar preservando-as.
const { normalizarDoc, normalizarChaveNFe } = require('../utils/documento');
// App é o dono do financeiro: com esta chave ligada, a conta a pagar gerada da nota
// nasce "só no app" (não vai ao CA). Ver contaAzulModo.js.
const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');

// Caminho absoluto do XML salvo da nota (uploads/notas-xml/{chave}.xml).
const xmlAbsPath = (nota) => {
    if (nota.xmlPath) {
        return path.isAbsolute(nota.xmlPath) ? nota.xmlPath : path.join(__dirname, '..', nota.xmlPath);
    }
    return path.join(__dirname, '..', 'uploads', 'notas-xml', `${nota.chave}.xml`);
};

// Parse ao vivo do XML salvo (para notas já capturadas antes dos novos campos). null se não houver arquivo.
// Só para NF-e — a NFS-e já nasce com tudo preenchido na captura.
const parseXmlSalvo = (nota) => {
    try {
        if (nota.tipo !== 'NFE') return null;
        const abs = xmlAbsPath(nota);
        if (!fs.existsSync(abs)) return null;
        return sefazDfeService.parseProcNFe(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
        console.warn('[NotasEntrada] Falha ao parsear XML salvo:', e.message);
        return null;
    }
};

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Notas_Recebidas) {
        return res.status(403).json({ error: 'Sem permissão para acessar as notas recebidas.' });
    }
    next();
};

const checkEscrita = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Pagar) {
        return res.status(403).json({ error: 'Sem permissão para executar ações nas notas recebidas.' });
    }
    next();
};

const num = (v) => (v == null ? null : Number(v));
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round4 = (v) => Math.round(Number(v) * 10000) / 10000;

/**
 * Rateio proporcional ao valor da nota (vNF), agrupando itens por categoria efetiva.
 * PURA e testável. Chave do grupo = categoriaCaId || nome da categoria.
 * O ÚLTIMO grupo absorve a diferença de arredondamento para a soma bater EXATO com vNF.
 * Sem itens (soma vProd == 0) → rateio único com a categoria padrão e valor = vNF.
 *
 * @param {number} vNF                valor total da nota
 * @param {Array}  itens              [{ vProd, categoria, categoriaCaId }]
 * @param {object} padrao            { categoria, categoriaCaId } fallback
 * @returns {Array} [{ categoria, categoriaCaId, valor }]
 */
const calcularRateio = (vNF, itens, padrao = {}) => {
    const total = round2(vNF);
    const somaVProd = round2((itens || []).reduce((s, i) => s + (Number(i.vProd) || 0), 0));

    if (!itens || itens.length === 0 || somaVProd <= 0) {
        return [{ categoria: padrao.categoria || null, categoriaCaId: padrao.categoriaCaId || null, valor: total }];
    }

    // Agrupa preservando a ordem de 1ª aparição
    const grupos = [];
    const idx = new Map();
    for (const it of itens) {
        const categoria = it.categoria || padrao.categoria || null;
        const categoriaCaId = it.categoriaCaId || padrao.categoriaCaId || null;
        const chave = categoriaCaId || categoria || '__sem__';
        if (!idx.has(chave)) {
            idx.set(chave, grupos.length);
            grupos.push({ categoria, categoriaCaId, somaVProd: 0 });
        }
        grupos[idx.get(chave)].somaVProd += (Number(it.vProd) || 0);
    }

    let acumulado = 0;
    return grupos.map((g, i) => {
        let valor;
        if (i === grupos.length - 1) {
            valor = round2(total - acumulado); // último absorve a diferença
        } else {
            valor = round2(total * (g.somaVProd / somaVProd));
            acumulado = round2(acumulado + valor);
        }
        return { categoria: g.categoria, categoriaCaId: g.categoriaCaId, valor };
    });
};

/**
 * Saldo ainda "vinculável" de uma parcela, considerando o que OUTRAS notas já ocupam.
 * PURA e testável. Nunca negativo.
 * @param {number} valorParcela
 * @param {Array}  vinculos          [{ notaEntradaId, valorVinculado }] já gravados na parcela
 * @param {string|null} ignorarNotaId nota que está sendo (re)vinculada agora
 */
const calcularSaldoDisponivel = (valorParcela, vinculos = [], ignorarNotaId = null) => {
    const ocupado = (vinculos || [])
        .filter((v) => !ignorarNotaId || v.notaEntradaId !== ignorarNotaId)
        .reduce((s, v) => s + (Number(v.valorVinculado) || 0), 0);
    return Math.max(0, round2(Number(valorParcela || 0) - ocupado));
};

// Ação escolhida no app quando a soma vinculada ≠ valor da nota → tipoDiferenca gravado.
const ACOES_DIFERENCA = ['NENHUMA', 'AJUSTAR_PARCELA', 'DESCONTO', 'ACRESCIMO'];
const tipoDiferencaDaAcao = (acao) => (acao === 'AJUSTAR_PARCELA' ? 'AJUSTE' : acao);

// Parcela "paga" para efeito do ajuste de valor: status PAGO ou com pagamento não estornado.
const parcelaEstaPaga = (parcela) =>
    parcela.status === 'PAGO' || (parcela.pagamentos || []).some((p) => !p.estornado);

const parseVencimento = (v) => {
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : new Date(s);
};

const formatarNotaLista = (n) => ({
    id: n.id,
    tipo: n.tipo,
    chave: n.chave,
    numero: n.numero,
    fornecedorNome: n.fornecedorNome,
    fornecedorCnpj: n.fornecedorCnpj,
    emissao: n.emissao,
    valorTotal: num(n.valorTotal),
    status: n.status,
    contaPagarId: n.contaPagarId
});

// ── GET / — caixa de entrada + status da captura ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { status, chip, busca, tipo, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;

        const where = {};
        // Situação: aceita `chip` (agrupado, usado pela tela) ou `status` (direto/legado).
        // NOVAS agrupa NOVA + AGUARDANDO_XML (resumos que ainda esperam o XML completo).
        const chipUp = String(chip || '').toUpperCase();
        if (chipUp === 'NOVAS') where.status = { in: ['NOVA', 'AGUARDANDO_XML'] };
        else if (chipUp === 'GERADAS') where.status = 'CONFERIDA';
        else if (chipUp === 'VINCULADAS') where.status = 'VINCULADA'; // anexadas a parcela já lançada
        else if (chipUp === 'IGNORADAS') where.status = 'IGNORADA';
        else if (chipUp === 'TODAS') { /* sem filtro de situação */ }
        else if (status) where.status = status;

        // Filtro por tipo de nota (NFE = produto / NFSE = serviço)
        const tipoUp = String(tipo || '').toUpperCase();
        if (tipoUp === 'NFE' || tipoUp === 'NFSE') where.tipo = tipoUp;

        // Filtro por período de EMISSÃO (datas YYYY-MM-DD no fuso de São Paulo).
        // gte no início do dia inicial; lte no fim do dia final.
        const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
        const emissaoRange = {};
        if (isYMD(dataInicio)) emissaoRange.gte = new Date(`${dataInicio}T00:00:00-03:00`);
        if (isYMD(dataFim)) emissaoRange.lte = new Date(`${dataFim}T23:59:59.999-03:00`);
        if (emissaoRange.gte || emissaoRange.lte) where.emissao = emissaoRange;

        if (busca?.trim()) {
            const b = busca.trim();
            where.OR = [
                { chave: { contains: normalizarDoc(b) || b } },
                { numero: { contains: b, mode: 'insensitive' } },
                { fornecedorNome: { contains: b, mode: 'insensitive' } },
                { fornecedorCnpj: { contains: normalizarDoc(b) || b } },
                // produtos da nota (itens só existem após o XML completo chegar)
                {
                    itens: {
                        some: {
                            OR: [
                                { descricao: { contains: b, mode: 'insensitive' } },
                                { codigoFornecedor: { contains: b, mode: 'insensitive' } },
                                { ean: { contains: b.replace(/\D/g, '') || b } }
                            ]
                        }
                    }
                }
            ];
        }

        // Paginação: COM pagina/tamanhoPagina → página (skip/take); SEM → legado (até 500 numa página só).
        const tam = tamanhoPagina ? parseInt(tamanhoPagina) : 500;
        const pag = pagina ? parseInt(pagina) : 1;
        const skip = (pag - 1) * tam;

        const [notas, total, novas, aguardandoXml, captura, capturaNfse] = await Promise.all([
            prisma.notaEntrada.findMany({
                where,
                orderBy: [{ emissao: { sort: 'desc', nulls: 'last' } }, { criadoEm: 'desc' }],
                skip,
                take: tam
            }),
            prisma.notaEntrada.count({ where }),
            prisma.notaEntrada.count({ where: { status: 'NOVA' } }),
            prisma.notaEntrada.count({ where: { status: 'AGUARDANDO_XML' } }),
            sefazDfeService.statusCaptura(),
            nfseAdnService.statusCaptura()
        ]);

        res.json({
            statusCaptura: {
                ativa: captura.ativa,
                ultimaConsulta: captura.ultimaConsulta,
                ultimoResultado: captura.ultimoResultado,
                bloqueadoAte: captura.bloqueadoAte,
                novas,
                aguardandoXml
            },
            statusCapturaNfse: {
                ativa: capturaNfse.ativa,
                ultimaConsulta: capturaNfse.ultimaConsulta,
                ultimoResultado: capturaNfse.ultimoResultado,
                bloqueadoAte: capturaNfse.bloqueadoAte
            },
            notas: notas.map(formatarNotaLista),
            total
        });
    } catch (error) {
        console.error('Erro ao listar notas recebidas:', error);
        res.status(500).json({ error: 'Erro ao listar notas recebidas.' });
    }
});

// ── GET /itens-pcp — busca no catálogo de Produtos para o de-para ──
// Retorna { tipo:'PRODUTO', id, value:'PROD:<id>', nome, unidade, sub }.
// Só o catálogo de produtos (tabela `produto`) — insumos PCP NÃO entram aqui.
// Sem limite: a tela carrega tudo e filtra a busca no cliente. `?busca=` filtra também no banco.
router.get('/itens-pcp', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const busca = req.query.busca?.trim();
        const b = busca || '';

        const whereProd = { ativo: true };
        if (busca) {
            whereProd.OR = [
                { nome: { contains: b, mode: 'insensitive' } },
                { codigo: { contains: b, mode: 'insensitive' } },
                { ean: { contains: b, mode: 'insensitive' } }
            ];
        }

        const produtos = await prisma.produto.findMany({
            where: whereProd,
            select: { id: true, codigo: true, nome: true, unidade: true, categoria: true },
            orderBy: { nome: 'asc' }
        });

        const opcoes = produtos.map((p) => ({
            tipo: 'PRODUTO',
            id: p.id,
            value: `PROD:${p.id}`,
            nome: p.nome,
            unidade: p.unidade,
            sub: `Produto${p.codigo ? ` · ${p.codigo}` : ''}${p.categoria ? ` · ${p.categoria}` : ''}`
        }));

        res.json(opcoes);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
});

// ── POST /consultar-agora — dispara os ciclos de captura (NF-e e NFS-e) em background ──
// (antes de /:id para a rota não ser engolida pelo parâmetro)
router.post('/consultar-agora', verificarAuth, checkEscrita, async (req, res) => {
    try {
        // Manual: usa o piso de ~1h (não a cadência automática de 3h) — força a consulta se a SEFAZ já liberou.
        const [preNfe, preNfse] = await Promise.all([
            sefazDfeService.podeConsultar({ manual: true }),
            nfseAdnService.podeConsultar({ manual: true })
        ]);
        if (!preNfe.ok && !preNfse.ok) {
            const proxima = preNfe.proximaConsultaEm || preNfse.proximaConsultaEm || null;
            return res.json({ ok: false, iniciado: false, emEspera: !!(preNfe.emEspera || preNfse.emEspera), proximaConsultaEm: proxima, motivo: preNfe.motivo || preNfse.motivo });
        }

        if (preNfe.ok) {
            sefazDfeService.executarCiclo({ manual: true })
                .catch((e) => console.error('[NotasEntrada] Erro no ciclo manual NF-e:', e.message));
        }
        if (preNfse.ok) {
            nfseAdnService.executarCiclo({ manual: true })
                .catch((e) => console.error('[NotasEntrada] Erro no ciclo manual NFS-e:', e.message));
        }

        res.json({ ok: true, iniciado: true });
    } catch (error) {
        console.error('Erro ao iniciar consulta à SEFAZ:', error);
        res.status(500).json({ error: 'Erro ao iniciar consulta à SEFAZ.' });
    }
});

// Body parser dedicado do XML (o express.json global tem limite de 100kb; um XML de nota passa disso).
// type:()=>true → aceita o corpo em qualquer content-type (text/plain, application/xml…).
const bodyXml = express.text({ type: () => true, limit: '25mb' });

// ── POST /importar-xml — importa o XML de UMA nota (NF-e ou NFS-e do padrão nacional) ──
// Reaproveita a MESMA gravação da captura automática → a nota importada se comporta idêntica.
// Idempotente por chave: reimportar completa/atualiza sem duplicar.
router.post('/importar-xml', verificarAuth, checkEscrita, bodyXml, async (req, res) => {
    try {
        const xmlString = (typeof req.body === 'string' ? req.body : '').trim();
        if (!xmlString || !xmlString.includes('<')) {
            return res.status(400).json({ error: 'Envie o conteúdo de um arquivo XML de nota fiscal.' });
        }

        // Nosso CNPJ (do certificado ativo) — para recusar XML de nota que a PRÓPRIA empresa emitiu.
        let cnpjNosso = null;
        try {
            const cert = await prisma.certificadoDigital.findFirst({
                where: { ativo: true }, orderBy: { instaladoEm: 'desc' }, select: { cnpj: true }
            });
            cnpjNosso = cert?.cnpj ? normalizarDoc(cert.cnpj) : null;
        } catch { /* sem certificado: segue sem a checagem de nota própria */ }

        const ehNfse = /infNFSe/i.test(xmlString) || /<\s*NFSe[\s>]/i.test(xmlString);

        // 1) Parse (valida o XML e detecta nota própria ANTES de gravar).
        let chave, emitenteCnpj, tipoNota;
        try {
            if (ehNfse) {
                const p = nfseAdnService.parseNfse(xmlString);
                chave = p.chave; emitenteCnpj = p.prestador?.cnpj || ''; tipoNota = 'NFSE';
            } else {
                const p = sefazDfeService.parseProcNFe(xmlString);
                chave = p.chave; emitenteCnpj = p.emitente?.cnpj || ''; tipoNota = 'NFE';
            }
        } catch (e) {
            return res.status(422).json({
                error: ehNfse
                    ? 'Não consegui ler este XML de NFS-e. Muitas prefeituras usam um layout próprio, diferente do padrão nacional — nesse caso use a opção "Lançar manualmente".'
                    : `Não consegui ler este XML de NF-e: ${e.message}`
            });
        }

        const chaveMin = tipoNota === 'NFSE' ? 40 : 44;
        if (!chave || chave.length < chaveMin) {
            return res.status(422).json({ error: 'O XML não tem uma chave de acesso válida.' });
        }
        if (cnpjNosso && emitenteCnpj && emitenteCnpj === cnpjNosso) {
            return res.status(400).json({ error: 'Este XML é de uma nota que a SUA empresa emitiu (você é o emitente). Aqui entram só notas recebidas de fornecedores.' });
        }

        const existente = await prisma.notaEntrada.findUnique({ where: { chave } });

        // 2) Grava com a mesma função da captura automática (nsu=null: veio de upload manual).
        if (ehNfse) await nfseAdnService.registrarNfse(xmlString, null, cnpjNosso);
        else await sefazDfeService.registrarProcNFe(xmlString, null, cnpjNosso);

        const nota = await prisma.notaEntrada.findUnique({ where: { chave } });
        if (!nota) return res.status(500).json({ error: 'A nota não pôde ser gravada.' });

        res.status(existente ? 200 : 201).json({
            ok: true,
            jaExistia: !!existente,
            statusAnterior: existente?.status || null,
            nota: formatarNotaLista(nota)
        });
    } catch (error) {
        console.error('Erro ao importar XML de nota:', error);
        res.status(500).json({ error: 'Erro ao importar o XML da nota.' });
    }
});

// ── POST /lancar-manual — cria uma nota "na mão" quando não há XML legível ──
// (ex.: NFS-e de prefeitura fora do padrão nacional, que nunca chega sozinha).
// A nota entra como NOVA, pronta para conferir e gerar a despesa. Chave sintética
// (não vai ao Conta Azul — o CA usa o número da nota, não a chave).
router.post('/lancar-manual', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const body = req.body || {};
        const tipo = String(body.tipo || 'NFSE').toUpperCase() === 'NFE' ? 'NFE' : 'NFSE';
        const fornecedorNome = String(body.fornecedorNome || '').trim();
        const cnpj = normalizarDoc(body.fornecedorCnpj); // preserva letras do CNPJ alfanumérico
        const numero = body.numero ? String(body.numero).trim() : null;
        const valor = Number(body.valorTotal);
        const emissao = body.emissao;

        if (!fornecedorNome) return res.status(400).json({ error: 'Informe o nome do fornecedor.' });
        if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Informe o valor total da nota (maior que zero).' });
        if (!emissao || isNaN(new Date(emissao).getTime())) return res.status(400).json({ error: 'Informe uma data de emissão válida.' });

        // Fornecedor: reaproveita/cria (mesmo padrão da captura automática).
        let fornecedor = cnpj ? await prisma.fornecedor.findFirst({ where: { cnpjCpf: cnpj } }) : null;
        if (!fornecedor && cnpj) {
            fornecedor = await prisma.fornecedor.create({
                data: { cnpjCpf: cnpj, razaoSocial: fornecedorNome || `Fornecedor ${cnpj}`, origem: tipo, statusEnvioCA: 'NAO_ENVIAR' }
            });
        }

        // Evita duplicar o mesmo lançamento (fornecedor + número).
        if (numero && cnpj) {
            const dup = await prisma.notaEntrada.findFirst({
                where: { fornecedorCnpj: cnpj, numero, status: { not: 'CANCELADA_EMITENTE' } }
            });
            if (dup) return res.status(409).json({ error: `Já existe a nota ${dup.numero} deste fornecedor na lista (status ${dup.status}).` });
        }

        const chaveManual = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const descricao = String(body.descricao || '').trim()
            || (tipo === 'NFSE' ? 'Serviço (lançamento manual)' : 'Item (lançamento manual)');

        const nota = await prisma.notaEntrada.create({
            data: {
                tipo,
                chave: chaveManual,
                numero,
                fornecedorCnpj: cnpj || '',
                fornecedorNome,
                fornecedorId: fornecedor?.id || null,
                emissao: parseVencimento(emissao),
                valorTotal: round2(valor),
                status: 'NOVA',
                manifestada: true,
                infComplementar: 'Nota lançada manualmente (sem XML capturado).',
                itens: {
                    create: [{
                        numeroItem: 1,
                        codigoFornecedor: 'MANUAL',
                        descricao,
                        unidade: tipo === 'NFSE' ? 'SV' : 'UN',
                        quantidade: 1,
                        valorUnitario: round2(valor),
                        valorTotal: round2(valor)
                    }]
                }
            }
        });

        res.status(201).json({ ok: true, nota: formatarNotaLista(nota) });
    } catch (error) {
        console.error('Erro ao lançar nota manual:', error);
        res.status(500).json({ error: 'Erro ao lançar a nota manualmente.' });
    }
});

// ── POST /buscar-chave — busca UMA NF-e na SEFAZ pela chave de acesso (44 dígitos) ──
// Puxa a nota sem precisar do arquivo XML (a chave está na DANFE/boleto/e-mail).
// Só NF-e (SEFAZ) e só onde a empresa é a destinatária.
router.post('/buscar-chave', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const chave = normalizarChaveNFe(req.body?.chave); // 44 posições, pode ser alfanumérica
        if (!chave) {
            return res.status(400).json({ error: 'Informe a chave de acesso com 44 posições (está na DANFE, no boleto ou no e-mail da nota).' });
        }

        const jaExistente = await prisma.notaEntrada.findUnique({ where: { chave } });
        const r = await sefazDfeService.buscarPorChave(chave);
        if (!r.ok) {
            // Em espera (SEFAZ no intervalo) → o front oferece agendar. Não é erro: HTTP 200 com emEspera.
            if (r.emEspera) return res.json({ ok: false, emEspera: true, proximaConsultaEm: r.proximaConsultaEm || null, motivo: r.motivo });
            return res.status(422).json({ error: r.motivo || 'Não foi possível consultar a SEFAZ agora.' });
        }

        const nota = await prisma.notaEntrada.findUnique({ where: { chave } });
        if (!nota) {
            return res.status(404).json({ error: 'A SEFAZ não retornou essa nota. Confira a chave — e lembre que só dá para puxar notas em que a sua empresa é a destinatária.' });
        }

        res.status(jaExistente ? 200 : 201).json({
            ok: true,
            jaExistia: !!jaExistente,
            aguardandoXml: nota.status === 'AGUARDANDO_XML',
            nota: formatarNotaLista(nota)
        });
    } catch (error) {
        console.error('Erro ao buscar nota por chave:', error);
        res.status(500).json({ error: 'Erro ao buscar a nota pela chave.' });
    }
});

// ── POST /buscar-chave/agendar — agenda a busca por chave quando a SEFAZ está no intervalo de espera ──
// O worker processa quando liberar e a nota aparece sozinha na lista.
router.post('/buscar-chave/agendar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const chave = normalizarChaveNFe(req.body?.chave); // 44 posições, pode ser alfanumérica
        if (!chave) {
            return res.status(400).json({ error: 'Informe a chave de acesso com 44 posições.' });
        }
        // Se a nota já está na lista, não precisa agendar.
        const existente = await prisma.notaEntrada.findUnique({ where: { chave } });
        if (existente) {
            return res.json({ ok: true, jaExistia: true, nota: formatarNotaLista(existente) });
        }
        // Dedupe: se já houver uma pendente para a mesma chave, reaproveita.
        const pendente = await prisma.notaBuscaAgendada.findFirst({ where: { chave, status: 'PENDENTE' } });
        if (!pendente) {
            await prisma.notaBuscaAgendada.create({ data: { chave, criadoPorId: req.user.id } });
        }
        const status = await sefazDfeService.statusCaptura();
        res.status(201).json({ ok: true, agendada: true, proximaConsultaEm: status.proximaConsultaEm || null });
    } catch (error) {
        console.error('Erro ao agendar busca por chave:', error);
        res.status(500).json({ error: 'Erro ao agendar a busca pela chave.' });
    }
});

// ── GET /:id — detalhe da nota com itens (+ de-para lembrado) e duplicatas ──
router.get('/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: {
                fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true, contaAzulId: true } },
                itens: { orderBy: { numeroItem: 'asc' } },
                duplicatas: { orderBy: { vencimento: 'asc' } },
                parcelasVinculadas: {
                    orderBy: { criadoEm: 'asc' },
                    include: {
                        parcelaPagar: {
                            include: { contaPagar: { select: { id: true, descricao: true } } }
                        }
                    }
                }
            }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        // Parcelas já lançadas às quais esta nota foi vinculada (caminho "NF chegou depois").
        const contasVinculadas = [...new Set(nota.parcelasVinculadas.map((v) => v.parcelaPagar.contaPagarId))];
        const totaisPorConta = new Map();
        for (const contaId of contasVinculadas) {
            totaisPorConta.set(contaId, await prisma.parcelaPagar.count({
                where: { contaPagarId: contaId, status: { not: 'CANCELADO' } }
            }));
        }
        const parcelasVinculadas = nota.parcelasVinculadas.map((v) => ({
            parcelaPagarId: v.parcelaPagarId,
            contaPagarId: v.parcelaPagar.contaPagarId,
            descricao: v.parcelaPagar.contaPagar?.descricao || null,
            numeroParcela: v.parcelaPagar.numeroParcela,
            totalParcelas: totaisPorConta.get(v.parcelaPagar.contaPagarId) || null,
            dataVencimento: v.parcelaPagar.dataVencimento,
            valorParcela: num(v.parcelaPagar.valor),
            valorVinculado: num(v.valorVinculado),
            statusParcela: v.parcelaPagar.status,
            tipoDiferenca: v.tipoDiferenca,
            observacao: v.observacao
        }));
        const somaVinculada = round2(parcelasVinculadas.reduce((s, v) => s + (v.valorVinculado || 0), 0));

        // De-para lembrado: match por (fornecedorCnpj + codigoFornecedor), fallback EAN
        const vinculos = nota.fornecedorCnpj
            ? await prisma.fornecedorProdutoVinculo.findMany({
                where: { fornecedorCnpj: nota.fornecedorCnpj },
                include: {
                    itemPcp: { select: { id: true, nome: true, unidade: true } },
                    produto: { select: { id: true, nome: true, unidade: true } }
                }
            })
            : [];
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const porEan = new Map(vinculos.filter((v) => v.ean).map((v) => [v.ean, v]));

        // Parse ao vivo do XML salvo — só quando faltar algum dado no banco (notas antigas).
        const precisaXml = nota.infComplementar == null || nota.itens.some((i) => i.infAdProd == null);
        const parsed = precisaXml ? parseXmlSalvo(nota) : null;
        const parsedItens = new Map((parsed?.itens || []).map((i) => [String(i.codigoFornecedor), i]));

        const itens = nota.itens.map((item) => {
            const v = porCodigo.get(item.codigoFornecedor) || (item.ean ? porEan.get(item.ean) : null) || null;
            // Memória existe se houver vínculo de produto (Produto ou ItemPcp) OU categoria memorizada
            const temMemoria = v && (v.produtoId != null || v.itemPcpId != null || v.categoria != null || v.categoriaCaId != null);
            const px = parsedItens.get(String(item.codigoFornecedor));

            // Resolve o alvo do vínculo (Produto tem prioridade se ambos setados, mas gravamos só um)
            const alvo = v && v.produtoId
                ? { value: `PROD:${v.produtoId}`, nome: v.produto?.nome || null, unidade: v.produto?.unidade || null }
                : (v && v.itemPcpId
                    ? { value: `PCP:${v.itemPcpId}`, nome: v.itemPcp?.nome || null, unidade: v.itemPcp?.unidade || null }
                    : { value: null, nome: null, unidade: null });
            return {
                id: item.id,
                numeroItem: item.numeroItem,
                codigoFornecedor: item.codigoFornecedor,
                ean: item.ean,
                descricao: item.descricao,
                ncm: item.ncm,
                unidade: item.unidade,
                quantidade: num(item.quantidade),
                valorUnitario: num(item.valorUnitario),
                valorTotal: num(item.valorTotal),
                categoria: item.categoria || null,
                categoriaCaId: item.categoriaCaId || null,
                infAdProd: item.infAdProd || px?.infAdProd || null,
                vinculo: temMemoria
                    ? {
                        value: alvo.value,          // "PROD:<id>" | "PCP:<id>" | null
                        nome: alvo.nome,            // nome do produto/insumo vinculado
                        unidade: alvo.unidade,      // unidade "nossa" (para conversão/custo)
                        // legado — mantido para telas antigas de detalhe:
                        itemPcpId: v.itemPcpId || null,
                        itemPcpNome: alvo.nome,
                        itemPcpUnidade: alvo.unidade,
                        fatorConversao: num(v.fatorConversao),
                        categoria: v.categoria || null,
                        categoriaCaId: v.categoriaCaId || null,
                        lembrado: true
                    }
                    : null
            };
        });

        res.json({
            id: nota.id,
            tipo: nota.tipo,
            chave: nota.chave,
            nsu: nota.nsu,
            numero: nota.numero,
            serie: nota.serie,
            fornecedorCnpj: nota.fornecedorCnpj,
            fornecedorNome: nota.fornecedorNome,
            fornecedor: nota.fornecedor
                ? { id: nota.fornecedor.id, razaoSocial: nota.fornecedor.razaoSocial, nomeFantasia: nota.fornecedor.nomeFantasia, sincronizadoCA: !!nota.fornecedor.contaAzulId }
                : null,
            emissao: nota.emissao,
            valorTotal: num(nota.valorTotal),
            status: nota.status,
            manifestada: nota.manifestada,
            observacoes: nota.infComplementar || parsed?.infComplementar || null,
            temXml: !!nota.xmlPath,
            contaPagarId: nota.contaPagarId,
            criadoEm: nota.criadoEm,
            itens,
            duplicatas: nota.duplicatas.map((d) => ({
                numero: d.numero,
                vencimento: d.vencimento,
                valor: num(d.valor)
            })),
            parcelasVinculadas,
            somaVinculada
        });
    } catch (error) {
        console.error('Erro ao detalhar nota recebida:', error);
        res.status(500).json({ error: 'Erro ao detalhar nota recebida.' });
    }
});

// ── GET /:id/xml — download do XML completo ──
router.get('/:id/xml', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (!nota.xmlPath) return res.status(404).json({ error: 'O XML completo desta nota ainda não foi baixado da SEFAZ.' });

        const abs = path.isAbsolute(nota.xmlPath)
            ? nota.xmlPath
            : path.join(__dirname, '..', nota.xmlPath);
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Arquivo XML não encontrado no servidor.' });

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${nota.chave}.xml"`);
        fs.createReadStream(abs).pipe(res);
    } catch (error) {
        console.error('Erro ao baixar XML da nota:', error);
        res.status(500).json({ error: 'Erro ao baixar o XML da nota.' });
    }
});

// ── GET /:id/danfe — DANFE (NF-e) ou espelho da NFS-e em HTML, do XML salvo ──
router.get('/:id/danfe', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        const abs = xmlAbsPath(nota);
        if (!fs.existsSync(abs)) {
            return res.status(404).json({ error: 'O XML completo desta nota ainda não foi baixado — não é possível gerar a impressão.' });
        }

        let html;
        try {
            const xmlString = fs.readFileSync(abs, 'utf8');
            html = nota.tipo === 'NFSE'
                ? nfseAdnService.montarEspelhoNfseHtml(xmlString)
                : montarDanfeHtml(xmlString); // recebe a STRING crua do XML e parseia tudo internamente
        } catch (e) {
            return res.status(422).json({ error: `Não foi possível ler o XML da nota: ${e.message}` });
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Erro ao gerar DANFE da nota:', error);
        res.status(500).json({ error: 'Erro ao gerar a DANFE da nota.' });
    }
});

// =============================================================
// VINCULAR NOTA A PARCELA(S) JÁ LANÇADA(S)
// Caminho alternativo ao "gerar despesa nova": o contrato/serviço já foi lançado
// (às vezes já pago) e a NF só chega depois. Vincular NÃO cria conta a pagar.
// =============================================================

// ── GET /:id/parcelas-compativeis — parcelas candidatas para vincular ──
// Padrão: parcelas do MESMO fornecedor da nota (inclusive PAGAS).
// Com ?busca= procura em QUALQUER fornecedor (fallback quando o CNPJ não bate).
router.get('/:id/parcelas-compativeis', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        const busca = String(req.query.busca || '').trim();

        const whereParcela = {
            status: { not: 'CANCELADO' },
            contaPagar: { status: { not: 'CANCELADO' } }
        };

        if (busca) {
            // Busca livre: qualquer fornecedor (descrição da conta, nº da nota, nome do fornecedor)
            whereParcela.contaPagar = {
                status: { not: 'CANCELADO' },
                OR: [
                    { descricao: { contains: busca, mode: 'insensitive' } },
                    { numeroNota: { contains: busca, mode: 'insensitive' } },
                    { fornecedor: { razaoSocial: { contains: busca, mode: 'insensitive' } } },
                    { fornecedor: { nomeFantasia: { contains: busca, mode: 'insensitive' } } }
                ]
            };
        } else {
            // Padrão: só o fornecedor da nota (por fornecedorId ou por CNPJ normalizado)
            const ids = new Set();
            if (nota.fornecedorId) ids.add(nota.fornecedorId);
            const cnpj = normalizarDoc(nota.fornecedorCnpj);
            if (cnpj) {
                const forns = await prisma.fornecedor.findMany({ where: { cnpjCpf: cnpj }, select: { id: true } });
                forns.forEach((f) => ids.add(f.id));
            }
            if (ids.size === 0) {
                return res.json({ notaValor: num(nota.valorTotal), jaVinculadoTotal: 0, parcelas: [] });
            }
            whereParcela.contaPagar = { status: { not: 'CANCELADO' }, fornecedorId: { in: [...ids] } };
        }

        const parcelas = await prisma.parcelaPagar.findMany({
            where: whereParcela,
            orderBy: { dataVencimento: 'asc' },
            take: 300,
            include: {
                contaPagar: {
                    select: {
                        id: true, descricao: true, categoria: true,
                        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
                    }
                },
                notasVinculadas: { include: { notaEntrada: { select: { id: true, numero: true } } } }
            }
        });

        // Quantas parcelas (não canceladas) cada conta tem — para exibir "2/12"
        const contaIds = [...new Set(parcelas.map((p) => p.contaPagarId))];
        const totais = contaIds.length
            ? await prisma.parcelaPagar.groupBy({
                by: ['contaPagarId'],
                where: { contaPagarId: { in: contaIds }, status: { not: 'CANCELADO' } },
                _count: { _all: true }
            })
            : [];
        const totalPorConta = new Map(totais.map((t) => [t.contaPagarId, t._count._all]));

        const jaVinculadoTotal = round2(
            parcelas.reduce((s, p) => s + p.notasVinculadas
                .filter((v) => v.notaEntradaId === nota.id)
                .reduce((s2, v) => s2 + Number(v.valorVinculado), 0), 0)
        );

        res.json({
            notaValor: num(nota.valorTotal),
            jaVinculadoTotal,
            parcelas: parcelas.map((p) => ({
                parcelaPagarId: p.id,
                contaPagarId: p.contaPagarId,
                descricao: p.contaPagar?.descricao || null,
                categoria: p.contaPagar?.categoria || null,
                numeroParcela: p.numeroParcela,
                totalParcelas: totalPorConta.get(p.contaPagarId) || null,
                dataVencimento: p.dataVencimento,
                valor: num(p.valor),
                status: p.status,
                fornecedorNome: p.contaPagar?.fornecedor?.razaoSocial || p.contaPagar?.fornecedor?.nomeFantasia || null,
                saldoDisponivel: calcularSaldoDisponivel(p.valor, p.notasVinculadas, nota.id),
                notasVinculadas: p.notasVinculadas.map((v) => ({
                    notaEntradaId: v.notaEntradaId,
                    numero: v.notaEntrada?.numero || null,
                    valorVinculado: num(v.valorVinculado)
                }))
            }))
        });
    } catch (error) {
        console.error('Erro ao listar parcelas compatíveis:', error);
        res.status(500).json({ error: 'Erro ao listar as parcelas compatíveis.' });
    }
});

// ── POST /:id/vincular-parcelas — anexa a nota a parcela(s) já existente(s) ──
// Body: { vinculos:[{ parcelaPagarId, valorVinculado }], acaoDiferenca, observacao? }
router.post('/:id/vincular-parcelas', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { vinculos, acaoDiferenca, observacao } = req.body || {};

        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (!['NOVA', 'VINCULADA'].includes(nota.status)) {
            return res.status(400).json({ error: `Só é possível vincular nota com status NOVA ou VINCULADA (status atual: ${nota.status}).` });
        }

        if (!Array.isArray(vinculos) || vinculos.length === 0) {
            return res.status(400).json({ error: 'Selecione ao menos uma parcela para vincular.' });
        }
        const acao = String(acaoDiferenca || 'NENHUMA').toUpperCase();
        if (!ACOES_DIFERENCA.includes(acao)) {
            return res.status(400).json({ error: 'Ação para a diferença inválida (use NENHUMA, AJUSTAR_PARCELA, DESCONTO ou ACRESCIMO).' });
        }

        // Normaliza e valida os valores
        const pedidos = [];
        const vistos = new Set();
        for (const v of vinculos) {
            const parcelaPagarId = String(v?.parcelaPagarId || '');
            const valorVinculado = round2(Number(v?.valorVinculado));
            if (!parcelaPagarId) return res.status(400).json({ error: 'Vínculo sem parcela informada.' });
            if (vistos.has(parcelaPagarId)) return res.status(400).json({ error: 'A mesma parcela foi enviada duas vezes.' });
            vistos.add(parcelaPagarId);
            if (!Number.isFinite(valorVinculado) || valorVinculado <= 0) {
                return res.status(400).json({ error: 'Todo vínculo precisa de um valor maior que zero.' });
            }
            pedidos.push({ parcelaPagarId, valorVinculado });
        }

        const parcelas = await prisma.parcelaPagar.findMany({
            where: { id: { in: pedidos.map((p) => p.parcelaPagarId) } },
            include: {
                contaPagar: { select: { id: true, status: true } },
                pagamentos: { where: { estornado: false } },
                notasVinculadas: true
            }
        });
        const porId = new Map(parcelas.map((p) => [p.id, p]));

        for (const pedido of pedidos) {
            const parcela = porId.get(pedido.parcelaPagarId);
            if (!parcela) return res.status(400).json({ error: 'Uma das parcelas selecionadas não existe mais.' });
            if (parcela.status === 'CANCELADO') {
                return res.status(400).json({ error: `A parcela ${parcela.numeroParcela} está cancelada e não pode receber nota.` });
            }
            if (parcela.contaPagar?.status === 'CANCELADO') {
                return res.status(400).json({ error: `A despesa da parcela ${parcela.numeroParcela} está cancelada e não pode receber nota.` });
            }
            const saldo = calcularSaldoDisponivel(parcela.valor, parcela.notasVinculadas, nota.id);
            if (pedido.valorVinculado > saldo + 0.01) {
                return res.status(400).json({
                    error: `O valor vinculado à parcela ${parcela.numeroParcela} (R$ ${pedido.valorVinculado.toFixed(2)}) passa do que ainda está livre nela (R$ ${saldo.toFixed(2)}) — outra nota já ocupa parte dessa parcela.`
                });
            }
        }

        const somaVinculada = round2(pedidos.reduce((s, p) => s + p.valorVinculado, 0));
        const valorNota = nota.valorTotal != null ? round2(Number(nota.valorTotal)) : null;
        if (valorNota != null && somaVinculada > valorNota + 0.01) {
            return res.status(400).json({
                error: `A soma vinculada (R$ ${somaVinculada.toFixed(2)}) não pode passar do valor da nota (R$ ${valorNota.toFixed(2)}).`
            });
        }

        const tipoDiferenca = tipoDiferencaDaAcao(acao);
        const obs = observacao?.trim() || null;
        const avisos = [];

        // Parcelas que o ajuste NÃO pode tocar (já pagas) — só avisamos.
        const pagasIgnoradas = acao === 'AJUSTAR_PARCELA'
            ? pedidos.map((p) => porId.get(p.parcelaPagarId)).filter(parcelaEstaPaga)
            : [];
        if (pagasIgnoradas.length > 0) {
            avisos.push(`Parcela(s) já paga(s) não tiveram o valor ajustado: ${pagasIgnoradas.map((p) => `nº ${p.numeroParcela}`).join(', ')}.`);
        }

        await prisma.$transaction(async (tx) => {
            const contasAfetadas = new Set();

            for (const pedido of pedidos) {
                const parcela = porId.get(pedido.parcelaPagarId);
                await tx.notaEntradaParcela.upsert({
                    where: {
                        notaEntradaId_parcelaPagarId: {
                            notaEntradaId: nota.id,
                            parcelaPagarId: pedido.parcelaPagarId
                        }
                    },
                    update: { valorVinculado: pedido.valorVinculado, tipoDiferenca, observacao: obs },
                    create: {
                        notaEntradaId: nota.id,
                        parcelaPagarId: pedido.parcelaPagarId,
                        valorVinculado: pedido.valorVinculado,
                        tipoDiferenca,
                        observacao: obs
                    }
                });

                // Ajuste do valor da parcela — só nas NÃO pagas.
                if (acao === 'AJUSTAR_PARCELA' && !parcelaEstaPaga(parcela)) {
                    await tx.parcelaPagar.update({
                        where: { id: parcela.id },
                        data: { valor: pedido.valorVinculado }
                    });
                    contasAfetadas.add(parcela.contaPagarId);
                }
            }

            // Recalcula total e status das contas cujas parcelas mudaram de valor.
            for (const contaId of contasAfetadas) {
                const todas = await tx.parcelaPagar.findMany({
                    where: { contaPagarId: contaId, status: { not: 'CANCELADO' } }
                });
                const novoTotal = round2(todas.reduce((s, p) => s + Number(p.valor), 0));
                const novoStatus = contasPagarCaSyncService.calcularStatusContaPagar(todas);
                const conta = await tx.contaPagar.findUnique({ where: { id: contaId }, select: { status: true } });
                await tx.contaPagar.update({
                    where: { id: contaId },
                    data: {
                        valorTotal: novoTotal,
                        ...(conta && conta.status !== 'CANCELADO' ? { status: novoStatus } : {})
                    }
                });
            }

            // A nota vira VINCULADA. contaPagarId NÃO é tocado (é do fluxo "gerou despesa nova").
            await tx.notaEntrada.update({ where: { id: nota.id }, data: { status: 'VINCULADA' } });
        }, { timeout: 20000, maxWait: 10000 });

        // Total vinculado a esta nota DEPOIS da operação (pode incluir vínculos anteriores).
        const todosVinculos = await prisma.notaEntradaParcela.findMany({ where: { notaEntradaId: nota.id } });
        const totalVinculado = round2(todosVinculos.reduce((s, v) => s + Number(v.valorVinculado), 0));
        const diferenca = valorNota != null ? round2(valorNota - totalVinculado) : null;

        if (diferenca != null && Math.abs(diferenca) > 0.01 && acao === 'NENHUMA') {
            avisos.push(`Sobrou diferença de R$ ${diferenca.toFixed(2)} entre o valor da nota e o que foi vinculado (registrada, sem alterar as parcelas).`);
        }

        // Log/side-effect fora da transação (nunca derruba a operação principal).
        googleDriveService.salvarXmlNota(nota, xmlAbsPath(nota))
            .catch((err) => console.error('[NotasEntrada] Drive (vincular-parcelas):', err?.message || err));

        res.json({
            ok: true,
            message: 'Nota vinculada à(s) parcela(s) existente(s). Nenhuma despesa nova foi criada.',
            vinculadas: pedidos.length,
            somaVinculada: totalVinculado,
            valorNota,
            diferenca,
            avisos
        });
    } catch (error) {
        console.error('Erro ao vincular nota a parcelas:', error);
        res.status(500).json({ error: 'Erro ao vincular a nota às parcelas.' });
    }
});

// ── POST /:id/desvincular-parcelas — remove um vínculo (ou todos) ──
// Body opcional: { parcelaPagarId }. NÃO desfaz ajustes de valor já aplicados.
router.post('/:id/desvincular-parcelas', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        const parcelaPagarId = req.body?.parcelaPagarId ? String(req.body.parcelaPagarId) : null;
        const where = { notaEntradaId: nota.id, ...(parcelaPagarId ? { parcelaPagarId } : {}) };

        const existentes = await prisma.notaEntradaParcela.findMany({ where });
        if (existentes.length === 0) {
            return res.status(400).json({ error: 'Não há vínculo para remover nesta nota.' });
        }

        let restantes = 0;
        await prisma.$transaction(async (tx) => {
            await tx.notaEntradaParcela.deleteMany({ where });
            restantes = await tx.notaEntradaParcela.count({ where: { notaEntradaId: nota.id } });
            if (restantes === 0) {
                await tx.notaEntrada.update({
                    where: { id: nota.id },
                    data: { status: nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML' }
                });
            }
        }, { timeout: 20000, maxWait: 10000 });

        res.json({
            ok: true,
            message: parcelaPagarId ? 'Vínculo removido.' : 'Todos os vínculos foram removidos.',
            removidos: existentes.length,
            restantes,
            status: restantes === 0 ? (nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML') : 'VINCULADA',
            aviso: 'Se o valor de alguma parcela tinha sido ajustado no vínculo, ele NÃO volta sozinho — confira em Contas a Pagar.'
        });
    } catch (error) {
        console.error('Erro ao desvincular nota de parcelas:', error);
        res.status(500).json({ error: 'Erro ao remover o vínculo da nota.' });
    }
});

// ── Gera o próximo código sequencial de item PCP por tipo (ex.: MP-001) ──
const proximoCodigoItemPcp = async (tx, tipo) => {
    const prefixo = `${tipo}-`;
    const existentes = await tx.itemPcp.findMany({
        where: { codigo: { startsWith: prefixo } },
        select: { codigo: true }
    });
    let maior = 0;
    const re = new RegExp(`^${tipo}-(\\d+)$`);
    for (const it of existentes) {
        const m = re.exec(it.codigo);
        if (m) maior = Math.max(maior, parseInt(m[1], 10));
    }
    return `${prefixo}${String(maior + 1).padStart(3, '0')}`;
};

// Decodifica o vínculo unificado "PROD:<id>" / "PCP:<id>" → { produtoId, itemPcpId } (o não usado = null)
const decodeVinculo = (value) => {
    const s = String(value || '');
    if (s.startsWith('PROD:')) return { produtoId: s.slice(5) || null, itemPcpId: null };
    if (s.startsWith('PCP:')) return { produtoId: null, itemPcpId: s.slice(4) || null };
    return { produtoId: null, itemPcpId: null };
};

// ── POST /:id/gerar-conta — cria a Conta a Pagar a partir da nota ──
router.post('/:id/gerar-conta', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { categoriaPadrao, categoriaPadraoCaId, enviarCA, observacoes, parcelas, itens,
                metodoPagamento, contaFinanceiraCaId, pago, dataPagamento } = req.body;
        // Forma/banco/"já paguei" seguem capturados localmente (saldos); o ENVIO ao CA só ocorre
        // se o app não estiver em modo somente-leitura.
        const enviarCAefetivo = enviarCA && !CA_SOMENTE_LEITURA;

        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: { itens: true, fornecedor: true }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.contaPagarId) return res.status(400).json({ error: 'Esta nota já tem uma conta a pagar gerada.' });
        // Nota já anexada a parcela(s) existente(s): gerar despesa nova duplicaria a dívida.
        const jaVinculada = await prisma.notaEntradaParcela.count({ where: { notaEntradaId: nota.id } });
        if (jaVinculada > 0) {
            return res.status(400).json({ error: 'Esta nota já está vinculada a parcela(s) existente(s). Desvincule antes de gerar uma despesa nova.' });
        }
        if (nota.status !== 'NOVA') {
            return res.status(400).json({ error: `Só é possível gerar conta de nota com status NOVA (status atual: ${nota.status}).` });
        }

        // ── Parcelas ──
        if (!Array.isArray(parcelas) || parcelas.length === 0) {
            return res.status(400).json({ error: 'Informe ao menos uma parcela.' });
        }
        for (const p of parcelas) {
            const valor = Number(p?.valor);
            if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Toda parcela precisa de um valor maior que zero.' });
            if (!p?.dataVencimento || isNaN(new Date(p.dataVencimento).getTime())) return res.status(400).json({ error: 'Toda parcela precisa de uma data de vencimento válida.' });
        }
        const somaParcelas = round2(parcelas.reduce((s, p) => s + Number(p.valor), 0));
        if (nota.valorTotal != null && Math.abs(somaParcelas - Number(nota.valorTotal)) > 0.01) {
            return res.status(400).json({
                error: `A soma das parcelas (R$ ${somaParcelas.toFixed(2)}) precisa ser igual ao total da nota (R$ ${Number(nota.valorTotal).toFixed(2)}).`
            });
        }

        // ── Fornecedor (garantia extra — normalmente já veio da captura) ──
        let fornecedor = nota.fornecedor;
        if (!fornecedor && nota.fornecedorCnpj) {
            fornecedor = await prisma.fornecedor.findFirst({ where: { cnpjCpf: nota.fornecedorCnpj } });
            if (!fornecedor) {
                fornecedor = await prisma.fornecedor.create({
                    data: {
                        cnpjCpf: nota.fornecedorCnpj,
                        razaoSocial: nota.fornecedorNome || `Fornecedor ${nota.fornecedorCnpj}`,
                        origem: nota.tipo === 'NFSE' ? 'NFSE' : 'NFE',
                        statusEnvioCA: 'NAO_ENVIAR'
                    }
                });
            }
        }
        if (enviarCA && !fornecedor) {
            return res.status(400).json({ error: 'Para enviar ao Conta Azul é obrigatório a nota ter fornecedor identificado.' });
        }

        // ── Condição de pagamento (forma + banco) — OBRIGATÓRIA ao enviar ao Conta Azul.
        // Vai no payload da despesa (metodo_pagamento + conta_financeira de cada parcela).
        // Se "pago" = true ("já paguei"), também registra a baixa e marca para quitar no CA.
        let condicaoCA = null; // { metodoPagamento, contaFinanceiraCaId }
        let pagto = null;      // preenchido só quando "já paguei"
        if (enviarCA) {
            const metodo = String(metodoPagamento || '').toUpperCase();
            if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) {
                return res.status(400).json({ error: 'Escolha a forma de pagamento.' });
            }
            if (!contaFinanceiraCaId) {
                return res.status(400).json({ error: 'Escolha o banco/caixa da despesa.' });
            }
            condicaoCA = { metodoPagamento: metodo, contaFinanceiraCaId: String(contaFinanceiraCaId) };
            if (pago) {
                if (!dataPagamento || isNaN(new Date(dataPagamento).getTime())) {
                    return res.status(400).json({ error: 'Informe uma data de pagamento válida.' });
                }
                pagto = { ...condicaoCA, dataPagamento: parseVencimento(dataPagamento) };
            }
        }

        // ── Validação dos itens do de-para ──
        const itensBody = Array.isArray(itens) ? itens : [];
        const itensNota = new Map(nota.itens.map((i) => [i.id, i]));
        for (const it of itensBody) {
            if (!it?.itemId || !itensNota.has(it.itemId)) {
                return res.status(400).json({ error: 'Item informado não pertence a esta nota.' });
            }
            if (it.criarItemPcp) {
                const { nome, tipo, unidade } = it.criarItemPcp;
                if (!nome?.trim()) return res.status(400).json({ error: 'Informe o nome do novo item PCP.' });
                if (!['MP', 'SUB', 'PA', 'EMB'].includes(tipo)) return res.status(400).json({ error: 'Tipo do novo item PCP inválido (use MP, SUB, PA ou EMB).' });
                if (!unidade?.trim()) return res.status(400).json({ error: 'Informe a unidade do novo item PCP.' });
            }
        }

        const catPadrao = categoriaPadrao?.trim() || null;
        const catPadraoCaId = categoriaPadraoCaId || null;
        const porItemId = new Map(itensBody.map((it) => [it.itemId, it]));

        // ── Categoria efetiva de cada item (própria ou padrão) para o rateio ──
        const itensParaRateio = nota.itens.map((itemNota) => {
            const body = porItemId.get(itemNota.id);
            return {
                categoria: body?.categoria?.trim() || catPadrao,
                categoriaCaId: body?.categoriaCaId || catPadraoCaId,
                vProd: Number(itemNota.valorTotal) || 0
            };
        });

        // vNF = total da nota (fallback para soma das parcelas quando a nota não tem valor)
        const vNF = nota.valorTotal != null ? Number(nota.valorTotal) : somaParcelas;
        const rateio = calcularRateio(vNF, itensParaRateio, { categoria: catPadrao, categoriaCaId: catPadraoCaId });

        // ── Ao enviar ao CA, todo grupo precisa de categoriaCaId ──
        if (enviarCA) {
            const gruposSemCa = rateio.filter((g) => !g.categoriaCaId);
            if (gruposSemCa.length > 0) {
                const nomes = gruposSemCa.map((g) => g.categoria || '(sem categoria)').join(', ');
                return res.status(400).json({
                    error: `Para enviar à Conta Azul, defina a categoria (da lista da Conta Azul) dos itens: ${nomes}`
                });
            }
        }

        // ── Categoria/ID resultantes da conta (único grupo → aquele; senão "Vários") ──
        const categoriaConta = rateio.length === 1 ? (rateio[0].categoria || null) : 'Vários';
        const categoriaContaCaId = rateio.length === 1 ? (rateio[0].categoriaCaId || null) : null;

        let contaCriada;
        const entradasEstoque = []; // Fase 6: itens vinculados → entrada de estoque/custo após a transação
        await prisma.$transaction(async (tx) => {
            // 1) Cria itens PCP pedidos, resolve o de-para e memoriza produto+categoria
            for (const it of itensBody) {
                const itemNota = itensNota.get(it.itemId);

                // Decodifica o vínculo unificado (PROD:/PCP:) ou cria um ItemPcp novo.
                let { produtoId, itemPcpId } = decodeVinculo(it.vinculo);
                if (!produtoId && !itemPcpId && it.criarItemPcp) {
                    const codigo = await proximoCodigoItemPcp(tx, it.criarItemPcp.tipo);
                    const novo = await tx.itemPcp.create({
                        data: {
                            codigo,
                            nome: it.criarItemPcp.nome.trim(),
                            tipo: it.criarItemPcp.tipo,
                            unidade: it.criarItemPcp.unidade.trim().toUpperCase(),
                            ativo: true
                        }
                    });
                    itemPcpId = novo.id;
                }
                const temProduto = !!(produtoId || itemPcpId);
                if (temProduto && nota.tipo !== 'NFSE') {
                    entradasEstoque.push({
                        itemNota,
                        produtoId: produtoId || null,
                        itemPcpId: itemPcpId || null,
                        fator: Number(it.fatorConversao) > 0 ? round4(it.fatorConversao) : 1
                    });
                }

                const catItem = it.categoria?.trim() || catPadrao;
                const catItemCaId = it.categoriaCaId || catPadraoCaId;

                // Persiste categoria efetiva no item da nota
                await tx.notaEntradaItem.update({
                    where: { id: itemNota.id },
                    data: { categoria: catItem, categoriaCaId: catItemCaId }
                });

                // Memória por fornecedor+cProd: grava se houver produto OU categoria
                const temCategoria = !!(catItem || catItemCaId);
                if (!nota.fornecedorCnpj || (!temProduto && !temCategoria)) continue;

                const fator = Number(it.fatorConversao) > 0 ? round4(it.fatorConversao) : 1;
                // update parcial: preserva campos existentes (não apaga memória de produto ao salvar só categoria)
                const updateData = {
                    ean: itemNota.ean,
                    descricaoFornecedor: itemNota.descricao,
                    unidadeFornecedor: itemNota.unidade
                };
                // Ao (re)vincular, define explicitamente o campo não usado como null — nunca deixa os dois setados.
                if (temProduto) {
                    updateData.produtoId = produtoId || null;
                    updateData.itemPcpId = itemPcpId || null;
                    updateData.fatorConversao = fator;
                }
                if (temCategoria) { updateData.categoria = catItem; updateData.categoriaCaId = catItemCaId; }

                await tx.fornecedorProdutoVinculo.upsert({
                    where: {
                        fornecedorCnpj_codigoFornecedor: {
                            fornecedorCnpj: nota.fornecedorCnpj,
                            codigoFornecedor: itemNota.codigoFornecedor
                        }
                    },
                    update: updateData,
                    create: {
                        fornecedorCnpj: nota.fornecedorCnpj,
                        codigoFornecedor: itemNota.codigoFornecedor,
                        ean: itemNota.ean,
                        descricaoFornecedor: itemNota.descricao,
                        unidadeFornecedor: itemNota.unidade,
                        produtoId: produtoId || null,
                        itemPcpId: itemPcpId || null,
                        fatorConversao: temProduto ? fator : 1,
                        categoria: temCategoria ? catItem : null,
                        categoriaCaId: temCategoria ? catItemCaId : null
                    }
                });
            }

            // 2) Cria a conta a pagar + parcelas + rateio
            contaCriada = await tx.contaPagar.create({
                data: {
                    fornecedorId: fornecedor?.id || null,
                    descricao: `${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${fornecedor?.razaoSocial || nota.fornecedorNome}`,
                    categoria: categoriaConta,
                    categoriaCaId: categoriaContaCaId,
                    numeroNota: nota.numero,
                    chaveNfe: nota.chave,
                    origem: nota.tipo === 'NFSE' ? 'NFSE' : 'NFE',
                    competencia: nota.emissao,
                    observacoes: observacoes?.trim() || null,
                    valorTotal: somaParcelas,
                    status: 'ABERTO',
                    statusEnvioCA: enviarCAefetivo ? 'ENVIAR' : 'NAO_ENVIAR',
                    metodoPagamentoCA: condicaoCA?.metodoPagamento || null,
                    contaFinanceiraCaId: condicaoCA?.contaFinanceiraCaId || null,
                    criadoPorId: req.user.id,
                    parcelas: {
                        create: parcelas.map((p, i) => ({
                            numeroParcela: i + 1,
                            valor: round2(p.valor),
                            dataVencimento: parseVencimento(p.dataVencimento)
                        }))
                    },
                    rateios: {
                        create: rateio.map((g) => ({
                            categoria: g.categoria || null,
                            categoriaCaId: g.categoriaCaId || null,
                            valor: round2(g.valor)
                        }))
                    }
                }
            });

            // 3) Fornecedor sem vínculo no CA entra na fila de envio (o worker cria lá primeiro)
            if (enviarCAefetivo && fornecedor && !fornecedor.contaAzulId && ['NAO_ENVIAR', 'ERRO'].includes(fornecedor.statusEnvioCA)) {
                await tx.fornecedor.update({
                    where: { id: fornecedor.id },
                    data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
                });
            }

            // 3.5) "Já paguei": registra o pagamento (baixa) local em cada parcela e marca para
            // empurrar a baixa ao CA (o worker faz isso depois de mapear a parcela no CA).
            if (pagto) {
                const parcelasCriadas = await tx.parcelaPagar.findMany({
                    where: { contaPagarId: contaCriada.id },
                    orderBy: { numeroParcela: 'asc' }
                });
                const labelMetodo = contasPagarCaSyncService.METODOS_PAGAMENTO_BAIXA
                    .find((m) => m.value === pagto.metodoPagamento)?.label || pagto.metodoPagamento;
                for (const p of parcelasCriadas) {
                    await tx.pagamentoParcelaPagar.create({
                        data: {
                            parcelaPagarId: p.id,
                            valorPago: round2(p.valor),
                            dataPagamento: pagto.dataPagamento,
                            formaPagamento: pagto.metodoPagamento,       // enum do CA (empurrado como metodo_pagamento)
                            contaFinanceiraCaId: pagto.contaFinanceiraCaId,
                            statusEnvioCA: enviarCAefetivo ? 'ENVIAR' : 'NAO_ENVIAR', // worker empurra a baixa ao CA (só se envio ligado)
                            origem: 'MANUAL',
                            observacao: `Pago na entrada da nota (${labelMetodo}).`,
                            registradoPorId: req.user.id
                        }
                    });
                    await contasPagarCaSyncService.recalcularParcelaEConta(tx, p.id);
                }
            }

            // 4) Nota conferida e vinculada à conta
            await tx.notaEntrada.update({
                where: { id: nota.id },
                data: { status: 'CONFERIDA', contaPagarId: contaCriada.id, fornecedorId: fornecedor?.id || nota.fornecedorId }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // 5) Salva o XML na pasta do mês na Contabilidade (Drive) — best-effort, não bloqueia a entrada.
        googleDriveService.salvarXmlNota(nota, xmlAbsPath(nota))
            .catch((err) => console.error('[NotasEntrada] Drive (gerar-conta):', err?.message || err));

        // 6) Fase 6 — itens vinculados dão ENTRADA no estoque, atualizam o custo e
        // alimentam o histórico de compras. Best-effort: falha aqui NÃO desfaz a conta.
        let estoque = { registradas: 0, avisos: [] };
        if (entradasEstoque.length > 0) {
            try {
                const compraEstoqueService = require('../services/compraEstoqueService');
                estoque = await compraEstoqueService.registrarEntradasCompra(
                    nota, contaCriada.id, entradasEstoque, req.user.id
                );
            } catch (e) {
                console.error('[NotasEntrada] Falha geral na entrada de estoque:', e.message);
                estoque.avisos.push('Falha na entrada de estoque — ajuste manualmente se necessário.');
            }
        }

        res.status(201).json({
            message: pagto
                ? (enviarCAefetivo
                    ? 'Conta a pagar criada como PAGA — será marcada como quitada no Conta Azul!'
                    : 'Conta a pagar criada e já quitada!')
                : (enviarCAefetivo
                    ? 'Conta a pagar criada e colocada na fila de envio ao Conta Azul!'
                    : 'Conta a pagar criada!'),
            contaPagarId: contaCriada.id,
            notaStatus: 'CONFERIDA',
            estoque: { entradas: estoque.registradas, avisos: estoque.avisos }
        });
    } catch (error) {
        console.error('Erro ao gerar conta a pagar da nota:', error);
        res.status(500).json({ error: 'Erro ao gerar a conta a pagar da nota.' });
    }
});

// ── POST /:id/ignorar ──
router.post('/:id/ignorar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (!['NOVA', 'AGUARDANDO_XML'].includes(nota.status)) {
            return res.status(400).json({ error: `Nota com status ${nota.status} não pode ser ignorada.` });
        }
        await prisma.notaEntrada.update({ where: { id: nota.id }, data: { status: 'IGNORADA' } });
        // XML da ignorada vai para a subpasta "Ignoradas" do mês (Drive) — best-effort.
        if (nota.xmlPath) {
            googleDriveService.salvarXmlNota(nota, xmlAbsPath(nota), { ignorada: true })
                .catch((err) => console.error('[NotasEntrada] Drive (ignorar):', err?.message || err));
        }
        res.json({ message: 'Nota ignorada.', status: 'IGNORADA' });
    } catch (error) {
        console.error('Erro ao ignorar nota:', error);
        res.status(500).json({ error: 'Erro ao ignorar a nota.' });
    }
});

// ── POST /:id/reativar ──
router.post('/:id/reativar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.status !== 'IGNORADA') {
            return res.status(400).json({ error: 'Só notas ignoradas podem ser reativadas.' });
        }
        const novoStatus = nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML';
        await prisma.notaEntrada.update({ where: { id: nota.id }, data: { status: novoStatus } });
        res.json({ message: 'Nota reativada.', status: novoStatus });
    } catch (error) {
        console.error('Erro ao reativar nota:', error);
        res.status(500).json({ error: 'Erro ao reativar a nota.' });
    }
});

// ── POST /:id/cancelar-conferencia — desfaz a entrada gerada e reabre a nota ──
// Usado quando a conferência saiu errada (produto/categoria/parcela errados).
// Cancela a Conta a Pagar gerada e devolve a nota para NOVA (dá para conferir de novo).
router.post('/:id/cancelar-conferencia', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: {
                contaPagar: {
                    include: { parcelas: { include: { pagamentos: { where: { estornado: false } } } } }
                }
            }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.status !== 'CONFERIDA' || !nota.contaPagarId) {
            return res.status(400).json({ error: 'Só uma entrada já gerada pode ser cancelada.' });
        }
        const conta = nota.contaPagar;
        const temPagamento = (conta?.parcelas || []).some((p) => (p.pagamentos || []).length > 0);
        if (temPagamento) {
            return res.status(400).json({ error: 'A conta a pagar já tem baixa/pagamento registrado. Estorne a baixa em Contas a Pagar antes de cancelar a entrada.' });
        }
        // A despesa pode já ter chegado na Conta Azul. Inclui ERRO: o CA pode ter criado
        // o evento (HTTP 200 + protocolo) mesmo quando o app registrou erro no envio.
        const chegouCA = !!conta?.idEventoCA
            || ['AGUARDANDO_PROTOCOLO', 'ENVIANDO', 'ENVIADO', 'ERRO'].includes(conta?.statusEnvioCA);

        await prisma.$transaction(async (tx) => {
            if (conta) {
                await tx.parcelaPagar.updateMany({ where: { contaPagarId: conta.id }, data: { status: 'CANCELADO' } });
                await tx.contaPagar.update({
                    where: { id: conta.id },
                    data: { status: 'CANCELADO', statusEnvioCA: 'NAO_ENVIAR' }
                });
            }
            await tx.notaEntrada.update({
                where: { id: nota.id },
                data: { status: nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML', contaPagarId: null }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Fase 6 — estorna as entradas de estoque desta nota (saída na mesma quantidade;
        // o histórico fica marcado como estornado). Best-effort: falha não trava o cancelamento.
        let estorno = { estornadas: 0, avisos: [] };
        try {
            const compraEstoqueService = require('../services/compraEstoqueService');
            estorno = await compraEstoqueService.estornarEntradasNota(nota.id, req.user.id);
        } catch (e) {
            console.error('[NotasEntrada] Falha ao estornar entradas de estoque:', e.message);
            estorno.avisos.push('Falha ao estornar o estoque — confira e ajuste manualmente.');
        }

        res.json({
            ok: true,
            message: 'Entrada cancelada. A nota voltou para conferência.',
            avisoCA: chegouCA,
            estoque: { estornadas: estorno.estornadas, avisos: estorno.avisos }
        });
    } catch (error) {
        console.error('Erro ao cancelar conferência da nota:', error);
        res.status(500).json({ error: 'Erro ao cancelar a entrada.' });
    }
});

// Exposto para testes offline (função pura, sem efeitos)
router._calcularRateio = calcularRateio;
router._calcularSaldoDisponivel = calcularSaldoDisponivel;
router._tipoDiferencaDaAcao = tipoDiferencaDaAcao;

module.exports = router;
