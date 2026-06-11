import React, { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';

const vazio = { nome: '', cidade: 'Joinville', cep: '', taxa: '', ativo: true };

export default function AbaBairros() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    setLoading(true);
    kitFestaService.bairros().then(setLista).catch(() => toast.error('Erro ao carregar bairros')).finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const editar = (b) => { setEditId(b.id); setForm({ nome: b.nome, cidade: b.cidade || 'Joinville', cep: b.cep || '', taxa: b.taxa ?? '', ativo: b.ativo }); };
  const cancelar = () => { setEditId(null); setForm(vazio); };

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome do bairro');
    setSalvando(true);
    try {
      await kitFestaService.salvarBairro(editId, { ...form, taxa: Number(form.taxa) || 0 });
      toast.success(editId ? 'Bairro atualizado' : 'Bairro adicionado');
      cancelar(); carregar();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const remover = async (b) => {
    if (!confirm(`Remover o bairro "${b.nome}"?`)) return;
    try { await kitFestaService.removerBairro(b.id); toast.success('Removido'); carregar(); }
    catch { toast.error('Erro ao remover'); }
  };

  const maskCep = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* Formulário */}
      <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 p-4 h-fit">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-emerald-600" /> {editId ? 'Editar bairro' : 'Novo bairro'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Nome do bairro</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.nome}
              onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Pirabeiraba" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Cidade</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.cidade}
                onChange={e => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">CEP</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.cep}
                onChange={e => setForm({ ...form, cep: maskCep(e.target.value) })} placeholder="00000-000" inputMode="numeric" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Taxa de entrega (R$)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.taxa}
              onChange={e => setForm({ ...form, taxa: e.target.value })} placeholder="0,00" inputMode="decimal" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            Ativo (aparece no site)
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={salvar} disabled={salvando}
              className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editId ? 'Salvar' : 'Adicionar'}
            </button>
            {editId && <button onClick={cancelar} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancelar</button>}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum bairro cadastrado. Adicione bairros e taxas de entrega.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Bairro</th>
                <th className="text-left px-4 py-2.5 font-medium">CEP</th>
                <th className="text-right px-4 py-2.5 font-medium">Taxa</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(b => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <button onClick={() => editar(b)} className="text-left hover:text-emerald-700">
                      <div className="font-medium text-gray-800">{b.nome}</div>
                      <div className="text-xs text-gray-400">{b.cidade}</div>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{b.cep || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                    {Number(b.taxa) > 0 ? `R$ ${Number(b.taxa).toFixed(2).replace('.', ',')}` : 'Grátis'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${b.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {b.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remover(b)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
