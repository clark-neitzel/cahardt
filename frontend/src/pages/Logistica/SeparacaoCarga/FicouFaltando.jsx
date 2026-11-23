import { fmtQtd } from './separacaoCalculo';
import { TEXTOS_SEPARACAO } from './textos';

// Lista "Ficou faltando": só linhas TOCADAS que ainda têm falta, com o selo do motivo.
export default function FicouFaltando({ itens, textos = TEXTOS_SEPARACAO }) {
    if (!itens?.length) return null;
    return (
        <div className="falt">
            <h4>{textos.ficouFaltando}</h4>
            {itens.map((f) => (
                <div key={f.chave}>
                    <span>{f.nome} — falta {fmtQtd(f.falta)}</span>
                    {(() => {
                        const m = textos.motivos.find((x) => x.valor === f.motivo);
                        return m ? <span className={`bd ${m.badgeCls}`}>{m.badge}</span> : <span className="bd c">Sem motivo</span>;
                    })()}
                </div>
            ))}
        </div>
    );
}
