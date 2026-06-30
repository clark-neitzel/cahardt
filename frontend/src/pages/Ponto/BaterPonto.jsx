import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, ArrowRight, ArrowLeft, MapPin, AlertCircle, Loader2, Lock } from 'lucide-react';
import { obterMeta, loginPonto, obterEstado, registrarPonto } from '../../services/pontoPublicoService';

const pad = (n) => String(n).padStart(2, '0');

export default function BaterPonto() {
  const { token } = useParams();
  const chaveSessao = `ponto_sessao_${token}`;

  const [meta, setMeta] = useState(null);          // { nome, temSenha, bloqueado }
  const [estado, setEstado] = useState(null);      // { nome, status, proximaAcao, desde, batidasHoje, empresa }
  const [sessao, setSessao] = useState(() => localStorage.getItem(`ponto_sessao_${token}`) || '');
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState(null);
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erroSenha, setErroSenha] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [agora, setAgora] = useState(new Date());
  const [mapaAberto, setMapaAberto] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const salvarSessao = useCallback((s) => {
    setSessao(s);
    if (s) localStorage.setItem(chaveSessao, s); else localStorage.removeItem(chaveSessao);
  }, [chaveSessao]);

  // Carrega metadados e, se já houver sessão salva, tenta puxar o estado
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const m = await obterMeta(token);
      setMeta(m);
      setErroFatal(null);
      if (!m.bloqueado && m.temSenha && sessao) {
        try {
          const e = await obterEstado(token, sessao);
          setEstado(e);
        } catch (err) {
          if (err?.response?.status === 401) salvarSessao('');
        }
      }
    } catch (e) {
      setErroFatal(e?.response?.data?.erro || 'Não foi possível carregar o ponto.');
    } finally {
      setCarregando(false);
    }
  }, [token, sessao, salvarSessao]);

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [token]);

  const pegarLocalizacao = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const entrar = async (e) => {
    e?.preventDefault();
    if (!senha) return;
    setEntrando(true);
    setErroSenha(null);
    try {
      const resp = await loginPonto(token, senha);
      salvarSessao(resp.sessao);
      setEstado(resp);
      setSenha('');
    } catch (err) {
      setErroSenha(err?.response?.data?.erro || 'Não foi possível entrar.');
    } finally {
      setEntrando(false);
    }
  };

  const bater = async () => {
    setRegistrando(true);
    setAviso(null);
    try {
      const latLng = await pegarLocalizacao();
      const resp = await registrarPonto(token, sessao, latLng);
      setEstado((prev) => ({ ...prev, ...resp }));
      setAviso({ tipo: 'ok', texto: `Ponto registrado às ${resp.batida?.hora}` });
    } catch (e) {
      if (e?.response?.status === 401) {
        salvarSessao('');
        setEstado(null);
        setAviso({ tipo: 'erro', texto: 'Sessão expirada. Entre com sua senha novamente.' });
      } else {
        setAviso({ tipo: 'erro', texto: e?.response?.data?.erro || 'Erro ao registrar o ponto.' });
      }
    } finally {
      setRegistrando(false);
    }
  };

  const horaAgora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const dataAgora = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const Casca = ({ children }) => (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-primary text-white px-5 py-4 flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Clock className="h-6 w-6" /></div>
          <div><p className="text-xs text-blue-100 leading-none">Registro de Ponto</p><p className="text-base font-bold leading-tight">CA-Hardt</p></div>
        </div>
        {children}
      </div>
    </div>
  );

  // ── Carregando / erro ───────────────────────────────────────────────────────
  if (carregando) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><Loader2 className="h-8 w-8 text-blue-600 animate-spin" /></div>;
  }
  if (erroFatal) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <p className="mt-3 font-bold text-gray-900">Ops!</p>
          <p className="text-sm text-gray-500 mt-1">{erroFatal}</p>
        </div>
      </div>
    );
  }

  // ── Bloqueado / sem senha liberada ──────────────────────────────────────────
  if (meta?.bloqueado) {
    return (
      <Casca>
        <div className="p-6 text-center">
          <Lock className="h-10 w-10 text-red-500 mx-auto" />
          <p className="mt-3 font-bold text-gray-900">Acesso bloqueado</p>
          <p className="text-sm text-gray-500 mt-1">Este acesso foi desativado. Fale com o RH.</p>
        </div>
      </Casca>
    );
  }
  if (!meta?.temSenha) {
    return (
      <Casca>
        <div className="p-6 text-center">
          <Lock className="h-10 w-10 text-gray-400 mx-auto" />
          <p className="mt-3 font-bold text-gray-900">Acesso ainda não liberado</p>
          <p className="text-sm text-gray-500 mt-1">Peça ao RH para definir sua senha de ponto.</p>
        </div>
      </Casca>
    );
  }

  // ── Tela de senha (sem sessão válida) ───────────────────────────────────────
  if (!estado) {
    return (
      <Casca>
        <form onSubmit={entrar} className="p-6">
          <p className="text-center text-sm text-gray-500">Olá, <span className="font-bold text-gray-900">{meta.nome}</span></p>
          <p className="text-center text-xs text-gray-400 mb-4">Digite sua senha para bater o ponto</p>
          <input
            type="password"
            inputMode="numeric"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-lg tracking-widest focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
          {erroSenha && <p className="mt-2 text-center text-xs font-semibold text-red-600">{erroSenha}</p>}
          <button type="submit" disabled={entrando || !senha} className="mt-4 w-full min-h-[52px] bg-primary hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {entrando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />} Entrar
          </button>
        </form>
      </Casca>
    );
  }

  // ── Tela de bater ponto ─────────────────────────────────────────────────────
  const dentro = estado.status === 'DENTRO';
  return (
    <Casca>
      <div className="px-5 pt-5 text-center">
        <p className="text-sm text-gray-500">Olá,</p>
        <p className="text-lg font-bold text-gray-900">{estado.nome}</p>
        <p className="mt-4 text-5xl font-bold text-gray-900 tabular-nums tracking-tight">{horaAgora}</p>
        <p className="text-sm text-gray-500 capitalize">{dataAgora}</p>
        <div className="mt-4">
          {dentro ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Trabalhando desde {estado.desde}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-gray-400" /> Fora do expediente
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <button
          onClick={bater}
          disabled={registrando}
          className={`w-full min-h-[64px] rounded-xl shadow-sm font-bold text-lg flex items-center justify-center gap-2 text-white disabled:opacity-60 ${dentro ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-blue-700'}`}
        >
          {registrando ? <Loader2 className="h-6 w-6 animate-spin" /> : (dentro ? <ArrowLeft className="h-6 w-6" /> : <ArrowRight className="h-6 w-6" />)}
          {registrando ? 'Registrando…' : (dentro ? 'Registrar Saída' : 'Registrar Entrada')}
        </button>

        {aviso ? (
          <p className={`mt-2 text-center text-xs font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{aviso.texto}</p>
        ) : (
          <p className="mt-2 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> Localização será registrada na batida
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Hoje</p>
        {estado.batidasHoje?.length ? (
          <ul className="space-y-2 text-sm">
            {estado.batidasHoje.map((b) => (
              <li key={b.id}>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${b.tipo === 'ENTRADA' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                    {b.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                  </span>
                  <button
                    onClick={() => setMapaAberto(mapaAberto === b.id ? null : (b.latLng ? b.id : null))}
                    className={`tabular-nums font-semibold ${b.latLng ? 'text-primary underline decoration-dotted' : 'text-gray-900'}`}
                  >
                    {b.hora}{b.latLng ? ' 📍' : ''}
                  </button>
                </div>
                {mapaAberto === b.id && b.latLng && (
                  <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">Local da batida · {b.hora}</span>
                      {b.dentroCerca != null && (
                        <span className={`text-xs font-semibold ${b.dentroCerca ? 'text-green-700' : 'text-red-600'}`}>
                          {b.dentroCerca ? '✓ dentro' : '✗ fora'}{b.distanciaMetros != null ? ` · ${b.distanciaMetros} m` : ''}
                        </span>
                      )}
                    </div>
                    <a href={`https://www.google.com/maps?q=${b.latLng}`} target="_blank" rel="noreferrer" className="block text-center text-xs font-semibold text-primary py-2 hover:bg-gray-50">
                      Abrir no Google Maps
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-400 text-xs py-2">Nenhuma batida registrada ainda</p>
        )}
      </div>
    </Casca>
  );
}
