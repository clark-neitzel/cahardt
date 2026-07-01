import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Ticket, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';

const vazio = { codigo: '', tipo: 'pct', valor: '', label: '', minCaixas: '', validade: '', primeiraCompra: false, usoMaximo: '', ativo: true };

export default function AbaCupons() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    setLoading(true);
    kitFestaService.cupons().then(setLista).catch(() => toast.error('Erro ao carregar cupons')).finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const editar = (c) => {
    setEditId(c.id);
    setForm({
      codigo: c.codigo, tipo: c.tipo, valor: c.valor ?? '', label: c.label || '',
      minCaixas: c.minCaixas ?? '', validade: c.validade ? c.validade.slice(0, 10) : '',
      primeiraCompra: c.primeiraCompra, usoMaximo: c.usoMaximo ?? '', ativo: c.ativo,
    });
  };
  const cancelar = () => { setEditId(null); setForm(vazio); };

  const salvar = async () => {
    if (!form.codigo.trim()) return toast.error('Informe o código do cupom');
    if (!form.valor) return toast.error('Informe o valor');
    setSalvando(true);
    try {
      await kitFestaService.salvarCupom(editId, form);
      toast.success(editId ? 'Cupom atualizado' : 'Cupom criado');
      cancelar(); carregar();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const remover = async (c) => {
    if (!confirm(`Remover o cupom "${c.codigo}"?`)) return;
    try { await kitFestaService.removerCupom(c.id); toast.success('Removido'); carregar(); }
    catch { toast.error('Erro ao remover'); }
  };

  const fmtValor = (c) => c.tipo === 'pct' ? `${Number(c.valor)}%` : `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`;

  return (
    <div className="space-y-4">
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 p-4 h-fit">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Ticket className="h-4 w-4 text-emerald-600" /> {editId ? 'Editar cupom' : 'Novo cupom'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Código</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase" value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="HARDT10" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Tipo</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}>
                <option value="pct">% desconto</option>
                <option value="brl">R$ desconto</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Valor</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.valor}
                onChange={e => setForm({ ...form, valor: e.target.value })} placeholder={form.tipo === 'pct' ? '10' : '20'} inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Descrição (aparece pro cliente)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })} placeholder="10% OFF — primeira compra" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Mín. caixas</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.minCaixas}
                onChange={e => setForm({ ...form, minCaixas: e.target.value })} placeholder="opcional" inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Validade</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.validade}
                onChange={e => setForm({ ...form, validade: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Limite de usos (total)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.usoMaximo}
              onChange={e => setForm({ ...form, usoMaximo: e.target.value })} placeholder="ilimitado" inputMode="numeric" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.primeiraCompra} onChange={e => setForm({ ...form, primeiraCompra: e.target.checked })} />
            Só primeira compra
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            Ativo
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={salvar} disabled={salvando}
              className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editId ? 'Salvar' : 'Criar'}
            </button>
            {editId && <button onClick={cancelar} className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancelar</button>}
          </div>
        </div>
      </div>

      <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum cupom criado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Código</th>
                <th className="text-right px-4 py-2.5 font-medium">Desconto</th>
                <th className="text-center px-4 py-2.5 font-medium">Mín.</th>
                <th className="text-center px-4 py-2.5 font-medium">Usos</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <button onClick={() => editar(c)} className="text-left hover:text-emerald-700">
                      <div className="font-mono font-semibold text-gray-800">{c.codigo}</div>
                      {c.label && <div className="text-xs text-gray-400">{c.label}</div>}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{fmtValor(c)}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{c.minCaixas || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{c.usos}{c.usoMaximo ? `/${c.usoMaximo}` : ''}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remover(c)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    <UsosHistorico />
    </div>
  );
}

/* Histórico: quem usou cada cupom */
function UsosHistorico() {
  const [usos, setUsos] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { kitFestaService.cuponsUsos().then(setUsos).catch(() => {}).finally(() => setLoading(false)); }, []);
  const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">Quem usou os cupons</div>
      {loading ? <div className="p-6 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        : usos.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">Nenhum cupom usado ainda.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Cupom</th>
                    <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                    <th className="text-right px-4 py-2.5 font-medium">Desconto</th>
                    <th className="text-left px-4 py-2.5 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {usos.map(u => (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-mono text-emerald-700">{u.codigo}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-800">{u.cliente?.nome || '—'}</div>
                        <div className="text-xs text-gray-400">{u.cliente?.telefone || u.cliente?.cpf || ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{money(u.valor)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}
