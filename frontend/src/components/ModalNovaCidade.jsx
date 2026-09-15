import React, { useEffect, useRef, useState } from 'react';
import { MapPin, X, Loader2, AlertTriangle, Lightbulb } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SelectBusca from './SelectBusca';
import cidadeService, { UFS, podeCriarCidade } from '../services/cidadeService';
import { normalizarCidade, chaveBusca } from '../utils/cidade';

// Modal "Cadastrar nova cidade" — passo explícito para uma cidade entrar na lista oficial.
//
//   <ModalNovaCidade aberto nomeInicial="itapua" ufInicial="SC"
//       onCriada={(cidade) => ...}        // { id, nome, uf } — criada OU escolhida ("Usar esta")
//       onFechar={() => ...} />
//
// · ao abrir chama GET /cidades/sugestoes e mostra "Você quis dizer Itapoá?" com "Usar esta"
//   (não cria nada) e "Cadastrar mesmo assim" (envia confirmarParecida:true);
// · 409 CIDADE_JA_EXISTE → seleciona a existente (se estiver inativa oferece reativar);
// · 409 CIDADE_PARECIDA → mostra as sugestões do backend e pede confirmação;
// · sem permissão (admin || clientes.edit || rota.edit — igual ao backend) → aviso para
//   pedir ao escritório; só dá para usar uma sugestão existente.

