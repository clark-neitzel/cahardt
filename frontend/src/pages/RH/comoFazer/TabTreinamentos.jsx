import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSetores, opcoesSetores } from '../../../hooks/useSetores';
import comoFazerService, { mensagemErro, statusVisual, TIPOS } from '../../../services/comoFazerService';
import SelectBusca from '../../../components/SelectBusca';
import FotoPessoa from '../../../components/ComoFazer/FotoPessoa';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';

function Kpi({ rotulo, valor, tom }) {
    const cor = tom === 'r' ? 'text-red-700' : tom === 'a' ? 'text-amber-700' : tom === 'v' ? 'text-green-700' : 'text-gray-900';
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
            <b className={`block text-2xl font-extrabold ${cor}`}>{valor}</b>
            <small className="text-xs font-semibold text-gray-600">{rotulo}</small>
        </div>
    );
}

export default function TabTreinamentos({ podeEditar }) {
    const { setores: listaSetores, carregando: carregandoSetores, aviso: avisoSetores } = useSetores();
    const [filtros, setFiltros] = useFiltrosSalvos('como-fazer-painel', { setor: '' });
    // filtro salvo apontando para setor que não existe mais / está inativo (ou ainda vazio) cai no primeiro ativo
    const setorAtivo = listaSetores.some((s) => s.codigo === filtros.setor) ? filtros.setor : (listaSetores[0]?.codigo || filtros.setor || '');
    const [dados, setDados] = useState(null);
    const [kpis, setKpis] = useState(null);
    const [erro, setErro] = useState('');
    const [lembrando, setLembrando] = useState('');

    const carregar = useCallback(async () => {
        if (carregandoSetores || !setorAtivo) return;
        try {
            const [t, r] = await Promise.all([
                comoFazerService.painelTreinamentos(setorAtivo),
                comoFazerService.painelResumo({ setor: setorAtivo }).catch(() => null),
            ]);
            setDados(t); setKpis(r?.kpis || null); setErro('');
        } catch (e) { setErro(mensagemErro(e)); }
    }, [setorAtivo, carregandoSetores]);

    useEffect(() => { carregar(); }, [carregar]);

    const lembrar = async (funcionarioId, conteudoId) => {
        setLembrando(`${funcionarioId}|${conteudoId}`);
        try { await comoFazerService.lembrar(funcionarioId, conteudoId); toast.success('Lembrete criado na agenda dele.'); }
        catch (e) { toast.error(mensagemErro(e)); }
        finally { setLembrando(''); }
    };

    const conteudos = Array.isArray(dados?.conteudos) ? dados.conteudos : [];
    const funcs = Array.isArray(dados?.funcionarios) ? dados.funcionarios : [];
    const semSetor = Array.isArray(dados?.semSetor) ? dados.semSetor : [];
    const encSem = Array.isArray(dados?.encarregadosSemFuncionario) ? dados.encarregadosSemFuncionario : [];

    const Selo = ({ f }) => (
        <>
            {f.novo && <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-mint text-primaryDark">novo</span>}
            {f.semUsuario && <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-gray-100 text-gray-700">sem usuário</span>}
            {f.semPin && <Link to={`/rh/funcionarios/${f.id}`} className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700">sem senha de 4 números</Link>}
        </>
    );

    const Celula = ({ f, c }) => {
        const cel = f.celulas?.[c.id];
        const v = statusVisual(cel?.status);
        const pode = podeEditar && v.pendente && cel?.status !== 'NAO_SE_APLICA' && !f.semUsuario;
        return (
            <span className="inline-flex items-center gap-1" title={v.rotulo}>
                <span className="text-lg">{v.emoji}</span>
                {pode && (
                    <button type="button" onClick={() => lembrar(f.id, c.id)} disabled={lembrando === `${f.id}|${c.id}`} aria-label="Lembrar"
                        className="p-1.5 min-h-[32px] min-w-[32px] rounded-full text-gray-500 hover:bg-gray-100">
                        {lembrando === `${f.id}|${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                    </button>
                )}
            </span>
        );
    };

    return (
        <div className="space-y-4">
            <div className="max-w-xs">
                <SelectBusca value={setorAtivo} onChange={(e) => setFiltros({ ...filtros, setor: e.target.value })} className="w-full">
                    {opcoesSetores(listaSetores, [setorAtivo], true, false).map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
                </SelectBusca>
                {avisoSetores && <p className="text-xs text-amber-700 font-semibold mt-1">Não consegui carregar os setores. Tente atualizar a página.</p>}
            </div>

            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi rotulo="Treinamentos faltando" valor={kpis.treinamentosFaltando ?? 0} tom={kpis.treinamentosFaltando > 0 ? 'a' : 'v'} />
                    <Kpi rotulo="Reciclagens vencendo" valor={kpis.reciclagensVencendo ?? 0} tom={kpis.reciclagensVencendo > 0 ? 'a' : 'v'} />
                    <Kpi rotulo="Rotinas com desvio" valor={kpis.rotinasComDesvio ?? 0} tom={kpis.rotinasComDesvio > 0 ? 'r' : 'v'} />
                    <Kpi rotulo="Rotinas no prazo" valor={`${kpis.pctRotinasNoPrazo ?? 0}%`} tom="v" />
                </div>
            )}

            {erro && <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p>}
            {!dados && !erro && setorAtivo && <Loader2 className="h-8 w-8 animate-spin mx-auto my-8 text-primary" />}

            {(semSetor.length > 0 || encSem.length > 0) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
                    {semSetor.length > 0 && <p><b>{semSetor.length} funcionário(s) sem setor:</b> {semSetor.map((f) => f.nome).join(', ')}. Defina o setor na ficha do funcionário.</p>}
                    {encSem.length > 0 && <p><b>Encarregado sem funcionário ligado:</b> {encSem.map((v) => v.nome).join(', ')}. Sem isso ele não consegue confirmar treinamentos.</p>}
                </div>
            )}

            {dados && funcs.length === 0 && <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Nenhum funcionário neste setor.</p>}
            {dados && conteudos.length === 0 && funcs.length > 0 && <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Nada publicado neste setor ainda.</p>}

            {funcs.length > 0 && conteudos.length > 0 && (
                <>
                    {/* Mobile: um cartão por funcionário */}
                    <div className="md:hidden space-y-3">
                        {funcs.map((f) => (
                            <div key={f.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <FotoPessoa foto={f.foto} nome={f.nome} tamanho={36} />
                                    <div className="min-w-0 flex-1">
                                        <Link to={`/rh/funcionarios/${f.id}`} className="font-semibold text-gray-900 break-words">{f.nome}</Link>
                                        <div className="flex flex-wrap gap-1 mt-0.5"><Selo f={f} /></div>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    {conteudos.map((c) => (
                                        <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="min-w-0 break-words">{c.icone || TIPOS[c.tipo]?.icone} {c.titulo}</span>
                                            <Celula f={f} c={c} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop: matriz funcionário × conteúdo */}
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Funcionário</th>
                                    {conteudos.map((c) => <th key={c.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide max-w-[140px]">{c.icone || TIPOS[c.tipo]?.icone} {c.titulo}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                                {funcs.map((f) => (
                                    <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <FotoPessoa foto={f.foto} nome={f.nome} tamanho={32} />
                                                <div>
                                                    <Link to={`/rh/funcionarios/${f.id}`} className="font-semibold text-gray-900 hover:underline">{f.nome}</Link>
                                                    <div className="flex flex-wrap gap-1"><Selo f={f} /></div>
                                                </div>
                                            </div>
                                        </td>
                                        {conteudos.map((c) => <td key={c.id} className="px-3 py-2 text-center"><Celula f={f} c={c} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-gray-600">✅ treinou · 🟡 falta aprender ou confirmar · ⏳ vai vencer · — não se aplica</p>
                </>
            )}
        </div>
    );
}
