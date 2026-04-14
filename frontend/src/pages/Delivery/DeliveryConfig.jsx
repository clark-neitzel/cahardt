import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import deliveryService from '../../services/deliveryService';

const { ETAPAS, LABELS } = deliveryService;

export default function DeliveryConfig() {
    const [tab, setTab] = useState('categorias');

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Configuração de Delivery</h1>
            <div className="flex gap-2 border-b mb-6">
                <TabBtn active={tab === 'categorias'} onClick={() => setTab('categorias')}>Categorias</TabBtn>
                <TabBtn active={tab === 'permissoes'} onClick={() => setTab('permissoes')}>Permissões</TabBtn>
            </div>
            {tab === 'categorias' && <CategoriasTab />}
            {tab === 'permissoes' && <PermissoesTab />}
        </div>
    );
}

function TabBtn({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
        >
            {children}
        </button>
    );
}

function CategoriasTab() {
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);

    const carregar = async () => {
        setLoading(true);
        try {
            setLista(await deliveryService.listarCategorias());
        } catch (e) {
            toast.error('Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    const toggle = async (cat) => {
        setSaving(cat.nome);
        try {
            await deliveryService.salvarCategoria(cat.nome, !cat.ativo);
            await carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSaving(null);
        }
    };

    if (loading) return <div className="text-gray-500 text-sm">Carregando...</div>;

    return (
        <div>
            <p className="text-sm text-gray-600 mb-4">
                Ative as categorias cujos pedidos devem aparecer no painel Delivery.
                Apenas pedidos com pelo menos 1 item destas categorias entram no Kanban.
            </p>
            <div className="bg-white rounded-lg border divide-y">
                {lista.map(cat => (
                    <div key={cat.nome} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <div className="font-medium">{cat.nome}</div>
                            {cat.naoSalva && <div className="text-xs text-gray-400">Detectada nos produtos — ainda não configurada</div>}
                        </div>
                        <button
                            onClick={() => toggle(cat)}
                            disabled={saving === cat.nome}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                cat.ativo ? 'bg-green-500' : 'bg-gray-300'
                            } ${saving === cat.nome ? 'opacity-50' : ''}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cat.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PermissoesTab() {
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState({});

    const carregar = async () => {
        setLoading(true);
        try {
            setLista(await deliveryService.listarPermissoes());
        } catch (e) {
            toast.error('Erro ao carregar permissões.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    const updateLocal = (vendedorId, patch) => {
        setLista(prev => prev.map(v => v.vendedorId === vendedorId ? { ...v, ...patch } : v));
        setDirty(prev => ({ ...prev, [vendedorId]: true }));
    };

    const toggleEtapa = (v, etapa) => {
        const atual = new Set(v.etapasPermitidas || []);
        if (atual.has(etapa)) atual.delete(etapa);
        else atual.add(etapa);
        updateLocal(v.vendedorId, { etapasPermitidas: Array.from(atual) });
    };

    const salvar = async (v) => {
        try {
            await deliveryService.salvarPermissao(v.vendedorId, {
                podeVer: v.podeVer,
                etapasPermitidas: v.etapasPermitidas
            });
            setDirty(prev => { const n = { ...prev }; delete n[v.vendedorId]; return n; });
            toast.success(`Permissão salva: ${v.nome}`);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        }
    };

    if (loading) return <div className="text-gray-500 text-sm">Carregando...</div>;

    return (
        <div>
            <p className="text-sm text-gray-600 mb-4">
                Libere vendedores pra ver o painel Delivery e defina em quais etapas cada um pode movimentar os cards.
            </p>
            <div className="bg-white rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-4 py-2">Vendedor</th>
                            <th className="px-4 py-2">Pode ver</th>
                            {ETAPAS.map(e => <th key={e} className="px-3 py-2 text-center">{LABELS[e]}</th>)}
                            <th className="px-4 py-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lista.map(v => (
                            <tr key={v.vendedorId} className="border-t">
                                <td className="px-4 py-2 font-medium">{v.nome}</td>
                                <td className="px-4 py-2">
                                    <input
                                        type="checkbox"
                                        checked={v.podeVer}
                                        onChange={(e) => updateLocal(v.vendedorId, { podeVer: e.target.checked })}
                                    />
                                </td>
                                {ETAPAS.map(etapa => (
                                    <td key={etapa} className="px-3 py-2 text-center">
                                        <input
                                            type="checkbox"
                                            disabled={!v.podeVer}
                                            checked={(v.etapasPermitidas || []).includes(etapa)}
                                            onChange={() => toggleEtapa(v, etapa)}
                                        />
                                    </td>
                                ))}
                                <td className="px-4 py-2">
                                    {dirty[v.vendedorId] && (
                                        <button onClick={() => salvar(v)} className="px-3 py-1 bg-primary text-white text-xs rounded-md hover:opacity-90">
                                            Salvar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
