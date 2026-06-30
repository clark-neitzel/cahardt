import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, ArrowRight, ArrowLeft, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { obterPonto, registrarPonto } from '../../services/pontoPublicoService';

const pad = (n) => String(n).padStart(2, '0');

export default function BaterPonto() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFatal, setErroFatal] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [agora, setAgora] = useState(new Date());
  const [mapaAberto, setMapaAberto] = useState(null);

  // Relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const d = await obterPonto(token);
      setDados(d);
      setErroFatal(null);
    } catch (e) {
      setErroFatal(e?.response?.data?.erro || 'Não foi possível carregar o ponto.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const pegarLocalizacao = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  const bater = async () => {
    setRegistrando(true);
    setAviso(null);
    try {
      const latLng = await pegarLocalizacao();
      const resp = await registrarPonto(token, latLng);
      setDados((prev) => ({ ...prev, ...resp }));
      setAviso({ tipo: 'ok', texto: `Ponto registrado às ${resp.batida?.hora}` });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e?.response?.data?.erro || 'Erro ao registrar o ponto.' });
    } finally {
      setRegistrando(false);
    }
  };

  const horaAgora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const dataAgora = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  // ── Estados de carregamento / erro ──────────────────────────────────────────
  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
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

  const dentro = dados.status === 'DENTRO';

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* topo */}
        <div className="bg-primary text-white px-5 py-4 flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Clock className="h-6 w-6" /></div>
          <div>
            <p className="text-xs text-blue-100 leading-none">Registro de Ponto</p>
            <p className="text-base font-bold leading-tight">CA-Hardt</p>
          </div>
        </div>

        {/* saudação + relógio */}
        <div className="px-5 pt-5 text-center">
          <p className="text-sm text-gray-500">Olá,</p>
          <p className="text-lg font-bold text-gray-900">{dados.nome}</p>
          <p className="mt-4 text-5xl font-bold text-gray-900 tabular-nums tracking-tight">{horaAgora}</p>
          <p className="text-sm text-gray-500 capitalize">{dataAgora}</p>
          <div className="mt-4">
            {dentro ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-green-500" /> Trabalhando desde {dados.desde}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-gray-400" /> Fora do expediente
              </span>
            )}
          </div>
        </div>

        {/* botão principal */}
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

        {/* batidas de hoje */}
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Hoje</p>
          {dados.batidasHoje?.length ? (
            <ul className="space-y-2 text-sm">
              {dados.batidasHoje.map((b) => (
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
                      <a
                        href={`https://www.google.com/maps?q=${b.latLng}`}
                        target="_blank" rel="noreferrer"
                        className="block text-center text-xs font-semibold text-primary py-2 hover:bg-gray-50"
                      >
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
      </div>
    </div>
  );
}
