import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { TAMANHOS, TAMANHO_PADRAO, MODELOS, codExibir, validadeDias, pesoLiquidoStr, parseValor, parseVD, fmtNum } from './etiquetaModelos';
import { useAutoFit } from './useAutoFit';

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
    const ID_AREA = 'area-impressao';
    const ID_ESTILO = 'estilo-impressao';
    document.getElementById(ID_AREA)?.remove();
    document.getElementById(ID_ESTILO)?.remove();

    const style = document.createElement('style');
    style.id = ID_ESTILO;
    // Impressora ZDesigner está em LANDSCAPE (altura×largura da mídia). A etiqueta é
    // desenhada em portrait (larguraMM×alturaMM), então a página sai em landscape e o
    // conteúdo é girado 90° para casar com a mídia e sair reto na etiqueta.
    // @page no nível raiz (iOS não lida bem com @page dentro de @media)
    style.textContent = `
        @page { size: ${alturaMM}mm ${larguraMM}mm; margin: 0; }
        #${ID_AREA} { display: none; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
            /* remove o app do LAYOUT (não só esconde) — senão sobra altura "fantasma" = páginas em branco */
            body > *:not(#${ID_AREA}) { display: none !important; }
            #root { display: none !important; }
            #${ID_AREA} { display: block !important; }
            #${ID_AREA}, #${ID_AREA} * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            #${ID_AREA} .pg { width: ${alturaMM}mm; height: ${larguraMM}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; page-break-after: always; }
            #${ID_AREA} .pg:last-child { page-break-after: avoid; }
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
    // Auto-fit: encolhe o conteúdo se ele passar da altura da etiqueta, garantindo
    // que Fabricação/Lote + Validade (rodapé) SEMPRE apareçam inteiros.
    const { boxRef, innerRef, fator: fatorFit } = useAutoFit([et, dataFab, dataVal, larguraMM, alturaMM]);
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
          <div ref={boxRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div ref={innerRef} style={{
                minHeight: '100%', display: 'flex', flexDirection: 'column',
                // `zoom` (não `transform: scale`) encolhe a CAIXA de layout de verdade,
                // inclusive na impressão — garante que o rodapé (datas) nunca é cortado.
                zoom: fatorFit < 1 ? fatorFit : undefined,
            }}>
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
        </div>
      </div>
    );

    // Tamanho nativo do layout clássico = 80×100. Nesse tamanho, sai idêntico ao de sempre.
    if (larguraMM === 80 && alturaMM === 100) return conteudo;

    // Em outro tamanho (ex.: 100×120), o conteúdo 80×100 é escalado para PREENCHER a
    // folha, centralizado — sem cortar nada e sem sobrar muito branco. Fator = o maior
    // que ainda cabe nas duas dimensões (min da razão de largura e de altura).
    // `zoom` (não `transform: scale`) para o aumento valer também no LAYOUT de
    // impressão — assim a etiqueta ocupa a folha física de verdade, não só na tela.
    const fator = Math.min(larguraMM / 80, alturaMM / 100);
    return (
      <div style={{
          width: `${larguraMM}mm`, height: `${alturaMM}mm`, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box', overflow: 'hidden',
      }}>
        <div style={{ zoom: fator }}>{conteudo}</div>
      </div>
    );
}
