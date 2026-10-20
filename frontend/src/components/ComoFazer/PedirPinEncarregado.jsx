import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import comoFazerService, { mensagemErro, codigoErro } from '../../services/comoFazerService';
import FotoPessoa from './FotoPessoa';
import TecladoNumerico from './TecladoNumerico';

// O encarregado escolhe a própria foto e digita o PIN dele NO MESMO aparelho.
// O PIN não vira sessão: vai só nesta confirmação.
export default function PedirPinEncarregado({ conteudoId, treinandoId, setor, onOk, onFechar }) {
    const [lista, setLista] = useState(null);
    const [escolhido, setEscolhido] = useState(null);
    const [pin, setPin] = useState('');
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [tremer, setTremer] = useState(false);

    useEffect(() => {
        comoFazerService.encarregados(setor)
            .then((d) => setLista(Array.isArray(d?.encarregados) ? d.encarregados : []))
            .catch((e) => { setLista([]); setErro(mensagemErro(e)); });
    }, [setor]);

    const enviar = async (valorPin) => {
        setEnviando(true); setErro('');
        try {
            const r = await comoFazerService.confirmar(conteudoId, { treinandoId, encarregadoId: escolhido.funcionarioId, pin: valorPin });
            onOk(r);
        } catch (e) {
            const cod = codigoErro(e);
            setPin('');
            setTremer(true); setTimeout(() => setTremer(false), 500);
            if (cod === 'PIN_INCORRETO') setErro('Número errado. Tente de novo.');
            else if (cod === 'AGUARDE') setErro(`Muitas tentativas. Aguarde ${e.response?.data?.segundos || 30} segundos.`);
            else if (cod === 'NAO_PODE_SE_CONFIRMAR') setErro('Você não pode confirmar o seu próprio treinamento. Chame o encarregado.');
            else setErro(mensagemErro(e));
        } finally { setEnviando(false); }
    };

    const aoDigitar = (v) => {
        setPin(v);
        if (v.length === 4 && escolhido && !enviando) enviar(v);
    };

    return (
        <div className="fixed inset-0 z-[9000] bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="bg-house text-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl p-4 md:p-6 max-h-[95vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg md:text-xl font-bold">{escolhido ? `${escolhido.nome}, digite seu número` : 'Quem é o encarregado?'}</h2>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-white/10"><X className="h-6 w-6" /></button>
                </div>

                {!escolhido && (
                    lista === null ? <div className="py-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                        : lista.length === 0 ? <p className="py-6 text-center text-white/80">Nenhum encarregado liberado neste setor. Peça ao RH para ligar o usuário do encarregado à ficha dele.</p>
                            : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {lista.map((f) => (
                                        <button key={f.funcionarioId} type="button" onClick={() => { setEscolhido(f); setErro(''); }}
                                            className="bg-white text-gray-900 rounded-2xl p-3 flex flex-col items-center gap-2 min-h-[110px]">
                                            <FotoPessoa foto={f.foto} nome={f.nome} tamanho={64} />
                                            <span className="font-bold text-sm text-center break-words">{f.nome}</span>
                                        </button>
                                    ))}
                                </div>
                            )
                )}

                {escolhido && (
                    <div className={tremer ? 'animate-[cf-tremer_0.4s]' : ''}>
                        <div className="flex justify-center gap-3 my-3">
                            {[0, 1, 2, 3].map((i) => (
                                <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-[#cba258]' : 'bg-white/35'}`} />
                            ))}
                        </div>
                        <TecladoNumerico valor={pin} onChange={aoDigitar} maxLen={4} escuro />
                        <button type="button" onClick={() => { setEscolhido(null); setPin(''); setErro(''); }} className="mt-3 w-full min-h-[56px] text-white/80 font-semibold">Não sou eu</button>
                    </div>
                )}
                {erro && <p className="mt-3 text-center text-sm font-bold bg-red-100 text-red-700 rounded-xl p-3">{erro}</p>}
            </div>
        </div>
    );
}
