import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import EtiquetaLabel from './EtiquetaLabel';
import { useAutoFit } from './useAutoFit';
import {
    TAMANHOS, TAMANHO_PADRAO, LAYOUT_PADRAO, layoutValido,
    codExibir, pesoLiquidoStr, pesoTabela, linhasNutricionais, selosAnvisa,
    parseValor, parseVD, fmtNum,
} from './etiquetaModelos';

// Fontes e espaçamentos verticais do conteúdo ajustável usam a variável --fs
// (definida pelo useAutoFit): encolher a fonte reduz a altura por LAYOUT REAL,
// que vale igual na tela e em QUALQUER caminho de impressão (Chrome, iPad/
// AirPrint, driver da Zebra). Nada de zoom/transform — ambos já cortaram o
// rodapé na impressão física (bugs reais de 08/2026).
const fs = (pt) => `calc(var(--fs, 1) * ${pt}pt)`;
const vmm = (mm) => `calc(var(--fs, 1) * ${mm}mm)`;

// ─── Selo oficial "ALTO EM" (canto superior direito) ──────────────────────────
// Pílula com lupa + um retângulo preto por nutriente acima do limite (0 a 3).
// `sm` = rolo pequeno (80×100): tudo mais compacto, como no mockup aprovado (.seal.sm).
// Fica FORA do bloco ajustável (posição absoluta, tamanho fixo em mm).
function SeloAnvisa({ selos, sm, seloRef }) {
    if (!selos.length) return null;
    return (
        <div ref={seloRef} style={{
            position: 'absolute', top: sm ? '2.5mm' : '3.5mm', right: sm ? '2.5mm' : '3.5mm',
            border: `${sm ? '0.5mm' : '0.7mm'} solid #000`, borderRadius: '1.8mm',
            background: '#fff', padding: sm ? '0.6mm' : '0.8mm', width: sm ? '20mm' : '25mm',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.7mm',
                border: '0.45mm solid #000', borderRadius: '2mm',
                padding: '0.5mm 1mm 0.5mm 0.7mm', marginBottom: '0.8mm',
            }}>
                <svg viewBox="0 0 24 24" style={{ width: sm ? '3mm' : '3.8mm', height: sm ? '3mm' : '3.8mm', flex: '0 0 auto' }}>
                    <circle cx="10" cy="9" r="6.2" fill="none" stroke="#000" strokeWidth="2.4" />
                    <line x1="5.6" y1="13.4" x2="1.4" y2="19.4" stroke="#000" strokeWidth="3.6" strokeLinecap="round" />
                </svg>
                <b style={{ fontSize: sm ? '6pt' : '7pt', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>ALTO EM</b>
            </div>
            {selos.map((s, i) => (
                <div key={s.chave} style={{
                    background: '#000', color: '#fff', fontWeight: 800, textTransform: 'uppercase',
                    textAlign: 'center', borderRadius: '1.5mm', padding: sm ? '0.6mm 0.3mm' : '0.9mm 0.4mm',
                    fontSize: sm ? '5.6pt' : '6.5pt', lineHeight: 1.02, marginTop: i === 0 ? 0 : '0.8mm',
                }}>{s.rotulo}</div>
            ))}
        </div>
    );
}

// ─── Etiqueta ANVISA (layout com selos "ALTO EM") ─────────────────────────────
// Nome centralizado no topo (com folga p/ o selo), tabela nutricional completa,
// zona inferior com os textos (ingredientes → preparo → conservação) à ESQUERDA
// e o código de barras EAN-13 VERTICAL (girado 90°, número acompanhando na
// lateral, lendo de baixo p/ cima — como um EAN de embalagem em pé) numa coluna
// fixa à DIREITA, sem nunca encostar na tabela. As datas (Fabricação/Lote +
// Validade) ficam num RODAPÉ FIXO, fora do bloco ajustável — nunca cortam.
// Renderiza no TAMANHO escolhido: 100×120 (padrão) ou 80×100 compacto (sm).
export function EtiquetaLabelNova({ et, dataFab, dataVal, larguraMM = 100, alturaMM = 120 }) {
    const svgRef = useRef(null);
    const colBarcodeRef = useRef(null);
    const seloRef = useRef(null);
    const headerRef = useRef(null);
    // sm = rolo pequeno 80×100 → aperto de fontes/paddings (classe .label.sm do mockup)
    const sm = larguraMM <= 80;
    // Auto-fit por LAYOUT REAL (--fs): encolhe fontes/espaçamentos até o conteúdo
    // caber na altura útil. O rodapé com as datas fica FORA do bloco medido.
    const { boxRef, innerRef, fator } = useAutoFit([et, larguraMM, alturaMM]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !et.codigoBarras) return;
        // EAN-13 nas proporções corretas, depois girado 90° pelo wrapper (CSS).
        // width = módulo em px CSS (96dpi): sm 1px ≈ 0,26mm (magnificação 80%,
        // mínimo do padrão EAN) · grande 1.2px ≈ 0,32mm — nítido na Zebra 203dpi.
        // margin = zona quieta nas PONTAS do código (obrigatória p/ leitura);
        // marginTop/Bottom pequenos p/ o conjunto (barras + número) caber na
        // largura da coluna depois de girado.
        const opts = {
            width: sm ? 1 : 1.2, height: sm ? 30 : 36,
            displayValue: true, fontSize: sm ? 9 : 11, textMargin: 0,
            margin: sm ? 5 : 6, marginTop: 2, marginBottom: 2,
        };
        let ok = false;
        try { JsBarcode(svg, et.codigoBarras, { format: 'EAN13', ...opts }); ok = true; }
        catch {
            try { JsBarcode(svg, et.codigoBarras, { format: 'CODE128', ...opts }); ok = true; }
            catch { /* sem código de barras */ }
        }
        if (!ok) return;
        // Trava o aspecto: fixa o viewBox e dá as dimensões REAIS em mm (px CSS →
        // mm a 96dpi). Nunca esticar por width/height desencontrados — foi o que
        // distorceu o EAN vertical anterior. preserveAspectRatio fica no default
        // (travado). O --fs não afeta o barcode: tamanho físico constante.
        const w = parseFloat(svg.getAttribute('width'));
        const h = parseFloat(svg.getAttribute('height'));
        if (w > 0 && h > 0) {
            // SEMPRE regravar o viewBox: o JsBarcode limpa o conteúdo do SVG mas
            // não remove o atributo — ao alternar o tamanho do rolo na mesma tela,
            // um viewBox velho escalaria/recortaria o código (EAN ilegível).
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const PX2MM = 25.4 / 96;
            svg.style.width = `${(w * PX2MM).toFixed(2)}mm`;
            svg.style.height = `${(h * PX2MM).toFixed(2)}mm`;
            // A coluna precisa de altura ≥ comprimento do código girado, senão o
            // barcode (absoluto, centralizado) invadiria a tabela acima.
            if (colBarcodeRef.current) {
                colBarcodeRef.current.style.minHeight = `${(w * PX2MM + 2).toFixed(2)}mm`;
            }
        }
    }, [et.codigoBarras, sm]);

    const selos = selosAnvisa(et);

    // O selo "ALTO EM" é absoluto (canto sup. direito) e, com 2–3 nutrientes,
    // fica mais alto que o cabeçalho — sem reserva ele SOBREPUNHA a coluna %VD
    // da tabela (visto no PDF de validação). Reserva no cabeçalho a altura REAL
    // do selo (medida no DOM, + folga) para a tabela começar sempre abaixo dele.
    useEffect(() => {
        if (!headerRef.current) return;
        const h = seloRef.current ? seloRef.current.offsetHeight : 0;
        headerRef.current.style.minHeight = h ? `${h + 2}px` : '';
    }, [selos.length, sm, et]);

    const peso = pesoTabela(et);
    const linhas = linhasNutricionais(et);

    // Alérgenos com espécie entre parênteses (RDC 26/2015) p/ crustáceos e peixes
    const alergenos = (Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
        if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
        if (a === 'Peixes' && et.especiePeixes)         return `${a} (${et.especiePeixes})`;
        return a;
    });

    const pesoLiq = pesoLiquidoStr(et);
    const cod = codExibir(et);

    const cell = { padding: `${vmm(sm ? 0.2 : 0.4)} ${sm ? '0.9mm' : '1mm'}`, textAlign: 'center', borderLeft: '0.25mm solid #000', fontVariantNumeric: 'tabular-nums' };
    const cellNome = { padding: `${vmm(sm ? 0.2 : 0.4)} ${sm ? '0.9mm' : '1.5mm'}` };
    const indentBase = sm ? 1.2 : 1.5;
    // Largura da coluna do código de barras vertical (girado): altura do SVG
    // (barras + número) ≈ 10–12mm; coluna fixa com folga.
    const colBarcode = sm ? '11.5mm' : '14mm';

    return (
        <div style={{
            position: 'relative', width: `${larguraMM}mm`, height: `${alturaMM}mm`,
            background: '#fff', color: '#000', border: '0.4mm solid #000',
            padding: sm ? '2.5mm' : '3.5mm', boxSizing: 'border-box',
            fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.15,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <SeloAnvisa selos={selos} sm={sm} seloRef={seloRef} />

          {/* Bloco AJUSTÁVEL: tudo que pode encolher via --fs. O rodapé de datas
              fica fora, então jamais é cortado. */}
          <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div ref={innerRef} style={{
                minHeight: '100%', display: 'flex', flexDirection: 'column',
                '--fs': fator,
            }}>
            {/* Cabeçalho centralizado (abre espaço à direita quando há selo) */}
            <div ref={headerRef} style={{ textAlign: 'center', padding: '0 1mm', paddingRight: selos.length ? (sm ? '21mm' : '26mm') : '1mm' }}>
                <div style={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 0.98, fontSize: fs(sm ? 12 : 15), textTransform: 'uppercase' }}>
                    {et.nomeProduto}
                </div>
                <div style={{ fontWeight: 700, fontSize: fs(sm ? 6 : 7), marginTop: vmm(sm ? 1 : 1.5) }}>
                    Contém aprox. {et.quantidadeEmbalagem} unidades{et.pesoUnitario != null ? ` · ${et.pesoUnitario} g cada` : ''}
                </div>
                <div style={{ fontWeight: 700, fontSize: fs(sm ? 6.5 : 7.5), marginTop: vmm(0.8) }}>
                    CÓD. {cod}{pesoLiq ? ` · PESO LÍQUIDO ${pesoLiq}` : ''}
                </div>
            </div>

            {/* Tabela nutricional */}
            <div style={{ border: '0.35mm solid #000', marginTop: vmm(sm ? 1.6 : 2.5) }}>
                <div style={{ textAlign: 'center', fontWeight: 800, fontSize: fs(sm ? 7 : 8), padding: `${vmm(sm ? 0.4 : 0.7)} 0`, borderBottom: '0.35mm solid #000' }}>
                    INFORMAÇÃO NUTRICIONAL
                </div>
                <div style={{ fontSize: fs(sm ? 5.6 : 6.2), padding: `${vmm(sm ? 0.4 : 0.7)} ${sm ? '1.2mm' : '1.5mm'}`, lineHeight: 1.25, fontWeight: 600 }}>
                    Porções por embalagem: {et.quantidadeEmbalagem} porções<br />
                    Porção {peso} g (1 unidade)
                </div>
                <div style={{ height: '1.1pt', background: '#000', margin: '0 1.5mm' }} />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(sm ? 5.6 : 6.2) }}>
                    <thead>
                        <tr style={{ borderBottom: '0.25mm solid #000', fontWeight: 800 }}>
                            <td style={cellNome}></td>
                            <td style={cell}>100 g</td>
                            <td style={cell}>{peso} g</td>
                            <td style={cell}>%VD*</td>
                        </tr>
                    </thead>
                    <tbody>
                        {linhas.map((r) => {
                            const porcao = parseValor(r.raw);
                            const cem = (porcao !== null && peso) ? (porcao / peso) * 100 : null;
                            return (
                                <tr key={r.label} style={{ borderBottom: '0.25mm solid #000' }}>
                                    <td style={{ ...cellNome, paddingLeft: `${indentBase + r.indent * 1.5}mm` }}>{r.label}</td>
                                    <td style={cell}>{fmtNum(cem, r.dec)}</td>
                                    <td style={cell}>{fmtNum(porcao, r.dec)}</td>
                                    <td style={cell}>{parseVD(r.raw)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div style={{ fontSize: fs(sm ? 4.6 : 5), padding: `${vmm(sm ? 0.3 : 0.5)} ${sm ? '1.2mm' : '1.5mm'}`, borderTop: '0.35mm solid #000' }}>
                    *Percentual de valores diários fornecidos pela porção.
                </div>
            </div>

            {/* Zona inferior: textos à ESQUERDA + código de barras EAN-13 VERTICAL
                (girado 90°, número na lateral, lendo de baixo p/ cima) numa coluna
                fixa à DIREITA. A zona começa abaixo da tabela — o barcode vive
                dentro dela e nunca encosta na tabela. */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: sm ? '1.5mm' : '2mm', marginTop: vmm(sm ? 1.6 : 2.5) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: fs(sm ? 6 : 6.4), lineHeight: sm ? 1.22 : 1.3 }}>
                        <b style={{ fontWeight: 800 }}>INGREDIENTES:</b> {String(et.composicao || '').toLowerCase()}
                        <span style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                            {' '}{et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                            {et.contemLactose && <> · CONTÉM LACTOSE</>}
                            {alergenos.length > 0 && (
                                <> · ALÉRGICOS: CONTÉM {alergenos.join(', ').toUpperCase()}.</>
                            )}
                            {et.avisosRotulo && <> {String(et.avisosRotulo).toUpperCase()}</>}
                        </span>
                    </div>
                    {et.modoPreparo && (
                        <div style={{ fontSize: fs(sm ? 6 : 6.4), lineHeight: sm ? 1.22 : 1.3, marginTop: vmm(sm ? 1 : 1.6) }}>
                            <b style={{ fontWeight: 800 }}>MODO DE PREPARO:</b> {et.modoPreparo}
                        </div>
                    )}
                    {et.armazenamento && (
                        <div style={{ fontStyle: 'italic', fontSize: fs(sm ? 5.4 : 5.8), lineHeight: 1.22, marginTop: vmm(sm ? 1 : 1.6) }}>
                            ❄ Conservar em FREEZER (-12 °C ou mais frio). Descongelado, não recongelar.
                        </div>
                    )}
                </div>
                {et.codigoBarras && (
                    <div ref={colBarcodeRef} style={{ flex: '0 0 auto', width: colBarcode, position: 'relative' }}>
                        {/* rotate(-90°): o início do código fica embaixo e o número
                            acompanha na lateral, lendo de baixo para cima — EAN de
                            embalagem "em pé". Aspecto do SVG travado (sem esticar). */}
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%) rotate(-90deg)',
                        }}>
                            <svg ref={svgRef} style={{ display: 'block' }} />
                        </div>
                    </div>
                )}
            </div>
            </div>
          </div>

            {/* Rodapé FIXO (fora do bloco ajustável): Fabricação/Lote + Validade
                sempre visíveis e em tamanho pleno — nunca cortam. */}
            <div style={{ display: 'flex', gap: sm ? '4mm' : '6mm', borderTop: '0.35mm solid #000', paddingTop: sm ? '1mm' : '1.5mm', marginTop: sm ? '1mm' : '1.5mm', flex: '0 0 auto' }}>
                <div>
                    <div style={{ fontSize: '6pt', fontWeight: 600 }}>Fabricação / Lote</div>
                    <div style={{ fontSize: sm ? '8pt' : '9.5pt', fontWeight: 800, letterSpacing: '-0.01em' }}>{dataFab}</div>
                </div>
                <div>
                    <div style={{ fontSize: '6pt', fontWeight: 600 }}>Validade</div>
                    <div style={{ fontSize: sm ? '8pt' : '9.5pt', fontWeight: 800, letterSpacing: '-0.01em' }}>{dataVal}</div>
                </div>
            </div>
        </div>
    );
}

