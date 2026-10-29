// Etiquetas do funcionário: PASTA de desligamento (100 × 120), ARMÁRIO (40 × 25 ou 100 × 120, só o nome) e ABA da pasta suspensa (40 × 25 dobrável).
// Só preto no branco (impressora térmica). O texto é MEDIDO com canvas ao montar o HTML — por isso as
// fontes precisam estar carregadas antes (carregarFontesFuncionario). Nada de cor, nada de ícone.
import { escaparHtml } from '../../utils/imprimirNaPagina';

export const MOTIVOS = {
    DISPENSA_SEM_JUSTA_CAUSA: 'Dispensa pela empresa, sem justa causa',
    PEDIDO_DEMISSAO: 'Pedido de demissão pelo funcionário',
    JUSTA_CAUSA: 'Dispensa por justa causa',
    TERMINO_EXPERIENCIA: 'Término do contrato de experiência',
    ACORDO: 'Acordo entre as partes',
    OUTRO: 'Outro',
};
export const AVISOS = {
    TRABALHADO: 'Trabalhado',
    INDENIZADO: 'Indenizado',
    DISPENSADO: 'Dispensado do aviso',
    NAO_SE_APLICA: 'Não se aplica',
};

const PILHA = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";
const MM_PX = 96 / 25.4;
export const FONTES_FUNCIONARIO = ['800 12pt Manrope', '700 12pt Manrope', '600 12pt Manrope'];

export async function carregarFontesFuncionario() {
    try {
        await Promise.all(FONTES_FUNCIONARIO.map((f) => document.fonts.load(f).catch(() => {})));
        await document.fonts.ready;
    } catch { /* sem Font Loading API */ }
}

