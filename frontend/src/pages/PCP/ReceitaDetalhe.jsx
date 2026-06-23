import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Calculator, Trash2, History, ChevronRight, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import pcpItemService from '../../services/pcpItemService';
import SimuladorEscalonamento from './SimuladorEscalonamento';

const STATUS_CORES = {
    ativa: 'bg-green-100 text-green-800',
    inativa: 'bg-gray-100 text-gray-600',
    rascunho: 'bg-yellow-100 text-yellow-800',
};

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

const ETAPA_LABELS = {
    preparo: 'Preparo',
    modelagem: 'Modelagem',
    fritura: 'Fritura',
    embalagem: 'Embalagem',
};

const TIPO_LABELS = {
    MP: 'Matéria-prima',
    SUB: 'Subproduto',
    PA: 'Produto acabado',
    EMB: 'Embalagem',
};

function escaparHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function fmtQtd(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    // sempre 3 casas decimais: 7 -> 7,000  / 0.15 -> 0,150
    return v.toFixed(3).replace('.', ',');
}

function fmtPerda(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return v.toFixed(2).replace('.', ',');
}

function fmtMoeda(n, casas = 2) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return `R$ ${v.toFixed(casas).replace('.', ',')}`;
}

function montarHtmlImpressao(receita) {
    const itens = receita.itens || [];

    // agrupa por etapa, mantendo a ordem das etapas conhecidas e jogando o resto em "Outros"
    const ordemEtapas = ['preparo', 'modelagem', 'fritura', 'embalagem'];
    const grupos = {};
    itens.forEach(it => {
        const chave = (it.ordemEtapa || '').toLowerCase().trim() || '_sem_etapa';
        (grupos[chave] = grupos[chave] || []).push(it);
    });
    const chavesOrdenadas = [
        ...ordemEtapas.filter(e => grupos[e]),
        ...Object.keys(grupos).filter(e => !ordemEtapas.includes(e)),
    ];

    const temEtapas = chavesOrdenadas.some(c => c !== '_sem_etapa');

    const linhaItem = (it) => `
        <tr>
            <td class="nome">${escaparHtml(it.itemPcp?.nome || '—')}</td>
            <td class="qtd">${fmtQtd(it.quantidade)}</td>
            <td class="un">${escaparHtml(it.itemPcp?.unidade || '')}</td>
            ${it.observacao ? `<td class="obs">${escaparHtml(it.observacao)}</td>` : '<td class="obs"></td>'}
        </tr>`;

    const secoes = chavesOrdenadas.map(chave => {
        const titulo = chave === '_sem_etapa'
            ? (temEtapas ? 'Outros ingredientes' : 'Ingredientes')
            : (ETAPA_LABELS[chave] || chave.charAt(0).toUpperCase() + chave.slice(1));
        return `
            <section class="etapa">
                <h2>${escaparHtml(titulo)}</h2>
                <table>
                    <thead>
                        <tr><th class="nome">Ingrediente</th><th class="qtd">Qtd</th><th class="un">Un.</th><th class="obs">Observação</th></tr>
                    </thead>
                    <tbody>${grupos[chave].map(linhaItem).join('')}</tbody>
                </table>
            </section>`;
    }).join('');

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${escaparHtml(receita.itemPcp?.unidade || '')}`;
    const perda = receita.perdaPercentual ? `${fmtPerda(receita.perdaPercentual)}%` : '—';
    const dataImpressao = new Date().toLocaleDateString('pt-BR');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Receita - ${escaparHtml(receita.nome)}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        font-size: 15pt;
        line-height: 1.35;
    }
    /* largura util da A4 retrato com margem 12mm = 210-24 = 186mm */
    .folha { width: 186mm; margin: 0 auto; }
    header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 26pt; margin: 0 0 4px; }
    .produz { font-size: 15pt; color: #333; margin: 0; }
    .meta { display: flex; gap: 24px; margin-top: 10px; flex-wrap: wrap; }
    .meta div { font-size: 14pt; }
    .meta .rotulo { color: #555; font-size: 11pt; text-transform: uppercase; letter-spacing: .5px; display: block; }
    .meta .valor { font-weight: bold; font-size: 17pt; }
    .etapa { margin-top: 16px; page-break-inside: avoid; }
    .etapa h2 {
        font-size: 16pt; margin: 0 0 6px; padding: 4px 10px;
        background: #111; color: #fff; border-radius: 4px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
    th { font-size: 11pt; text-transform: uppercase; color: #555; letter-spacing: .5px; border-bottom: 2px solid #111; }
    td.nome { font-weight: bold; font-size: 15pt; }
    .qtd, th.qtd { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.qtd { font-weight: bold; font-size: 16pt; }
    .un, th.un { text-align: center; width: 70px; color: #333; }
    .obs, th.obs { font-size: 12pt; color: #444; }
    .observacoes { margin-top: 18px; padding: 10px 12px; border: 2px solid #111; border-radius: 6px; page-break-inside: avoid; }
    .observacoes .rotulo { font-size: 11pt; text-transform: uppercase; letter-spacing: .5px; color: #555; margin-bottom: 4px; }
    .observacoes p { margin: 0; font-size: 14pt; white-space: pre-wrap; }
    footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10pt; color: #777; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="folha">
    <header>
        <h1>${escaparHtml(receita.nome)}</h1>
        <p class="produz">Produz: <strong>${escaparHtml(receita.itemPcp?.nome || '—')}</strong>${receita.itemPcp?.tipo ? ` (${escaparHtml(TIPO_LABELS[receita.itemPcp.tipo] || receita.itemPcp.tipo)})` : ''}</p>
        <div class="meta">
            <div><span class="rotulo">Rendimento</span><span class="valor">${rendimento}</span></div>
            <div><span class="rotulo">Perda padrão</span><span class="valor">${perda}</span></div>
            <div><span class="rotulo">Versão</span><span class="valor">v${escaparHtml(receita.versao)}</span></div>
        </div>
    </header>
    ${secoes || '<p>Sem ingredientes cadastrados.</p>'}
    ${receita.observacoes ? `<div class="observacoes"><div class="rotulo">Observações</div><p>${escaparHtml(receita.observacoes)}</p></div>` : ''}
    <footer>
        <span>Receita de produção — ${escaparHtml(receita.nome)}</span>
        <span>Impresso em ${dataImpressao}</span>
    </footer>
</div>
<script>
    // Ajuste automatico: encolhe a letra so o necessario para caber em 1 folha A4.
    (function () {
        try {
            // mede 1mm em px neste navegador (DPI-safe)
            var probe = document.createElement('div');
            probe.style.cssText = 'height:100mm;position:absolute;visibility:hidden;top:0;left:0;';
            document.body.appendChild(probe);
            var pxPorMm = probe.offsetHeight / 100;
            document.body.removeChild(probe);

            var alturaUtilMm = 297 - 24; // A4 retrato menos margens de 12mm
            var alvoPx = alturaUtilMm * pxPorMm;
            var folha = document.querySelector('.folha');
            var atual = folha.scrollHeight;
            if (atual > alvoPx) {
                var escala = Math.max(0.45, alvoPx / atual);
                document.body.style.zoom = escala; // afeta layout e paginacao no Chrome
            }
        } catch (e) { /* se falhar, imprime no tamanho padrao */ }
    })();
</script>
</body>
</html>`;
}

