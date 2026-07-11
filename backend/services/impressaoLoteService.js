// =====================================================================
// Impressão em lote de pedidos (aprovada pelo dono 07/2026):
//   - pedido normal FATURADO → DANFE (XML autorizado do CA) em 1 ou 2 vias,
//     seguida do(s) boleto(s) Asaas (na ordem, p/ grampear)
//   - pedido ESPECIAL → recibo de conferência (sem marca), 1 ou 2 vias
// Tudo num ÚNICO PDF, na ordem dos pedidos selecionados.
// =====================================================================
const { PDFDocument } = require('pdf-lib');
const axios = require('axios');
const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');
const { gerarReciboEspecial } = require('./reciboEspecialPdf');

const A_PRAZO = (pedido) => (pedido.tipoPagamento === 'BOLETO_BANCARIO')
    || /boleto/i.test(pedido.nomeCondicaoPagamento || '');

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

// Boletos Asaas ativos (PENDENTE/RECEBIDO) por pedido, em ordem de parcela
async function boletosAtivosPorPedido(pedidoIds) {
    const cobrancas = await prisma.cobrancaAsaas.findMany({
        where: { pedidoId: { in: pedidoIds }, tipo: 'BOLETO', status: { in: ['PENDENTE', 'RECEBIDO'] } },
        include: { parcela: { select: { numeroParcela: true } } },
        orderBy: { createdAt: 'asc' }
    });
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

const impressaoLoteService = {
    /**
     * Checagem prévia (alimenta a janela de opções no app):
     * para cada pedido, diz se é especial, se está faturado com NF,
     * e a situação do boleto (OK | SEM_BOLETO | NAO_SE_APLICA).
     */
    checar: async (pedidoIds) => {
        const pedidos = await carregarPedidos(pedidoIds);
        const boletos = await boletosAtivosPorPedido(pedidoIds);
        return pedidos.map(p => {
            const aPrazo = A_PRAZO(p);
            let boleto = 'NAO_SE_APLICA';
            if (!p.especial && !p.bonificacao && aPrazo) {
                boleto = (boletos.get(p.id) || []).length > 0 ? 'OK' : 'SEM_BOLETO';
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
                valorTotal: (p.itens || []).reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) + Number(p.valorFrete || 0)
            };
        });
    },

    /**
     * Gera o PDF do lote. Retorna { pdf: Buffer, erros: [{numero, erro}] }.
     * Pedido com problema (ex.: NF não encontrada) é PULADO e reportado.
     */
    gerar: async ({ pedidoIds, duasVias = true, incluirBoletos = true }) => {
        const pedidos = await carregarPedidos(pedidoIds);
        const boletos = incluirBoletos ? await boletosAtivosPorPedido(pedidoIds) : new Map();
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
                if (pedido.bonificacao) continue; // bonificação não imprime nada aqui

                if (pedido.especial) {
                    const recibo = await gerarReciboEspecial(pedido);
                    await anexar(recibo, duasVias ? 2 : 1);
                    continue;
                }

                // DANFE (require tardio: evita ciclo com o controller)
                const pedidoController = require('../controllers/pedidoController');
                const nota = await pedidoController._localizarNotaFiscal(pedido);
                const xml = await contaAzulService.buscarXmlNotaFiscal(nota.chave_acesso);
                const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
                const path = require('path');
                const fs = require('fs');
                const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
                const danfeDoc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
                const danfeBuf = await docParaBuffer(danfeDoc);
                await anexar(danfeBuf, duasVias ? 2 : 1);

                // Boleto(s) na sequência
                if (incluirBoletos) {
                    for (const cob of (boletos.get(pedido.id) || [])) {
                        if (!cob.boletoUrl) continue;
                        try {
                            const resp = await axios.get(cob.boletoUrl, { responseType: 'arraybuffer', timeout: 30000 });
                            await anexar(Buffer.from(resp.data), 1);
                        } catch (e) {
                            erros.push({ numero: rotulo, erro: `boleto não baixou (${e.message}) — imprima pelo botão do pedido` });
                        }
                    }
                }
            } catch (e) {
                erros.push({ numero: rotulo, erro: e.message });
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
