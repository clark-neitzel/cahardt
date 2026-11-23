import CampoNumero from '../../../components/CampoNumero';
import { fmtQtd, textoCaixas } from './separacaoCalculo';
import { TEXTOS_SEPARACAO } from './textos';

// Uma linha de separação: SEPARAR / SEPAREI / FALTA lado a lado + botões grandes (mock, legendas 3, 4 e 5).
// `pedir` = o que a carga pede; `sep` = quanto já separou; `cl` = '' | 'ok' | 'par' | 'nao'.
// `textos` (opcional) troca o vocabulário (conferência do motorista); `aviso` (opcional) é a linha "Separação avisou…".
export default function LinhaSeparacao({ k, nome, unidade, pedir, sep, cl, tocada, motivo, porCaixa, h, textos = TEXTOS_SEPARACAO, aviso = null }) {
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
            <div className="q"><label>{textos.rotuloPedir}</label><b>{fmtQtd(pedir)}</b></div>
            <div className="q">
                <label htmlFor={`sep-${k}`}>{textos.rotuloFeito}</label>
                <CampoNumero id={`sep-${k}`} className="num" decimal casas={3} min={0} max={pedir}
                    value={sep} onChange={(e) => h.digitar(k, e.target.value)} aria-label={textos.ariaFeito(nome)} />
            </div>
            <div className="q f"><label>{textos.rotuloFalta}</label><b>{cl === 'ok' ? '✓' : fmtQtd(falta)}</b></div>
            <div className="acts">
                <button type="button" className="rd" onClick={() => h.menos(k)} aria-label="Menos um">−</button>
                <button type="button" className="rd" onClick={() => h.mais(k)} aria-label="Mais um">+</button>
                <button type="button" className="tudo" onClick={() => h.tudo(k)}>{cl === 'ok' ? textos.btnTudoOk : textos.btnTudo}</button>
            </div>
            {aviso ? <div className="avs">{aviso}</div> : null}
            {tocada && falta > 0 && (
                <div className="mot">
                    <span>Falta {fmtQtd(falta)}. Por quê?</span>
                    {textos.motivos.map((m) => (
                        <button key={m.valor} type="button" className={`${m.cls} ${motivo === m.valor ? 'on' : ''}`} onClick={() => h.motivo(k, m.valor)}>{m.rotulo}</button>
                    ))}
                </div>
            )}
        </div>
    );
}
