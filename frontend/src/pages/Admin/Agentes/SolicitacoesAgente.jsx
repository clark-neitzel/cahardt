import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ExternalLink, AlertTriangle, Loader2, Inbox } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import PageHeader from '../../../components/PageHeader';
import EstadoVazio from '../../../components/EstadoVazio';
import SelectBusca from '../../../components/SelectBusca';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { avisarSolicitacoesMudaram, useContagemSolicitacoesAgente } from '../../../hooks/useSolicitacoesAgente';
import { useDecisaoSolicitacao } from '../../../hooks/useDecisaoSolicitacao';
import { CartaoSolicitacao, rotaSegura } from '../../../components/Agentes/CartaoSolicitacao';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { BtnSecundario } from './ModalBase';
import { resumoLimpo, SELECT_TOQUE } from './util';


const PILULAS = [
    { v: 'PENDENTE', t: 'Pendentes' },
    { v: 'EXECUTANDO', t: 'Executando' },
    { v: 'AUTORIZADA', t: 'Autorizadas' },
    { v: 'RECUSADA', t: 'Recusadas' },
    { v: 'ERRO', t: 'Com erro' },
    { v: 'ERRO_INDETERMINADO', t: 'Resultado incerto' },
    { v: 'EXPIRADA', t: 'Expiradas' },
];

const POR_PAGINA = 20;

