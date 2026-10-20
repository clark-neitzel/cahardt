import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Tag, Plus, Pencil, Ban, RotateCcw, Trash2, ArrowUp, ArrowDown, X, Loader2, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import setorService, { podeGerirSetores } from '../../services/setorService';
import { invalidarSetores } from '../../hooks/useSetores';

// Configurações → Setores (/config/setores). Contrato: docs/pop/plano-setores.md.
// Renomear muda só o `nome`; o `codigo` (COZINHA…) nunca muda — é o que ficha, conteúdos e tablets guardam.
// Leitura: qualquer logado. Escrita: admin || configuracoes === true || configuracoes.edit === true (igual ao backend).

const btnPrim = 'px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnSec = 'px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnPerigo = 'px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnGhost = 'px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full';
const btnIcone = 'p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';
const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

const erroDe = (e, padrao) => e?.response?.data?.error || e?.response?.data?.erro || e?.response?.data?.message || padrao;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const Modal = ({ titulo, onFechar, children, rodape }) => (
    <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
        <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-900 truncate">{titulo}</p>
                <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
            {rodape && <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{rodape}</div>}
        </div>
    </div>
);

const Badge = ({ ativo }) => (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{ativo ? 'Ativo' : 'Inativo'}</span>
);

const usoTexto = (s) => {
    const f = s.uso?.funcionarios ?? 0;
    const c = s.uso?.conteudos ?? 0;
    return `${plural(f, 'funcionário', 'funcionários')} · ${plural(c, 'conteúdo', 'conteúdos')}`;
};

