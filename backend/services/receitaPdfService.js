// =====================================================================
// Folha da RECEITA em PDF (A4, pdfkit) — gerada no servidor.
//
// Por que existe: a impressão da receita era montada em HTML na própria
// página e disparada com window.print(). No iOS isso não funciona — no
// iPhone o print() é inerte (não abre diálogo nenhum) e no iPad o Safari
// fotografa a TELA do app em vez da folha. Seis tentativas de correção no
// mecanismo antigo falharam. Aqui o PDF sai pronto do backend: o aparelho
// só abre um arquivo, que é o que todo iPhone/iPad sabe imprimir.
//
// O desenho reproduz as duas folhas aprovadas em HTML
// (frontend/src/pages/PCP/ReceitaDetalhe.jsx → montarHtmlImpressao e
// montarHtmlImpressaoComCustos): cabeçalho com filete preto grosso, linha
// de meta (rendimento / perda / versão), seções por etapa com faixa preta,
// tabela de ingredientes, caixa de observações e rodapé.
//
// Paginação: o HTML tinha um script de auto-encolhimento (body.style.zoom)
// que NUNCA rodava (o script era removido antes de a folha ser inserida).
// Aqui a conta é feita de verdade: o conteúdo é medido, tenta-se caber em
// UMA folha reduzindo a letra até um limite legível e, se não couber, o
// documento pagina de verdade — repetindo o título da etapa e o cabeçalho
// da tabela na continuação, sem texto cortado e sem página em branco.
// =====================================================================
const PDFDocument = require('pdfkit');

const MM = 72 / 25.4;              // 1 mm em pontos PDF
const A4_LARGURA = 595.28;
const A4_ALTURA = 841.89;

const PRETO = '#111111';
const CINZA_ROTULO = '#555555';
const CINZA_OBS = '#444444';
const CINZA_UN = '#333333';
const CINZA_LINHA = '#cccccc';
const CINZA_RODAPE = '#777777';

const ETAPA_LABELS = { preparo: 'Preparo', modelagem: 'Modelagem', fritura: 'Fritura', embalagem: 'Embalagem' };
const TIPO_LABELS = { MP: 'Matéria-prima', SUB: 'Subproduto', PA: 'Produto acabado', EMB: 'Embalagem' };
const ORDEM_ETAPAS = ['preparo', 'modelagem', 'fritura', 'embalagem'];

const REG = 'Helvetica';
const NEG = 'Helvetica-Bold';

// Unidade exibida: a do PRODUTO (editável no app) tem prioridade; cai para a
// do item PCP (subproduto não tem produto). Mesma regra da tela.
const unidadeDe = (itemPcp) => itemPcp?.produto?.unidade || itemPcp?.unidade || '';

function fmtQtd(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return v.toFixed(3).replace('.', ',');   // 7 -> 7,000
}

function fmtPerda(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return v.toFixed(2).replace('.', ',');
}

function fmtMoeda(n, casas = 2) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return `R$ ${v.toFixed(casas).replace('.', ',')}`;
}

// ── Medição / desenho de texto ──────────────────────────────────────────
function medir(doc, fonte, tamanho, texto, largura, opts = {}) {
    doc.font(fonte).fontSize(tamanho);
    return doc.heightOfString(texto == null || texto === '' ? ' ' : String(texto), { width: largura, ...opts });
}

function escrever(doc, fonte, tamanho, cor, texto, x, y, largura, opts = {}) {
    doc.font(fonte).fontSize(tamanho).fillColor(cor)
        .text(texto == null ? '' : String(texto), x, y, { width: largura, ...opts });
}

// Maior corpo de letra em que `texto` ainda cabe numa linha só de `largura`.
// Serve para a coluna "Un.": a maioria é curta (KG, UN, LT), mas há unidade
// escrita por extenso ("Kilograma") que quebrava em duas linhas e invadia a
// linha de baixo da tabela.
function tamanhoQueCabe(doc, fonte, tamanho, texto, largura, minimo) {
    const t = String(texto || '');
    if (!t) return tamanho;
    doc.font(fonte);
    let atual = tamanho;
    while (atual > minimo) {
        doc.fontSize(atual);
        if (doc.widthOfString(t) <= largura) break;
        atual -= 0.5;
    }
    return atual;
}

