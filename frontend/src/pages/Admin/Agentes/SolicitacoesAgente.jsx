import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, Bot, ExternalLink, Check, X, ChevronDown, ChevronRight, AlertTriangle, Loader2, RotateCcw, Inbox } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import PageHeader from '../../../components/PageHeader';
import EstadoVazio from '../../../components/EstadoVazio';
import SelectBusca from '../../../components/SelectBusca';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { avisarSolicitacoesMudaram, useContagemSolicitacoesAgente } from '../../../hooks/useSolicitacoesAgente';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { ModalBase, ConfirmModal, BtnPrimario, BtnSecundario, BtnPerigo, BtnPerigoContorno } from './ModalBase';
import { fmtDataHora, haQuanto, expiraEmTexto, jsonLegivel, resumoLimpo, SELECT_TOQUE } from './util';

const STATUS = {
    PENDENTE: { rotulo: 'Aguardando você', cor: 'bg-blue-100 text-blue-800' },
    EXECUTANDO: { rotulo: 'Executando…', cor: 'bg-blue-100 text-blue-800' },
    AUTORIZADA: { rotulo: 'Autorizada', cor: 'bg-green-100 text-green-800' },
    RECUSADA: { rotulo: 'Recusada', cor: 'bg-gray-100 text-gray-700' },
    ERRO: { rotulo: 'Erro ao executar', cor: 'bg-red-100 text-red-700' },
    ERRO_INDETERMINADO: { rotulo: 'Resultado incerto', cor: 'bg-amber-100 text-amber-700' },
    EXPIRADA: { rotulo: 'Expirada', cor: 'bg-gray-100 text-gray-700' },
};

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
const TEXTO_CONFERIR = 'Não sei se foi executado: confira a tela de destino antes de tentar de novo.';

// Rota de dentro do app: começa com "/", não é "//dominio" e não tem barra invertida (alguns navegadores tratam "\" como "/").
const rotaSegura = (r) => typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.includes('\\');

const horaCurta = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// Erro sem resposta (rede/timeout) ou 5xx: o servidor PODE ter executado a ação. Nunca presumir que falhou.
const falhaIncerta = (e) => !e?.response || e.response.status >= 500;

// ids devolvidos pela ação (array, objeto ou valor solto) -> texto
function idsEmTexto(ids) {
    if (ids == null || ids === '') return '';
    if (Array.isArray(ids)) return ids.filter((x) => x != null).join(', ');
    if (typeof ids === 'object') return Object.entries(ids).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
    return String(ids);
}

function mensagemDoResultado(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    const m = r.error || r.erro || r.message || r.mensagem;
    return typeof m === 'string' ? m : '';
}

function Bloco({ titulo, valor }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">{titulo}</p>
            <pre className="text-xs leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{valor || '(vazio)'}</pre>
        </div>
    );
}

const Aviso = ({ children, testid, cor = 'amber' }) => (
    <div className={`flex gap-2 rounded-lg border p-2.5 text-sm ${cor === 'red' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`} data-testid={testid}>
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0">{children}</div>
    </div>
);

// "POST /api/x" + ?query em destaque (o dono precisa ver coisas como ?forcar=1)
function Endereco({ item }) {
    return (
        <p className="text-[11px] text-gray-500 font-mono mt-1 break-all">
            {item.metodo} {item.caminho}
            {item.query ? <span className="ml-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-xs" data-testid="query">?{item.query}</span> : null}
        </p>
    );
}

