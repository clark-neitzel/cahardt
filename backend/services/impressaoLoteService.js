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

// Boletos ASAAS por pedido, em ordem de parcela.
// `apenasNaoPagos`: regra do dono — boleto quitado não entra na impressão.
async function boletosAsaasPorPedido(pedidoIds, apenasNaoPagos = false) {
    const cobrancas = await prisma.cobrancaAsaas.findMany({
        where: {
            pedidoId: { in: pedidoIds },
            tipo: 'BOLETO',
            status: apenasNaoPagos ? 'PENDENTE' : { in: ['PENDENTE', 'RECEBIDO'] }
        },
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

/**
 * Boletos do CONTA AZUL de um pedido (consulta ao vivo) + atualiza o cache
 * `caBoletoStatus` do pedido (alimenta o check da pílula CA na lista).
 * Nunca lança. Devolve { boletos, erro }: em caso de falha na API do CA,
 * `erro` vem preenchido — quem chama NÃO deve concluir "não tem boleto".
 */
async function boletosCaDoPedido(pedido) {
    if (!pedido?.idVendaContaAzul || pedido.especial || pedido.bonificacao) {
        return { boletos: [], erro: null };
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
            data: { caBoletoStatus: status, caBoletoVerificado: new Date() }
        }).catch(() => { /* cache é melhor esforço */ });
        return { boletos, erro: null };
    } catch (e) {
        console.warn(`[Impressão lote] Falha ao consultar boletos do CA (pedido #${pedido.numero}):`, e.message);
        return { boletos: [], erro: e.message };
    }
}

// Roda tarefas com concorrência limitada (a API do CA é lenta; sem isso um lote
// grande demoraria demais, e com concorrência alta o CA começa a recusar).
async function comConcorrencia(itens, limite, tarefa) {
    const resultados = new Array(itens.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
        while (i < itens.length) {
            const idx = i++;
            resultados[idx] = await tarefa(itens[idx], idx);
        }
    });
    await Promise.all(workers);
    return resultados;
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

        // Consulta o CA de todos os pedidos em paralelo (limitado) — é aqui que o app
        // "importa" a situação do boleto do Conta Azul.
        const consultasCA = await comConcorrencia(pedidos, 4, (p) =>
            (!p.especial && !p.bonificacao) ? boletosCaDoPedido(p) : Promise.resolve({ boletos: [], erro: null })
        );

        return pedidos.map((p, idx) => {
            const aPrazo = A_PRAZO(p);
            const asaasDoPedido = asaas.get(p.id) || [];
            const { boletos: caDoPedido, erro: caErro } = consultasCA[idx];

            const asaasNaoPagos = asaasDoPedido.filter(c => c.status === 'PENDENTE');
            const caNaoPagos = caDoPedido.filter(b => !b.pago);
            const temAlgum = asaasDoPedido.length > 0 || caDoPedido.length > 0;

            let boleto = 'NAO_SE_APLICA';
            if (!p.especial && !p.bonificacao && aPrazo) {
                if (asaasNaoPagos.length > 0 || caNaoPagos.length > 0) boleto = 'OK';
                else if (temAlgum) boleto = 'PAGO'; // existe, mas quitado → não imprime
                else if (caErro) boleto = 'DESCONHECIDO'; // não deu p/ consultar o CA — NÃO afirmar "sem boleto"
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
                caErro: caErro || null,
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
                            const pdfCA = await contaAzulService.baixarBoletoPdfCA(b.id);
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
