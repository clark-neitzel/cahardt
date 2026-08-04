import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, ArrowRight, ArrowLeft, MapPin, AlertCircle, Loader2, Lock, CheckCircle2, RefreshCw, Hand, Plus, X, Hourglass } from 'lucide-react';
import { obterMeta, loginPonto, obterEstado, registrarPonto, corrigirUltima, pedirAcerto, marcarAcertoLido } from '../../services/pontoPublicoService';

const pad = (n) => String(n).padStart(2, '0');
const hojeISO = () => new Date().toLocaleDateString('en-CA');
const dmy = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

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
  const [registrando, setRegistrando] = useState(false);   // false | 'ENTRADA' | 'SAIDA'
  const [aviso, setAviso] = useState(null);
  const [agora, setAgora] = useState(new Date());
  const [mapaAberto, setMapaAberto] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);    // batida recém-registrada
  const [corrigindo, setCorrigindo] = useState(false);
  const [pedindo, setPedindo] = useState(false);           // formulário "esqueci de bater" aberto
  const [linhas, setLinhas] = useState([]);                // horários esquecidos do pedido
  const [motivoPedido, setMotivoPedido] = useState('');
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [marcandoLido, setMarcandoLido] = useState(false);

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

  // Registra a batida do tipo que a PESSOA escolheu (não é mais adivinhado)
  const bater = async (tipo) => {
    setRegistrando(tipo);
    setAviso(null);
    try {
      const latLng = await pegarLocalizacao();
      const resp = await registrarPonto(token, sessao, latLng, tipo);
      setEstado((prev) => ({ ...prev, ...resp }));
      setConfirmacao(resp.batida);
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

  // "Não era isso?" — troca entrada↔saída da batida que acabou de registrar
  const corrigir = async () => {
    const oposto = confirmacao?.tipo === 'ENTRADA' ? 'SAIDA' : 'ENTRADA';
    setCorrigindo(true);
    try {
      const resp = await corrigirUltima(token, sessao, oposto);
      setEstado((prev) => ({ ...prev, ...resp }));
      setConfirmacao(resp.batida);
      setAviso({ tipo: 'ok', texto: 'Corrigido!' });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e?.response?.data?.erro || 'Não foi possível corrigir.' });
    } finally {
      setCorrigindo(false);
    }
  };

  // ── "Esqueci de bater": monta o pedido com vários horários ─────────────────
  const abrirPedido = () => {
    setLinhas([{ data: hojeISO(), hora: '', tipo: 'ENTRADA' }]);
    setMotivoPedido('');
    setAviso(null);
    setPedindo(true);
  };
  const setLinha = (i, campo, valor) => setLinhas((ls) => ls.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l));
  const addLinha = () => setLinhas((ls) => [...ls, { data: ls[ls.length - 1]?.data || hojeISO(), hora: '', tipo: 'SAIDA' }]);
  const tirarLinha = (i) => setLinhas((ls) => ls.filter((_, idx) => idx !== i));

  const enviarPedido = async () => {
    const itens = linhas.filter(l => l.hora);
    if (!itens.length) { setAviso({ tipo: 'erro', texto: 'Preencha ao menos um horário.' }); return; }
    setEnviandoPedido(true);
    setAviso(null);
    try {
      const resp = await pedirAcerto(token, sessao, itens, motivoPedido);
      setEstado((prev) => ({ ...prev, ...resp }));
      setPedindo(false);
      setAviso({ tipo: 'ok', texto: 'Pedido enviado! Você recebe a resposta aqui.' });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e?.response?.data?.erro || 'Não foi possível enviar o pedido.' });
    } finally {
      setEnviandoPedido(false);
    }
  };

  const confirmarLeitura = async (acertoId) => {
    setMarcandoLido(true);
    try {
      const resp = await marcarAcertoLido(token, sessao, acertoId);
      setEstado((prev) => ({ ...prev, ...resp }));
    } catch { /* segue mostrando; tenta de novo depois */ }
    finally { setMarcandoLido(false); }
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
  // Quem bate no relógio da empresa (ou não bate) não usa este link
  if (meta?.registraPontoEm && meta.registraPontoEm !== 'APP') {
    const noRelogio = meta.registraPontoEm === 'RELOGIO';
    return (
      <Casca>
        <div className="p-6 text-center">
          <Clock className="h-10 w-10 text-gray-400 mx-auto" />
          <p className="mt-3 font-bold text-gray-900">{noRelogio ? 'Seu ponto é no relógio da empresa' : 'Você não registra ponto pelo app'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {noRelogio
              ? 'Continue batendo no equipamento, como sempre. O escritório importa as batidas para o sistema.'
              : 'Se precisar registrar ponto, fale com o RH.'}
          </p>
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

  // ── Formulário "esqueci de bater" ───────────────────────────────────────────
  if (pedindo) {
    const soHoje = (estado.acertoDiasParaTras ?? 0) === 0;
    const minData = new Date(Date.now() - (estado.acertoDiasParaTras ?? 0) * 86400000).toLocaleDateString('en-CA');
    return (
      <Casca>
        <div className="p-5">
          <p className="font-bold text-gray-900">Esqueci de bater</p>
          <p className="text-xs text-gray-500 mb-3">
            Informe os horários que faltaram. {soHoje ? 'Só do dia de hoje.' : `Até ${estado.acertoDiasParaTras} dias atrás.`}
            {' '}O RH confere e aprova.
          </p>

          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-end gap-1.5">
                {!soHoje && (
                  <label className="flex-1 min-w-0">
                    {i === 0 && <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">Dia</span>}
                    <input type="date" value={l.data} min={minData} max={hojeISO()} onChange={(e) => setLinha(i, 'data', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                  </label>
                )}
                <label className="w-[92px]">
                  {i === 0 && <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">Hora</span>}
                  <input type="time" value={l.hora} onChange={(e) => setLinha(i, 'hora', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm" />
                </label>
                <label className="flex-1 min-w-0">
                  {i === 0 && <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">O que era</span>}
                  <select value={l.tipo} onChange={(e) => setLinha(i, 'tipo', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white">
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                  </select>
                </label>
                <button onClick={() => tirarLinha(i)} disabled={linhas.length === 1}
                  className="p-2 text-gray-400 disabled:opacity-30" title="Tirar este horário">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addLinha} disabled={linhas.length >= (estado.acertoMaxItens || 20)}
            className="mt-2 w-full min-h-[44px] bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-1 disabled:opacity-50">
            <Plus className="h-4 w-4" /> Adicionar outro horário
          </button>

          <label className="block mt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Motivo</span>
            <input value={motivoPedido} onChange={(e) => setMotivoPedido(e.target.value)}
              placeholder="Ex.: esqueci ao voltar do café"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>

          {aviso && <p className={`mt-2 text-center text-xs font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{aviso.texto}</p>}

          <button onClick={enviarPedido} disabled={enviandoPedido}
            className="mt-4 w-full min-h-[52px] bg-primary hover:bg-primaryDark text-white rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {enviandoPedido && <Loader2 className="h-5 w-5 animate-spin" />}
            Enviar {linhas.filter(l => l.hora).length || ''} acerto{linhas.filter(l => l.hora).length === 1 ? '' : 's'}
          </button>
          <button onClick={() => { setPedindo(false); setAviso(null); }}
            className="mt-2 w-full min-h-[44px] bg-white border border-gray-300 text-gray-700 rounded-xl font-medium text-sm">
            Cancelar
          </button>
        </div>
      </Casca>
    );
  }

  // ── Confirmação depois de bater ─────────────────────────────────────────────
  if (confirmacao) {
    const foiEntrada = confirmacao.tipo === 'ENTRADA';
    const podeCorrigir = (estado.ultimaBatida?.minutosAtras ?? 99) <= (estado.minutosCorrigirUltima ?? 10);
    return (
      <Casca>
        <div className="p-6 text-center">
          <CheckCircle2 className={`h-14 w-14 mx-auto ${foiEntrada ? 'text-green-600' : 'text-orange-500'}`} />
          <p className="mt-2 text-lg font-bold text-gray-900">{foiEntrada ? 'Entrada registrada' : 'Saída registrada'}</p>
          <p className="text-4xl font-bold text-gray-900 tabular-nums tracking-tight mt-1">{confirmacao.hora}</p>
          {confirmacao.dentroCerca != null && (
            <p className="mt-1 text-xs text-gray-500 flex items-center justify-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {confirmacao.dentroCerca ? 'na empresa' : 'fora da área'}
              {confirmacao.distanciaMetros != null ? ` · ${confirmacao.distanciaMetros} m` : ''}
            </p>
          )}

          <div className="mt-4 bg-mint/50 border border-primary/30 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-600">Total de hoje até agora</p>
            <p className="text-2xl font-bold text-primaryDark tabular-nums">{estado.total}</p>
          </div>

          {aviso && <p className={`mt-2 text-xs font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{aviso.texto}</p>}

          {podeCorrigir && (
            <button
              onClick={corrigir}
              disabled={corrigindo}
              className="mt-4 w-full min-h-[48px] bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {corrigindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Não era isso? Registrar como {foiEntrada ? 'saída' : 'entrada'}
            </button>
          )}

          <button
            onClick={() => { setConfirmacao(null); setAviso(null); }}
            className="mt-2 w-full min-h-[52px] bg-primary hover:bg-primaryDark text-white rounded-xl font-bold"
          >
            OK
          </button>
        </div>
      </Casca>
    );
  }

  // ── Tela de bater ponto ─────────────────────────────────────────────────────
  const dentro = estado.status === 'DENTRO';
  const sugerido = estado.proximaAcao; // 'ENTRADA' | 'SAIDA'
  const resposta = estado.acertoResposta;   // pedido respondido e ainda não lido
  const pendente = estado.acertoPendente;   // pedido aguardando o RH

  return (
    <Casca>
      {/* Resposta do pedido de acerto — espera por ele, mesmo se a aprovação
          saiu dias depois. Só some quando ele toca em "OK, entendi". */}
      {resposta && (
        <div className={`m-4 rounded-xl border px-4 py-3 ${resposta.recusados ? 'bg-red-50 border-red-200' : 'bg-mint/50 border-primary/30'}`}>
          <p className={`text-sm font-bold ${resposta.recusados ? 'text-red-800' : 'text-primaryDark'}`}>
            {resposta.recusados
              ? `Pedido respondido — ${resposta.aprovados} de ${resposta.total} aprovados`
              : '✅ Seu pedido foi aprovado'}
          </p>
          <p className="text-xs text-gray-600">
            {resposta.respondidoNome ? `por ${resposta.respondidoNome}` : ''}
            {resposta.respondidoEm ? ` · ${new Date(resposta.respondidoEm).toLocaleDateString('pt-BR')} ${new Date(resposta.respondidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
          <ul className="mt-2 space-y-1 border-t border-black/10 pt-2">
            {resposta.itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-xs">
                <span className={i.status === 'APROVADO' ? 'text-gray-700' : 'text-red-700'}>
                  {i.status === 'APROVADO' ? '✅' : '❌'} {dmy(i.data)} · <b className="tabular-nums">{i.hora}</b>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${i.tipo === 'ENTRADA' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                  {i.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                </span>
              </li>
            ))}
          </ul>
          {resposta.itens.some(i => i.motivoRecusa) && (
            <p className="mt-2 text-xs text-red-800">Motivo: “{resposta.itens.find(i => i.motivoRecusa)?.motivoRecusa}”</p>
          )}
          <button onClick={() => confirmarLeitura(resposta.id)} disabled={marcandoLido}
            className="mt-3 w-full min-h-[44px] bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm disabled:opacity-60">
            {marcandoLido ? 'Salvando…' : 'OK, entendi'}
          </button>
        </div>
      )}

      {pendente && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
            <Hourglass className="h-4 w-4" /> Aguardando o RH
          </p>
          <p className="text-xs text-amber-800">
            Você pediu acerto de {pendente.total} horário{pendente.total === 1 ? '' : 's'}. A resposta aparece aqui.
          </p>
        </div>
      )}

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

      {/* Os DOIS botões sempre visíveis — o sugerido em destaque.
          É o que impede o dia de inverter quando alguém esquece uma batida. */}
      <div className="p-5 space-y-2">
        {['ENTRADA', 'SAIDA'].sort((a) => (a === sugerido ? -1 : 1)).map((t) => {
          const eEntrada = t === 'ENTRADA';
          const destaque = t === sugerido;
          return (
            <button
              key={t}
              onClick={() => bater(t)}
              disabled={!!registrando}
              className={`w-full rounded-xl shadow-sm font-bold flex items-center justify-center gap-2 text-white disabled:opacity-60
                ${destaque ? 'min-h-[64px] text-lg' : 'min-h-[54px] text-base opacity-95'}
                ${eEntrada ? 'bg-primary hover:bg-primaryDark' : 'bg-orange-600 hover:bg-orange-700'}`}
            >
              {registrando === t
                ? <Loader2 className="h-6 w-6 animate-spin" />
                : (eEntrada ? <ArrowRight className="h-6 w-6" /> : <ArrowLeft className="h-6 w-6" />)}
              {registrando === t ? 'Registrando…' : (eEntrada ? 'ENTRADA' : 'SAÍDA')}
            </button>
          );
        })}

        {aviso ? (
          <p className={`text-center text-xs font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{aviso.texto}</p>
        ) : (
          <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> Localização será registrada na batida
          </p>
        )}
      </div>

      {/* Confere o dia: avisa na hora quando ficou estranho */}
      {estado.alerta && !pendente && (
        <div className="mx-5 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-amber-900">⚠️ Confere o seu dia</p>
          <p className="text-xs text-amber-800 mt-0.5">{estado.alerta.texto}</p>
        </div>
      )}

      {!pendente && (
        <div className="px-5 pb-4">
          <button onClick={abrirPedido}
            className="w-full min-h-[48px] bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2">
            <Hand className="h-4 w-4" /> Esqueci de bater — pedir acerto
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Hoje</p>
          <p className="text-xs text-gray-500">total <span className="font-bold text-gray-800 tabular-nums">{estado.total}</span></p>
        </div>
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
