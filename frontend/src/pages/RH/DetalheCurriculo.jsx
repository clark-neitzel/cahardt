import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Clock, User, Check, AlertCircle, X, Trash2, Pencil } from 'lucide-react';
import { obterCurriculo, atualizarCurriculo, gerarLinkWhatsapp, excluirCurriculo } from '../../services/curriculoService';
import { API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const STATUS_OPCOES = [
  'Novo', 'Editado', 'Em Análise', 'Entrevista', 'Agendado',
  'Entrevistado', 'Aprovado', 'Contratado',
  'Não Qualificado', 'Rejeitado', 'Desistiu', 'Não Disponível',
];

const STATUS_COR = {
  'Novo': 'bg-blue-100 text-blue-700 border-blue-200',
  'Editado': 'bg-amber-100 text-amber-700 border-amber-200',
  'Em Análise': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Entrevista': 'bg-purple-100 text-purple-700 border-purple-200',
  'Agendado': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Entrevistado': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Aprovado': 'bg-teal-100 text-teal-700 border-teal-200',
  'Contratado': 'bg-green-100 text-green-700 border-green-200',
  'Não Qualificado': 'bg-gray-100 text-gray-600 border-gray-200',
  'Rejeitado': 'bg-red-100 text-red-700 border-red-200',
  'Desistiu': 'bg-orange-100 text-orange-700 border-orange-200',
  'Não Disponível': 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatarData(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatarDataHora(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatarCPF(cpf) {
  return (cpf || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function formatarWhatsApp(w) {
  const n = (w || '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return w;
}

function Secao({ titulo, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{titulo}</h3>
      {children}
    </div>
  );
}
function Campo({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{valor}</div>
    </div>
  );
}

export default function DetalheCurriculo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const podeExcluir = hasPermission('Pode_Excluir_RH');
  const podeEditar = hasPermission('Pode_Editar_RH');
  const [curriculo, setCurriculo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState('');
  const [observacao, setObservacao] = useState('');
  const [observacaoEditando, setObservacaoEditando] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [editandoDados, setEditandoDados] = useState(false);

  useEffect(() => {
    obterCurriculo(id)
      .then(c => {
        setCurriculo(c);
        setStatus(c.status);
        setObservacao(c.observacao || '');
      })
      .catch(() => toast.error('Erro ao carregar currículo'))
      .finally(() => setCarregando(false));
  }, [id]);

  async function salvarStatus(novoStatus) {
    if (novoStatus === curriculo.status) return;
    setSalvando(true);
    try {
      const att = await atualizarCurriculo(id, { status: novoStatus });
      setCurriculo(c => ({ ...c, status: att.status }));
      setStatus(att.status);
      toast.success('Status atualizado');
    } catch { toast.error('Erro ao atualizar status'); }
    setSalvando(false);
  }

  async function salvarObservacao() {
    setSalvando(true);
    try {
      await atualizarCurriculo(id, { observacao });
      setCurriculo(c => ({ ...c, observacao }));
      setObservacaoEditando(false);
      toast.success('Observação salva');
    } catch { toast.error('Erro ao salvar observação'); }
    setSalvando(false);
  }

  async function handleExcluir() {
    setSalvando(true);
    try {
      await excluirCurriculo(id);
      toast.success('Currículo excluído');
      navigate('/rh/curriculos');
    } catch { toast.error('Erro ao excluir currículo'); }
    setSalvando(false);
    setConfirmandoExclusao(false);
  }

  async function handleWhatsApp() {
    setSalvando(true);
    try {
      await gerarLinkWhatsapp(id);
      setStatus('Entrevista');
      setCurriculo(c => ({ ...c, status: 'Entrevista' }));
      toast.success('Convite enviado via WhatsApp!');
    } catch { toast.error('Erro ao enviar convite'); }
    setSalvando(false);
  }

  if (carregando) return <div className="p-8 text-center text-gray-400">Carregando...</div>;
  if (!curriculo) return <div className="p-8 text-center text-red-500">Currículo não encontrado.</div>;


  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      {/* Lightbox foto */}
      {fotoAmpliada && curriculo.foto && (
        <div onClick={() => setFotoAmpliada(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out">
          <img src={`${API_URL}/uploads/${curriculo.foto}`} alt={curriculo.nome}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()} />
          <button onClick={() => setFotoAmpliada(false)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80">
            <X size={20} />
          </button>
        </div>
      )}
      {/* Modal confirmação de exclusão */}
      {confirmandoExclusao && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Excluir currículo</h3>
                <p className="text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Tem certeza que deseja excluir o currículo de <span className="font-medium">{curriculo.nome}</span>?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmandoExclusao(false)} disabled={salvando}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleExcluir} disabled={salvando}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {salvando ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/rh/curriculos')} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{curriculo.nome}</h1>
          <p className="text-sm text-gray-500">{curriculo.areaInteresse} · {formatarData(curriculo.criadoEm)}</p>
        </div>
        {podeEditar && (
          <button onClick={() => setEditandoDados(true)} disabled={salvando}
            className="flex items-center gap-1.5 border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition">
            <Pencil size={15} /> Editar dados
          </button>
        )}
        {podeExcluir && (
          <button onClick={() => setConfirmandoExclusao(true)} disabled={salvando}
            className="flex items-center gap-1.5 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition">
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button onClick={handleWhatsApp} disabled={salvando}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          <MessageCircle size={16} /> Convidar para entrevista
        </button>
      </div>

      {/* Modal de edição de dados */}
      {editandoDados && (
        <EditarDadosModal
          curriculo={curriculo}
          onClose={() => setEditandoDados(false)}
          onSaved={atualizado => {
            setCurriculo(c => ({ ...c, ...atualizado }));
            setStatus(atualizado.status);
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Foto + dados pessoais */}
          <Secao titulo="Dados pessoais">
            <div className="flex gap-4 items-start">
              {curriculo.foto
                ? <button onClick={() => setFotoAmpliada(true)} className="shrink-0 focus:outline-none group">
                    <img src={`${API_URL}/uploads/${curriculo.foto}`} alt={curriculo.nome}
                      className="w-20 h-20 rounded-xl object-cover border border-gray-200 group-hover:opacity-80 transition cursor-zoom-in" />
                  </button>
                : <div className="w-20 h-20 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-2xl shrink-0">
                    {curriculo.nome.charAt(0).toUpperCase()}
                  </div>
              }
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                <Campo label="CPF" valor={formatarCPF(curriculo.cpf)} />
                <Campo label="Data de nascimento" valor={formatarData(curriculo.dataNascimento)} />
                <Campo label="WhatsApp" valor={formatarWhatsApp(curriculo.whatsapp)} />
                <Campo label="E-mail" valor={curriculo.email} />
                <Campo label="Estado civil" valor={curriculo.estadoCivil} />
                <Campo label="Tem filhos?" valor={curriculo.temFilhos} />
                <Campo label="Naturalidade" valor={curriculo.naturalidade} />
              </div>
            </div>
            {curriculo.endereco && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-400">Endereço</div>
                <div className="text-sm text-gray-800 mt-0.5">{curriculo.endereco}</div>
              </div>
            )}
          </Secao>

          {/* Disponibilidade */}
          <Secao titulo="Disponibilidade">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Área de interesse" valor={curriculo.areaInteresse} />
              <Campo label="Horário de início" valor={curriculo.horarioInicio} />
              <Campo label="Horas extras" valor={curriculo.horasExtras} />
              <Campo label="Disponibilidade" valor={curriculo.disponibilidade} />
            </div>
          </Secao>

          {/* Experiência */}
          <Secao titulo="Experiência profissional">
            <Campo label="Empregos com registro" valor={curriculo.empregosRegistrados} />
            <Campo label="Trabalhos sem registro" valor={curriculo.empregosSemRegistro} />
            <Campo label="Outras experiências" valor={curriculo.outrasExperiencias} />
          </Secao>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Status</h3>
            <div className={`inline-flex px-3 py-1.5 rounded-lg border text-sm font-medium mb-3 ${STATUS_COR[curriculo.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {curriculo.status}
            </div>
            <select value={status} onChange={e => salvarStatus(e.target.value)} disabled={salvando}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
              {STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Observação */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Observação interna</h3>
              {!observacaoEditando && (
                <button onClick={() => setObservacaoEditando(true)}
                  className="text-xs text-orange-500 hover:text-orange-700">Editar</button>
              )}
            </div>
            {observacaoEditando ? (
              <div className="space-y-2">
                <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                  rows={4} placeholder="Anotações internas sobre este candidato..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => { setObservacaoEditando(false); setObservacao(curriculo.observacao || ''); }}
                    className="flex-1 border border-gray-300 text-gray-600 py-1.5 rounded-lg text-xs">Cancelar</button>
                  <button onClick={salvarObservacao} disabled={salvando}
                    className="flex-1 bg-orange-500 text-white py-1.5 rounded-lg text-xs disabled:opacity-50">Salvar</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap min-h-[2rem]">
                {curriculo.observacao || <span className="text-gray-300 italic">Sem observações</span>}
              </p>
            )}
          </div>

          {/* Acessos */}
          {curriculo.acessos?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <User size={12} /> Visualizações
              </h3>
              <div className="space-y-2">
                {curriculo.acessos.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 font-medium">{a.vendedor?.nome?.split(' ')[0]}</span>
                    <span className="text-gray-400">{formatarDataHora(a.acessadoEm)}</span>
                  </div>
                ))}
                {curriculo.acessos.length > 5 && (
                  <p className="text-xs text-gray-400">+{curriculo.acessos.length - 5} mais acessos</p>
                )}
              </div>
            </div>
          )}

          {/* Histórico */}
          {curriculo.historico?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Clock size={12} /> Histórico de alterações
              </h3>
              <div className="space-y-2.5">
                {curriculo.historico.slice(0, 8).map(h => (
                  <div key={h.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">{h.vendedor?.nome?.split(' ')[0]}</span>
                      <span className="text-gray-400">{formatarDataHora(h.criadoEm)}</span>
                    </div>
                    {h.campo === 'status' ? (
                      <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                        <span>{h.valorAntes || '—'}</span>
                        <ChevronRight size={10} />
                        <span className="font-medium text-gray-700">{h.valorDepois}</span>
                      </div>
                    ) : h.campo === 'dados' ? (
                      <div className="text-gray-500 mt-0.5">
                        Dados editados <span className="text-gray-400">({h.valorDepois})</span>
                      </div>
                    ) : (
                      <div className="text-gray-500 mt-0.5">
                        Observação {h.valorDepois ? 'atualizada' : 'removida'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>;
}

const AREAS_EDIT = ['Produção', 'Entrega', 'Vendas', 'Administrativo', 'Outros'];
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'];
const SIM_NAO = ['Sim', 'Não'];
const HORARIOS_INICIO = ['Imediato', 'Em 1 semana', 'Em 15 dias', 'Em 1 mês', 'Mais de 1 mês'];
const HORAS_EXTRAS_OPCOES = ['Sim', 'Não', 'Eventualmente'];
const DISPONIBILIDADE_OPCOES = ['Integral (horário comercial)', 'Somente pela manhã', 'Somente pela tarde', 'Somente à noite', 'Aos finais de semana', 'Horário flexível'];

function EditField({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function EditarDadosModal({ curriculo, onClose, onSaved }) {
  const initial = {
    nome: curriculo.nome || '',
    email: curriculo.email || '',
    whatsapp: curriculo.whatsapp || '',
    dataNascimento: curriculo.dataNascimento ? new Date(curriculo.dataNascimento).toISOString().slice(0, 10) : '',
    estadoCivil: curriculo.estadoCivil || '',
    temFilhos: curriculo.temFilhos || '',
    naturalidade: curriculo.naturalidade || '',
    endereco: curriculo.endereco || '',
    areaInteresse: curriculo.areaInteresse || '',
    horarioInicio: curriculo.horarioInicio || '',
    horasExtras: curriculo.horasExtras || '',
    disponibilidade: curriculo.disponibilidade || '',
    empregosRegistrados: curriculo.empregosRegistrados || '',
    empregosSemRegistro: curriculo.empregosSemRegistro || '',
    outrasExperiencias: curriculo.outrasExperiencias || '',
  };
  const [form, setForm] = useState(initial);
  const [salvando, setSalvando] = useState(false);

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.nome || form.nome.trim().split(/\s+/).length < 2) {
      toast.error('Informe nome e sobrenome');
      return;
    }
    const w = form.whatsapp.replace(/\D/g, '');
    if (w.length < 10 || w.length > 11) {
      toast.error('WhatsApp inválido');
      return;
    }
    if (!form.areaInteresse) {
      toast.error('Área de interesse é obrigatória');
      return;
    }
    setSalvando(true);
    try {
      const atualizado = await atualizarCurriculo(curriculo.id, form);
      toast.success('Currículo atualizado');
      onSaved(atualizado);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.erro || 'Erro ao salvar');
    }
    setSalvando(false);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Editar dados do candidato</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dados pessoais */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dados pessoais</h3>
            <EditField label="Nome completo">
              <input type="text" value={form.nome} onChange={e => update('nome', e.target.value)} className={inputCls} />
            </EditField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label="WhatsApp">
                <input type="tel" value={form.whatsapp} onChange={e => update('whatsapp', e.target.value)} className={inputCls} />
              </EditField>
              <EditField label="E-mail">
                <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={inputCls} />
              </EditField>
              <EditField label="Data de nascimento">
                <input type="date" value={form.dataNascimento} onChange={e => update('dataNascimento', e.target.value)} className={inputCls} />
              </EditField>
              <EditField label="Estado civil">
                <select value={form.estadoCivil} onChange={e => update('estadoCivil', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {ESTADOS_CIVIS.map(s => <option key={s}>{s}</option>)}
                </select>
              </EditField>
              <EditField label="Tem filhos?">
                <select value={form.temFilhos} onChange={e => update('temFilhos', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {SIM_NAO.map(s => <option key={s}>{s}</option>)}
                </select>
              </EditField>
              <EditField label="Naturalidade">
                <input type="text" value={form.naturalidade} onChange={e => update('naturalidade', e.target.value)} className={inputCls} />
              </EditField>
            </div>
            <EditField label="Endereço">
              <input type="text" value={form.endereco} onChange={e => update('endereco', e.target.value)} className={inputCls} />
            </EditField>
          </div>

          {/* Disponibilidade */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Disponibilidade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label="Área de interesse">
                <select value={form.areaInteresse} onChange={e => update('areaInteresse', e.target.value)} className={inputCls}>
                  <option value="">Selecione</option>
                  {AREAS_EDIT.map(a => <option key={a}>{a}</option>)}
                </select>
              </EditField>
              <EditField label="Horário de início">
                <select value={form.horarioInicio} onChange={e => update('horarioInicio', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {HORARIOS_INICIO.map(s => <option key={s}>{s}</option>)}
                </select>
              </EditField>
              <EditField label="Horas extras">
                <select value={form.horasExtras} onChange={e => update('horasExtras', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {HORAS_EXTRAS_OPCOES.map(s => <option key={s}>{s}</option>)}
                </select>
              </EditField>
              <EditField label="Disponibilidade">
                <select value={form.disponibilidade} onChange={e => update('disponibilidade', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {DISPONIBILIDADE_OPCOES.map(s => <option key={s}>{s}</option>)}
                </select>
              </EditField>
            </div>
          </div>

          {/* Experiência */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Experiência profissional</h3>
            <EditField label="Empregos com registro">
              <textarea rows={3} value={form.empregosRegistrados} onChange={e => update('empregosRegistrados', e.target.value)} className={`${inputCls} resize-none`} />
            </EditField>
            <EditField label="Trabalhos sem registro">
              <textarea rows={3} value={form.empregosSemRegistro} onChange={e => update('empregosSemRegistro', e.target.value)} className={`${inputCls} resize-none`} />
            </EditField>
            <EditField label="Outras experiências">
              <textarea rows={3} value={form.outrasExperiencias} onChange={e => update('outrasExperiencias', e.target.value)} className={`${inputCls} resize-none`} />
            </EditField>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={salvando}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-white disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