function linha(doc, x1, y, x2, espessura, cor) {
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(espessura).strokeColor(cor).stroke();
}

// Fatia um texto longo em pedaços que caibam em `alturaMax`, para que uma
// observação gigante pagine em vez de vazar da folha.
function fatiarTexto(doc, fonte, tamanho, texto, largura, alturaMax, opts = {}) {
    doc.font(fonte).fontSize(tamanho);
    const medida = (t) => doc.heightOfString(t, { width: largura, ...opts });
    const partes = [];
    for (const paragrafo of String(texto).split(/\r?\n/)) {
        if (!paragrafo.trim()) { partes.push(''); continue; }
        if (medida(paragrafo) <= alturaMax) { partes.push(paragrafo); continue; }
        let atual = '';
        for (const palavra of paragrafo.split(/\s+/)) {
            const teste = atual ? `${atual} ${palavra}` : palavra;
            if (atual && medida(teste) > alturaMax) { partes.push(atual); atual = palavra; }
            else atual = teste;
        }
        if (atual) partes.push(atual);
    }
    return partes.length ? partes : [''];
}

// ── Motor de paginação ──────────────────────────────────────────────────
// Recebe blocos atômicos { h, desenhar(y), juntoCom?, aoQuebrar?, grupo? } e
// distribui em páginas. `juntoCom: n` = os n blocos seguintes têm de caber
// junto (evita título de etapa órfão no pé da folha). `aoQuebrar()` devolve
// blocos a reinserir no topo da página nova (título "(continuação)" + cabeçalho
// da tabela).
function paginar(blocos, alturaUtil) {
    const paginas = [];
    let atual = [];
    let y = 0;
    for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        let precisa = b.h;
        for (let k = 1; k <= (b.juntoCom || 0) && i + k < blocos.length; k++) precisa += blocos[i + k].h;
        if (atual.length && y + precisa > alturaUtil) {
            paginas.push(atual);
            atual = [];
            y = 0;
            for (const c of (b.aoQuebrar ? b.aoQuebrar() : [])) { atual.push({ b: c, y }); y += c.h; }
        }
        atual.push({ b, y });
        y += b.h;
    }
    if (atual.length) paginas.push(atual);
    return paginas;
}

// Desenha as páginas já paginadas. Antes dos blocos de um mesmo `grupo`
// (a caixa de observações) desenha a moldura em volta do trecho que caiu
// naquela página.
function desenharPaginas(doc, paginas, x0, topo, largura) {
    paginas.forEach((pagina, idx) => {
        if (idx > 0) doc.addPage();

        // molduras dos grupos (caixa de observações) — atrás do texto
        const grupos = new Map();
        for (const { b, y } of pagina) {
            if (!b.grupo) continue;
            const g = grupos.get(b.grupo) || { de: y, ate: y };
            g.de = Math.min(g.de, y);
            g.ate = Math.max(g.ate, y + b.h);
            grupos.set(b.grupo, g);
        }
        for (const g of grupos.values()) {
            doc.roundedRect(x0, topo + g.de, largura, g.ate - g.de, 4.5)
                .lineWidth(1.5).strokeColor(PRETO).stroke();
        }

        for (const { b, y } of pagina) b.desenhar(topo + y);
    });
}

function desenharRodapes(doc, x0, largura, margem, esquerda, direita) {
    const faixa = doc.bufferedPageRange();
    for (let i = 0; i < faixa.count; i++) {
        doc.switchToPage(faixa.start + i);
        const y = A4_ALTURA - margem - 16;
        linha(doc, x0, y, x0 + largura, 0.75, CINZA_LINHA);
        escrever(doc, REG, 9, CINZA_RODAPE, esquerda, x0, y + 6, largura * 0.6);
        const dir = faixa.count > 1 ? `${direita}  ·  Página ${i + 1} de ${faixa.count}` : direita;
        escrever(doc, REG, 9, CINZA_RODAPE, dir, x0 + largura * 0.35, y + 6, largura * 0.65, { align: 'right' });
    }
}

