// Geradores de etiqueta da Cozinha — funções PURAS (sem banco, sem rede).
//
//   renderEpl2Pequena(dados, impressora) -> Buffer   Zebra TLP 2844, rolo 84x25, 2 colunas de 40x25
//   renderZplGrande(dados, impressora)   -> Buffer   ZDesigner, etiqueta 100x120
//   renderTeste(tipo, impressora)        -> Buffer   TEXTO_EPL2 | TEXTO_ZPL | ETIQUETA_EXEMPLO
//
// Entrada comum (dados): { nome, fabricacao:'YYYY-MM-DD', validade:'YYYY-MM-DD', conservacao:'REFRIGERADO'|'CONGELADO',
//   pesoGramas?, lote, responsavelIniciais?, responsavelNome?, quantidade }
//
// Datas são TEXTO 'YYYY-MM-DD' — nunca `new Date('YYYY-MM-DD')` (vira UTC e erra o dia à noite).
// Plano: docs/etiquetas-cozinha/PLANO-ARQUITETO.md seções 3.1 a 3.4.
//
// ⚠ Geometria/fonte/âncora do texto rotacionado só ficam PROVADAS na Zebra física (calibração, plano 3.2/3.4).

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const DIAS_EXT = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
const DIAS_EXT_ACENTO = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
const DIAS_ACENTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const MAX_QUANTIDADE = 200;

// ---------- utilidades ----------

