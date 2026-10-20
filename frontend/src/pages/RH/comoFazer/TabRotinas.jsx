import { useEffect, useState } from 'react';
import { Loader2, Printer, ImageOff, X } from 'lucide-react';
import { useSetores, opcoesSetores } from '../../../hooks/useSetores';
import comoFazerService, { mensagemErro, urlMidia } from '../../../services/comoFazerService';
import SelectBusca from '../../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import RelatorioComoFazer from './RelatorioComoFazer';
import { BADGE_SITUACAO as SITUACAO, CLS_BADGE, fmtDataHora as fmt } from '../../../components/ComoFazer/visual';

function MiniFoto({ rel, onAbrir }) {
    const [falhou, setFalhou] = useState(false);
    return (
        <button type="button" onClick={() => onAbrir(rel)} disabled={falhou} aria-label="Ver foto"
            className="h-12 w-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
            {falhou
                ? <ImageOff className="h-5 w-5 text-gray-500" />
                : <img src={urlMidia(rel)} alt="Foto da rotina" className="h-full w-full object-cover" onError={() => setFalhou(true)} />}
        </button>
    );
}

// Miniaturas que abrem na própria página (modal), sem nova aba.
function Fotos({ fotos }) {
    const [aberta, setAberta] = useState('');
    const lista = Array.isArray(fotos) ? fotos : [];
    if (!lista.length) return null;
    return (
        <>
            <div className="flex gap-1 flex-wrap">{lista.map((f, i) => <MiniFoto key={`${f}-${i}`} rel={f} onAbrir={setAberta} />)}</div>
            {aberta && (
                <div className="fixed inset-0 z-[9000] bg-black/80 flex items-center justify-center p-3" onClick={() => setAberta('')}>
                    <button type="button" aria-label="Fechar" className="absolute top-3 right-3 p-3 rounded-full bg-white/20 text-white"><X className="h-6 w-6" /></button>
                    <img src={urlMidia(aberta)} alt="Foto da rotina" className="max-h-full max-w-full object-contain rounded-lg" />
                </div>
            )}
        </>
    );
}

// O backend manda o desvio já em texto ("Freezer 1 — a porta fecha bem?: NAO — aviso"): SIM/NAO viram Sim/Não.
const detalheLegivel = (txt) => String(txt || '').replace(/: (SIM|NAO)(?= —| ·|$)/g, (_, v) => `: ${v === 'SIM' ? 'Sim' : 'Não'}`);

export default function TabRotinas({ destaque }) {
    const [periodo, periodoCtl] = usePeriodoSalvo('como-fazer-painel', '7d');
    const { setores: listaSetores, carregando: carregandoSetores, aviso: avisoSetores } = useSetores();
    const [filtros, setFiltros] = useFiltrosSalvos('como-fazer-painel-rotinas', { situacao: 'todas', setor: '' });
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');
    const [relatorio, setRelatorio] = useState(false);

    useEffect(() => {
        let vivo = true;
        comoFazerService.painelExecucoes({ de: periodo.de || undefined, ate: periodo.ate || undefined, situacao: filtros.situacao, setor: filtros.setor || undefined })
            .then((d) => { if (vivo) { setDados(d); setErro(''); } })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [periodo.de, periodo.ate, filtros.situacao, filtros.setor]);

    const itens = Array.isArray(dados?.itens) ? dados.itens : [];
    const nFiltros = (!periodo.padrao ? 1 : 0) + (filtros.situacao !== 'todas' ? 1 : 0) + (filtros.setor ? 1 : 0);
    const limpar = () => { periodoCtl.limpar(); setFiltros({ situacao: 'todas', setor: '' }); };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
                <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
                <SelectBusca value={filtros.situacao} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })} className="w-full md:w-44">
                    <option value="todas">Todas as situações</option>
                    <option value="DESVIO">Só desvios</option>
                    <option value="NAO_FEITA">Só não feitas</option>
                    <option value="OK">Só OK</option>
                </SelectBusca>
                <SelectBusca value={filtros.setor} onChange={(e) => setFiltros({ ...filtros, setor: e.target.value })} className="w-full md:w-44">
                    <option value="">Todos os setores</option>
                    {opcoesSetores(listaSetores, [filtros.setor], false, !carregandoSetores && !avisoSetores).map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
                </SelectBusca>
                {nFiltros > 0 && <button type="button" onClick={limpar} className="min-h-[44px] px-3 text-sm font-semibold text-primary">Limpar filtros ({nFiltros})</button>}
                <button type="button" onClick={() => setRelatorio(true)} className="md:ml-auto min-h-[44px] px-4 inline-flex items-center justify-center gap-2 rounded-full bg-white border border-primary text-primary font-semibold text-sm">
                    <Printer className="h-4 w-4" /> Relatório p/ Vigilância
                </button>
            </div>

            {erro && <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p>}
            {!dados && !erro && <Loader2 className="h-8 w-8 animate-spin mx-auto my-8 text-primary" />}
            {dados && itens.length === 0 && <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Nenhuma execução neste período.</p>}

            {itens.length > 0 && (
                <>
                    <div className="md:hidden space-y-3">
                        {itens.map((i, idx) => {
                            const s = SITUACAO[i.situacao] || SITUACAO.OK;
                            return (
                                <div key={`${i.execucaoId || i.conteudoId}-${idx}`} className={`bg-white rounded-xl border shadow-sm p-3 ${i.execucaoId && i.execucaoId === destaque ? 'border-primary border-2' : 'border-gray-200'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="font-semibold text-gray-900 break-words">{i.titulo}</span>
                                        <span className={`${CLS_BADGE} ${s.cls}`}>{s.rotulo}</span>
                                    </div>
                                    <div className="text-xs text-gray-600">{fmt(i.quando)}{i.funcionario ? ` · ${i.funcionario}` : ''}</div>
                                    {i.detalhe ? <div className="text-sm text-gray-700 mt-1 break-words">{detalheLegivel(i.detalhe)}</div> : null}
                                    {i.semEncarregado && <div className="text-xs font-semibold text-red-700 mt-1">Sem encarregado para avisar</div>}
                                    <div className="mt-2"><Fotos fotos={i.fotos} /></div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {['Quando', 'Rotina', 'Quem fez', 'Situação', 'O que aconteceu', 'Fotos'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                            </tr></thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                                {itens.map((i, idx) => {
                                    const s = SITUACAO[i.situacao] || SITUACAO.OK;
                                    return (
                                        <tr key={`${i.execucaoId || i.conteudoId}-${idx}`} className={i.execucaoId && i.execucaoId === destaque ? 'bg-mint/40' : 'hover:bg-gray-50'}>
                                            <td className="px-4 py-2 whitespace-nowrap">{fmt(i.quando)}</td>
                                            <td className="px-4 py-2 font-semibold text-gray-900">{i.titulo}</td>
                                            <td className="px-4 py-2">{i.funcionario || '—'}</td>
                                            <td className="px-4 py-2"><span className={`${CLS_BADGE} ${s.cls}`}>{s.rotulo}</span></td>
                                            <td className="px-4 py-2 text-gray-700">{detalheLegivel(i.detalhe)}{i.semEncarregado ? <span className="block text-xs font-semibold text-red-700">Sem encarregado para avisar</span> : null}</td>
                                            <td className="px-4 py-2"><Fotos fotos={i.fotos} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {relatorio && <RelatorioComoFazer periodo={periodo} onFechar={() => setRelatorio(false)} />}
        </div>
    );
}
