import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, Loader2, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import iaService from '../../services/comoFazerIaService';
import SelectBusca from '../../components/SelectBusca';
import CampoNumero from '../../components/CampoNumero';

// Configurações → Inteligência artificial (/config/ia). Contrato: docs/pop/plano-ia-pop-fase1.md §6.
// Ver: admin || configuracoes === true || configuracoes.view/edit. Editar: admin || configuracoes === true || configuracoes.edit === true
// (permissão é OBJETO — nunca `!!perms.configuracoes`, que liberaria até quem só pode ver).

const CARD = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const TIT = 'text-xs font-bold uppercase tracking-widest text-gray-600';
const CAMPO = 'w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-600';
const btnPrim = 'px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';

const podeEditarIa = (user) => {
    const p = user?.permissoes || {};
    const c = p.configuracoes;
    return p.admin === true || user?.isAdmin === true || c === true || (c && typeof c === 'object' && c.edit === true);
};

const ACAO = {
    MONTAR: 'Montar POP', PEDIR_DIFERENTE: 'Pedir diferente', MELHORAR_PASSO: 'Melhorar passo', SIMPLIFICAR_PASSO: 'Passo mais simples',
    SUGERIR_NAOFAZER: 'Sugerir “O que não fazer”', SUGERIR_SEDERERRADO: 'Sugerir “Se der errado”', SUGERIR_PERGUNTAS: 'Sugerir perguntas', SUGERIR_PASSOS: 'Sugerir mais passos',
};
const RESULTADO = {
    USADO: ['Usado', 'bg-green-100 text-green-800'], DESCARTADO: ['Descartado', 'bg-gray-100 text-gray-700'], GERADO: ['Sem resposta', 'bg-gray-100 text-gray-700'],
    ERRO: ['Erro', 'bg-red-100 text-red-700'], RECUSADO: ['Recusado pela IA', 'bg-red-100 text-red-700'], CANCELADO: ['Cancelado', 'bg-yellow-100 text-yellow-800'],
};
const Resultado = ({ r }) => { const [t, c] = RESULTADO[r] || [r || '—', 'bg-gray-100 text-gray-700']; return <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${c}`}>{t}</span>; };

const fmtBrl = (n) => (Number(n) > 0 && Number(n) < 0.01 ? '< R$ 0,01' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtUsd = (n) => (Number(n) > 0 && Number(n) < 0.01 ? '< US$ 0,01' : `US$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
const fmtSeg = (ms) => (ms == null ? '—' : `${Math.round(ms / 1000)} s`);
const fmtQuando = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };

