import { fmtQtd } from './separacaoCalculo';
import { TEXTOS_SEPARACAO } from './textos';

// "A carga mudou": o escritório mexeu na carga enquanto este aparelho estava sem sinal.
// A nova carga só vira a ativa depois do OK da pessoa.
export default function AvisoCargaMudou({ mudou, onOk, textos = TEXTOS_SEPARACAO }) {
    if (!mudou) return null;
    const { diff, descartados } = mudou;
    return (
        <div className="mdl-f" role="dialog" aria-modal="true" aria-label="A carga mudou">
            <div className="mdl">
                <h3>A carga mudou</h3>
                <p style={{ margin: 0, fontWeight: 700 }}>O escritório alterou esta carga. Veja o que mudou antes de continuar:</p>
                {diff.entraram.length > 0 && (
                    <div><b>Pedidos que entraram</b>
                        <ul>{diff.entraram.map((p) => <li key={p.id}>{p.cliente} — {p.etiqueta}</li>)}</ul></div>
                )}
                {diff.sairam.length > 0 && (
                    <div><b>Pedidos que saíram</b>
                        <ul>{diff.sairam.map((p) => <li key={p.id}>{p.cliente} — {p.etiqueta}</li>)}</ul></div>
                )}
                {diff.alterados.length > 0 && (
                    <div><b>Quantidades que mudaram</b>
                        <ul>{diff.alterados.map((a) => <li key={a.nome}>{a.nome}: de {fmtQtd(a.de)} para {fmtQtd(a.para)}</li>)}</ul></div>
                )}
                {diff.porPedido?.length > 0 && (
                    <div><b>O que cada pedido leva mudou</b>
                        <ul>{diff.porPedido.map((p) => (
                            <li key={p.id}>{p.cliente} — {p.etiqueta}
                                <ul>{p.itens.map((a) => <li key={a.nome}>{a.nome}: de {fmtQtd(a.de)} para {fmtQtd(a.para)}</li>)}</ul>
                            </li>
                        ))}</ul></div>
                )}
                {descartados > 0 && (
                    <p style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>
                        {descartados} toque{descartados > 1 ? 's' : ''} seu{descartados > 1 ? 's' : ''} {descartados > 1 ? 'eram' : 'era'} de pedido que saiu da carga e {descartados > 1 ? 'foram descartados' : 'foi descartado'}.
                    </p>
                )}
                <p style={{ margin: 0, fontSize: '.88em', fontWeight: 600, color: '#374151' }}>{textos.jaFeito}</p>
                <div className="bt"><button type="button" className="big" onClick={onOk}>OK, entendi</button></div>
            </div>
        </div>
    );
}