function partesData(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
}
function diaSemana(str) {
    const p = partesData(str);
    if (!p) return 0;
    return new Date(p.y, p.m - 1, p.d).getDay(); // construtor local (não UTC)
}
function ddmm(str) {
    const p = partesData(str);
    return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}` : '--/--';
}
function ddmmaaaa(str) {
    const p = partesData(str);
    return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : '--/--/----';
}
function hojeStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function somaDias(str, dias) {
    const p = partesData(str);
    const d = new Date(p.y, p.m - 1, p.d + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function semAcento(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function semControle(s) {
    return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Limpa o texto para entrar num campo. `ascii` = true remove acento e tudo fora do ASCII imprimível.
function limpar(s, ascii) {
    let t = semControle(s);
    if (ascii) t = semAcento(t).replace(/[^\x20-\x7e]/g, '?');
    return t;
}

function pesoTexto(g) {
    const n = Number(g);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1000) return `${Math.round(n)}g`;
    return `${(n / 1000).toFixed(1).replace('.', ',')}kg`;
}
function pesoTextoLongo(g) {
    const t = pesoTexto(g);
    return t ? `Peso: ${t.replace(/(kg|g)$/, ' $1')}` : '';
}

function qtd(dados) {
    const q = Math.floor(Number(dados.quantidade));
    if (!Number.isFinite(q) || q < 1) return 1;
    return Math.min(q, MAX_QUANTIDADE);
}

// Quebra por palavra em no máximo `maxLinhas` linhas de `larg` caracteres. Retorna linhas ou null se não cabe.
function quebrar(texto, larg, maxLinhas) {
    const palavras = texto.split(' ').filter(Boolean);
    const linhas = [];
    let atual = '';
    for (let w of palavras) {
        while (w.length > larg) { // palavra maior que a linha: corta
            if (atual) { linhas.push(atual); atual = ''; }
            linhas.push(w.slice(0, larg));
            w = w.slice(larg);
        }
        if (!atual) atual = w;
        else if ((atual + ' ' + w).length <= larg) atual += ' ' + w;
        else { linhas.push(atual); atual = w; }
    }
    if (atual) linhas.push(atual);
    return linhas.length <= maxLinhas ? linhas : null;
}

// ---------- EPL2 (40x25, 2 colunas) ----------

function epl2Escape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// fonte EPL2 interna: [fonte, largura do char, altura, caracteres por linha de 260 dots]
const FONTES_NOME = [
    { f: 4, h: 24, cars: 18 },
    { f: 3, h: 20, cars: 21 },
    { f: 2, h: 16, cars: 26 },
];

function escolherFonteNome(nome) {
    for (const fo of FONTES_NOME) {
        const l = quebrar(nome, fo.cars, 2);
        if (l) return { ...fo, linhas: l };
    }
    const fo = FONTES_NOME[FONTES_NOME.length - 1];
    const todas = quebrar(nome, fo.cars, 99) || [nome.slice(0, fo.cars)];
    const linhas = todas.slice(0, 2);
    if (todas.length > 2 && linhas[1].length > 0) linhas[1] = linhas[1].slice(0, fo.cars - 1) + '.';
    return { ...fo, linhas };
}

// Elementos de UMA etiqueta (coluna) em EPL2. ox = deslocamento X da coluna; oy = deslocamento Y.
function colunaEpl2(dados, ox, oy, ascii) {
    const L = [];
    const A = (x, y, rot, fonte, hm, vm, rev, txt) =>
        `A${x},${y + oy},${rot},${fonte},${hm},${vm},${rev},"${epl2Escape(limpar(txt, ascii))}"`;

    const dow = diaSemana(dados.fabricacao);
    const faixa = `${(ascii ? DIAS : DIAS_ACENTO)[dow]} ${ddmm(dados.fabricacao)}`;
    const nome = limpar(dados.nome, ascii).toUpperCase();
    const fo = escolherFonteNome(nome);

    L.push(`LO${ox},${oy},48,200`); // faixa preta 6 mm
    // Texto rotacionado 270 graus (lê de baixo p/ cima), vídeo reverso sobre o preto. Fonte 3 = 12x20.
    const compFaixa = faixa.length * 12;
    L.push(A(ox + 14, Math.round((200 + compFaixa) / 2), 3, 3, 1, 1, 'R', faixa));

    fo.linhas.forEach((ln, i) => L.push(A(ox + 56, 6 + i * (fo.h + 2), 0, fo.f, 1, 1, 'N', ln)));

    L.push(`X${ox + 56},${72 + oy},3,${ox + 316},${134 + oy}`); // caixa da validade
    L.push(A(ox + 64, 86, 0, 3, 1, 1, 'N', 'VAL'));
    L.push(A(ox + 112, 79, 0, 5, 1, 1, 'N', ddmm(dados.validade)));

    const peso = pesoTexto(dados.pesoGramas);
    L.push(A(ox + 56, 142, 0, 2, 1, 1, 'N', (`FAB ${ddmm(dados.fabricacao)}${peso ? '  ' + peso : ''}`).slice(0, 26)));
    const cons = String(dados.conservacao).toUpperCase() === 'CONGELADO' ? 'CONGEL' : 'REFRIG';
    const iniciais = limpar(dados.responsavelIniciais || '', ascii).slice(0, 4);
    L.push(A(ox + 56, 168, 0, 2, 1, 1, 'N', (`${cons}  L${dados.lote || ''}${iniciais ? ' ' + iniciais : ''}`).slice(0, 26)));
    return L;
}

function renderEpl2Pequena(dados, impressora = {}) {
    const ajustes = impressora.ajustes || {};
    const ascii = impressora.removerAcentos !== false;
    const colunas = Number(impressora.colunas) >= 2 ? 2 : 1;
    const rolo = Number(impressora.larguraRoloMm) > 0 ? Number(impressora.larguraRoloMm) : 84;
    const gap = Number.isFinite(Number(impressora.gapDots)) && Number(impressora.gapDots) > 0 ? Number(impressora.gapDots) : 24;
    const offsetX = Number(ajustes.offsetX) || 0;
    const oy = Number(ajustes.offsetY) || 0;
    const col1 = (Number.isFinite(Number(ajustes.col1X)) && ajustes.col1X != null ? Number(ajustes.col1X) : 16) + offsetX;
    const col2 = (Number.isFinite(Number(ajustes.col2X)) && ajustes.col2X != null ? Number(ajustes.col2X) : 352) + offsetX;
    const dens = Number(ajustes.densidade) || 8;
    const vel = Number(ajustes.velocidade) || 2;

    const linhas = ['', 'N', `q${rolo * 8}`, `Q200,${gap}`, `D${dens}`, `S${vel}`, 'ZT'];
    if (!ascii) linhas.push('I8,A,055'); // Windows-1252 — só ligar depois de validar (plano 3.2 item 4)

    const total = qtd(dados);
    const formularios = [];
    if (colunas === 2) {
        const pares = Math.floor(total / 2);
        if (pares > 0) formularios.push({ els: [...colunaEpl2(dados, col1, oy, ascii), ...colunaEpl2(dados, col2, oy, ascii)], n: pares });
        if (total % 2 === 1) formularios.push({ els: colunaEpl2(dados, col1, oy, ascii), n: 1 }); // sobra sai sozinha
    } else {
        formularios.push({ els: colunaEpl2(dados, col1, oy, ascii), n: total });
    }
    for (const f of formularios) linhas.push('N', ...f.els, `P${f.n}`);
    return Buffer.from(linhas.join('\n') + '\n', ascii ? 'ascii' : 'latin1');
}

// ---------- ZPL (100x120) ----------

function zplEscape(s) {
    // ^ ~ \ são especiais em ZPL: troca por espaço (plano 3)
    return String(s).replace(/[\^~\\]/g, ' ');
}

// Largura média de caractere da fonte 0 ≈ 0,55 * altura (estimativa conservadora; calibrar na impressora)
const ZPL_LARG = 0.55;

function escolherFonteZplNome(nome, areaLarg, maxLinhas) {
    for (let h = 120; h >= 52; h -= 8) {
        const cars = Math.max(1, Math.floor(areaLarg / (h * ZPL_LARG)));
        const l = quebrar(nome, cars, maxLinhas);
        if (l) return { h, linhas: l, cars };
    }
    const h = 52;
    const cars = Math.max(1, Math.floor(areaLarg / (h * ZPL_LARG)));
    const todas = quebrar(nome, cars, 99) || [nome.slice(0, cars)];
    const linhas = todas.slice(0, maxLinhas);
    const ult = linhas.length - 1;
    if (todas.length > maxLinhas) linhas[ult] = linhas[ult].slice(0, Math.max(1, cars - 1)) + '.';
    return { h, linhas, cars };
}

// Monta a lista de elementos lógicos (canvas 800x960 @203dpi), depois emite aplicando dpi/rotacao.
function elementosZplGrande(dados, ascii) {
    const E = [];
    const dow = diaSemana(dados.fabricacao);
    const diaExt = (ascii ? DIAS_EXT : DIAS_EXT_ACENTO)[dow];
    const congelado = String(dados.conservacao).toUpperCase() === 'CONGELADO';
    const consTxt = congelado ? 'CONGELADO -18 C' : 'REFRIGERADO 0-4 C';
    const nome = limpar(dados.nome, ascii);
    const fonte = escolherFonteZplNome(nome, 720, 3);
    const peso = pesoTextoLongo(dados.pesoGramas);
    const resp = limpar(dados.responsavelNome || '', ascii).slice(0, 24);

    E.push({ t: 'box', x: 0, y: 0, w: 800, h: 110, th: 110 });
    E.push({ t: 'txt', x: 30, y: 30, h: 56, rev: true, w: 440, txt: `${diaExt} - ${ddmm(dados.fabricacao)}` });
    E.push({ t: 'txt', x: 480, y: 34, h: 40, rev: true, w: 300, txt: consTxt });
    E.push({ t: 'txt', x: 40, y: 140, h: fonte.h, w: 720, fb: { larg: 720, linhas: 3 }, txt: fonte.linhas.join(' ') });
    E.push({ t: 'txt', x: 40, y: 500, h: 32, w: 330, txt: ascii ? 'Fabricacao' : 'Fabricação' });
    E.push({ t: 'txt', x: 40, y: 540, h: 64, w: 330, txt: ddmmaaaa(dados.fabricacao) });
    E.push({ t: 'box', x: 400, y: 470, w: 360, h: 190, th: 6 });
    E.push({ t: 'txt', x: 420, y: 490, h: 32, w: 320, txt: 'VALIDADE' });
    E.push({ t: 'txt', x: 420, y: 540, h: 72, w: 330, txt: ddmmaaaa(dados.validade) }); // 72: 10 dígitos largos cabem em 330
    if (peso) E.push({ t: 'txt', x: 40, y: 720, h: 48, w: 720, txt: peso });
    E.push({ t: 'txt', x: 40, y: 790, h: 48, w: 720, txt: `Lote: ${dados.lote || ''}` });
    if (resp) E.push({ t: 'txt', x: 40, y: 860, h: 36, w: 720, txt: `Resp.: ${resp}` });
    E.push({ t: 'txt', x: 40, y: 915, h: 28, w: 720, txt: 'Hardt Salgados - PCP' });
    return E;
}

function renderZplGrande(dados, impressora = {}) {
    const ajustes = impressora.ajustes || {};
    const ascii = impressora.removerAcentos !== false;
    const dpi = Number(impressora.dpi) > 0 ? Number(impressora.dpi) : 203;
    const rot = [0, 90, 180, 270].includes(Number(impressora.rotacao)) ? Number(impressora.rotacao) : 0;
    const k = dpi / 203;
    const px = (n) => Math.round(n * k);
    const W = px(800), H = px(960);
    const ox = px(Number(ajustes.offsetX) || 0), oy = px(Number(ajustes.offsetY) || 0);
    const dens = Number(ajustes.densidade);

    const out = ['^XA', '^CI28'];
    if (rot === 90 || rot === 270) out.push(`^PW${H}`, `^LL${W}`); else out.push(`^PW${W}`, `^LL${H}`);
    out.push('^LH0,0');
    if (Number.isFinite(dens) && dens > 0) out.push(`~SD${Math.min(30, dens)}`);
    if (rot === 180) out.push('^POI');

    for (const e of elementosZplGrande(dados, ascii)) {
        // 90/270: transformação de coordenadas SEM validação em impressora real (ver plano 3.4 item 3)
        let x = px(e.x) + ox, y = px(e.y) + oy;
        if (e.t === 'box') {
            let w = px(e.w), h = px(e.h);
            const th = px(e.th);
            if (rot === 90) { [x, y, w, h] = [H - (y + h), x, h, w]; }
            else if (rot === 270) { [x, y, w, h] = [y, W - (x + w), h, w]; }
            out.push(`^FO${x},${y}^GB${w},${h},${th}^FS`);
        } else {
            const h = px(e.h), w = Math.round(h * ZPL_LARG);
            const campo = zplEscape(limpar(e.txt, ascii));
            let orient = 'N';
            if (rot === 90) { orient = 'R'; [x, y] = [H - y - h, x]; }
            else if (rot === 270) { orient = 'B'; [x, y] = [y, W - x - px(e.w)]; }
            const fb = e.fb ? `^FB${px(e.fb.larg)},${e.fb.linhas},${px(6)},L` : '';
            out.push(`^FO${x},${y}${e.rev ? '^FR' : ''}^A0${orient},${h},${w}${fb}^FD${campo}^FS`);
        }
    }
    out.push(`^PQ${qtd(dados)},0,1,N`, '^XZ');
    return Buffer.from(out.join('\n') + '\n', 'utf8');
}

// ---------- Testes de impressão ----------

function exemploDados() {
    const hoje = hojeStr();
    return {
        nome: 'RECHEIO DE TESTE', fabricacao: hoje, validade: somaDias(hoje, 3), conservacao: 'REFRIGERADO',
        pesoGramas: 2000, lote: `${hoje.slice(2, 4)}${hoje.slice(5, 7)}${hoje.slice(8, 10)}-99`,
        responsavelIniciais: 'TS', responsavelNome: 'Teste Sistema', quantidade: 2,
    };
}

function agoraTexto() {
    const n = new Date();
    const p = (v) => String(v).padStart(2, '0');
    return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
}

function tamanhoDots(imp) {
    if (imp.tamanho === '100x120') return { w: 800, h: 960 };
    const rolo = Number(imp.larguraRoloMm) > 0 ? Number(imp.larguraRoloMm) : 84;
    return { w: rolo * 8, h: 200 };
}

function testeTextoEpl2(imp) {
    const rolo = Number(imp.larguraRoloMm) > 0 ? Number(imp.larguraRoloMm) : 84;
    const gap = Number(imp.gapDots) > 0 ? Number(imp.gapDots) : 24;
    const l = ['', 'N', `q${rolo * 8}`, `Q200,${gap}`, 'D8', 'S2', 'ZT',
        'A20,20,0,3,1,1,N,"TESTE CA-HARDT"',
        'A20,60,0,3,1,1,N,"LINGUAGEM EPL2 OK"',
        `A20,100,0,2,1,1,N,"${epl2Escape(agoraTexto())}"`,
        'A20,140,0,2,1,1,N,"Se leu isto, esta e EPL2"',
        'P1'];
    return Buffer.from(l.join('\n') + '\n', 'ascii');
}

function testeTextoZpl(imp) {
    const { w, h } = tamanhoDots(imp);
    const l = ['^XA', '^CI28', `^PW${w}`, `^LL${h}`, '^LH0,0',
        '^FO30,30^A0N,60,60^FDTESTE CA-HARDT^FS',
        '^FO30,110^A0N,60,60^FDLINGUAGEM ZPL OK^FS',
        `^FO30,190^A0N,40,40^FD${zplEscape(agoraTexto())}^FS`,
        '^FO30,250^A0N,30,30^FDSe leu isto, esta e ZPL^FS',
        '^XZ'];
    return Buffer.from(l.join('\n') + '\n', 'utf8');
}

function renderTeste(tipo, impressora = {}) {
    if (tipo === 'TEXTO_EPL2') return testeTextoEpl2(impressora);
    if (tipo === 'TEXTO_ZPL') return testeTextoZpl(impressora);
    if (tipo === 'ETIQUETA_EXEMPLO') {
        const d = exemploDados();
        if (impressora.linguagem === 'ZPL') {
            if (impressora.tamanho && impressora.tamanho !== '100x120') {
                throw new Error('Etiqueta de exemplo em ZPL só existe para o tamanho 100x120. Use o teste de texto.');
            }
            return renderZplGrande({ ...d, quantidade: 1 }, impressora);
        }
        if (impressora.tamanho === '100x120') {
            throw new Error('Etiqueta de exemplo em EPL2 só existe para o tamanho 40x25. Use o teste de texto.');
        }
        return renderEpl2Pequena(d, impressora);
    }
    throw new Error('Tipo de teste inválido.');
}

module.exports = {
    renderEpl2Pequena, renderZplGrande, renderTeste,
    // exportados p/ teste
    _internos: { quebrar, diaSemana, ddmm, escolherFonteNome, escolherFonteZplNome, pesoTexto },
};