// Impressão COM custos — tabela única (alinhada por índice com custo.itens), total e custo por unidade.
function montarHtmlImpressaoComCustos(receita, custo) {
    const itens = receita.itens || [];
    const fmtM = (n, c = 2) => {
        const v = parseFloat(n);
        if (Number.isNaN(v)) return '—';
        return `R$ ${v.toFixed(c).replace('.', ',')}`;
    };

    const linhas = itens.map((it, idx) => {
        const c = custo?.itens?.[idx];
        return `
        <tr>
            <td class="nome">${escaparHtml(it.itemPcp?.nome || '—')}</td>
            <td class="qtd">${fmtQtd(it.quantidade)}</td>
            <td class="un">${escaparHtml(it.itemPcp?.unidade || '')}</td>
            <td class="qtd">${c ? (c.custoUnitario > 0 ? fmtM(c.custoUnitario, 4) : 'sem custo') : '—'}</td>
            <td class="qtd">${c ? fmtM(c.custoTotal) : '—'}</td>
        </tr>`;
    }).join('');

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${escaparHtml(receita.itemPcp?.unidade || '')}`;
    const perda = receita.perdaPercentual ? `${fmtPerda(receita.perdaPercentual)}%` : '—';
    const dataImpressao = new Date().toLocaleDateString('pt-BR');
    const custoTotal = custo ? fmtM(custo.custoTotal) : '—';
    const custoUnidade = custo ? fmtM(custo.custoPorUnidade, 4) : '—';
    const un = escaparHtml(receita.itemPcp?.unidade || 'un');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Receita (custos) - ${escaparHtml(receita.nome)}</title>
<style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12pt; line-height: 1.3; }
    .folha { width: 182mm; margin: 0 auto; }
    header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 22pt; margin: 0 0 4px; }
    .produz { font-size: 12pt; color: #333; margin: 0; }
    .meta { display: flex; gap: 20px; margin-top: 10px; flex-wrap: wrap; }
    .meta .rotulo { color: #555; font-size: 9pt; text-transform: uppercase; letter-spacing: .5px; display: block; }
    .meta .valor { font-weight: bold; font-size: 13pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ccc; }
    th { font-size: 9pt; text-transform: uppercase; color: #555; border-bottom: 2px solid #111; }
    td.nome { font-weight: bold; }
    .qtd, th.qtd { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .un, th.un { text-align: center; width: 60px; color: #333; }
    tfoot td { border-top: 2px solid #111; font-weight: bold; font-size: 13pt; }
    .resumo { margin-top: 18px; display: flex; gap: 16px; }
    .resumo .box { flex: 1; border: 2px solid #111; border-radius: 6px; padding: 10px 12px; }
    .resumo .rotulo { font-size: 9pt; text-transform: uppercase; letter-spacing: .5px; color: #555; }
    .resumo .valor { font-size: 18pt; font-weight: bold; }
    footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9pt; color: #777; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="folha">
    <header>
        <h1>${escaparHtml(receita.nome)}</h1>
        <p class="produz">Produz: <strong>${escaparHtml(receita.itemPcp?.nome || '—')}</strong>${receita.itemPcp?.tipo ? ` (${escaparHtml(TIPO_LABELS[receita.itemPcp.tipo] || receita.itemPcp.tipo)})` : ''}</p>
        <div class="meta">
            <div><span class="rotulo">Rendimento</span><span class="valor">${rendimento}</span></div>
            <div><span class="rotulo">Perda padrão</span><span class="valor">${perda}</span></div>
            <div><span class="rotulo">Versão</span><span class="valor">v${escaparHtml(receita.versao)}</span></div>
        </div>
    </header>
    <table>
        <thead>
            <tr>
                <th class="nome">Ingrediente</th>
                <th class="qtd">Qtd</th>
                <th class="un">Un.</th>
                <th class="qtd">Custo Unit.</th>
                <th class="qtd">Custo</th>
            </tr>
        </thead>
        <tbody>${linhas || '<tr><td colspan="5">Sem ingredientes.</td></tr>'}</tbody>
        <tfoot>
            <tr><td colspan="4" class="qtd">Custo total</td><td class="qtd">${custoTotal}</td></tr>
        </tfoot>
    </table>
    <div class="resumo">
        <div class="box"><div class="rotulo">Custo Total da Receita</div><div class="valor">${custoTotal}</div></div>
        <div class="box"><div class="rotulo">Custo por ${un}</div><div class="valor">${custoUnidade}</div></div>
    </div>
    ${receita.observacoes ? `<div class="resumo" style="margin-top:12px"><div class="box" style="flex:1"><div class="rotulo">Observações</div><p style="margin:4px 0 0;white-space:pre-wrap">${escaparHtml(receita.observacoes)}</p></div></div>` : ''}
    <footer><span>Impresso em ${dataImpressao}</span><span>Documento interno — contém custos</span></footer>
</div>
</body>
</html>`;
}

