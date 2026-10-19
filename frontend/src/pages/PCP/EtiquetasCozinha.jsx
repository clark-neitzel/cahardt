import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, Search, Loader2, Check, AlertTriangle, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import etiquetaCozinhaService from '../../services/etiquetaCozinhaService';
import BlocoItem from './cozinha/BlocoItem';
import GavetaEtiqueta from './cozinha/GavetaEtiqueta';
import HojeNaCozinha from './cozinha/HojeNaCozinha';
import useEnvioEtiqueta from './cozinha/useEnvioEtiqueta';
import { CORES_DIA, DIAS_EXTENSO, diaSemana, dm, hojeIso, norm } from './cozinha/util';

const ABAS = [
    { id: 'fav', rotulo: '⭐ Favoritos' },
    { id: 'RECHEIO', rotulo: '🥣 Recheios' },
    { id: 'MASSA', rotulo: '🫓 Massas' },
    { id: 'OUTRO', rotulo: '🧅 Outros' },
    { id: 'todos', rotulo: 'Todos' },
];

const lista = (r, ...chaves) => {
    if (Array.isArray(r)) return r;
    for (const c of chaves) if (Array.isArray(r?.[c])) return r[c];
    return [];
};

export default function EtiquetasCozinha() {
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    // Mesma regra do backend: admin OU pcp.etiquetas (objeto de permissões, nunca !!perms.pcp)
    const permitido = !!perms.admin || !!perms.pcp?.etiquetas;

    const [aba, setAba] = useFiltroSalvo('etiquetas-cozinha:aba', 'fav');
    const [busca, setBusca] = useState('');
    const [itens, setItens] = useState([]);
    const [favIds, setFavIds] = useState([]);
    const [equipe, setEquipe] = useState([]);
    const [impressoras, setImpressoras] = useState(null);
    const [hoje, setHoje] = useState({ lotes: [], totais: { etiquetas: 0, lotes: 0 } });
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState('');
    const [carregandoHoje, setCarregandoHoje] = useState(true);
    const [gaveta, setGaveta] = useState(null); // item | { novo:true, nome } | null
    const hojeData = hojeIso();
    const diaHoje = diaSemana(hojeData);

    const carregarHoje = useCallback(async () => {
        try {
            const r = await etiquetaCozinhaService.hoje(hojeIso());
            const lotes = lista(r, 'lotes', 'itens');
            const t = r?.totais || {};
            setHoje({
                lotes,
                totais: {
                    etiquetas: t.etiquetas ?? lotes.reduce((s, l) => s + (Number(l.quantidade) || 0), 0),
                    lotes: t.lotes ?? lotes.length,
                },
            });
        } catch { /* mantém o que já tinha */ } finally { setCarregandoHoje(false); }
    }, []);

    // Itens + favoritos (relido depois de cada impressão: "lembra o tamanho", item digitado em Outros)
    const carregarItens = useCallback(async (primeira) => {
        try {
            const [it, fav, eq] = await Promise.all([
                etiquetaCozinhaService.itens({ grupo: 'TODOS' }),
                etiquetaCozinhaService.favoritos().catch(() => null),
                primeira ? etiquetaCozinhaService.equipe().catch(() => []) : Promise.resolve(null),
            ]);
            setItens(lista(it, 'itens'));
            if (fav) setFavIds(lista(fav, 'itens', 'favoritos').map(f => String(f.itemPcpId ?? f.id)));
            if (eq) setEquipe(lista(eq, 'equipe', 'pessoas'));
            setErroCarga('');
        } catch (e) {
            if (primeira) setErroCarga(e?.response?.data?.error || 'Não foi possível carregar os itens da cozinha. Toque em Tentar de novo.');
        } finally { if (primeira) setCarregando(false); }
    }, []);

    const envio = useEnvioEtiqueta({
        onTerminou: (evento) => {
            carregarHoje();
            if (evento === 'criado') carregarItens(false);
        },
    });

    useEffect(() => {
        if (!permitido) return undefined;
        let vivo = true;
        carregarItens(true);
        // Admin recebe TODAS as impressoras (inclusive inativas); não-admin só as ativas (sem o campo `ativa`)
        etiquetaCozinhaService.impressoras().then(r => { if (vivo) setImpressoras(lista(r, 'impressoras').filter(i => i.ativa !== false)); }).catch(() => { if (vivo) setImpressoras(null); });
        carregarHoje();
        return () => { vivo = false; };
    }, [permitido, carregarHoje, carregarItens]);

    // Atualiza "Hoje na cozinha" enquanto houver etiqueta na fila
    const temPendente = hoje.lotes.some(l => l.statusImpressao === 'PENDENTE' || l.statusImpressao === 'ENVIANDO');
    useEffect(() => {
        if (!permitido || !temPendente) return undefined;
        const t = setInterval(carregarHoje, 8000);
        return () => clearInterval(t);
    }, [permitido, temPendente, carregarHoje]);

    // Barra de status quando a gaveta está fechada (ex.: reimpressão ou envio em andamento)
    const saiuTimer = useRef(null);
    useEffect(() => {
        if (envio.fase === 'saiu') {
            toast.success('Saiu da impressora');
            if (gaveta) saiuTimer.current = setTimeout(() => { setGaveta(null); envio.limpar(); }, 1400);
            else saiuTimer.current = setTimeout(() => envio.limpar(), 2500);
        }
        return () => clearTimeout(saiuTimer.current);
    }, [envio.fase]); // eslint-disable-line react-hooks/exhaustive-deps

    const abrir = (item) => { envio.limpar(); setGaveta(item); };
    const fechar = () => { setGaveta(null); if (envio.fase === 'saiu' || envio.fase === 'erro') envio.limpar(); };

    const favSet = useMemo(() => new Set(favIds), [favIds]);
    const grupoDe = (i) => (i.grupoCozinha === 'RECHEIO' || i.grupoCozinha === 'MASSA' ? i.grupoCozinha : 'OUTRO');
    const contagem = useMemo(() => ({
        fav: itens.filter(i => favSet.has(String(i.id))).length,
        RECHEIO: itens.filter(i => grupoDe(i) === 'RECHEIO').length,
        MASSA: itens.filter(i => grupoDe(i) === 'MASSA').length,
        OUTRO: itens.filter(i => grupoDe(i) === 'OUTRO').length,
        todos: itens.length,
    }), [itens, favSet]);

    const visiveis = useMemo(() => {
        const q = norm(busca).trim();
        let base = itens;
        if (q) base = base.filter(i => norm(i.nome).includes(q)); // busca vale em todas as abas
        else if (aba === 'fav') base = base.filter(i => favSet.has(String(i.id)));
        else if (aba !== 'todos') base = base.filter(i => grupoDe(i) === aba);
        return [...base].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [itens, busca, aba, favSet]);

    // Quem solicita impressão sem gaveta (reimprimir)
    const loteTravado = (l) => {
        if (envio.ocupado) return true;
        if (l.statusImpressao === 'PENDENTE' || l.statusImpressao === 'ENVIANDO') return true;
        return envio.lote?.id === l.id && ['enviando', 'fila', 'imprimindo'].includes(envio.fase);
    };
    const reimprimir = (l) => {
        if (loteTravado(l)) return;
        envio.reimprimir(l, l.quantidade || 1, l.nomeImpresso);
    };

    if (!permitido) {
        return <div className="p-8 text-center text-red-600 font-bold">Acesso Negado a esta tela.</div>;
    }

    // Se a lista da equipe não carregou (rede), o usuário logado vira o responsável padrão
    const equipeEfetiva = equipe.length ? equipe : (user?.id ? [{ id: user.id, nome: user.nome || 'Eu' }] : []);
    const envioSemGaveta = !gaveta && envio.fase !== 'ocioso';

    return (
        <div className="max-w-5xl mx-auto max-w-full overflow-x-hidden pb-24">
            <div className="flex items-center justify-between gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-teal-100 p-1.5 md:p-2 rounded-lg shrink-0"><ChefHat className="h-5 w-5 text-teal-600" /></div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Etiquetas da Cozinha</h1>
                </div>
                <span className="shrink-0 rounded-full px-3 py-1 text-xs font-extrabold text-white capitalize" style={{ background: CORES_DIA[diaHoje], color: diaHoje === 2 ? '#2b230f' : '#fff' }}>
                    <span className="hidden sm:inline">{DIAS_EXTENSO[diaHoje]}</span><span className="sm:hidden">{DIAS_EXTENSO[diaHoje].slice(0, 3)}</span> · {dm(hojeData)}
                </span>
            </div>
            <div className="px-3 md:px-6 py-2 bg-white border-b border-gray-200 text-xs text-gray-600">
                Hoje: <b className="text-primaryDark">{hoje.totais.etiquetas}</b> etiquetas · <b className="text-primaryDark">{hoje.totais.lotes}</b> lotes
            </div>

            {envioSemGaveta && <BarraEnvio envio={envio} />}

            <div className="flex gap-2 px-3 md:px-6 pt-3 overflow-x-auto" role="tablist" style={{ scrollbarWidth: 'none' }}>
                {ABAS.map(a => (
                    <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                        className={`shrink-0 min-h-[48px] px-4 rounded-full border text-sm font-extrabold inline-flex items-center gap-1.5 ${aba === a.id ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700'}`}>
                        {a.rotulo}
                        <i className={`not-italic rounded-full px-2 text-xs ${aba === a.id ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-700'}`}>{contagem[a.id]}</i>
                    </button>
                ))}
            </div>

            <div className="px-3 md:px-6 pt-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar item pelo nome…"
                        aria-label="Buscar item"
                        className="w-full min-h-[48px] pl-10 pr-3 border border-gray-300 rounded-xl text-base bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </div>
            </div>

            <div className="px-3 md:px-6 pt-3">
                {carregando ? (
                    <div className="text-center py-12 text-gray-600"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Carregando itens…</div>
                ) : erroCarga ? (
                    <div className="text-center py-10">
                        <p className="text-red-700 font-semibold mb-3">{erroCarga}</p>
                        <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] px-5 rounded-full bg-primary text-white font-semibold text-sm">Tentar de novo</button>
                    </div>
                ) : (
                    <>
                        {!busca.trim() && aba === 'fav' && contagem.fav === 0 && (
                            <div className="mb-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-3">
                                Ainda não há favoritos. Os itens que você mais etiqueta aparecem aqui sozinhos.
                                <button type="button" onClick={() => setAba('todos')} className="ml-2 font-bold text-primary underline min-h-[44px]">Ver todos</button>
                            </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {visiveis.map(i => <BlocoItem key={i.id} item={i} favorito={favSet.has(String(i.id))} onClick={abrir} />)}
                            <button type="button" onClick={() => abrir({ novo: true, nome: busca.trim() })}
                                className="text-center rounded-2xl border-2 border-dashed border-gray-300 p-3 min-h-[96px] flex flex-col items-center justify-center gap-1 text-gray-700 hover:border-primary">
                                <span className="text-2xl" aria-hidden="true">✏️</span>
                                <span className="font-extrabold text-sm">Digitar</span>
                                <span className="text-xs text-gray-600">item sem cadastro</span>
                            </button>
                        </div>
                        {busca.trim() && visiveis.length === 0 && (
                            <p className="text-sm text-gray-600 mt-3">Nenhum item com “{busca.trim()}”. Toque em Digitar para criar.</p>
                        )}
                    </>
                )}
            </div>

            <div className="md:px-6">
                <HojeNaCozinha lotes={hoje.lotes} carregando={carregandoHoje} onReimprimir={reimprimir} bloqueado={loteTravado} />
            </div>

            {gaveta && (
                <GavetaEtiqueta
                    key={gaveta.id || 'novo'}
                    item={gaveta}
                    equipe={equipeEfetiva}
                    impressoras={impressoras}
                    envio={envio}
                    onImprimir={(payload, nome) => envio.enviar(payload, nome)}
                    onFechar={fechar}
                />
            )}
        </div>
    );
}

function BarraEnvio({ envio }) {
    const { fase, info, erro, lote } = envio;
    let cls = 'bg-gray-50 text-gray-700 border-gray-200';
    let icone = <Loader2 className="h-4 w-4 animate-spin shrink-0" />;
    let txt = 'Enviando…';
    if (fase === 'imprimindo') { txt = 'Imprimindo…'; cls = 'bg-mint/60 text-primaryDark border-primary/30'; }
    if (fase === 'fila') {
        txt = info.agenteOffline ? 'O computador da cozinha não responde. A etiqueta fica na fila por 15 minutos.' : (info.tentandoDeNovo ? 'A impressora deu problema, tentando de novo…' : 'Na fila, já vai sair…');
        if (info.agenteOffline) { cls = 'bg-amber-50 text-amber-800 border-amber-200'; icone = <AlertTriangle className="h-4 w-4 shrink-0" />; }
    }
    if (fase === 'saiu') { txt = 'Saiu da impressora.'; cls = 'bg-green-50 text-green-800 border-green-200'; icone = <Check className="h-4 w-4 shrink-0" />; }
    if (fase === 'erro') { txt = erro; cls = 'bg-red-50 text-red-700 border-red-200'; icone = <AlertTriangle className="h-4 w-4 shrink-0" />; }
    return (
        <div className={`mx-3 md:mx-6 mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center gap-2 ${cls}`} role="status">
            {icone}
            <span className="flex-1 min-w-0 break-words">{txt}{lote?.lote ? ` (lote ${lote.lote})` : ''}</span>
            {fase === 'erro' && (
                <>
                    {!envio.semRetentativa && <button type="button" onClick={envio.tentarDeNovo} className="shrink-0 min-h-[44px] px-4 rounded-full bg-primary text-white font-bold text-sm inline-flex items-center gap-1.5"><Printer className="h-4 w-4" /> Tentar de novo</button>}
                    <button type="button" onClick={envio.limpar} className="shrink-0 min-h-[44px] px-3 text-sm font-semibold text-gray-700">Dispensar</button>
                </>
            )}
        </div>
    );
}