// ─── Despachante: escolhe o componente pelo LAYOUT e o tamanho pelo TAMANHO ─────
// (import estático). `layout` = 'classico' | 'anvisa'; `tamanho` = 'p80' | 'g120'.
// Compat: aceita o `modelo` antigo ('classico' | 'anvisa120') e o traduz.
export function EtiquetaRender({ layout, tamanho, modelo, et, dataFab, dataVal }) {
    let lay = layout, tam = tamanho;
    if (modelo != null && lay == null && tam == null) {
        lay = modelo === 'anvisa120' ? 'anvisa' : 'classico';
        tam = modelo === 'anvisa120' ? 'g120' : 'p80';
    }
    lay = layoutValido(lay ?? LAYOUT_PADRAO);
    const dim = TAMANHOS[tam] || TAMANHOS[TAMANHO_PADRAO];

    if (lay === 'anvisa') {
        return <EtiquetaLabelNova et={et} dataFab={dataFab} dataVal={dataVal} larguraMM={dim.larguraMM} alturaMM={dim.alturaMM} />;
    }
    return <EtiquetaLabel et={et} dataFab={dataFab} dataVal={dataVal} larguraMM={dim.larguraMM} alturaMM={dim.alturaMM} />;
}

export default EtiquetaLabelNova;
