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

// CEP: se vier só dígitos (8), formata 00000-000; senão devolve como está.
const fmtCep = (cep) => {
    if (!cep) return null;
    const dig = String(cep).replace(/\D/g, '');
    return dig.length === 8 ? `${dig.slice(0, 5)}-${dig.slice(5)}` : String(cep);
};

// "Logradouro, Número — Complemento" (só com o que existir; null se nada existir)
const montarEndereco = (c) => {
    const log = (c.End_Logradouro || '').trim();
    const num = (c.End_Numero || '').trim();
    const comp = (c.End_Complemento || '').trim();
    let s = log;
    if (num) s = s ? `${s}, ${num}` : num;
    if (comp) s = s ? `${s} — ${comp}` : comp;
    return s || null;
};

// Monta os dados do quadro a partir do cliente (campos ausentes viram null → "—")
const dadosQuadroCliente = (cliente, entrega, nomeFallback) => {
    const c = cliente || {};
    return {
        nome: c.NomeFantasia || c.Nome || nomeFallback || null,
        documento: c.Documento || null,
        fone: c.Telefone_Celular || c.Telefone || c.Telefone_Comercial || null,
        endereco: montarEndereco(c),
        bairro: c.End_Bairro || null,
        cep: fmtCep(c.End_CEP),
        municipio: c.End_Cidade || null,
        uf: c.End_Estado || null,
        entrega
    };
};

// ── Quadro "DADOS DO CLIENTE · LOCAL DE ENTREGA" ──
// Estilo do quadro de destinatário da DANFE, no design do recibo (faixa de
// título verde-escura, células com bordas finas, rótulos pequenos maiúsculos).
// 3 linhas × 3 células (flex 2.2 / 1.3 / 1). Devolve o novo y (abaixo do quadro).
function desenharQuadroCliente(doc, x0, largura, y, dados) {
    const TITULO_H = 17;
    const LINHA_H = 27;
    const flex = [2.2, 1.3, 1];
    const soma = flex.reduce((a, b) => a + b, 0);
    const largs = flex.map(f => largura * f / soma);
    const xs = [x0, x0 + largs[0], x0 + largs[0] + largs[1]];
    const alturaTotal = TITULO_H + LINHA_H * 3;

    // Faixa de título
    doc.rect(x0, y, largura, TITULO_H).fill(VERDE_ESCURO);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
        .text('DADOS DO CLIENTE · LOCAL DE ENTREGA', x0 + 8, y + 5.5, { characterSpacing: 1.5, lineBreak: false });

    // Células (rótulo pequeno maiúsculo + valor em negrito; valor longo sai com "…")
    const celula = (col, linha, rotulo, valor) => {
        const cx = xs[col] + 7;
        const cy = y + TITULO_H + linha * LINHA_H;
        const larg = largs[col] - 14;
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#8a938f')
            .text(rotulo, cx, cy + 5, { characterSpacing: 1, width: larg, height: 8, ellipsis: true });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000000')
            .text(valor || '—', cx, cy + 13, { width: larg, height: 12, ellipsis: true });
    };
    celula(0, 0, 'NOME / RAZÃO SOCIAL', dados.nome);
    celula(1, 0, 'CNPJ / CPF', dados.documento);
    celula(2, 0, 'FONE', dados.fone);
    celula(0, 1, 'ENDEREÇO', dados.endereco);
    celula(1, 1, 'BAIRRO', dados.bairro);
    celula(2, 1, 'CEP', dados.cep);
    celula(0, 2, 'MUNICÍPIO', dados.municipio);
    celula(1, 2, 'UF', dados.uf);
    celula(2, 2, 'ENTREGA', dados.entrega);

    // Grade interna (bordas finas)
    doc.lineWidth(0.5).strokeColor(CINZA_CLARO);
    for (let i = 1; i <= 2; i++) {
        const ly = y + TITULO_H + LINHA_H * i;
        doc.moveTo(x0, ly).lineTo(x0 + largura, ly).stroke();
    }
    for (let c = 1; c <= 2; c++) {
        doc.moveTo(xs[c], y + TITULO_H).lineTo(xs[c], y + alturaTotal).stroke();
    }

    // Borda externa
    doc.rect(x0, y, largura, alturaTotal).lineWidth(1.2).strokeColor(VERDE_ESCURO).stroke();

    return y + alturaTotal;
}

