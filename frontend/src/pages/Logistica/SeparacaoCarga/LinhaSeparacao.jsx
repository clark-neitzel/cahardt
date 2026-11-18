import CampoNumero from '../../../components/CampoNumero';
import { MOTIVO_DEPOIS, MOTIVO_NAO_TEM, fmtQtd, textoCaixas } from './separacaoCalculo';

// Uma linha de separação: SEPARAR / SEPAREI / FALTA lado a lado + botões grandes (mock, legendas 3, 4 e 5).
// `pedir` = o que a carga pede; `sep` = quanto já separou; `cl` = '' | 'ok' | 'par' | 'nao'.
export default function LinhaSeparacao({ k, nome, unidade, pedir, sep, cl, tocada, motivo, porCaixa, h }) {
    const falta = Math.max(Math.round((pedir - sep) * 1000) / 1000, 0);
    const cx = porCaixa ? textoCaixas(pedir, porCaixa) : '';
    return (
        <div className={`it ${cl}`} data-chave={k}>
            <div className="nm">
                <span>
                    {nome}
                    {(cx || unidade) ? <small>{[unidade && unidade !== 'UN' ? unidade : '', cx].filter(Boolean).join(' · ')}</small> : null}
                </span>
            </div>
            <div className="q"><label>Separar</label><b>{fmtQtd(pedir)}</b></div>
            <div className="q">
                <label htmlFor={`sep-${k}`}>Separei</label>
                <CampoNumero id={`sep-${k}`} className="num" decimal casas={3} min={0} max={pedir}
                    value={sep} onChange={(e) => h.digitar(k, e.target.value)} aria-label={`Quanto já separou de ${nome}`} />
            </div>
            <div className="q f"><label>Falta</label><b>{cl === 'ok' ? '✓' : fmtQtd(falta)}</b></div>
            <div className="acts">
                <button type="button" className="rd" onClick={() => h.menos(k)} aria-label="Menos um">−</button>
                <button type="button" className="rd" onClick={() => h.mais(k)} aria-label="Mais um">+</button>
                <button type="button" className="tudo" onClick={() => h.tudo(k)}>{cl === 'ok' ? '✓ Separado' : '✓ Separei tudo'}</button>
            </div>
            {tocada && falta > 0 && (
                <div className="mot">
                    <span>Falta {fmtQtd(falta)}. Por quê?</span>
                    <button type="button" className={`dep ${motivo === MOTIVO_DEPOIS ? 'on' : ''}`} onClick={() => h.motivo(k, MOTIVO_DEPOIS)}>⏳ Vem depois</button>
                    <button type="button" className={`nt ${motivo === MOTIVO_NAO_TEM ? 'on' : ''}`} onClick={() => h.motivo(k, MOTIVO_NAO_TEM)}>✕ Não tem</button>
                </div>
            )}
        </div>
    );
}