export default function Setores() {
    const { user } = useAuth();
    const podeGerir = podeGerirSetores(user);

    const [setores, setSetores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erroLista, setErroLista] = useState('');
    const [ocupado, setOcupado] = useState(null);
    const [form, setForm] = useState(null);       // { id?, codigo?, nome, icone }
    const [salvando, setSalvando] = useState(false);
    const [confirmar, setConfirmar] = useState(null); // { tipo: 'desativar'|'excluir', setor }

    const carregar = useCallback(async () => {
        setLoading(true); setErroLista('');
        try {
            const d = await setorService.listar({ todos: true });
            const lista = (Array.isArray(d.setores) ? d.setores : []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
            setSetores(lista);
        } catch (e) {
            setErroLista(erroDe(e, 'Não foi possível carregar os setores.'));
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const depoisDeSalvar = async () => { invalidarSetores(); await carregar(); };

    const salvar = async () => {
        const nome = (form.nome || '').trim();
        if (!nome) { toast.error('Dê um nome ao setor.'); return; }
        setSalvando(true);
        try {
            const dados = { nome, icone: (form.icone || '').trim() || '📌' };
            if (form.id) await setorService.atualizar(form.id, dados);
            else await setorService.criar(dados);
            toast.success(form.id ? 'Setor atualizado.' : 'Setor criado.');
            setForm(null);
            await depoisDeSalvar();
        } catch (e) { toast.error(erroDe(e, 'Não foi possível salvar o setor.')); }
        finally { setSalvando(false); }
    };

    const mover = async (idx, delta) => {
        const alvo = idx + delta;
        if (alvo < 0 || alvo >= setores.length) return;
        const nova = setores.slice();
        [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
        setOcupado('ordem');
        try {
            await setorService.reordenar(nova.map((s, i) => ({ id: s.id, ordem: i + 1 })));
            await depoisDeSalvar();
        } catch (e) { toast.error(erroDe(e, 'Não foi possível mudar a ordem.')); }
        finally { setOcupado(null); }
    };

    const alternarAtivo = async (s, ativo) => {
        setOcupado(s.id);
        try {
            await setorService.atualizar(s.id, { ativo });
            toast.success(ativo ? 'Setor reativado.' : 'Setor desativado.');
            setConfirmar(null);
            await depoisDeSalvar();
        } catch (e) { toast.error(erroDe(e, 'Não foi possível alterar o setor.')); }
        finally { setOcupado(null); }
    };

    const pedirDesativar = (s) => {
        const f = s.uso?.funcionarios ?? 0;
        const c = s.uso?.conteudos ?? 0;
        if (f + c > 0) setConfirmar({ tipo: 'desativar', setor: s });
        else alternarAtivo(s, false);
    };

    const excluir = async (s) => {
        setOcupado(s.id);
        try {
            await setorService.excluir(s.id);
            toast.success('Setor excluído.');
            setConfirmar(null);
            await depoisDeSalvar();
        } catch (e) {
            if (e?.response?.data?.codigo === 'SETOR_EM_USO') {
                const u = e.response.data.uso || {};
                toast.error(`Este setor está em uso (${plural(u.funcionarios ?? 0, 'funcionário', 'funcionários')}, ${plural(u.conteudos ?? 0, 'conteúdo', 'conteúdos')}). Desative em vez de excluir.`);
                setConfirmar(null);
                await carregar();
            } else toast.error(erroDe(e, 'Não foi possível excluir o setor.'));
        } finally { setOcupado(null); }
    };

    const Acoes = ({ s, idx }) => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
            <button type="button" className={btnIcone} aria-label="Subir" title="Subir na ordem" disabled={idx === 0 || !!ocupado} onClick={() => mover(idx, -1)}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" className={btnIcone} aria-label="Descer" title="Descer na ordem" disabled={idx === setores.length - 1 || !!ocupado} onClick={() => mover(idx, 1)}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" className={btnIcone} aria-label="Editar" title="Renomear / mudar ícone" onClick={() => setForm({ id: s.id, codigo: s.codigo, nome: s.nome, icone: s.icone || '' })}><Pencil className="h-4 w-4" /></button>
            {s.ativo
                ? <button type="button" className={btnIcone} aria-label="Desativar" title="Desativar" disabled={ocupado === s.id} onClick={() => pedirDesativar(s)}><Ban className="h-4 w-4" /></button>
                : <button type="button" className={btnIcone} aria-label="Reativar" title="Reativar" disabled={ocupado === s.id} onClick={() => alternarAtivo(s, true)}><RotateCcw className="h-4 w-4" /></button>}
            {(s.uso?.funcionarios ?? 0) + (s.uso?.conteudos ?? 0) === 0 && (
                <button type="button" className={`${btnIcone} hover:text-red-600`} aria-label="Excluir" title="Excluir (só setor sem uso)" disabled={ocupado === s.id} onClick={() => setConfirmar({ tipo: 'excluir', setor: s })}><Trash2 className="h-4 w-4" /></button>
            )}
        </div>
    );

    return (
        <div className="p-3 md:p-6 max-w-full overflow-x-hidden">
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg"><Tag className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Setores</h1>
                        <p className="text-xs text-gray-600 hidden md:block">Os setores da empresa (Cozinha, Estoque…). Mudar o nome aqui muda em todo o sistema.</p>
                    </div>
                </div>
                {podeGerir && <button type="button" className={btnPrim} onClick={() => setForm({ nome: '', icone: '' })}><Plus className="h-4 w-4" /> Novo setor</button>}
            </div>
            <p className="text-xs text-gray-600 md:hidden mb-3">Mudar o nome aqui muda em todo o sistema.</p>

            {!podeGerir && (
                <div className="flex gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 mb-3"><Lock className="h-4 w-4 shrink-0" /><span>Você pode ver os setores, mas só quem tem permissão de Configurações altera.</span></div>
            )}

            {loading && <Loader2 className="h-8 w-8 animate-spin mx-auto my-10 text-primary" />}
            {!loading && erroLista && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
                    <span>{erroLista}</span><button type="button" className={btnSec} onClick={carregar}>Tentar de novo</button>
                </div>
            )}

            {!loading && !erroLista && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Lista de setores</span>
                    </div>

                    {setores.length === 0 && <p className="p-6 text-center text-sm text-gray-600">Nenhum setor cadastrado ainda.</p>}

                    {/* Mobile: cards */}
                    <div className="md:hidden space-y-3 p-3">
                        {setores.map((s, idx) => (
                            <div key={s.id} className={`rounded-xl border border-gray-200 p-3 ${s.ativo ? 'bg-white' : 'bg-gray-50'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-gray-900 truncate min-w-0"><span className="mr-1.5">{s.icone || '•'}</span>{s.nome}</span>
                                    <Badge ativo={s.ativo} />
                                </div>
                                <div className="text-xs text-gray-500 mt-1">código {s.codigo} · {usoTexto(s)}</div>
                                {podeGerir && <div className="mt-2 border-t border-gray-100 pt-2"><Acoes s={s} idx={idx} /></div>}
                            </div>
                        ))}
                    </div>

                    {/* Desktop: tabela */}
                    {setores.length > 0 && (
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Ordem</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Setor</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Em uso</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                                        {podeGerir && <th className="px-5 py-3" />}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {setores.map((s, idx) => (
                                        <tr key={s.id} className={`hover:bg-gray-50 ${s.ativo ? '' : 'bg-gray-50/60'}`}>
                                            <td className="px-5 py-3 text-gray-700 tabular-nums">{idx + 1}</td>
                                            <td className="px-5 py-3 text-gray-900 font-medium"><span className="mr-2">{s.icone || '•'}</span>{s.nome}</td>
                                            <td className="px-5 py-3 text-gray-500">{s.codigo}</td>
                                            <td className="px-5 py-3 text-gray-700">{usoTexto(s)}</td>
                                            <td className="px-5 py-3"><Badge ativo={s.ativo} /></td>
                                            {podeGerir && <td className="px-5 py-2"><Acoes s={s} idx={idx} /></td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {form && (
                <Modal titulo={form.id ? 'Editar setor' : 'Novo setor'} onFechar={() => setForm(null)} rodape={<>
                    <button type="button" className={btnGhost} onClick={() => setForm(null)}>Cancelar</button>
                    <button type="button" className={btnPrim} disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
                </>}>
                    <div className="grid grid-cols-4 gap-2">
                        <label className="block col-span-3"><span className="text-sm font-medium text-gray-700">Nome</span>
                            <input value={form.nome} maxLength={40} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={`${inputCls} mt-1`} placeholder="Ex.: Limpeza" autoFocus /></label>
                        <label className="block"><span className="text-sm font-medium text-gray-700">Ícone</span>
                            <input value={form.icone} maxLength={8} onChange={(e) => setForm({ ...form, icone: e.target.value })} className={`${inputCls} mt-1 text-center`} placeholder="🧹" /></label>
                    </div>
                    {form.id && (
                        <p className="text-xs text-gray-600">Código interno: <b>{form.codigo}</b>. Ele não muda — só o nome. Funcionários, conteúdos e tablets continuam ligados ao setor.</p>
                    )}
                </Modal>
            )}

            {confirmar?.tipo === 'desativar' && (
                <Modal titulo={`Desativar ${confirmar.setor.nome}?`} onFechar={() => setConfirmar(null)} rodape={<>
                    <button type="button" className={btnGhost} onClick={() => setConfirmar(null)}>Cancelar</button>
                    <button type="button" className={btnPerigo} disabled={ocupado === confirmar.setor.id} onClick={() => alternarAtivo(confirmar.setor, false)}>Desativar mesmo assim</button>
                </>}>
                    <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <span>O setor <b>{confirmar.setor.nome}</b> tem {plural(confirmar.setor.uso?.funcionarios ?? 0, 'funcionário', 'funcionários')} e {plural(confirmar.setor.uso?.conteudos ?? 0, 'conteúdo', 'conteúdos')}. Eles continuam cadastrados, mas o setor some das escolhas e o tablet dele fica fora do ar. Dá para reativar depois.</span>
                    </div>
                </Modal>
            )}

            {confirmar?.tipo === 'excluir' && (
                <Modal titulo={`Excluir ${confirmar.setor.nome}?`} onFechar={() => setConfirmar(null)} rodape={<>
                    <button type="button" className={btnGhost} onClick={() => setConfirmar(null)}>Cancelar</button>
                    <button type="button" className={btnPerigo} disabled={ocupado === confirmar.setor.id} onClick={() => excluir(confirmar.setor)}>Excluir</button>
                </>}>
                    <p className="text-sm text-gray-700">Este setor não tem funcionários nem conteúdos. Excluir apaga o setor de vez.</p>
                </Modal>
            )}
        </div>
    );
}
