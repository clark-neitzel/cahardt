import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { useAutoFit } from './useAutoFit';
import {
    codExibir, pesoLiquidoStr, pesoTabela, linhasNutricionais, selosAnvisa,
    parseValor, parseVD, fmtNum,
} from './etiquetaModelos';

// ─── Etiqueta DEITADA (120 × 100 mm) — layout de mercado ──────────────────────
// Aprovada pelo dono em 25/09/2026 (docs/preview-etiqueta-deitada-v2.html).
// MESMO CONTEÚDO da etiqueta ANVISA em pé — nada a mais, nada a menos — só a
// composição muda, pensada para o pacote pequeno de gôndola:
//   • faixa PRETA no topo só com o nome (Oswald, branco, centralizado) e, à
//     direita, o selo branco do PESO LÍQUIDO com "aprox. N unidades · X g";
//   • esquerda: selo ALTO EM (modelo oficial, intocado), MODO DE PREPARO,
//     CONSERVAÇÃO e INGREDIENTES; direita: a tabela nutricional inteira;
//   • rodapé fixo: Fabricação/Lote · Validade · Cód. + EAN-13 deitado.
// Impressora térmica: só preto/branco, hairline mínima 0,25 mm. Fontes Oswald e
// Manrope já são carregadas pelo index.html do app.
// Imprime SEM girar: a Zebra já recebe a página 120×100 paisagem (ver
// imprimirEtiquetas em EtiquetaLabel.jsx).

const fs = (pt) => `calc(var(--fs, 1) * ${pt}pt)`;
const vmm = (mm) => `calc(var(--fs, 1) * ${mm}mm)`;
const OSWALD = 'Oswald, "Arial Narrow", Arial, sans-serif';
const MANROPE = 'Manrope, Arial, Helvetica, sans-serif';
const ARIAL = 'Arial, Helvetica, sans-serif';

// Nome na faixa: regra por tamanho (previsível, igual ao preview aprovado).
//   até 18 letras → 26 pt numa linha · 19–30 → 21 pt (até 2 linhas) · acima → 17,5 pt
function estiloNome(nome, sm) {
    const n = String(nome || '').length;
    const pt = n <= 18 ? 26 : n <= 30 ? 21 : 17.5;
    return { fontSize: `${sm ? pt * 0.82 : pt}pt`, whiteSpace: n <= 18 ? 'nowrap' : 'normal' };
}

// Selo oficial "ALTO EM" (Anexo XVII / IN 75/2020) — mesmas medidas do layout em pé.
function SeloAnvisa({ selos, sm }) {
    if (!selos.length) return null;
    const altura = sm ? '5.5mm' : '7mm';
    return (
        <div style={{
            display: 'flex', alignItems: 'stretch', gap: sm ? '0.8mm' : '1mm',
            border: `${sm ? '0.5mm' : '0.6mm'} solid #000`, borderRadius: '2mm',
            background: '#fff', padding: sm ? '0.7mm' : '0.9mm', fontFamily: ARIAL,
            alignSelf: 'flex-start', marginBottom: vmm(sm ? 1.6 : 2.2), flex: '0 0 auto',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.8mm', flex: '0 0 auto',
                border: '0.45mm solid #000', borderRadius: '2mm', minHeight: altura,
                padding: sm ? '0.4mm 1.4mm 0.4mm 0.9mm' : '0.5mm 1.8mm 0.5mm 1.1mm',
            }}>
                <svg viewBox="0 0 24 24" style={{ width: sm ? '3.2mm' : '4mm', height: sm ? '3.2mm' : '4mm', flex: '0 0 auto' }}>
                    <circle cx="10" cy="9" r="6.2" fill="none" stroke="#000" strokeWidth="2.4" />
                    <line x1="5.6" y1="13.4" x2="1.4" y2="19.4" stroke="#000" strokeWidth="3.6" strokeLinecap="round" />
                </svg>
                <b style={{ fontSize: sm ? '6.5pt' : '8pt', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, whiteSpace: 'nowrap' }}>ALTO EM</b>
            </div>
            {selos.map((s) => (
                <div key={s.chave} style={{
                    flex: '0 0 auto', width: sm ? '13mm' : '16mm',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#000', color: '#fff', fontWeight: 800, textTransform: 'uppercase',
                    textAlign: 'center', borderRadius: '1.5mm', minHeight: altura,
                    padding: '0.3mm 0.5mm', fontSize: sm ? '5.4pt' : '6.5pt', lineHeight: 1.05,
                }}>
                    <span>{s.rotulo.split(' ').map((p, i) => (
                        <span key={p}>{i > 0 && <br />}{p}</span>
                    ))}</span>
                </div>
            ))}
        </div>
    );
}

