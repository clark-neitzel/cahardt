import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Clock, Upload, ChevronRight, RefreshCw } from 'lucide-react';
import funcionarioService from '../../services/funcionarioService';

export default function FuncionariosLista() {
  const navigate = useNavigate();
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ativos');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await funcionarioService.listar({ busca: busca || undefined, status });
      setLista(data);
    } catch (e) {
      setLista([]);
    } finally {
      setCarregando(false);
    }
  }, [busca, status]);

  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* topbar */}
        <div className="flex items-center justify-between p-3 md:p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-1.5 md:p-2 rounded-lg"><Users className="h-4 w-4 md:h-5 md:w-5 text-blue-600" /></div>
            <h1 className="text-base md:text-2xl font-bold text-gray-900">Funcionários</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/rh/ponto')} className="hidden md:inline-flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">
              <Clock className="h-4 w-4" /> Painel de ponto
            </button>
            <button onClick={() => navigate('/rh/ponto/importar')} className="hidden md:inline-flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button onClick={() => navigate('/rh/funcionarios/novo')} className="inline-flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-xs md:text-sm font-semibold">
              <Plus className="h-4 w-4" /> Novo
            </button>
          </div>
        </div>

        {/* filtros */}
        <div className="p-3 md:p-4 flex flex-col md:flex-row gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF, cargo…"
            className="w-full md:w-72 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full md:w-44 border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
          <button onClick={carregar} className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 self-start">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* lista */}
        {lista.length === 0 && !carregando ? (
          <p className="text-center text-gray-400 text-sm py-10">Nenhum funcionário encontrado.</p>
        ) : (
          <>
            {/* mobile cards */}
            <div className="md:hidden space-y-3 p-3 pt-0">
              {lista.map((f) => (
                <button key={f.id} onClick={() => navigate(`/rh/funcionarios/${f.id}`)} className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900">{f.nome}</span>
                    {f.trabalhando
                      ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Trabalhando</span>
                      : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Fora</span>}
                  </div>
                  <div className="text-sm text-gray-500">{f.cargo || 'Sem cargo'}{f.desde ? ` · desde ${f.desde}` : ''}</div>
                  {f.alertaAso && <div className="text-xs text-amber-700 mt-1">⚠ {f.alertaAso.texto}</div>}
                </button>
              ))}
            </div>

            {/* desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Funcionário</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cargo</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status hoje</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Alertas</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {lista.map((f) => (
                    <tr key={f.id} onClick={() => navigate(`/rh/funcionarios/${f.id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-5 py-3 font-medium text-gray-900">{f.nome}</td>
                      <td className="px-5 py-3 text-gray-600">{f.cargo || '—'}</td>
                      <td className="px-5 py-3">
                        {f.trabalhando
                          ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Trabalhando{f.desde ? ` · ${f.desde}` : ''}</span>
                          : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Fora</span>}
                      </td>
                      <td className="px-5 py-3">
                        {f.alertaAso
                          ? <span className={`px-2 py-1 text-xs font-semibold rounded-full ${f.alertaAso.dias < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{f.alertaAso.texto}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right"><ChevronRight className="h-4 w-4 text-gray-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
