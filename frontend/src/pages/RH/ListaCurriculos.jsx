import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Users, TrendingUp, ChevronRight, RefreshCw, ChevronDown, Check } from 'lucide-react';
import { listarCurriculos, obterContagens } from '../../services/curriculoService';
import { API_URL } from '../../services/api';

const STORAGE_KEY = 'rh.curriculos.filtros.v1';

const AREAS = ['', 'Produção', 'Entrega', 'Vendas', 'Administrativo', 'Outros'];
const STATUS_LISTA = [
  'Novo', 'Editado', 'Em Análise', 'Entrevista', 'Agendado',
  'Entrevistado', 'Aprovado', 'Contratado', 'Não Qualificado',
  'Rejeitado', 'Desistiu', 'Não Disponível',
];

const STATUS_COR = {
  'Novo': 'bg-blue-100 text-blue-700',
  'Editado': 'bg-amber-100 text-amber-700',
  'Em Análise': 'bg-yellow-100 text-yellow-700',
  'Entrevista': 'bg-purple-100 text-purple-700',
  'Agendado': 'bg-indigo-100 text-indigo-700',
  'Entrevistado': 'bg-cyan-100 text-cyan-700',
  'Aprovado': 'bg-teal-100 text-teal-700',
  'Contratado': 'bg-green-100 text-green-700',
  'Não Qualificado': 'bg-gray-100 text-gray-600',
  'Rejeitado': 'bg-red-100 text-red-700',
  'Desistiu': 'bg-orange-100 text-orange-700',
  'Não Disponível': 'bg-slate-100 text-slate-600',
};

function lerFiltrosSalvos() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const f = JSON.parse(s);
      return {
        status: Array.isArray(f.status) ? f.status : [],
        areaInteresse: f.areaInteresse || '',
        busca: f.busca || '',
      };
    }
  } catch { /* ignora */ }
  return { status: [], areaInteresse: '', busca: '' };
}

