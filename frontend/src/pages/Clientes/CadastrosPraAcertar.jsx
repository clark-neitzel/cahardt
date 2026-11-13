import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, RefreshCw, Loader2, ChevronRight, UserX, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import cadastroPendenciasService from '../../services/cadastroPendenciasService';
import vendedorService from '../../services/vendedorService';
import { opcoesVendedorFiltro } from '../../utils/vendedoresFiltro';
import SelectBusca from '../../components/SelectBusca';
import EstadoVazio from '../../components/EstadoVazio';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

// ─────────────────────────────────────────────────────────────────────────────
// Cadastros pra acertar + pedidos de inativação.
//  - "Cadastros pra acertar": CLIENTES ativos (ou cliente e fornecedor) sem dia de venda, dia de
//    entrega, tabela de preço ou vendedor — a Ana só atende cliente com o cadastro completo.
//    Fornecedor puro não é cliente incompleto e não aparece aqui.
//  - "Classificar": cadastros sem nenhuma movimentação (sem contas a receber, pedidos nem contas a
//    pagar). A equipe escolhe: cliente, fornecedor, os dois — ou pede a inativação.
//  - "Pedidos de inativação": a Ana (ou outro agente) PEDE; aqui uma pessoa aprova ou recusa.
//    Aprovar inativa o cliente pelo mesmo caminho do cadastro (fica no histórico do cliente).
// ─────────────────────────────────────────────────────────────────────────────

const fmtDataHora = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const STATUS_INATIVACAO = {
    pendente: { rotulo: 'Pendente', classe: 'bg-gray-100 text-gray-700' },
    aprovada: { rotulo: 'Aprovada', classe: 'bg-green-100 text-green-800' },
    recusada: { rotulo: 'Recusada', classe: 'bg-red-100 text-red-700' },
};

const msgErro = (e, padrao) => e?.response?.data?.error || padrao;

const MOTIVOS_INATIVACAO = [
    { id: 'fechou', rotulo: 'Fechou o negócio' },
    { id: 'trocou_dono', rotulo: 'Trocou de dono' },
    { id: 'parou_de_comprar', rotulo: 'Parou de comprar' },
    { id: 'numero_errado', rotulo: 'Número errado' },
    { id: 'outro', rotulo: 'Outro' },
];

const ROTULO_PERFIL = { CLIENTE: 'Cliente', FORNECEDOR: 'Fornecedor' };
const rotuloPerfil = (p) => ROTULO_PERFIL[p] || p;

function ChipsFaltando({ faltando, classificacao }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {classificacao?.valor === 'CLIENTE_FORNECEDOR' && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">Cliente e fornecedor</span>
            )}
            {(faltando || []).map((f) => (
                <span key={f.campo} className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">{f.rotulo}</span>
            ))}
        </div>
    );
}

