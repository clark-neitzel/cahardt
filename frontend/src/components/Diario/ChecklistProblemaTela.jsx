import React from 'react';
import { AlertTriangle, XCircle, Info } from 'lucide-react';

/**
 * Tela exibida quando o servidor devolve veredito ATENCAO/REPROVADO.
 * Frases, "o que fazer" e o AVISO vêm prontos do servidor — nunca digitar esse texto aqui.
 * `resultado` = resposta de POST /checklists-veiculo/:id/avaliar (contrato 5.6).
 * `rotulos` = { angulo: 'Frente com placa' } para nomear fotos que faltam.
 */
const ChecklistProblemaTela = ({ resultado, rotulos = {}, onCorrigir, onSeguir, seguindo = false }) => {
    const problemas = Array.isArray(resultado?.problemas) ? resultado.problemas : [];
    const faltando = Array.isArray(resultado?.faltando) ? resultado.faltando : [];
    // Fotos que faltam viram itens da lista (se o servidor já não as listou como problema).
    const jaListados = new Set(problemas.map(p => p.angulo).filter(Boolean));
    const itens = [
        ...problemas,
        ...faltando.filter(a => !jaListados.has(a)).map(a => ({
            angulo: a, gravidade: 'ATENCAO',
            descricao: `Falta a foto: ${rotulos[a] || a}`,
            oQueFazer: 'Tire a foto e envie.',
        })),
    ];
    const grave = resultado?.veredito === 'REPROVADO';

    return (
        <div className="space-y-4 animate-fade-in">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${grave ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {grave ? <XCircle className="h-6 w-6 shrink-0" /> : <AlertTriangle className="h-6 w-6 shrink-0" />}
                <div>
                    <p className="font-bold text-base">{grave ? 'Encontramos um problema no veículo' : 'Atenção: confira estes pontos'}</p>
                    <p className="text-xs opacity-80">Veja abaixo o que a conferência apontou.</p>
                </div>
            </div>

            <div className="space-y-2">
                {itens.map((p, i) => {
                    const reprova = p.gravidade === 'REPROVA';
                    return (
                        <div key={`${p.angulo || 'x'}-${i}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                            <div className="flex items-start gap-2">
                                <span className={`mt-0.5 shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full ${reprova ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {reprova ? 'GRAVE' : 'ATENÇÃO'}
                                </span>
                                <div className="min-w-0">
                                    {p.angulo && rotulos[p.angulo] && (
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{rotulos[p.angulo]}</p>
                                    )}
                                    <p className="text-sm font-semibold text-gray-900">{p.descricao}</p>
                                    {p.oQueFazer && <p className="text-sm text-gray-600 mt-0.5">O que fazer: {p.oQueFazer}</p>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {resultado?.aviso && (
                <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-3 py-2.5">
                    <Info className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{resultado.aviso}</span>
                </div>
            )}

            {/* Futuro (Dia 2): aqui entra o botão "Pedir liberação" quando resultado.podePedirLiberacao */}

            <div className="flex flex-col gap-2">
                <button type="button" onClick={onCorrigir} disabled={seguindo}
                    className="w-full min-h-[48px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm shadow-sm">
                    Corrigir agora
                </button>
                {resultado?.podeSeguir && (
                    <button type="button" onClick={onSeguir} disabled={seguindo}
                        className="w-full min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-medium text-sm">
                        {seguindo ? 'Abrindo o dia…' : 'Seguir mesmo assim (teste)'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ChecklistProblemaTela;
