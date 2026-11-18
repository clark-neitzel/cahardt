import { MOTIVO_DEPOIS, MOTIVO_NAO_TEM, fmtQtd } from './separacaoCalculo';

// Lista "Ficou faltando": só linhas TOCADAS que ainda têm falta, com o selo do motivo.
export default function FicouFaltando({ itens }) {
    if (!itens?.length) return null;
    return (
        <div className="falt">
            <h4>Ficou faltando</h4>
            {itens.map((f) => (
                <div key={f.chave}>
                    <span>{f.nome} — falta {fmtQtd(f.falta)}</span>
                    {f.motivo === MOTIVO_NAO_TEM ? <span className="bd r">Não tem</span>
                        : f.motivo === MOTIVO_DEPOIS ? <span className="bd a">Vem depois</span>
                            : <span className="bd c">Sem motivo</span>}
                </div>
            ))}
        </div>
    );
}
