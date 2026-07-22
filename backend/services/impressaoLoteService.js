// =====================================================================
// Impressão em lote de pedidos (aprovada pelo dono 07/2026):
//   - pedido normal FATURADO → DANFE (XML autorizado do CA) em 1 ou 2 vias,
//     seguida do(s) boleto(s) Asaas (na ordem, p/ grampear)
//   - pedido ESPECIAL (ZZ#) e BONIFICAÇÃO (BN#) → recibo de conferência (sem marca)
//   - AMOSTRA (AM#) → recibo de conferência sem valores
// Tudo num ÚNICO PDF, na ordem dos itens selecionados.
// =====================================================================
const { PDFDocument } = require('pdf-lib');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');
const { gerarReciboEspecial, gerarReciboAmostra } = require('./reciboEspecialPdf');

const A_PRAZO = (pedido) => (pedido.tipoPagamento === 'BOLETO_BANCARIO')
    || /boleto/i.test(pedido.nomeCondicaoPagamento || '');

// Pasta de cache dos PDFs (boletos do CA e DANFEs). Fica em uploads/, mas o
// acesso público a ela é BLOQUEADO no index.js (são documentos de cliente).
// Boleto e DANFE não mudam depois de emitidos → cache permanente, reimpressão instantânea.
const DIR_CACHE = path.join(__dirname, '../uploads/cache-fiscal');
const CACHE_CHECAGEM_MIN = 30; // conferência do CA vale 30 min (depois reconsulta)

function lerCache(nome) {
    try {
        const arq = path.join(DIR_CACHE, nome);
        if (fs.existsSync(arq)) return fs.readFileSync(arq);
    } catch (_) { /* cache é melhor esforço */ }
    return null;
}
function gravarCache(nome, buffer) {
    try {
        fs.mkdirSync(DIR_CACHE, { recursive: true });
        fs.writeFileSync(path.join(DIR_CACHE, nome), buffer);
    } catch (e) {
        console.warn('[Impressão] Não consegui gravar no cache:', e.message);
    }
}

// PDF do boleto do CA — do cache se já baixamos antes
async function pdfBoletoCA(idSolicitacao) {
    const nome = `boleto-ca-${idSolicitacao}.pdf`;
    const doCache = lerCache(nome);
    if (doCache) return doCache;
    const pdf = await contaAzulService.baixarBoletoPdfCA(idSolicitacao);
    gravarCache(nome, pdf);
    return pdf;
}

// PDF da DANFE — do cache se já geramos antes (a NF-e não muda)
async function pdfDanfe(pedido) {
    const pedidoController = require('../controllers/pedidoController');
    const nota = await pedidoController._localizarNotaFiscal(pedido);
    const nome = `danfe-${nota.chave_acesso}.pdf`;
    const doCache = lerCache(nome);
    if (doCache) return doCache;

    const xml = await contaAzulService.buscarXmlNotaFiscal(nota.chave_acesso);
    const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
    const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
    const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
    const buf = await docParaBuffer(doc);
    // Sentinela: DANFE em mais de 1 folha é exceção (dados adicionais muito longos).
    // Se aparecer em série no log, alguma mudança estourou o layout de novo.
    const paginas = contarPaginasPdf(buf);
    if (paginas > 1) {
        console.warn(`[DANFE] NF ${nota.numero_nota || '?'} (chave ${nota.chave_acesso}) gerada com ${paginas} folhas — conferir dados adicionais/layout.`);
    }
    gravarCache(nome, buf);
    return buf;
}

// Conta as páginas de um PDF (objetos /Type /Page)
function contarPaginasPdf(buf) {
    try {
        return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    } catch (_) { return 0; }
}

// pdfkit doc → Buffer
function docParaBuffer(doc) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
}

async function carregarPedidos(pedidoIds) {
    const pedidos = await prisma.pedido.findMany({
        where: { id: { in: pedidoIds } },
        include: {
            cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, Documento: true } },
            vendedor: { select: { nome: true } },
            itens: { include: { produto: { select: { nome: true } } } }
        }
    });
    const mapa = new Map(pedidos.map(p => [p.id, p]));
    return pedidoIds.map(id => mapa.get(id)).filter(Boolean);
}