function Conteudo() {
    const navigate = useNavigate();
    const [filtros, setFiltros] = useFiltrosSalvos('solicitacoes-agente', { status: 'PENDENTE', agenteId: '' });
    const status = filtros.status || 'PENDENTE';
    const agenteId = filtros.agenteId || '';

    const [lista, setLista] = useState({ itens: [], total: 0, pagina: 1, carregando: true, erro: '' });
    const [recentes, setRecentes] = useState({}); // id -> item decidido agora (continua à vista com o resultado)
    const [agentes, setAgentes] = useState([]);
    const [agora, setAgora] = useState(() => Date.now());
    const contagem = useContagemSolicitacoesAgente(true);

    const montado = useRef(true);
    useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

    // Só a resposta da requisição MAIS RECENTE vale: uma resposta atrasada de outro filtro/recarga nunca sobrescreve a lista.
    const reqRef = useRef(0);
    const paginaRef = useRef(1);
    paginaRef.current = lista.pagina;

    const carregar = useCallback(async ({ ate = 1, silencioso = false, limpar = false } = {}) => {
        reqRef.current += 1;
        const meu = reqRef.current;
        if (!silencioso) setLista((l) => ({ ...l, ...(limpar ? { itens: [], total: 0, pagina: 1 } : {}), carregando: true, erro: '' }));
        try {
            let itens = []; let total = 0;
            for (let pg = 1; pg <= ate; pg += 1) {
                const r = await agenteService.solicitacoes({ status, ...(agenteId ? { agenteId } : {}), page: pg, limit: POR_PAGINA });
                if (meu !== reqRef.current) return; // chegou outra requisição depois desta: descarta
                const dados = r.data || r.itens || [];
                itens = itens.concat(dados);
                total = r.total ?? itens.length;
                if (itens.length >= total || dados.length === 0) break;
            }
            if (!montado.current || meu !== reqRef.current) return;
            setLista({ itens, total, pagina: ate, carregando: false, erro: '' });
            setAgora(Date.now());
        } catch (e) {
            if (!montado.current || meu !== reqRef.current) return;
            if (silencioso) return; // falha do recarregamento automático: mantém o que está na tela
            setLista((l) => ({ ...l, carregando: false, erro: mensagemErro(e, 'Não foi possível carregar as solicitações.') }));
        }
    }, [status, agenteId]);

    // troca de filtro: volta para a página 1 e limpa os "decididos agora"
    useEffect(() => { setRecentes({}); carregar({ ate: 1, limpar: true }); }, [carregar]);

    // lista de agentes (filtro só aparece com 2 ou mais)
    useEffect(() => { agenteService.listar().then((r) => { if (montado.current && Array.isArray(r)) setAgentes(r); }).catch(() => {}); }, []);

    const temExecutando = status === 'EXECUTANDO' || lista.itens.some((i) => i.status === 'EXECUTANDO') || Object.values(recentes).some((i) => i.status === 'EXECUTANDO');

    // relógio dos prazos (30 s) + recarga silenciosa a cada 60 s nos pendentes; a cada 8 s enquanto algo está EXECUTANDO
    useEffect(() => {
        const relogio = setInterval(() => { if (document.visibilityState === 'visible') setAgora(Date.now()); }, 30000);
        const recarga = setInterval(() => {
            if (document.visibilityState === 'visible' && status === 'PENDENTE') carregar({ ate: paginaRef.current, silencioso: true });
        }, 60000);
        return () => { clearInterval(relogio); clearInterval(recarga); };
    }, [carregar, status]);
    useEffect(() => {
        if (!temExecutando) return undefined;
        const t = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            carregar({ ate: paginaRef.current, silencioso: true });
            avisarSolicitacoesMudaram();
        }, 8000);
        return () => clearInterval(t);
    }, [temExecutando, carregar]);

    const recarregarSilencioso = () => { carregar({ ate: paginaRef.current, silencioso: true }); avisarSolicitacoesMudaram(); };

    const registrarDecidido = (novo) => {
        setRecentes((r) => ({ ...r, [novo.id]: novo }));
        setLista((l) => ({ ...l, itens: l.itens.map((i) => (i.id === novo.id ? novo : i)) }));
        avisarSolicitacoesMudaram();
    };

    // Autorizar / recusar / repetir (com as travas) — o mesmo fluxo do Chat do Luke (hooks/useDecisaoSolicitacao.jsx)
    const decisao = useDecisaoSolicitacao({
        aoDecidir: registrarDecidido,
        // ação deu erro: o item deixa de aparecer como "decidido agora" e a lista é recarregada do servidor
        aoFalhar: (item) => { setRecentes((r) => { if (!r[item.id]) return r; const n = { ...r }; delete n[item.id]; return n; }); recarregarSilencioso(); },
        aoRecarregar: recarregarSilencioso,
    });
    const { avisoIncerto, setAvisoIncerto, liberaEm, abrirTela } = decisao;

    const visiveis = useMemo(() => {
        if (status !== 'PENDENTE') return lista.itens;
        const ids = new Set(lista.itens.map((i) => i.id));
        const soRecentes = Object.values(recentes).filter((r) => !ids.has(r.id));
        return [...soRecentes, ...lista.itens.map((i) => recentes[i.id] || i)];
    }, [lista.itens, recentes, status]);

    const vazioTitulo = { PENDENTE: 'Nenhuma solicitação pendente', EXECUTANDO: 'Nenhuma ação em execução agora', AUTORIZADA: 'Nenhuma solicitação autorizada', RECUSADA: 'Nenhuma solicitação recusada', ERRO: 'Nenhuma solicitação com erro', ERRO_INDETERMINADO: 'Nenhuma solicitação com resultado incerto', EXPIRADA: 'Nenhuma solicitação expirada' }[status];

    return (
        <div className="max-w-full overflow-x-hidden pb-6">
            <PageHeader
                icon={ShieldCheck}
                cor="amber"
                titulo="Solicitações dos agentes"
                subtitulo={contagem.pendentes > 0 ? `${contagem.pendentes} esperando sua decisão` : 'O que o agente de IA pede e só faz com a sua autorização'}
            />
            <div className="px-3 md:px-6 space-y-4">
                {avisoIncerto && (
                    <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 space-y-2" role="alert" data-testid="aviso-incerto">
                        <div className="flex gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{avisoIncerto.texto}</span></div>
                        <p className="pl-6">{avisoIncerto.item.rotulo || avisoIncerto.item.chave}{resumoLimpo(avisoIncerto.item) ? ` — ${resumoLimpo(avisoIncerto.item)}` : ''}</p>
                        <div className="flex flex-wrap gap-2 pl-6">
                            {avisoIncerto.item.telaDestino && rotaSegura(avisoIncerto.item.telaDestino.rota) && (
                                <BtnSecundario onClick={() => navigate(avisoIncerto.item.telaDestino.rota)} className="inline-flex items-center gap-1.5"><ExternalLink className="h-4 w-4" />Abrir tela{avisoIncerto.item.telaDestino.rotulo ? `: ${avisoIncerto.item.telaDestino.rotulo}` : ''}</BtnSecundario>
                            )}
                            <button type="button" onClick={() => setAvisoIncerto(null)} className="min-h-[44px] px-3 underline font-medium">Entendi</button>
                        </div>
                    </div>
                )}

                {contagem.comErro > 0 && status !== 'ERRO' && status !== 'ERRO_INDETERMINADO' && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900" data-testid="aviso-erro">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="min-w-0">{contagem.comErro} solicitação(ões) terminou com erro ou resultado incerto.</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 pl-6 sm:pl-0">
                            <button type="button" onClick={() => setFiltros({ ...filtros, status: 'ERRO_INDETERMINADO' })} className="min-h-[44px] underline font-medium">Ver incertas</button>
                            <button type="button" onClick={() => setFiltros({ ...filtros, status: 'ERRO' })} className="min-h-[44px] underline font-medium">Ver com erro</button>
                        </div>
                    </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex flex-wrap gap-2 flex-1" role="tablist" aria-label="Filtrar por situação">
                        {PILULAS.map((p) => {
                            const ativa = status === p.v;
                            return (
                                <button
                                    key={p.v}
                                    type="button"
                                    role="tab"
                                    aria-selected={ativa}
                                    onClick={() => setFiltros({ ...filtros, status: p.v })}
                                    className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border ${ativa ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    {p.t}{p.v === 'PENDENTE' && contagem.pendentes > 0 ? ` (${contagem.pendentes})` : ''}
                                </button>
                            );
                        })}
                    </div>
                    {agentes.length > 1 && (
                        <SelectBusca value={agenteId} onChange={(e) => setFiltros({ ...filtros, agenteId: e.target.value })} className={`w-full md:w-56 ${SELECT_TOQUE}`}>
                            <option value="">Todos os agentes</option>
                            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </SelectBusca>
                    )}
                </div>

                {lista.carregando && visiveis.length === 0 && <div className="py-10 text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>}
                {lista.erro && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex flex-wrap items-center gap-3" role="alert">
                        <span className="flex-1 min-w-0">{lista.erro}</span>
                        <button type="button" onClick={() => carregar({ ate: 1 })} className="min-h-[44px] px-4 rounded-full border border-red-300 bg-white text-red-700 font-medium">Tentar de novo</button>
                    </div>
                )}
                {!lista.carregando && !lista.erro && visiveis.length === 0 && (
                    <EstadoVazio icon={Inbox} titulo={vazioTitulo} descricao={status === 'PENDENTE' ? 'Quando o agente pedir algo que precisa da sua autorização, aparece aqui.' : 'Nada com esta situação por enquanto.'} />
                )}

                <div className="grid grid-cols-1 gap-3" data-testid="lista-solicitacoes">
                    {visiveis.map((item) => (
                        <CartaoSolicitacao
                            key={item.id}
                            item={item}
                            agora={agora}
                            liberaEm={liberaEm[item.id]}
                            onAbrirTela={abrirTela}
                            onAutorizar={decisao.pedirAutorizar}
                            onRecusar={decisao.pedirRecusar}
                            onRepetir={decisao.pedirRepetir}
                        />
                    ))}
                </div>

                {lista.itens.length < lista.total && (
                    <button type="button" onClick={() => carregar({ ate: lista.pagina + 1 })} disabled={lista.carregando} className="w-full min-h-[44px] rounded-full border border-primary text-primary font-medium text-sm hover:bg-mint/40">
                        {lista.carregando ? 'Carregando…' : `Carregar mais (${lista.total - lista.itens.length} restantes)`}
                    </button>
                )}
            </div>

            {decisao.modais}
        </div>
    );
}

// Porta de entrada: só admin. Não-admin que digita a URL vê o aviso e NENHUMA chamada à API é feita.
export default function SolicitacoesAgente() {
    const { user } = useAuth();
    if (!user?.permissoes?.admin) {
        return <div className="p-8 text-center text-red-600 font-bold" data-testid="sem-permissao">Sem permissão. Esta tela é só para administradores.</div>;
    }
    return <Conteudo />;
}