// larguraMM/alturaMM já vêm DEITADOS (120×100 ou 100×80).
export default function EtiquetaLabelDeitada({ et, dataFab, dataVal, larguraMM = 120, alturaMM = 100 }) {
    const svgRef = useRef(null);
    const sm = larguraMM <= 100; // rolo pequeno (100×80 deitado)
    const { boxRef, innerRef, fator } = useAutoFit([et, larguraMM, alturaMM]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !et.codigoBarras) return;
        const opts = {
            width: sm ? 1 : 1.2, height: sm ? 28 : 34,
            displayValue: true, fontSize: sm ? 9 : 11, textMargin: 0,
            margin: sm ? 5 : 6, marginTop: 1, marginBottom: 1,
        };
        let ok = false;
        try { JsBarcode(svg, et.codigoBarras, { format: 'EAN13', ...opts }); ok = true; }
        catch {
            try { JsBarcode(svg, et.codigoBarras, { format: 'CODE128', ...opts }); ok = true; }
            catch { /* sem código de barras */ }
        }
        if (!ok) return;
        // Tamanho físico travado (mm), viewBox regravado — mesma proteção do layout em pé
        const w = parseFloat(svg.getAttribute('width'));
        const h = parseFloat(svg.getAttribute('height'));
        if (w > 0 && h > 0) {
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const PX2MM = 25.4 / 96;
            svg.style.width = `${(w * PX2MM).toFixed(2)}mm`;
            svg.style.height = `${(h * PX2MM).toFixed(2)}mm`;
        }
    }, [et.codigoBarras, sm]);

    const selos = selosAnvisa(et);
    const peso = pesoTabela(et);
    const linhas = linhasNutricionais(et);
    const alergenos = (Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
        if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
        if (a === 'Peixes' && et.especiePeixes)         return `${a} (${et.especiePeixes})`;
        return a;
    });
    const pesoLiq = pesoLiquidoStr(et);
    const cod = codExibir(et);

    // Linha de unidades dentro do selo do peso (mesmo texto da etiqueta em pé, sem "Contém")
    const unidades = `${et.quantidadeAproximada ? 'aprox. ' : ''}${et.quantidadeEmbalagem} unidades${Number(et.pesoUnitario) > 0 ? ` · ${et.pesoUnitario} g` : ''}`;

    const cell = { padding: `${vmm(sm ? 0.28 : 0.42)} 0.7mm`, textAlign: 'center', borderLeft: '0.25mm solid #000', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
    const cellNome = { padding: `${vmm(sm ? 0.28 : 0.42)} 0.7mm 0 1.3mm`, textAlign: 'left' };
    const tituloBloco = { fontSize: fs(sm ? 5 : 5.6), fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 };
    const textoBloco = { fontSize: fs(sm ? 6 : 6.8), fontWeight: 600, lineHeight: 1.3, marginTop: vmm(0.6) };

    return (
        <div style={{
            position: 'relative', width: `${larguraMM}mm`, height: `${alturaMM}mm`,
            background: '#fff', color: '#000', boxSizing: 'border-box',
            padding: sm ? '2.5mm 3mm' : '3mm 3.5mm',
            fontFamily: MANROPE, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            {/* FAIXA PRETA: nome centralizado + selo branco do peso (tamanho fixo, fora do auto-fit) */}
            <div style={{
                flex: '0 0 auto', background: '#000', color: '#fff', borderRadius: '2mm',
                minHeight: sm ? '12.5mm' : '15mm', padding: sm ? '1.2mm 1.4mm' : '1.5mm 1.6mm',
                display: 'flex', alignItems: 'center', gap: sm ? '2mm' : '3mm',
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontFamily: OSWALD, fontWeight: 700, lineHeight: 1.12, textTransform: 'uppercase',
                        letterSpacing: '0.005em', color: '#fff', textAlign: 'center', padding: '0 2mm',
                        overflow: 'hidden', ...estiloNome(et.nomeProduto, sm),
                    }}>
                        {et.nomeProduto}
                    </div>
                </div>
                {pesoLiq && (
                    <div style={{
                        flex: '0 0 auto', background: '#fff', color: '#000', borderRadius: '1.6mm',
                        padding: sm ? '0.9mm 2mm 1mm' : '1.1mm 2.6mm 1.2mm', textAlign: 'center', minWidth: sm ? '22mm' : '26mm',
                    }}>
                        <div style={{ fontSize: sm ? '4.6pt' : '5.2pt', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 }}>Peso líquido</div>
                        <div style={{ fontFamily: OSWALD, fontSize: sm ? '14pt' : '17pt', fontWeight: 600, lineHeight: 1, marginTop: '0.8mm', letterSpacing: '-0.005em' }}>{pesoLiq}</div>
                        <div style={{ fontSize: sm ? '4.8pt' : '5.4pt', fontWeight: 700, marginTop: '0.9mm', whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>{unidades}</div>
                    </div>
                )}
            </div>

            {/* CORPO ajustável (--fs): duas colunas — textos à esquerda, tabela à direita */}
            <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div ref={innerRef} style={{ '--fs': fator, display: 'flex', gap: sm ? '2.5mm' : '3.5mm', paddingTop: vmm(sm ? 1.8 : 2.4) }}>
                    <div style={{ width: sm ? '47mm' : '58mm', flex: 'none', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <SeloAnvisa selos={selos} sm={sm} />
                        {et.modoPreparo && (
                            <div style={{ marginBottom: vmm(1.8) }}>
                                <div style={tituloBloco}>Modo de preparo</div>
                                <div style={textoBloco}>{et.modoPreparo}</div>
                            </div>
                        )}
                        {et.armazenamento && (
                            <div style={{ marginBottom: vmm(1.8) }}>
                                <div style={tituloBloco}>Conservação</div>
                                <div style={textoBloco}>Conservar em FREEZER (−12 °C ou mais frio). Descongelado, não recongelar.</div>
                            </div>
                        )}
                        <div style={{ marginTop: vmm(0.8), paddingTop: vmm(1.6), borderTop: '0.3mm solid #000', fontSize: fs(sm ? 5.6 : 6.3), lineHeight: 1.32, fontWeight: 500 }}>
                            <b style={{ fontWeight: 800 }}>INGREDIENTES:</b> {String(et.composicao || '').toLowerCase()}
                            <b style={{ fontWeight: 800, textTransform: 'uppercase' }}>
                                {' '}{et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                                {et.contemLactose && <> · CONTÉM LACTOSE</>}
                                {alergenos.length > 0 && (
                                    <> · ALÉRGICOS: CONTÉM {alergenos.join(', ').toUpperCase()}.</>
                                )}
                                {et.avisosRotulo && <> {String(et.avisosRotulo).toUpperCase()}</>}
                            </b>
                        </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ border: '0.4mm solid #000', fontFamily: ARIAL }}>
                            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: fs(sm ? 6.4 : 7.2), padding: `${vmm(0.7)} 0`, borderBottom: '0.4mm solid #000' }}>
                                INFORMAÇÃO NUTRICIONAL
                            </div>
                            <div style={{ fontSize: fs(sm ? 5.6 : 6.3), padding: `${vmm(0.6)} 1.3mm`, lineHeight: 1.3, fontWeight: 600 }}>
                                Porções por embalagem: {et.quantidadeEmbalagem} porções<br />
                                Porção {peso} g (1 unidade)
                            </div>
                            <div style={{ height: '1.2pt', background: '#000', margin: '0 1.3mm' }} />
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(sm ? 5.6 : 6.3) }}>
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
                                                <td style={{ ...cellNome, paddingLeft: `${1.3 + r.indent * 1.5}mm` }}>{r.label}</td>
                                                <td style={cell}>{fmtNum(cem, r.dec)}</td>
                                                <td style={cell}>{fmtNum(porcao, r.dec)}</td>
                                                <td style={cell}>{parseVD(r.raw)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div style={{ fontSize: fs(sm ? 4.5 : 4.9), padding: `${vmm(0.5)} 1.3mm`, borderTop: '0.4mm solid #000', lineHeight: 1.2 }}>
                                *Percentual de valores diários fornecidos pela porção.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* RODAPÉ fixo (fora do auto-fit): datas + código à esquerda, EAN-13 à direita */}
            <div style={{
                flex: '0 0 auto', marginTop: sm ? '1.5mm' : '2mm', paddingTop: sm ? '1.5mm' : '2mm',
                borderTop: '0.5mm solid #000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3mm',
            }}>
                <div style={{ display: 'flex', gap: sm ? '3.5mm' : '5mm' }}>
                    {[['Fabricação/Lote', dataFab], ['Validade', dataVal], ['Cód.', cod]].map(([rotulo, valor]) => (
                        <div key={rotulo}>
                            <div style={{ fontSize: sm ? '4.8pt' : '5.4pt', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 }}>{rotulo}</div>
                            <div style={{ fontFamily: OSWALD, fontSize: sm ? '10.5pt' : '12.5pt', fontWeight: 600, lineHeight: 1, marginTop: '1mm' }}>{valor}</div>
                        </div>
                    ))}
                </div>
                {et.codigoBarras && (
                    <svg ref={svgRef} style={{ display: 'block', flex: '0 0 auto' }} />
                )}
            </div>
        </div>
    );
}
