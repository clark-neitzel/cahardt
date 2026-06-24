import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// SKU do catálogo tem prioridade; cai para o código interno se não vinculado
export const codExibir = (et) => et.produto?.codigo || et.codigoProduto;

// Lista oficial de alérgenos (RDC 26/2015 / IN 75/2020) para os checks do formulário
export const ALERGENOS_LISTA = [
    'Trigo', 'Centeio', 'Cevada', 'Aveia',
    'Crustáceos', 'Ovos', 'Peixes', 'Amendoim', 'Soja', 'Leite',
    'Amêndoa', 'Avelã', 'Castanha-de-caju', 'Castanha-do-pará',
    'Macadâmia', 'Nozes', 'Pecã', 'Pistache', 'Pinoli', 'Castanhas',
    'Látex natural',
];

// ─── Parsers de valores nutricionais ──────────────────────────────────────────
// Valores armazenados como "34kcal (2% VD)", "5,7g (2% VD)", "147mg (6% VD)"

function parseValor(str) {
    if (!str) return null;
    const m = String(str).replace(',', '.').match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
}

function parseVD(str) {
    if (!str) return '0';
    const m = String(str).match(/(\d+)\s*%/);
    return m ? m[1] : '0';
}

function fmtNum(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    const f = Math.pow(10, dec);
    const r = Math.round(n * f) / f;
    return String(r).replace('.', ',');
}

// Peso líquido = quantidade da embalagem × peso unitário (kg se ≥ 1000g)
export function pesoLiquidoStr(et) {
    const g = (Number(et.quantidadeEmbalagem) || 0) * (Number(et.pesoUnitario) || 0);
    if (g <= 0) return '';
    if (g >= 1000) {
        const kg = Math.round((g / 1000) * 100) / 100;
        return `${String(kg).replace('.', ',')} kg`;
    }
    return `${g} g`;
}

// ─── Etiqueta visual (preview + impressão) ────────────────────────────────────