function Resultado({ item }) {
    const [ver, setVer] = useState(false);
    if (!['AUTORIZADA', 'ERRO', 'ERRO_INDETERMINADO'].includes(item.status)) return null;
    const st = item.resultadoStatus;
    const ok = st != null && st >= 200 && st < 300;
    const msg = item.mensagemErro || mensagemDoResultado(item.resultado);
    const ids = idsEmTexto(item.idsResultado);
    const destaque = (st != null && st >= 500) || item.status === 'ERRO_INDETERMINADO';
    return (
        <div className={`rounded-lg border p-3 text-sm ${item.status === 'AUTORIZADA' && ok ? 'bg-green-50 border-green-200 text-green-900' : item.status === 'ERRO_INDETERMINADO' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`} data-testid="resultado">
            <p className="font-semibold">
                {item.status === 'AUTORIZADA' && ok && 'Executado com sucesso'}
                {item.status === 'AUTORIZADA' && !ok && 'Autorizada'}
                {item.status === 'ERRO' && 'A ação deu erro ao executar'}
                {item.status === 'ERRO_INDETERMINADO' && 'O sistema não sabe se a ação foi feita'}
                {st != null && <span className="font-normal"> · resposta {st}</span>}
            </p>
            {ids && <p className="mt-0.5 break-words">Registro(s) gerado(s): <span className="font-mono text-xs">{ids}</span></p>}
            {msg && (destaque
                ? <p className="mt-1.5 rounded-md bg-white border border-amber-300 p-2 font-semibold text-amber-900 break-words" data-testid="mensagem-destaque">{msg}</p>
                : <p className="mt-0.5 break-words">{msg}</p>)}
            {item.resultado != null && (
                <>
                    <button type="button" onClick={() => setVer((v) => !v)} className="mt-1 min-h-[44px] md:min-h-0 inline-flex items-center gap-1 text-xs underline">
                        {ver ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Ver resposta completa
                    </button>
                    {ver && <pre className="text-xs bg-white/70 border border-black/10 rounded-lg p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{jsonLegivel(item.resultado)}</pre>}
                </>
            )}
        </div>
    );
}

function CartaoSolicitacao({ item, agora, liberaEm, onAbrirTela, onAutorizar, onRecusar, onRepetir }) {
    const [verCorpo, setVerCorpo] = useState(false);
    const st = STATUS[item.status] || { rotulo: item.status, cor: 'bg-gray-100 text-gray-700' };
    const pendente = item.status === 'PENDENTE';
    const expirada = pendente && item.expiraEm && new Date(item.expiraEm).getTime() <= agora;
    const corpo = useMemo(() => (verCorpo ? jsonLegivel(item.body) : ''), [verCorpo, item.body]);
    const temCorpo = item.body != null && !(typeof item.body === 'object' && Object.keys(item.body).length === 0);
    const destino = item.telaDestino && rotaSegura(item.telaDestino.rota) ? item.telaDestino : null;
    // libera às: o que o item traz (repetirLiberaEm) ou o que o servidor informou num 409 REPETIR_MUITO_CEDO (vale o mais tarde)
    const liberaMs = Math.max(item.repetirLiberaEm ? new Date(item.repetirLiberaEm).getTime() || 0 : 0, liberaEm ? new Date(liberaEm).getTime() || 0 : 0);
    const aguardaRepetir = liberaMs > agora;

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3" data-solicitacao-id={item.id} data-status={item.status}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${st.cor}`}>{st.rotulo}</span>
                {item.possivelDuplicata === true && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700" data-testid="selo-duplicata" title="Já existe um pedido igual ou parecido">Possível duplicata</span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Bot className="h-3.5 w-3.5" />{item.agenteNome || 'Agente'}</span>
                <span className="text-xs text-gray-500" title={fmtDataHora(item.createdAt)}>pediu {haQuanto(item.createdAt, agora)}</span>
                {pendente && item.expiraEm && (
                    <span className={`text-xs font-medium ${expirada ? 'text-red-700' : 'text-gray-500'}`}>· {expiraEmTexto(item.expiraEm, agora)}</span>
                )}
            </div>

            <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 break-words">{item.rotulo || item.chave}</p>
                {resumoLimpo(item) && <p className="text-sm text-gray-700 mt-0.5 break-words" data-testid="resumo">{resumoLimpo(item)}</p>}
                <Endereco item={item} />
            </div>

            {item.possivelDuplicata === true && pendente && (
                <Aviso testid="aviso-duplicata">Possível duplicata: já existe um pedido igual ou parecido. Confira a tela de destino antes de autorizar.</Aviso>
            )}

            {item.status === 'EXECUTANDO' && (
                <Aviso testid="aviso-executando">A ação está sendo executada agora. Aguarde alguns instantes e <b>não autorize de novo</b>: esta tela se atualiza sozinha.</Aviso>
            )}

            {item.mudouDesdePedido === true && pendente && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-sm text-amber-900 space-y-2" data-testid="aviso-mudou">
                    <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>Os dados desta tela mudaram desde que o agente fez o pedido. Confira antes de autorizar.</span>
                    </div>
                    {(item.antes != null || item.agora != null) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Bloco titulo="Quando o agente pediu" valor={item.antes != null ? jsonLegivel(item.antes) : ''} />
                            <Bloco titulo="Agora" valor={item.agora != null ? jsonLegivel(item.agora) : ''} />
                        </div>
                    )}
                </div>
            )}

            {item.bodyTruncado === true && (
                <Aviso testid="aviso-truncado">O corpo mostrado está <b>incompleto</b> (era grande demais). Você não vê tudo o que será enviado: na dúvida, <b>recuse</b>.</Aviso>
            )}

            {item.aviso && item.status !== 'PENDENTE' && <Aviso testid="aviso-repeticao">{item.aviso}</Aviso>}

            {temCorpo && (
                <div>
                    <button type="button" onClick={() => setVerCorpo((v) => !v)} aria-expanded={verCorpo} className="min-h-[44px] md:min-h-0 inline-flex items-center gap-1 text-sm text-primary font-medium">
                        {verCorpo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {verCorpo ? 'Esconder' : 'Ver'} o que será enviado
                    </button>
                    {verCorpo && <div className="mt-1"><Bloco titulo={item.bodyTruncado ? 'Corpo da requisição (INCOMPLETO, dados sensíveis ocultos)' : 'Corpo da requisição (dados sensíveis já ocultos)'} valor={corpo} /></div>}
                </div>
            )}

            {item.status !== 'PENDENTE' && item.status !== 'EXECUTANDO' && (
                <p className="text-xs text-gray-600">
                    {item.status === 'EXPIRADA' ? 'Ninguém decidiu a tempo.' : item.decididoPorNome ? `${item.status === 'RECUSADA' ? 'Recusada' : 'Autorizada'} por ${item.decididoPorNome}${item.decididoEm ? ` em ${fmtDataHora(item.decididoEm)}` : ''}.` : ''}
                    {item.observacaoDecisao ? ` Observação: ${item.observacaoDecisao}` : ''}
                </p>
            )}

            <Resultado item={item} />

            {item.status === 'ERRO_INDETERMINADO' && (
                <Aviso>Antes de tentar de novo, <b>confira na tela</b> se a ação já foi feita. Repetir pode duplicar.</Aviso>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {destino && (
                    <BtnSecundario onClick={() => onAbrirTela(destino.rota)} className="inline-flex items-center justify-center gap-1.5 min-w-0">
                        <ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">Abrir tela{destino.rotulo ? `: ${destino.rotulo}` : ''}</span>
                    </BtnSecundario>
                )}
                {pendente && !expirada && (
                    <>
                        <BtnPrimario onClick={() => onAutorizar(item)} className="inline-flex items-center justify-center gap-1.5"><Check className="h-4 w-4" />Autorizar</BtnPrimario>
                        <BtnPerigoContorno onClick={() => onRecusar(item)} className="inline-flex items-center justify-center gap-1.5"><X className="h-4 w-4" />Recusar</BtnPerigoContorno>
                    </>
                )}
                {pendente && expirada && <p className="text-sm text-red-700 self-center">Prazo vencido. Atualize a lista; o agente precisa pedir de novo.</p>}
                {item.status === 'ERRO_INDETERMINADO' && (
                    <BtnPerigoContorno onClick={() => onRepetir(item)} disabled={!!aguardaRepetir} className="inline-flex items-center justify-center gap-1.5" data-testid="btn-repetir">
                        <RotateCcw className="h-4 w-4" />{aguardaRepetir ? `Tentar de novo (disponível às ${horaCurta(new Date(liberaMs).toISOString())})` : 'Tentar de novo'}
                    </BtnPerigoContorno>
                )}
            </div>
        </div>
    );
}

// Confirmação forte da repetição: repetir uma CRIAÇÃO pode duplicar. Só o "Entendi" habilita o envio.
function ModalRepetir({ item, avisoServidor, ocupado, onConfirmar, onCancelar, onAbrirTela }) {
    const [entendi, setEntendi] = useState(false);
    const destino = item.telaDestino && rotaSegura(item.telaDestino.rota) ? item.telaDestino : null;
    return (
        <ModalBase
            titulo="Tentar de novo?"
            onFechar={ocupado ? undefined : onCancelar}
            fecharAoClicarFora={false}
            rodape={(
                <>
                    <BtnSecundario onClick={onCancelar} disabled={ocupado}>Cancelar</BtnSecundario>
                    <BtnPerigo onClick={onConfirmar} disabled={!entendi || ocupado}>{ocupado ? 'Aguarde…' : 'Repetir agora'}</BtnPerigo>
                </>
            )}
        >
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-red-900" role="alert" data-testid="aviso-forte-repetir">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 shrink-0" />O sistema não sabe se a ação foi feita.</div>
                <p className="text-sm mt-1">Repetir a <b>criação</b> de algo que já existe <b>pode duplicar</b> (conta, pedido, cadastro). Confira a tela de destino antes.</p>
                {avisoServidor && <p className="text-sm mt-1.5 font-semibold">{avisoServidor}</p>}
            </div>
            <div className="text-sm text-gray-700">
                <p className="font-semibold text-gray-900">{item.rotulo || item.chave}</p>
                {resumoLimpo(item) && <p>{resumoLimpo(item)}</p>}
                <Endereco item={item} />
            </div>
            {destino && (
                <BtnSecundario onClick={() => onAbrirTela(destino.rota)} className="w-full inline-flex items-center justify-center gap-1.5">
                    <ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">Abrir tela{destino.rotulo ? `: ${destino.rotulo}` : ''}</span>
                </BtnSecundario>
            )}
            <label className="flex items-start gap-3 min-h-[44px] rounded-lg border border-gray-300 p-3 cursor-pointer">
                <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" />
                <span className="text-sm font-medium text-gray-900">Entendi, repetir mesmo assim</span>
            </label>
        </ModalBase>
    );
}

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

    const [confirmaAut, setConfirmaAut] = useState(null);  // item
    const [mudou, setMudou] = useState(null);              // { item, dados }
    const [recusando, setRecusando] = useState(null);      // item
    const [obs, setObs] = useState('');
    const [repetindo, setRepetindo] = useState(null);      // { item, aviso }
    const [liberaEm, setLiberaEm] = useState({});          // id -> ISO (REPETIR_MUITO_CEDO)
    const [avisoIncerto, setAvisoIncerto] = useState(null); // { item, texto } — falha de rede/5xx numa ação
    const [ocupado, setOcupado] = useState(false);
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

    const visiveis = useMemo(() => {
        if (status !== 'PENDENTE') return lista.itens;
        const ids = new Set(lista.itens.map((i) => i.id));
        const soRecentes = Object.values(recentes).filter((r) => !ids.has(r.id));
        return [...soRecentes, ...lista.itens.map((i) => recentes[i.id] || i)];
    }, [lista.itens, recentes, status]);

    // Falha numa ação (autorizar/recusar/repetir). Sempre recarrega a lista e a contagem: o servidor pode ter mudado de estado.
    const trataErroAcao = (e, item) => {
        const cod = e?.response?.data?.codigo;
        if (falhaIncerta(e)) {
            // rede/timeout/5xx: a ação PODE ter sido executada. Nunca dizer "falhou".
            setAvisoIncerto({ item, texto: TEXTO_CONFERIR });
            toast.error(TEXTO_CONFERIR, { duration: 12000 });
        } else {
            // SOLICITACAO_JA_DECIDIDA (outra pessoa decidiu / expirou) e AGENTE_POLITICA_BLOQUEADA (a solicitação vira RECUSADA):
            // a mensagem do servidor já explica; a lista é recarregada para mostrar o estado real.
            toast.error(mensagemErro(e, 'Não foi possível concluir a ação.'), { duration: cod === 'AGENTE_POLITICA_BLOQUEADA' ? 9000 : 7000 });
        }
        setRecentes((r) => { if (!r[item.id]) return r; const n = { ...r }; delete n[item.id]; return n; });
        recarregarSilencioso();
    };

    const autorizar = async (item, confirmarMudanca = false) => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const novo = await agenteService.autorizar(item.id, confirmarMudanca ? { confirmarMudanca: true } : {});
            setConfirmaAut(null); setMudou(null); setAvisoIncerto(null);
            registrarDecidido(novo);
            if (novo.status === 'AUTORIZADA') toast.success('Autorizada e executada.');
            else if (novo.status === 'EXECUTANDO') toast('Autorizada: a ação está sendo executada agora.', { icon: '⏳', duration: 6000 });
            else if (novo.status === 'ERRO_INDETERMINADO') toast('Autorizada, mas o resultado é incerto. Confira a tela.', { icon: '⚠️', duration: 8000 });
            else toast.error('Autorizada, mas a ação deu erro. Veja o resultado no cartão.', { duration: 8000 });
        } catch (e) {
            const dados = e?.response?.data;
            setConfirmaAut(null);
            if (e?.response?.status === 409 && (dados?.codigo === 'MUDOU_DESDE_O_PEDIDO' || dados?.mudouDesdePedido)) {
                setMudou({ item, dados });
            } else {
                setMudou(null);
                trataErroAcao(e, item);
            }
        } finally { if (montado.current) setOcupado(false); }
    };

    const recusar = async () => {
        if (!recusando || ocupado) return;
        setOcupado(true);
        const item = recusando;
        try {
            const novo = await agenteService.recusar(item.id, obs.trim());
            setRecusando(null); setObs('');
            registrarDecidido(novo);
            toast.success('Solicitação recusada.');
        } catch (e) {
            setRecusando(null); setObs('');
            trataErroAcao(e, item);
        } finally { if (montado.current) setOcupado(false); }
    };

    const repetir = async () => {
        if (!repetindo || ocupado) return;
        setOcupado(true);
        const { item } = repetindo;
        try {
            const novo = await agenteService.repetir(item.id, { confirmarRepeticao: true });
            setRepetindo(null); setAvisoIncerto(null);
            registrarDecidido(novo);
            toast.success('Nova tentativa feita. Veja o resultado no cartão.');
            if (novo.aviso) toast(novo.aviso, { icon: '⚠️', duration: 12000 });
        } catch (e) {
            const dados = e?.response?.data;
            const cod = dados?.codigo;
            if (e?.response?.status === 409 && cod === 'CONFIRMAR_REPETICAO') {
                // o servidor quer a confirmação explícita: mantém o modal aberto com o aviso dele
                setRepetindo({ item, aviso: dados?.aviso || null });
            } else if (e?.response?.status === 409 && cod === 'REPETIR_MUITO_CEDO') {
                setRepetindo(null);
                if (dados?.liberaEm) setLiberaEm((m) => ({ ...m, [item.id]: dados.liberaEm }));
                toast(`Ainda é cedo para repetir${dados?.liberaEm ? `: disponível às ${horaCurta(dados.liberaEm)}` : ''}. A ação pode ainda estar em andamento.`, { icon: '⏳', duration: 9000 });
                recarregarSilencioso();
            } else {
                setRepetindo(null);
                trataErroAcao(e, item);
            }
        } finally { if (montado.current) setOcupado(false); }
    };

    const abrirTela = (rota) => { setRepetindo(null); navigate(rota); };
    const vazioTitulo = { PENDENTE: 'Nenhuma solicitação pendente', EXECUTANDO: 'Nenhuma ação em execução agora', AUTORIZADA: 'Nenhuma solicitação autorizada', RECUSADA: 'Nenhuma solicitação recusada', ERRO: 'Nenhuma solicitação com erro', ERRO_INDETERMINADO: 'Nenhuma solicitação com resultado incerto', EXPIRADA: 'Nenhuma solicitação expirada' }[status];
    const antes = mudou?.dados?.antes ?? mudou?.item?.antes;
    const depois = mudou?.dados?.depois ?? mudou?.dados?.agora ?? mudou?.item?.agora;
    const nomeAgenteConf = confirmaAut?.agenteNome || 'o agente';

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
                            onAutorizar={setConfirmaAut}
                            onRecusar={(i) => { setObs(''); setRecusando(i); }}
                            onRepetir={(i) => setRepetindo({ item: i, aviso: null })}
                        />
                    ))}
                </div>

                {lista.itens.length < lista.total && (
                    <button type="button" onClick={() => carregar({ ate: lista.pagina + 1 })} disabled={lista.carregando} className="w-full min-h-[44px] rounded-full border border-primary text-primary font-medium text-sm hover:bg-mint/40">
                        {lista.carregando ? 'Carregando…' : `Carregar mais (${lista.total - lista.itens.length} restantes)`}
                    </button>
                )}
            </div>

            {confirmaAut && (
                <ConfirmModal
                    titulo="Autorizar esta ação?"
                    rotuloConfirmar="Autorizar e executar"
                    ocupado={ocupado}
                    onConfirmar={() => autorizar(confirmaAut)}
                    onCancelar={() => setConfirmaAut(null)}
                    aviso={`Isto vai executar a ação como ${nomeAgenteConf}, no sistema de verdade.`}
                >
                    <p className="font-semibold text-gray-900">{confirmaAut.rotulo || confirmaAut.chave}</p>
                    {resumoLimpo(confirmaAut) && <p>{resumoLimpo(confirmaAut)}</p>}
                    <Endereco item={confirmaAut} />
                    {confirmaAut.possivelDuplicata === true && <Aviso>Possível duplicata: já existe um pedido igual ou parecido.</Aviso>}
                    {confirmaAut.bodyTruncado === true && <Aviso>O corpo mostrado está incompleto. Na dúvida, recuse.</Aviso>}
                </ConfirmModal>
            )}

            {mudou && (
                <ModalBase
                    titulo="Algo mudou desde o pedido"
                    largura="md:max-w-2xl"
                    onFechar={ocupado ? undefined : () => setMudou(null)}
                    rodape={(
                        <>
                            <BtnSecundario onClick={() => setMudou(null)} disabled={ocupado}>Voltar sem autorizar</BtnSecundario>
                            <BtnPerigo onClick={() => autorizar(mudou.item, true)} disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Autorizar mesmo assim'}</BtnPerigo>
                        </>
                    )}
                >
                    <Aviso>{mudou.dados?.error || 'Os dados mudaram depois que o agente fez o pedido. Confira a diferença antes de autorizar.'}</Aviso>
                    <p className="text-sm font-semibold text-gray-900">{mudou.item.rotulo || mudou.item.chave}{resumoLimpo(mudou.item) ? ` — ${resumoLimpo(mudou.item)}` : ''}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Bloco titulo="Quando o agente pediu" valor={antes != null ? jsonLegivel(antes) : ''} />
                        <Bloco titulo="Agora" valor={depois != null ? jsonLegivel(depois) : 'Abra a tela para ver o valor atual.'} />
                    </div>
                    {rotaSegura(mudou.item.telaDestino?.rota) && (
                        <BtnSecundario onClick={() => { const r = mudou.item.telaDestino.rota; setMudou(null); navigate(r); }} className="w-full inline-flex items-center justify-center gap-1.5"><ExternalLink className="h-4 w-4" />Abrir a tela para conferir</BtnSecundario>
                    )}
                </ModalBase>
            )}

            {recusando && (
                <ModalBase
                    titulo="Recusar solicitação"
                    onFechar={ocupado ? undefined : () => setRecusando(null)}
                    rodape={(
                        <>
                            <BtnSecundario onClick={() => setRecusando(null)} disabled={ocupado}>Cancelar</BtnSecundario>
                            <BtnPerigo onClick={recusar} disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Recusar'}</BtnPerigo>
                        </>
                    )}
                >
                    <p className="text-sm text-gray-700"><b>{recusando.rotulo || recusando.chave}</b>{resumoLimpo(recusando) ? ` — ${resumoLimpo(recusando)}` : ''}</p>
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Observação (opcional)</span>
                        <textarea
                            value={obs}
                            onChange={(e) => setObs(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Por que está recusando? O agente pode ler isto."
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </label>
                </ModalBase>
            )}

            {repetindo && (
                <ModalRepetir
                    key={repetindo.item.id}
                    item={repetindo.item}
                    avisoServidor={repetindo.aviso}
                    ocupado={ocupado}
                    onConfirmar={repetir}
                    onCancelar={() => setRepetindo(null)}
                    onAbrirTela={abrirTela}
                />
            )}
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
