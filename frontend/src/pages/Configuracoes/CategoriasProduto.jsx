import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Plus, Save, X, Lock, AlertTriangle } from 'lucide-react';
import categoriaProdutoService from '../../services/categoriaProdutoService';
import { useAuth } from '../../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Permissão de ESCRITA desta tela — espelha EXATAMENTE o backend
// (backend/middlewares/permissaoCategoriasProduto.js): admin OU
// `Pode_Editar_Categorias_Produto`, aceitando `true` e a string `"true"`.
//
// ⚠️ No CA-Hardt permissão é OBJETO em uns casos (`produtos: { view, edit }`) e
// BOOLEANO em outros. Esta é booleana de primeiro nível, como
// `Pode_Dar_Desconto_Baixa`. Por isso NUNCA `!!permissoes.x`: em JavaScript um
// objeto — inclusive `{}` — é sempre verdadeiro, e a tela liberaria botões que
// o backend recusa com 403.
// ---------------------------------------------------------------------------
const ligado = (v) => v === true || v === 'true';

const MSG_SEM_PERMISSAO = 'Sem permissão para alterar categorias de produto. Peça a um administrador a permissão «Configurações → Categorias de Produto (criar, editar e excluir)».';

const CategoriasProduto = () => {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        nome: '',
        descricao: '',
        ordemExibicao: 0,
        corTag: '',
        ativo: true
    });
    const [saving, setSaving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    // Modal de exclusão em 2 etapas: { cat, emUso, mensagem }
    // emUso=false → pergunta simples; emUso=true → o backend devolveu 409 dizendo
    // quantos produtos perdem a classificação, e a pessoa precisa confirmar.
    const [confirmacaoExclusao, setConfirmacaoExclusao] = useState(null);
    const [excluindo, setExcluindo] = useState(false);

    const { user } = useAuth();
    const permissoes = user?.permissoes || {};
    const podeEditar = ligado(permissoes.admin) || ligado(permissoes.Pode_Editar_Categorias_Produto);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await categoriaProdutoService.listar();
            setCategorias(data);
        } catch (error) {
            toast.error('Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        if (!podeEditar) { toast.error(MSG_SEM_PERMISSAO); return; }
        setIsCreating(true);
        setEditingId(null);
        setForm({
            nome: '',
            descricao: '',
            ordemExibicao: 0,
            corTag: '',
            permiteFracao: false,
            ativo: true,
            flexPositivo: true,
            flexNegativo: true
        });
    };

    const handleEdit = (cat) => {
        if (!podeEditar) { toast.error(MSG_SEM_PERMISSAO); return; }
        setIsCreating(false);
        setEditingId(cat.id);
        setForm({ ...cat });
    };

    const handleCancel = () => {
        setIsCreating(false);
        setEditingId(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        // Guarda também no handler (não só no botão): o formulário só existe para
        // quem pode editar, mas o envio nunca pode escapar da mesma regra do backend.
        if (!podeEditar) { toast.error(MSG_SEM_PERMISSAO); return; }
        try {
            setSaving(true);
            if (isCreating) {
                await categoriaProdutoService.criar(form);
                toast.success('Categoria criada com sucesso!');
            } else {
                await categoriaProdutoService.atualizar(editingId, form);
                toast.success('Categoria atualizada com sucesso!');
            }
            handleCancel();
            loadData();
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Erro ao salvar categoria.');
        } finally {
            setSaving(false);
        }
    };

    // Abre o modal de confirmação (1ª etapa).
    const pedirExclusao = (cat) => {
        if (!podeEditar) { toast.error(MSG_SEM_PERMISSAO); return; }
        setConfirmacaoExclusao({ cat, emUso: false, mensagem: null });
    };

    // Executa a exclusão. `confirmar` só vai true na 2ª etapa, depois do 409.
    const executarExclusao = async (confirmar = false) => {
        const alvo = confirmacaoExclusao?.cat;
        if (!alvo) return;
        if (!podeEditar) { toast.error(MSG_SEM_PERMISSAO); setConfirmacaoExclusao(null); return; }
        try {
            setExcluindo(true);
            await categoriaProdutoService.deletar(alvo.id, { confirmar });
            toast.success('Categoria excluída com sucesso!');
            setConfirmacaoExclusao(null);
            loadData();
        } catch (error) {
            const dados = error?.response?.data || {};
            // 409 = a categoria ainda está em produtos e NADA foi apagado. O backend
            // diz quantos são; o modal passa para a 2ª etapa e só apaga de verdade
            // se a pessoa confirmar sabendo o que vai perder.
            if (error?.response?.status === 409 && dados.codigo === 'CATEGORIA_EM_USO') {
                setConfirmacaoExclusao((atual) => (atual ? { ...atual, emUso: true, mensagem: dados.error } : atual));
                return;
            }
            toast.error(dados.error || 'Erro ao excluir categoria.');
            setConfirmacaoExclusao(null);
        } finally {
            setExcluindo(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando categorias...</div>;

    return (
        <div className="w-full max-w-full overflow-x-hidden p-3 md:px-4 md:py-8">
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center mb-4 md:mb-6">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-800">Categorias de Produto (Comercial)</h1>
                    <p className="text-gray-500 text-sm">Organize produtos comercialmente para inteligência futura.</p>
                </div>
                {/* Só aparece para quem o backend deixa gravar (admin ou Pode_Editar_Categorias_Produto) */}
                {podeEditar && !isCreating && !editingId && (
                    <button
                        onClick={handleCreateNew}
                        className="flex items-center justify-center w-full md:w-auto min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm shadow-sm transition"
                    >
                        <Plus className="h-5 w-5 mr-1" />
                        Nova Categoria
                    </button>
                )}
            </div>

            {/* Sem a permissão a tela vira consulta: explica por que sumiram os botões */}
            {!podeEditar && (
                <div className="flex items-start gap-2 rounded-xl border mb-4 md:mb-6"
                    style={{ borderColor: '#FCD34D', background: '#FFFBEB', padding: '10px 12px' }}>
                    <Lock className="h-4 w-4 flex-shrink-0" style={{ color: '#B45309', marginTop: 1 }} />
                    <div style={{ fontSize: 12.5, color: '#78350F', lineHeight: 1.4 }}>
                        <b>Acesso somente leitura.</b> Você pode consultar as categorias, mas não criar, renomear nem excluir.
                        Peça a um administrador a permissão <b>“Configurações → Categorias de Produto (criar, editar e excluir)”</b>.
                    </div>
                </div>
            )}

            {(isCreating || editingId) && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-200">
                    <h2 className="text-lg font-bold mb-4">{isCreating ? 'Nova Categoria' : 'Editar Categoria'}</h2>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    placeholder="Ex: Lanches, Bebidas..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ordem de Exibição</label>
                                <input
                                    type="number"
                                    value={form.ordemExibicao}
                                    onChange={(e) => setForm({ ...form, ordemExibicao: parseInt(e.target.value) || 0 })}
                                    className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                            <textarea
                                value={form.descricao || ''}
                                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                                className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                rows="2"
                            />
                        </div>
                        <div className="flex items-center flex-wrap gap-x-6 gap-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cor Tag (Hex)</label>
                                <input
                                    type="text"
                                    value={form.corTag || ''}
                                    onChange={(e) => setForm({ ...form, corTag: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    placeholder="#FF5733"
                                />
                            </div>
                            <label className="flex items-center space-x-2 mt-6">
                                <input
                                    type="checkbox"
                                    checked={form.flexPositivo !== false}
                                    onChange={(e) => setForm({ ...form, flexPositivo: e.target.checked })}
                                    className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                />
                                <span className="text-gray-900 text-sm font-medium">Soma Flex Positivo (acréscimo entra no saldo)</span>
                            </label>
                            <label className="flex items-center space-x-2 mt-6">
                                <input
                                    type="checkbox"
                                    checked={form.flexNegativo !== false}
                                    onChange={(e) => setForm({ ...form, flexNegativo: e.target.checked })}
                                    className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                />
                                <span className="text-gray-900 text-sm font-medium">Desconta Flex Negativo (desconto sai do saldo)</span>
                            </label>
                            <label className="flex items-center space-x-2 mt-6">
                                <input
                                    type="checkbox"
                                    checked={form.permiteFracao || false}
                                    onChange={(e) => setForm({ ...form, permiteFracao: e.target.checked })}
                                    className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                />
                                <span className="text-gray-900 text-sm font-medium">Permite Fração (kg, litro...)</span>
                            </label>
                            {/* "Controla Estoque" saiu daqui (08/2026): a chave gravava no banco mas
                                NENHUMA rota lia esse campo — quem manda no controle de estoque é a
                                categoria de ESTOQUE (Configurações → Categorias de Estoque). O campo
                                controlaEstoque continua no schema (regra do projeto: não dropar coluna)
                                e é preservado ao salvar, porque handleEdit copia a categoria inteira. */}
                            <label className="flex items-center space-x-2 mt-6">
                                <input
                                    type="checkbox"
                                    checked={form.ativo}
                                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                                    className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                />
                                <span className="text-gray-900 text-sm font-medium">Categoria Ativa</span>
                            </label>
                        </div>
                        <div className="flex justify-end space-x-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full font-medium text-sm transition"
                                disabled={saving}
                            >
                                <X className="h-5 w-5 inline mr-1" />
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm shadow-sm transition flex items-center"
                                disabled={saving}
                            >
                                <Save className="h-5 w-5 inline mr-1" />
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
                <ul className="divide-y divide-gray-200">
                    {categorias.length === 0 ? (
                        <li className="px-6 py-4 text-center text-gray-500">Nenhuma categoria cadastrada.</li>
                    ) : (
                        categorias.map((cat) => (
                            <li key={cat.id} className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 hover:bg-gray-50">
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center flex-wrap gap-1 break-words">
                                        {cat.nome}
                                        {cat.permiteFracao && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Fração</span>}
                                        {cat.flexPositivo === false && cat.flexNegativo === false && <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">Flex: excluído</span>}
                                        {cat.flexPositivo === false && cat.flexNegativo !== false && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">Flex: só desconto</span>}
                                        {cat.flexPositivo !== false && cat.flexNegativo === false && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Flex: só acréscimo</span>}
                                        {!cat.ativo && <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">Inativo</span>}
                                    </h3>
                                    <p className="text-xs text-gray-500">{cat.descricao || 'Sem descrição'}</p>
                                </div>
                                <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
                                    <div className="text-xs text-gray-500 text-right whitespace-nowrap mr-1 md:mr-3">
                                        Ordem: {cat.ordemExibicao}
                                    </div>
                                    {/* Editar/Excluir espelham o backend: sem a permissão, nem aparecem */}
                                    {podeEditar && (
                                        <>
                                            <button
                                                onClick={() => handleEdit(cat)}
                                                className="text-blue-600 hover:text-blue-900 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100"
                                                title="Editar"
                                                aria-label={`Editar categoria ${cat.nome}`}
                                            >
                                                <Pencil className="h-5 w-5" />
                                            </button>
                                            <button
                                                onClick={() => pedirExclusao(cat)}
                                                className="text-red-600 hover:text-red-900 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-gray-100"
                                                title="Excluir"
                                                aria-label={`Excluir categoria ${cat.nome}`}
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>

            {/* Confirmação de exclusão no padrão do sistema (substituiu os window.confirm).
                Etapa 1: pergunta. Etapa 2 (emUso): o backend recusou com 409 e disse
                quantos produtos perdem a classificação — só então libera o "excluir mesmo assim". */}
            {confirmacaoExclusao && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => { if (!excluindo) setConfirmacaoExclusao(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-red-600 px-5 py-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="bg-white/20 rounded-full p-2 flex-shrink-0">
                                    <AlertTriangle className="h-6 w-6 text-white" />
                                </div>
                                <h2 className="text-white font-bold text-base md:text-lg leading-tight">
                                    {confirmacaoExclusao.emUso ? 'Esta categoria está em uso' : 'Excluir categoria'}
                                </h2>
                            </div>
                            <button onClick={() => setConfirmacaoExclusao(null)} disabled={excluindo}
                                className="text-white/80 hover:text-white p-1 flex-shrink-0" aria-label="Fechar">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="px-5 py-4">
                            <p className="text-sm text-gray-900 font-semibold break-words mb-2">
                                {confirmacaoExclusao.cat?.nome}
                            </p>
                            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                                {confirmacaoExclusao.emUso
                                    ? confirmacaoExclusao.mensagem
                                    : 'Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.'}
                            </p>
                        </div>

                        <div className="px-5 py-3 bg-gray-50 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <button onClick={() => setConfirmacaoExclusao(null)} disabled={excluindo}
                                className="min-h-[44px] px-5 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-full disabled:opacity-60">
                                Cancelar
                            </button>
                            <button onClick={() => executarExclusao(confirmacaoExclusao.emUso)} disabled={excluindo}
                                className="min-h-[44px] px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-full shadow-sm disabled:opacity-60">
                                {excluindo ? 'Excluindo...' : (confirmacaoExclusao.emUso ? 'Excluir mesmo assim' : 'Excluir')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CategoriasProduto;