// Boletos ASAAS por pedido, em ordem de parcela.
// `apenasNaoPagos`: regra do dono — boleto quitado não entra na impressão.
async function boletosAsaasPorPedido(pedidoIds, apenasNaoPagos = false) {
    const cobrancas = await prisma.cobrancaAsaas.findMany({
        where: {
            pedidoId: { in: pedidoIds },
            tipo: 'BOLETO',
            // EXPIRADO = boleto VENCIDO, que continua ativo e pagável no Asaas —
            // não é "sem boleto" (senão a impressão em lote emitiria uma 2ª via duplicada)
            status: apenasNaoPagos ? { in: ['PENDENTE', 'EXPIRADO'] } : { in: ['PENDENTE', 'EXPIRADO', 'RECEBIDO'] }
        },
        include: { parcela: { select: { numeroParcela: true, dataVencimento: true } } },
        orderBy: { createdAt: 'asc' }
    });
    // Parcela mudou de vencimento depois da emissão (ex.: adiada no CA)? Realinha o
    // boleto no Asaas ANTES de imprimir — senão o PDF sai com a data velha.
    const diaSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    for (let i = 0; i < cobrancas.length; i++) {
        const c = cobrancas[i];
        if (c.status !== 'PENDENTE' || !c.parcela?.dataVencimento || !c.vencimento) continue;
        if (diaSP(c.vencimento) === diaSP(c.parcela.dataVencimento)) continue;
        try {
            const asaasService = require('./asaasService');
            const nova = await asaasService.sincronizarVencimentoBoleto(c.id);
            cobrancas[i] = { ...c, ...nova, parcela: c.parcela };
        } catch (_) { /* melhor esforço: imprime como está */ }
    }
    const porPedido = new Map();
    for (const c of cobrancas) {
        if (!porPedido.has(c.pedidoId)) porPedido.set(c.pedidoId, []);
        porPedido.get(c.pedidoId).push(c);
    }
    for (const lista of porPedido.values()) {
        lista.sort((a, b) => (a.parcela?.numeroParcela || 0) - (b.parcela?.numeroParcela || 0));
    }
    return porPedido;
}

/**
 * Boletos do CONTA AZUL de um pedido (consulta ao vivo) + atualiza o cache
 * `caBoletoStatus` do pedido (alimenta o check da pílula CA na lista).
 * Nunca lança. Devolve { boletos, erro }: em caso de falha na API do CA,
 * `erro` vem preenchido — quem chama NÃO deve concluir "não tem boleto".
 */
async function boletosCaDoPedido(pedido, { forcar = false } = {}) {
    if (!pedido?.idVendaContaAzul || pedido.especial || pedido.bonificacao) {
        return { boletos: [], erro: null, doCache: false };
    }

    // Conferência recente já serve (evita reconsultar o CA a cada impressão)
    if (!forcar && pedido.caBoletoVerificado && Array.isArray(pedido.caBoletos)) {
        const idadeMin = (Date.now() - new Date(pedido.caBoletoVerificado).getTime()) / 60000;
        if (idadeMin < CACHE_CHECAGEM_MIN) {
            return { boletos: pedido.caBoletos, erro: null, doCache: true };
        }
    }

    try {
        const dataVendaStr = new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const boletos = await contaAzulService.buscarBoletosDaVenda(
            pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
        );
        const status = boletos.length === 0
            ? 'SEM'
            : (boletos.every(b => b.pago) ? 'PAGO' : 'PENDENTE');
        await prisma.pedido.update({
            where: { id: pedido.id },
            data: { caBoletoStatus: status, caBoletoVerificado: new Date(), caBoletos: boletos }
        }).catch(() => { /* cache é melhor esforço */ });
        return { boletos, erro: null, doCache: false };
    } catch (e) {
        console.warn(`[Impressão lote] Falha ao consultar boletos do CA (pedido #${pedido.numero}):`, e.message);
        // Se temos uma conferência anterior, usamos ela em vez de dizer "sem boleto"
        if (Array.isArray(pedido.caBoletos) && pedido.caBoletos.length > 0) {
            return { boletos: pedido.caBoletos, erro: null, doCache: true };
        }
        return { boletos: [], erro: e.message, doCache: false };
    }
}