function mesesRecentes() {
    const out = []; const hoje = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        out.push({ v, r: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    return out;
}

const Kpi = ({ rotulo, valor, sub, tom = '' }) => (
    <div className={`${CARD} p-3 md:p-4`}>
        <p className={TIT}>{rotulo}</p>
        <p className={`mt-1 text-xl md:text-2xl font-extrabold break-words ${tom || 'text-gray-900'}`}>{valor}</p>
        {sub ? <p className="text-xs text-gray-600 mt-0.5 break-words">{sub}</p> : null}
    </div>
);

export default function ConfigIA() {
    const { user } = useAuth();
    const editar = podeEditarIa(user);
    const meses = useMemo(mesesRecentes, []);
    const [mes, setMesSalvo] = useState(meses[0].v);   // sempre abre no mês atual (não persiste mês absoluto)

    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');
    const [cfg, setCfg] = useState(null);
    const [precos, setPrecos] = useState({});    // { modelo: { e: '', s: '' } } em texto
    const [cotacao, setCotacao] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [uso, setUso] = useState(null);
    const [erroUso, setErroUso] = useState('');

    const aplicar = useCallback((r) => {
        setDados(r);
        setCfg({ ...r.config, limiteDia: String(r.config?.limiteDia ?? '') });
        const p = r.precos || {};
        const m = {};
        Object.keys(p).forEach((k) => { if (k !== 'cotacaoBrl' && p[k]) m[k] = { e: String(p[k].entradaUsdPorM ?? ''), s: String(p[k].saidaUsdPorM ?? '') }; });
        setPrecos(m);
        setCotacao(p.cotacaoBrl != null ? String(p.cotacaoBrl) : '');
    }, []);

    useEffect(() => {
        let vivo = true;
        iaService.configGet().then((r) => { if (vivo) aplicar(r); })
            .catch((e) => { if (vivo) setErro(e?.response?.data?.erro || 'Não consegui carregar a configuração.'); });
        return () => { vivo = false; };
    }, [aplicar]);

    const carregarUso = useCallback(() => {
        setErroUso('');
        iaService.uso(mes).then(setUso).catch((e) => { setUso(null); setErroUso(e?.response?.data?.erro || 'Não consegui carregar o histórico.'); });
    }, [mes]);
    useEffect(() => { carregarUso(); }, [carregarUso]);

    const modelos = dados?.modelos || [];
    const rotuloModelo = (m) => (m.disponivel || /ANTHROPIC_API_KEY/.test(m.rotulo || '') ? m.rotulo : `${m.rotulo} — precisa da chave ANTHROPIC_API_KEY`);
    const usados = cfg ? [...new Set([cfg.modelo, cfg.modeloAjustes])] : [];
    const padrao = dados?.precosPadrao || {};
    const semPreco = usados.filter((m) => { const p = precos[m]; return (!p || p.e === '' || p.s === '') && !padrao[m]; });

    const salvar = async () => {
        const lim = Number(cfg.limiteDia);
        if (!Number.isInteger(lim) || lim < 1 || lim > 1000) { toast.error('O limite por dia precisa ser um número de 1 a 1000.'); return; }
        const pr = {};
        Object.entries(precos).forEach(([m, v]) => { if (v.e !== '' && v.s !== '') pr[m] = { entradaUsdPorM: Number(v.e), saidaUsdPorM: Number(v.s) }; });
        if (Number(cotacao) > 0) pr.cotacaoBrl = Number(cotacao);
        setSalvando(true);
        try {
            const r = await iaService.configPut({ config: { ligado: cfg.ligado, provedor: cfg.provedor, modelo: cfg.modelo, modeloAjustes: cfg.modeloAjustes, limiteDia: lim }, precos: pr });
            aplicar(r); toast.success('Configuração salva. Vale na hora, sem publicar de novo.'); carregarUso();
        } catch (e) { toast.error(e?.response?.data?.erro || 'Não consegui salvar.'); }
        finally { setSalvando(false); }
    };

    if (erro) return <div className="p-3 md:p-6"><p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p></div>;
    if (!dados || !cfg) return <div className="p-6"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

    const r = uso?.resumo;
    const cot = Number(cotacao) > 0 ? Number(cotacao) : (dados.precos?.cotacaoBrl || (dados.cotacaoAutomatica && !dados.cotacaoAutomatica.estimada ? dados.cotacaoAutomatica.valor : null));
    const chaveOk = dados.chave?.openai === true;
    const custoTxt = !r ? '…' : r.custoBrl != null ? fmtBrl(r.custoBrl) : r.custoUsd != null ? fmtUsd(r.custoUsd) : '—';
    const custoLinha = (u) => (u.custoUsd == null ? '—' : cot ? fmtBrl(u.custoUsd * cot) : fmtUsd(u.custoUsd));
    const usos = uso?.usos || [];

    return (
        <div className="p-3 md:p-6 max-w-5xl mx-auto space-y-4 max-w-full overflow-x-hidden">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg"><Bot className="h-4 w-4 md:h-5 md:w-5 text-primaryDark" /></div>
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">Inteligência artificial</h1>
                        <p className="text-xs md:text-sm text-gray-600">Configurações · Como Fazer</p>
                    </div>
                </div>
                {editar && <button type="button" onClick={salvar} disabled={salvando} className={btnPrim}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</button>}
            </div>
            {!editar && <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-3">Você pode ver, mas não alterar. Para mudar, peça a permissão de editar Configurações.</p>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi rotulo="POPs montados no mês" valor={r ? r.montados : '…'} sub={r ? `${r.usos} chamadas no total` : ''} />
                <Kpi rotulo="Gasto estimado no mês" valor={custoTxt} sub={r && r.custoUsd == null ? 'preencha o preço do modelo' : r?.usosSemPreco ? `${r.usosSemPreco} ${Number(r.usosSemPreco) === 1 ? 'chamada' : 'chamadas'} sem preço` : 'pelos tokens que a IA informa'} />
                <Kpi rotulo="Tempo médio" valor={r ? fmtSeg(r.tempoMedioMs) : '…'} sub={r && r.erros ? `${r.erros} com erro ou recusa` : ''} />
                <Kpi rotulo="Chave no servidor" valor={chaveOk ? 'Configurada' : 'Sem chave'} tom={chaveOk ? 'text-green-700' : 'text-red-700'} sub={chaveOk ? 'OpenAI (ChatGPT)' : 'A IA não funciona sem a chave'} />
            </div>

            <div className={CARD}>
                <div className="px-4 py-3 border-b border-gray-100"><span className={TIT}>Como Fazer (montar POP, melhorar texto, sugestões)</span></div>
                <div className="p-4 space-y-4">
                    <label className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer">
                        <input type="checkbox" checked={cfg.ligado !== false} disabled={!editar} onChange={(e) => setCfg({ ...cfg, ligado: e.target.checked })} className="h-6 w-6 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-800"><b>Ligado</b> — os botões ✨ aparecem para quem edita o Como Fazer. Desligado, ninguém usa a IA (e ela não gasta).</span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <span className="text-sm font-medium text-gray-700">Provedor</span>
                            <SelectBusca value={cfg.provedor} disabled={!editar} onChange={(e) => setCfg({ ...cfg, provedor: e.target.value })} className="mt-1 w-full h-11">
                                <option value="openai">OpenAI (ChatGPT) — já configurado</option>
                                <option value="anthropic" disabled>Claude (Anthropic) — precisa da chave ANTHROPIC_API_KEY</option>
                            </SelectBusca>
                        </div>
                        <div>
                            <span className="text-sm font-medium text-gray-700">Limite por dia (todas as pessoas)</span>
                            <CampoNumero value={cfg.limiteDia} disabled={!editar} onChange={(e) => setCfg({ ...cfg, limiteDia: e.target.value })} className={`${CAMPO} mt-1`} />
                            <p className="text-xs text-gray-600 mt-1">Chamadas por dia. Passou disso, a IA avisa e a pessoa começa em branco.</p>
                        </div>
                        <div>
                            <span className="text-sm font-medium text-gray-700">Modelo para montar o POP</span>
                            <SelectBusca value={cfg.modelo} disabled={!editar} onChange={(e) => setCfg({ ...cfg, modelo: e.target.value })} className="mt-1 w-full h-11">
                                {modelos.map((m) => <option key={`${m.provedor}-${m.modelo}`} value={m.modelo} disabled={!m.disponivel}>{rotuloModelo(m)}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <span className="text-sm font-medium text-gray-700">Modelo para ajustes pequenos (melhorar, mais simples)</span>
                            <SelectBusca value={cfg.modeloAjustes} disabled={!editar} onChange={(e) => setCfg({ ...cfg, modeloAjustes: e.target.value })} className="mt-1 w-full h-11">
                                {modelos.map((m) => <option key={`${m.provedor}-${m.modelo}`} value={m.modelo} disabled={!m.disponivel}>{rotuloModelo(m)}</option>)}
                            </SelectBusca>
                        </div>
                    </div>
                    <p className="text-xs text-gray-600">A chave da API fica só na configuração do servidor (variável OPENAI_API_KEY). Ela nunca é digitada nem aparece aqui.</p>
                </div>
            </div>

            <div className={CARD}>
                <div className="px-4 py-3 border-b border-gray-100"><span className={TIT}>Clippy (assistente de ajuda)</span></div>
                <div className="p-4 text-sm text-gray-700">O Clippy continua como está, no provedor e no modelo configurados no servidor. Esta tela não muda o Clippy.</div>
            </div>

            <div className={CARD}>
                <div className="px-4 py-3 border-b border-gray-100"><span className={TIT}>Preço por modelo (para calcular o gasto)</span></div>
                <div className="p-4 space-y-3">
                    {semPreco.length > 0 && (
                        <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-3 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>Não conheço o preço de {semPreco.join(', ')}. Preencha para ver o gasto; sem preço o custo aparece como “—”, nunca como R$ 0,00.</span></p>
                    )}
                    <p className="text-xs text-gray-600">Os preços e a cotação do dólar são buscados sozinhos: deixe os campos vazios para usar o automático. Preencha só para corrigir (em dólares por 1 milhão de tokens).</p>
                    {modelos.filter((m) => m.disponivel).map((m) => (
                        <div key={m.modelo} className="rounded-lg border border-gray-200 p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-2 break-words">{m.rotulo}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="block text-sm font-medium text-gray-700">Entrada (US$ por 1 mi de tokens)
                                    <CampoNumero decimal placeholder={padrao[m.modelo] ? `automático: ${padrao[m.modelo].entradaUsdPorM}` : ''} value={precos[m.modelo]?.e ?? ''} disabled={!editar} onChange={(e) => setPrecos({ ...precos, [m.modelo]: { e: e.target.value, s: precos[m.modelo]?.s ?? '' } })} className={`${CAMPO} mt-1`} /></label>
                                <label className="block text-sm font-medium text-gray-700">Saída (US$ por 1 mi de tokens)
                                    <CampoNumero decimal placeholder={padrao[m.modelo] ? `automático: ${padrao[m.modelo].saidaUsdPorM}` : ''} value={precos[m.modelo]?.s ?? ''} disabled={!editar} onChange={(e) => setPrecos({ ...precos, [m.modelo]: { e: precos[m.modelo]?.e ?? '', s: e.target.value } })} className={`${CAMPO} mt-1`} /></label>
                            </div>
                        </div>
                    ))}
                    <label className="block text-sm font-medium text-gray-700 md:max-w-xs">Cotação do dólar (R$) — para mostrar o gasto em reais
                        <CampoNumero decimal placeholder={dados.cotacaoAutomatica ? (dados.cotacaoAutomatica.estimada === true ? 'automático (indisponível agora)' : `automático: ${dados.cotacaoAutomatica.valor}`) : ''} value={cotacao} disabled={!editar} onChange={(e) => setCotacao(e.target.value)} className={`${CAMPO} mt-1`} /></label>
                </div>
            </div>

            <div className={CARD}>
                <div className="px-4 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
                    <span className={TIT}>Histórico de uso</span>
                    <SelectBusca value={mes} onChange={(e) => setMesSalvo(e.target.value)} className="w-full md:w-56 h-11">
                        {meses.map((m) => <option key={m.v} value={m.v}>{m.r}</option>)}
                    </SelectBusca>
                </div>
                {erroUso && <p className="m-4 rounded-xl bg-red-50 text-red-700 font-semibold p-3 text-sm">{erroUso}</p>}
                {!uso && !erroUso && <Loader2 className="h-6 w-6 animate-spin mx-auto my-6 text-primary" />}
                {uso && usos.length === 0 && <p className="p-6 text-center text-sm text-gray-600">Nenhuma chamada neste mês.</p>}
                {usos.length > 0 && (
                    <>
                        <div className="md:hidden space-y-3 p-3">
                            {usos.map((u) => (
                                <div key={u.id} className="rounded-xl border border-gray-200 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="font-semibold text-gray-900 text-sm break-words min-w-0">{ACAO[u.acao] || u.acao}{u.tituloRef ? ` · ${u.tituloRef}` : ''}</span>
                                        <Resultado r={u.resultado} />
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1 break-words">{fmtQuando(u.createdAt)} · {u.vendedorNome || '—'}</p>
                                    <p className="text-xs text-gray-600 break-words">{u.modelo} · {fmtSeg(u.duracaoMs)} · {custoLinha(u)}</p>
                                </div>
                            ))}
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50"><tr>{['Quando', 'Quem', 'O quê', 'Modelo', 'Tempo', 'Custo', 'Resultado'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr></thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {usos.map((u) => (
                                        <tr key={u.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtQuando(u.createdAt)}</td>
                                            <td className="px-4 py-3 text-gray-900">{u.vendedorNome || '—'}</td>
                                            <td className="px-4 py-3 text-gray-900">{ACAO[u.acao] || u.acao}{u.tituloRef ? ` · ${u.tituloRef}` : ''}</td>
                                            <td className="px-4 py-3 text-gray-700">{u.modelo}</td>
                                            <td className="px-4 py-3 text-gray-700">{fmtSeg(u.duracaoMs)}</td>
                                            <td className="px-4 py-3 text-gray-700">{custoLinha(u)}</td>
                                            <td className="px-4 py-3"><Resultado r={u.resultado} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {usos.length >= 200 && <p className="px-4 pb-3 text-xs text-gray-600">Mostrando as 200 chamadas mais recentes do mês.</p>}
                    </>
                )}
            </div>
        </div>
    );
}