/**
 * Gera o recibo de UM pedido especial. Retorna Buffer do PDF (1 página).
 * pedido precisa vir com: numero, dataVenda, nomeCondicaoPagamento, observacoes,
 * createdAt, cliente { Nome, NomeFantasia, Documento, Telefone, Telefone_Celular,
 * Telefone_Comercial, End_Logradouro, End_Numero, End_Complemento, End_Bairro,
 * End_Cidade, End_Estado, End_CEP }, vendedor { nome },
 * itens [{ quantidade, valor, produto: { nome } }], valorFrete.
 * Campo ausente sai como "—" — o recibo nunca quebra por falta de dado.
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
        doc.font('Helvetica-Bold').fontSize(19).text(pedido.bonificacao ? 'Bonificação' : 'Pedido', x0 + 18, 64);
        doc.font('Helvetica').fontSize(8).fillColor('#b9c9c2')
            .text('Nº', x0 + largura - 150, 52, { width: 132, align: 'right', characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
            .text(`${pedido.bonificacao ? 'BN#' : 'ZZ#'}${pedido.numero ?? '—'}`, x0 + largura - 200, 64, { width: 182, align: 'right' });

        // ── Quadro do cliente / local de entrega (estilo destinatário da DANFE) ──
        let y = 116;
        y = desenharQuadroCliente(doc, x0, largura, y,
            dadosQuadroCliente(pedido.cliente, fmtData(pedido.dataVenda)));
        y += 14;

        // ── Grade: Vendedor | Condição | Emitido em ──
        const campo = (x, yy, rotulo, valor, larg) => {
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a938f')
                .text(rotulo.toUpperCase(), x, yy, { characterSpacing: 1, width: larg });
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
                .text(valor || '—', x, yy + 9, { width: larg, height: 13, ellipsis: true });
        };
        const colG = largura / 3;
        campo(x0, y, 'Vendedor', pedido.vendedor?.nome || '—', colG - 10);
        campo(x0 + colG, y, 'Condição', pedido.nomeCondicaoPagamento || '—', colG - 10);
        campo(x0 + colG * 2, y, 'Emitido em', new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }), colG);
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
            .text(pedido.bonificacao ? 'TOTAL DA BONIFICAÇÃO' : 'TOTAL DO PEDIDO', x0 + 14, y + 13, { characterSpacing: 1.5 });
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

/**
 * Recibo de AMOSTRA (mesmo layout, sem valores — amostra não tem preço).
 * amostra: { numero, dataEntrega, observacao,
 *            cliente { Nome, NomeFantasia, Documento, Telefone, Telefone_Celular,
 *                      Telefone_Comercial, End_* (endereço) },
 *            lead { nomeEstabelecimento }, solicitadoPor { nome }, itens [{ nomeProduto, quantidade }] }
 * Pode não haver cliente (só lead): o quadro sai com o nome do lead e os demais campos "—".
 */
function gerarReciboAmostra(amostra) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 36, left: 42, right: 42 } });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const largura = doc.page.width - 84;
        const x0 = 42;

        // ── Faixa do cabeçalho (sem marca) ──
        doc.rect(x0, 36, largura, 62).fill(VERDE_ESCURO);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
            .text('RECIBO DE CONFERÊNCIA', x0 + 18, 52, { characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(19).text('Amostra', x0 + 18, 64);
        doc.font('Helvetica').fontSize(8).fillColor('#b9c9c2')
            .text('Nº', x0 + largura - 150, 52, { width: 132, align: 'right', characterSpacing: 1.5 });
        doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
            .text(`AM#${amostra.numero ?? '—'}`, x0 + largura - 200, 64, { width: 182, align: 'right' });

        // ── Quadro do cliente / local de entrega (estilo destinatário da DANFE) ──
        // Sem cliente (só lead): sai o nome do lead e os demais campos "—".
        let y = 116;
        y = desenharQuadroCliente(doc, x0, largura, y,
            dadosQuadroCliente(amostra.cliente, fmtData(amostra.dataEntrega), amostra.lead?.nomeEstabelecimento));
        y += 14;

        // ── Grade: Solicitado por | Emitido em ──
        const campo = (x, yy, rotulo, valor, larg) => {
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a938f')
                .text(rotulo.toUpperCase(), x, yy, { characterSpacing: 1, width: larg });
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
                .text(valor || '—', x, yy + 9, { width: larg, height: 13, ellipsis: true });
        };
        const colG = largura / 3;
        campo(x0, y, 'Solicitado por', amostra.solicitadoPor?.nome || '—', colG - 10);
        campo(x0 + colG, y, 'Emitido em', new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }), colG - 10);
        y += 40;

        // ── Tabela de itens (sem valores) ──
        const colProduto = { x: x0, larg: largura - 90 };
        const colQtd = { x: x0 + largura - 80, larg: 80 };
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#8a938f');
        doc.text('PRODUTO', colProduto.x, y, { width: colProduto.larg, characterSpacing: 1 });
        doc.text('QTD', colQtd.x, y, { width: colQtd.larg, align: 'right', characterSpacing: 1 });
        y += 11;
        doc.moveTo(x0, y).lineTo(x0 + largura, y).lineWidth(1.5).strokeColor(VERDE_ESCURO).stroke();
        y += 7;

        for (const item of (amostra.itens || [])) {
            const qtd = Number(item.quantidade);
            const nome = item.nomeProduto || item.produto?.nome || 'Item';
            const altura = doc.font('Helvetica').fontSize(9.5).heightOfString(nome, { width: colProduto.larg });
            if (y + altura > doc.page.height - 190) {
                doc.addPage();
                y = 48;
            }
            doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
            doc.text(nome, colProduto.x, y, { width: colProduto.larg });
            doc.text(String(qtd % 1 === 0 ? qtd : qtd.toFixed(3)), colQtd.x, y, { width: colQtd.larg, align: 'right' });
            y += Math.max(altura, 12) + 5;
            doc.moveTo(x0, y - 3).lineTo(x0 + largura, y - 3).lineWidth(0.4).strokeColor(CINZA_CLARO).stroke();
        }

        // ── Faixa: amostra não tem valor comercial ──
        y += 6;
        doc.roundedRect(x0, y, largura, 34, 8).fill(MINT);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(VERDE)
            .text('AMOSTRA — SEM VALOR COMERCIAL', x0, y + 12, { width: largura, align: 'center', characterSpacing: 1.5 });
        y += 48;

        // ── Observações ──
        if (amostra.observacao) {
            doc.font('Helvetica').fontSize(8.5).fillColor(CINZA)
                .text(`Observações: ${amostra.observacao}`, x0, y, { width: largura });
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

module.exports = { gerarReciboEspecial, gerarReciboAmostra };