function Badge({ status }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COR[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function ListaCurriculos() {
  const navigate = useNavigate();
  const [curriculos, setCurriculos] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [contagens, setContagens] = useState({ porStatus: [], porArea: [] });

  const [filtros, setFiltros] = useState(lerFiltrosSalvos);
  const [buscaInput, setBuscaInput] = useState(() => lerFiltrosSalvos().busca);
  const [statusAberto, setStatusAberto] = useState(false);
  const statusRef = useRef(null);

  const LIMITE = 20;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filtros)); } catch { /* ignora */ }
  }, [filtros]);

  useEffect(() => {
    function onClick(e) {
      if (statusRef.current && !statusRef.current.contains(e.target)) setStatusAberto(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggleStatus(s) {
    setFiltros(f => {
      const atual = f.status || [];
      const novo = atual.includes(s) ? atual.filter(x => x !== s) : [...atual, s];
      return { ...f, status: novo };
    });
  }

  const carregar = useCallback(async (pg = 1) => {
    setCarregando(true);
    try {
      const res = await listarCurriculos({ ...filtros, pagina: pg, limite: LIMITE });
      setCurriculos(res.curriculos);
      setTotal(res.total);
      setPagina(pg);
    } catch { /* silencioso */ }
    setCarregando(false);
  }, [filtros]);

  useEffect(() => { carregar(1); }, [carregar]);

  useEffect(() => {
    obterContagens().then(setContagens).catch(() => {});
  }, []);

  function aplicarBusca() {
    setFiltros(f => ({ ...f, busca: buscaInput }));
  }

  const novosCount = contagens.porStatus.find(s => s.status === 'Novo')?._count?.status || 0;
  const editadosCount = contagens.porStatus.find(s => s.status === 'Editado')?._count?.status || 0;
  const totalGeral = contagens.porStatus.reduce((a, s) => a + (s._count?.status || 0), 0);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={22} className="text-orange-500" /> Currículos
          </h1>
          <p className="text-sm text-gray-500">{totalGeral} cadastrado{totalGeral !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => carregar(pagina)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <CardResumo label="Total" valor={totalGeral} cor="text-gray-700" />
        <CardResumo label="Novos" valor={novosCount} cor="text-blue-600" destaque />
        <CardResumo label="Editados" valor={editadosCount} cor="text-amber-600" destaque={editadosCount > 0} />
        <CardResumo label="Em Entrevista" valor={
          (contagens.porStatus.find(s => s.status === 'Entrevista')?._count?.status || 0) +
          (contagens.porStatus.find(s => s.status === 'Agendado')?._count?.status || 0)
        } cor="text-purple-600" />
        <CardResumo label="Contratados" valor={
          contagens.porStatus.find(s => s.status === 'Contratado')?._count?.status || 0
        } cor="text-green-600" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aplicarBusca()}
              placeholder="Buscar por nome, CPF ou WhatsApp..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <button onClick={aplicarBusca}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600">
            Buscar
          </button>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <div ref={statusRef} className="relative">
            <button onClick={() => setStatusAberto(v => !v)}
              className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
              <span>
                {filtros.status.length === 0 ? 'Todos os status'
                  : filtros.status.length === 1 ? filtros.status[0]
                  : `${filtros.status.length} status`}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {statusAberto && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-56 max-h-80 overflow-y-auto py-1">
                {filtros.status.length > 0 && (
                  <button onClick={() => setFiltros(f => ({ ...f, status: [] }))}
                    className="w-full text-left px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50 border-b border-gray-100 mb-1">
                    Limpar seleção
                  </button>
                )}
                {STATUS_LISTA.map(s => {
                  const ativo = filtros.status.includes(s);
                  return (
                    <button key={s} onClick={() => toggleStatus(s)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left">
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_COR[s]?.split(' ')[0] || 'bg-gray-300'}`} />
                        {s}
                      </span>
                      {ativo && <Check size={14} className="text-orange-500" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <select value={filtros.areaInteresse}
            onChange={e => setFiltros(f => ({ ...f, areaInteresse: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">Todas as áreas</option>
            {AREAS.filter(Boolean).map(a => <option key={a}>{a}</option>)}
          </select>
          {(filtros.status.length > 0 || filtros.areaInteresse || filtros.busca) && (
            <button onClick={() => { setFiltros({ status: [], areaInteresse: '', busca: '' }); setBuscaInput(''); }}
              className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1">
              <Filter size={14} /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {carregando ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : curriculos.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum currículo encontrado.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {curriculos.map(c => (
              <button key={c.id} onClick={() => navigate(`/rh/curriculos/${c.id}`)}
                className="w-full text-left px-4 py-3.5 hover:bg-orange-50 transition flex items-center gap-4">
                {/* Foto */}
                <div className="shrink-0">
                  {c.foto
                    ? <img src={`${API_URL}/uploads/${c.foto}`} alt={c.nome}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                    : <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-semibold text-sm">
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm">{c.nome}</span>
                    <Badge status={c.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    <span>{c.areaInteresse}</span>
                    {c.disponibilidade && <span>· {c.disponibilidade}</span>}
                    {c.acessos?.[0] && (
                      <span className="hidden sm:inline">
                        · Visto por {c.acessos[0].vendedor?.nome?.split(' ')[0]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Data */}
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-400">
                    {new Date(c.criadoEm).toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {total > LIMITE && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{total} no total · página {pagina} de {Math.ceil(total / LIMITE)}</span>
          <div className="flex gap-2">
            <button disabled={pagina <= 1} onClick={() => carregar(pagina - 1)}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
            <button disabled={pagina >= Math.ceil(total / LIMITE)} onClick={() => carregar(pagina + 1)}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardResumo({ label, valor, cor, destaque }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${destaque ? 'border-blue-200' : 'border-gray-200'}`}>
      <div className={`text-2xl font-bold ${cor}`}>{valor}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
