import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import EtiquetaLabel from './EtiquetaLabel';
import {
    TAMANHOS, TAMANHO_PADRAO, LAYOUT_PADRAO, layoutValido,
    codExibir, pesoLiquidoStr, pesoTabela, linhasNutricionais, selosAnvisa,
    parseValor, parseVD, fmtNum,
} from './etiquetaModelos';

// ─── Selo oficial "ALTO EM" (canto superior direito) ──────────────────────────
// Pílula com lupa + um retângulo preto por nutriente acima do limite (0 a 3).
// `sm` = rolo pequeno (80×100): tudo mais compacto, como no mockup aprovado (.seal.sm).
function SeloAnvisa({ selos, sm }) {
    if (!selos.length) return null;
    return (
        <div style={{
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
// Reproduz o mockup aprovado: nome centralizado no topo (com folga p/ o selo),
// tabela nutricional completa, e uma zona inferior com texto à esquerda +
// código de barras vertical à direita + validade na sobra do rodapé.
// Renderiza no TAMANHO escolhido: 100×120 (padrão) ou 80×100 compacto (sm).
export function EtiquetaLabelNova({ et, dataFab, dataVal, larguraMM = 100, alturaMM = 120 }) {
    const svgRef = useRef(null);
    // sm = rolo pequeno 80×100 → aperto de fontes/paddings (classe .label.sm do mockup)
    const sm = larguraMM <= 80;
    useEffect(() => {
        if (!svgRef.current || !et.codigoBarras) return;
        try {
            JsBarcode(svgRef.current, et.codigoBarras, {
                format: 'EAN13', width: 2, height: 34, displayValue: false, margin: 0,
            });
        } catch {
            try {
                JsBarcode(svgRef.current, et.codigoBarras, {
                    format: 'CODE128', width: 2, height: 34, displayValue: false, margin: 0,
                });
            } catch { /* sem código de barras */ }
        }
    }, [et.codigoBarras]);

    const selos = selosAnvisa(et);
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

    const cell = { padding: sm ? '0.2mm 0.9mm' : '0.4mm 1mm', textAlign: 'center', borderLeft: '0.25mm solid #000', fontVariantNumeric: 'tabular-nums' };
    const cellNome = { padding: sm ? '0.2mm 0.9mm' : '0.4mm 1.5mm' };
    const indentBase = sm ? 1.2 : 1.5;

    return (
        <div style={{
            position: 'relative', width: `${larguraMM}mm`, height: `${alturaMM}mm`,
            background: '#fff', color: '#000', border: '0.4mm solid #000',
            padding: sm ? '2.5mm' : '3.5mm', boxSizing: 'border-box',
            fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.15,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <SeloAnvisa selos={selos} sm={sm} />

            {/* Cabeçalho centralizado (abre espaço à direita quando há selo) */}
            <div style={{ textAlign: 'center', padding: '0 1mm', paddingRight: selos.length ? (sm ? '21mm' : '26mm') : '1mm' }}>
                <div style={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 0.98, fontSize: sm ? '12pt' : '15pt', textTransform: 'uppercase' }}>
                    {et.nomeProduto}
                </div>
                <div style={{ fontWeight: 700, fontSize: sm ? '6pt' : '7pt', marginTop: sm ? '1mm' : '1.5mm' }}>
                    Contém aprox. {et.quantidadeEmbalagem} unidades{et.pesoUnitario != null ? ` · ${et.pesoUnitario} g cada` : ''}
                </div>
                <div style={{ fontWeight: 700, fontSize: sm ? '6.5pt' : '7.5pt', marginTop: '0.8mm' }}>
                    CÓD. {cod}{pesoLiq ? ` · PESO LÍQUIDO ${pesoLiq}` : ''}
                </div>
            </div>

            {/* Tabela nutricional */}
            <div style={{ border: '0.35mm solid #000', marginTop: sm ? '1.6mm' : '2.5mm' }}>
                <div style={{ textAlign: 'center', fontWeight: 800, fontSize: sm ? '7pt' : '8pt', padding: sm ? '0.4mm 0' : '0.7mm 0', borderBottom: '0.35mm solid #000' }}>
                    INFORMAÇÃO NUTRICIONAL
                </div>
                <div style={{ fontSize: sm ? '5.6pt' : '6.2pt', padding: sm ? '0.4mm 1.2mm' : '0.7mm 1.5mm', lineHeight: 1.25, fontWeight: 600 }}>
                    Porções por embalagem: {et.quantidadeEmbalagem} porções<br />
                    Porção {peso} g (1 unidade)
                </div>
                <div style={{ height: '1.1pt', background: '#000', margin: '0 1.5mm' }} />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: sm ? '5.6pt' : '6.2pt' }}>
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
                <div style={{ fontSize: sm ? '4.6pt' : '5pt', padding: sm ? '0.3mm 1.2mm' : '0.5mm 1.5mm', borderTop: '0.35mm solid #000' }}>
                    *Percentual de valores diários fornecidos pela porção.
                </div>
            </div>

            {/* Zona inferior: texto à esquerda + barras à direita, validade na sobra */}
            <div style={{ display: 'flex', gap: sm ? '2mm' : '3mm', flex: 1, marginTop: sm ? '1.6mm' : '2.5mm', minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: sm ? '6pt' : '6.4pt', lineHeight: sm ? 1.22 : 1.3 }}>
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
                        <div style={{ fontSize: sm ? '6pt' : '6.4pt', lineHeight: sm ? 1.22 : 1.3, marginTop: sm ? '1mm' : '1.6mm' }}>
                            <b style={{ fontWeight: 800 }}>MODO DE PREPARO:</b> {et.modoPreparo}
                        </div>
                    )}
                    {et.armazenamento && (
                        <div style={{ fontStyle: 'italic', fontSize: sm ? '5.4pt' : '5.8pt', lineHeight: 1.22, marginTop: sm ? '1mm' : '1.6mm' }}>
                            ❄ Conservar em FREEZER (-12 °C ou mais frio). Descongelado, não recongelar.
                        </div>
                    )}
                    <div style={{ flex: 1, minHeight: '2mm' }} />
                    <div style={{ display: 'flex', gap: sm ? '4mm' : '6mm', borderTop: '0.35mm solid #000', paddingTop: sm ? '1mm' : '1.5mm' }}>
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

                {/* Código de barras VERTICAL */}
                {et.codigoBarras && (
                    <div style={{ flex: sm ? '0 0 11mm' : '0 0 13mm', display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: '0.8mm' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            <svg ref={svgRef} style={{ transform: 'rotate(90deg)', width: 'auto', height: sm ? '8mm' : '9.5mm' }} />
                        </div>
                        <span style={{
                            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                            fontSize: sm ? '5.2pt' : '6pt', letterSpacing: '0.12em', alignSelf: 'center', fontWeight: 600,
                        }}>{et.codigoBarras}</span>
                    </div>
                )}
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
