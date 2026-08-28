import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, MessageCircle, RefreshCw, Loader2, AlertTriangle, ChevronRight, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import whatsappClientesService, { rotuloMotivo, MOTIVOS_DISPENSA, calcularValidaAte } from '../../services/whatsappClientesService';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { useAuth } from '../../contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Pendências de WhatsApp — o painel do escritório.
// Mostra quem está sem número, quem foi dispensado (por quem, quando e por quê)
// e quem está com número problemático, agrupado por vendedor. É também aqui que
// se liga/desliga a exigência do WhatsApp para ENVIAR pedido, sem deploy.
//
// Mostrar a dispensa com nome e data é de propósito: é o que impede o escape
// "Não consegui agora" de virar o botão que todo mundo aperta.
// ─────────────────────────────────────────────────────────────────────────────

const SITUACOES = {
    SEM_NUMERO: { rotulo: 'Sem número', classe: 'bg-gray-100 text-gray-700' },
    DISPENSADO: { rotulo: 'Dispensado', classe: 'bg-amber-100 text-amber-700' },
    COM_PROBLEMA: { rotulo: 'Número com problema', classe: 'bg-red-100 text-red-700' },
};

const fmtData = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
};

// ─────────────────────────────────────────────────────────────────────────────
// Carimbo da última rodada do selo.
//
// OS SEGUNDOS SÃO OBRIGATÓRIOS — não remover `second`. Esta frase é o termômetro
// que existe para o dono enxergar que a conta RODOU de verdade: ele clica em
// "Recalcular agora", espera alguns segundos e clica de novo. Sem os segundos,
// dois recálculos dentro do mesmo minuto imprimiam TEXTO IDÊNTICO na tela
// (API 06:58:51 e 06:58:55 viravam as duas "28/08/2026, 03:58") — que é
// exatamente a leitura "não fez nada" que gerou o chamado. A API sempre avança;
// era o arredondamento da tela que apagava a diferença.
//
// Devolve a frase já com a preposição ("hoje às…", "ontem às…", "em 27/08…"),
// para caber em 375px sem virar uma data longa com segundos pendurados.
// ─────────────────────────────────────────────────────────────────────────────
const mesmoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmtCarimboSelo = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return '';
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (mesmoDia(d, hoje)) return `hoje às ${hora}`;
    if (mesmoDia(d, ontem)) return `ontem às ${hora}`;
    return `em ${d.toLocaleDateString('pt-BR')} às ${hora}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Frase do resultado do recálculo.
// O backend manda `resumo` pronto — é ele que manda. O caminho de reserva existe
// só para backend antigo, e nele NUNCA se usa `gravados` sozinho: `gravados` conta
// linhas que MUDARAM, então depois do job das 04:20 (ou num 2º clique) ele é 0 mesmo
// com centenas de selos acesos — foi exatamente isso que fez o "0 atualizados"
// parecer defeito. Quem descreve o resultado é `emUso` / `comProblema`.
// ─────────────────────────────────────────────────────────────────────────────
const fraseRecalculo = (r) => {
    const resumo = typeof r?.resumo === 'string' ? r.resumo.trim() : '';
    if (resumo) return resumo;

    const emUso = r?.emUso;
    const comProblema = r?.comProblema;
    if (emUso == null && comProblema == null) return 'Selos recalculados.';

    const avaliados = r?.avaliados;
    const trecho = `${emUso ?? 0} cliente(s) com WhatsApp em uso e ${comProblema ?? 0} com problema`;
    return `Selos recalculados: ${trecho}${avaliados != null ? ` (de ${avaliados} clientes avaliados)` : ''}.`;
};

const Kpi = ({ valor, rotulo, cor, className = '' }) => (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center ${className}`}>
        <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor ?? 0}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">{rotulo}</p>
    </div>
);

