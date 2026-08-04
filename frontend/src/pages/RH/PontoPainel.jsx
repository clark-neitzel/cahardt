import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, Loader2, Upload, MapPin, Hand, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import funcionarioService from '../../services/funcionarioService';

const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

export default function PontoPainel() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [acertos, setAcertos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [hoje, pedidos] = await Promise.all([
        funcionarioService.pontoHoje(),
        funcionarioService.listarAcertos('PENDENTE').catch(() => [])
      ]);
      setDados(hoje);
      setAcertos(pedidos);
    }
    catch { toast.error('Erro ao carregar painel.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="w-full p-3 md:p-6">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-green-600">{dados.trabalhando}</p><p className="text-xs text-gray-500">Trabalhando agora</p></div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-700">{dados.totalAtivos}</p><p className="text-xs text-gray-500">Total ativos</p></div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-400">{dados.totalAtivos - dados.trabalhando}</p><p className="text-xs text-gray-500">Fora</p></div>
            <div className={`rounded-xl border shadow-sm p-4 text-center ${acertos.length ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
              <p className={`text-2xl font-bold ${acertos.length ? 'text-amber-600' : 'text-gray-400'}`}>{acertos.length}</p>
              <p className="text-xs text-gray-500">Pedidos de acerto</p>
            </div>
          </div>

          {acertos.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm mb-4">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <Hand className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Pedidos de acerto — “esqueci de bater”</span>
              </div>
              <div className="p-3 md:p-5 space-y-3">
                {acertos.map((a) => <CardAcerto key={a.id} acerto={a} onRespondido={carregar} />)}
              </div>
            </div>
          )}

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

// ─── Um pedido de acerto: aprova tudo, recusa tudo ou item a item ─────────────
function CardAcerto({ acerto, onRespondido }) {
  const [escolhas, setEscolhas] = useState(() => Object.fromEntries(acerto.itens.map(i => [i.id, true])));
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const marcados = acerto.itens.filter(i => escolhas[i.id]).length;
  const temRecusa = marcados < acerto.itens.length;

  const responder = async (aprovarTudo) => {
    const itens = acerto.itens.map(i => ({
      id: i.id,
      aprovado: aprovarTudo === null ? !!escolhas[i.id] : aprovarTudo,
      motivoRecusa: motivoRecusa || null
    }));
    setSalvando(true);
    try {
      await funcionarioService.responderAcerto(acerto.id, itens);
      toast.success('Pedido respondido! O funcionário é avisado na tela dele.');
      onRespondido();
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao responder.'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="font-semibold text-gray-900">
          {acerto.funcionario?.nome}
          <span className="font-normal text-gray-400 text-sm">{acerto.funcionario?.cargo ? ` · ${acerto.funcionario.cargo}` : ''}</span>
        </p>
        <p className="text-xs text-gray-400">
          pediu {new Date(acerto.criadoEm).toLocaleDateString('pt-BR')} {new Date(acerto.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {acerto.motivo && <p className="text-sm text-gray-500 italic">“{acerto.motivo}”</p>}

      <ul className="mt-2 divide-y divide-gray-100 border-y border-gray-100">
        {acerto.itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2">
            <label className="flex items-center gap-2 min-h-[32px] cursor-pointer">
              <input type="checkbox" checked={!!escolhas[i.id]} onChange={(e) => setEscolhas(s => ({ ...s, [i.id]: e.target.checked }))} className="h-4 w-4" />
              <span className="text-sm text-gray-800 tabular-nums">{dmy(i.data)} · <b>{i.hora}</b></span>
            </label>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${i.tipo === 'ENTRADA' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
              {i.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
            </span>
          </li>
        ))}
      </ul>

      {temRecusa && (
        <input
          value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)}
          placeholder="Motivo da recusa (aparece para o funcionário)"
          className="mt-2 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
        />
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => responder(true)} disabled={salvando}
          className="flex-1 min-w-[130px] px-3 py-2 min-h-[40px] bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-60">
          <Check className="h-4 w-4" /> Aprovar {acerto.itens.length > 1 ? `os ${acerto.itens.length}` : ''}
        </button>
        {temRecusa && (
          <button onClick={() => responder(null)} disabled={salvando}
            className="flex-1 min-w-[130px] px-3 py-2 min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-semibold disabled:opacity-60">
            Aprovar só os {marcados} marcados
          </button>
        )}
        <button onClick={() => responder(false)} disabled={salvando}
          className="px-3 py-2 min-h-[40px] bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium inline-flex items-center justify-center gap-1 disabled:opacity-60">
          <X className="h-4 w-4" /> Recusar tudo
        </button>
      </div>
    </div>
  );
}
