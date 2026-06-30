import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, Loader2, Upload, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import funcionarioService from '../../services/funcionarioService';

export default function PontoPainel() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await funcionarioService.pontoHoje()); }
    catch { toast.error('Erro ao carregar painel.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-sky-100 p-1.5 md:p-2 rounded-lg"><Clock className="h-4 w-4 md:h-5 md:w-5 text-sky-600" /></div>
          <h1 className="text-base md:text-2xl font-bold text-gray-900">Painel de Ponto</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/rh/ponto/config')} className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm"><MapPin className="h-4 w-4" /> Configurar</button>
          <button onClick={() => navigate('/rh/ponto/importar')} className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm"><Upload className="h-4 w-4" /> Importar</button>
          <button onClick={carregar} className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {carregando || !dados ? (
        <div className="py-16 text-center"><Loader2 className="h-7 w-7 text-blue-600 animate-spin mx-auto" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-green-600">{dados.trabalhando}</p><p className="text-xs text-gray-500">Trabalhando agora</p></div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-700">{dados.totalAtivos}</p><p className="text-xs text-gray-500">Total ativos</p></div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-400">{dados.totalAtivos - dados.trabalhando}</p><p className="text-xs text-gray-500">Fora</p></div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Batidas de hoje · {new Date(`${dados.data}T12:00:00`).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Funcionário</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batidas</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-5 py-3"></th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {dados.linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{l.nome}<span className="text-gray-400 font-normal">{l.cargo ? ` · ${l.cargo}` : ''}</span></td>
                      <td className="px-5 py-3 tabular-nums">
                        {l.batidas.length === 0 ? <span className="text-gray-400">—</span> : l.batidas.map((b, i) => (
                          <span key={b.id}>{i > 0 && ' · '}{b.latLng ? <a href={`https://www.google.com/maps?q=${b.latLng}`} target="_blank" rel="noreferrer" className="text-primary underline decoration-dotted">{b.hora} 📍</a> : b.hora}</span>
                        ))}
                      </td>
                      <td className="px-5 py-3">
                        {l.trabalhando ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Trabalhando</span> : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Fora</span>}
                      </td>
                      <td className="px-5 py-3 text-right"><button onClick={() => navigate(`/rh/funcionarios/${l.id}`)} className="text-xs text-primary font-semibold">Ajustar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