// Agrupa os ingredientes por etapa, na ordem conhecida; o resto vai para o fim.
function agruparPorEtapa(itens) {
    const grupos = {};
    (itens || []).forEach(it => {
        const chave = (it.ordemEtapa || '').toLowerCase().trim() || '_sem_etapa';
        (grupos[chave] = grupos[chave] || []).push(it);
    });
    const chaves = [
        ...ORDEM_ETAPAS.filter(e => grupos[e]),
        ...Object.keys(grupos).filter(e => !ORDEM_ETAPAS.includes(e))
    ];
    const temEtapas = chaves.some(c => c !== '_sem_etapa');
    return { grupos, chaves, temEtapas };
}

function tituloDaEtapa(chave, temEtapas) {
    if (chave === '_sem_etapa') return temEtapas ? 'Outros ingredientes' : 'Ingredientes';
    return ETAPA_LABELS[chave] || chave.charAt(0).toUpperCase() + chave.slice(1);
}

function linhaProduz(receita) {
    const nome = receita.itemPcp?.nome || '—';
    const tipo = receita.itemPcp?.tipo ? (TIPO_LABELS[receita.itemPcp.tipo] || receita.itemPcp.tipo) : '';
    return { nome, tipo, completo: `Produz: ${nome}${tipo ? ` (${tipo})` : ''}` };
}

const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// =====================================================================
// FOLHA 1 — receita para a COZINHA (sem custos)
// =====================================================================
const COZ_MARGEM = 12 * MM;                       // @page margin: 12mm
const COZ_LARGURA = A4_LARGURA - 2 * COZ_MARGEM;  // 186mm de área útil
const COZ_COLS = [
    { chave: 'nome', x: 0, w: 205, align: 'left' },
    { chave: 'qtd', x: 213, w: 72, align: 'right' },
    { chave: 'un', x: 293, w: 52, align: 'center' },
    { chave: 'obs', x: 353, w: 174, align: 'left' }
];