const BadgeSituacao = ({ situacao }) => {
    const s = SITUACOES[situacao] || { rotulo: situacao || '—', classe: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${s.classe}`}>{s.rotulo}</span>;
};

// Linha explicativa da dispensa (quem / quando / por quê / até quando)
const DetalheDispensa = ({ c, diasValidade }) => {
    if (c.situacao !== 'DISPENSADO' && !c.dispensaMotivo) return null;
    const partes = [rotuloMotivo(c.dispensaMotivo)];
    if (c.dispensaPorNome) partes.push(`por ${c.dispensaPorNome}`);
    const data = fmtData(c.dispensaEm);
    if (data) partes.push(`em ${data}`);
    // dispensaValidaAte vem do backend; dispensa antiga sem o campo cai no cálculo pela
    // config, e se nem isso houver a linha simplesmente não mostra o prazo (não quebra)
    const ate = fmtData(calcularValidaAte(c.dispensaValidaAte, c.dispensaEm, diasValidade));
    return (
        <span className="text-xs text-gray-600">
            {partes.join(' · ')}
            {ate && <span className="font-semibold text-amber-700"> · dispensado até {ate}</span>}
        </span>
    );
};

export default function PendenciasWhatsapp() {
    const navigate = useNavigate();
    const { user } = useAuth();
    // Espelha EXATAMENTE o gate do backend (whatsappClienteRoutes.js → podeAdministrar)
    const perms = user?.permissoes || {};
    const podeAdministrar = !!(perms.admin || perms.clientes?.edit);

    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState(null);
    const [salvandoConfig, setSalvandoConfig] = useState(false);
    const [salvandoSelo, setSalvandoSelo] = useState(false);
    const [recalculando, setRecalculando] = useState(false);

    // Filtros lembrados por usuário/tela (busca por texto NÃO é persistida)
    const [filtros, setFiltros] = useFiltrosSalvos('pendencias-whatsapp', {
        situacao: 'todas',
        vendedorId: 'todos',
        motivo: 'todos',
    });
    const [busca, setBusca] = useState('');

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await whatsappClientesService.pendencias();
            setDados(r || null);
            setErroCarga(null);
            // Validade da dispensa e o interruptor do selo vêm da config — detalhe
            // informativo, não pode travar a tela
            whatsappClientesService.config()
                .then(cfg => setDados(d => d ? {
                    ...d,
                    diasValidadeDispensa: cfg?.diasValidadeDispensa,
                    mostrarSeloNasListas: cfg?.mostrarSeloNasListas === true,
                } : d))
                .catch(() => { });
        } catch (e) {
            // Backend fora do ar / rota ainda não publicada: tela de vazio, nunca tela vermelha
            setDados(null);
            setErroCarga(e.response?.data?.error || 'Não foi possível carregar as pendências agora.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const recalcularSelos = async () => {
        if (!podeAdministrar) return toast.error('Só quem pode editar clientes recalcula os selos.');
        setRecalculando(true);
        // Rodapé, não canto superior: o Toaster do app é `top-right` e, por 9 segundos,
        // este aviso cobria justamente o cartão "Em uso" — o dono lia a frase que cita o
        // placar e, ao olhar o placar, ele estava tapado (em 1440px e em 375px).
        const POSICAO = { position: 'bottom-center' };
        const aviso = toast.loading('Recalculando os selos… pode levar alguns minutos.', POSICAO);
        try {
            const r = await whatsappClientesService.recalcularSelo();
            const frase = fraseRecalculo(r);
            if (r?.jaEstavaRodando) {
                // Não é erro: alguém (ou o job) já estava recalculando — este clique
                // entrou na rodada que estava em andamento.
                toast(`Já havia um recálculo em andamento — este clique entrou nele. ${frase}`, { ...POSICAO, id: aviso, icon: '⏳', duration: 9000 });
            } else {
                toast.success(frase, { ...POSICAO, id: aviso, duration: 9000 });
            }
            await carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível recalcular os selos agora.', { ...POSICAO, id: aviso });
        } finally {
            setRecalculando(false);
        }
    };

    const toggleExigir = async () => {
        if (!podeAdministrar) return toast.error('Só quem pode editar clientes liga/desliga a exigência.');
        setSalvandoConfig(true);
        try {
            const novo = !dados?.ativo;
            const r = await whatsappClientesService.setConfig({ ativo: novo });
            const ativo = typeof r?.ativo === 'boolean' ? r.ativo : novo;
            setDados(d => ({ ...(d || {}), ativo }));
            toast.success(ativo
                ? 'Exigência LIGADA: pedido de cliente sem WhatsApp (e sem dispensa) não envia mais.'
                : 'Exigência desligada: os pedidos voltam a sair sem exigir o WhatsApp.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao mudar a configuração.');
        } finally {
            setSalvandoConfig(false);
        }
    };

    // Interruptor SEPARADO: só MOSTRA o selo nas listas de campo. Não exige nada,
    // não bloqueia pedido — é independente da exigência acima.
    const toggleSelo = async () => {
        if (!podeAdministrar) return toast.error('Só quem pode editar clientes liga/desliga o selo.');
        setSalvandoSelo(true);
        try {
            const novo = !dados?.mostrarSeloNasListas;
            const r = await whatsappClientesService.setConfig({ mostrarSeloNasListas: novo });
            const valor = typeof r?.mostrarSeloNasListas === 'boolean' ? r.mostrarSeloNasListas : novo;
            setDados(d => ({ ...(d || {}), mostrarSeloNasListas: valor }));
            toast.success(valor
                ? 'Selo LIGADO: a Rota, os Atendimentos e as Entregas passam a mostrar quem tem WhatsApp.'
                : 'Selo desligado: as listas voltam a ficar como estavam.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao mudar a configuração.');
        } finally {
            setSalvandoSelo(false);
        }
    };

    const vendedores = useMemo(() => Array.isArray(dados?.vendedores) ? dados.vendedores : [], [dados]);

    // Aplica os filtros dentro de cada vendedor e descarta grupos que ficaram vazios
    const grupos = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return vendedores
            .filter(v => filtros.vendedorId === 'todos' || String(v.vendedorId) === String(filtros.vendedorId))
            .map(v => ({
                ...v,
                clientes: (Array.isArray(v.clientes) ? v.clientes : []).filter(c => {
                    if (filtros.situacao !== 'todas' && c.situacao !== filtros.situacao) return false;
                    if (filtros.motivo !== 'todos' && c.dispensaMotivo !== filtros.motivo) return false;
                    if (!termo) return true;
                    return (c.nome || '').toLowerCase().includes(termo)
                        || (c.documento || '').toLowerCase().includes(termo)
                        || (c.cidade || '').toLowerCase().includes(termo);
                })
            }))
            .filter(v => v.clientes.length > 0);
    }, [vendedores, filtros, busca]);

    const totalListado = grupos.reduce((acc, v) => acc + v.clientes.length, 0);
    const k = dados?.kpis || {};

    // Backend antigo não manda `emUso` — sem ele o cartão simplesmente não aparece
    // (nada quebra, a fileira volta a ter 4 colunas).
    const temKpiSelo = k.emUso != null;

    // Quantos clientes ativos TÊM número no campo Celular/WhatsApp. O backend classifica
    // cada cliente em uma situação só, e "sem número" + "dispensado" são exatamente os
    // que estão sem número — o resto tem. Serve para o zero do selo ser lido como
    // "cadastro incompleto", não como "a função quebrou".
    const comNumero = (k.totalAtivos != null && k.semNumero != null && k.dispensados != null)
        ? Math.max(0, k.totalAtivos - k.semNumero - k.dispensados)
        : null;

    // Já vem com a preposição ("hoje às 03:58:51" / "em 27/08/2026 às 03:58:51")
    const seloAtualizadoEm = fmtCarimboSelo(k.seloUltimaAtualizacao);

    const filtrosAtivos =
        (filtros.situacao !== 'todas' ? 1 : 0) +
        (filtros.vendedorId !== 'todos' ? 1 : 0) +
        (filtros.motivo !== 'todos' ? 1 : 0);

    return (
        <div className="max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => navigate('/clientes')} aria-label="Voltar"
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="bg-green-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <MessageCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Pendências de WhatsApp</h1>
                </div>
                <button onClick={carregar} disabled={carregando}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs md:text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 min-h-[38px]">
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="hidden md:inline">Atualizar</span>
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {carregando && !dados ? (
                    <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" /> Carregando as pendências…
                    </div>
                ) : erroCarga && !dados ? (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                        <p className="text-3xl mb-2">📵</p>
                        <p className="text-sm font-bold text-gray-900">Não deu para carregar agora</p>
                        <p className="text-xs text-gray-500 mt-1">{erroCarga}</p>
                        <button onClick={carregar}
                            className="mt-4 px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold min-h-[44px]">
                            Tentar de novo
                        </button>
                    </div>
                ) : (
                    <>
                        {/* KPIs */}
                        <div className="space-y-2">
                            <div className={`grid grid-cols-2 gap-2 md:gap-3 ${temKpiSelo ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                                <Kpi valor={k.semNumero} rotulo="Sem número" cor={k.semNumero ? 'text-red-600' : 'text-gray-400'} />
                                <Kpi valor={k.dispensados} rotulo="Dispensados" cor={k.dispensados ? 'text-amber-600' : 'text-gray-400'} />
                                <Kpi valor={k.comProblema} rotulo="Com problema" cor={k.comProblema ? 'text-red-600' : 'text-gray-400'} />
                                <Kpi valor={k.verificados} rotulo="Verificados" cor={k.verificados ? 'text-green-600' : 'text-gray-400'} />
                                {/* "Em uso" = já saiu mensagem NOSSA para aquele número. NÃO quer dizer
                                    que o cliente recebeu, leu ou confirmou nada — o rótulo tem que
                                    continuar sendo exatamente este. */}
                                {/* `col-span-2` no mobile: com 5 cartões em 2 colunas, o 5º ficava
                                    sozinho na última fileira com metade vazia. Ocupando a fileira
                                    inteira ele deixa de parecer sobra e encosta na frase logo
                                    abaixo, que é justamente a explicação DELE. */}
                                {temKpiSelo && (
                                    <Kpi valor={k.emUso} rotulo="Em uso" cor={k.emUso ? 'text-green-600' : 'text-gray-400'}
                                        className="col-span-2 md:col-span-1" />
                                )}
                            </div>
                            {/* Termômetro do selo: quando foi calculado e por que o número pode ser
                                baixo. Sem isto, "Em uso: 0" é lido como defeito — quando na verdade
                                a maioria dos clientes ativos sequer tem número cadastrado. */}
                            {temKpiSelo && (
                                <p className="text-[11px] text-gray-500 leading-relaxed">
                                    {seloAtualizadoEm
                                        ? <>Selo atualizado <span className="font-semibold tabular-nums">{seloAtualizadoEm}</span>.</>
                                        : <>Selo <span className="font-semibold">ainda não calculado</span> — roda sozinho às 04:20, ou use o botão abaixo.</>}
                                    {' '}O selo só existe para quem tem número no campo Celular/WhatsApp
                                    {comNumero != null && k.totalAtivos != null
                                        ? <> — hoje <span className="font-semibold tabular-nums">{comNumero} de {k.totalAtivos}</span> clientes ativos têm</>
                                        : null}.
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2 py-1 font-semibold rounded-full bg-blue-100 text-blue-800 tabular-nums">
                                {k.totalAtivos ?? 0} clientes ativos
                            </span>
                            {filtrosAtivos > 0 && (
                                <button onClick={() => setFiltros({ situacao: 'todas', vendedorId: 'todos', motivo: 'todos' })}
                                    className="px-2 py-1 font-semibold rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">
                                    {filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''} ativo{filtrosAtivos > 1 ? 's' : ''} · limpar
                                </button>
                            )}
                        </div>

                        {/* Interruptor da exigência */}
                        <div className={`rounded-xl border p-4 flex items-start md:items-center justify-between gap-3 flex-col md:flex-row ${dados?.ativo ? 'bg-mint/40 border-primary/30' : 'bg-white border-gray-200'}`}>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Exigir WhatsApp do cliente para ENVIAR pedido</p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {dados?.ativo
                                        ? 'LIGADO — pedido de cliente sem WhatsApp (e sem dispensa registrada) não envia. Salvar como rascunho continua podendo.'
                                        : 'Desligado — recomendação: ligar depois de zerar a lista abaixo, para não travar vendedor em campo.'}
                                </p>
                            </div>
                            <button onClick={toggleExigir} disabled={salvandoConfig || !podeAdministrar}
                                className={`px-4 py-2.5 rounded-full font-semibold text-sm shrink-0 disabled:opacity-50 min-h-[44px] ${dados?.ativo ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primaryDark text-white'}`}>
                                {salvandoConfig ? '…' : (dados?.ativo ? 'Desligar exigência' : 'Ligar exigência')}
                            </button>
                        </div>

                        {/* Interruptor do selo nas listas de campo — INDEPENDENTE do de cima.
                            Ligar aqui não exige WhatsApp de ninguém e não bloqueia pedido:
                            só faz a linha da lista mostrar se o cliente tem número ou não. */}
                        <div className={`rounded-xl border p-4 flex items-start md:items-center justify-between gap-3 flex-col md:flex-row ${dados?.mostrarSeloNasListas ? 'bg-mint/40 border-primary/30' : 'bg-white border-gray-200'}`}>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Mostrar o selo nas listas de campo</p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {dados?.mostrarSeloNasListas
                                        ? 'LIGADO — Rota (Atendimento, Atendidos, Entregas, Entregues) e Painel de Atendimentos mostram, na própria linha, se o cliente tem WhatsApp. É só informação: NÃO exige o número nem bloqueia pedido.'
                                        : 'Desligado — as listas ficam exatamente como estão. Este interruptor é independente do de cima: ligar o selo não passa a exigir WhatsApp para enviar pedido.'}
                                </p>
                            </div>
                            <button onClick={toggleSelo} disabled={salvandoSelo || !podeAdministrar}
                                className={`px-4 py-2.5 rounded-full font-semibold text-sm shrink-0 disabled:opacity-50 min-h-[44px] ${dados?.mostrarSeloNasListas ? 'bg-white border border-primary text-primary hover:bg-mint/40' : 'bg-primary hover:bg-primaryDark text-white'}`}>
                                {salvandoSelo ? '…' : (dados?.mostrarSeloNasListas ? 'Desligar selo' : 'Ligar selo')}
                            </button>
                        </div>

                        {/* Recalcular os selos na hora. O normal é o job diário das 04:20 —
                            sem este botão, no dia em que o módulo entra os selos "Em uso" e
                            "Com problema" ficam zerados até a madrugada seguinte. */}
                        {podeAdministrar && (
                            <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Selos de WhatsApp</p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        {recalculando
                                            ? 'Recalculando… isso leva um tempo (o sistema relê o histórico de mensagens de todos os clientes). Pode deixar a tela aberta.'
                                            : 'São recalculados sozinhos toda madrugada (04:20). Use o botão só se quiser ver o resultado agora.'}
                                    </p>
                                </div>
                                <button onClick={recalcularSelos} disabled={recalculando}
                                    className="px-4 py-2.5 rounded-full font-semibold text-sm shrink-0 bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 flex items-center gap-2 min-h-[44px]">
                                    {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    {recalculando ? 'Recalculando…' : 'Recalcular agora'}
                                </button>
                            </div>
                        )}

                        {/* Filtros */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-3">
                                <div className="relative md:col-span-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={busca}
                                        onChange={e => setBusca(e.target.value)}
                                        placeholder="Nome, documento ou cidade…"
                                        className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </div>
                                <SelectBusca className="w-full" value={filtros.situacao}
                                    onChange={e => setFiltros(f => ({ ...f, situacao: e.target.value }))}>
                                    <option value="todas">Todas as situações</option>
                                    <option value="SEM_NUMERO">Sem número</option>
                                    <option value="DISPENSADO">Dispensado</option>
                                    <option value="COM_PROBLEMA">Número com problema</option>
                                </SelectBusca>
                                <SelectBusca className="w-full" value={filtros.vendedorId}
                                    onChange={e => setFiltros(f => ({ ...f, vendedorId: e.target.value }))}>
                                    <option value="todos">Todos os vendedores</option>
                                    {vendedores.map(v => (
                                        <option key={v.vendedorId ?? 'sem'} value={String(v.vendedorId)}>
                                            {v.vendedorNome || 'Sem vendedor'}
                                        </option>
                                    ))}
                                </SelectBusca>
                                <SelectBusca className="w-full" value={filtros.motivo}
                                    onChange={e => setFiltros(f => ({ ...f, motivo: e.target.value }))}>
                                    <option value="todos">Qualquer motivo de dispensa</option>
                                    {MOTIVOS_DISPENSA.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                                </SelectBusca>
                            </div>
                        </div>

                        {/* Lista agrupada por vendedor */}
                        {grupos.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                                <p className="text-3xl mb-2">💬✅</p>
                                <p className="text-sm font-bold text-gray-900">
                                    {vendedores.length === 0 ? 'Nenhuma pendência' : 'Nada com esses filtros'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {vendedores.length === 0
                                        ? 'Todos os clientes ativos já têm WhatsApp cadastrado.'
                                        : 'Ajuste a busca ou limpe os filtros para ver a lista completa.'}
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-gray-500 tabular-nums">
                                    {totalListado} cliente{totalListado !== 1 ? 's' : ''} em {grupos.length} vendedor{grupos.length !== 1 ? 'es' : ''}
                                </p>
                                {grupos.map(v => (
                                    <div key={v.vendedorId ?? 'sem-vendedor'} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                                            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600 truncate">
                                                {v.vendedorNome || 'Sem vendedor'}
                                            </span>
                                            <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 tabular-nums shrink-0">
                                                {v.clientes.length}
                                            </span>
                                        </div>

                                        {/* Mobile: cards */}
                                        <div className="md:hidden divide-y divide-gray-100">
                                            {v.clientes.map(c => (
                                                <button key={c.uuid} onClick={() => navigate(`/clientes/${c.uuid}`)}
                                                    className="w-full text-left p-4 active:bg-gray-50 min-h-[44px]">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="font-semibold text-gray-900 text-sm leading-snug">{c.nome || '—'}</span>
                                                        <BadgeSituacao situacao={c.situacao} />
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {[c.documento, c.cidade].filter(Boolean).join(' · ') || '—'}
                                                    </div>
                                                    <div className="mt-1"><DetalheDispensa c={c} diasValidade={dados?.diasValidadeDispensa} /></div>
                                                    {c.verificacaoStatus === 'EXISTE' && (
                                                        <p className="text-[11px] text-gray-500 mt-1">Número verificado</p>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Desktop: tabela */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Documento</th>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cidade</th>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispensa</th>
                                                        <th className="px-5 py-3" />
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                                    {v.clientes.map(c => (
                                                        <tr key={c.uuid} onClick={() => navigate(`/clientes/${c.uuid}`)}
                                                            className="hover:bg-gray-50 cursor-pointer">
                                                            <td className="px-5 py-3 text-gray-900 font-medium">{c.nome || '—'}</td>
                                                            <td className="px-5 py-3 text-gray-600 tabular-nums">{c.documento || '—'}</td>
                                                            <td className="px-5 py-3 text-gray-600">{c.cidade || '—'}</td>
                                                            <td className="px-5 py-3"><BadgeSituacao situacao={c.situacao} /></td>
                                                            <td className="px-5 py-3"><DetalheDispensa c={c} diasValidade={dados?.diasValidadeDispensa} /></td>
                                                            <td className="px-5 py-3 text-right">
                                                                <ChevronRight className="h-4 w-4 text-gray-400 inline" />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}

                        <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            A dispensa vale por tempo limitado
                            {dados?.diasValidadeDispensa ? ` (${dados.diasValidadeDispensa} dias)` : ''} — depois disso o cliente
                            volta a pedir o número. O nome de quem dispensou e a data ficam registrados.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
