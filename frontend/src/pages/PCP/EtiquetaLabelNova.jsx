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

// ─── Selo oficial "ALTO EM" — composição HORIZONTAL (Anexo XVII / IN 75/2020) ──
// FAIXA no topo da etiqueta: moldura arredondada com a pílula da lupa + "ALTO EM"
// à esquerda e os retângulos pretos dos nutrientes LADO A LADO (1 a 3), texto
// branco podendo quebrar em 2 linhas ("AÇÚCAR / ADICIONADO"), como no arquivo
// oficial da ANVISA. Altura CONSTANTE com 1, 2 ou 3 teores — o cabeçalho não
// cresce, e o nome do produto fica centralizado na largura toda logo abaixo.
// Tamanho fixo em mm/pt (não escala com o --fs do auto-fit); fica DENTRO do
// bloco medido, então a altura dela é descontada da área útil automaticamente.
function SeloAnvisa({ selos, sm }) {
    if (!selos.length) return null;
    const altura = sm ? '5.5mm' : '7mm'; // 2 linhas de texto — constante p/ 1–3 selos
    return (
        <div style={{
            display: 'flex', alignItems: 'stretch', gap: sm ? '0.8mm' : '1mm',
            border: `${sm ? '0.5mm' : '0.6mm'} solid #000`, borderRadius: '2mm',
            background: '#fff', padding: sm ? '0.7mm' : '0.9mm',
            marginBottom: sm ? '1.5mm' : '2mm', flex: '0 0 auto',
            alignSelf: 'center', maxWidth: '100%', // SEMPRE centralizada na largura (1–3 teores)
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
                    // TODOS os retângulos com a MESMA largura (modelo oficial da
                    // ANVISA) — fixa em mm, dimensionada pelo maior rótulo
                    // ("GORDURA SATURADA" em 2 linhas). Com 1, 2 ou 3 teores a
                    // proporção não muda: "SÓDIO" não sai estreito nem o box
                    // único estica para a largura toda.
                    flex: '0 0 auto', width: sm ? '13mm' : '16mm',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#000', color: '#fff', fontWeight: 800, textTransform: 'uppercase',
                    textAlign: 'center', borderRadius: '1.5mm', minHeight: altura,
                    padding: '0.3mm 0.5mm', fontSize: sm ? '5.4pt' : '6.5pt', lineHeight: 1.05,
                }}>
                    {/* nutriente de 2 palavras quebra em 2 linhas ("AÇÚCAR / ADICIONADO"),
                        como no modelo oficial do Anexo XVII */}
                    <span>{s.rotulo.split(' ').map((p, i) => (
                        <span key={p}>{i > 0 && <br />}{p}</span>
                    ))}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Etiqueta ANVISA (layout com selos "ALTO EM") ─────────────────────────────
// Nome centralizado no topo (com folga p/ o selo), tabela nutricional completa,
// zona inferior com os textos (ingredientes → preparo → conservação) usando a
// largura TODA. RODAPÉ FIXO (fora do bloco ajustável — nunca corta) numa linha
// só: Fabricação/Lote + Validade EMPILHADAS à esquerda e o código de barras
// EAN-13 DEITADO (horizontal, número embaixo, aspecto travado) à direita —
// pedido do dono em 08/2026: datas empilhadas encurtam a linha e sobra mais
// espaço vertical p/ os textos.
// Renderiza no TAMANHO escolhido: 100×120 (padrão) ou 80×100 compacto (sm).
export function EtiquetaLabelNova({ et, dataFab, dataVal, larguraMM = 100, alturaMM = 120 }) {
    const svgRef = useRef(null);
    // sm = rolo pequeno 80×100 → aperto de fontes/paddings (classe .label.sm do mockup)
    const sm = larguraMM <= 80;
    // Auto-fit por LAYOUT REAL (--fs): encolhe fontes/espaçamentos até o conteúdo
    // caber na altura útil. O rodapé com as datas fica FORA do bloco medido.
    const { boxRef, innerRef, fator } = useAutoFit([et, larguraMM, alturaMM]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !et.codigoBarras) return;
        // EAN-13 DEITADO (horizontal, número embaixo) nas proporções corretas.
        // width = módulo em px CSS (96dpi): sm 1px ≈ 0,26mm (magnificação 80%,
        // mínimo do padrão EAN) · grande 1.2px ≈ 0,32mm — nítido na Zebra 203dpi.
        // margin = zona quieta nas PONTAS do código (obrigatória p/ leitura);
        // marginTop/Bottom pequenos p/ o conjunto (barras + número) ficar baixo
        // e caber na altura do rodapé.
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
        // distorceu um EAN antigo. preserveAspectRatio fica no default (travado).
        // O --fs não afeta o barcode: tamanho físico constante (leitura garantida).
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
        }
    }, [et.codigoBarras, sm]);

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

    const cell = { padding: `${vmm(sm ? 0.2 : 0.4)} ${sm ? '0.9mm' : '1mm'}`, textAlign: 'center', borderLeft: '0.25mm solid #000', fontVariantNumeric: 'tabular-nums' };
    const cellNome = { padding: `${vmm(sm ? 0.2 : 0.4)} ${sm ? '0.9mm' : '1.5mm'}` };
    const indentBase = sm ? 1.2 : 1.5;

    return (
        <div style={{
            position: 'relative', width: `${larguraMM}mm`, height: `${alturaMM}mm`,
            background: '#fff', color: '#000', border: '0.4mm solid #000',
            padding: sm ? '2.5mm' : '3.5mm', boxSizing: 'border-box',
            fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.15,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Bloco AJUSTÁVEL: tudo que pode encolher via --fs. O rodapé de datas
              fica fora, então jamais é cortado. A faixa do selo entra aqui em
              tamanho fixo — a altura dela é descontada da área útil na medição. */}
          <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div ref={innerRef} style={{
                minHeight: '100%', display: 'flex', flexDirection: 'column',
                '--fs': fator,
            }}>
            {/* Faixa do selo "ALTO EM" no TOPO, centralizada; sem selo, o nome
                sobe e usa o espaço */}
            <SeloAnvisa selos={selos} sm={sm} />
            {/* Cabeçalho centralizado na largura toda */}
            <div style={{ textAlign: 'center', padding: '0 1mm' }}>
                {/* tarjaPreta (config do cadastro, paridade com o Clássico): nome
                    sobre faixa preta com letra branca. A faixa ocupa a largura
                    disponível do cabeçalho — quando há selo, o paddingRight do
                    header já reserva o canto, então tarja e selo convivem. */}
                <div style={{
                    fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 0.98,
                    fontSize: fs(sm ? 12 : 15), textTransform: 'uppercase',
                    background: et.tarjaPreta ? '#000' : 'transparent',
                    color: et.tarjaPreta ? '#fff' : '#000',
                    padding: et.tarjaPreta ? `${vmm(0.8)} 1mm` : undefined,
                    borderRadius: et.tarjaPreta ? '0.8mm' : undefined,
                }}>
                    {et.nomeProduto}
                </div>
                <div style={{ fontWeight: 700, fontSize: fs(sm ? 6 : 7), marginTop: vmm(sm ? 1 : 1.5) }}>
                    {/* "aprox." só com a config quantidadeAproximada ligada (paridade
                        com o Clássico: "CONTÉM APROXIMADAMENTE X" só com a flag) */}
                    Contém {et.quantidadeAproximada ? 'aprox. ' : ''}{et.quantidadeEmbalagem} unidades{et.pesoUnitario != null ? ` · ${et.pesoUnitario} g cada` : ''}
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

            {/* Zona inferior: textos (ingredientes → preparo → conservação) na
                largura TODA — o código de barras agora vive no rodapé fixo. */}
            <div style={{ flex: 1, minHeight: 0, marginTop: vmm(sm ? 1.6 : 2.5) }}>
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
            </div>
          </div>

            {/* Rodapé FIXO (fora do bloco ajustável — nunca corta, não escala):
                datas em PÍLULAS empilhadas (borda preta, fundo branco) + EAN-13
                DEITADO à direita. Cada pílula é um grid com coluna de rótulo de
                largura FIXA — rótulos alinhados à esquerda entre si e as datas
                começando no mesmo x, uma em cima da outra; as pílulas esticam
                para a mesma largura (alignItems: stretch). O bloco das pílulas
                fica CENTRALIZADO (vertical e horizontal) no espaço que sobra ao
                lado do barcode. Barcode em tamanho físico constante (leitura). */}
            <div style={{
                display: 'flex', alignItems: 'center',
                gap: sm ? '2mm' : '3mm', borderTop: '0.35mm solid #000',
                paddingTop: sm ? '1mm' : '1.5mm', marginTop: sm ? '1mm' : '1.5mm', flex: '0 0 auto',
            }}>
                <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: sm ? '0.8mm' : '1mm' }}>
                        {[['Fabricação/Lote:', dataFab], ['Validade:', dataVal]].map(([rotulo, valor]) => (
                            <div key={rotulo} style={{
                                display: 'grid', gridTemplateColumns: sm ? '20mm auto' : '22mm auto',
                                alignItems: 'baseline', columnGap: '1mm', whiteSpace: 'nowrap',
                                border: '0.35mm solid #000', borderRadius: '99mm', background: '#fff',
                                padding: sm ? '0.6mm 2mm' : '0.9mm 2.5mm',
                            }}>
                                <span style={{ fontSize: sm ? '6.5pt' : '7pt', fontWeight: 600 }}>{rotulo}</span>
                                <b style={{ fontSize: sm ? '8pt' : '9.5pt', fontWeight: 800, letterSpacing: '-0.01em' }}>{valor}</b>
                            </div>
                        ))}
                    </div>
                </div>
                {et.codigoBarras && (
                    <svg ref={svgRef} style={{ display: 'block', flex: '0 0 auto' }} />
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