function blocosCozinha(doc, receita, s, alturaUtil) {
    const x0 = COZ_MARGEM;
    const L = COZ_LARGURA;
    const blocos = [];
    const produz = linhaProduz(receita);

    // ── Cabeçalho (nome, "Produz:", meta e filete preto) ──
    const hTitulo = medir(doc, NEG, 26 * s, receita.nome || '—', L);
    const hProduz = medir(doc, NEG, 15 * s, produz.completo, L);
    const hRotulo = medir(doc, NEG, 11 * s, 'RENDIMENTO', L / 3, { characterSpacing: 0.4 });
    const hValor = medir(doc, NEG, 17 * s, 'Xg', L / 3);
    const hMeta = hRotulo + 2 + hValor;
    const hCabecalho = hTitulo + 3 + hProduz + 8 * s + hMeta + 6 + 3 + 11 * s;

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${unidadeDe(receita.itemPcp)}`.trim();
    const perda = receita.perdaPercentual != null ? `${fmtPerda(receita.perdaPercentual)}%` : '—';

    blocos.push({
        h: hCabecalho,
        desenhar: (y) => {
            escrever(doc, NEG, 26 * s, PRETO, receita.nome || '—', x0, y, L);
            let yy = y + hTitulo + 3;
            doc.font(REG).fontSize(15 * s).fillColor(CINZA_UN);
            doc.text('Produz: ', x0, yy, { width: L, continued: true });
            doc.font(NEG).text(produz.nome, { continued: !!produz.tipo });
            if (produz.tipo) doc.font(REG).text(` (${produz.tipo})`);
            yy += hProduz + 8 * s;
            const metas = [
                ['RENDIMENTO', rendimento || '—'],
                ['PERDA PADRÃO', perda],
                ['VERSÃO', `v${receita.versao ?? '—'}`]
            ];
            metas.forEach(([rot, val], i) => {
                const cx = x0 + i * (L / 3);
                escrever(doc, NEG, 11 * s, CINZA_ROTULO, rot, cx, yy, L / 3 - 8, { characterSpacing: 0.4 });
                escrever(doc, NEG, 17 * s, PRETO, val, cx, yy + hRotulo + 2, L / 3 - 8);
            });
            linha(doc, x0, y + hCabecalho - 11 * s, x0 + L, 2.25, PRETO);
        }
    });

    const { grupos, chaves, temEtapas } = agruparPorEtapa(receita.itens);

    if (!chaves.length) {
        blocos.push({
            h: medir(doc, REG, 15 * s, 'Sem ingredientes cadastrados.', L) + 12 * s,
            desenhar: (y) => escrever(doc, REG, 15 * s, PRETO, 'Sem ingredientes cadastrados.', x0, y + 12 * s, L)
        });
    }

    const fazerTitulo = (texto) => {
        const hTxt = medir(doc, NEG, 16 * s, texto, L - 15);
        const alturaBarra = hTxt + 6;
        return {
            h: 12 * s + alturaBarra + 5,
            desenhar: (y) => {
                const topo = y + 12 * s;
                doc.roundedRect(x0, topo, L, alturaBarra, 3).fill(PRETO);
                escrever(doc, NEG, 16 * s, '#ffffff', texto, x0 + 7.5, topo + 3, L - 15);
            }
        };
    };

    const fazerCabecalhoTabela = () => {
        const hTh = medir(doc, NEG, 11 * s, 'INGREDIENTE', COZ_COLS[0].w, { characterSpacing: 0.4 });
        return {
            h: hTh + 5 + 2,
            desenhar: (y) => {
                const rotulos = { nome: 'INGREDIENTE', qtd: 'QTD', un: 'UN.', obs: 'OBSERVAÇÃO' };
                COZ_COLS.forEach(c => escrever(doc, NEG, 11 * s, CINZA_ROTULO, rotulos[c.chave],
                    x0 + c.x, y, c.w, { align: c.align, characterSpacing: 0.4 }));
                linha(doc, x0, y + hTh + 4, x0 + L, 1.5, PRETO);
            }
        };
    };

    for (const chave of chaves) {
        const titulo = tituloDaEtapa(chave, temEtapas);
        const itens = grupos[chave];
        blocos.push({ ...fazerTitulo(titulo), juntoCom: 2 });
        blocos.push(fazerCabecalhoTabela());

        for (const it of itens) {
            const nome = it.itemPcp?.nome || '—';
            const qtd = fmtQtd(it.quantidade);
            const un = unidadeDe(it.itemPcp);
            const obs = it.observacao || '';
            const tamUn = tamanhoQueCabe(doc, REG, 15 * s, un, COZ_COLS[2].w, 8 * s);
            const hNome = medir(doc, NEG, 15 * s, nome, COZ_COLS[0].w);
            const hQtd = medir(doc, NEG, 16 * s, qtd, COZ_COLS[1].w);
            const hUn = medir(doc, REG, tamUn, un || ' ', COZ_COLS[2].w);
            const tetoObs = Math.max(alturaUtil * 0.6, 40);
            const hObsReal = obs ? medir(doc, REG, 12 * s, obs, COZ_COLS[3].w) : 0;
            const hObs = Math.min(hObsReal, tetoObs);
            const hLinha = Math.max(hNome, hQtd, hUn, hObs) + 9;
            blocos.push({
                h: hLinha,
                aoQuebrar: () => [fazerTitulo(`${titulo} (continuação)`), fazerCabecalhoTabela()],
                desenhar: (y) => {
                    const t = y + 4.5;
                    escrever(doc, NEG, 15 * s, PRETO, nome, x0 + COZ_COLS[0].x, t, COZ_COLS[0].w);
                    escrever(doc, NEG, 16 * s, PRETO, qtd, x0 + COZ_COLS[1].x, t, COZ_COLS[1].w, { align: 'right' });
                    escrever(doc, REG, tamUn, CINZA_UN, un, x0 + COZ_COLS[2].x, t, COZ_COLS[2].w, { align: 'center' });
                    if (obs) {
                        escrever(doc, REG, 12 * s, CINZA_OBS, obs, x0 + COZ_COLS[3].x, t, COZ_COLS[3].w,
                            hObsReal > hObs ? { height: hObs, ellipsis: true } : {});
                    }
                    linha(doc, x0, y + hLinha - 1, x0 + L, 0.75, CINZA_LINHA);
                }
            });
        }
    }

    // ── Caixa de observações ──
    if (receita.observacoes && String(receita.observacoes).trim()) {
        const padX = 9;
        const largTexto = L - 2 * padX;
        const hRot = medir(doc, NEG, 11 * s, 'OBSERVAÇÕES', largTexto, { characterSpacing: 0.4 });
        blocos.push({ h: 14 * s, juntoCom: 2, desenhar: () => { } });   // respiro antes da caixa
        // topo da caixa: espaço antes dela (14*s) fica FORA da moldura, por isso
        // o rótulo é o primeiro bloco do grupo e já embute o recuo interno.
        blocos.push({
            grupo: 'obs',
            h: 7.5 + hRot + 4,
            desenhar: (y) => escrever(doc, NEG, 11 * s, CINZA_ROTULO, 'OBSERVAÇÕES',
                COZ_MARGEM + padX, y + 7.5, largTexto, { characterSpacing: 0.4 })
        });
        const partes = fatiarTexto(doc, REG, 14 * s, receita.observacoes, largTexto, alturaUtil - 40);
        partes.forEach(parte => {
            const h = medir(doc, REG, 14 * s, parte, largTexto);
            blocos.push({
                grupo: 'obs',
                h,
                desenhar: (y) => escrever(doc, REG, 14 * s, PRETO, parte, COZ_MARGEM + padX, y, largTexto)
            });
        });
        blocos.push({ grupo: 'obs', h: 7.5, desenhar: () => { } });
    }

    return blocos;
}

/**
 * Folha da receita para a cozinha (sem custos). Devolve Buffer do PDF.
 * `receita` no formato de pcpReceitaService.buscarPorId.
 */
function gerarReceitaCozinha(receita) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            // Margem de baixo ZERO de propósito: quem posiciona tudo aqui é o
            // motor de paginação (coordenadas absolutas). Com margem de baixo, o
            // pdfkit acha que o texto "transbordou" e cria página sozinho — era
            // isso que fazia uma receita de 14 itens sair em 3 folhas.
            margins: { top: 0, bottom: 0, left: COZ_MARGEM, right: COZ_MARGEM },
            bufferPages: true,
            info: { Title: `Receita - ${receita?.nome || ''}` }
        });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        try {
            const alturaUtil = A4_ALTURA - 2 * COZ_MARGEM - 26;   // 26pt reservados ao rodapé
            // Tenta caber em UMA folha encolhendo a letra; abaixo de 0,75 a
            // legibilidade na cozinha some — daí em diante pagina de verdade.
            let escolhido = null;
            for (const s of [1, 0.95, 0.9, 0.85, 0.8, 0.75]) {
                const paginas = paginar(blocosCozinha(doc, receita, s, alturaUtil), alturaUtil);
                if (paginas.length === 1) { escolhido = { s, paginas }; break; }
            }
            if (!escolhido) {
                const s = 0.9;
                escolhido = { s, paginas: paginar(blocosCozinha(doc, receita, s, alturaUtil), alturaUtil) };
            }

            desenharPaginas(doc, escolhido.paginas, COZ_MARGEM, COZ_MARGEM, COZ_LARGURA);
            desenharRodapes(doc, COZ_MARGEM, COZ_LARGURA, COZ_MARGEM,
                `Receita de produção — ${receita?.nome || ''}`, `Impresso em ${dataDeHoje()}`);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
}

// =====================================================================
// FOLHA 2 — receita COM CUSTOS (documento interno)
// =====================================================================
const CUS_MARGEM = 14 * MM;                       // @page margin: 14mm
const CUS_LARGURA = A4_LARGURA - 2 * CUS_MARGEM;  // 182mm de área útil
const CUS_COLS = [
    { chave: 'nome', x: 0, w: 199, align: 'left' },
    { chave: 'qtd', x: 207, w: 62, align: 'right' },
    { chave: 'un', x: 277, w: 46, align: 'center' },
    { chave: 'cu', x: 331, w: 92, align: 'right' },
    { chave: 'ct', x: 431, w: 85, align: 'right' }
];

function blocosCustos(doc, receita, custo, s, alturaUtil) {
    const x0 = CUS_MARGEM;
    const L = CUS_LARGURA;
    const blocos = [];
    const produz = linhaProduz(receita);
    const itens = receita.itens || [];

    // ── Cabeçalho ──
    const hTitulo = medir(doc, NEG, 22 * s, receita.nome || '—', L);
    const hProduz = medir(doc, NEG, 12 * s, produz.completo, L);
    const hRotulo = medir(doc, NEG, 9 * s, 'RENDIMENTO', L / 3, { characterSpacing: 0.4 });
    const hValor = medir(doc, NEG, 13 * s, 'Xg', L / 3);
    const hCabecalho = hTitulo + 3 + hProduz + 8 * s + hRotulo + 2 + hValor + 6 + 3 + 11 * s;

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${unidadeDe(receita.itemPcp)}`.trim();
    const perda = receita.perdaPercentual != null ? `${fmtPerda(receita.perdaPercentual)}%` : '—';

    blocos.push({
        h: hCabecalho,
        desenhar: (y) => {
            escrever(doc, NEG, 22 * s, PRETO, receita.nome || '—', x0, y, L);
            let yy = y + hTitulo + 3;
            doc.font(REG).fontSize(12 * s).fillColor(CINZA_UN);
            doc.text('Produz: ', x0, yy, { width: L, continued: true });
            doc.font(NEG).text(produz.nome, { continued: !!produz.tipo });
            if (produz.tipo) doc.font(REG).text(` (${produz.tipo})`);
            yy += hProduz + 8 * s;
            const metas = [
                ['RENDIMENTO', rendimento || '—'],
                ['PERDA PADRÃO', perda],
                ['VERSÃO', `v${receita.versao ?? '—'}`]
            ];
            metas.forEach(([rot, val], i) => {
                const cx = x0 + i * (L / 3);
                escrever(doc, NEG, 9 * s, CINZA_ROTULO, rot, cx, yy, L / 3 - 8, { characterSpacing: 0.4 });
                escrever(doc, NEG, 13 * s, PRETO, val, cx, yy + hRotulo + 2, L / 3 - 8);
            });
            linha(doc, x0, y + hCabecalho - 11 * s, x0 + L, 2.25, PRETO);
        }
    });

    const fazerCabecalhoTabela = (sufixo = '') => {
        const hTh = medir(doc, NEG, 9 * s, 'INGREDIENTE', CUS_COLS[0].w, { characterSpacing: 0.4 });
        return {
            h: 8 * s + hTh + 4 + 2,
            desenhar: (y) => {
                const t = y + 8 * s;
                const rotulos = {
                    nome: `INGREDIENTE${sufixo}`, qtd: 'QTD', un: 'UN.',
                    cu: 'CUSTO UNIT.', ct: 'CUSTO'
                };
                CUS_COLS.forEach(c => escrever(doc, NEG, 9 * s, CINZA_ROTULO, rotulos[c.chave],
                    x0 + c.x, t, c.w, { align: c.align, characterSpacing: 0.4 }));
                linha(doc, x0, t + hTh + 3, x0 + L, 1.5, PRETO);
            }
        };
    };

    blocos.push({ ...fazerCabecalhoTabela(), juntoCom: 1 });

    if (!itens.length) {
        blocos.push({
            h: medir(doc, REG, 12 * s, 'Sem ingredientes.', L) + 7.5,
            desenhar: (y) => escrever(doc, REG, 12 * s, PRETO, 'Sem ingredientes.', x0, y + 3.75, L)
        });
    }

    // custo.itens vem na MESMA ordem de receita.itens (mesmo orderBy no service);
    // ainda assim conferimos o itemPcpId antes de casar a linha.
    const custoDoItem = (it, idx) => {
        const c = custo?.itens?.[idx];
        if (c && (!c.itemPcpId || !it.itemPcpId || c.itemPcpId === it.itemPcpId)) return c;
        return (custo?.itens || []).find(x => x.itemPcpId === it.itemPcpId) || null;
    };

    itens.forEach((it, idx) => {
        const c = custoDoItem(it, idx);
        const nome = it.itemPcp?.nome || '—';
        const qtd = fmtQtd(it.quantidade);
        const un = unidadeDe(it.itemPcp);
        const cu = c ? (c.custoUnitario > 0 ? fmtMoeda(c.custoUnitario, 4) : 'sem custo') : '—';
        const ct = c ? fmtMoeda(c.custoTotal) : '—';
        const tamUn = tamanhoQueCabe(doc, REG, 12 * s, un, CUS_COLS[2].w, 7 * s);
        const hNome = medir(doc, NEG, 12 * s, nome, CUS_COLS[0].w);
        const hLinha = Math.max(
            hNome,
            medir(doc, REG, 12 * s, 'X', CUS_COLS[1].w),
            medir(doc, REG, tamUn, un || ' ', CUS_COLS[2].w)
        ) + 7.5;
        blocos.push({
            h: hLinha,
            aoQuebrar: () => [fazerCabecalhoTabela(' (continuação)')],
            desenhar: (y) => {
                const t = y + 3.75;
                escrever(doc, NEG, 12 * s, PRETO, nome, x0 + CUS_COLS[0].x, t, CUS_COLS[0].w);
                escrever(doc, REG, 12 * s, PRETO, qtd, x0 + CUS_COLS[1].x, t, CUS_COLS[1].w, { align: 'right' });
                escrever(doc, REG, tamUn, CINZA_UN, un, x0 + CUS_COLS[2].x, t, CUS_COLS[2].w, { align: 'center' });
                escrever(doc, REG, 12 * s, PRETO, cu, x0 + CUS_COLS[3].x, t, CUS_COLS[3].w, { align: 'right' });
                escrever(doc, REG, 12 * s, PRETO, ct, x0 + CUS_COLS[4].x, t, CUS_COLS[4].w, { align: 'right' });
                linha(doc, x0, y + hLinha - 1, x0 + L, 0.75, CINZA_LINHA);
            }
        });
    });

    // ── Rodapé da tabela: custo total ──
    const custoTotal = custo ? fmtMoeda(custo.custoTotal) : '—';
    const custoUnidade = custo ? fmtMoeda(custo.custoPorUnidade, 4) : '—';
    const un = unidadeDe(receita.itemPcp) || 'un';
    const hTfoot = medir(doc, NEG, 13 * s, custoTotal, CUS_COLS[4].w) + 9;
    blocos.push({
        h: hTfoot,
        desenhar: (y) => {
            linha(doc, x0, y + 1, x0 + L, 1.5, PRETO);
            const t = y + 5.5;
            escrever(doc, NEG, 13 * s, PRETO, 'Custo total', x0, t, CUS_COLS[3].x + CUS_COLS[3].w, { align: 'right' });
            escrever(doc, NEG, 13 * s, PRETO, custoTotal, x0 + CUS_COLS[4].x, t, CUS_COLS[4].w, { align: 'right' });
        }
    });

    // ── Resumo: duas caixas lado a lado ──
    const gap = 12;
    const largCaixa = (L - gap) / 2;
    const padX = 9, padY = 7.5;
    const hRotBox = medir(doc, NEG, 9 * s, 'CUSTO TOTAL DA RECEITA', largCaixa - 2 * padX, { characterSpacing: 0.4 });
    const hValBox = medir(doc, NEG, 18 * s, custoTotal, largCaixa - 2 * padX);
    const hCaixa = padY * 2 + hRotBox + 2 + hValBox;
    blocos.push({
        h: 13 * s + hCaixa,
        desenhar: (y) => {
            const topo = y + 13 * s;
            const caixas = [
                ['CUSTO TOTAL DA RECEITA', custoTotal],
                [`CUSTO POR ${String(un).toUpperCase()}`, custoUnidade]
            ];
            caixas.forEach(([rot, val], i) => {
                const cx = x0 + i * (largCaixa + gap);
                doc.roundedRect(cx, topo, largCaixa, hCaixa, 4.5).lineWidth(1.5).strokeColor(PRETO).stroke();
                escrever(doc, NEG, 9 * s, CINZA_ROTULO, rot, cx + padX, topo + padY, largCaixa - 2 * padX, { characterSpacing: 0.4 });
                escrever(doc, NEG, 18 * s, PRETO, val, cx + padX, topo + padY + hRotBox + 2, largCaixa - 2 * padX);
            });
        }
    });

    // ── Observações (mesma moldura das caixas) ──
    if (receita.observacoes && String(receita.observacoes).trim()) {
        const largTexto = L - 2 * padX;
        const hRot = medir(doc, NEG, 9 * s, 'OBSERVAÇÕES', largTexto, { characterSpacing: 0.4 });
        blocos.push({ h: 10 * s, juntoCom: 2, desenhar: () => { } });   // respiro antes da caixa
        blocos.push({
            grupo: 'obs',
            h: padY + hRot + 3,
            desenhar: (y) => escrever(doc, NEG, 9 * s, CINZA_ROTULO, 'OBSERVAÇÕES',
                x0 + padX, y + padY, largTexto, { characterSpacing: 0.4 })
        });
        const partes = fatiarTexto(doc, REG, 12 * s, receita.observacoes, largTexto, alturaUtil - 40);
        partes.forEach(parte => {
            blocos.push({
                grupo: 'obs',
                h: medir(doc, REG, 12 * s, parte, largTexto),
                desenhar: (y) => escrever(doc, REG, 12 * s, PRETO, parte, x0 + padX, y, largTexto)
            });
        });
        blocos.push({ grupo: 'obs', h: padY, desenhar: () => { } });
    }

    return blocos;
}