// Classifica UM pedido (com os boletos Asaas e do CA já em mãos).
// boleto: OK (tem boleto não pago em algum sistema) | PAGO (só quitado) |
//         SEM_BOLETO (conferido nos dois, não tem) | DESCONHECIDO (CA fora do ar) |
//         NAO_SE_APLICA (especial/bonificação/à vista)
function classificar(p, asaasDoPedido, caDoPedido, caErro, doCache = false) {
    const aPrazo = A_PRAZO(p);
    const asaasNaoPagos = asaasDoPedido.filter(c => ['PENDENTE', 'EXPIRADO'].includes(c.status));
    const caNaoPagos = caDoPedido.filter(b => !b.pago);
    const temAlgum = asaasDoPedido.length > 0 || caDoPedido.length > 0;

    let boleto = 'NAO_SE_APLICA';
    if (!p.especial && !p.bonificacao && aPrazo) {
        if (asaasNaoPagos.length > 0 || caNaoPagos.length > 0) boleto = 'OK';
        else if (temAlgum) boleto = 'PAGO'; // existe, mas quitado → não imprime
        else if (caErro) boleto = 'DESCONHECIDO'; // não deu p/ consultar o CA
        else boleto = 'SEM_BOLETO';
    }

    return {
        id: p.id,
        numero: p.numero,
        cliente: p.cliente?.NomeFantasia || p.cliente?.Nome || '—',
        especial: p.especial,
        bonificacao: p.bonificacao,
        aPrazo,
        temNF: !!p.nfeChave || p.situacaoCA === 'FATURADO',
        boleto,
        boletosCA: caNaoPagos.length,
        boletosAsaas: asaasNaoPagos.length,
        caPago: caDoPedido.length > 0 && caNaoPagos.length === 0,
        asaasPago: asaasDoPedido.length > 0 && asaasNaoPagos.length === 0,
        caErro: caErro || null,
        doCache, // conferência veio do cache (não bateu no CA agora)
        valorTotal: (p.itens || []).reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) + Number(p.valorFrete || 0)
    };
}