// ── Aba 1 ────────────────────────────────────────────────────────────────
function AbaCadastros({ vendedores }) {
    const navigate = useNavigate();
    const [vendedorId, setVendedorId] = useFiltroSalvo('cadastros-pra-acertar:vendedor', 'todos');
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            setDados(await cadastroPendenciasService.pendentes({ vendedorId: vendedorId === 'todos' ? undefined : vendedorId, page: pagina }));
        } catch (e) {
            setErro(msgErro(e, 'Não deu para carregar agora.'));
        } finally {
            setCarregando(false);
        }
    }, [vendedorId, pagina]);

    useEffect(() => { carregar(); }, [carregar]);

    const abrir = (id) => navigate(`/clientes/${id}`);
    const linhas = dados?.data || [];

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
                <SelectBusca value={vendedorId} onChange={(e) => { setVendedorId(e.target.value); setPagina(1); }} className="w-full md:w-64">
                    <option value="todos">Todos os vendedores</option>
                    {opcoesVendedorFiltro(vendedores)}
                </SelectBusca>
                <p className="text-sm text-gray-600 md:ml-auto">
                    {dados ? <><strong className="text-gray-900">{dados.total}</strong> {dados.total === 1 ? 'cliente com cadastro incompleto' : 'clientes com cadastro incompleto'}</> : ''}
                </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                {carregando && !dados ? (
                    <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : erro ? (
                    <div className="p-6 text-center">
                        <p className="text-sm font-bold text-gray-900">Não deu para carregar agora</p>
                        <p className="text-xs text-gray-500 mt-1">{erro}</p>
                        <button onClick={carregar} className="mt-4 px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold min-h-[44px]">Tentar de novo</button>
                    </div>
                ) : linhas.length === 0 ? (
                    <EstadoVazio icon={CheckCircle2} titulo="Tudo certo por aqui" descricao="Nenhum cliente ativo está com o cadastro incompleto. Fornecedores não entram nesta lista, e os cadastros sem classificação ficam na aba Classificar." />
                ) : (
                    <>
                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-3 p-3">
                            {linhas.map((c) => (
                                <button key={c.id} type="button" onClick={() => abrir(c.id)} className="raio-proprio w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 min-h-[44px]">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-semibold text-gray-900 truncate">{c.nome}</span>
                                        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2">{[c.cidade, c.vendedor && `Vendedor: ${c.vendedor}`].filter(Boolean).join(' · ') || 'Sem vendedor'}</p>
                                    <ChipsFaltando faltando={c.faltando} classificacao={c.classificacao} />
                                </button>
                            ))}
                        </div>
                        {/* Desktop: tabela */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">O que falta</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {linhas.map((c) => (
                                        <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => abrir(c.id)}>
                                            <td className="px-5 py-3 text-gray-900 font-medium">{c.nome}<div className="text-xs text-gray-500 font-normal">{c.cidade || ''}</div></td>
                                            <td className="px-5 py-3 text-gray-600">{c.vendedor || <span className="text-gray-500">—</span>}</td>
                                            <td className="px-5 py-3"><ChipsFaltando faltando={c.faltando} classificacao={c.classificacao} /></td>
                                            <td className="px-5 py-3 text-right">
                                                <span className="inline-flex items-center gap-1 text-primary font-semibold text-xs">Abrir ficha <ChevronRight className="h-3.5 w-3.5" /></span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {dados.totalPages > 1 && (
                            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 text-sm">
                                <button disabled={pagina <= 1 || carregando} onClick={() => setPagina((p) => p - 1)} className="px-4 py-2 bg-white border border-primary text-primary rounded-full font-medium disabled:opacity-40 min-h-[44px]">Anterior</button>
                                <span className="text-gray-600">Página {dados.page} de {dados.totalPages}</span>
                                <button disabled={pagina >= dados.totalPages || carregando} onClick={() => setPagina((p) => p + 1)} className="px-4 py-2 bg-white border border-primary text-primary rounded-full font-medium disabled:opacity-40 min-h-[44px]">Próxima</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Aba Classificar ──────────────────────────────────────────────────────
function ModalPedirInativacao({ item, salvando, onConfirmar, onFechar }) {
    const [motivo, setMotivo] = useState('fechou');
    const [detalhe, setDetalhe] = useState('');
    const exigeDetalhe = motivo === 'outro';
    const podeEnviar = !salvando && (!exigeDetalhe || detalhe.trim());
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => !salvando && onFechar()}>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape' && !salvando) onFechar(); }}>
                <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-gray-900">Pedir inativação</h2>
                    <button onClick={onFechar} disabled={salvando} aria-label="Fechar" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-sm text-gray-600 mt-1"><strong className="text-gray-900">{item.nome || 'Cadastro'}</strong></p>
                <p className="text-xs text-gray-500 mt-2">O pedido vai para a aba "Pedidos de inativação", onde uma pessoa aprova ou recusa. O cadastro continua ativo até lá.</p>
                <label className="block text-sm font-medium text-gray-700 mt-4">Motivo</label>
                <SelectBusca value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full mt-1">
                    {MOTIVOS_INATIVACAO.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                </SelectBusca>
                <label className="block text-sm font-medium text-gray-700 mt-3">Detalhe{exigeDetalhe ? '' : ' (opcional)'}</label>
                <textarea autoFocus value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={500} rows={3}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && podeEnviar) onConfirmar(motivo, detalhe.trim()); }}
                    className="w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                <div className="flex gap-3 mt-4">
                    <button onClick={onFechar} disabled={salvando} className="flex-1 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">Cancelar</button>
                    <button onClick={() => onConfirmar(motivo, detalhe.trim())} disabled={!podeEnviar}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2">
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {salvando ? 'Enviando…' : 'Pedir inativação'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AbaClassificar({ vendedores, onMudou }) {
    const navigate = useNavigate();
    const [vendedorId, setVendedorId] = useFiltroSalvo('cadastros-pra-acertar:vendedorClassificar', 'todos');
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [gravando, setGravando] = useState(null); // id do cadastro com ação em andamento
    const [pedido, setPedido] = useState(null);      // cadastro do modal de inativação

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            setDados(await cadastroPendenciasService.pendentes({ grupo: 'classificar', vendedorId: vendedorId === 'todos' ? undefined : vendedorId, page: pagina }));
        } catch (e) {
            setErro(msgErro(e, 'Não deu para carregar agora.'));
        } finally {
            setCarregando(false);
        }
    }, [vendedorId, pagina]);

    useEffect(() => { carregar(); }, [carregar]);

    // Se a última linha da página saiu, volta uma página (senão fica "página 3 de 2" vazia).
    useEffect(() => {
        if (dados && dados.data.length === 0 && pagina > 1) setPagina((p) => p - 1);
    }, [dados, pagina]);

    const classificar = async (c, valor, rotulo) => {
        if (gravando) return;
        setGravando(c.id);
        try {
            await cadastroPendenciasService.classificar(c.id, valor);
            toast.success(`${c.nome || 'Cadastro'}: ${rotulo}.`);
            await carregar(); // a linha sai da lista (agora tem classificação manual)
            onMudou();
        } catch (e) {
            toast.error(msgErro(e, 'Não foi possível classificar agora.'));
        } finally {
            setGravando(null);
        }
    };

    const enviarPedido = async (motivo, detalhe) => {
        if (gravando || !pedido) return;
        setGravando(pedido.id);
        try {
            const r = await cadastroPendenciasService.pedirInativacao(pedido.id, motivo, detalhe);
            toast.success(r?.duplicado ? 'Já existia um pedido de inativação esperando para este cadastro.' : 'Pedido de inativação enviado.');
            setPedido(null);
            onMudou();
        } catch (e) {
            toast.error(msgErro(e, 'Não foi possível enviar o pedido agora.'));
        } finally {
            setGravando(null);
        }
    };

    const linhas = dados?.data || [];

    const botoes = (c) => ( // função (não componente): evita remontar os botões a cada render
        <div className="flex flex-wrap gap-2">
            <button disabled={!!gravando} onClick={() => classificar(c, 'CLIENTE', 'classificado como cliente')}
                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px] md:min-h-0 disabled:opacity-60">Cliente</button>
            <button disabled={!!gravando} onClick={() => classificar(c, 'FORNECEDOR', 'classificado como fornecedor')}
                className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] md:min-h-0 disabled:opacity-60">Fornecedor</button>
            <button disabled={!!gravando} onClick={() => classificar(c, 'CLIENTE_FORNECEDOR', 'classificado como cliente e fornecedor')}
                className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] md:min-h-0 disabled:opacity-60">Cliente e fornecedor</button>
            <button disabled={!!gravando} onClick={() => setPedido(c)}
                className="px-4 py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-full font-medium text-sm min-h-[44px] md:min-h-0 disabled:opacity-60">Pedir inativação</button>
            {gravando === c.id && <Loader2 className="h-4 w-4 animate-spin text-primary self-center" />}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="bg-mint/40 border border-mint rounded-xl p-3 text-sm text-gray-700">
                Estes cadastros não têm contas a receber, pedidos nem contas a pagar — o sistema não sabe se são cliente ou fornecedor
                (podem ter vindo de importação). Escolha o que cada um é; enquanto isso a Ana não os trata como cliente.
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
                <SelectBusca value={vendedorId} onChange={(e) => { setVendedorId(e.target.value); setPagina(1); }} className="w-full md:w-64">
                    <option value="todos">Todos os vendedores</option>
                    {opcoesVendedorFiltro(vendedores)}
                </SelectBusca>
                <p className="text-sm text-gray-600 md:ml-auto">
                    {dados ? <><strong className="text-gray-900">{dados.total}</strong> {dados.total === 1 ? 'cadastro' : 'cadastros'} para classificar</> : ''}
                </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                {carregando && !dados ? (
                    <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : erro ? (
                    <div className="p-6 text-center">
                        <p className="text-sm font-bold text-gray-900">Não deu para carregar agora</p>
                        <p className="text-xs text-gray-500 mt-1">{erro}</p>
                        <button onClick={carregar} className="mt-4 px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold min-h-[44px]">Tentar de novo</button>
                    </div>
                ) : linhas.length === 0 ? (
                    <EstadoVazio icon={CheckCircle2} titulo="Nada para classificar" descricao="Todos os cadastros ativos já têm movimento ou uma classificação escolhida." />
                ) : (
                    <>
                        <ul className="divide-y divide-gray-100">
                            {linhas.map((c) => (
                                <li key={c.id} className="p-4 md:p-5 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2 justify-between">
                                        <button type="button" onClick={() => navigate(`/clientes/${c.id}`)} className="raio-proprio font-semibold text-gray-900 hover:text-primary text-left truncate min-h-[44px] md:min-h-0">
                                            {c.nome || 'Sem nome'}
                                        </button>
                                        {(c.perfis || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5" title="Perfil que veio no cadastro (só uma dica)">
                                                {c.perfis.map((p) => <span key={p} className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Cadastro diz: {rotuloPerfil(p)}</span>)}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {[c.cidade, c.documento && `Doc.: ${c.documento}`, c.vendedor && `Vendedor: ${c.vendedor}`].filter(Boolean).join(' · ') || 'Sem dados de cidade ou documento'}
                                    </p>
                                    <p className="text-xs text-gray-500">Sem contas a receber, sem pedidos, sem contas a pagar.</p>
                                    {botoes(c)}
                                </li>
                            ))}
                        </ul>
                        {dados.totalPages > 1 && (
                            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 text-sm">
                                <button disabled={pagina <= 1 || carregando} onClick={() => setPagina((p) => p - 1)} className="px-4 py-2 bg-white border border-primary text-primary rounded-full font-medium disabled:opacity-40 min-h-[44px]">Anterior</button>
                                <span className="text-gray-600">Página {dados.page} de {dados.totalPages}</span>
                                <button disabled={pagina >= dados.totalPages || carregando} onClick={() => setPagina((p) => p + 1)} className="px-4 py-2 bg-white border border-primary text-primary rounded-full font-medium disabled:opacity-40 min-h-[44px]">Próxima</button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {pedido && <ModalPedirInativacao item={pedido} salvando={gravando === pedido.id} onConfirmar={enviarPedido} onFechar={() => setPedido(null)} />}
        </div>
    );
}

// ── Modal de decisão ─────────────────────────────────────────────────────
function ModalDecisao({ item, acao, salvando, onConfirmar, onFechar }) {
    const [obs, setObs] = useState('');
    const aprovar = acao === 'aprovar';
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => !salvando && onFechar()}>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape' && !salvando) onFechar(); }}>
                <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-gray-900">{aprovar ? 'Inativar este cliente?' : 'Recusar o pedido?'}</h2>
                    <button onClick={onFechar} disabled={salvando} aria-label="Fechar" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    <strong className="text-gray-900">{item.cliente || 'Cliente'}</strong> — {item.motivoRotulo}{item.detalhe ? `: ${item.detalhe}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                    {aprovar ? 'O cliente passa a ficar inativo e a mudança fica no histórico do cadastro.' : 'O cliente continua ativo e a recusa fica registrada.'}
                </p>
                <label className="block text-sm font-medium text-gray-700 mt-4">Observação (opcional)</label>
                <textarea autoFocus value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} rows={3}
                    className="w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                <div className="flex gap-3 mt-4">
                    <button onClick={onFechar} disabled={salvando} className="flex-1 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">Cancelar</button>
                    <button onClick={() => onConfirmar(obs)} disabled={salvando}
                        className={`flex-1 px-4 py-2 text-white rounded-full font-semibold text-sm min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2 ${aprovar ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primaryDark'}`}>
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {salvando ? 'Salvando…' : aprovar ? 'Inativar cliente' : 'Recusar pedido'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Aba 2 ────────────────────────────────────────────────────────────────
function AbaInativacoes({ onMudou }) {
    const navigate = useNavigate();
    const [status, setStatus] = useFiltroSalvo('cadastros-pra-acertar:statusInativacao', 'pendente');
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [decisao, setDecisao] = useState(null); // { item, acao }
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try { setDados(await cadastroPendenciasService.inativacoes({ status })); }
        catch (e) { setErro(msgErro(e, 'Não deu para carregar agora.')); }
        finally { setCarregando(false); }
    }, [status]);

    useEffect(() => { carregar(); }, [carregar]);

    const confirmar = async (obs) => {
        if (salvando || !decisao) return;
        setSalvando(true);
        try {
            if (decisao.acao === 'aprovar') await cadastroPendenciasService.aprovar(decisao.item.id, obs);
            else await cadastroPendenciasService.recusar(decisao.item.id, obs);
            toast.success(decisao.acao === 'aprovar' ? 'Cliente inativado.' : 'Pedido recusado.');
            setDecisao(null);
            await carregar();
            onMudou();
        } catch (e) {
            toast.error(msgErro(e, 'Não foi possível concluir agora.'));
            if (e?.response?.status === 409) { setDecisao(null); carregar(); onMudou(); } // já decidido por outra pessoa
        } finally {
            setSalvando(false);
        }
    };

    const linhas = dados?.data || [];

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
                <SelectBusca value={status} onChange={(e) => setStatus(e.target.value)} className="w-full md:w-56">
                    <option value="pendente">Aguardando decisão</option>
                    <option value="aprovada">Aprovadas</option>
                    <option value="recusada">Recusadas</option>
                    <option value="todas">Todas</option>
                </SelectBusca>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                {carregando && !dados ? (
                    <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : erro ? (
                    <div className="p-6 text-center">
                        <p className="text-sm font-bold text-gray-900">Não deu para carregar agora</p>
                        <p className="text-xs text-gray-500 mt-1">{erro}</p>
                        <button onClick={carregar} className="mt-4 px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold min-h-[44px]">Tentar de novo</button>
                    </div>
                ) : linhas.length === 0 ? (
                    <EstadoVazio icon={UserX} titulo={status === 'pendente' ? 'Nenhum pedido esperando' : 'Nenhum pedido nesta lista'} descricao="Quando a Ana pedir para inativar um cliente, o pedido aparece aqui." />
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {linhas.map((s) => {
                            const st = STATUS_INATIVACAO[s.status] || STATUS_INATIVACAO.pendente;
                            return (
                                <li key={s.id} className="p-4 md:p-5">
                                    <div className="flex flex-wrap items-center gap-2 justify-between">
                                        <button type="button" onClick={() => navigate(`/clientes/${s.clienteId}`)} className="raio-proprio font-semibold text-gray-900 hover:text-primary text-left truncate min-h-[44px] md:min-h-0">
                                            {s.cliente || 'Cliente'}
                                        </button>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${st.classe}`}>{st.rotulo}</span>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-1">
                                        <strong>{s.motivoRotulo}</strong>{s.detalhe ? ` — ${s.detalhe}` : ''}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Pedido por {s.solicitadoPor} em {fmtDataHora(s.criadoEm)}
                                        {s.decididoPor ? ` · ${s.status === 'aprovada' ? 'Aprovado' : 'Recusado'} por ${s.decididoPor.nome || '—'} em ${fmtDataHora(s.decididoEm)}` : ''}
                                    </p>
                                    {s.observacaoDecisao && <p className="text-xs text-gray-600 mt-1">Observação: {s.observacaoDecisao}</p>}
                                    {s.status === 'pendente' && (
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => setDecisao({ item: s, acao: 'aprovar' })} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm min-h-[44px] md:min-h-0">Inativar cliente</button>
                                            <button onClick={() => setDecisao({ item: s, acao: 'recusar' })} className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] md:min-h-0">Manter ativo</button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {decisao && <ModalDecisao item={decisao.item} acao={decisao.acao} salvando={salvando} onConfirmar={confirmar} onFechar={() => setDecisao(null)} />}
        </div>
    );
}

// ── Página ───────────────────────────────────────────────────────────────
export default function CadastrosPraAcertar() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const aba = ['inativacoes', 'classificar'].includes(params.get('aba')) ? params.get('aba') : 'cadastros';
    const [vendedores, setVendedores] = useState([]);
    const [pendentes, setPendentes] = useState(0);
    const [contagens, setContagens] = useState({ acertar: 0, classificar: 0 });
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        vendedorService.listarParaFiltro().then(setVendedores).catch(() => {});
    }, []);

    useEffect(() => {
        cadastroPendenciasService.contagemInativacoes().then((r) => setPendentes(r?.pendentes || 0)).catch(() => {});
        // limit 1: só interessa o `contagens` (as duas abas contadas no mesmo passeio do servidor)
        cadastroPendenciasService.pendentes({ limit: 1 }).then((r) => r?.contagens && setContagens(r.contagens)).catch(() => {});
    }, [versao]);

    const abas = [
        { id: 'cadastros', rotulo: 'Cadastros pra acertar', badge: contagens.acertar },
        { id: 'classificar', rotulo: 'Classificar', badge: contagens.classificar },
        { id: 'inativacoes', rotulo: 'Pedidos de inativação', badge: pendentes },
    ];

    return (
        <div className="max-w-full overflow-x-hidden">
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => navigate('/clientes')} aria-label="Voltar" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="bg-green-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <ClipboardCheck className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Cadastros pra acertar</h1>
                        <p className="text-xs md:text-sm text-gray-500 truncate">Clientes com cadastro incompleto e cadastros sem classificação</p>
                    </div>
                </div>
                <button onClick={() => setVersao((v) => v + 1)} aria-label="Atualizar contagem" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                    <RefreshCw className="h-4 w-4" />
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {abas.map((a) => (
                        <button key={a.id} onClick={() => setParams(a.id === 'cadastros' ? {} : { aba: a.id })}
                            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold min-h-[44px] md:min-h-0 flex items-center gap-2 ${aba === a.id ? 'bg-primary text-white' : 'bg-white border border-primary text-primary hover:bg-mint/40'}`}>
                            {a.rotulo}
                            {a.badge > 0 && <span className={`px-1.5 min-w-[20px] text-center text-xs rounded-full ${aba === a.id ? 'bg-white text-primary' : 'bg-red-600 text-white'}`}>{a.badge}</span>}
                        </button>
                    ))}
                </div>
                {aba === 'cadastros' && <AbaCadastros vendedores={vendedores} />}
                {aba === 'classificar' && <AbaClassificar vendedores={vendedores} onMudou={() => setVersao((v) => v + 1)} />}
                {aba === 'inativacoes' && <AbaInativacoes onMudou={() => setVersao((v) => v + 1)} />}
            </div>
        </div>
    );
}