/**
 * Folha da receita COM CUSTOS (documento interno). Devolve Buffer do PDF.
 * `custo` no formato de pcpReceitaService.calcularCusto (pode vir null —
 * nesse caso os valores saem como "—", igual à tela).
 */
function gerarReceitaComCustos(receita, custo) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            // margem de baixo ZERO — ver comentário em gerarReceitaCozinha
            margins: { top: 0, bottom: 0, left: CUS_MARGEM, right: CUS_MARGEM },
            bufferPages: true,
            info: { Title: `Receita (custos) - ${receita?.nome || ''}` }
        });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        try {
            const alturaUtil = A4_ALTURA - 2 * CUS_MARGEM - 26;
            let escolhido = null;
            for (const s of [1, 0.95, 0.9, 0.85]) {
                const paginas = paginar(blocosCustos(doc, receita, custo, s, alturaUtil), alturaUtil);
                if (paginas.length === 1) { escolhido = { s, paginas }; break; }
            }
            if (!escolhido) {
                const s = 0.9;
                escolhido = { s, paginas: paginar(blocosCustos(doc, receita, custo, s, alturaUtil), alturaUtil) };
            }

            desenharPaginas(doc, escolhido.paginas, CUS_MARGEM, CUS_MARGEM, CUS_LARGURA);
            desenharRodapes(doc, CUS_MARGEM, CUS_LARGURA, CUS_MARGEM,
                `Impresso em ${dataDeHoje()}`, 'Documento interno — contém custos');
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = { gerarReceitaCozinha, gerarReceitaComCustos };