// ISO ('2026-02-02T00:00:00.000Z' ou '2026-02-02') -> 'YYYY-MM-DD' SEM passar por Date (não perde um dia por fuso)
export const isoDia = (v) => {
    const s = String(v ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};
export const dataBr = (v) => {
    const s = isoDia(v);
    return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
};
export const cpfFmt = (v) => {
    const d = String(v ?? '').replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
};

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** '4 meses e 10 dias' entre duas datas ISO (fim inclusive). '' se faltar data ou se for incoerente. */
export function tempoDeCasa(ini, fim) {
    const a = isoDia(ini), b = isoDia(fim);
    if (!a || !b || b < a) return '';
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    let meses = (yb - ya) * 12 + (mb - ma);
    let dias = db - da;
    if (dias < 0) { meses -= 1; dias += new Date(Date.UTC(yb, mb - 1, 0)).getUTCDate(); }
    const anos = Math.floor(meses / 12);
    meses %= 12;
    const partes = [];
    if (anos) partes.push(plural(anos, 'ano', 'anos'));
    if (meses) partes.push(plural(meses, 'mês', 'meses'));
    if (dias || !partes.length) partes.push(plural(dias, 'dia', 'dias'));
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
}

// ── medição de texto ──────────────────────────────────────────────────────────
let _ctx;
function larguraPx100(texto, peso) {
    try {
        if (_ctx === undefined) _ctx = (typeof document !== 'undefined' && document.createElement('canvas').getContext('2d')) || null;
        if (!_ctx) return null;
        _ctx.font = `${peso} 100px ${PILHA}`;
        const w = _ctx.measureText(texto).width;
        return w > 0 ? w : null;
    } catch { return null; }
}
// sem canvas (teste em node): estimativa média de 0,6 em por caractere
const larguraEm = (texto, peso) => { const w = larguraPx100(texto, peso); return w ? w / 100 : texto.length * 0.62; };

/**
 * Quebra o texto em até `maxLinhas` linhas e acha o MAIOR tamanho (pt, entre minPt e tetoPt) em que
 * todas cabem em `larguraMm` e a altura (linhas × entrelinha) cabe em `alturaMm`. Medido, não estimado.
 * Devolve { pt, linhas }.
 */
export function ajustarTexto(texto, { larguraMm, alturaMm, maxLinhas, tetoPt, minPt, peso = 800, entrelinha = 1.05 }) {
    const t = String(texto || '').trim().replace(/\s+/g, ' ');
    if (!t) return { pt: tetoPt, linhas: [] };
    const palavras = t.split(' ');
    const wMax = larguraMm * MM_PX; // px
    for (let pt = tetoPt; pt >= minPt - 0.001; pt -= 0.5) {
        const px = pt / 0.75;
        const cabe = (s) => larguraEm(s, peso) * px <= wMax;
        const linhas = [];
        let atual = '';
        let ok = true;
        for (const p of palavras) {
            const tent = atual ? `${atual} ${p}` : p;
            if (cabe(tent)) { atual = tent; continue; }
            if (!atual) { ok = false; break; }        // uma palavra sozinha não cabe: reduz a fonte
            linhas.push(atual);
            atual = p;
            if (!cabe(atual)) { ok = false; break; }
        }
        if (!ok) continue;
        linhas.push(atual);
        if (linhas.length > maxLinhas) continue;
        if (linhas.length * pt * entrelinha * (25.4 / 72) > alturaMm) continue;
        return { pt, linhas };
    }
    // não coube nem no mínimo: corta no mínimo em maxLinhas linhas (nunca estoura a etiqueta)
    const px = minPt / 0.75;
    const linhas = [];
    let atual = '';
    for (const p of palavras) {
        const tent = atual ? `${atual} ${p}` : p;
        if (larguraEm(tent, peso) * px <= wMax || !atual) atual = tent; else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
    return { pt: minPt, linhas: linhas.slice(0, maxLinhas), cortou: linhas.length > maxLinhas };
}

const nomeMaiusculo = (f) => String(f?.nome || '').toLocaleUpperCase('pt-BR');
const hojeBr = () => new Date().toLocaleDateString('pt-BR');

/** Dados prontos (sem undefined) usados pelas duas etiquetas. */
export function dadosEtiqueta(f) {
    const admissao = dataBr(f?.dataAdmissao);
    const demissao = dataBr(f?.dataDemissao);
    const motivo = MOTIVOS[f?.motivoDesligamento] || '';
    const aviso = AVISOS[f?.avisoPrevio] || '';
    return {
        nome: nomeMaiusculo(f),
        cargo: String(f?.cargo || '').trim(),
        cpf: cpfFmt(f?.cpf),
        admissao, demissao,
        tempo: tempoDeCasa(f?.dataAdmissao, f?.dataDemissao),
        motivo, aviso,
        faltas: [!demissao && 'data de demissão', !motivo && 'motivo'].filter(Boolean),
    };
}

// ─── PASTA — 100 × 120 mm em pé ───────────────────────────────────────────────
export function montarPasta(f) {
    const d = dadosEtiqueta(f);
    const nome = ajustarTexto(d.nome, { larguraMm: 88, alturaMm: 38, maxLinhas: 3, tetoPt: 40, minPt: 10 });
    const motivoAj = ajustarTexto(d.motivo, { larguraMm: 88, alturaMm: 14, maxLinhas: 2, tetoPt: 13, minPt: 8.5, peso: 700 });
    const infoLinha = [d.cargo, d.cpf && `CPF ${d.cpf}`].filter(Boolean).join('  ·  ');
    const infoAj = ajustarTexto(infoLinha, { larguraMm: 88, alturaMm: 6, maxLinhas: 1, tetoPt: 12, minPt: 7.5, peso: 700 });
    const linhasNome = nome.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('');
    const motivoHtml = d.motivo ? `
        <div class="mot">
            <div class="rot">MOTIVO DO DESLIGAMENTO</div>
            <div class="mt" style="font-size:${motivoAj.pt}pt">${motivoAj.linhas.map((l) => `<div>${escaparHtml(l.toLocaleUpperCase('pt-BR'))}</div>`).join('')}</div>
            ${d.aviso ? `<div class="av">Aviso prévio: ${escaparHtml(d.aviso.toLocaleLowerCase('pt-BR'))}</div>` : ''}
        </div>` : (d.aviso ? `<div class="mot"><div class="av">Aviso prévio: ${escaparHtml(d.aviso.toLocaleLowerCase('pt-BR'))}</div></div>` : '<div class="mot"></div>');
    const corpo = `<div class="etq pasta">
        <div class="faixa">PASTA DE FUNCIONÁRIO</div>
        <div class="nomebox"><div class="nome" style="font-size:${nome.pt}pt">${linhasNome}</div></div>
        ${infoLinha ? `<div class="info" style="font-size:${infoAj.pt}pt">${escaparHtml(infoAj.linhas[0] || infoLinha)}</div>` : '<div class="info"></div>'}
        <div class="datas">
            <div class="dt"><div class="rot">ADMISSÃO</div><div class="vl">${escaparHtml(d.admissao || '—')}</div></div>
            <div class="dt"><div class="rot">DEMISSÃO</div><div class="vl">${escaparHtml(d.demissao || '—')}</div></div>
        </div>
        <div class="tempo">${d.tempo ? `Tempo de casa: <b>${escaparHtml(d.tempo)}</b>` : ''}</div>
        ${motivoHtml}
        <div class="rod">HARDT DOCES E SALGADOS · impresso em ${hojeBr()}</div>
    </div>`;
    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.pasta { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; flex-direction: column; border: 0.5mm solid #000; text-align: center; }
        #area-impressao .pasta .faixa { background: #000; color: #fff; font-weight: 800; font-size: 15pt; letter-spacing: 0.12em; height: 14mm; flex: none;
            display: flex; align-items: center; justify-content: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #area-impressao .pasta .nomebox { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 2mm 5mm; }
        #area-impressao .pasta .nome { font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; }
        #area-impressao .pasta .ln { white-space: nowrap; }
        #area-impressao .pasta .info { flex: none; font-weight: 700; padding: 0 5mm 2mm; white-space: nowrap; min-height: 6mm; }
        #area-impressao .pasta .datas { flex: none; display: flex; gap: 3mm; padding: 0 5mm; }
        #area-impressao .pasta .dt { flex: 1; border: 0.6mm solid #000; padding: 1.2mm 1mm 1.6mm; }
        #area-impressao .pasta .rot { font-size: 7.5pt; font-weight: 800; letter-spacing: 0.14em; }
        #area-impressao .pasta .vl { font-size: 20pt; font-weight: 800; line-height: 1.1; white-space: nowrap; }
        #area-impressao .pasta .tempo { flex: none; font-size: 10.5pt; font-weight: 600; padding: 2mm 5mm 0; min-height: 7mm; }
        #area-impressao .pasta .tempo b { font-weight: 800; }
        #area-impressao .pasta .mot { flex: none; margin: 1.5mm 5mm 0; border-top: 0.5mm solid #000; padding-top: 1.5mm; min-height: 20mm; }
        #area-impressao .pasta .mot:empty { border-top: 0; }
        #area-impressao .pasta .mt { font-weight: 700; line-height: 1.1; margin-top: 0.6mm; }
        #area-impressao .pasta .av { font-size: 10pt; font-weight: 600; margin-top: 1mm; }
        #area-impressao .pasta .rod { flex: none; font-size: 6.5pt; font-weight: 600; padding: 1mm 0 2mm; letter-spacing: 0.04em; }
    `;
    return { estilos, corpo, dados: d, cortou: !!nome.cortou };
}

// ─── ABA da pasta suspensa — 40 × 25 mm, DOBRÁVEL ────────────────────────────
// Duas faixas de 12,5 mm: em cima o nome, embaixo o MESMO nome girado 180°. Dobra-se na linha tracejada
// (cola com cola) e o cartão entra na aba de plástico lendo certo dos dois lados.
function ajusteNomeAba(nomeTxt) {
    const base = { larguraMm: 36.4, alturaMm: 10.4, entrelinha: 1.05 };
    let n = ajustarTexto(nomeTxt, { ...base, maxLinhas: 2, tetoPt: 15, minPt: 6.5 });
    if (n.cortou) n = ajustarTexto(nomeTxt, { ...base, maxLinhas: 3, tetoPt: 15, minPt: 3.5 });
    return n;
}
export function montarAba(f, copias = 1, colunas = 2) {
    const d = dadosEtiqueta(f);
    const n = ajusteNomeAba(d.nome);
    const linhas = n.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('');
    const metade = (inv) => `<div class="metade${inv ? ' inv' : ''}"><div class="nome" style="font-size:${n.pt}pt">${linhas}</div></div>`;
    const etq = `<div class="etq aba">${metade(false)}<div class="dobra"></div>${metade(true)}</div>`;
    const cols = Number(colunas) === 1 ? 1 : 2;
    const qtd = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    const paginas = [];
    for (let i = 0; i < qtd; i += cols) paginas.push(`<div class="pag">${Array.from({ length: Math.min(cols, qtd - i) }, () => etq).join('')}</div>`);
    const largPag = cols === 2 ? '84mm' : '40mm';
    const estilos = `
        @page { size: ${largPag} 25mm; margin: 0; }
        html.modo-impressao #area-impressao { width: ${largPag} !important; max-width: none !important; margin: 0 !important; }
        #area-impressao { color: #000; }
        #area-impressao .pag { width: ${largPag}; height: 25mm; display: flex; overflow: hidden; ${cols === 2 ? 'padding-left: 2mm; gap: 2mm;' : ''} page-break-after: always; break-after: page; }
        #area-impressao .pag:last-child { page-break-after: auto; break-after: auto; }
        #area-impressao .etq.aba { width: 40mm; height: 25mm; flex: none; overflow: hidden; background: #fff; color: #000; box-sizing: border-box; position: relative; font-family: ${PILHA}; text-align: center; }
        #area-impressao .aba .metade { position: absolute; left: 0; width: 40mm; height: 12.5mm; display: flex; align-items: center; justify-content: center; padding: 0 1.8mm; box-sizing: border-box; }
        #area-impressao .aba .metade:first-child { top: 0; }
        #area-impressao .aba .metade.inv { top: 12.5mm; transform: rotate(180deg); }
        #area-impressao .aba .nome { font-weight: 800; line-height: 1.05; }
        #area-impressao .aba .ln { white-space: nowrap; }
        #area-impressao .aba .dobra { position: absolute; left: 1mm; right: 1mm; top: 12.5mm; border-top: 0.3mm dashed #000; }
    `;
    return { estilos, corpo: paginas.join(''), dados: d, cortou: !!n.cortou };
}

// ─── ARMÁRIO — 40 × 25 mm, só o nome (uma face, sem dobra) ───────────────────
export function montarArmario(f, copias = 1, colunas = 2) {
    const d = dadosEtiqueta(f);
    const base = { larguraMm: 36.4, alturaMm: 21, entrelinha: 1.05 };
    let n = ajustarTexto(d.nome, { ...base, maxLinhas: 2, tetoPt: 24, minPt: 7 });
    if (n.cortou) n = ajustarTexto(d.nome, { ...base, maxLinhas: 3, tetoPt: 24, minPt: 4.5 });
    const etq = `<div class="etq armario"><div class="nome" style="font-size:${n.pt}pt">${n.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('')}</div></div>`;
    const cols = Number(colunas) === 1 ? 1 : 2;
    const qtd = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    const paginas = [];
    for (let i = 0; i < qtd; i += cols) paginas.push(`<div class="pag">${Array.from({ length: Math.min(cols, qtd - i) }, () => etq).join('')}</div>`);
    const largPag = cols === 2 ? '84mm' : '40mm';
    const estilos = `
        @page { size: ${largPag} 25mm; margin: 0; }
        html.modo-impressao #area-impressao { width: ${largPag} !important; max-width: none !important; margin: 0 !important; }
        #area-impressao { color: #000; }
        #area-impressao .pag { width: ${largPag}; height: 25mm; display: flex; overflow: hidden; ${cols === 2 ? 'padding-left: 2mm; gap: 2mm;' : ''} page-break-after: always; break-after: page; }
        #area-impressao .pag:last-child { page-break-after: auto; break-after: auto; }
        #area-impressao .etq.armario { width: 40mm; height: 25mm; flex: none; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; align-items: center; justify-content: center; text-align: center; padding: 1.8mm; }
        #area-impressao .armario .nome { font-weight: 800; line-height: 1.05; }
        #area-impressao .armario .ln { white-space: nowrap; }
    `;
    return { estilos, corpo: paginas.join(''), dados: d, cortou: !!n.cortou };
}

// ─── ARMÁRIO GRANDE — 100 × 120 mm, só o nome ────────────────────────────────
export function montarArmarioGrande(f) {
    const d = dadosEtiqueta(f);
    const base = { larguraMm: 90, alturaMm: 104, entrelinha: 1.05 };
    let n = ajustarTexto(d.nome, { ...base, maxLinhas: 3, tetoPt: 80, minPt: 14 });
    if (n.cortou) n = ajustarTexto(d.nome, { ...base, maxLinhas: 4, tetoPt: 80, minPt: 8 });
    const corpo = `<div class="etq armariog"><div class="nome" style="font-size:${n.pt}pt">${n.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('')}</div></div>`;
    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.armariog { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; align-items: center; justify-content: center; text-align: center; padding: 3mm 5mm; }
        #area-impressao .armariog .nome { font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; }
        #area-impressao .armariog .ln { white-space: nowrap; }
    `;
    return { estilos, corpo, dados: d, cortou: !!n.cortou };
}

// ─── Rasterização para a fila (Zebra) ────────────────────────────────────────
const erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });

async function rasterizar100x120(montada) {
    await carregarFontesFuncionario();
    const R = await import('../PCP/etiquetaRaster');
    const r = await R.rasterizarEtiquetas({ itens: [{ html: montada.corpo, estilos: montada.estilos, seletorCelula: '.etq', larguraMm: 100, alturaMm: 120 }] });
    const bm = r.bitmaps[0];
    if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    return { bitmaps: [await R.empacotarParaEnvio(bm)] };   // cópias vão no corpo do pedido (copias)
}
/** Pasta → { bitmaps:[1] } (800×960). */
export const prepararPasta = async (f) => rasterizar100x120(montarPasta(f));
/** Armário grande → { bitmaps:[1] } (800×960). */
export const prepararArmarioGrande = async (f) => rasterizar100x120(montarArmarioGrande(f));
/** Armário (40×25, uma face) → 1 bitmap 320×200 + `sequencia` repetida por cópia. */
export async function prepararArmario(f, copias = 1) {
    await carregarFontesFuncionario();
    const R = await import('../PCP/etiquetaRaster');
    const m = montarArmario(f, 1, 1);
    const r = await R.rasterizarEtiquetas({ itens: [{ html: m.corpo, estilos: m.estilos, seletorCelula: '.etq', larguraMm: 40, alturaMm: 25 }] });
    const bm = r.bitmaps[0];
    if (!bm || r.indices.length !== 1 || bm.larguraDots !== 320 || bm.alturaDots !== 200) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    const n = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    return { bitmaps: [await R.empacotarParaEnvio(bm)], sequencia: Array(n).fill(0) };
}

/** Só a metade de cima da aba (40 × 12,5 mm), sem transform: é o que vai para o rasterizador. */
function montarMetadeAba(f) {
    const d = dadosEtiqueta(f);
    const n = ajusteNomeAba(d.nome);
    const corpo = `<div class="etq abameia"><div class="nome" style="font-size:${n.pt}pt">${n.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('')}</div></div>`;
    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.abameia { width: 40mm; height: 12.5mm; overflow: hidden; background: #fff; color: #000; box-sizing: border-box; font-family: ${PILHA};
            display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 1.8mm; }
        #area-impressao .abameia .nome { font-weight: 800; line-height: 1.05; }
        #area-impressao .abameia .ln { white-space: nowrap; }
    `;
    return { corpo, estilos };
}

/**
 * Bitmap 320 × 200 (40 × 25 mm) da aba dobrável. O texto é rasterizado UMA vez (metade de cima) e a de baixo é a
 * MESMA imagem girada 180° no canvas — o rasterizador repinta texto em pé e ignora `transform: rotate`, então
 * o giro tem que ser feito sobre os pixels. A linha de dobra é desenhada direto no canvas.
 */
export async function bitmapAba(f) {
    await carregarFontesFuncionario();
    const R = await import('../PCP/etiquetaRaster');
    const m = montarMetadeAba(f);
    const r = await R.rasterizarEtiquetas({ itens: [{ html: m.corpo, estilos: m.estilos, seletorCelula: '.etq', larguraMm: 40, alturaMm: 12.5 }] });
    const topo = r.bitmaps[0];
    if (!topo || topo.larguraDots !== 320 || topo.alturaDots !== 100) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    const meia = R.bitmapParaCanvas(topo);
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 200);
    ctx.drawImage(meia, 0, 0);
    ctx.save(); ctx.translate(320, 200); ctx.rotate(Math.PI); ctx.drawImage(meia, 0, 0); ctx.restore();
    ctx.fillStyle = '#000';
    for (let x = 8; x < 312; x += 12) ctx.fillRect(x, 99, 6, 2);   // tracejado da dobra (0,3 mm)
    return R.empacotarBitmap(c);
}

/** Aba dobrável → 1 bitmap único + `sequencia` repetida N vezes (N cópias iguais = 1 imagem). */
export async function prepararAba(f, copias = 1) {
    const R = await import('../PCP/etiquetaRaster');
    const bm = await bitmapAba(f);
    const n = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    return { bitmaps: [await R.empacotarParaEnvio(bm)], sequencia: Array(n).fill(0) };
}
