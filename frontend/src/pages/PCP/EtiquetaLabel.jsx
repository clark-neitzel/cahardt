import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { TAMANHOS, TAMANHO_PADRAO, MODELOS, codExibir, validadeDias, pesoLiquidoStr, parseValor, parseVD, fmtNum } from './etiquetaModelos';

// Reexporta os helpers puros (a fonte agora é etiquetaModelos.js) para NÃO quebrar
// os imports existentes de EtiquetasList / EtiquetaImprimir / EtiquetaForm.
export { codExibir, validadeDias, pesoLiquidoStr, parseValor, parseVD, fmtNum, ALERGENOS_LISTA } from './etiquetaModelos';

// Impressão dentro do PWA — mesmo padrão de ReceitaDetalhe.imprimirConteudo (funciona no iPad/iOS,
// onde imprimir via iframe sai em branco/só URL). Monta as etiquetas na própria página e usa
// @media print para esconder o app; depois limpa tudo. print() deve rodar dentro do clique.
// `tamanho` define a folha (p80 = 80×100 / g120 = 100×120); default = p80 (rolo atual).
// Compat: aceita também os ids de modelo antigos ('classico'/'anvisa120') sem quebrar.
export function imprimirEtiquetas(labelHtml, copies = 1, tamanho = TAMANHO_PADRAO) {
    const cfg = TAMANHOS[tamanho] || MODELOS[tamanho] || TAMANHOS[TAMANHO_PADRAO];
    const { larguraMM, alturaMM } = cfg;

    // A impressora ZDesigner está configurada em LANDSCAPE (a mídia entra deitada), então a
    // PÁGINA é alturaMM × larguraMM e a etiqueta (portrait larguraMM × alturaMM) é girada 90°.
    const pgLargMM = alturaMM;   // largura da página (mm) — 100 (p80) / 120 (g120)
    const pgAltMM  = larguraMM;  // altura  da página (mm) —  80 (p80) / 100 (g120)

    // A caixa de cada etiqueta fica 0,3mm MENOR que a página — PRECAUÇÃO, não correção de um
    // defeito observado. O que se mediu (08/2026): o Chrome converte mm→pontos e arredonda,
    // então 100mm de @page viram 99,83mm de caixa útil e uma .pg do tamanho EXATO da página
    // fica 0,17mm maior do que cabe. No Chrome isso só recorta a sobra, mas em um motor que
    // fragmente (WebKit/AirPrint, driver) uma caixa que não cabe pode ir para a folha seguinte
    // ou deixar página extra. NÃO é a causa do bug de 08/2026 (esse foi o papel divergente no
    // driver encolhendo o trabalho). Os 0,3mm não aparecem na impressão (a borda tem 0,4mm).
    const pgLargUtil = (pgLargMM - 0.3).toFixed(2);
    const pgAltUtil  = (pgAltMM  - 0.3).toFixed(2);

    const ID_AREA = 'area-impressao';
    const ID_ESTILO = 'estilo-impressao';
    document.getElementById(ID_AREA)?.remove();
    document.getElementById(ID_ESTILO)?.remove();

    const style = document.createElement('style');
    style.id = ID_ESTILO;
    // @page no nível raiz (iOS não lida bem com @page dentro de @media)
    style.textContent = `
        @page { size: ${pgLargMM}mm ${pgAltMM}mm; margin: 0; }
        #${ID_AREA} { display: none; }
        @media print {
            /* LARGURA EXPLÍCITA em mm: sem ela o documento fica com a largura da JANELA e o
               WebKit/driver aplica "ajustar à página", encolhendo a etiqueta num cantinho. */
            html, body {
                margin: 0 !important; padding: 0 !important; background: #fff !important;
                width: ${pgLargMM}mm !important; min-width: 0 !important; max-width: none !important;
                height: auto !important; min-height: 0 !important; overflow: visible !important;
            }
            /* remove o app do LAYOUT (não só esconde) — senão sobra altura "fantasma" = páginas em branco */
            body > *:not(#${ID_AREA}) { display: none !important; }
            #root { display: none !important; }
            #${ID_AREA} { display: block !important; width: ${pgLargMM}mm; margin: 0; padding: 0; }
            #${ID_AREA}, #${ID_AREA} * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            /* 1 etiqueta = 1 página. A caixa é 0,3mm menor que a folha (ver acima) e
               overflow:hidden a torna monolítica: nada do conteúdo empurra papel.
               Medido: 1 cópia = 1 página, 2 = 2, 3 = 3. */
            #${ID_AREA} .pg {
                width: ${pgLargUtil}mm; height: ${pgAltUtil}mm;
                display: flex; align-items: center; justify-content: center;
                overflow: hidden; break-inside: avoid; page-break-inside: avoid;
            }
            /* quebra ANTES de cada etiqueta seguinte — nunca DEPOIS da última.
               page-break-after:always na última é causa conhecida de folha em branco no fim
               do trabalho. Aqui é prevenção: no Chrome o :last-child { avoid } já dava conta. */
            #${ID_AREA} .pg + .pg { break-before: page; page-break-before: always; }
            /* gira a etiqueta portrait para caber na página landscape */
            #${ID_AREA} .pg > * { transform: rotate(90deg); flex: 0 0 auto; }
        }
    `;
    document.head.appendChild(style);

    const area = document.createElement('div');
    area.id = ID_AREA;
    area.innerHTML = Array.from({ length: copies }, () => `<div class="pg">${labelHtml}</div>`).join('');
    document.body.appendChild(area);

    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000); // fallback se afterprint não disparar

    void area.offsetHeight; // força o layout antes de imprimir
    try { window.print(); } catch { limpar(); }
}

