// =====================================================================
// Recibo de conferência do pedido ESPECIAL em PDF (A4, pdfkit).
// Modelo aprovado pelo dono (07/2026): SEM a marca da Hardt (sem logo,
// sem razão social, sem endereço) — faixa verde-escura, dados em grade,
// tabela de itens, total em destaque e linha de assinatura.
// =====================================================================
const PDFDocument = require('pdfkit');

const VERDE_ESCURO = '#1E3932';
const VERDE = '#006241';
const MINT = '#d4e9e2';
const CINZA = '#5f6b66';
const CINZA_CLARO = '#e3e1da';

const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

/**
 * Gera o recibo de UM pedido especial. Retorna Buffer do PDF (1 página).
 * pedido precisa vir com: numero, dataVenda, nomeCondicaoPagamento, observacoes,
 * createdAt, cliente { Nome, NomeFantasia, Documento }, vendedor { nome },
 * itens [{ quantidade, valor, produto: { nome } }], valorFrete.
 */
function gerarReciboEspecial(pedido) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 36, left: 42, right: 42 } });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const largura = doc.page.width - 84; // área útil
        const x0 = 42;

        // ── Faixa do cabeçalho (sem marca) ──
        doc.rect(x0, 36, largura, 62).fill(VERDE_ESCURO);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
            .text('RECIBO DE CONFERÊNCIA', x0 + 18, 52, { characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(19).text('Pedido', x0 + 18, 64);
        doc.font('Helvetica').fontSize(8).fillColor('#b9c9c2')
            .text('Nº', x0 + largura - 150, 52, { width: 132, align: 'right', characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
            .text(`ZZ#${pedido.numero ?? '—'}`, x0 + largura - 200, 64, { width: 182, align: 'right' });

        // ── Grade de dados ──
        let y = 116;
        const col2 = x0 + largura / 2;
        const campo = (x, yy, rotulo, valor, larg) => {
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a938f')
                .text(rotulo.toUpperCase(), x, yy, { characterSpacing: 1, width: larg });
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
                .text(valor || '—', x, yy + 9, { width: larg });
        };
        const nomeCliente = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || '—';
        campo(x0, y, 'Cliente', nomeCliente, largura / 2 - 10);
        campo(col2, y, 'CNPJ / CPF', pedido.cliente?.Documento || '—', largura / 2);
        y += 32;
        campo(x0, y, 'Entrega', fmtData(pedido.dataVenda), largura / 2 - 10);
        campo(col2, y, 'Vendedor', pedido.vendedor?.nome || '—', largura / 2);
        y += 32;
        campo(x0, y, 'Condição', pedido.nomeCondicaoPagamento || '—', largura / 2 - 10);
        campo(col2, y, 'Emitido em', new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }), largura / 2);
        y += 40;

        // ── Tabela de itens ──
        const colunas = [
            { titulo: 'PRODUTO', x: x0, larg: largura - 210, align: 'left' },
            { titulo: 'QTD', x: x0 + largura - 205, larg: 55, align: 'right' },
            { titulo: 'UNIT.', x: x0 + largura - 145, larg: 65, align: 'right' },
            { titulo: 'TOTAL', x: x0 + largura - 75, larg: 75, align: 'right' }
        ];
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a938f');
        colunas.forEach(c => doc.text(c.titulo, c.x, y, { width: c.larg, align: c.align, characterSpacing: 1 }));
        y += 11;
        doc.moveTo(x0, y).lineTo(x0 + largura, y).lineWidth(1.5).strokeColor(VERDE_ESCURO).stroke();
        y += 7;

        let total = 0;
        const itens = pedido.itens || [];
        for (const item of itens) {
            const qtd = Number(item.quantidade);
            const unit = Number(item.valor);
            const tot = qtd * unit;
            total += tot;
            const nome = item.produto?.nome || item.descricao || 'Item';
            const altura = doc.font('Helvetica').fontSize(9.5).heightOfString(nome, { width: colunas[0].larg });
            if (y + altura > doc.page.height - 190) {
                doc.addPage();
                y = 48;
            }
            doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
            doc.text(nome, colunas[0].x, y, { width: colunas[0].larg });
            doc.text(String(qtd % 1 === 0 ? qtd : qtd.toFixed(3)), colunas[1].x, y, { width: colunas[1].larg, align: 'right' });
            doc.text(fmtMoeda(unit), colunas[2].x, y, { width: colunas[2].larg, align: 'right' });
            doc.text(fmtMoeda(tot), colunas[3].x, y, { width: colunas[3].larg, align: 'right' });
            y += Math.max(altura, 12) + 5;
            doc.moveTo(x0, y - 3).lineTo(x0 + largura, y - 3).lineWidth(0.4).strokeColor(CINZA_CLARO).stroke();
        }
        if (Number(pedido.valorFrete) > 0) {
            doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
            doc.text('Frete', colunas[0].x, y, { width: colunas[0].larg });
            doc.text(fmtMoeda(pedido.valorFrete), colunas[3].x, y, { width: colunas[3].larg, align: 'right' });
            total += Number(pedido.valorFrete);
            y += 17;
        }

        // ── Total em destaque ──
        y += 6;
        doc.roundedRect(x0, y, largura, 34, 8).fill(MINT);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VERDE)
            .text('TOTAL DO PEDIDO', x0 + 14, y + 13, { characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(16).fillColor(VERDE)
            .text(`R$ ${fmtMoeda(total)}`, x0, y + 9, { width: largura - 14, align: 'right' });
        y += 48;

        // ── Observações ──
        if (pedido.observacoes) {
            doc.font('Helvetica').fontSize(8.5).fillColor(CINZA)
                .text(`Observações: ${pedido.observacoes}`, x0, y, { width: largura });
            y = doc.y + 10;
        }

        // ── Assinatura ──
        y = Math.max(y + 40, doc.page.height - 150);
        doc.moveTo(x0 + 40, y).lineTo(x0 + largura - 40, y).lineWidth(0.8)
            .dash(3, { space: 3 }).strokeColor('#b9c2be').stroke().undash();
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#8a938f')
            .text('ASSINATURA DO RECEBEDOR          ·          DATA ____ /____ /______', x0, y + 7, {
                width: largura, align: 'center', characterSpacing: 1
            });

        // ── Rodapé ──
        doc.font('Helvetica').fontSize(7.5).fillColor('#9aa5a0')
            .text('Documento interno de conferência.', x0, doc.page.height - 60, { width: largura, align: 'center' });

        doc.end();
    });
}

module.exports = { gerarReciboEspecial };
