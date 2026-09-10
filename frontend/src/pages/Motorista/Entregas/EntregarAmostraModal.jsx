import { useState, useEffect } from 'react';
import { MapPin, Loader2, X, CheckCircle, Package, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import entregasService from '../../../services/entregasService';
import NaPortaGpsModal from './NaPortaGpsModal';

// ─────────────────────────────────────────────────────────────────────────────
// Entrega de AMOSTRA na rua (motorista ou vendedor).
//
// Antes era um `window.confirm` seco: a amostra virava ENTREGUE e pronto. Agora
// a entrega aproveita a ida até a porta para duas coisas que o cadastro precisa:
//
//  1. LOCALIZAÇÃO — o app tenta pegar o ponto sozinho ao abrir. Se o destinatário
//     é um LEAD sem ponto, o servidor grava ali mesmo (amostra costuma ser a
//     primeira visita — é a chance de fisgar o lugar). Se é CLIENTE, vale a mesma
//     regra da entrega de pedido: sem ponto ou longe do ponto, o app pergunta
//     "está na porta?" e a foto da fachada corrige o cadastro.
//  2. OBSERVAÇÃO — o que quem entregou ouviu/viu ("deixei com o gerente",
//     "achou o coxinha salgado"), que é o retorno que o vendedor quer ler depois.
//
// NADA disso trava a entrega: GPS e observação são opcionais. O motorista pode
// estar num ponto sem sinal, e amostra parada na mão dele é pior que ponto faltando.
// ─────────────────────────────────────────────────────────────────────────────
export default function EntregarAmostraModal({ amostra, onClose, onSuccess }) {
    const [gps, setGps] = useState(null);        // 'lat,lng' | null
    const [buscandoGps, setBuscandoGps] = useState(false);
    const [erroGps, setErroGps] = useState(null);
    const [observacao, setObservacao] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [naPortaInfo, setNaPortaInfo] = useState(null);

    const nome = amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || 'o destinatário';
    // Amostra de LEAD chega com um `cliente` sintético (sem UUID) montado no backend
    const semPontoNoCadastro = !amostra.cliente?.Ponto_GPS;

    const capturarGps = () => {
        if (!navigator.geolocation) {
            setErroGps('Este aparelho não tem GPS disponível no navegador.');
            return;
        }
        setBuscandoGps(true);
        setErroGps(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGps(`${pos.coords.latitude},${pos.coords.longitude}`);
                setBuscandoGps(false);
            },
            (err) => {
                setBuscandoGps(false);
                setGps(null);
                setErroGps(err.code === 1
                    ? 'Permissão de localização negada — libere o GPS para o app.'
                    : 'Sinal de GPS fraco aqui. Dá para entregar assim mesmo.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // Tenta pegar a localização assim que abre — o motorista não precisa lembrar
    useEffect(() => { capturarGps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const confirmar = async () => {
        setEnviando(true);
        try {
            const resp = await entregasService.concluirAmostra(amostra.id, {
                gpsEntrega: gps,
                observacaoEntrega: observacao.trim() || null
            });

            if (resp?.leadPontoDefinido) toast.success('Amostra entregue! O ponto do lead foi salvo aqui.');
            else toast.success('Amostra entregue!');

            // Cliente sem ponto ou entrega longe do ponto: pergunta se está na porta
            if (resp?.gps?.perguntarNaPorta && resp?.gps?.clienteUuid) {
                setNaPortaInfo({ ...resp.gps, ponto: gps });
                return; // onSuccess sai quando a pergunta fechar
            }
            onSuccess();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao registrar a entrega da amostra.');
        } finally {
            setEnviando(false);
        }
    };

    if (naPortaInfo) {
        return (
            <NaPortaGpsModal
                clienteUuid={naPortaInfo.clienteUuid}
                clienteNome={nome}
                distanciaM={naPortaInfo.distanciaM}
                status={naPortaInfo.status}
                ponto={naPortaInfo.ponto}
                onFechar={() => { setNaPortaInfo(null); onSuccess(); }}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="bg-orange-500 px-4 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-white/20 rounded-full p-1.5 shrink-0">
                            <Package className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-bold text-[15px] leading-tight truncate">Entregar amostra</p>
                            <p className="text-white/80 text-[11px] truncate">AM#{amostra.numero} · {nome}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-2 shrink-0" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto">
                    {/* Itens da amostra (conferência rápida na porta) */}
                    {amostra.itens?.length > 0 && (
                        <div className="bg-orange-50/60 border border-orange-100 rounded-lg p-3 space-y-1">
                            {amostra.itens.map(item => (
                                <div key={item.id} className="flex items-center justify-between text-[13px]">
                                    <span className="text-gray-700 truncate pr-2">{item.nomeProduto || item.produto?.nome}</span>
                                    <span className="font-bold text-gray-900 shrink-0">{Number(item.quantidade)} un</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Localização */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-1.5">
                            <MapPin className="h-4 w-4 text-primary" /> Localização da entrega
                        </label>
                        {buscandoGps ? (
                            <div className="flex items-center gap-2 text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                                <Loader2 className="h-4 w-4 animate-spin" /> Procurando o sinal do GPS…
                            </div>
                        ) : gps ? (
                            <div className="flex items-center justify-between gap-2 bg-mint/50 border border-primary/30 rounded-lg px-3 py-2.5">
                                <span className="text-[13px] font-semibold text-primaryDark flex items-center gap-1.5 min-w-0">
                                    <CheckCircle className="h-4 w-4 shrink-0" />
                                    <span className="truncate">Localização capturada</span>
                                </span>
                                <button onClick={capturarGps} className="text-primaryDark/70 hover:text-primaryDark p-1.5 shrink-0" title="Pegar de novo">
                                    <RefreshCw className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <button
                                    onClick={capturarGps}
                                    className="w-full px-4 py-3 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] flex items-center justify-center gap-2"
                                >
                                    <MapPin className="h-4 w-4" /> Pegar minha localização
                                </button>
                                {erroGps && <p className="text-[11px] text-amber-700">{erroGps}</p>}
                            </div>
                        )}
                        <p className="text-[11px] text-gray-500 mt-1.5">
                            {semPontoNoCadastro
                                ? 'Este destinatário ainda não tem ponto no cadastro — sua localização vira o ponto dele.'
                                : 'Serve para conferir se o ponto do cadastro está no lugar certo.'}
                        </p>
                    </div>

                    {/* Observação da entrega */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1.5">
                            Observação da entrega <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            maxLength={1000}
                            rows={3}
                            placeholder="Ex.: deixei com o gerente; pediu para o vendedor passar na sexta"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">O vendedor que pediu a amostra vê esse recado.</p>
                    </div>
                </div>

                {/* Ações */}
                <div className="border-t border-gray-200 p-3 flex gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={enviando}
                        className="px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={confirmar}
                        disabled={enviando}
                        className="flex-1 px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        {enviando ? 'Registrando…' : 'Confirmar entrega'}
                    </button>
                </div>
            </div>
        </div>
    );
}