const impressaoLoteService = {
    /**
     * Checagem prévia (alimenta a janela de opções no app). Aqui é o momento em que
     * o app CONSULTA O CA (regra do dono: "ao imprimir fazer a importação") — descobre
     * se há boleto no CA, grava o check no pedido e diz o que vai ser impresso.
     * boleto: OK (tem no CA e/ou Asaas, não pago) | PAGO | SEM_BOLETO | NAO_SE_APLICA
     */
    checar: async (pedidoIds) => {
        const pedidos = await carregarPedidos(pedidoIds);
        const asaas = await boletosAsaasPorPedido(pedidoIds);
        const saida = [];
        // Sequencial de propósito: não martelar a API do CA com várias consultas de uma vez
        for (const p of pedidos) {
            const { boletos, erro } = await boletosCaDoPedido(p);
            saida.push(classificar(p, asaas.get(p.id) || [], boletos, erro));
        }
        return saida;
    },

    /**
     * Checagem de UM pedido — o app chama em sequência, um por vez, mostrando o
     * progresso na tela (pedido do dono: consultar o CA de um em um, não em lote).
     */
    checarPedido: async (pedidoId, { forcar = false } = {}) => {
        const [pedido] = await carregarPedidos([pedidoId]);
        if (!pedido) throw new Error('Pedido não encontrado.');
        const asaas = await boletosAsaasPorPedido([pedidoId]);
        const { boletos, erro, doCache } = await boletosCaDoPedido(pedido, { forcar });
        return classificar(pedido, asaas.get(pedidoId) || [], boletos, erro, doCache);
    },

    /**
     * Gera o PDF do lote. Retorna { pdf: Buffer, erros: [{numero, erro}] }.
     * Pedido com problema (ex.: NF não encontrada) é PULADO e reportado.
     */
    gerar: async ({ pedidoIds = [], amostraIds = [], duasVias = true, incluirBoletos = true }) => {
        const pedidos = await carregarPedidos(pedidoIds);
        // Só boletos NÃO pagos entram na impressão (regra do dono)
        const boletos = incluirBoletos ? await boletosAsaasPorPedido(pedidoIds, true) : new Map();
        const saida = await PDFDocument.create();
        const erros = [];

        const anexar = async (bytes, vezes = 1) => {
            const origem = await PDFDocument.load(bytes);
            const indices = origem.getPageIndices();
            for (let v = 0; v < vezes; v++) {
                const paginas = await saida.copyPages(origem, indices);
                paginas.forEach(pg => saida.addPage(pg));
            }
        };

        for (const pedido of pedidos) {
            const rotulo = `${pedido.especial ? 'ZZ#' : '#'}${pedido.numero ?? '?'}`;
            try {
                // Especial e bonificação não têm NF — saem como recibo de conferência
                // (mesmo layout aprovado, sem a marca Hardt; bonificação com prefixo BN#)
                if (pedido.especial || pedido.bonificacao) {
                    const recibo = await gerarReciboEspecial(pedido);
                    await anexar(recibo, duasVias ? 2 : 1);
                    continue;
                }

                // DANFE (do cache em disco quando já gerada antes)
                const danfeBuf = await pdfDanfe(pedido);
                await anexar(danfeBuf, duasVias ? 2 : 1);

                // Boleto(s) na sequência — CA primeiro, depois Asaas; sempre em ordem de parcela.
                // Quitados ficam de fora (regra do dono).
                if (incluirBoletos) {
                    // ── Boletos do Conta Azul (PDF público da fatura) ──
                    const { boletos: boletosCA, erro: caErro } = await boletosCaDoPedido(pedido);
                    if (caErro) {
                        erros.push({ numero: rotulo, erro: `não consegui consultar os boletos no Conta Azul (${caErro})` });
                    }
                    for (const b of boletosCA.filter(x => !x.pago)) {
                        try {
                            const pdfCA = await pdfBoletoCA(b.id); // cache em disco
                            await anexar(pdfCA, 1);
                        } catch (e) {
                            erros.push({ numero: rotulo, erro: `boleto do CA não baixou (${e.message}) — imprima pelo Conta Azul` });
                        }
                    }
                    // ── Boletos do Asaas ──
                    for (const cob of (boletos.get(pedido.id) || [])) {
                        if (!cob.boletoUrl) continue;
                        try {
                            const resp = await axios.get(cob.boletoUrl, { responseType: 'arraybuffer', timeout: 30000 });
                            await anexar(Buffer.from(resp.data), 1);
                        } catch (e) {
                            erros.push({ numero: rotulo, erro: `boleto Asaas não baixou (${e.message}) — imprima pelo botão do pedido` });
                        }
                    }
                }
            } catch (e) {
                erros.push({ numero: rotulo, erro: e.message });
            }
        }

        // ── Amostras (AM#): recibo de conferência sem valores ──
        if (amostraIds.length) {
            const amostras = await prisma.amostra.findMany({
                where: { id: { in: amostraIds } },
                include: {
                    cliente: { select: { Nome: true, NomeFantasia: true, Documento: true } },
                    lead: { select: { nomeEstabelecimento: true } },
                    solicitadoPor: { select: { nome: true } },
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });
            const mapaAm = new Map(amostras.map(a => [a.id, a]));
            for (const id of amostraIds) {
                const amostra = mapaAm.get(id);
                if (!amostra) continue;
                try {
                    const recibo = await gerarReciboAmostra(amostra);
                    await anexar(recibo, duasVias ? 2 : 1);
                } catch (e) {
                    erros.push({ numero: `AM#${amostra.numero}`, erro: e.message });
                }
            }
        }

        if (saida.getPageCount() === 0) {
            const err = new Error(`Nada para imprimir: ${erros.map(e => `${e.numero}: ${e.erro}`).join(' | ') || 'nenhum pedido válido'}`);
            err.statusCode = 400;
            throw err;
        }

        const pdf = Buffer.from(await saida.save());
        return { pdf, erros, paginas: saida.getPageCount() };
    }
};

module.exports = impressaoLoteService;