const ModalNovaCidade = ({ aberto, nomeInicial = '', ufInicial = 'SC', onCriada, onFechar }) => {
    const { user } = useAuth();
    const podeCriar = podeCriarCidade(user?.permissoes);
    const [nome, setNome] = useState('');
    const [uf, setUf] = useState('SC');
    const [sugestoes, setSugestoes] = useState([]);
    const [buscandoSug, setBuscandoSug] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const [precisaConfirmar, setPrecisaConfirmar] = useState(false); // backend respondeu CIDADE_PARECIDA
    const [inativa, setInativa] = useState(null); // { id, nome, uf } quando já existe inativa
    const inputRef = useRef(null);

    useEffect(() => {
        if (!aberto) return;
        setNome(normalizarCidade(nomeInicial || '') || '');
        setUf((ufInicial || 'SC').toUpperCase());
        setSugestoes([]); setErro(''); setPrecisaConfirmar(false); setInativa(null); setSalvando(false);
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [aberto, nomeInicial, ufInicial]);

    // Sugestões de parecidas conforme o nome muda (com um pequeno atraso).
    useEffect(() => {
        if (!aberto) return;
        const n = nome.trim();
        if (n.length < 3) { setSugestoes([]); return; }
        let vivo = true;
        setBuscandoSug(true);
        const t = setTimeout(() => {
            cidadeService.sugestoes(n)
                .then(s => { if (vivo) setSugestoes(s); })
                .catch(() => { if (vivo) setSugestoes([]); })
                .finally(() => { if (vivo) setBuscandoSug(false); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [aberto, nome]);

    if (!aberto) return null;

    const nomeFinal = normalizarCidade(nome.trim()) || '';
    const igualExistente = sugestoes.find(s => chaveBusca(s.nome) === chaveBusca(nomeFinal));
    const parecidas = sugestoes.filter(s => chaveBusca(s.nome) !== chaveBusca(nomeFinal));

    const usarExistente = (c) => { onCriada?.({ id: c.id, nome: c.nome, uf: c.uf || null }); onFechar?.(); };

    const cadastrar = async (confirmarParecida = false) => {
        if (!nomeFinal) { setErro('Informe o nome da cidade.'); return; }
        if (!uf) { setErro('Escolha a UF.'); return; }
        if (igualExistente) { usarExistente(igualExistente); return; }
        setSalvando(true); setErro('');
        try {
            const r = await cidadeService.criar({ nome: nomeFinal, uf, confirmarParecida });
            const c = r?.cidade || r;
            onCriada?.({ id: c.id, nome: c.nome || nomeFinal, uf: c.uf || uf });
            onFechar?.();
        } catch (e) {
            const d = e.response?.data;
            if (d?.codigo === 'CIDADE_JA_EXISTE' && d.cidade) {
                if (d.cidade.ativo === false) { setInativa(d.cidade); setErro(`"${d.cidade.nome}" já existe, mas está inativa.`); }
                else usarExistente(d.cidade);
            } else if (d?.codigo === 'CIDADE_PARECIDA') {
                setPrecisaConfirmar(true);
                if (Array.isArray(d.sugestoes) && d.sugestoes.length) setSugestoes(d.sugestoes);
                setErro('Existe uma cidade parecida. Confira antes de cadastrar.');
            } else if (e.response?.status === 403) {
                setErro('Você não tem permissão para cadastrar cidades. Peça ao escritório.');
            } else {
                setErro(d?.error || d?.erro || 'Não foi possível cadastrar a cidade.');
            }
        } finally {
            setSalvando(false);
        }
    };

    const reativar = async () => {
        if (!inativa?.id) return;
        setSalvando(true);
        try {
            const r = await cidadeService.reativar(inativa.id);
            const c = r?.cidade || inativa;
            usarExistente({ id: c.id, nome: c.nome, uf: c.uf });
        } catch (e) {
            setErro(e.response?.data?.error || 'Não foi possível reativar.');
        } finally { setSalvando(false); }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar?.(); }}>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-1.5 rounded-lg"><MapPin className="h-4 w-4 text-primary" /></div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">Cadastrar nova cidade</p>
                            <p className="text-[11px] text-gray-500">Entra na lista oficial para todo o app</p>
                        </div>
                    </div>
                    <button type="button" onClick={onFechar} className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto">
                    {!podeCriar && (
                        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>Você não tem permissão para cadastrar cidade nova. <b>Peça ao escritório</b> para cadastrar "{nomeFinal || nomeInicial}" — enquanto isso, escolha uma cidade da lista.</span>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da cidade</label>
                            <input ref={inputRef} value={nome} onChange={e => { setNome(e.target.value); setPrecisaConfirmar(false); setInativa(null); setErro(''); }}
                                disabled={!podeCriar}
                                placeholder="Ex.: Itapoá"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[44px] md:min-h-0 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-50" />
                            {nomeFinal && nomeFinal !== nome.trim() && (
                                <p className="text-[11px] text-gray-500 mt-1">Será gravada como <b className="text-gray-700">{nomeFinal}</b></p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                            <SelectBusca value={uf} onChange={e => setUf(e.target.value)} className="w-full" disabled={!podeCriar}>
                                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                            </SelectBusca>
                        </div>
                    </div>

                    {(buscandoSug || sugestoes.length > 0) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 flex items-center gap-1.5 mb-2">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                {igualExistente ? 'Esta cidade já existe' : 'Você quis dizer…?'}
                                {buscandoSug && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                            </p>
                            <div className="space-y-1.5">
                                {(igualExistente ? [igualExistente] : parecidas).map(s => (
                                    <div key={s.id || s.nome} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                        <span className="text-sm text-gray-900 truncate"><b>{s.nome}</b>{s.uf ? <span className="text-gray-500"> · {s.uf}</span> : null}</span>
                                        <button type="button" onClick={() => usarExistente(s)}
                                            className="shrink-0 px-3 py-1.5 min-h-[36px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs">Usar esta</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {erro && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{erro}</span>
                        </div>
                    )}
                    {inativa && podeCriar && (
                        <button type="button" onClick={reativar} disabled={salvando}
                            className="w-full px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                            Reativar "{inativa.nome}" e usar
                        </button>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                    <button type="button" onClick={onFechar} className="px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full">Cancelar</button>
                    {podeCriar && !igualExistente && (
                        <button type="button" onClick={() => cadastrar(precisaConfirmar || parecidas.length > 0)} disabled={salvando || !nomeFinal || !uf}
                            className="px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                            {(precisaConfirmar || parecidas.length > 0) ? 'Cadastrar mesmo assim' : 'Cadastrar'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModalNovaCidade;
