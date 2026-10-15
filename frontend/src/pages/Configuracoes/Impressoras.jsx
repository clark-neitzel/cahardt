import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import impressaoService from '../../services/impressaoService';
import AgenteCard from './impressoras/AgenteCard';
import ImpressorasCard from './impressoras/ImpressorasCard';
import FilaImpressao from './impressoras/FilaImpressao';
import { erroDe } from './impressoras/comuns';

// Configurações → Impressoras (/config/impressoras) — só admin (mesmo critério do backend).
// Impressão direta das etiquetas: o app grava na fila e o agente no PC da cozinha imprime.
// Contrato: docs/etiquetas-cozinha/PLANO-ARQUITETO.md §2.3.
const Impressoras = () => {
    const { user } = useAuth();
    const isAdmin = !!user?.permissoes?.admin;
    const [agentes, setAgentes] = useState([]);
    const [impressoras, setImpressoras] = useState([]);
    const [fila, setFila] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [filtros, setFiltros] = useFiltrosSalvos('impressoras:fila', { status: 'TODOS' });
    const filtrosRef = useRef(filtros);
    filtrosRef.current = filtros;

    const seq = useRef(0);
    const carregar = useCallback(async () => {
        const minha = ++seq.current;
        try {
            const [a, i, f] = await Promise.all([
                impressaoService.listarAgentes(),
                impressaoService.listarImpressoras(),
                impressaoService.listarFila(filtrosRef.current.status),
            ]);
            if (minha !== seq.current) return; // chegou uma chamada mais nova: ignora esta resposta velha
            setAgentes(Array.isArray(a) ? a : (a?.agentes || []));
            setImpressoras(Array.isArray(i) ? i : (i?.impressoras || []));
            setFila(Array.isArray(f) ? f : (f?.trabalhos || f?.fila || []));
            setErro(null);
        } catch (e) {
            if (minha !== seq.current) return;
            setErro(erroDe(e, 'Não foi possível carregar as impressoras.'));
        } finally { setCarregando(false); }
    }, []);

    // Carrega ao abrir e quando muda o filtro; atualiza a cada 5 s só com a aba visível.
    useEffect(() => { if (isAdmin) carregar(); }, [isAdmin, carregar, filtros.status]);
    useEffect(() => {
        if (!isAdmin) return undefined;
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 5000);
        const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
    }, [isAdmin, carregar]);

    if (!isAdmin) return <div className="p-8 text-center text-red-600 font-bold">Acesso restrito ao administrador.</div>;

    return (
        <div className="max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="bg-mint p-1.5 md:p-2 rounded-lg"><Printer className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                <div className="min-w-0">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900">Impressoras</h1>
                    <p className="text-xs md:text-sm text-gray-500">Impressão direta de etiquetas, sem janela de impressão.</p>
                </div>
            </div>
            <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-6xl">
                {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center justify-between gap-2">
                    <span>{erro}</span><button type="button" className="font-semibold underline min-h-[44px] px-2" onClick={carregar}>Tentar de novo</button></div>}
                {carregando ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
                ) : (
                    <>
                        <AgenteCard agentes={agentes} onRecarregar={carregar} />
                        <ImpressorasCard impressoras={impressoras} agentes={agentes} onRecarregar={carregar} />
                        <FilaImpressao fila={fila} impressoras={impressoras} onRecarregar={carregar} filtros={filtros} setFiltros={setFiltros} />
                    </>
                )}
            </div>
        </div>
    );
};

export default Impressoras;
