import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../services/clienteService';
import funcionarioService from '../../services/funcionarioService';

export default function FuncionarioNovo() {
  const navigate = useNavigate();
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    clienteUuid: null, nome: '', cpf: '', telefone: '', email: '', endereco: '',
    cargo: '', dataAdmissao: '', salario: '', tipoHoraExtra: 'BANCO'
  });

  const buscar = useCallback(async () => {
    if (!termo || termo.length < 2) { setResultados([]); return; }
    setBuscando(true);
    try {
      const resp = await clienteService.buscarGlobal(termo, 15);
      // buscar-global retorna { data: [...] }; tolera também array direto
      const arr = Array.isArray(resp) ? resp : (resp?.data || []);
      setResultados(arr);
    } catch { setResultados([]); }
    finally { setBuscando(false); }
  }, [termo]);

  const selecionar = (c) => {
    const endereco = [c.End_Logradouro, c.End_Numero, c.End_Bairro, c.End_Cidade].filter(Boolean).join(', ');
    setForm((f) => ({
      ...f,
      clienteUuid: c.UUID,
      nome: c.Nome || '',
      cpf: c.Documento || '',
      telefone: c.Telefone_Celular || c.Telefone || '',
      email: c.Email || '',
      endereco
    }));
    setResultados([]);
    setTermo('');
  };

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const salvar = async () => {
    if (!form.nome) { toast.error('Informe o nome.'); return; }
    setSalvando(true);
    try {
      const f = await funcionarioService.criar(form);
      toast.success('Funcionário ativado!');
      navigate(`/rh/funcionarios/${f.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.erro || 'Erro ao ativar funcionário.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-3 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-blue-100 p-2 rounded-lg"><UserPlus className="h-5 w-5 text-blue-600" /></div>
        <h1 className="text-lg md:text-2xl font-bold text-gray-900">Novo funcionário</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* passo 1 */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">1 · Encontrar a pessoa (cadastro de cliente)</span>
        </div>
        <div className="p-5">
          <div className="flex gap-2">
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder="Buscar no cadastro de clientes por nome ou CPF…"
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <button onClick={buscar} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold inline-flex items-center gap-1">
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </button>
          </div>
          {resultados.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {resultados.map((c) => (
                <div key={c.UUID} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{c.Nome}</p>
                    <p className="text-xs text-gray-500">{c.Documento || 'sem CPF'}{c.Telefone_Celular ? ` · ${c.Telefone_Celular}` : ''}{c.End_Cidade ? ` · ${c.End_Cidade}` : ''}</p>
                  </div>
                  <button onClick={() => selecionar(c)} className="px-3 py-1.5 bg-primary hover:bg-blue-700 text-white rounded-md text-xs font-semibold">Selecionar</button>
                </div>
              ))}
            </div>
          )}
          {form.clienteUuid && (
            <p className="mt-3 text-xs text-green-700 font-semibold flex items-center gap-1"><Check className="h-4 w-4" /> Pessoa selecionada do cadastro de clientes</p>
          )}
          <p className="mt-3 text-xs text-gray-400">Não está no cadastro? Preencha os dados abaixo manualmente.</p>
        </div>

        {/* passo 2 */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">2 · Dados de RH</span>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm font-medium text-gray-700">Nome</span><input value={form.nome} onChange={set('nome')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">CPF</span><input value={form.cpf} onChange={set('cpf')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Telefone</span><input value={form.telefone} onChange={set('telefone')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Cargo</span><input value={form.cargo} onChange={set('cargo')} placeholder="Motorista" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Admissão</span><input type="date" value={form.dataAdmissao} onChange={set('dataAdmissao')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Salário (R$)</span><input value={form.salario} onChange={set('salario')} placeholder="2.500,00" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium text-gray-700">Hora extra</span>
            <select value={form.tipoHoraExtra} onChange={set('tipoHoraExtra')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="BANCO">Banco de horas (compensatório)</option>
              <option value="PAGA">Hora extra paga (50%/100%)</option>
            </select>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={() => navigate('/rh/funcionarios')} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Ativar como funcionário
          </button>
        </div>
      </div>
    </div>
  );
}