export default function EtiquetaLabel({ et, dataFab, dataVal }) {
    const svgRef = useRef(null);
    useEffect(() => {
        if (!svgRef.current || !et.codigoBarras) return;
        try {
            JsBarcode(svgRef.current, et.codigoBarras, {
                format: 'EAN13', width: 1.1, height: 15,
                displayValue: true, fontSize: 6, margin: 0, textMargin: 0,
            });
        } catch {
            try {
                JsBarcode(svgRef.current, et.codigoBarras, {
                    format: 'CODE128', width: 1.1, height: 22,
                    displayValue: true, fontSize: 6, margin: 1, textMargin: 0,
                });
            } catch { /* sem código de barras */ }
        }
    }, [et.codigoBarras]);

    // Alérgenos com espécie entre parênteses (RDC 26/2015) p/ crustáceos e peixes
    const alergenos = (Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
        if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
        if (a === 'Peixes' && et.especiePeixes)         return `${a} (${et.especiePeixes})`;
        return a;
    });
    const peso = Number(et.pesoTabelaNutricional) || Number(et.pesoUnitario) || 0;

    // Linhas da tabela nutricional. dec = casas decimais, indent = nível de recuo.
    const linhas = [
        { label: 'Valor Energético (kcal)',   raw: et.valorEnergetico,     dec: 0, indent: 0 },
        { label: 'Carboidratos totais (g)',   raw: et.carboidratos,         dec: 1, indent: 0 },
        { label: 'Açúcares totais (g)',       raw: et.acucaresTotais,       dec: 1, indent: 1, always: true },
        { label: 'Açúcares adicionados (g)',  raw: et.acucaresAdicionados,  dec: 1, indent: 2, always: true },
        { label: 'Proteínas (g)',             raw: et.proteinas,            dec: 1, indent: 0 },
        { label: 'Gorduras totais (g)',       raw: et.gordurasTotais,       dec: 1, indent: 0 },
        { label: 'Gorduras saturadas (g)',    raw: et.gordurasSaturadas,    dec: 1, indent: 1 },
        { label: 'Gorduras trans (g)',        raw: et.gordurasTrans,        dec: 1, indent: 1 },
        { label: 'Fibras alimentares (g)',    raw: et.fibraAlimentar,       dec: 1, indent: 0 },
        { label: 'Sódio (mg)',                raw: et.sodio,                dec: 0, indent: 0 },
    ].filter(r => r.always || r.raw);

    const style = {
        width: '80mm', height: '100mm', fontSize: '6pt',
        fontFamily: 'Arial, sans-serif', border: '0.4pt solid #000',
        padding: '1mm', boxSizing: 'border-box', lineHeight: 1.12,
        background: '#fff', color: '#000', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
    };

    const cell = { padding: '0.1mm 0.8mm', textAlign: 'center', borderLeft: '0.3pt solid #000' };
    const cellNome = { padding: '0.1mm 0.8mm' };

    return (
        <div style={style}>
            {/* Nome do produto (tarja preta opcional) — sem linha separadora */}
            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'8.5pt', marginBottom:'0.3mm', lineHeight:1.1, background: et.tarjaPreta ? '#000' : 'transparent', color: et.tarjaPreta ? '#fff' : '#000', margin: et.tarjaPreta ? '-1mm -1mm 0.3mm -1mm' : undefined, padding: et.tarjaPreta ? '1mm' : undefined }}>
                {et.nomeProduto}
            </div>

            {/* Código + peso líquido — sem linha separadora */}
            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', marginBottom:'0.5mm' }}>
                CÓD.{codExibir(et)}&nbsp;&nbsp;&nbsp;PESO LÍQUIDO {pesoLiquidoStr(et)}
            </div>

            {/* Tabela nutricional */}
            <div style={{ border:'0.4pt solid #000', marginBottom:'0.5mm' }}>
                <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', borderBottom:'0.4pt solid #000', padding:'0.2mm 0' }}>
                    INFORMAÇÃO NUTRICIONAL
                </div>
                <div style={{ fontSize:'5.5pt', padding:'0.3mm 0.8mm', borderBottom:'0.4pt solid #000', lineHeight:1.2 }}>
                    Porções por embalagem: {et.quantidadeEmbalagem} porções<br />
                    Porção {peso} g (1 unidade)
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'5.5pt' }}>
                    <thead>
                        <tr style={{ borderBottom:'0.3pt solid #000', fontWeight:'bold' }}>
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
                                <tr key={r.label} style={{ borderBottom:'0.3pt solid #000' }}>
                                    <td style={{ ...cellNome, paddingLeft: `${0.8 + r.indent * 1.5}mm` }}>{r.label}</td>
                                    <td style={cell}>{fmtNum(cem, r.dec)}</td>
                                    <td style={cell}>{fmtNum(porcao, r.dec)}</td>
                                    <td style={cell}>{parseVD(r.raw)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div style={{ fontSize:'4.5pt', padding:'0.2mm 0.8mm', borderTop:'0.3pt solid #000', lineHeight:1.1 }}>
                    *Percentual de valores diários fornecidos pela porção.
                </div>
            </div>

            {/* Ingredientes (sempre maiúsculo) + declarações de alérgenos */}
            <div style={{ border:'0.4pt solid #000', padding:'0.4mm 0.8mm', marginBottom:'0.5mm', fontSize:'5.5pt', lineHeight:1.2 }}>
                <span style={{ fontWeight:'bold' }}>INGREDIENTES:</span> {String(et.composicao || '').toUpperCase()}
                {/* Bloco Glúten → Lactose → Alérgicos, sempre MAIÚSCULO e NEGRITO */}
                <span style={{ fontWeight:'bold' }}>
                    {' '}{et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                    {et.contemLactose && <> · CONTÉM LACTOSE</>}
                    {alergenos.length > 0 && (
                        <> · ALÉRGICOS: CONTÉM {alergenos.join(', ').toUpperCase()}.</>
                    )}
                    {et.avisosRotulo && <> {String(et.avisosRotulo).toUpperCase()}</>}
                </span>
            </div>

            {/* Modo de preparo (inline para economizar espaço) */}
            <div style={{ border:'0.4pt solid #000', padding:'0.4mm 0.8mm', marginBottom:'0.5mm', fontSize:'5.5pt', lineHeight:1.2 }}>
                <span style={{ fontWeight:'bold' }}>MODO PREPARO:</span> {et.modoPreparo}
            </div>

            {/* Conservação */}
            {et.armazenamento && (
                <div style={{ fontStyle:'italic', fontSize:'5.5pt', marginBottom:'0.3mm', lineHeight:1.15 }}>
                    ❄ Conservação em FREEZER (-12°C ou mais frio). Uma vez descongelado não recongelar o produto.
                </div>
            )}

            {/* Código de barras */}
            {et.codigoBarras && (
                <div style={{ textAlign:'center', marginBottom:'0.3mm' }}>
                    <svg ref={svgRef} style={{ maxWidth:'100%', display:'block', margin:'0 auto' }} />
                </div>
            )}

            {/* Fabricação / Validade — fixa no rodapé */}
            <div style={{ border:'0.4pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', padding:'0.5mm', marginTop:'auto' }}>
                Fabricação/Lote - {dataFab}&nbsp;&nbsp;Validade - {dataVal}
            </div>
        </div>
    );
}
