import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2, ChevronLeft, Crosshair, CalendarDays, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import configService from '../../services/configService';

export default function ConfigPonto() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ lat: '', lng: '', raioMetros: 10, bloquear: true });
  const [linkBase, setLinkBase] = useState('');
  const [feriados, setFeriados] = useState([]); // [{ data:'YYYY-MM-DD', nome }]
  const [novoFeriado, setNovoFeriado] = useState({ data: '', nome: '' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [localizando, setLocalizando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await configService.get('empresa_geofence');
        if (v && typeof v === 'object') {
          setForm({
            lat: v.lat ?? '',
            lng: v.lng ?? '',
            raioMetros: v.raioMetros ?? v.raio_metros ?? 10,
            bloquear: v.bloquear !== false
          });
        }
      } catch { /* sem config ainda */ }
      try {
        const base = await configService.get('ponto_link_base');
        // armazenado como { url }; tolera string antiga
        if (base) setLinkBase(typeof base === 'string' ? base : (base.url || ''));
      } catch { /* sem config ainda */ }
      try {
        const v = await configService.get('rh_feriados');
        const bruto = Array.isArray(v) ? v : (Array.isArray(v?.lista) ? v.lista : []);
        setFeriados(bruto
          .map((i) => (typeof i === 'string' ? { data: i, nome: 'Feriado' } : { data: i?.data, nome: i?.nome || 'Feriado' }))
          .filter((i) => i.data)
          .sort((a, b) => a.data.localeCompare(b.data)));
      } catch { /* sem config ainda */ }
      finally { setCarregando(false); }
    })();
  }, []);

  const set = (c) => (e) => setForm((s) => ({ ...s, [c]: e.target.value }));

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) { toast.error('GPS não disponível neste dispositivo.'); return; }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((s) => ({ ...s, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setLocalizando(false);
        toast.success('Localização capturada!');
      },
      () => { setLocalizando(false); toast.error('Não foi possível obter sua localização.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const salvar = async () => {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || isNaN(lng)) { toast.error('Informe latitude e longitude válidas.'); return; }
    const raioMetros = Math.max(1, parseInt(form.raioMetros) || 10);
    setSalvando(true);
    try {
      await configService.save('empresa_geofence', { lat, lng, raioMetros, bloquear: !!form.bloquear });
      await configService.save('ponto_link_base', { url: (linkBase || '').trim().replace(/\/$/, '') });
      await configService.save('rh_feriados', { lista: feriados });
      toast.success('Configuração salva!');
    } catch {
      toast.error('Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  // Feriados: cada mudança já é gravada (não depende do Salvar da área do ponto)
  const gravarFeriados = async (lista) => {
    setFeriados(lista);
    try { await configService.save('rh_feriados', { lista }); }
    catch { toast.error('Erro ao salvar os feriados.'); }
  };

  const addFeriado = () => {
    if (!novoFeriado.data) { toast.error('Escolha a data do feriado.'); return; }
    if (feriados.some((f) => f.data === novoFeriado.data)) { toast.error('Esse dia já está na lista.'); return; }
    const lista = [...feriados, { data: novoFeriado.data, nome: novoFeriado.nome.trim() || 'Feriado' }]
      .sort((a, b) => a.data.localeCompare(b.data));
    setNovoFeriado({ data: '', nome: '' });
    gravarFeriados(lista);
  };

  const removerFeriado = (data) => gravarFeriados(feriados.filter((f) => f.data !== data));

  const temCoord = form.lat !== '' && form.lng !== '' && !isNaN(parseFloat(form.lat)) && !isNaN(parseFloat(form.lng));
  const mapaSrc = temCoord
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(form.lng) - 0.003}%2C${parseFloat(form.lat) - 0.003}%2C${parseFloat(form.lng) + 0.003}%2C${parseFloat(form.lat) + 0.003}&layer=mapnik&marker=${form.lat}%2C${form.lng}`
    : null;

  return (
    <div className="max-w-2xl mx-auto p-3 md:p-6">
      <button onClick={() => navigate('/rh/ponto')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft className="h-4 w-4" /> Painel de Ponto
      </button>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <MapPin className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Área permitida para o ponto</span>
        </div>

        {carregando ? (
          <div className="py-16 text-center"><Loader2 className="h-7 w-7 text-blue-600 animate-spin mx-auto" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-500">Define o local da empresa e a distância máxima (em metros) para o funcionário conseguir bater o ponto pelo link.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block"><span className="text-sm font-medium text-gray-700">Latitude</span><input value={form.lat} onChange={set('lat')} placeholder="-26.9056" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
              <label className="block"><span className="text-sm font-medium text-gray-700">Longitude</span><input value={form.lng} onChange={set('lng')} placeholder="-48.6580" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
              <label className="block"><span className="text-sm font-medium text-gray-700">Raio (metros)</span><input type="number" min="1" value={form.raioMetros} onChange={set('raioMetros')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
            </div>

            <button onClick={usarMinhaLocalizacao} disabled={localizando} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center gap-2 disabled:opacity-60">
              {localizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Usar minha localização atual
            </button>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {mapaSrc ? (
                <iframe title="Mapa da empresa" src={mapaSrc} className="w-full h-56 border-0" loading="lazy" />
              ) : (
                <div className="h-40 bg-gray-50 flex items-center justify-center text-sm text-gray-400">Informe a localização para ver o mapa</div>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Domínio do link de ponto</span>
              <input value={linkBase} onChange={(e) => setLinkBase(e.target.value)} placeholder="https://app.hardtsalgados.com.br" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
              <span className="text-xs text-gray-400">Define o início do link enviado ao funcionário (ex.: hardtsalgados). Em branco, usa o domínio em que o app está aberto.</span>
            </label>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.bloquear} onChange={(e) => setForm((s) => ({ ...s, bloquear: e.target.checked }))} className="rounded" />
                Bloquear batida fora da área
              </label>
              <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>

            <p className="text-xs text-gray-400">Dica: deixe o raio confortável (ex.: 50–100 m) se o GPS dos celulares oscilar. Sem localização configurada, o ponto é registrado sem checagem de área.</p>
          </div>
        )}
      </div>

      {/* Feriados da empresa */}
      {!carregando && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Feriados da empresa</span>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500">
              No cartão de ponto, quem não vem em dia de feriado <b>não fica com falta</b>. Os feriados também entram
              como dias de descanso no cálculo do DSR sobre as horas extras.
            </p>

            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="date" value={novoFeriado.data}
                onChange={(e) => setNovoFeriado((s) => ({ ...s, data: e.target.value }))}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none md:w-44"
              />
              <input
                value={novoFeriado.nome} placeholder="Nome (ex.: Natal)"
                onChange={(e) => setNovoFeriado((s) => ({ ...s, nome: e.target.value }))}
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <button onClick={addFeriado} className="px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm inline-flex items-center justify-center gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </button>
            </div>

            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {feriados.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum feriado cadastrado.</li>}
              {feriados.map((fe) => (
                <li key={fe.data} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span><b className="tabular-nums">{fe.data.split('-').reverse().join('/')}</b> · {fe.nome}</span>
                  <button onClick={() => removerFeriado(fe.data)} className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
