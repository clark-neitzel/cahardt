import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, MessageCircle, RefreshCw, Loader2, Upload, Trash2, Plus, Lock, Printer, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import funcionarioService from '../../services/funcionarioService';
import configService from '../../services/configService';
import SelectBusca from '../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { imprimirCartaoPonto } from './imprimirCartaoPonto';
import { API_URL } from '../../services/api';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CATS_DOC = ['RG', 'CPF', 'CTPS', 'RESIDENCIA', 'CONTRATO', 'OUTRO'];
const TIPOS_EXAME = ['ADMISSIONAL', 'PERIODICO', 'DEMISSIONAL', 'RETORNO', 'MUDANCA_FUNCAO'];
const TABS = ['Dados', 'Documentos', 'Exames', 'Atestados', 'Cartão de ponto', 'Desempenho'];

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const mesAtual = () => new Date().toISOString().slice(0, 7);

export default function FuncionarioFicha() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [aba, setAba] = useState('Dados');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setF(await funcionarioService.detalhar(id)); }
    catch { toast.error('Erro ao carregar funcionário.'); }
    finally { setCarregando(false); }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando || !f) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 text-blue-600 animate-spin" /></div>;
  }

  const iniciais = (f.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="w-full p-3 md:p-6">
      <button onClick={() => navigate('/rh/funcionarios')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft className="h-4 w-4" /> Funcionários
      </button>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* cabeçalho */}
        <div className="p-5 flex items-center gap-4 border-b border-gray-100">
          <div className="h-14 w-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">{iniciais}</div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-900 truncate">{f.nome}</p>
            <p className="text-sm text-gray-500">{f.cargo || 'Sem cargo'}{f.estado?.status === 'DENTRO' ? <span className="text-green-700 font-semibold"> · Trabalhando desde {f.estado.desde}</span> : ''}</p>
          </div>
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${f.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>

        {/* abas */}
        <div className="flex gap-1 px-3 pt-3 overflow-x-auto border-b border-gray-100">
          {TABS.map((t) => (
            <button key={t} onClick={() => setAba(t)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${aba === t ? 'text-primary font-semibold border-primary' : 'text-gray-500 font-medium border-transparent'}`}>{t}</button>
          ))}
        </div>

        <div className="p-5">
          {aba === 'Dados' && <AbaDados f={f} onSaved={carregar} />}
          {aba === 'Documentos' && <AbaDocumentos f={f} onSaved={carregar} />}
          {aba === 'Exames' && <AbaExames f={f} onSaved={carregar} />}
          {aba === 'Atestados' && <AbaAtestados f={f} onSaved={carregar} />}
          {aba === 'Cartão de ponto' && <AbaCartao f={f} />}
          {aba === 'Desempenho' && <AbaDesempenho f={f} onSaved={carregar} />}
        </div>
      </div>
    </div>
  );
}

// ─── Aba Dados ────────────────────────────────────────────────────────────────
function AbaDados({ f, onSaved }) {
  const [form, setForm] = useState({
    cargo: f.cargo || '', salario: f.salario ?? '', tipoHoraExtra: f.tipoHoraExtra || 'BANCO',
    percentualHoraExtra: f.percentualHoraExtra ?? 50, divisorHoras: f.divisorHoras ?? 220,
    descontarDsrFalta: f.descontarDsrFalta !== false,
    jornadaMovel: f.jornadaMovel, ativo: f.ativo
  });
  const [jornadas, setJornadas] = useState(() => {
    const map = {};
    (f.jornadas || []).forEach(j => { map[j.diaSemana] = j; });
    return Array.from({ length: 7 }, (_, d) => map[d] || { diaSemana: d, entrada1: '', saida1: '', entrada2: '', saida2: '', folga: d === 0 });
  });
  const [salvando, setSalvando] = useState(false);
  const [token, setToken] = useState(f.pontoToken);
  const [linkBase, setLinkBase] = useState('');
  const [senha, setSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [temSenha, setTemSenha] = useState(!!f.temSenha);

  // Base do link de ponto configurável (ex.: domínio hardtsalgados); cai no domínio atual
  useEffect(() => {
    configService.get('ponto_link_base').then((v) => {
      const base = v && (typeof v === 'string' ? v : v.url);
      if (base) setLinkBase(String(base).replace(/\/$/, ''));
    }).catch(() => {});
  }, []);

  const set = (c) => (e) => setForm((s) => ({ ...s, [c]: e.target.value }));
  const setJ = (i, c, v) => setJornadas((arr) => arr.map((j, idx) => idx === i ? { ...j, [c]: v } : j));

  const salvarSenha = async () => {
    if (!senha || senha.length < 4) { toast.error('A senha deve ter ao menos 4 caracteres.'); return; }
    setSalvandoSenha(true);
    try { await funcionarioService.definirSenha(f.id, senha); setTemSenha(true); setSenha(''); toast.success('Senha definida!'); }
    catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao definir senha.'); }
    finally { setSalvandoSenha(false); }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await funcionarioService.atualizar(f.id, form);
      await funcionarioService.salvarJornada(f.id, { jornadas, jornadaMovel: form.jornadaMovel });
      toast.success('Dados salvos!');
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  };

  const gerarLink = async () => {
    try { const r = await funcionarioService.gerarLink(f.id); setToken(r.pontoToken); toast.success('Link gerado!'); }
    catch { toast.error('Erro ao gerar link.'); }
  };

  const linkPonto = token ? `${linkBase || window.location.origin}/ponto/${token}` : '';
  const copiar = () => { navigator.clipboard.writeText(linkPonto); toast.success('Link copiado!'); };
  const whats = () => window.open(`https://wa.me/?text=${encodeURIComponent('Seu link de ponto: ' + linkPonto)}`, '_blank');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block"><span className="text-sm font-medium text-gray-700">Cargo</span><input value={form.cargo} onChange={set('cargo')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
        <label className="block"><span className="text-sm font-medium text-gray-700">Salário mensal (R$)</span>
          <input inputMode="decimal" value={form.salario} onChange={set('salario')} placeholder="0,00" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
          <span className="text-xs text-gray-500">Base do cálculo da folha: valor da hora = salário ÷ {form.divisorHoras || 220}; valor do dia = salário ÷ 30.</span>
        </label>
        <label className="block"><span className="text-sm font-medium text-gray-700">Hora extra</span>
          <SelectBusca value={form.tipoHoraExtra} onChange={set('tipoHoraExtra')} className="mt-1 w-full">
            <option value="BANCO">Banco de horas</option><option value="PAGA">Hora extra paga</option>
          </SelectBusca>
        </label>
      </div>

      {/* parâmetros do cálculo da folha */}
      <div className="border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <DollarSign className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Cálculo da folha</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block"><span className="text-sm font-medium text-gray-700">Adicional de hora extra (%)</span>
            <input type="number" min="0" max="300" step="5" value={form.percentualHoraExtra} onChange={set('percentualHoraExtra')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            <span className="text-xs text-gray-500">50% é o padrão da CLT.</span>
          </label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Divisor de horas do mês</span>
            <input type="number" min="1" max="300" value={form.divisorHoras} onChange={set('divisorHoras')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            <span className="text-xs text-gray-500">220 para 44h semanais; 180 para 36h.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 md:pt-6">
            <input type="checkbox" checked={form.descontarDsrFalta} onChange={(e) => setForm(s => ({ ...s, descontarDsrFalta: e.target.checked }))} className="mt-0.5" />
            <span>Falta faz perder o DSR da semana <span className="block text-xs text-gray-500">Além do dia da falta, desconta 1 dia de descanso semanal.</span></span>
          </label>
        </div>
      </div>

      {/* escala */}
      <div className="border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Escala semanal</span>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <input type="checkbox" checked={form.jornadaMovel} onChange={(e) => setForm(s => ({ ...s, jornadaMovel: e.target.checked }))} /> Janela móvel
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-gray-500"><tr className="text-xs uppercase">
              <th className="px-3 py-2 text-left">Dia</th><th className="px-2 py-2">Entrada</th><th className="px-2 py-2">Saída almoço</th><th className="px-2 py-2">Volta</th><th className="px-2 py-2">Saída</th><th className="px-2 py-2">Folga</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {jornadas.map((j, i) => (
                <tr key={i} className={j.folga ? 'text-gray-400' : ''}>
                  <td className="px-3 py-1.5 font-medium">{DIAS[i]}</td>
                  {['entrada1', 'saida1', 'entrada2', 'saida2'].map((campo) => (
                    <td key={campo} className="px-1 py-1.5">
                      <input type="time" disabled={j.folga} value={j[campo] || ''} onChange={(e) => setJ(i, campo, e.target.value)} className="border border-gray-200 rounded px-1 py-1 text-xs w-24 disabled:bg-gray-50" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={j.folga} onChange={(e) => setJ(i, 'folga', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">Janela móvel: se entrar antes, a saída esperada desloca mantendo a mesma carga diária. O excedente vira banco/hora extra.</p>
      </div>

      {/* link de ponto */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Link de ponto do funcionário</p>
        {token ? (
          <div className="flex flex-col md:flex-row gap-2">
            <input readOnly value={linkPonto} className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 text-gray-600" />
            <button onClick={copiar} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold inline-flex items-center gap-1"><Copy className="h-4 w-4" /> Copiar</button>
            <button onClick={whats} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
            <button onClick={gerarLink} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium inline-flex items-center gap-1"><RefreshCw className="h-4 w-4" /> Gerar novo</button>
          </div>
        ) : (
          <button onClick={gerarLink} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold">Gerar link de ponto</button>
        )}
      </div>

      {/* senha de acesso */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2 flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Senha de acesso ao ponto</p>
        <p className="text-xs text-gray-500 mb-2">
          {temSenha
            ? 'O funcionário já tem senha. Defina uma nova abaixo para substituir.'
            : 'Defina uma senha — sem ela o funcionário não consegue bater o ponto pelo link.'}
        </p>
        <div className="flex flex-col md:flex-row gap-2">
          <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha (mín. 4)" className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
          <button onClick={salvarSenha} disabled={salvandoSenha} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1">{salvandoSenha && <Loader2 className="h-4 w-4 animate-spin" />} {temSenha ? 'Trocar senha' : 'Definir senha'}</button>
        </div>
        {temSenha && <p className="mt-2 text-xs text-green-700 font-semibold">✓ Senha definida</p>}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.ativo} onChange={(e) => setForm(s => ({ ...s, ativo: e.target.checked }))} />
          Acesso liberado <span className="text-gray-400">(desmarque para bloquear quando não for mais funcionário/prestador)</span>
        </label>
        <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
      </div>
    </div>
  );
}

// ─── Aba Documentos ───────────────────────────────────────────────────────────
function AbaDocumentos({ f, onSaved }) {
  const [categoria, setCategoria] = useState('RG');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', file); fd.append('categoria', categoria); fd.append('nome', file.name);
      await funcionarioService.addDocumento(f.id, fd);
      toast.success('Documento anexado!'); onSaved();
    } catch { toast.error('Erro ao anexar.'); }
    finally { setEnviando(false); e.target.value = ''; }
  };
  const excluir = async (docId) => {
    if (!confirm('Excluir este documento?')) return;
    try { await funcionarioService.delDocumento(f.id, docId); toast.success('Excluído.'); onSaved(); }
    catch { toast.error('Erro ao excluir.'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SelectBusca value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATS_DOC.map(c => <option key={c} value={c}>{c}</option>)}
        </SelectBusca>
        <label className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Anexar (PDF/imagem)
          <input type="file" accept="image/*,application/pdf" hidden onChange={enviar} />
        </label>
      </div>
      <ListaAnexos itens={f.documentos} render={(d) => `${d.nome} · ${d.categoria}`} onDelete={excluir} />
    </div>
  );
}

// ─── Aba Exames ───────────────────────────────────────────────────────────────
function AbaExames({ f, onSaved }) {
  const [form, setForm] = useState({ tipo: 'PERIODICO', data: '', validade: '', resultado: 'APTO', obs: '' });
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      if (file) fd.append('arquivo', file);
      await funcionarioService.addExame(f.id, fd);
      toast.success('Exame salvo!'); setFile(null); setForm({ tipo: 'PERIODICO', data: '', validade: '', resultado: 'APTO', obs: '' }); onSaved();
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const excluir = async (exId) => { if (!confirm('Excluir exame?')) return; try { await funcionarioService.delExame(f.id, exId); onSaved(); } catch { toast.error('Erro.'); } };

  const hoje = new Date();
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
        <SelectBusca value={form.tipo} onChange={set('tipo')}>{TIPOS_EXAME.map(t => <option key={t} value={t}>{t}</option>)}</SelectBusca>
        <input type="date" value={form.data} onChange={set('data')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="date" value={form.validade} onChange={set('validade')} placeholder="validade" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <SelectBusca value={form.resultado} onChange={set('resultado')}><option value="APTO">Apto</option><option value="INAPTO">Inapto</option></SelectBusca>
        <label className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-600 cursor-pointer truncate">{file ? file.name : 'Anexo (opcional)'}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0])} /></label>
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar exame</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.exames || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum exame.</li>}
        {(f.exames || []).map((ex) => {
          const venc = ex.validade ? new Date(ex.validade) : null;
          const dias = venc ? Math.ceil((venc - hoje) / 86400000) : null;
          const badge = dias == null ? null : dias < 0 ? ['bg-red-100 text-red-700', 'Vencido'] : dias <= 30 ? ['bg-amber-100 text-amber-700', `Vence ${dias}d`] : ['bg-green-100 text-green-800', 'Válido'];
          return (
            <li key={ex.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span><b>{ex.tipo}</b> · {fmtData(ex.data)}{ex.validade ? ` · vence ${fmtData(ex.validade)}` : ''} <span className="text-xs text-gray-500">{ex.resultado || ''}</span></span>
              <span className="flex items-center gap-2">
                {badge && <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge[0]}`}>{badge[1]}</span>}
                {ex.arquivo && <a href={`${API_URL}/uploads/${ex.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>}
                <button onClick={() => excluir(ex.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Aba Atestados ────────────────────────────────────────────────────────────
function AbaAtestados({ f, onSaved }) {
  const [form, setForm] = useState({ dataInicio: '', dias: '1', cid: '', obs: '' });
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));

  const salvar = async () => {
    if (!form.dataInicio) { toast.error('Informe a data.'); return; }
    setSalvando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      if (file) fd.append('arquivo', file);
      await funcionarioService.addAtestado(f.id, fd);
      toast.success('Atestado salvo!'); setFile(null); setForm({ dataInicio: '', dias: '1', cid: '', obs: '' }); onSaved();
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const excluir = async (atId) => { if (!confirm('Excluir atestado?')) return; try { await funcionarioService.delAtestado(f.id, atId); onSaved(); } catch { toast.error('Erro.'); } };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <input type="date" value={form.dataInicio} onChange={set('dataInicio')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="number" min="1" value={form.dias} onChange={set('dias')} placeholder="dias" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.cid} onChange={set('cid')} placeholder="CID (opcional)" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.obs} onChange={set('obs')} placeholder="Obs" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <label className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-600 cursor-pointer truncate">{file ? file.name : 'Anexo'}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0])} /></label>
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar atestado</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.atestados || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum atestado.</li>}
        {(f.atestados || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span><b>{fmtData(a.dataInicio)}</b> · {a.dias} dia(s){a.cid ? ` · CID ${a.cid}` : ''}</span>
            <span className="flex items-center gap-2">
              {a.arquivo && <a href={`${API_URL}/uploads/${a.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>}
              <button onClick={() => excluir(a.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Aba Cartão de ponto ──────────────────────────────────────────────────────
// Selo de cada situação do dia (as cores seguem os badges de status do sistema)
const SELO_SITUACAO = {
  TRABALHADO: 'bg-green-100 text-green-800',
  FALTA: 'bg-red-100 text-red-700',
  ABONO: 'bg-amber-100 text-amber-700',
  FERIADO: 'bg-blue-100 text-blue-800',
  FOLGA: 'bg-gray-100 text-gray-700',
  COMPENSADO: 'bg-gray-100 text-gray-700',
  FUTURO: 'bg-gray-50 text-gray-400',
  SEM_VINCULO: 'bg-gray-50 text-gray-400'
};

const OPCOES_DIA = [
  { tipo: 'FALTA', rotulo: 'Falta', ajuda: 'Desconta o dia e o DSR da semana' },
  { tipo: 'ABONO', rotulo: 'Abonado', ajuda: 'Atestado, folga paga — não desconta' },
  { tipo: 'FERIADO', rotulo: 'Feriado', ajuda: 'Dia de repouso, não é falta' },
  { tipo: 'FOLGA', rotulo: 'Folga / compensado', ajuda: 'Sem carga prevista no dia' }
];

function AbaCartao({ f }) {
  const [periodo, periodoCtl] = usePeriodoSalvo('rh-cartao-ponto');
  const [cartao, setCartao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(null);     // null | 'novo' | objeto da batida (editar)
  const [modalDia, setModalDia] = useState(null); // linha do dia sendo marcada

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setCartao(await funcionarioService.cartao(f.id, { de: periodo.de, ate: periodo.ate })); }
    catch { toast.error('Erro ao carregar cartão.'); }
    finally { setCarregando(false); }
  }, [f.id, periodo.de, periodo.ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const primeiroDia = periodo.de || `${mesAtual()}-01`;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" ocultarPresets={['todo']} />
        <div className="flex gap-2">
          <button
            onClick={() => cartao && imprimirCartaoPonto(cartao)}
            disabled={!cartao}
            className="flex-1 md:flex-none px-3 py-2 min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
            title="Imprime o cartão do período + a folha (folha A4)"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button onClick={() => setModal('novo')} className="flex-1 md:flex-none px-3 py-2 min-h-[40px] bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1">
            <Plus className="h-4 w-4" /> Adicionar batida
          </button>
        </div>
      </div>

      {carregando ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 text-blue-600 animate-spin mx-auto" /></div> : cartao && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">
            <Kpi v={cartao.resumo.trabalhado} l="Trabalhadas" />
            <Kpi v={cartao.resumo.previsto} l="Previsto" />
            <Kpi v={cartao.resumo.saldo} l="Banco de horas" cor={cartao.resumo.saldoMin >= 0 ? 'text-green-600' : 'text-red-600'} />
            <Kpi v={cartao.resumo.extra} l="Hora extra" cor="text-amber-600" />
            <Kpi v={String(cartao.resumo.faltas)} l="Faltas" cor={cartao.resumo.faltas ? 'text-red-600' : 'text-gray-900'} />
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {cartao.linhas.map((l) => (
              <div key={l.data} className={`bg-white rounded-xl border shadow-sm p-3 ${l.situacao === 'FALTA' ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-gray-900 capitalize">{rotuloDia(l.data)}</span>
                  <button onClick={() => setModalDia(l)} className={`px-2 py-1 text-xs font-semibold rounded-full ${SELO_SITUACAO[l.situacao]}`}>{l.situacaoRotulo}</button>
                </div>
                <Batidas linha={l} onEditar={(b) => setModal({ ...b, data: l.data })} />
                <div className="flex gap-4 mt-2 text-xs text-gray-500 tabular-nums">
                  <span>Previsto <b className="text-gray-700">{l.previsto}</b></span>
                  <span>Trabalhado <b className="text-gray-700">{l.trabalhado}</b></span>
                  <span className={l.saldoMin > 0 ? 'text-green-700' : l.saldoMin < 0 ? 'text-red-700' : ''}>Saldo <b>{l.saldo}</b></span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dia</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Batidas</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Previsto</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trabalhado</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {cartao.linhas.length === 0 && <tr><td colSpan="6" className="px-3 py-6 text-center text-gray-400">Nenhum dia no período selecionado.</td></tr>}
                {cartao.linhas.map((l) => (
                  <tr key={l.data} className={`hover:bg-gray-50 ${l.situacao === 'FALTA' ? 'bg-red-50/50' : l.folga ? 'bg-gray-50/60' : ''}`}>
                    <td className="px-3 py-2.5 font-medium capitalize whitespace-nowrap">{rotuloDia(l.data)}</td>
                    <td className="px-3 py-2.5"><Batidas linha={l} onEditar={(b) => setModal({ ...b, data: l.data })} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{l.previsto}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{l.trabalhado}</td>
                    <td className={`px-3 py-2.5 tabular-nums font-semibold ${l.saldoMin > 0 ? 'text-green-700' : l.saldoMin < 0 ? 'text-red-700' : 'text-gray-500'}`}>{l.saldo}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setModalDia(l)}
                        className={`px-2 py-1 text-xs font-semibold rounded-full hover:ring-2 hover:ring-primary/30 ${SELO_SITUACAO[l.situacao]}`}
                        title="Clique para marcar o que foi este dia"
                      >
                        {l.situacaoRotulo}{l.marcadoManual ? ' ✎' : ''}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PainelFolha f={f} cartao={cartao} onSaved={carregar} />
        </>
      )}

      {modal && <ModalBatida funcionarioId={f.id} batida={modal === 'novo' ? null : modal} dataPadrao={primeiroDia} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {modalDia && <ModalDia funcionarioId={f.id} linha={modalDia} onClose={() => setModalDia(null)} onSaved={() => { setModalDia(null); carregar(); }} />}
    </div>
  );
}

const rotuloDia = (data) => new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

function Batidas({ linha, onEditar }) {
  if (!linha.batidas.length) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {linha.batidas.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 rounded-full pl-2 pr-1.5 py-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${b.tipo === 'SAIDA' ? 'bg-orange-500' : 'bg-green-500'}`} title={b.tipo === 'SAIDA' ? 'Saída' : 'Entrada'} />
          <button onClick={() => onEditar(b)} className="tabular-nums text-gray-800 hover:text-primary font-medium" title="Editar / excluir batida">{b.hora}</button>
          {b.latLng && <a href={`https://www.google.com/maps?q=${b.latLng}`} target="_blank" rel="noreferrer" className="leading-none" title="Ver no mapa">📍</a>}
        </span>
      ))}
    </div>
  );
}

function Kpi({ v, l, cor = 'text-gray-900' }) {
  return <div className="bg-gray-50 rounded-lg p-3 text-center"><p className={`text-xl font-bold tabular-nums ${cor}`}>{v}</p><p className="text-xs text-gray-500">{l}</p></div>;
}

// ─── Folha do período (o valor pronto) ────────────────────────────────────────
function PainelFolha({ f, cartao, onSaved }) {
  const fo = cartao.folha;
  const [ajuste, setAjuste] = useState({
    outrosProventos: fo.outrosProventos || '',
    outrosDescontos: fo.outrosDescontos || '',
    obs: fo.obsAjuste || ''
  });
  const [salvando, setSalvando] = useState(false);

  // Ao trocar de período, os ajustes vêm do próprio cartão
  useEffect(() => {
    setAjuste({ outrosProventos: fo.outrosProventos || '', outrosDescontos: fo.outrosDescontos || '', obs: fo.obsAjuste || '' });
  }, [cartao.periodo.de, cartao.periodo.ate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (c) => (e) => setAjuste((s) => ({ ...s, [c]: e.target.value }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await funcionarioService.salvarAjusteFolha(f.id, { de: cartao.periodo.de, ate: cartao.periodo.ate, ...ajuste });
      toast.success('Folha atualizada!');
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao salvar os ajustes.'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="mt-5 bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        <DollarSign className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Folha do período</span>
      </div>
      <div className="p-5">
        {!fo.mesCheio && (
          <p className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            O período escolhido não fecha um mês inteiro. O salário base entra cheio mesmo assim — use “Este mês” para o fechamento da folha.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Proventos */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1.5 mb-1">Proventos</p>
            <LinhaFolha rotulo="Salário base" valor={fo.salarioBase} />
            {fo.horaExtraPaga ? (
              <LinhaFolha rotulo={`Horas extras (${fo.extraHoras})`} detalhe={`+${fo.percentualHoraExtra}% · hora ${moeda(fo.valorHora)}`} valor={fo.valorHoraExtra} />
            ) : (
              <LinhaFolha rotulo={`Horas extras (${fo.extraHoras})`} detalhe="vão para o banco de horas" texto="não pagas" />
            )}
            {fo.horaExtraPaga && <LinhaFolha rotulo="DSR sobre horas extras" detalhe={`${fo.diasRepouso} de descanso ÷ ${fo.diasUteis} úteis`} valor={fo.dsrSobreExtra} />}
            <LinhaFolha rotulo="Outros proventos" valor={fo.outrosProventos} detalhe="prêmio, ajuda de custo…" />
            <LinhaFolha rotulo="Total de proventos" valor={fo.totalProventos} forte />
          </div>

          {/* Descontos */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1.5 mb-1">Descontos</p>
            <LinhaFolha rotulo={`Faltas (${fo.faltas} dia${fo.faltas === 1 ? '' : 's'})`} detalhe={`dia ${moeda(fo.valorDia)}`} valor={fo.descontoFaltas} negativo />
            <LinhaFolha rotulo={`DSR perdido (${fo.dsrPerdidos} dia${fo.dsrPerdidos === 1 ? '' : 's'})`} detalhe={f.descontarDsrFalta === false ? 'desligado na ficha' : 'semanas com falta'} valor={fo.descontoDsr} negativo />
            <LinhaFolha rotulo="Outros descontos" valor={fo.outrosDescontos} detalhe={fo.obsAjuste || 'vale, adiantamento…'} negativo />
            <LinhaFolha rotulo="Total de descontos" valor={fo.totalDescontos} forte negativo />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between bg-mint/40 border border-primary/30 rounded-xl px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-widest text-primaryDark">Total a pagar</span>
          <span className="text-2xl font-bold tabular-nums text-primaryDark">{moeda(fo.liquido)}</span>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">Valor bruto: não inclui INSS, IRRF, FGTS nem vale-transporte — esses ficam com a contabilidade.</p>

        {/* Ajustes manuais */}
        <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block"><span className="text-sm font-medium text-gray-700">Outros proventos (R$)</span>
            <input inputMode="decimal" value={ajuste.outrosProventos} onChange={set('outrosProventos')} placeholder="0,00" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Outros descontos (R$)</span>
            <input inputMode="decimal" value={ajuste.outrosDescontos} onChange={set('outrosDescontos')} placeholder="0,00" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium text-gray-700">Observação</span>
            <input value={ajuste.obs} onChange={set('obs')} placeholder="Ex.: vale de 15/07" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar ajustes
          </button>
        </div>
      </div>
    </div>
  );
}

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function LinhaFolha({ rotulo, detalhe, valor, texto, forte, negativo }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${forte ? 'border-t border-gray-300 mt-1 font-bold' : 'border-b border-gray-100'}`}>
      <span className={`text-sm ${forte ? 'text-gray-900' : 'text-gray-700'}`}>
        {rotulo}{detalhe && !forte && <span className="block text-xs text-gray-400">{detalhe}</span>}
      </span>
      <span className={`text-sm tabular-nums whitespace-nowrap ${forte ? 'text-gray-900' : negativo && Number(valor) > 0 ? 'text-red-700' : 'text-gray-800'}`}>
        {texto || `${negativo && Number(valor) > 0 ? '− ' : ''}${moeda(valor)}`}
      </span>
    </div>
  );
}

// ─── Marcar o que foi um dia (falta, abono, feriado, folga) ───────────────────
function ModalDia({ funcionarioId, linha, onClose, onSaved }) {
  const [obs, setObs] = useState(linha.ocorrenciaObs || '');
  const [salvando, setSalvando] = useState(false);

  const marcar = async (tipo) => {
    setSalvando(true);
    try {
      await funcionarioService.marcarDia({ funcionarioId, data: linha.data, tipo, obs });
      toast.success(tipo ? 'Dia marcado!' : 'Marcação removida.');
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao marcar o dia.'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 capitalize">{rotuloDia(linha.data)}</p>
        <p className="text-sm text-gray-500 mb-3">
          Hoje está como <b>{linha.situacaoRotulo}</b>{linha.marcadoManual ? ' (marcado à mão)' : ' (automático pelas batidas e pela escala)'}.
        </p>

        <div className="space-y-2">
          {OPCOES_DIA.map((o) => (
            <button
              key={o.tipo}
              onClick={() => marcar(o.tipo)}
              disabled={salvando}
              className={`w-full text-left px-3 py-2.5 min-h-[44px] rounded-lg border disabled:opacity-60 ${linha.situacao === o.tipo ? 'border-primary bg-mint/40' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <span className="text-sm font-semibold text-gray-800">{o.rotulo}</span>
              <span className="block text-xs text-gray-500">{o.ajuda}</span>
            </button>
          ))}
        </div>

        <label className="block mt-3"><span className="text-sm font-medium text-gray-700">Motivo (opcional)</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: faltou sem avisar" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /></label>

        <div className="flex items-center justify-between gap-2 mt-4">
          <button onClick={() => marcar(null)} disabled={salvando || !linha.marcadoManual} className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40">
            Voltar ao automático
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ModalBatida({ funcionarioId, batida, dataPadrao, onClose, onSaved }) {
  const editando = !!batida;
  const [form, setForm] = useState(
    editando
      ? { data: batida.data, hora: batida.hora, tipo: batida.tipo === 'SAIDA' ? 'SAIDA' : 'ENTRADA', obs: batida.obs || '' }
      : { data: dataPadrao || `${mesAtual()}-01`, hora: '13:00', tipo: 'ENTRADA', obs: '' }
  );
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));
  const salvar = async () => {
    setSalvando(true);
    try {
      if (editando) { await funcionarioService.updateBatida(batida.id, { hora: form.hora, tipo: form.tipo, obs: form.obs }); toast.success('Batida atualizada!'); }
      else { await funcionarioService.addBatida({ funcionarioId, ...form }); toast.success('Batida adicionada!'); }
      onSaved();
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const excluir = async () => {
    if (!window.confirm('Excluir esta batida? Esta ação não pode ser desfeita.')) return;
    setExcluindo(true);
    try { await funcionarioService.delBatida(batida.id); toast.success('Batida excluída!'); onSaved(); }
    catch { toast.error('Erro ao excluir.'); }
    finally { setExcluindo(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-3">{editando ? 'Editar batida' : 'Adicionar / ajustar batida'}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-sm font-medium text-gray-700">Data</span><input type="date" value={form.data} onChange={set('data')} disabled={editando} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Hora</span><input type="time" value={form.hora} onChange={set('hora')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Tipo</span><SelectBusca value={form.tipo} onChange={set('tipo')} className="mt-1 w-full"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></SelectBusca></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Motivo</span><input value={form.obs} onChange={set('obs')} placeholder="Esqueceu de bater" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
        </div>
        {editando && <p className="text-xs text-gray-400 mt-2">As batidas do dia se reordenam sozinhas pelo horário após salvar.</p>}
        <div className="flex items-center justify-between gap-2 mt-4">
          <div>
            {editando && <button onClick={excluir} disabled={excluindo || salvando} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1"><Trash2 className="h-4 w-4" />{excluindo ? 'Excluindo…' : 'Excluir'}</button>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md font-medium text-sm">Cancelar</button>
            <button onClick={salvar} disabled={salvando || excluindo} className="px-4 py-2 bg-primary text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Desempenho ───────────────────────────────────────────────────────────
function AbaDesempenho({ f, onSaved }) {
  const [form, setForm] = useState({ periodo: mesAtual(), nota: '', obs: '' });
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));
  const salvar = async () => {
    setSalvando(true);
    try { await funcionarioService.addAvaliacao(f.id, form); toast.success('Avaliação salva!'); setForm({ periodo: mesAtual(), nota: '', obs: '' }); onSaved(); }
    catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const media = (f.avaliacoes || []).length ? ((f.avaliacoes.reduce((s, a) => s + Number(a.nota || 0), 0) / f.avaliacoes.length).toFixed(1)) : '—';

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi v={media} l="Nota média" cor="text-primary" />
        <Kpi v={String((f.atestados || []).length)} l="Atestados" cor="text-amber-600" />
        <Kpi v={String((f.avaliacoes || []).length)} l="Avaliações" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <input type="month" value={form.periodo} onChange={set('periodo')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="number" min="0" max="10" step="0.5" value={form.nota} onChange={set('nota')} placeholder="Nota 0–10" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.obs} onChange={set('obs')} placeholder="Observação" className="border border-gray-300 rounded px-2 py-2 text-sm md:col-span-2" />
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar avaliação</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.avaliacoes || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhuma avaliação.</li>}
        {(f.avaliacoes || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span><b>{a.periodo}</b>{a.obs ? ` · ${a.obs}` : ''}</span>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Nota {Number(a.nota).toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Lista de anexos genérica ─────────────────────────────────────────────────
function ListaAnexos({ itens, render, onDelete }) {
  if (!itens?.length) return <p className="text-sm text-gray-400">Nenhum documento anexado.</p>;
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
      {itens.map((d) => (
        <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="truncate">📄 {render(d)}</span>
          <span className="flex items-center gap-3 shrink-0">
            <a href={`${API_URL}/uploads/${d.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>
            <button onClick={() => onDelete(d.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}
