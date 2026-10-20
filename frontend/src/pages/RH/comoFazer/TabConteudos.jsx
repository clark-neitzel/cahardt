import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSetores, opcoesSetores } from '../../../hooks/useSetores';
import comoFazerService, { mensagemErro, TIPOS } from '../../../services/comoFazerService';
import SelectBusca from '../../../components/SelectBusca';
import MultiSelect from '../../../components/MultiSelect';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import EditorConteudo from './EditorConteudo';
import { BADGE_TIPO, BADGE_CONTEUDO, CLS_BADGE } from '../../../components/ComoFazer/visual';

const CAMPO = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';
function ModalNovo({ onCriado, onFechar }) {
    const [tipo, setTipo] = useState('REGRA');
    const [titulo, setTitulo] = useState('');
    const [icone, setIcone] = useState('');
    const { setores: listaSetores, aviso: avisoSetores } = useSetores();
    const [escolhidos, setSetores] = useState(null); // null = ainda não mexeu: sugere o primeiro setor ativo
    const setores = escolhidos ?? (listaSetores[0] ? [listaSetores[0].codigo] : []);
    const [salvando, setSalvando] = useState(false);

    const criar = async () => {
        if (!titulo.trim()) { toast.error('Dê um nome ao conteúdo.'); return; }
        setSalvando(true);
        try {
            const r = await comoFazerService.criar({ tipo, titulo: titulo.trim(), icone: icone.trim() || undefined, setores });
            onCriado(r.id);
        } catch (e) { toast.error(mensagemErro(e)); setSalvando(false); }
    };

    return (
        <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
                <h3 className="text-lg font-bold text-gray-900">Novo conteúdo</h3>
                <label className="block"><span className="text-sm font-medium text-gray-700">Tipo</span>
                    <SelectBusca value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 w-full">
                        {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.icone} {v.rotulo}</option>)}
                    </SelectBusca>
                </label>
                <div className="grid grid-cols-4 gap-2">
                    <label className="block col-span-3"><span className="text-sm font-medium text-gray-700">Nome</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${CAMPO} mt-1`} placeholder="Ex.: Higiene e uniforme" /></label>
                    <label className="block"><span className="text-sm font-medium text-gray-700">Ícone</span><input value={icone} maxLength={4} onChange={(e) => setIcone(e.target.value)} className={`${CAMPO} mt-1`} placeholder="👕" /></label>
                </div>
                <div><span className="text-sm font-medium text-gray-700">Setores</span>
                    <div className="mt-1"><MultiSelect options={opcoesSetores(listaSetores, setores, true, false)} valueKey="codigo" labelKey="nome" selected={setores} onChange={setSetores} placeholder="Escolha os setores" />
                        {avisoSetores && <p className="text-xs text-amber-700 font-semibold mt-1">Não consegui carregar os setores. Tente atualizar a página.</p>}</div>
                </div>
                <div className="flex gap-2 pt-1">
                    <button type="button" onClick={onFechar} className="flex-1 min-h-[48px] rounded-full bg-white border border-gray-300 text-gray-800 font-semibold">Cancelar</button>
                    <button type="button" onClick={criar} disabled={salvando} className="flex-1 min-h-[48px] rounded-full bg-primary hover:bg-primaryDark text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Criar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function TabConteudos({ abrirId, abrirNovo }) {
    const [filtros, setFiltros] = useFiltrosSalvos('como-fazer-conteudos', { tipo: '', status: '' });
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState('');
    const [editando, setEditando] = useState(abrirId || '');
    const [novo, setNovo] = useState(!!abrirNovo);

    const carregar = useCallback(async () => {
        try {
            const r = await comoFazerService.listarAdmin({ tipo: filtros.tipo || undefined, status: filtros.status || undefined });
            setLista(Array.isArray(r?.conteudos) ? r.conteudos : []); setErro('');
        } catch (e) { setErro(mensagemErro(e)); }
    }, [filtros.tipo, filtros.status]);

    useEffect(() => { carregar(); }, [carregar]);

    if (editando) return <EditorConteudo id={editando} onVoltar={() => { setEditando(''); carregar(); }} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
                <SelectBusca value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })} className="w-full md:w-44">
                    <option value="">Todos os tipos</option>
                    {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                </SelectBusca>
                <SelectBusca value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} className="w-full md:w-44">
                    <option value="">Todas as situações</option>
                    <option value="PUBLICADO">No ar</option>
                    <option value="RASCUNHO">Rascunho</option>
                    <option value="ARQUIVADO">Arquivado</option>
                </SelectBusca>
                <button type="button" onClick={() => setNovo(true)} className="md:ml-auto min-h-[44px] px-5 inline-flex items-center justify-center gap-2 rounded-full bg-primary hover:bg-primaryDark text-white font-semibold text-sm"><Plus className="h-4 w-4" /> Novo conteúdo</button>
            </div>

            {erro && <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p>}
            {!lista && !erro && <Loader2 className="h-8 w-8 animate-spin mx-auto my-8 text-primary" />}
            {lista && lista.length === 0 && <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Nenhum conteúdo ainda. Toque em “Novo conteúdo”.</p>}

            {lista && lista.length > 0 && (
                <>
                    <div className="md:hidden space-y-3">
                        {lista.map((c) => (
                            <button key={c.id} type="button" onClick={() => setEditando(c.id)} className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-gray-900 break-words">{c.icone || TIPOS[c.tipo]?.icone} {c.titulo}</span>
                                    <span className={`${CLS_BADGE} ${(BADGE_CONTEUDO[c.status] || BADGE_CONTEUDO.RASCUNHO).cls}`}>{(BADGE_CONTEUDO[c.status] || BADGE_CONTEUDO.RASCUNHO).rotulo}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                                    <span className={`${CLS_BADGE} ${BADGE_TIPO[c.tipo] || 'bg-gray-100 text-gray-700'}`}>{TIPOS[c.tipo]?.rotulo || c.tipo}</span>
                                    {c.codigo ? <span>{c.codigo}</span> : null}
                                    {c.versaoAtual != null ? <span>v{c.versaoAtual}</span> : null}
                                    {c.temRascunho && c.status === 'PUBLICADO' ? <span className="px-2 py-1 font-semibold rounded-full bg-amber-100 text-amber-700">alteração não publicada</span> : null}
                                    {c.semFoto > 0 ? <span className="px-2 py-1 font-semibold rounded-full bg-amber-100 text-amber-700">sem foto: {c.semFoto}</span> : null}
                                    {c.agenda && c.agenda.ok === false ? <span className="px-2 py-1 font-semibold rounded-full bg-red-100 text-red-700">agenda com problema</span> : null}
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {['Conteúdo', 'Tipo', 'Código', 'Versão', 'Situação', 'Atenção'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                            </tr></thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                                {lista.map((c) => (
                                    <tr key={c.id} onClick={() => setEditando(c.id)} className="hover:bg-gray-50 cursor-pointer">
                                        <td className="px-4 py-3 font-semibold text-gray-900">{c.icone || TIPOS[c.tipo]?.icone} {c.titulo}</td>
                                        <td className="px-4 py-3"><span className={`${CLS_BADGE} ${BADGE_TIPO[c.tipo] || 'bg-gray-100 text-gray-700'}`}>{TIPOS[c.tipo]?.rotulo || c.tipo}</span></td>
                                        <td className="px-4 py-3 text-gray-700">{c.codigo || '—'}</td>
                                        <td className="px-4 py-3 text-gray-700">{c.versaoAtual != null ? `v${c.versaoAtual}` : '—'}</td>
                                        <td className="px-4 py-3"><span className={`${CLS_BADGE} ${(BADGE_CONTEUDO[c.status] || BADGE_CONTEUDO.RASCUNHO).cls}`}>{(BADGE_CONTEUDO[c.status] || BADGE_CONTEUDO.RASCUNHO).rotulo}</span></td>
                                        <td className="px-4 py-3 space-x-1">
                                            {c.temRascunho && c.status === 'PUBLICADO' ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">alteração não publicada</span> : null}
                                            {c.semFoto > 0 ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">sem foto: {c.semFoto}</span> : null}
                                            {c.agenda && c.agenda.ok === false ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">agenda com problema</span> : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {novo && <ModalNovo onFechar={() => setNovo(false)} onCriado={(id) => { setNovo(false); setEditando(id); }} />}
        </div>
    );
}