export default function ReceitaDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [receita, setReceita] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showSimulador, setShowSimulador] = useState(false);
    const [historico, setHistorico] = useState([]);
    const [logs, setLogs] = useState([]);
    const [showHistorico, setShowHistorico] = useState(false);
    const [itensMap, setItensMap] = useState({});
    const [custo, setCusto] = useState(null);

    useEffect(() => {
        setLoading(true);
        setCusto(null);
        pcpReceitaService.calcularCusto(id).then(setCusto).catch(() => setCusto(null));
        pcpReceitaService.buscarPorId(id)
            .then(async (r) => {
                setReceita(r);
                if (r?.itemPcpId) {
                    try {
                        const [h, l, itens] = await Promise.all([
                            pcpReceitaService.historico(r.itemPcpId),
                            pcpReceitaService.logs(id),
                            pcpItemService.listar({})
                        ]);
                        setHistorico(h);
                        setLogs(l);
                        const map = {};
                        (Array.isArray(itens) ? itens : []).forEach(i => { map[i.id] = i; });
                        setItensMap(map);
                    } catch { /* silencioso */ }
                }
            })
            .catch(() => toast.error('Erro ao carregar receita'))
            .finally(() => setLoading(false));
    }, [id]);

    const excluirReceita = async () => {
        if (!confirm('Excluir esta receita? Essa acao nao pode ser desfeita.')) return;
        try {
            await pcpReceitaService.excluir(id);
            toast.success('Receita excluida');
            navigate('/pcp/receitas');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const clonarReceita = async () => {
        const nome = prompt('Nome da nova receita (será criado um novo subproduto):', receita?.nome ? `${receita.nome} - copia` : '');
        if (!nome?.trim()) return;
        try {
            const nova = await pcpReceitaService.clonar(id, nome.trim());
            toast.success('Receita clonada');
            navigate(`/pcp/receitas/${nova.id}/editar`);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const imprimirReceita = () => {
        if (!receita) return;
        const win = window.open('', '_blank');
        if (!win) {
            toast.error('Permita pop-ups para imprimir');
            return;
        }
        win.document.write(montarHtmlImpressao(receita));
        win.document.close();
        win.focus();
        // espera o layout montar antes de chamar a impressao
        setTimeout(() => win.print(), 300);
    };

    const imprimirComCustos = () => {
        if (!receita) return;
        const win = window.open('', '_blank');
        if (!win) {
            toast.error('Permita pop-ups para imprimir');
            return;
        }
        win.document.write(montarHtmlImpressaoComCustos(receita, custo));
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>;
    if (!receita) return <div className="text-center py-12 text-gray-500">Receita nao encontrada</div>;

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <button onClick={() => navigate('/pcp/receitas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            {/* Cabecalho */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">{receita.nome}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Produz: <span className="font-medium">{receita.itemPcp?.nome}</span> ({receita.itemPcp?.tipo})
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">v{receita.versao}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[receita.status]}`}>
                            {receita.status}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-400">Rendimento Base</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {parseFloat(receita.rendimentoBase).toFixed(3)} {receita.itemPcp?.unidade}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Perda Padrao</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {receita.perdaPercentual ? `${parseFloat(receita.perdaPercentual).toFixed(2)}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Vigencia</p>
                        <p className="text-sm text-gray-600">
                            {receita.dataInicioVigencia ? new Date(receita.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                            {receita.dataFimVigencia && ` ate ${new Date(receita.dataFimVigencia).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                </div>

                {/* Resumo de custo */}
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-400">Custo Total da Receita</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {custo ? fmtMoeda(custo.custoTotal) : '...'}
                        </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-4 py-3">
                        <p className="text-xs text-emerald-700">Custo por {receita.itemPcp?.unidade || 'unidade'}</p>
                        <p className="text-lg font-bold text-emerald-800">
                            {custo ? fmtMoeda(custo.custoPorUnidade, 4) : '...'}
                        </p>
                        {custo && custo.perdaPercentual > 0 && (
                            <p className="text-[11px] text-emerald-600 mt-0.5">
                                já com perda de {fmtPerda(custo.perdaPercentual)}% (rende {fmtQtd(custo.rendimentoLiquido)} {receita.itemPcp?.unidade})
                            </p>
                        )}
                    </div>
                </div>
                {custo?.temCustoFaltando && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Alguns itens estão sem custo cadastrado — o valor acima pode estar incompleto. Cadastre o custo do produto (no Conta Azul ou manualmente no app) ou crie a receita do subproduto.
                    </p>
                )}

                {receita.observacoes && (
                    <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{receita.observacoes}</p>
                )}

                {/* Acoes */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    {receita.status !== 'inativa' && (
                        <button
                            onClick={() => navigate(`/pcp/receitas/${id}/editar`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                    )}
                    <button
                        onClick={() => setShowHistorico(!showHistorico)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                        <History className="h-3.5 w-3.5" /> Histórico ({historico.length})
                    </button>
                    <button
                        onClick={clonarReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
                    >
                        <Copy className="h-3.5 w-3.5" /> Clonar Receita
                    </button>
                    <button
                        onClick={() => setShowSimulador(!showSimulador)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                        <Calculator className="h-3.5 w-3.5" /> Simular Escalonamento
                    </button>
                    <button
                        onClick={imprimirReceita}
                        title="Versão para a cozinha, sem custos"
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                    >
                        <Printer className="h-3.5 w-3.5" /> Imprimir (cozinha)
                    </button>
                    <button
                        onClick={imprimirComCustos}
                        title="Versão interna, com os custos"
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                        <Printer className="h-3.5 w-3.5" /> Imprimir com custos
                    </button>
                    <button
                        onClick={excluirReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 ml-auto"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                </div>
            </div>

            {/* Histórico de versões */}
            {showHistorico && (
                <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-sm font-semibold text-gray-700">Histórico de versões</h2>
                    </div>
                    <div className="p-5">
                        <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
                            {historico.map(v => {
                                const ativa = v.id === id;
                                const log = v.logs?.[0];
                                return (
                                    <li key={v.id} className="ml-5">
                                        <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${ativa ? 'bg-blue-600 border-blue-600' : v.status === 'ativa' ? 'bg-green-500 border-green-500' : 'bg-gray-300 border-gray-300'}`}></span>
                                        <button
                                            onClick={() => navigate(`/pcp/receitas/${v.id}`)}
                                            className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${ativa ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-bold text-gray-800">v{v.versao}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_CORES[v.status]}`}>{v.status}</span>
                                                    {ativa && <span className="text-[10px] text-blue-600 font-medium">(visualizando)</span>}
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {log ? (
                                                <div className="mt-1.5 text-xs text-gray-600">
                                                    <span className="font-medium text-gray-700">{log.alteradoPorNome || 'Sistema'}</span>
                                                    <span className="text-gray-400"> · {new Date(log.alteradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                    <div className="mt-0.5 italic text-gray-600 truncate">"{log.motivo}"</div>
                                                </div>
                                            ) : (
                                                <div className="mt-1.5 text-xs text-gray-400">
                                                    Versão inicial · {v.dataInicioVigencia ? new Date(v.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {logs.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalhes da alteração</h3>
                            {logs.map(log => (
                                <div key={log.id} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 last:mb-0">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">{log.alteradoPorNome || 'Sistema'}</div>
                                            <div className="text-xs text-gray-500">{new Date(log.alteradoEm).toLocaleString('pt-BR')}</div>
                                        </div>
                                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">v{log.versao}</span>
                                    </div>
                                    <div className="py-3 border-b border-gray-100">
                                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Motivo</div>
                                        <p className="text-sm text-gray-800">{log.motivo}</p>
                                    </div>

                                    <div className="pt-3 space-y-3">
                                        {log.alteracoes?.campos && Object.keys(log.alteracoes.campos).length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dados da receita</div>
                                                <div className="space-y-1">
                                                    {Object.entries(log.alteracoes.campos).map(([k, v]) => {
                                                        const labels = { nome: 'Nome', rendimentoBase: 'Rendimento base', perdaPercentual: 'Perda (%)', observacoes: 'Observações' };
                                                        return (
                                                            <div key={k} className="flex items-center gap-2 text-sm">
                                                                <span className="text-gray-600 min-w-[120px]">{labels[k] || k}:</span>
                                                                <span className="line-through text-gray-400 text-xs">{String(v.de ?? '—')}</span>
                                                                <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                <span className="text-gray-900 font-medium">{String(v.para ?? '—')}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.adicionados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wider mb-1.5">+ Ingredientes adicionados</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.adicionados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-green-50 border border-green-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.removidos?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-1.5">− Ingredientes removidos</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.removidos.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-red-50 border border-red-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium line-through">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.alterados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">~ Quantidades alteradas</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.alterados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600 flex items-center gap-1.5">
                                                                    <span className="line-through text-gray-400">{i.quantidade.de} {unid}</span>
                                                                    <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                    <span className="text-gray-900 font-semibold">{i.quantidade.para} {unid}</span>
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Simulador */}
            {showSimulador && (
                <div className="mb-4">
                    <SimuladorEscalonamento receitaId={id} itensReceita={receita.itens} />
                </div>
            )}

            {/* Componentes */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                    Componentes ({receita.itens?.length || 0})
                </h2>

                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Item</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Tipo</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Quantidade</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Unidade</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Custo Unit.</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Custo</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Etapa</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {receita.itens?.map((item, idx) => {
                            const c = custo?.itens?.[idx];
                            return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <span className="font-medium">{item.itemPcp?.nome}</span>
                                        <span className="ml-2 text-xs text-gray-400">{item.itemPcp?.codigo}</span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_CORES[item.itemPcp?.tipo]}`}>
                                            {item.tipo}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                        {parseFloat(item.quantidade).toFixed(3)}
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-500">
                                        {item.itemPcp?.unidade}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                                        {c ? (c.custoUnitario > 0 ? fmtMoeda(c.custoUnitario, 4) : <span className="text-amber-600">sem custo</span>) : '...'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-800">
                                        {c ? fmtMoeda(c.custoTotal) : '...'}
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-400 text-xs">
                                        {item.ordemEtapa || '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {custo && (
                        <tfoot className="border-t-2 border-gray-200">
                            <tr>
                                <td colSpan={5} className="px-3 py-2 text-right font-medium text-gray-600">Custo total</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{fmtMoeda(custo.custoTotal)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                </div>
            </div>
        </div>
    );
}