// ─── Etiqueta visual (preview + impressão) ────────────────────────────────────

export default function EtiquetaLabel({ et, dataFab, dataVal, larguraMM = 80, alturaMM = 100 }) {
    const svgRef = useRef(null);
    useEffect(() => {
        if (!svgRef.current || !et.codigoBarras) return;
        try {
            JsBarcode(svgRef.current, et.codigoBarras, {
                format: 'EAN13', width: 2.2, height: 40,
                displayValue: true, fontSize: 12, margin: 0, textMargin: 1,
            });
        } catch {
            try {
                JsBarcode(svgRef.current, et.codigoBarras, {
                    format: 'CODE128', width: 2.2, height: 40,
                    displayValue: true, fontSize: 12, margin: 0, textMargin: 1,
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

    // Wrapper preenche a etiqueta física inteira (80×100mm) — impressora térmica precisa margin 0.
    // A "folga" fica por dentro: 2mm de padding brancos ao redor da borda.
    const outer = {
        width: '80mm', height: '100mm', padding: '2mm', boxSizing: 'border-box',
        background: '#fff', display: 'flex',
    };
    const style = {
        flex: 1, fontSize: '6pt',
        fontFamily: 'Arial, sans-serif', border: '0.4pt solid #000',
        padding: '1mm', boxSizing: 'border-box', lineHeight: 1.12,
        background: '#fff', color: '#000', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
    };

    const cell = { padding: '0.1mm 0.8mm', textAlign: 'center', borderLeft: '0.3pt solid #000' };
    const cellNome = { padding: '0.1mm 0.8mm' };

    const conteudo = (
      <div style={outer}>
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
                <div style={{ fontSize:'5.5pt', padding:'0.3mm 0.8mm', lineHeight:1.2 }}>
                    Porções por embalagem: {et.quantidadeEmbalagem} porções<br />
                    Porção {peso} g (1 unidade)
                </div>
                {/* Linha grossa recuada (padrão da tabela nutricional) */}
                <div style={{ borderTop:'1.2pt solid #000', margin:'0 1mm' }} />
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
                <span style={{ fontWeight:'bold' }}>INGREDIENTES:</span> {String(et.composicao || '').toLowerCase()}
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

            {/* Código de barras — ocupa quase toda a largura */}
            {et.codigoBarras && (
                <div style={{ textAlign:'center', marginBottom:'0.3mm' }}>
                    <svg ref={svgRef} style={{ width:'96%', height:'auto', display:'block', margin:'0 auto' }} />
                </div>
            )}

            {/* Fabricação / Validade — fixa no rodapé */}
            <div style={{ border:'0.4pt solid #000', textAlign:'center', fontWeight:'bold', fontSize:'6.5pt', padding:'0.5mm', marginTop:'auto' }}>
                Fabricação/Lote - {dataFab}&nbsp;&nbsp;Validade - {dataVal}
            </div>
        </div>
      </div>
    );

    // Clássico NORMAL: renderiza no seu tamanho natural (80×100), sem zoom nem escala —
    // é como imprimia certo antes das mexidas de auto-fit/split de tamanho. O dono vai
    // re-especificar o comportamento em outros tamanhos depois.
    return conteudo;
}
