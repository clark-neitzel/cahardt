import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import agenteService, { mensagemErro } from '../../services/agenteService';
import { avisarSolicitacoesMudaram } from '../../hooks/useSolicitacoesAgente';
import { CartaoSolicitacao } from '../Agentes/CartaoSolicitacao';

// Aba "Autorizações" (só administrador): os pedidos PENDENTES de todos os agentes, com o MESMO cartão e as MESMAS
// travas da tela Admin → Solicitações dos agentes (que continua existindo para histórico, erro e "tentar de novo").
export default function AbaAutorizacoes({ ativa, aberto, decisao, versaoDecisao, onVerHistorico, onLista }) {
    const [lista, setLista] = useState({ itens: [], total: 0, carregando: true, erro: '' });
    const [recentes, setRecentes] = useState({}); // id -> item decidido agora (continua à vista com o resultado)
    const [agora, setAgora] = useState(() => Date.now());
    const reqRef = useRef(0);
    const montado = useRef(true);
    useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

    const carregar = useCallback(async ({ silencioso = false } = {}) => {
        reqRef.current += 1;
        const meu = reqRef.current;
        if (!silencioso) setLista((l) => ({ ...l, carregando: true, erro: '' }));
        try {
            const r = await agenteService.solicitacoes({ status: 'PENDENTE', page: 1, limit: 20 });
            if (!montado.current || meu !== reqRef.current) return;
            const itens = r.data || r.itens || [];
            setLista({ itens, total: r.total ?? itens.length, carregando: false, erro: '' });
            setAgora(Date.now());
        } catch (e) {
            if (!montado.current || meu !== reqRef.current) return;
            if (silencioso) return;
            setLista((l) => ({ ...l, carregando: false, erro: mensagemErro(e, 'Não foi possível carregar os pedidos.') }));
        }
    }, []);

    // carrega ao abrir a aba; recarrega a cada 15 s (só aberta, visível e na aba certa)
    useEffect(() => {
        if (!(aberto && ativa)) return undefined;
        setRecentes({});
        carregar();
        const t = setInterval(() => { if (document.visibilityState === 'visible') carregar({ silencioso: true }); }, 15000);
        return () => clearInterval(t);
    }, [aberto, ativa, carregar]);
    useEffect(() => { if (versaoDecisao && ativa) carregar({ silencioso: true }); }, [versaoDecisao]); // eslint-disable-line react-hooks/exhaustive-deps

    // o dock registra como funções para a decisão atualizar ESTA lista
    useEffect(() => {
        onLista?.({
            decidido: (novo) => {
                setRecentes((r) => ({ ...r, [novo.id]: novo }));
                setLista((l) => ({ ...l, itens: l.itens.map((i) => (i.id === novo.id ? novo : i)) }));
                avisarSolicitacoesMudaram();
            },
            falhou: (item) => {
                setRecentes((r) => { if (!r[item.id]) return r; const n = { ...r }; delete n[item.id]; return n; });
                carregar({ silencioso: true });
                avisarSolicitacoesMudaram();
            },
            recarregar: () => { carregar({ silencioso: true }); avisarSolicitacoesMudaram(); },
        });
    }, [carregar, onLista]);

    const visiveis = useMemo(() => {
        const ids = new Set(lista.itens.map((i) => i.id));
        const soRecentes = Object.values(recentes).filter((r) => !ids.has(r.id));
        return [...soRecentes, ...lista.itens.map((i) => recentes[i.id] || i)];
    }, [lista.itens, recentes]);
    const aguardando = visiveis.filter((i) => i.status === 'PENDENTE').length;

    return (
        <div className="lk-painel" data-painel="autz" hidden={!ativa}>
            <div className="lk-sub"><b>Pedidos do Luke esperando você.</b> Autorize ou recuse aqui mesmo.</div>
            <div className="lk-rolagem" data-testid="luke-autorizacoes">
                {lista.carregando && visiveis.length === 0 && <div className="lk-vazio"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Carregando…</div>}
                {lista.erro && (
                    <div className="lk-vazio"><b>Não consegui carregar</b>{lista.erro}<br /><button type="button" className="lk-acao" style={{ marginTop: 10 }} onClick={() => carregar()}>Tentar de novo</button></div>
                )}
                {!lista.carregando && !lista.erro && aguardando === 0 && <div className="lk-az-vazio">Nada esperando sua autorização 🎉</div>}
                <div className="lk-az-lista">
                    {visiveis.map((item) => (
                        <CartaoSolicitacao
                            key={item.id} item={item} agora={agora} compacto liberaEm={decisao.liberaEm[item.id]}
                            onAbrirTela={decisao.abrirTela} onAutorizar={decisao.pedirAutorizar}
                            onRecusar={decisao.pedirRecusar} onRepetir={decisao.pedirRepetir}
                        />
                    ))}
                </div>
                {lista.total > lista.itens.length && <p className="lk-sub" style={{ border: 0, textAlign: 'center' }}>Mostrando {lista.itens.length} de {lista.total}. Os demais estão em "Ver histórico completo".</p>}
                <button type="button" className="lk-az-hist" onClick={onVerHistorico}>Ver histórico completo</button>
            </div>
        </div>
    );
}
