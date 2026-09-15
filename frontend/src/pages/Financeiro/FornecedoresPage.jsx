import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import fornecedorService from '../../services/fornecedorService';
import { Building2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import CampoCidade from '../../components/CampoCidade';
import { erroCidadeNaoCadastrada } from '../../services/cidadeService';
// CPF/CNPJ (inclui CNPJ ALFANUMÉRICO) — módulo único do projeto.
import { mascaraDoc, formatarDoc, validarDoc, normalizarDoc } from '../../utils/documento';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// CNPJ (num/alfanumérico) → XX.XXX.XXX/XXXX-XX · CPF → XXX.XXX.XXX-XX
const fmtCnpjCpf = (v) => (normalizarDoc(v) ? formatarDoc(v) : '—');

const FornecedoresPage = () => {
    const { hasPermission } = useAuth();
    const podeEditar = hasPermission('Pode_Editar_Fornecedores');

    // ?busca= na URL chega da tela de Clientes (atalho "Encontrado nos Fornecedores")
    const [searchParams] = useSearchParams();
    const buscaInicial = searchParams.get('busca') || '';

    const [fornecedores, setFornecedores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busca, setBusca] = useState(buscaInicial);
    const [buscaInput, setBuscaInput] = useState(buscaInicial);
    const [modal, setModal] = useState(null); // { fornecedor: null } = novo | { fornecedor }

    useEffect(() => {
        const t = setTimeout(() => setBusca(buscaInput), 400);
        return () => clearTimeout(t);
    }, [buscaInput]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fornecedorService.listar(busca);
            setFornecedores(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar fornecedores');
        } finally {
            setLoading(false);
        }
    }, [busca]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const cidadeUf = (f) => {
        if (f.cidade && f.uf) return `${f.cidade}/${f.uf}`;
        return f.cidade || f.uf || '—';
    };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-emerald-100 p-1.5 md:p-2 rounded-lg">
                        <Building2 className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Fornecedores</h1>
                </div>
                {podeEditar && (
                    <button
                        onClick={() => setModal({ fornecedor: null })}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm text-xs md:text-sm font-semibold"
                    >
                        + Novo Fornecedor
                    </button>
                )}
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Busca + importação */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <input
                        value={buscaInput}
                        onChange={e => setBuscaInput(e.target.value)}
                        placeholder="Buscar por nome ou CNPJ…"
                        className="w-full md:w-72 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <div className="text-xs text-gray-500 md:ml-auto">
                        {fornecedores.length} fornecedor{fornecedores.length === 1 ? '' : 'es'}
                    </div>
                </div>

                {loading && (
                    <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                    {fornecedores.length === 0 && !loading && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-400">
                            Nenhum fornecedor encontrado.
                        </div>
                    )}
                    {fornecedores.map(f => (
                        <div
                            key={f.id}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
                            onClick={() => podeEditar && setModal({ fornecedor: f })}
                        >
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="font-semibold text-gray-900 truncate">{f.nomeFantasia || f.razaoSocial || 'Sem nome'}</span>
                            </div>
                            <div className="text-sm text-gray-500">{fmtCnpjCpf(f.cnpjCpf)} · {cidadeUf(f)}</div>
                            {f.nomeFantasia && f.razaoSocial && (
                                <div className="text-xs text-gray-400 mt-1 truncate">{f.razaoSocial}</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">CNPJ</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cidade/UF</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {fornecedores.length === 0 && !loading && (
                                    <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum fornecedor encontrado.</td></tr>
                                )}
                                {fornecedores.map(f => (
                                    <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-5 py-3">
                                            <div className="font-medium text-gray-900">{f.razaoSocial || f.nomeFantasia || 'Sem nome'}</div>
                                            {f.nomeFantasia && f.razaoSocial && <div className="text-xs text-gray-500">{f.nomeFantasia}</div>}
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{fmtCnpjCpf(f.cnpjCpf)}</td>
                                        <td className="px-5 py-3 text-gray-600">{cidadeUf(f)}</td>
                                        <td className="px-5 py-3 text-right">
                                            {podeEditar && (
                                                <button
                                                    onClick={() => setModal({ fornecedor: f })}
                                                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 text-xs"
                                                >
                                                    Abrir
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Banner */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    O cadastro de fornecedores é feito aqui no app.
                </div>
            </div>

            {modal && (
                <FornecedorModal
                    fornecedor={modal.fornecedor}
                    onClose={() => setModal(null)}
                    onSuccess={() => { setModal(null); fetchData(); }}
                />
            )}
        </div>
    );
};

// ── Modal criar/editar fornecedor ──
const FornecedorModal = ({ fornecedor, onClose, onSuccess }) => {
    const editando = !!fornecedor;
    const [form, setForm] = useState({
        razaoSocial: fornecedor?.razaoSocial || '',
        nomeFantasia: fornecedor?.nomeFantasia || '',
        cnpjCpf: fornecedor?.cnpjCpf || '',
        email: fornecedor?.email || '',
        telefone: fornecedor?.telefone || '',
        cidade: fornecedor?.cidade || '',
        uf: fornecedor?.uf || '',
        observacoes: fornecedor?.observacoes || ''
    });
    const [salvando, setSalvando] = useState(false);
    const [excluindo, setExcluindo] = useState(false);
    const [abrirCadastroCidade, setAbrirCadastroCidade] = useState(null); // 400 CIDADE_NAO_CADASTRADA

    const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

    const excluir = async () => {
        if (!window.confirm(`Excluir o fornecedor "${fornecedor.razaoSocial}"?\n\nSe ele tiver despesas/notas ligadas, elas são movidas para o fornecedor de mesmo CNPJ que ficar.`)) return;
        setExcluindo(true);
        try {
            await fornecedorService.excluir(fornecedor.id);
            toast.success('Fornecedor excluído.');
            onSuccess();
        } catch (e) {
            const d = e.response?.data;
            if (e.response?.status === 409 && d?.precisaMesclar) {
                try {
                    const lista = await fornecedorService.listar(fornecedor.cnpjCpf || fornecedor.razaoSocial);
                    const irmaos = (Array.isArray(lista) ? lista : []).filter(
                        x => x.id !== fornecedor.id && x.cnpjCpf && fornecedor.cnpjCpf && x.cnpjCpf === fornecedor.cnpjCpf
                    );
                    if (irmaos.length === 0) {
                        toast.error('Tem despesas/notas ligadas e não há outro fornecedor de mesmo CNPJ para receber. Não dá para excluir.');
                        return;
                    }
                    const destino = irmaos[0];
                    if (!window.confirm(`Este fornecedor tem ${d.contas} despesa(s) e ${d.notas} nota(s).\n\nMover tudo para "${destino.razaoSocial}" e excluir este?`)) return;
                    const r = await fornecedorService.excluir(fornecedor.id, destino.id);
                    toast.success(r?.message || 'Fornecedor mesclado e excluído.');
                    onSuccess();
                } catch (e2) {
                    toast.error(e2.response?.data?.error || 'Erro ao mesclar/excluir.');
                }
            } else {
                toast.error(d?.error || 'Erro ao excluir fornecedor.');
            }
        } finally {
            setExcluindo(false);
        }
    };

    const salvar = async () => {
        if (!form.razaoSocial.trim()) { toast.error('Informe a razão social.'); return; }
        const docNorm = normalizarDoc(form.cnpjCpf);
        if (docNorm && !validarDoc(docNorm)) { toast.error('CNPJ / CPF inválido — confira o número (o dígito verificador não bate).'); return; }
        setSalvando(true);
        try {
            const payload = {
                razaoSocial: form.razaoSocial.trim(),
                nomeFantasia: form.nomeFantasia.trim() || undefined,
                cnpjCpf: docNorm || undefined,
                email: form.email.trim() || undefined,
                telefone: form.telefone.trim() || undefined,
                cidade: form.cidade.trim() || undefined,
                uf: form.uf || undefined,
                observacoes: form.observacoes.trim() || undefined
            };
            if (editando) {
                await fornecedorService.atualizar(fornecedor.id, payload);
                toast.success('Fornecedor atualizado!');
            } else {
                await fornecedorService.criar(payload);
                toast.success('Fornecedor criado!');
            }
            onSuccess();
        } catch (e) {
            const ec = erroCidadeNaoCadastrada(e);
            if (ec) {
                toast.error(`A cidade "${ec.cidade}" não está no cadastro. Cadastre-a ou escolha outra.`, { duration: 5000 });
                setAbrirCadastroCidade({ nome: ec.cidade, n: Date.now() });
                return;
            }
            toast.error(e.response?.data?.error || 'Erro ao salvar fornecedor');
        } finally {
            setSalvando(false);
        }
    };

    const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900">{editando ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Razão social *</label>
                        <input value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome fantasia</label>
                            <input value={form.nomeFantasia} onChange={e => set('nomeFantasia', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ / CPF</label>
                            <input value={form.cnpjCpf} onChange={e => set('cnpjCpf', mascaraDoc(e.target.value))} autoCapitalize="characters" placeholder="CNPJ ou CPF" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                            <input value={form.telefone} onChange={e => set('telefone', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                            <CampoCidade value={form.cidade} onChange={v => set('cidade', v)} ufSugerida={form.uf || 'SC'} abrirCadastroCom={abrirCadastroCidade} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                            <SelectBusca value={form.uf} onChange={e => set('uf', e.target.value)} className="w-full">
                                <option value="">—</option>
                                {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                            </SelectBusca>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <textarea rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} className={inputCls} />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3">
                    {editando && (
                        <button onClick={excluir} disabled={excluindo || salvando} className="px-4 py-2 bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-md font-medium text-sm disabled:opacity-50">
                            {excluindo ? 'Excluindo…' : 'Excluir'}
                        </button>
                    )}
                    <div className="flex gap-3 sm:ml-auto">
                        <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                        <button onClick={salvar} disabled={salvando} className="flex-1 px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50">
                            {salvando ? 'Salvando…' : (editando ? 'Salvar alterações' : 'Criar fornecedor')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FornecedoresPage;
