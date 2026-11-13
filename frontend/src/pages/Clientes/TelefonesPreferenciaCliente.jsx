import { useCallback, useEffect, useState } from 'react';
import { Phone, ArrowUp, ArrowDown, Loader2, Star, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../services/clienteService';

// ─────────────────────────────────────────────────────────────────────────────
// Ordem dos telefones para o WhatsApp (nov/2026, pedido do Clarkson).
// O 1º número válido é o PREFERIDO: a Ana chama primeiro nele; se o cliente não responder no prazo,
// passa para o próximo. O número que respondeu fica marcado como "Respondeu" e a Ana começa por ele.
// Número com DDD + número é usado como está (o 55 entra na hora do envio). Número sem DDD ou com
// dígitos errados aparece como "Incompleto" e vai para "Cadastros pra acertar".
// ─────────────────────────────────────────────────────────────────────────────

const ROTULO_FONTE = {
    celular: 'Celular', whatsapp: 'WhatsApp do cadastro', telefone: 'Telefone', comercial: 'Comercial', contato: 'Pessoa do WhatsApp',
};

function formatar(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(raw || '');
}

const msgErro = (e, padrao) => e?.response?.data?.error || padrao;

export default function TelefonesPreferenciaCliente({ clienteId, podeEditar }) {
    const [dados, setDados] = useState(null);
    const [ordem, setOrdem] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(false);
        try {
            const r = await clienteService.listarTelefones(clienteId);
            setDados(r);
            setOrdem(r?.telefones || []);
        } catch {
            setErro(true);
        } finally {
            setCarregando(false);
        }
    }, [clienteId]);

    useEffect(() => { carregar(); }, [carregar]);

    const mover = (i, delta) => {
        const j = i + delta;
        if (j < 0 || j >= ordem.length) return;
        const nova = [...ordem];
        [nova[i], nova[j]] = [nova[j], nova[i]];
        setOrdem(nova);
    };

    const mudou = dados && ordem.map((t) => t.chave).join('|') !== (dados.telefones || []).map((t) => t.chave).join('|');
    const preferidoLocal = ordem.find((t) => t.valido)?.chave;

    const salvar = async () => {
        if (salvando) return;
        setSalvando(true);
        try {
            const r = await clienteService.ordenarTelefones(clienteId, ordem.map((t) => t.bruto));
            setDados(r);
            setOrdem(r?.telefones || []);
            toast.success('Ordem dos telefones salva.');
        } catch (e) {
            toast.error(msgErro(e, 'Não foi possível salvar a ordem agora.'));
        } finally {
            setSalvando(false);
        }
    };

    if (!carregando && !erro && ordem.length === 0) return null; // sem telefone: nada para ordenar

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Ordem dos telefones no WhatsApp</span>
            </div>
            <div className="p-5">
                <p className="text-sm text-gray-600 mb-4">
                    A Ana chama primeiro o número de cima. Se o cliente não responder, ela tenta o próximo. Número com DDD já serve — não precisa digitar o 55.
                </p>
                {carregando && <p className="text-sm text-gray-500">Carregando telefones…</p>}
                {erro && (
                    <div className="text-sm text-gray-600">
                        Não foi possível carregar os telefones.
                        <button type="button" onClick={carregar} className="ml-2 text-primary font-semibold min-h-[44px]">Tentar de novo</button>
                    </div>
                )}
                {!carregando && !erro && (
                    <>
                        <ul className="space-y-2">
                            {ordem.map((t, i) => (
                                <li key={t.chave} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                                    <span className="text-sm font-semibold text-gray-500 w-6 text-center">{i + 1}º</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-gray-900">{formatar(t.bruto)}</span>
                                            {t.chave === preferidoLocal && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-mint text-primaryDark"><Star className="h-3 w-3" /> Preferido</span>
                                            )}
                                            {t.funcionando && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Respondeu</span>
                                            )}
                                            {!t.valido && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="h-3 w-3" /> Incompleto: {t.rotuloMotivo}</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {[...(t.fontes || []).map((f) => ROTULO_FONTE[f] || f), ...(t.pessoas || []).filter(Boolean)].join(' · ')}
                                        </p>
                                    </div>
                                    {podeEditar && ordem.length > 1 && (
                                        <div className="flex gap-1">
                                            <button type="button" aria-label="Subir" disabled={i === 0 || salvando} onClick={() => mover(i, -1)}
                                                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"><ArrowUp className="h-4 w-4" /></button>
                                            <button type="button" aria-label="Descer" disabled={i === ordem.length - 1 || salvando} onClick={() => mover(i, 1)}
                                                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"><ArrowDown className="h-4 w-4" /></button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {podeEditar && mudou && (
                            <div className="flex gap-3 mt-4">
                                <button type="button" onClick={() => setOrdem(dados.telefones || [])} disabled={salvando}
                                    className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">Desfazer</button>
                                <button type="button" onClick={salvar} disabled={salvando}
                                    className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px] disabled:opacity-60 flex items-center gap-2">
                                    {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {salvando ? 'Salvando…' : 'Salvar ordem'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
