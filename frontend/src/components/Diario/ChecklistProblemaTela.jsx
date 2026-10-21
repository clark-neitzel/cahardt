import React, { useRef, useState } from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle, HelpCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import checklistVeiculoService from '../../services/checklistVeiculoService';

/**
 * Tela exibida quando o servidor devolve veredito ATENCAO/REPROVADO.
 * Frases, "o que fazer" e o AVISO vêm prontos do servidor — nunca digitar esse texto aqui.
 * `resultado` = resposta de POST /checklists-veiculo/:id/avaliar (contrato 5.6).
 * `rotulos` = { angulo: 'Frente com placa' } para nomear fotos que faltam.
 */
const ChecklistProblemaTela = ({ resultado, rotulos = {}, checklistId, onAtualizar, onCorrigir, onSeguir, seguindo = false }) => {
    const travaRef = useRef(false);
    const [respondendo, setRespondendo] = useState(false);

    const responder = async (p, resposta) => {
        if (travaRef.current || !checklistId) return;
        travaRef.current = true;
        setRespondendo(true);
        try {
            const r = await checklistVeiculoService.responder(checklistId, { angulo: p.angulo, indice: p.indice, resposta });
            if (r?.avaliacao) onAtualizar?.(r.avaliacao);
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Não consegui salvar sua resposta. Tente de novo.');
        } finally {
            travaRef.current = false;
            setRespondendo(false);
        }
    };

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
    const aberta = (p) => p.gravidade === 'PERGUNTA' && !p.resposta;
    const confirmada = (p) => p.gravidade === 'PERGUNTA' && p.resposta === 'SIM';
    const naoRespondida = (p) => p.gravidade === 'PERGUNTA' && p.resposta === 'NAO';
    // NAO vira ATENCAO/REPROVA pela gravidadeAplicada (sem botões)
    const efetiva = (p) => (naoRespondida(p) ? (p.gravidadeAplicada === 'REPROVA' ? 'REPROVA' : 'ATENCAO') : p.gravidade);
    const grave = resultado?.veredito === 'REPROVADO' && !itens.every(aberta);
    const pendentes = itens.filter(p => !confirmada(p) && (aberta(p) || ['ATENCAO', 'REPROVA'].includes(efetiva(p))));
    const tudoCerto = pendentes.length === 0;
    const soPerguntas = !tudoCerto && pendentes.every(aberta);

    return (
        <div className="space-y-4 animate-fade-in">
            {tudoCerto ? (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 border bg-green-50 border-green-200 text-green-800">
                    <CheckCircle className="h-6 w-6 shrink-0" />
                    <p className="font-bold text-base">Tudo certo</p>
                </div>
            ) : (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${grave ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {grave ? <XCircle className="h-6 w-6 shrink-0" /> : <AlertTriangle className="h-6 w-6 shrink-0" />}
                    <div>
                        <p className="font-bold text-base">{soPerguntas ? 'Só confirma uma coisa pra mim' : 'Dá uma olhada nisso antes de sair'}</p>
                        <p className="text-xs opacity-80">Veja abaixo o que a conferência apontou.</p>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {itens.map((p, i) => {
                    const reprova = efetiva(p) === 'REPROVA';
                    if (confirmada(p)) {
                        return (
                            <p key={`${p.angulo || 'x'}-${p.indice ?? i}`} className="flex items-start gap-1.5 text-xs text-green-800 px-1">
                                <CheckCircle className="h-4 w-4 shrink-0" /> <span>Você confirmou: {p.pergunta || p.descricao}</span>
                            </p>
                        );
                    }
                    if (aberta(p)) {
                        return (
                            <div key={`${p.angulo || 'x'}-${p.indice ?? i}`} className="bg-amber-50 rounded-xl border border-amber-300 shadow-sm p-3">
                                <div className="flex items-start gap-2">
                                    <HelpCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                        {p.angulo && rotulos[p.angulo] && (
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{rotulos[p.angulo]}</p>
                                        )}
                                        <p className="text-base font-bold text-gray-900">{p.pergunta || p.descricao}</p>
                                        <div className="grid grid-cols-2 gap-2 mt-3">
                                            <button type="button" disabled={respondendo} onClick={() => responder(p, 'SIM')}
                                                className="min-h-[44px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm">
                                                Sim
                                            </button>
                                            <button type="button" disabled={respondendo} onClick={() => responder(p, 'NAO')}
                                                className="min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-semibold text-sm">
                                                Não
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }
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

            {!tudoCerto && resultado?.aviso && (
                <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-3 py-2.5">
                    <Info className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>{resultado.aviso}</span>
                </div>
            )}

            {/* Futuro (Dia 2): aqui entra o botão "Pedir liberação" quando resultado.podePedirLiberacao */}

            <div className="flex flex-col gap-2">
                {tudoCerto ? (
                    <button type="button" onClick={() => onSeguir?.({ semDecisao: true })} disabled={seguindo || respondendo}
                        className="w-full min-h-[48px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm shadow-sm">
                        {seguindo ? 'Abrindo o dia…' : 'Seguir'}
                    </button>
                ) : (
                    <button type="button" onClick={onCorrigir} disabled={seguindo || respondendo}
                        className="w-full min-h-[48px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm shadow-sm">
                        Corrigir agora
                    </button>
                )}
                {!tudoCerto && resultado?.podeSeguir && (
                    <button type="button" onClick={() => onSeguir?.()} disabled={seguindo || respondendo}
                        className="w-full min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full font-medium text-sm">
                        {seguindo ? 'Abrindo o dia…' : 'Seguir mesmo assim (teste)'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ChecklistProblemaTela;
