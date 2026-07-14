import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasPagarService from '../../services/contasPagarService';
import fornecedorService from '../../services/fornecedorService';
import {
    Wallet, X, Trash2, FileText, RefreshCw, MoreVertical, Loader2, Undo2, Filter, Package, UploadCloud, Printer, Copy
} from 'lucide-react';
import toast from 'react-hot-toast';
import ImportarCaModal from './ImportarCaModal';
import ComboBusca from '../../components/ComboBusca';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { formatarDoc } from '../../utils/documento'; // CNPJ/CPF (inclui alfanumérico)

const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
// Período por DATA (YYYY-MM-DD). Default: do 1º ao último dia do mês corrente.
const primeiroDiaMesAtual = () => `${mesAtual()}-01`;
const ultimoDiaDoMes = (ym) => { const [a, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`; };
const ultimoDiaMesAtual = () => ultimoDiaDoMes(mesAtual());

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
// Valor unitário: até 4 casas para não perder precisão em itens baratos (ex.: R$ 0,3333)
const fmtUnit = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const toYMD = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const parseNum = (v) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;

const STATUS_PARCELA = {
    ABERTO: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800' },
    PENDENTE: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800' },
    VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
    PARCIAL: { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-800' },
    PAGO: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-700' }
};

const FORMAS_PGTO = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão'];

const STATUS_OPCOES = [
    { value: '', label: 'Status: Todos' },
    { value: 'ABERTO', label: 'Aberto' },
    { value: 'VENCIDO', label: 'Vencido' },
    { value: 'PARCIAL', label: 'Parcial' },
    { value: 'PAGO', label: 'Pago' },
    { value: 'CANCELADO', label: 'Cancelado' }
];

// Nome do fornecedor com fallback seguro (nunca "undefined")
const nomeFornecedor = (f) => f?.nomeFantasia || f?.razaoSocial || 'Sem fornecedor';

// ── Recibo A4 ─────────────────────────────────────────────
const EMPRESA = {
    nome: 'HARDT DOCES E SALGADOS LTDA',
    cnpj: '08.766.459/0001-02',
    ie: '255372744',
    endereco: 'R 15 DE OUTUBRO, 170, Joinville - SC',
    cep: '89239-700',
    cidadeUf: 'Joinville (SC)'
};

// Valor por extenso em pt-BR (até centenas de milhões), com centavos
const extensoAte999 = (n) => {
    const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100;
    const dezenas = r < 20 ? U[r] : `${D[Math.floor(r / 10)]}${r % 10 ? ` e ${U[r % 10]}` : ''}`;
    return [c ? C[c] : '', r ? dezenas : ''].filter(Boolean).join(' e ');
};
const valorPorExtenso = (valor) => {
    const cents = Math.round(Number(valor || 0) * 100);
    const inteiro = Math.floor(cents / 100);
    const centavos = cents % 100;
    const partes = [];
    const milhoes = Math.floor(inteiro / 1000000);
    const milhares = Math.floor((inteiro % 1000000) / 1000);
    const resto = inteiro % 1000;
    if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${extensoAte999(milhoes)} milhões`);
    if (milhares) partes.push(milhares === 1 ? 'mil' : `${extensoAte999(milhares)} mil`);
    if (resto) partes.push(extensoAte999(resto));
    const reais = inteiro > 0 ? `${partes.join(' e ')} ${inteiro === 1 ? 'real' : 'reais'}` : '';
    const centTxt = centavos > 0 ? `${extensoAte999(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : '';
    const texto = [reais, centTxt].filter(Boolean).join(' e ') || 'zero real';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Imprime o recibo NA PRÓPRIA PÁGINA (@media print) — nunca window.open/iframe (regra do PWA/iPad)
const imprimirRecibo = (conta, parcela, totalParcelas) => {
    const pagamentos = (parcela.pagamentos || []).filter(pg => !pg.estornado);
    const totalPago = pagamentos.reduce((s, pg) => s + Number(pg.valorPago || 0) + Number(pg.juros || 0) + Number(pg.multa || 0), 0);
    const pago = totalPago > 0.009;
    const valor = pago ? totalPago : Number(parcela.valor || 0);
    const forn = conta.fornecedor || {};
    const nomeForn = forn.razaoSocial || forn.nomeFantasia || 'FORNECEDOR';

    // Referência: O QUE está sendo pago (descrição + nota + categoria + parcela)
    const refPartes = [];
    if (conta.descricao) refPartes.push(`"${conta.descricao}"`);
    if (conta.numeroNota) refPartes.push(`nota ${conta.numeroNota}`);
    if (conta.categoria) refPartes.push(conta.categoria);
    const refTexto = refPartes.length ? refPartes.join(' · ') : 'despesa sem descrição';
    const parcTexto = totalParcelas > 1 ? `da parcela ${parcela.numeroParcela}/${totalParcelas}` : 'da parcela única';
    const vencTexto = parcela.dataVencimento ? `, com vencimento em ${fmtData(parcela.dataVencimento)}` : '';

    const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

    const corpoHtml = `
        <div class="rc">
            <div class="rc-rule"></div>
            <div class="rc-header">
                <img src="/logo-hardt.png" alt="Hardt" class="rc-logo" />
                <div class="rc-emp">
                    <div>${escapeHtml(EMPRESA.nome)}</div>
                    <div>CNPJ/CPF: ${EMPRESA.cnpj} &nbsp;IE: ${EMPRESA.ie}</div>
                    <div>${escapeHtml(EMPRESA.endereco)}</div>
                    <div>CEP: ${EMPRESA.cep}</div>
                </div>
            </div>
            <div class="rc-rule"></div>
            <div class="rc-titulo">
                <h1>Recibo</h1>
                <div class="rc-valor"><span>R$</span>${fmt(valor)}</div>
            </div>
            <div class="rc-dash"></div>
            <p class="rc-texto">
                Recebi de <b>${escapeHtml(EMPRESA.nome)}</b> a importância de <b>${escapeHtml(valorPorExtenso(valor))}</b>
                referente ao pagamento ${pago ? 'total ' : ''}${parcTexto} de ${escapeHtml(refTexto)}${vencTexto}.
            </p>
            <p class="rc-texto">
                Para confirmar a veracidade deste documento e da quantia paga, assino neste documento
                firmando o presente recibo nesta data.
            </p>
            <p class="rc-data">${EMPRESA.cidadeUf}, ${dataExtenso}</p>
            <div class="rc-assinatura">
                <div class="rc-linha"></div>
                <div class="rc-nome">${escapeHtml(String(nomeForn).toUpperCase())}</div>
                ${forn.cnpjCpf ? `<div class="rc-doc">CNPJ/CPF: ${escapeHtml(formatarDoc(forn.cnpjCpf))}</div>` : ''}
            </div>
        </div>`;

    const estilos = `
        .rc { font-family: 'Manrope', -apple-system, sans-serif; color: rgba(0,0,0,0.87); max-width: 180mm; margin: 0 auto; padding-top: 6mm; }
        .rc-rule { border-top: 2.5pt solid #111; margin: 6mm 0; }
        .rc-header { display: flex; align-items: center; gap: 8mm; padding: 2mm 0; }
        .rc-logo { height: 22mm; width: auto; }
        .rc-emp { font-size: 11pt; color: #666; line-height: 1.65; }
        .rc-titulo { display: flex; align-items: baseline; justify-content: space-between; margin: 4mm 0 2mm; }
        .rc-titulo h1 { font-size: 26pt; font-weight: 800; margin: 0; color: #111; }
        .rc-valor { font-size: 24pt; font-weight: 500; color: #777; }
        .rc-valor span { font-size: 13pt; margin-right: 1mm; }
        .rc-dash { border-top: 1.5pt dashed #999; margin: 3mm 0 10mm; }
        .rc-texto { font-size: 12.5pt; line-height: 1.6; margin: 0 0 8mm; }
        .rc-data { text-align: center; font-size: 12.5pt; margin: 14mm 0 18mm; }
        .rc-assinatura { text-align: center; }
        .rc-linha { border-top: 1pt solid #111; width: 70%; margin: 0 auto 3mm; }
        .rc-nome { font-size: 12.5pt; letter-spacing: 0.03em; }
        .rc-doc { font-size: 12pt; margin-top: 2mm; }`;

    // Padrão do projeto: monta na página, esconde o app com display:none e limpa depois
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    style.textContent = `
        @page { size: A4 portrait; margin: 12mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
            body > *:not(#area-impressao) { display: none !important; }
            #root { display: none !important; }
            #area-impressao { display: block !important; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${estilos}
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000);
    void area.offsetHeight;
    window.print(); // síncrono no clique (senão o iOS bloqueia)
};

// Parcela vencida e ainda em aberto?
const parcelaVencida = (p) => {
    if (!p) return false;
    if (p.status === 'VENCIDO') return true;
    const emAberto = p.status === 'ABERTO' || p.status === 'PENDENTE' || p.status === 'PARCIAL';
    return emAberto && toYMD(p.dataVencimento) !== '' && toYMD(p.dataVencimento) < hojeYMD();
};

// Badge da coluna "Conta Azul" (envio da conta + baixa via DDA da parcela)
const BadgeCA = ({ conta, parcela }) => {
    if (parcela?.baixadoViaCA) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Baixado via DDA ✓</span>;
    }
    const s = String(conta?.statusEnvioCA || '').toUpperCase();
    if (s === 'ENVIADO' || s === 'SINCRONIZADO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Enviado ✓</span>;
    }
    if (s === 'ERRO') {
        return (
            <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 whitespace-nowrap cursor-help"
                title={conta?.erroEnvioCA || 'Erro ao enviar para a Conta Azul'}
            >
                Erro
            </span>
        );
    }
    if (s === 'ENVIAR' || s === 'ENVIANDO' || s === 'PENDENTE' || s === 'AGUARDANDO_PROTOCOLO') {
        return (
            <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap cursor-help"
                title="Na fila para a Conta Azul. Se houver fornecedor novo, ele é criado lá primeiro; pode levar alguns minutos."
            >
                Enviando…
            </span>
        );
    }
    return <span className="text-gray-500 text-xs">—</span>;
};

const BadgeStatusParcela = ({ parcela }) => {
    const status = parcelaVencida(parcela) ? 'VENCIDO' : (parcela?.status || 'ABERTO');
    const cfg = STATUS_PARCELA[status] || STATUS_PARCELA.ABERTO;
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cfg.cls}`}>{cfg.label}</span>;
};

// Opções de mês (12 últimos meses, mais recente primeiro)
const labelMesAno = (mesYM) => {
    const [ano, mes] = mesYM.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    const l = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return (l.charAt(0).toUpperCase() + l.slice(1)).replace(' de ', '/');
};

// Últimos 24 meses (mais recente primeiro) — cobre o histórico importado do Conta Azul
const mesesOpcoes = () => {
    const ops = [];
    const agora = new Date();
    for (let i = 0; i < 24; i++) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        ops.push({ value, label: labelMesAno(value) });
    }
    return ops;
};

const nomeMes = (mesYM) => {
    if (!mesYM) return 'no mês';
    const [ano, mes] = mesYM.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long' });
};

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (sem virar dia anterior por fuso)
const dmy = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

// Rótulo do período (datas) escolhido — para cabeçalho e KPIs
const rotuloPeriodo = (de, ate) => {
    if (!de && !ate) return 'Todas as datas';
    if (de && ate && de === ate) return dmy(de);
    if (de && ate) return `${dmy(de)} → ${dmy(ate)}`;
    if (de) return `A partir de ${dmy(de)}`;
    return `Até ${dmy(ate)}`;
};

// ═══════════════════════════════════════════════════════════
// PÁGINA
// ═══════════════════════════════════════════════════════════
const ContasPagarPage = () => {
    const { hasPermission } = useAuth();
    const podeBaixar = hasPermission('Pode_Baixar_Contas_Pagar');

    const [kpis, setKpis] = useState({});
    const [contas, setContas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categorias, setCategorias] = useState([]);
    const [categoriasErro, setCategoriasErro] = useState(false);
    const [fornecedores, setFornecedores] = useState([]);

    // Só status/categoria persistem (por usuário/tela). Busca é texto livre e o
    // período tem padrão calculado (mês corrente) — persistir prenderia o usuário
    // num mês velho.
    const [filtrosSalvos, setFiltrosSalvos] = useFiltrosSalvos('contas-pagar', { status: '', categoria: '' });
    const [filtros, setFiltros] = useState({
        busca: '',
        status: filtrosSalvos.status,
        categoria: filtrosSalvos.categoria,
        dataDe: primeiroDiaMesAtual(), // '' = sem início (mais antigo)
        dataAte: ultimoDiaMesAtual()   // '' = sem fim (mais novo). Ambos '' = todas as datas
    });
    const [buscaInput, setBuscaInput] = useState('');

    // Espelha no armazenamento só a parte persistível dos filtros
    useEffect(() => {
        setFiltrosSalvos({ status: filtros.status, categoria: filtros.categoria });
    }, [filtros.status, filtros.categoria]); // eslint-disable-line react-hooks/exhaustive-deps

    // Quantos filtros estão ativos (para sinalizar na tela)
    const filtrosAtivos = useMemo(() => {
        let n = 0;
        if (filtros.busca) n++;
        if (filtros.status) n++;
        if (filtros.categoria) n++;
        // período diferente do padrão (mês corrente: 1º ao último dia)
        if (filtros.dataDe !== primeiroDiaMesAtual() || filtros.dataAte !== ultimoDiaMesAtual()) n++;
        return n;
    }, [filtros]);

    // Rótulo curto do período para os KPIs ("Em aberto (…)")
    const kpiPeriodo = useMemo(() => {
        if (!filtros.dataDe && !filtros.dataAte) return 'total';
        return 'período';
    }, [filtros.dataDe, filtros.dataAte]);
    const periodoAtivo = filtros.dataDe !== primeiroDiaMesAtual() || filtros.dataAte !== ultimoDiaMesAtual();

    const limparFiltros = () => {
        setFiltros({ busca: '', status: '', categoria: '', dataDe: primeiroDiaMesAtual(), dataAte: ultimoDiaMesAtual() });
        setBuscaInput('');
    };

    // Modais
    const [despesaModal, setDespesaModal] = useState(null); // { conta: null } = nova | { conta } = editar
    const [importarModal, setImportarModal] = useState(false); // importar CSV do Conta Azul
    const [baixaModal, setBaixaModal] = useState(null);     // { conta, parcela }
    const [detalheConta, setDetalheConta] = useState(null); // conta


    // Debounce da busca
    useEffect(() => {
        const t = setTimeout(() => setFiltros(f => ({ ...f, busca: buscaInput })), 400);
        return () => clearTimeout(t);
    }, [buscaInput]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filtros.busca) params.busca = filtros.busca;
            if (filtros.status) params.status = filtros.status;
            if (filtros.categoria) params.categoria = filtros.categoria;
            if (filtros.dataDe) params.de = filtros.dataDe;
            if (filtros.dataAte) params.ate = filtros.dataAte;
            const data = await contasPagarService.listar(params);
            setKpis(data?.kpis || {});
            setContas(data?.contas || []);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar contas a pagar');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        contasPagarService.categorias()
            .then(cats => { setCategorias(Array.isArray(cats) ? cats : []); setCategoriasErro(false); })
            .catch(() => setCategoriasErro(true));
        fornecedorService.listar().then(f => setFornecedores(Array.isArray(f) ? f : [])).catch(() => {});
    }, []);

    // Uma linha por parcela
    const linhas = useMemo(() => {
        const flat = [];
        contas.forEach(c => {
            const totalParcelas = (c.parcelas || []).length;
            (c.parcelas || []).forEach(p => flat.push({ conta: c, parcela: p, totalParcelas }));
        });
        let rows = flat;
        // Período por VENCIMENTO da parcela: o backend devolve a conta inteira se
        // qualquer parcela cair no período — aqui filtramos as LINHAS para mostrar
        // só as parcelas que vencem dentro dele (ex.: seguro 12x não inunda o mês).
        if (filtros.dataDe || filtros.dataAte) {
            rows = rows.filter(({ parcela }) => {
                const v = toYMD(parcela.dataVencimento);
                if (!v) return true;
                if (filtros.dataDe && v < filtros.dataDe) return false;
                if (filtros.dataAte && v > filtros.dataAte) return false;
                return true;
            });
        }
        if (filtros.status) {
            rows = rows.filter(({ parcela }) => {
                const s = parcela.status;
                const emAberto = s === 'ABERTO' || s === 'PENDENTE' || s === 'PARCIAL';
                switch (filtros.status) {
                    // "Aberto" = toda parcela não paga (vencida ou não) — bate com o KPI "Em aberto"
                    case 'ABERTO': return emAberto;
                    case 'VENCIDO': return parcelaVencida(parcela);
                    case 'PARCIAL': return s === 'PARCIAL';
                    case 'PAGO': return s === 'PAGO';
                    case 'CANCELADO': return s === 'CANCELADO';
                    default: return true;
                }
            });
        }
        return rows.sort((a, b) => String(a.parcela.dataVencimento || '').localeCompare(String(b.parcela.dataVencimento || '')));
    }, [contas, filtros.status, filtros.dataDe, filtros.dataAte]);

    const abrirBaixa = (conta, parcela) => setBaixaModal({ conta, parcela });

    const podeBaixarParcela = (conta, parcela) =>
        podeBaixar && conta.status !== 'CANCELADO' &&
        parcela.status !== 'PAGO' && parcela.status !== 'CANCELADO';

    // Seleção múltipla para quitar várias parcelas de uma vez (mesma data/forma/banco)
    const [selecionadas, setSelecionadas] = useState(() => new Set());
    const [baixaLoteModal, setBaixaLoteModal] = useState(false);
    const idsSelecionaveis = useMemo(
        () => linhas.filter(({ conta, parcela }) => podeBaixarParcela(conta, parcela)).map(({ parcela }) => parcela.id),
        [linhas] // eslint-disable-line react-hooks/exhaustive-deps
    );
    const toggleSel = (id) => setSelecionadas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const limparSel = () => setSelecionadas(new Set());
    const todasMarcadas = idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionadas.has(id));
    const toggleTodas = () => setSelecionadas(todasMarcadas ? new Set() : new Set(idsSelecionaveis));
    const valorSelecionado = useMemo(() => {
        let s = 0;
        linhas.forEach(({ parcela }) => {
            if (selecionadas.has(parcela.id)) s += Math.max(0, Number(parcela.valor || 0) - Number(parcela.valorPago || 0));
        });
        return s;
    }, [linhas, selecionadas]);

    const recarregarFornecedores = () =>
        fornecedorService.listar().then(f => setFornecedores(Array.isArray(f) ? f : [])).catch(() => {});

    return (
    <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Wallet className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Contas a Pagar</h1>
                </div>
                {podeBaixar && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setImportarModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium"
                            title="Importar o CSV de Contas a pagar exportado do Conta Azul"
                        >
                            <UploadCloud className="h-4 w-4" />
                            <span className="hidden sm:inline">Importar do CA</span>
                        </button>
                        <button
                            onClick={() => setDespesaModal({ conta: null })}
                            className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm text-xs md:text-sm font-semibold"
                        >
                            + Nova Despesa
                        </button>
                    </div>
                )}
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Vencidas</div>
                        <div className="text-lg md:text-2xl font-bold text-red-600 mt-1">R$ {fmt(kpis?.vencidas?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.vencidas?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Próximos 7 dias</div>
                        <div className="text-lg md:text-2xl font-bold text-gray-900 mt-1">R$ {fmt(kpis?.proximos7?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.proximos7?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Em aberto ({kpiPeriodo})</div>
                        <div className="text-lg md:text-2xl font-bold text-gray-900 mt-1">R$ {fmt(kpis?.abertoMes?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.abertoMes?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Pago no mês</div>
                        <div className="text-lg md:text-2xl font-bold text-green-600 mt-1">R$ {fmt(kpis?.pagoMes?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.pagoMes?.qtd || 0)} parcela(s)</div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2">
                    <div className="flex flex-col md:flex-row gap-2">
                        <input
                            value={buscaInput}
                            onChange={e => setBuscaInput(e.target.value)}
                            placeholder="Buscar fornecedor ou descrição…"
                            className={`w-full md:w-64 border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none ${filtros.busca ? '!border-primary bg-blue-50/60' : 'border-gray-300 focus:border-primary'}`}
                        />
                        <SelectBusca
                            value={filtros.status}
                            onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}
                            className="w-full md:w-44"
                        >
                            {STATUS_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </SelectBusca>
                        <SelectBusca
                            value={filtros.categoria}
                            onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}
                            className="w-full md:w-44"
                        >
                            <option value="">Categoria: Todas</option>
                            {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                        </SelectBusca>
                        {/* Período por vencimento: De (data) … Até (data) */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <input
                                type="date"
                                value={filtros.dataDe}
                                max={filtros.dataAte || undefined}
                                onChange={e => setFiltros(f => ({ ...f, dataDe: e.target.value }))}
                                title="Data inicial (vencimento)"
                                className={`flex-1 md:flex-none md:w-40 border rounded px-3 py-2 text-sm text-gray-700 focus:outline-none ${periodoAtivo ? '!border-primary bg-blue-50/60 font-medium' : 'border-gray-300 focus:border-primary'}`}
                            />
                            <span className="text-sm text-gray-500 shrink-0">até</span>
                            <input
                                type="date"
                                value={filtros.dataAte}
                                min={filtros.dataDe || undefined}
                                onChange={e => setFiltros(f => ({ ...f, dataAte: e.target.value }))}
                                title="Data final (vencimento)"
                                className={`flex-1 md:flex-none md:w-40 border rounded px-3 py-2 text-sm text-gray-700 focus:outline-none ${periodoAtivo ? '!border-primary bg-blue-50/60 font-medium' : 'border-gray-300 focus:border-primary'}`}
                            />
                        </div>
                    </div>
                    {filtrosAtivos > 0 && (
                        <div className="flex items-center gap-2 pt-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                <Filter className="h-3 w-3" /> {filtrosAtivos} filtro{filtrosAtivos > 1 ? 's' : ''} ativo{filtrosAtivos > 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={limparFiltros}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 min-h-[32px]"
                            >
                                Limpar filtros
                            </button>
                        </div>
                    )}
                </div>

                {loading && (
                    <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Barra de ações em lote */}
                {podeBaixar && selecionadas.size > 0 && (
                    <div className="sticky top-2 z-20 bg-primary text-white rounded-lg px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
                        <span className="text-sm font-medium">
                            {selecionadas.size} selecionada(s) · R$ {fmt(valorSelecionado)}
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={limparSel} className="text-xs px-3 py-1.5 rounded bg-white/15 hover:bg-white/25">Limpar</button>
                            <button onClick={() => setBaixaLoteModal(true)} className="text-xs font-semibold px-3 py-1.5 rounded bg-white text-primary hover:bg-gray-100">
                                Quitar selecionadas
                            </button>
                        </div>
                    </div>
                )}

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                    {linhas.length === 0 && !loading && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-500">
                            Nenhuma parcela encontrada.
                        </div>
                    )}
                    {linhas.map(({ conta, parcela, totalParcelas }) => (
                        <div key={parcela.id} className={`bg-white rounded-xl border shadow-sm p-4 ${selecionadas.has(parcela.id) ? 'border-primary ring-1 ring-primary' : 'border-gray-200'}`} onClick={() => setDetalheConta(conta)}>
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {podeBaixarParcela(conta, parcela) && (
                                        <input
                                            type="checkbox"
                                            checked={selecionadas.has(parcela.id)}
                                            onClick={e => e.stopPropagation()}
                                            onChange={() => toggleSel(parcela.id)}
                                            className="rounded shrink-0 h-4 w-4"
                                        />
                                    )}
                                    <span className="font-semibold text-gray-900 truncate">{nomeFornecedor(conta.fornecedor)}</span>
                                </div>
                                <BadgeStatusParcela parcela={parcela} />
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                                {conta.descricao || 'Sem descrição'}
                                {conta.numeroNota ? ` · Nota ${conta.numeroNota}` : ''}
                                {` · parc. ${parcela.numeroParcela}/${totalParcelas}`}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <div>
                                    <div className={`text-xs ${parcelaVencida(parcela) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                        {parcela.status === 'PAGO'
                                            ? `Pago ${fmtData(parcela.dataPagamento)}`
                                            : `${parcelaVencida(parcela) ? 'Venceu' : 'Vence'} ${fmtData(parcela.dataVencimento)}`}
                                    </div>
                                    <div className="font-bold text-gray-900">R$ {fmt(parcela.valor)}</div>
                                </div>
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <BadgeCA conta={conta} parcela={parcela} />
                                    {podeBaixarParcela(conta, parcela) && (
                                        <button
                                            onClick={() => abrirBaixa(conta, parcela)}
                                            className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                        >
                                            Baixar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                            {`DESPESAS · ${rotuloPeriodo(filtros.dataDe, filtros.dataAte).toUpperCase()}`}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="pl-5 pr-1 py-3 w-8">
                                        {podeBaixar && idsSelecionaveis.length > 0 && (
                                            <input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} className="rounded h-4 w-4" title="Selecionar todas" />
                                        )}
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nota</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Parcela</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta Azul</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {linhas.length === 0 && !loading && (
                                    <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-500">Nenhuma parcela encontrada.</td></tr>
                                )}
                                {linhas.map(({ conta, parcela, totalParcelas }) => (
                                    <tr
                                        key={parcela.id}
                                        onClick={() => setDetalheConta(conta)}
                                        title="Ver detalhes desta despesa"
                                        className={`hover:bg-gray-50 cursor-pointer ${selecionadas.has(parcela.id) ? 'bg-blue-50/60' : parcela.status === 'PAGO' ? 'bg-green-50/40' : ''}`}
                                    >
                                        <td className="pl-5 pr-1 py-3 w-8" onClick={e => e.stopPropagation()}>
                                            {podeBaixarParcela(conta, parcela) && (
                                                <input
                                                    type="checkbox"
                                                    checked={selecionadas.has(parcela.id)}
                                                    onChange={() => toggleSel(parcela.id)}
                                                    className="rounded h-4 w-4"
                                                />
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-gray-900 font-medium">{nomeFornecedor(conta.fornecedor)}</td>
                                        <td className="px-5 py-3 text-gray-600">
                                            {conta.descricao || '—'}
                                            {conta.categoria ? <span className="text-gray-500"> · {conta.categoria}</span> : null}
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{conta.numeroNota || <span className="text-gray-500">—</span>}</td>
                                        <td className="px-5 py-3 text-gray-600">{parcela.numeroParcela}/{totalParcelas}</td>
                                        <td className={`px-5 py-3 ${parcelaVencida(parcela) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                            {fmtData(parcela.dataVencimento)}
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold text-gray-900">R$ {fmt(parcela.valor)}</td>
                                        <td className="px-5 py-3"><BadgeStatusParcela parcela={parcela} /></td>
                                        <td className="px-5 py-3"><BadgeCA conta={conta} parcela={parcela} /></td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            {podeBaixarParcela(conta, parcela) && (
                                                <button
                                                    onClick={() => abrirBaixa(conta, parcela)}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                                >
                                                    Baixar
                                                </button>
                                            )}
                                            {/* Ícone PDF quando a conta tem documento anexado */}
                                            {conta.temPdf && (
                                                <span
                                                    title={`PDF: ${conta.pdfNome}`}
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-50 border border-green-200 text-green-700 font-semibold"
                                                >
                                                    <FileText className="h-3 w-3" />PDF
                                                </span>
                                            )}
                                            <button
                                                onClick={() => setDetalheConta(conta)}
                                                title="Detalhes e ações"
                                                className="ml-1 p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Banner explicativo do ciclo DDA */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Como funciona a baixa automática:</span>{' '}
                    a despesa criada aqui é enviada à Conta Azul → lá você vincula ao DDA e paga como hoje → o sistema confere as baixas na Conta Azul a cada 30 minutos e marca como <span className="font-semibold">Pago</span> sozinho (igual o Contas a Receber já faz).
                </div>
            </div>

            {/* Modal Importar do Conta Azul (CSV) */}
            {importarModal && (
                <ImportarCaModal
                    onClose={() => setImportarModal(false)}
                    onSuccess={() => { setImportarModal(false); fetchData(); }}
                />
            )}

            {/* Modal Nova/Editar Despesa */}
            {despesaModal && (
                <DespesaModal
                    conta={despesaModal.conta}
                    base={despesaModal.base}
                    categorias={categorias}
                    categoriasErro={categoriasErro}
                    fornecedores={fornecedores}
                    onFornecedoresChanged={recarregarFornecedores}
                    onClose={() => setDespesaModal(null)}
                    onSuccess={() => { setDespesaModal(null); setDetalheConta(null); fetchData(); }}
                />
            )}

            {/* Modal Baixar parcela */}
            {baixaModal && (
                <BaixaParcelaModal
                    conta={baixaModal.conta}
                    parcela={baixaModal.parcela}
                    onClose={() => setBaixaModal(null)}
                    onSuccess={() => { setBaixaModal(null); setDetalheConta(null); fetchData(); }}
                />
            )}

            {/* Modal Quitar em lote */}
            {baixaLoteModal && (
                <BaixaLoteModal
                    parcelaIds={[...selecionadas]}
                    valorTotal={valorSelecionado}
                    onClose={() => setBaixaLoteModal(false)}
                    onSuccess={() => { setBaixaLoteModal(false); limparSel(); fetchData(); }}
                />
            )}

            {/* Modal detalhes da conta (ações secundárias) */}
            {detalheConta && (
                <DetalheContaModal
                    conta={detalheConta}
                    podeBaixar={podeBaixar}
                    onClose={() => setDetalheConta(null)}
                    onEditar={(c) => setDespesaModal({ conta: c })}
                    onDuplicar={(c) => { setDetalheConta(null); setDespesaModal({ conta: null, base: c }); }}
                    onBaixar={(c, p) => setBaixaModal({ conta: c, parcela: p })}
                    onChanged={() => { setDetalheConta(null); fetchData(); }}
                />
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL NOVA / EDITAR DESPESA
// ═══════════════════════════════════════════════════════════
const DespesaModal = ({ conta, base, categorias, categoriasErro, fornecedores, onFornecedoresChanged, onClose, onSuccess }) => {
    const editando = !!conta;
    // `base` = despesa usada como MOLDE ao Duplicar
    const molde = !editando && base ? base : null;

    const [fornecedorId, setFornecedorId] = useState(conta?.fornecedor?.id || molde?.fornecedor?.id || '');
    const [descricao, setDescricao] = useState(conta?.descricao || molde?.descricao || '');
    const [categoria, setCategoria] = useState(conta?.categoria || molde?.categoria || '');
    const [numeroNota, setNumeroNota] = useState(conta?.numeroNota || '');
    const [competencia, setCompetencia] = useState(conta?.competencia || '');
    const [observacoes, setObservacoes] = useState(conta?.observacoes || molde?.observacoes || '');
    const [enviarCA, setEnviarCA] = useState(true);
    const [valorTotal, setValorTotal] = useState(conta?.valorTotal != null ? fmt(conta.valorTotal) : (molde?.valorTotal != null ? fmt(molde.valorTotal) : ''));
    const [salvando, setSalvando] = useState(false);
    // PDF opcional: arquivo selecionado pelo usuário será enviado após salvar a despesa
    const [pdfArquivo, setPdfArquivo] = useState(null);
    const pdfInputRef = useState(null);

    // Condição de pagamento (forma + banco) — obrigatória ao enviar ao CA (só na criação).
    // "Já paguei" (ex.: dinheiro do caixinha) marca a despesa como quitada no Conta Azul.
    const [modoPagamento, setModoPagamento] = useState('DDA'); // 'DDA' (ainda vou pagar) | 'PAGO' (já paguei)
    const [metodoPagamento, setMetodoPagamento] = useState('');
    const [contaFinanceiraCaId, setContaFinanceiraCaId] = useState('');
    const [dataPagamento, setDataPagamento] = useState(hojeYMD());
    const [opcoesBaixa, setOpcoesBaixa] = useState({ contasFinanceiras: [], metodosPagamento: [] });
    const [opcoesCarregadas, setOpcoesCarregadas] = useState(false);
    const [loadingOpcoes, setLoadingOpcoes] = useState(false);
    const pago = !editando && enviarCA && modoPagamento === 'PAGO';

    // Carrega bancos + formas do CA quando a despesa vai ao CA (forma+banco são obrigatórios).
    useEffect(() => {
        if (editando || !enviarCA || opcoesCarregadas || loadingOpcoes) return;
        setLoadingOpcoes(true);
        contasPagarService.opcoesBaixa()
            .then(op => {
                const cf = Array.isArray(op?.contasFinanceiras) ? op.contasFinanceiras : [];
                const mp = Array.isArray(op?.metodosPagamento) ? op.metodosPagamento : [];
                setOpcoesBaixa({ contasFinanceiras: cf, metodosPagamento: mp });
                const padrao = cf.find(c => c.padrao) || cf[0];
                setContaFinanceiraCaId(prev => prev || padrao?.id || '');
                setOpcoesCarregadas(true);
            })
            .catch(() => toast.error('Não consegui carregar os bancos do Conta Azul.'))
            .finally(() => setLoadingOpcoes(false));
    }, [editando, enviarCA, opcoesCarregadas, loadingOpcoes]);

    // Parcelas: em edição, parcelas pagas ficam travadas
    const [parcelas, setParcelas] = useState(() => {
        if (conta?.parcelas?.length) {
            return conta.parcelas.map(p => ({
                id: p.id,
                dataVencimento: toYMD(p.dataVencimento),
                valor: fmt(p.valor),
                paga: p.status === 'PAGO' || p.status === 'PARCIAL'
            }));
        }
        // Duplicando: copia datas e valores do molde, todas em aberto e sem ids
        if (molde?.parcelas?.length) {
            return molde.parcelas
                .filter(p => p.status !== 'CANCELADO')
                .map(p => ({ dataVencimento: toYMD(p.dataVencimento), valor: fmt(p.valor), paga: false }));
        }
        return [{ dataVencimento: hojeYMD(), valor: '', paga: false }];
    });

    // Opções do combobox de fornecedor (nome + fantasia/CNPJ na linha de baixo, tudo buscável)
    const opcoesFornecedor = useMemo(() => fornecedores.map(f => ({
        value: f.id,
        label: f.razaoSocial || f.nomeFantasia || 'Sem nome',
        sub: [f.razaoSocial && f.nomeFantasia ? f.nomeFantasia : null, f.cnpjCpf].filter(Boolean).join(' · ')
    })), [fornecedores]);

    // ── Produtos comprados (opcional, só ao criar): dão entrada no estoque e atualizam o custo ──
    const [mostraProdutos, setMostraProdutos] = useState(false);
    const [itensCompra, setItensCompra] = useState([]); // { vinculo, nome, unidade, sub, quantidade, valorUnitario, valorTotal }
    const [opcoesProd, setOpcoesProd] = useState(null); // null = ainda não carregado
    const [carregandoProds, setCarregandoProds] = useState(false);

    const abrirProdutos = () => {
        setMostraProdutos(true);
        if (opcoesProd !== null) return;
        setCarregandoProds(true);
        contasPagarService.produtosOpcoes()
            .then(o => setOpcoesProd(Array.isArray(o) ? o : []))
            .catch(() => { setOpcoesProd([]); toast.error('Não consegui carregar a lista de produtos.'); })
            .finally(() => setCarregandoProds(false));
    };

    // Opções do combobox de produto (sem os que já estão na lista da despesa)
    const opcoesProdCombo = useMemo(() => (opcoesProd || [])
        .filter(o => !itensCompra.some(it => it.vinculo === o.value))
        .map(o => ({
            value: o.value,
            label: `${o.nome}${o.unidade ? ` (${o.unidade})` : ''}`,
            sub: o.sub
        })), [opcoesProd, itensCompra]);

    const addItemCompra = (value) => {
        const op = (opcoesProd || []).find(o => o.value === value);
        if (!op) return;
        if (itensCompra.some(it => it.vinculo === op.value)) {
            toast.error('Este produto já está na lista.');
            return;
        }
        setItensCompra(prev => [...prev, { vinculo: op.value, nome: op.nome, unidade: op.unidade, sub: op.sub, quantidade: '', valorUnitario: '', valorTotal: '' }]);
    };
    // Cálculo automático nos dois sentidos: qtd + unitário → total, ou qtd + total → unitário
    const setItemCompra = (idx, campo, valor) =>
        setItensCompra(prev => prev.map((it, i) => {
            if (i !== idx) return it;
            const n = { ...it, [campo]: valor };
            const qtd = parseNum(n.quantidade);
            if (campo === 'valorUnitario') {
                const unit = parseNum(valor);
                if (qtd > 0 && unit > 0) n.valorTotal = fmt(qtd * unit);
            } else if (campo === 'valorTotal') {
                const tot = parseNum(valor);
                if (qtd > 0 && tot > 0) n.valorUnitario = fmtUnit(tot / qtd);
            } else if (campo === 'quantidade') {
                const unit = parseNum(n.valorUnitario);
                const tot = parseNum(n.valorTotal);
                if (qtd > 0 && unit > 0) n.valorTotal = fmt(qtd * unit);
                else if (qtd > 0 && tot > 0) n.valorUnitario = fmtUnit(tot / qtd);
            }
            return n;
        }));
    const removeItemCompra = (idx) => setItensCompra(prev => prev.filter((_, i) => i !== idx));

    // Já enviada ao Conta Azul: edição restrita (só vencimento/valor das parcelas em aberto).
    const statusEnvioModal = String(conta?.statusEnvioCA || '').toUpperCase();
    const enviadaCA = editando && (statusEnvioModal === 'ENVIADO' || statusEnvioModal === 'SINCRONIZADO');
    const emEnvioCA = editando && (statusEnvioModal === 'ENVIANDO' || statusEnvioModal === 'AGUARDANDO_PROTOCOLO');
    const parcelasTravadas = enviadaCA || emEnvioCA; // não pode adicionar/remover parcela

    const somaParcelas = parcelas.reduce((s, p) => s + parseNum(p.valor), 0);
    const totalInformado = parseNum(valorTotal);
    const somaDiverge = totalInformado > 0 && Math.abs(somaParcelas - totalInformado) > 0.01;

    const setParcela = (idx, campo, valor) =>
        setParcelas(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));

    const addParcela = () => setParcelas(prev => [...prev, { dataVencimento: hojeYMD(), valor: '', paga: false }]);
    const removeParcela = (idx) => setParcelas(prev => prev.filter((_, i) => i !== idx));

    // ── Gerador de parcelas (assinatura/seguro): nº, valor, 1ª data + recorrência ──
    const [gerAberto, setGerAberto] = useState(false);
    const [gerN, setGerN] = useState('12');
    const [gerValor, setGerValor] = useState('');
    const [gerData, setGerData] = useState(hojeYMD());
    const [gerModo, setGerModo] = useState('mensal'); // 'mensal' (dia fixo) | 'dias' (a cada N dias)
    const [gerDias, setGerDias] = useState('30');

    const addMesesYMD = (ymd, n) => {
        const [a, m, d] = ymd.split('-').map(Number);
        const base = new Date(Date.UTC(a, m - 1, 1));
        base.setUTCMonth(base.getUTCMonth() + n);
        const ano = base.getUTCFullYear(), mes = base.getUTCMonth();
        const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate(); // clampa dia 31 → último do mês
        const dia = Math.min(d, ultimoDia);
        return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    };
    const addDiasYMD = (ymd, n) => {
        const dt = new Date(`${ymd}T12:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() + n);
        return dt.toISOString().slice(0, 10);
    };
    const gerN_int = Math.max(1, Math.min(360, parseInt(gerN, 10) || 0));
    const gerValor_num = parseNum(gerValor);
    const gerarParcelas = () => {
        if (!gerData) { toast.error('Informe a data da 1ª parcela.'); return; }
        if (gerValor_num <= 0) { toast.error('Informe o valor de cada parcela.'); return; }
        const dias = Math.max(1, parseInt(gerDias, 10) || 30);
        const novas = [];
        for (let i = 0; i < gerN_int; i++) {
            const venc = gerModo === 'dias' ? addDiasYMD(gerData, i * dias) : addMesesYMD(gerData, i);
            novas.push({ dataVencimento: venc, valor: fmt(gerValor_num), paga: false });
        }
        setParcelas(prev => [...prev.filter(p => p.paga), ...novas]);
        setGerAberto(false);
        toast.success(`${gerN_int} parcela(s) geradas.`);
    };

    const salvar = async () => {
        if (!fornecedorId) { toast.error('Selecione o fornecedor.'); return; }
        if (!descricao.trim()) { toast.error('Informe a descrição.'); return; }
        const parcelasValidas = parcelas.filter(p => !p.paga);
        if (parcelas.length === 0 || parcelas.some(p => !p.paga && (!p.dataVencimento || parseNum(p.valor) <= 0))) {
            toast.error('Preencha data e valor de todas as parcelas.');
            return;
        }
        if (somaDiverge) { toast.error('A soma das parcelas não bate com o valor total informado.'); return; }
        for (const it of itensCompra) {
            if (parseNum(it.quantidade) <= 0 || parseNum(it.valorTotal) <= 0) {
                toast.error(`Preencha a quantidade e o valor do produto "${it.nome}" (ou remova-o da lista).`);
                return;
            }
        }
        if (!editando && enviarCA) {
            if (!metodoPagamento) { toast.error('Escolha a forma de pagamento.'); return; }
            if (!contaFinanceiraCaId) { toast.error('Escolha o banco/caixa.'); return; }
            if (pago && !dataPagamento) { toast.error('Informe a data do pagamento.'); return; }
        }
        setSalvando(true);
        try {
            const payload = {
                fornecedorId,
                descricao: descricao.trim(),
                categoria: categoria || undefined,
                numeroNota: numeroNota.trim() || undefined,
                competencia: competencia || undefined,
                observacoes: observacoes.trim() || undefined,
                enviarCA,
                parcelas: parcelasValidas.map(p => ({ ...(p.id ? { id: p.id } : {}), valor: parseNum(p.valor), dataVencimento: p.dataVencimento }))
            };
            if (!editando && enviarCA) {
                payload.metodoPagamento = metodoPagamento;
                payload.contaFinanceiraCaId = contaFinanceiraCaId;
                if (pago) { payload.pago = true; payload.dataPagamento = dataPagamento; }
            }
            if (!editando && itensCompra.length > 0) {
                payload.itens = itensCompra.map(it => ({
                    vinculo: it.vinculo,
                    descricao: it.nome,
                    quantidade: parseNum(it.quantidade),
                    valorTotal: parseNum(it.valorTotal)
                }));
            }
            let contaId = conta?.id;
            if (editando) {
                await contasPagarService.atualizar(conta.id, payload);
            } else {
                const r = await contasPagarService.criar(payload);
                contaId = r?.conta?.id || r?.id;
                const entradas = Number(r?.estoque?.entradas || 0);
                (r?.estoque?.avisos || []).forEach(a => toast(a, { icon: '⚠️', duration: 6000 }));
                // Após criar, faz upload do PDF se o usuário selecionou um arquivo
                if (pdfArquivo && contaId) {
                    try { await contasPagarService.uploadPdf(contaId, pdfArquivo); } catch { /* não bloqueia */ }
                }
                toast.success(entradas > 0
                    ? `Despesa criada! ${entradas} produto(s) deram entrada no estoque.`
                    : 'Despesa criada!');
            }
            if (editando && pdfArquivo && contaId) {
                try { await contasPagarService.uploadPdf(contaId, pdfArquivo); } catch { /* não bloqueia */ }
                if (!toast.success) toast.success('PDF salvo!');
            }
            if (onFornecedoresChanged) onFornecedoresChanged();
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar despesa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h2 className="font-bold text-gray-900">{editando ? 'Editar Despesa' : 'Nova Despesa'}</h2>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Fornecedor com busca */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
                        <ComboBusca
                            value={fornecedorId}
                            options={opcoesFornecedor}
                            onChange={setFornecedorId}
                            placeholder="Selecionar fornecedor…"
                            buscaPlaceholder="Digite o nome ou CNPJ…"
                            vazioTexto="Nenhum fornecedor encontrado — cadastre na tela Fornecedores."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                            <input
                                value={descricao}
                                onChange={e => setDescricao(e.target.value)}
                                placeholder="Ex.: Farinha de trigo"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                            {categoriasErro ? (
                                <input
                                    value={categoria}
                                    onChange={e => setCategoria(e.target.value)}
                                    placeholder="Ex.: Matéria-prima"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            ) : (
                                <ComboBusca
                                    value={categoria}
                                    options={[
                                        ...(categoria && !categorias.some(c => c.nome === categoria) ? [{ value: categoria, label: categoria }] : []),
                                        ...categorias.map(c => ({ value: c.nome, label: c.nome }))
                                    ]}
                                    onChange={setCategoria}
                                    placeholder="Selecionar…"
                                    buscaPlaceholder="Digite a categoria…"
                                    vazioTexto="Nenhuma categoria encontrada."
                                />
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Número da nota (opcional)</label>
                            <input
                                value={numeroNota}
                                onChange={e => setNumeroNota(e.target.value)}
                                placeholder="Ex.: NF-e 48.213"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Competência (opcional)</label>
                            <input
                                type="month"
                                value={competencia}
                                onChange={e => setCompetencia(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <textarea
                            rows={2}
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    {/* Produtos comprados (opcional) — entrada de estoque + custo, como na conferência de nota */}
                    {!editando && (
                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Produtos comprados (opcional)</div>
                            {!mostraProdutos ? (
                                <button
                                    onClick={abrirProdutos}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 text-gray-600 hover:border-primary hover:text-primary rounded-lg text-sm font-medium"
                                >
                                    <Package className="h-4 w-4" />
                                    Lançar os produtos desta compra (dá entrada no estoque e atualiza o custo)
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    {carregandoProds ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando produtos…
                                        </div>
                                    ) : (
                                        <ComboBusca
                                            value=""
                                            options={opcoesProdCombo}
                                            onChange={(v) => { if (v) addItemCompra(v); }}
                                            placeholder="+ Adicionar produto…"
                                            buscaPlaceholder="Digite: espetinho, coxinha, risole…"
                                            vazioTexto="Nenhum produto encontrado."
                                            allowClear={false}
                                        />
                                    )}

                                    {itensCompra.map((it, idx) => (
                                        <div key={it.vinculo} className="border border-gray-200 rounded-lg px-3 py-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 truncate">{it.nome}</div>
                                                    <div className="text-xs text-gray-500 truncate">{it.sub}</div>
                                                </div>
                                                <button
                                                    onClick={() => removeItemCompra(idx)}
                                                    title="Remover produto"
                                                    className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 shrink-0"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap items-end gap-2 md:gap-3 mt-2">
                                                <div>
                                                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Qtd ({it.unidade})</label>
                                                    <input
                                                        value={it.quantidade}
                                                        onChange={e => setItemCompra(idx, 'quantidade', e.target.value)}
                                                        placeholder="0"
                                                        className="w-24 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Valor unitário</label>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">R$</span>
                                                        <input
                                                            value={it.valorUnitario}
                                                            onChange={e => setItemCompra(idx, 'valorUnitario', e.target.value)}
                                                            placeholder="0,00"
                                                            className="w-24 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Valor total</label>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">R$</span>
                                                        <input
                                                            value={it.valorTotal}
                                                            onChange={e => setItemCompra(idx, 'valorTotal', e.target.value)}
                                                            placeholder="0,00"
                                                            className="w-28 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {itensCompra.length > 0 && (
                                        <p className="text-xs text-gray-500">
                                            Preencha a quantidade e o valor <b>unitário</b> OU o <b>total</b> — o outro é calculado sozinho. Ao criar a despesa, cada produto dá entrada no estoque, atualiza o custo médio e entra no histórico de compras.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Parcelas dinâmicas */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Parcelas</div>
                            {!parcelasTravadas && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setGerAberto(v => !v)}
                                        className={`px-3 py-1.5 rounded-md font-semibold text-xs border ${gerAberto ? 'bg-mint/50 border-primary text-primaryDark' : 'bg-white border-primary text-primary hover:bg-mint/40'}`}
                                    >
                                        ⚡ Gerar várias
                                    </button>
                                    <button
                                        onClick={addParcela}
                                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                    >
                                        + Adicionar parcela
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Gerador de parcelas (assinatura / seguro) */}
                        {gerAberto && !parcelasTravadas && (
                            <div className="mb-3 rounded-xl border border-primary/30 bg-mint/20 p-3 md:p-4">
                                <div className="text-xs font-semibold text-primaryDark mb-3">Gerar várias parcelas de uma vez (ex.: seguro, assinatura)</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Nº de parcelas</label>
                                        <input type="number" min="1" max="360" value={gerN} onChange={e => setGerN(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Valor de cada</label>
                                        <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                                            <span className="px-2 py-2 bg-gray-50 border-r border-gray-300 text-xs text-gray-500">R$</span>
                                            <input value={gerValor} onChange={e => setGerValor(e.target.value)} placeholder="0,00" className="w-full min-w-0 px-2 py-2 text-sm text-right outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Data da 1ª</label>
                                        <input type="date" value={gerData} onChange={e => setGerData(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-2 text-sm text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Repetir</label>
                                        <SelectBusca value={gerModo} onChange={e => setGerModo(e.target.value)} className="w-full">
                                            <option value="mensal">Todo mês (dia fixo)</option>
                                            <option value="dias">A cada N dias</option>
                                        </SelectBusca>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                                    <div className="flex items-center gap-2">
                                        {gerModo === 'dias' && (
                                            <label className="text-xs text-gray-600 flex items-center gap-1.5">
                                                Intervalo:
                                                <input type="number" min="1" value={gerDias} onChange={e => setGerDias(e.target.value)} className="w-16 border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                                dias
                                            </label>
                                        )}
                                        {gerModo === 'mensal' && (
                                            <span className="text-xs text-gray-500">Vence sempre no dia <b>{gerData ? gerData.slice(8) : '—'}</b> de cada mês.</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-600">Total: <b>R$ {fmt(gerN_int * gerValor_num)}</b></span>
                                        <button onClick={gerarParcelas} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">
                                            Gerar {gerN_int} parcelas
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">Isso substitui as parcelas em aberto da lista abaixo. Depois você ainda pode ajustar cada uma individualmente.</p>
                            </div>
                        )}
                        {enviadaCA && (
                            <div className="mb-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                Despesa já enviada ao Conta Azul. Você pode ajustar o <b>vencimento</b> e o <b>valor</b> das parcelas em aberto — a mudança é aplicada também no Conta Azul. Não é possível adicionar, excluir ou mexer em parcela já paga.
                            </div>
                        )}
                        {emEnvioCA && (
                            <div className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Esta despesa ainda está sendo enviada ao Conta Azul. Aguarde alguns minutos para poder ajustar as parcelas.
                            </div>
                        )}
                        <div className="space-y-2">
                            {parcelas.map((p, idx) => (
                                <div key={p.id || `nova-${idx}`} className={`border rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2 md:gap-3 ${p.paga ? 'border-green-200 bg-green-50/40' : 'border-gray-200'}`}>
                                    <span className="text-sm font-medium text-gray-900 w-20">Parcela {idx + 1}</span>
                                    <input
                                        type="date"
                                        value={p.dataVencimento}
                                        disabled={p.paga || emEnvioCA}
                                        onChange={e => setParcela(idx, 'dataVencimento', e.target.value)}
                                        className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                    <div className="flex items-center gap-1">
                                        <span className="text-sm text-gray-500">R$</span>
                                        <input
                                            value={p.valor}
                                            disabled={p.paga || emEnvioCA}
                                            onChange={e => setParcela(idx, 'valor', e.target.value)}
                                            placeholder="0,00"
                                            className="w-28 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                        />
                                    </div>
                                    {p.paga ? (
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">já paga</span>
                                    ) : !parcelasTravadas ? (
                                        <button
                                            onClick={() => removeParcela(idx)}
                                            disabled={parcelas.length <= 1}
                                            title="Excluir parcela"
                                            className="ml-auto p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 disabled:opacity-30"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor total da despesa (opcional, para conferência)</label>
                                <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                                    <span className="px-3 py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">R$</span>
                                    <input value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className="flex-1 px-3 py-2 text-sm outline-none" />
                                </div>
                            </div>
                            <div className={`text-sm rounded-lg px-3 py-2 border ${somaDiverge ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                Soma das parcelas: <span className="font-semibold">R$ {fmt(somaParcelas)}</span>
                                {somaDiverge && <span> — não bate com o total informado (R$ {fmt(totalInformado)})</span>}
                            </div>
                        </div>
                    </div>

                    {!editando && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={enviarCA} onChange={e => setEnviarCA(e.target.checked)} className="rounded mt-0.5" />
                                <span><span className="font-semibold">Enviar para a Conta Azul</span></span>
                            </label>

                            {enviarCA && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pagamento *</label>
                                            <SelectBusca value={metodoPagamento} onChange={e => setMetodoPagamento(e.target.value)} className="w-full">
                                                <option value="">Selecionar…</option>
                                                {opcoesBaixa.metodosPagamento.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                            </SelectBusca>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Banco / caixa *</label>
                                            <SelectBusca value={contaFinanceiraCaId} onChange={e => setContaFinanceiraCaId(e.target.value)} className="w-full">
                                                <option value="">Selecionar…</option>
                                                {opcoesBaixa.contasFinanceiras.map(c => <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>)}
                                            </SelectBusca>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setModoPagamento('DDA')}
                                            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${modoPagamento === 'DDA' ? 'border-primary bg-white text-primaryDark ring-1 ring-primary' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Ainda vou pagar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setModoPagamento('PAGO')}
                                            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${modoPagamento === 'PAGO' ? 'border-primary bg-white text-primaryDark ring-1 ring-primary' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Já paguei
                                        </button>
                                    </div>
                                    {pago && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Data do pagamento *</label>
                                            <input
                                                type="date"
                                                value={dataPagamento}
                                                onChange={e => setDataPagamento(e.target.value)}
                                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                        </div>
                                    )}
                                    <div className="text-xs text-gray-500">
                                        {pago
                                            ? 'A despesa entra já quitada no Conta Azul (o app cria e dá a baixa).'
                                            : 'A despesa entra em aberto no Conta Azul, já com a forma e o banco/caixa definidos.'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Campo PDF opcional (nova despesa e edição) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-gray-400" />Documento (PDF opcional)
                        </label>
                        {pdfArquivo ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                    <span className="text-sm font-medium text-gray-800 truncate">{pdfArquivo.name}</span>
                                    <span className="text-xs text-gray-400 shrink-0">({(pdfArquivo.size / 1024 / 1024).toFixed(1)} MB)</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPdfArquivo(null)}
                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs font-medium"
                                    title="Remover seleção"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Remover
                                </button>
                            </div>
                        ) : (
                            <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-primary hover:bg-blue-50/40 transition-colors">
                                <FileText className="h-5 w-5 text-gray-300 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-500">Clique para selecionar PDF</p>
                                    <p className="text-xs text-gray-400">Boleto, NF, contrato… Máx. 30 MB. O arquivo será salvo junto com a despesa.</p>
                                </div>
                                <input
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) setPdfArquivo(f); e.target.value = ''; }}
                                />
                            </label>
                        )}
                    </div>
                </div>


                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={salvando || somaDiverge}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50"
                    >
                        {salvando ? 'Salvando…' : (editando ? 'Salvar alterações' : 'Criar despesa')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL BAIXAR PARCELA
// ═══════════════════════════════════════════════════════════
const BaixaParcelaModal = ({ conta, parcela, onClose, onSuccess }) => {
    const saldo = Math.max(0, Number(parcela.valor || 0) - Number(parcela.valorPago || 0));
    const [dataPagamento, setDataPagamento] = useState(hojeYMD());
    // "Valor pago" = o total que saiu do banco (já com juros/multa, já com o desconto abatido).
    // O backend espera o principal separado dos acréscimos — a conta é feita aqui embaixo.
    const [valorPago, setValorPago] = useState(saldo.toFixed(2).replace('.', ','));
    const [juros, setJuros] = useState('');
    const [multa, setMulta] = useState('');
    const [desconto, setDesconto] = useState('');
    const [escolhaAcrescimo, setEscolhaAcrescimo] = useState(null); // 'juros' | 'multa'
    const [escolhaFalta, setEscolhaFalta] = useState(null);         // 'desconto' | 'parcial'
    const [formaPagamento, setFormaPagamento] = useState('PIX');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [contaFinanceiraCaId, setContaFinanceiraCaId] = useState('');
    const [contasFinanceiras, setContasFinanceiras] = useState([]);
    // Se a despesa vai ao Conta Azul, o banco é obrigatório (a baixa é empurrada nesse banco).
    const vaiAoCA = conta.statusEnvioCA && conta.statusEnvioCA !== 'NAO_ENVIAR';

    const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
    const total = parseNum(valorPago);
    const vJuros = parseNum(juros);
    const vMulta = parseNum(multa);
    const vDesconto = parseNum(desconto);
    const acrescimos = round2(vJuros + vMulta);
    const principal = round2(total - acrescimos);            // o que realmente abate a parcela
    const excedente = round2(total - saldo);                 // > 0 → pagou a mais que o saldo
    const falta = round2(saldo - principal - vDesconto);     // > 0 → ainda sobra saldo aberto
    const precisaClassificarExcedente = excedente > 0.005 && acrescimos <= 0;
    const precisaClassificarFalta = !precisaClassificarExcedente && falta > 0.005 && !escolhaFalta && vDesconto <= 0;
    const saldoApos = Math.max(0, falta);

    // Quem escolheu "é juros/multa" ou "é desconto" tem o campo recalculado se mudar o valor pago.
    useEffect(() => {
        if (escolhaAcrescimo && excedente > 0) {
            const v = excedente.toFixed(2).replace('.', ',');
            if (escolhaAcrescimo === 'juros') setJuros(v); else setMulta(v);
        }
        if (escolhaFalta === 'desconto') {
            const f = round2(saldo - round2(total - acrescimos));
            setDesconto(f > 0 ? f.toFixed(2).replace('.', ',') : '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valorPago, escolhaAcrescimo, escolhaFalta]);

    useEffect(() => {
        contasPagarService.opcoesBaixa()
            .then(op => {
                const cf = Array.isArray(op?.contasFinanceiras) ? op.contasFinanceiras : [];
                setContasFinanceiras(cf);
                const padrao = cf.find(c => c.padrao);
                if (padrao) setContaFinanceiraCaId(padrao.id);
            })
            .catch(() => {});
    }, []);

    const escolherAcrescimo = (tipo) => {
        setEscolhaAcrescimo(tipo);
        setEscolhaFalta(null);
        const v = excedente.toFixed(2).replace('.', ',');
        if (tipo === 'juros') { setJuros(v); setMulta(''); }
        else { setMulta(v); setJuros(''); }
    };

    const escolherFalta = (tipo) => {
        setEscolhaFalta(tipo);
        setEscolhaAcrescimo(null);
        if (tipo === 'desconto') {
            const f = round2(saldo - principal);
            setDesconto(f > 0 ? f.toFixed(2).replace('.', ',') : '');
        } else {
            setDesconto('');
        }
    };

    const confirmar = async () => {
        if (total <= 0 && vDesconto <= 0) { toast.error('Informe o valor pago.'); return; }
        if (principal < -0.005) { toast.error('Juros + multa não podem ser maiores que o valor pago.'); return; }
        if (precisaClassificarExcedente) { toast.error('Diga se o valor a mais é juros ou multa.'); return; }
        if (precisaClassificarFalta) { toast.error('Diga se a diferença é desconto ou pagamento parcial.'); return; }
        if (vaiAoCA && !contaFinanceiraCaId) { toast.error('Escolha o banco/caixa de onde saiu o pagamento.'); return; }
        setSalvando(true);
        try {
            await contasPagarService.baixarParcela(conta.id, parcela.id, {
                dataPagamento,
                valorPago: Math.max(0, principal),
                juros: vJuros,
                multa: vMulta,
                desconto: vDesconto,
                formaPagamento,
                contaFinanceiraCaId: contaFinanceiraCaId || undefined,
                observacao: observacao.trim() || undefined
            });
            toast.success('Baixa registrada!');
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao dar baixa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500">Baixar parcela {parcela.numeroParcela}{conta.parcelas?.length ? `/${conta.parcelas.length}` : ''}</p>
                        <h2 className="font-bold text-gray-900">{nomeFornecedor(conta.fornecedor)}{conta.descricao ? ` · ${conta.descricao}` : ''}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Botão "Ver documento" — aparece somente quando há PDF (caso de uso principal: ver o boleto na hora de pagar) */}
                    {conta.temPdf && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm text-amber-900 min-w-0">
                                <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                                <span className="font-medium shrink-0">Documento:</span>
                                <span className="text-amber-700 truncate text-xs">{conta.pdfNome}</span>
                            </div>
                            <button
                                onClick={async () => { try { await contasPagarService.abrirPdf(conta.id); } catch { toast.error('Não foi possível abrir o PDF.'); } }}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold"
                            >
                                Ver documento
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Valor da parcela</p>
                            <p className="font-bold text-base text-gray-900">R$ {fmt(parcela.valor)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Saldo restante</p>
                            <p className="font-bold text-base text-amber-700">R$ {fmt(saldo)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Valor pago</label>
                            <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                                <span className="px-3 py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">R$</span>
                                <input inputMode="decimal" value={valorPago} onChange={e => setValorPago(e.target.value)} className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Total que saiu do banco.</p>
                        </div>
                    </div>

                    {/* Pagou a MAIS que o saldo → o excedente é juros ou multa? */}
                    {precisaClassificarExcedente && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                            <p className="text-sm text-amber-900">
                                Você pagou <span className="font-bold">R$ {fmt(excedente)}</span> a mais que o saldo. O que é essa diferença?
                            </p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => escolherAcrescimo('juros')} className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-amber-400 text-amber-800 hover:bg-amber-100 rounded-full font-semibold text-sm">Juros</button>
                                <button onClick={() => escolherAcrescimo('multa')} className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-amber-400 text-amber-800 hover:bg-amber-100 rounded-full font-semibold text-sm">Multa</button>
                            </div>
                            <p className="text-xs text-amber-700 mt-2">Precisa dividir entre os dois? Preencha os campos abaixo na mão.</p>
                        </div>
                    )}

                    {/* Pagou a MENOS que o saldo → é desconto (quita) ou pagamento parcial (fica saldo)? */}
                    {precisaClassificarFalta && (
                        <div className="rounded-xl border border-blue-300 bg-blue-50 p-3">
                            <p className="text-sm text-blue-900">
                                Faltam <span className="font-bold">R$ {fmt(falta)}</span> para quitar a parcela. O que é essa diferença?
                            </p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => escolherFalta('desconto')} className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-blue-400 text-blue-800 hover:bg-blue-100 rounded-full font-semibold text-sm">Desconto <span className="font-normal">(quita)</span></button>
                                <button onClick={() => escolherFalta('parcial')} className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-blue-400 text-blue-800 hover:bg-blue-100 rounded-full font-semibold text-sm">Pagamento parcial</button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Juros</label>
              <input inputMode="decimal" value={juros} onChange={e => { setJuros(e.target.value); setEscolhaAcrescimo(null); }} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Multa</label>
              <input inputMode="decimal" value={multa} onChange={e => { setMulta(e.target.value); setEscolhaAcrescimo(null); }} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Desconto</label>
              <input inputMode="decimal" value={desconto} onChange={e => { setDesconto(e.target.value); setEscolhaFalta(null); }} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    </div>

                    {/* Resumo: o que essa baixa faz com a parcela */}
                    {total > 0 && !precisaClassificarExcedente && !precisaClassificarFalta && principal >= -0.005 && (
                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 space-y-0.5">
                            <div>Abate da parcela: <span className="font-semibold text-gray-900">R$ {fmt(Math.max(0, principal))}</span>{acrescimos > 0 ? <> + acréscimos R$ {fmt(acrescimos)}</> : null}{vDesconto > 0 ? <> + desconto R$ {fmt(vDesconto)}</> : null}</div>
                            <div>
                                {saldoApos > 0.005
                                    ? <>Fica <span className="font-semibold text-blue-700">parcial</span> — saldo restante R$ {fmt(saldoApos)}</>
                                    : <>Parcela fica <span className="font-semibold text-green-700">quitada</span></>}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Banco / caixa {vaiAoCA ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(opcional)</span>}
                        </label>
                        <SelectBusca value={contaFinanceiraCaId} onChange={e => setContaFinanceiraCaId(e.target.value)} className="w-full">
                            <option value="">{vaiAoCA ? 'Escolha o banco/caixa…' : 'Não informar'}</option>
                            {contasFinanceiras.map(c => <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>)}
                        </SelectBusca>
                        <p className="text-xs text-gray-400 mt-1">{vaiAoCA ? 'Conta que vai ao Conta Azul: a baixa é lançada nesse banco.' : 'De onde saiu o dinheiro (aparece no relatório por conta).'}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
            <SelectBusca value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full">
                            {FORMAS_PGTO.map(f => <option key={f}>{f}</option>)}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
            <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                    <button onClick={confirmar} disabled={salvando} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50">
                        {salvando ? 'Salvando…' : 'Confirmar baixa'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL QUITAR EM LOTE (várias parcelas — mesma data/forma/banco)
// ═══════════════════════════════════════════════════════════
const BaixaLoteModal = ({ parcelaIds, valorTotal, onClose, onSuccess }) => {
    const [dataPagamento, setDataPagamento] = useState(hojeYMD());
    const [metodoPagamento, setMetodoPagamento] = useState('');
    const [contaFinanceiraCaId, setContaFinanceiraCaId] = useState('');
    const [opcoes, setOpcoes] = useState({ contasFinanceiras: [], metodosPagamento: [] });
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        contasPagarService.opcoesBaixa()
            .then(op => {
                const cf = Array.isArray(op?.contasFinanceiras) ? op.contasFinanceiras : [];
                const mp = Array.isArray(op?.metodosPagamento) ? op.metodosPagamento : [];
                setOpcoes({ contasFinanceiras: cf, metodosPagamento: mp });
                const padrao = cf.find(c => c.padrao) || cf[0];
                if (padrao) setContaFinanceiraCaId(padrao.id);
            })
            .catch(() => toast.error('Não consegui carregar os bancos do Conta Azul.'))
            .finally(() => setCarregando(false));
    }, []);

    const confirmar = async () => {
        if (!metodoPagamento) { toast.error('Escolha a forma de pagamento.'); return; }
        if (!contaFinanceiraCaId) { toast.error('Escolha o banco/caixa.'); return; }
        setSalvando(true);
        try {
            const r = await contasPagarService.baixarLote({ parcelaIds, dataPagamento, metodoPagamento, contaFinanceiraCaId });
            toast.success(r?.message || 'Parcelas quitadas!');
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao quitar as parcelas');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500">Quitar em lote</p>
                        <h2 className="font-bold text-gray-900">{parcelaIds.length} parcela(s) · R$ {fmt(valorTotal)}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {carregando ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando bancos…</div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                Cada parcela é quitada pelo <span className="font-medium">saldo restante</span>, na mesma data, forma e banco. As despesas já enviadas ao Conta Azul recebem a baixa lá também.
                            </p>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento</label>
                                <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                                    <SelectBusca value={metodoPagamento} onChange={e => setMetodoPagamento(e.target.value)} className="w-full">
                                        <option value="">Selecionar…</option>
                                        {opcoes.metodosPagamento.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Banco / caixa</label>
                                    <SelectBusca value={contaFinanceiraCaId} onChange={e => setContaFinanceiraCaId(e.target.value)} className="w-full">
                                        <option value="">Selecionar…</option>
                                        {opcoes.contasFinanceiras.map(c => <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>)}
                                    </SelectBusca>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                    <button onClick={confirmar} disabled={salvando || carregando} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50">
                        {salvando ? 'Quitando…' : 'Confirmar quitação'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL DETALHES DA CONTA (cancelar / reenviar CA / estornar)
// ═══════════════════════════════════════════════════════════
const DetalheContaModal = ({ conta: contaInicial, podeBaixar, onClose, onEditar, onDuplicar, onBaixar, onChanged }) => {
    const [executando, setExecutando] = useState(null); // 'cancelar' | 'reenviar' | pagamentoId
    // Estado local do PDF — atualizado sem recarregar toda a lista
    const [temPdf, setTemPdf] = useState(contaInicial.temPdf);
    const [pdfNome, setPdfNome] = useState(contaInicial.pdfNome);
    const [uploadandoPdf, setUploadandoPdf] = useState(false);
    // Objeto conta local com pdf atualizado
    const conta = { ...contaInicial, temPdf, pdfNome };

    const handleUploadPdf = async (e) => {
        const arquivo = e.target.files?.[0];
        if (!arquivo) return;
        setUploadandoPdf(true);
        try {
            const res = await contasPagarService.uploadPdf(conta.id, arquivo);
            setTemPdf(res.temPdf);
            setPdfNome(res.pdfNome);
            toast.success('PDF anexado com sucesso!');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao enviar o PDF.');
        } finally {
            setUploadandoPdf(false);
            e.target.value = '';
        }
    };

    const handleRemoverPdf = async () => {
        if (!window.confirm('Remover o PDF anexado a esta despesa?')) return;
        try {
            const res = await contasPagarService.deletarPdf(conta.id);
            setTemPdf(res.temPdf);
            setPdfNome(res.pdfNome);
            toast.success('PDF removido.');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao remover o PDF.');
        }
    };

    // Detalhe completo (nota fiscal + itens/produtos) — carregado sob demanda ao abrir
    const [detalhe, setDetalhe] = useState(null);
    const [carregandoDet, setCarregandoDet] = useState(true);
    useEffect(() => {
        let vivo = true;
        setCarregandoDet(true);
        contasPagarService.detalhe(conta.id)
            .then(d => { if (vivo) setDetalhe(d); })
            .catch(() => { if (vivo) setDetalhe(null); })
            .finally(() => { if (vivo) setCarregandoDet(false); });
        return () => { vivo = false; };
    }, [conta.id]);

    const totalParcelas = (conta.parcelas || []).length;
    const statusEnvio = String(conta.statusEnvioCA || '').toUpperCase();
    const nota = detalhe?.nota;
    const itens = detalhe?.itens || [];

    const cancelarConta = async () => {
        if (!window.confirm('Cancelar esta despesa? As parcelas em aberto serão canceladas.')) return;
        setExecutando('cancelar');
        try {
            await contasPagarService.cancelar(conta.id);
            toast.success('Despesa cancelada.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao cancelar');
        } finally {
            setExecutando(null);
        }
    };

    const reenviarCA = async () => {
        setExecutando('reenviar');
        try {
            await contasPagarService.reenviarCA(conta.id);
            toast.success('Reenvio à Conta Azul solicitado.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao reenviar');
        } finally {
            setExecutando(null);
        }
    };

    const estornar = async (parcela, pagamento) => {
        if (!window.confirm('Estornar este pagamento? A parcela volta a ficar em aberto.')) return;
        setExecutando(pagamento.id);
        try {
            await contasPagarService.estornarPagamento(conta.id, parcela.id, pagamento.id);
            toast.success('Pagamento estornado.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao estornar');
        } finally {
            setExecutando(null);
        }
    };

    // Só baixa manual pode ser estornada aqui (baixa via CA/DDA é conferida lá)
    const podeEstornarPag = (p) => {
        if (p.estornado) return false;
        const origem = String(p.origem || '').toUpperCase();
        return origem !== 'CA' && origem !== 'DDA' && origem !== 'CONTA_AZUL';
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Despesa{conta.numeroNota ? ` · Nota ${conta.numeroNota}` : ''}</p>
                        <h2 className="font-bold text-gray-900 truncate">{nomeFornecedor(conta.fornecedor)}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 shrink-0"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="text-sm text-gray-600">
                        {conta.descricao || 'Sem descrição'}
                        {conta.categoria ? <span className="text-gray-500"> · {conta.categoria}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-gray-500">Total:</span>
                        <span className="font-bold text-gray-900">R$ {fmt(conta.valorTotal)}</span>
                        <BadgeCA conta={conta} />
                        {conta.status === 'CANCELADO' && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Cancelado</span>
                        )}
                    </div>
                    {statusEnvio === 'ERRO' && conta.erroEnvioCA && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                            <span className="font-semibold">Erro no envio à Conta Azul:</span> {conta.erroEnvioCA}
                        </div>
                    )}
                    {conta.observacoes && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                            <span className="font-semibold text-gray-500">Observação: </span>{conta.observacoes}
                        </div>
                    )}

                    {/* O que é esta despesa — nota fiscal + itens/produtos comprados */}
                    {carregandoDet ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens da nota…
                        </div>
                    ) : (nota || itens.length > 0) ? (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Package className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{nota ? 'Itens da nota' : 'Produtos da despesa'}</span>
                            </div>

                            {nota && (
                                <div className="text-xs text-gray-500 mb-2">
                                    {nota.tipo || 'NF-e'}{nota.numero ? ` ${nota.numero}` : ''}{nota.serie ? ` · série ${nota.serie}` : ''}
                                    {nota.emissao ? ` · emitida ${fmtData(nota.emissao)}` : ''}
                                    {nota.valorTotal != null ? ` · total R$ ${fmt(nota.valorTotal)}` : ''}
                                </div>
                            )}

                            {itens.length > 0 ? (
                                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                                    {itens.map((it, idx) => (
                                        <div key={idx} className="p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-gray-900">{it.descricao}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {fmt(it.quantidade)} {it.unidade} × R$ {fmt(it.valorUnitario)}
                                                        {it.codigo ? ` · cód. ${it.codigo}` : ''}
                                                        {it.categoria ? ` · ${it.categoria}` : ''}
                                                    </div>
                                                    {it.produtoVinculado && (
                                                        <div className="text-xs text-green-700 mt-0.5">→ entrou como “{it.produtoVinculado}” no estoque</div>
                                                    )}
                                                    {it.infAdProd && (
                                                        <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{it.infAdProd}</div>
                                                    )}
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">R$ {fmt(it.valorTotal)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">Esta nota não tem itens detalhados guardados.</p>
                            )}

                            {nota?.observacoes && (
                                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 whitespace-pre-wrap">
                                    <span className="font-semibold">Observações da nota: </span>{nota.observacoes}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">
                            Despesa lançada manualmente — sem nota fiscal vinculada com itens.
                        </p>
                    )}

                    {/* ── Seção PDF: upload ou visualização do documento ── */}
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2 flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-gray-400" />Documento (PDF)
                        </div>
                        {temPdf ? (
                            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="shrink-0 bg-red-100 rounded p-1.5">
                                        <FileText className="h-4 w-4 text-red-600" />
                                    </div>
                                    <span className="text-sm font-medium text-gray-800 truncate">{pdfNome}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={async () => { try { await contasPagarService.abrirPdf(conta.id); } catch { toast.error('Não foi possível abrir o PDF.'); } }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-blue-700 text-white rounded-md text-xs font-semibold"
                                    >
                                        Visualizar
                                    </button>
                                    <button
                                        onClick={handleRemoverPdf}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs font-medium"
                                        title="Remover PDF"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                                uploadandoPdf ? 'border-blue-300 bg-blue-50 cursor-not-allowed' : 'border-gray-300 hover:border-primary hover:bg-blue-50/40'
                            }`}>
                                {uploadandoPdf ? (
                                    <><Loader2 className="h-6 w-6 text-blue-500 animate-spin mb-1" /><span className="text-sm text-blue-600">Enviando PDF…</span></>
                                ) : (
                                    <><FileText className="h-6 w-6 text-gray-300 mb-1" /><span className="text-sm font-medium text-gray-500">Clique para anexar PDF</span><span className="text-xs text-gray-400 mt-0.5">Boleto, NF, contrato… Máx. 30 MB</span></>
                                )}
                                <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={uploadandoPdf} onChange={handleUploadPdf} />
                            </label>
                        )}
                    </div>

                    {/* Parcelas + pagamentos */}
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Parcelas</div>
                        <div className="space-y-2">
                            {(conta.parcelas || []).map(p => (
                                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-sm text-gray-700">
                                            <span className="font-medium text-gray-900">Parcela {p.numeroParcela}/{totalParcelas}</span>
                                            <span className="text-gray-500"> · vence {fmtData(p.dataVencimento)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900 text-sm">R$ {fmt(p.valor)}</span>
                                            <BadgeStatusParcela parcela={p} />
                                            <button
                                                onClick={() => imprimirRecibo(conta, p, totalParcelas)}
                                                title="Imprimir recibo desta parcela (folha A4)"
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50"
                                            >
                                                <Printer className="h-3 w-3" /> Recibo
                                            </button>
                                        </div>
                                    </div>
                                    {(p.pagamentos || []).filter(pg => !pg.estornado).length > 0 && (
                                        <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                                            {(p.pagamentos || []).filter(pg => !pg.estornado).map(pg => (
                                                <div key={pg.id} className="flex items-center justify-between text-xs text-gray-600 gap-2">
                                                    <span className="truncate">
                                                        Pago R$ {fmt(pg.valorPago)} em {fmtData(pg.dataPagamento)}
                                                        {pg.formaPagamento ? ` · ${pg.formaPagamento}` : ''}
                                                        {String(pg.origem || '').toUpperCase() === 'CA' || String(pg.origem || '').toUpperCase() === 'DDA' ? ' · via Conta Azul' : ''}
                                                    </span>
                                                    {podeBaixar && podeEstornarPag(pg) && (
                                                        <button
                                                            onClick={() => estornar(p, pg)}
                                                            disabled={executando === pg.id}
                                                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700 border border-amber-300 rounded hover:bg-amber-50 disabled:opacity-50"
                                                        >
                                                            <Undo2 className="h-3 w-3" /> Estornar
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {podeBaixar && conta.status !== 'CANCELADO' && p.status !== 'PAGO' && p.status !== 'CANCELADO' && (
                                        <div className="mt-2">
                                            <button
                                                onClick={() => onBaixar(conta, p)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                            >
                                                Baixar parcela
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {podeBaixar && (
                    <div className="px-5 py-4 border-t border-gray-100 flex flex-col md:flex-row gap-2">
                        {conta.status !== 'CANCELADO' && (
                            <button
                                onClick={() => onEditar(conta)}
                className="w-full md:w-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm"
                            >
                                Editar
                            </button>
                        )}
                        <button
                            onClick={() => onDuplicar(conta)}
                            title="Criar uma nova despesa já preenchida com os dados desta"
                className="w-full md:w-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5"
                        >
                            <Copy className="h-4 w-4" /> Duplicar
                        </button>
                        {statusEnvio === 'ERRO' && (
                            <button
                                onClick={reenviarCA}
                                disabled={executando === 'reenviar'}
                className="w-full md:w-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-4 w-4 ${executando === 'reenviar' ? 'animate-spin' : ''}`} />
                                Reenviar à Conta Azul
                            </button>
                        )}
                        {conta.status !== 'CANCELADO' && (
                            <button
                                onClick={cancelarConta}
                                disabled={executando === 'cancelar'}
                className="w-full md:w-auto md:ml-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold text-sm disabled:opacity-50"
                            >
                                {executando === 'cancelar' ? 'Cancelando…' : 'Cancelar despesa'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContasPagarPage;
