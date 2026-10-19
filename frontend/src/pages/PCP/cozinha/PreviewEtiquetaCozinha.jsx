import { DIAS_SEMANA, DIAS_EXTENSO, diaSemana, dm, dmy, pesoTexto } from './util';

// Prévia SÓ VISUAL (CSS do mockup aprovado). A etiqueta que sai na impressora é gerada no servidor.
const CSS = `
.pc-et{background:#fff;color:#000;border:1px solid #cfcfcf;box-shadow:0 2px 6px rgba(0,0,0,.15);position:relative;overflow:hidden;max-width:100%}
.pc-p{width:224px;height:140px;display:flex}
.pc-p .faixa{width:30px;flex:0 0 30px;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);font-weight:800;font-size:14px;letter-spacing:.06em}
.pc-p .corpo{flex:1;min-width:0;padding:7px 8px;display:flex;flex-direction:column;justify-content:space-between}
.pc-p .nome{font-weight:800;line-height:1.05;text-transform:uppercase;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pc-p .datas{font-size:12px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.pc-p .val{font-size:12px;font-weight:800;border:2px solid #000;padding:1px 6px;border-radius:3px}
.pc-p .rod{font-size:9.5px;display:flex;justify-content:space-between;gap:4px}
.pc-g{width:250px;height:300px;display:flex;flex-direction:column}
.pc-g .faixa{background:#000;color:#fff;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:800;font-size:12px;white-space:nowrap}
.pc-g .faixa small{font-weight:700;font-size:8px;letter-spacing:.02em;border:1px solid #fff;padding:1px 4px;border-radius:3px}
.pc-g .nome{font-weight:800;line-height:1.05;text-transform:uppercase;padding:14px 14px 8px;flex:1;overflow:hidden}
.pc-g .bloco{margin:0 14px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pc-g .k{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#333;font-weight:800}
.pc-g .vv{font-size:15px;font-weight:800}
.pc-g .valbox{border:3px solid #000;border-radius:6px;padding:4px 8px;text-align:center}
.pc-g .valbox .vv{font-size:19px}
.pc-g .rod{padding:0 14px 12px;font-size:10px}
`;

export default function PreviewEtiquetaCozinha({ tamanho, nome, fabricacao, validade, conservacao, pesoGramas, lote, responsavel }) {
    const dia = diaSemana(fabricacao);
    const congelado = conservacao === 'CONGELADO';
    const peso = pesoTexto(pesoGramas);
    const nomeTxt = nome || 'Nome do item';
    const loteTxt = lote || 'AAMMDD-NN';
    const iniciais = (responsavel || '').split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const valTxt = validade ? dm(validade) : '--/--';

    return (
        <>
            <style>{CSS}</style>
            {tamanho === '100x120' ? (
                <div className="pc-et pc-g" aria-label="Prévia da etiqueta grande">
                    <div className="faixa"><span>{DIAS_EXTENSO[dia].toUpperCase()} · {dm(fabricacao)}</span><small>{congelado ? 'CONGELADO −18 °C' : 'REFRIGERADO 0–4 °C'}</small></div>
                    <div className="nome" style={{ fontSize: nomeTxt.length > 26 ? 19 : nomeTxt.length > 18 ? 22 : 24 }}>{nomeTxt}</div>
                    <div className="bloco">
                        <div><div className="k">Fabricação</div><div className="vv">{dmy(fabricacao)}</div></div>
                        <div className="valbox"><div className="k">Validade</div><div className="vv">{validade ? dmy(validade) : '--/--/----'}</div></div>
                    </div>
                    <div className="bloco">
                        <div><div className="k">Peso</div><div className="vv">{peso || '—'}</div></div>
                        <div><div className="k">Lote</div><div className="vv">{loteTxt}</div></div>
                    </div>
                    <div className="rod">Resp.: <b>{responsavel || '—'}</b><br />Hardt Salgados · PCP</div>
                </div>
            ) : (
                <div className="pc-et pc-p" aria-label="Prévia da etiqueta pequena">
                    <div className="faixa">{DIAS_SEMANA[dia]} {dm(fabricacao)}</div>
                    <div className="corpo">
                        <div className="nome" style={{ fontSize: nomeTxt.length > 22 ? 13 : nomeTxt.length > 16 ? 15 : 17 }}>{nomeTxt}</div>
                        <div className="datas"><span>FAB <b>{dm(fabricacao)}</b></span><span className="val">VAL {valTxt}</span></div>
                        <div className="rod">
                            <span>{[peso, congelado ? '🧊 −18 °C' : '❄️ 0–4 °C'].filter(Boolean).join(' · ')}</span>
                            <span>L {loteTxt}{iniciais ? ` · ${iniciais}` : ''}</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
