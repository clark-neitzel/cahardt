import { useState, useRef } from 'react';
import { Camera, Upload, CheckCircle, User, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { buscarCurriculoPorCpf, salvarCurriculo, uploadFotoCurriculo } from '../../services/curriculoService';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatarCPF(v) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function formatarWhatsApp(v) {
  const n = v.replace(/\D/g, '');
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}
function validarCPF(cpf) {
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i);
  let r = (s * 10) % 11; if (r >= 10) r = 0;
  if (r !== parseInt(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === parseInt(n[10]);
}
function calcularIdade(dataNasc) {
  const nasc = new Date(dataNasc);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  if (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate())) idade--;
  return idade;
}

const AREAS = ['Produção', 'Entrega', 'Vendas', 'Administrativo', 'Outros'];
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)'];
const FILHOS = ['Não', 'Sim, 1', 'Sim, 2 ou mais'];
const HORARIOS_INICIO = ['05:00', '06:00', '07:30'];
const DISPONIBILIDADES = ['Integral (horário comercial)', 'Somente pela manhã', 'Somente pela tarde', 'Somente a Noite'];

const INICIAL = {
  nome: '', email: '', whatsapp: '', cpf: '', dataNascimento: '',
  estadoCivil: '', temFilhos: '', naturalidade: '',
  cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '',
  areaInteresse: '', horarioInicio: '', horasExtras: '', disponibilidade: '',
  empregosRegistrados: '', empregosSemRegistro: '', outrasExperiencias: '',
};

// ─── Campo wrapper ────────────────────────────────────────────────────────────
function Campo({ label, obrigatorio, children, erro }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {erro && <p className="text-red-500 text-xs mt-1 flex items-center gap-1">⚠ {erro}</p>}
    </div>
  );
}

// ─── Classes reutilizáveis ────────────────────────────────────────────────────
const inputCls = (erro) =>
  `w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm ${erro ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;
const selectCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white';
const btnPrimary = 'w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-base';
const btnOutline = 'flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:border-green-500 hover:text-green-700 transition';

export default function Candidatura() {
  const [etapa, setEtapa] = useState('cpf');
  const [cpfInput, setCpfInput] = useState('');
  const [cpfErro, setCpfErro] = useState('');
  const [cpfCarregando, setCpfCarregando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(INICIAL);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [temExperiencia, setTemExperiencia] = useState(null);

  // Foto
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [stream, setStream] = useState(null);
  const fileInputRef = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();

  // CEP
  const [cepCarregando, setCepCarregando] = useState(false);
  const [cepErro, setCepErro] = useState('');

  // ─── CPF ──────────────────────────────────────────────────────────────────
  async function verificarCpf() {
    const cpfLimpo = cpfInput.replace(/\D/g, '');
    if (!validarCPF(cpfLimpo)) { setCpfErro('CPF inválido — verifique os números'); return; }
    setCpfErro('');
    setCpfCarregando(true);
    try {
      const res = await buscarCurriculoPorCpf(cpfLimpo);
      if (res.existe) {
        const c = res.curriculo;
        setForm({
          nome: c.nome || '', email: c.email || '', whatsapp: formatarWhatsApp(c.whatsapp || ''),
          cpf: formatarCPF(c.cpf || ''), dataNascimento: c.dataNascimento?.split('T')[0] || '',
          estadoCivil: c.estadoCivil || '', temFilhos: c.temFilhos || '',
          naturalidade: c.naturalidade || '',
          cep: '', rua: c.endereco || '', numero: '', bairro: '', cidade: '', uf: '',
          areaInteresse: c.areaInteresse || '', horarioInicio: c.horarioInicio || '',
          horasExtras: c.horasExtras || '', disponibilidade: c.disponibilidade || '',
          empregosRegistrados: c.empregosRegistrados || '',
          empregosSemRegistro: c.empregosSemRegistro || '',
          outrasExperiencias: c.outrasExperiencias || '',
        });
        if (c.foto) setFotoPreview(`${import.meta.env.VITE_API_URL || ''}/uploads/${c.foto}`);
        if (c.empregosRegistrados || c.empregosSemRegistro || c.outrasExperiencias) setTemExperiencia(true);
        setEditando(true);
      } else {
        setForm({ ...INICIAL, cpf: formatarCPF(cpfLimpo) });
        setEditando(false);
      }
      setEtapa('formulario');
    } catch {
      setCpfErro('Erro ao verificar CPF. Tente novamente.');
    } finally {
      setCpfCarregando(false);
    }
  }

  // ─── Validação inline ─────────────────────────────────────────────────────
  function validarCampo(campo, valor) {
    let erro = '';
    if (campo === 'nome') {
      const v = (valor || '').trim();
      if (!v) erro = 'Nome obrigatório';
      else if (v.split(/\s+/).length < 2) erro = 'Informe nome e sobrenome completos';
    }
    if (campo === 'whatsapp') {
      const n = (valor || '').replace(/\D/g, '');
      if (!n) erro = 'WhatsApp obrigatório';
      else if (n.length < 10 || n.length > 11) erro = 'Número inválido — use DDD + número (ex: 47 99999-9999)';
    }
    if (campo === 'email' && valor) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim()))
        erro = 'E-mail inválido — verifique e corrija';
    }
    if (campo === 'dataNascimento') {
      if (!valor) erro = 'Data de nascimento obrigatória';
      else if (calcularIdade(valor) < 18) erro = 'É necessário ter ao menos 18 anos';
      else if (calcularIdade(valor) > 80) erro = 'Verifique a data informada';
    }
    setErros(prev => ({ ...prev, [campo]: erro || undefined }));
    return !erro;
  }

  function validar() {
    const e = {};
    if (!form.nome.trim() || form.nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome completos';
    const wa = form.whatsapp.replace(/\D/g, '');
    if (!wa || wa.length < 10 || wa.length > 11) e.whatsapp = 'WhatsApp inválido — use DDD + número';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'E-mail inválido';
    if (!form.dataNascimento) e.dataNascimento = 'Data de nascimento obrigatória';
    else if (calcularIdade(form.dataNascimento) < 18) e.dataNascimento = 'É necessário ter ao menos 18 anos';
    if (!form.areaInteresse) e.areaInteresse = 'Selecione uma área de interesse';
    setErros(e);
    if (Object.keys(e).length > 0) {
      setTimeout(() => document.querySelector('.border-red-400')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
    return Object.keys(e).length === 0;
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────
  async function handleSalvar() {
    if (!validar()) return;
    setSalvando(true);
    try {
      const partes = [
        form.rua, form.numero, form.bairro,
        form.cidade && form.uf ? `${form.cidade}/${form.uf}` : form.cidade || form.uf,
        form.cep ? `CEP ${form.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}` : '',
      ].filter(Boolean);
      const payload = {
        ...form,
        cpf: form.cpf.replace(/\D/g, ''),
        whatsapp: form.whatsapp.replace(/\D/g, ''),
        endereco: partes.join(', ') || undefined,
        empregosRegistrados: temExperiencia ? form.empregosRegistrados : '',
        empregosSemRegistro: temExperiencia ? form.empregosSemRegistro : '',
        outrasExperiencias: temExperiencia ? form.outrasExperiencias : '',
      };
      const res = await salvarCurriculo(payload);
      if (foto) {
        try { await uploadFotoCurriculo(payload.cpf, foto); } catch { /* foto falhou, não bloqueia */ }
      }
      setEtapa('sucesso');
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao salvar. Tente novamente.';
      setErros({ geral: msg });
    } finally {
      setSalvando(false);
    }
  }

  // ─── Foto ─────────────────────────────────────────────────────────────────
  function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
  }
  async function abrirCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(s);
      setCameraAberta(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch { alert('Não foi possível acessar a câmera.'); }
  }
  function fecharCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null); setCameraAberta(false);
  }
  function tirarFoto() {
    const canvas = canvasRef.current, video = videoRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      setFoto(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
      setFotoPreview(URL.createObjectURL(blob));
      fecharCamera();
    }, 'image/jpeg', 0.85);
  }

  // ─── CEP ──────────────────────────────────────────────────────────────────
  async function buscarCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepCarregando(true); setCepErro('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepErro('CEP não encontrado'); return; }
      setForm(f => ({ ...f, rua: data.logradouro || f.rua, bairro: data.bairro || f.bairro, cidade: data.localidade || f.cidade, uf: data.uf || f.uf }));
    } catch { setCepErro('Erro ao buscar CEP'); }
    finally { setCepCarregando(false); }
  }

  // ─── TELA: CPF ────────────────────────────────────────────────────────────
  if (etapa === 'cpf') return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-green-600" size={36} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Trabalhe conosco</h1>
          <p className="text-green-700 font-medium mt-1">Hardt Doces e Salgados</p>
          <p className="text-gray-400 text-sm">Pirabeiraba, Joinville — desde 2007</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Digite seu CPF para começar</label>
            <input type="text" inputMode="numeric" maxLength={14}
              value={cpfInput}
              onChange={e => setCpfInput(formatarCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && verificarCpf()}
              placeholder="000.000.000-00"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500" />
            {cpfErro && <p className="text-red-500 text-sm mt-1 text-center">⚠ {cpfErro}</p>}
          </div>
          <button onClick={verificarCpf} disabled={cpfCarregando}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2">
            {cpfCarregando ? 'Verificando...' : <><span>Continuar</span> <ChevronRight size={18} /></>}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Se já enviou seu currículo, seus dados serão carregados para edição.</p>
      </div>
    </div>
  );

  // ─── TELA: FORMULÁRIO ─────────────────────────────────────────────────────
  if (etapa === 'formulario') return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setEtapa('cpf')} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{editando ? 'Atualizar currículo' : 'Preencha seu currículo'}</h1>
              {editando && <p className="text-xs text-green-700">Encontramos um currículo com este CPF. Atualize seus dados.</p>}
            </div>
          </div>

          <div className="space-y-5">
            {/* ── FOTO ── */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Foto (opcional)</p>
              {cameraAberta ? (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 object-cover" />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={fecharCamera} className={btnOutline}>Cancelar</button>
                    <button onClick={tirarFoto}
                      className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                      <Camera size={16} /> Tirar foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {fotoPreview
                    ? <div className="relative shrink-0">
                        <img src={fotoPreview} alt="Foto" className="w-20 h-20 rounded-full object-cover border-2 border-green-300" />
                        <button onClick={() => { setFoto(null); setFotoPreview(null); }}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={12} /></button>
                      </div>
                    : <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-dashed border-green-300 flex items-center justify-center shrink-0">
                        <User size={28} className="text-green-300" />
                      </div>
                  }
                  <div className="flex gap-2 flex-1">
                    <button onClick={abrirCamera}
                      className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 hover:border-green-500 hover:text-green-700">
                      <Camera size={15} /> Câmera
                    </button>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 hover:border-green-500 hover:text-green-700">
                      <Upload size={15} /> Galeria
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleArquivo} />
                  </div>
                </div>
              )}
            </div>

            {/* ── DADOS PESSOAIS ── */}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1">Dados pessoais</h2>

            <Campo label="Nome completo" obrigatorio erro={erros.nome}>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                onBlur={e => validarCampo('nome', e.target.value)}
                placeholder="Nome e sobrenome" className={inputCls(erros.nome)} />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="CPF" obrigatorio>
                <input value={form.cpf} readOnly className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-gray-500 text-sm cursor-not-allowed" />
              </Campo>
              <Campo label="Data de nascimento" obrigatorio erro={erros.dataNascimento}>
                <input type="date" value={form.dataNascimento}
                  onChange={e => setForm(f => ({ ...f, dataNascimento: e.target.value }))}
                  onBlur={e => validarCampo('dataNascimento', e.target.value)}
                  className={inputCls(erros.dataNascimento)} />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="WhatsApp" obrigatorio erro={erros.whatsapp}>
                <input type="tel" inputMode="numeric" maxLength={15} value={form.whatsapp}
                  onChange={e => setForm(f => ({ ...f, whatsapp: formatarWhatsApp(e.target.value) }))}
                  onBlur={e => validarCampo('whatsapp', e.target.value)}
                  placeholder="(47) 99999-9999" className={inputCls(erros.whatsapp)} />
              </Campo>
              <Campo label="E-mail" erro={erros.email}>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  onBlur={e => validarCampo('email', e.target.value)}
                  placeholder="seu@email.com" className={inputCls(erros.email)} />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Estado civil">
                <select value={form.estadoCivil} onChange={e => setForm(f => ({ ...f, estadoCivil: e.target.value }))} className={selectCls}>
                  <option value="">Selecione</option>
                  {ESTADOS_CIVIS.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
              <Campo label="Tem filhos?">
                <select value={form.temFilhos} onChange={e => setForm(f => ({ ...f, temFilhos: e.target.value }))} className={selectCls}>
                  <option value="">Selecione</option>
                  {FILHOS.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
            </div>

            <Campo label="Naturalidade">
              <input value={form.naturalidade} onChange={e => setForm(f => ({ ...f, naturalidade: e.target.value }))}
                placeholder="Cidade e Estado onde nasceu" className={inputCls(false)} />
            </Campo>

            {/* ── ENDEREÇO ── */}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1 pt-1">Endereço</h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Campo label="CEP">
                <div className="relative">
                  <input value={form.cep} inputMode="numeric" maxLength={9}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').slice(0, 9);
                      setForm(f => ({ ...f, cep: v }));
                      if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                    }}
                    placeholder="00000-000" className={inputCls(cepErro)} />
                  {cepCarregando && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>}
                </div>
                {cepErro && <p className="text-red-500 text-xs mt-1">⚠ {cepErro}</p>}
              </Campo>
              <Campo label="Número">
                <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="123" className={inputCls(false)} />
              </Campo>
              <Campo label="UF">
                <input value={form.uf} maxLength={2}
                  onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SC" className={inputCls(false)} />
              </Campo>
            </div>
            <Campo label="Rua / Logradouro">
              <input value={form.rua} onChange={e => setForm(f => ({ ...f, rua: e.target.value }))}
                placeholder="Preenchido pelo CEP — edite se necessário" className={inputCls(false)} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Bairro">
                <input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))}
                  placeholder="Preenchido pelo CEP" className={inputCls(false)} />
              </Campo>
              <Campo label="Cidade">
                <input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                  placeholder="Preenchido pelo CEP" className={inputCls(false)} />
              </Campo>
            </div>

            {/* ── DISPONIBILIDADE ── */}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1 pt-1">Disponibilidade</h2>

            <Campo label="Área de interesse" obrigatorio erro={erros.areaInteresse}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {AREAS.map(a => (
                  <button key={a} type="button" onClick={() => setForm(f => ({ ...f, areaInteresse: a }))}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition ${form.areaInteresse === a ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:border-green-500'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Horário disponível para início">
                <select value={form.horarioInicio} onChange={e => setForm(f => ({ ...f, horarioInicio: e.target.value }))} className={selectCls}>
                  <option value="">Selecione</option>
                  {HORARIOS_INICIO.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
              <Campo label="Disponível para horas extras?">
                <select value={form.horasExtras} onChange={e => setForm(f => ({ ...f, horasExtras: e.target.value }))} className={selectCls}>
                  <option value="">Selecione</option>
                  <option>Sim</option><option>Não</option>
                </select>
              </Campo>
            </div>

            <Campo label="Disponibilidade de horário">
              <select value={form.disponibilidade} onChange={e => setForm(f => ({ ...f, disponibilidade: e.target.value }))} className={selectCls}>
                <option value="">Selecione</option>
                {DISPONIBILIDADES.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>

            {/* ── EXPERIÊNCIA ── */}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1 pt-1">Experiência profissional</h2>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Já trabalhou em alguma empresa ou lugar?</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setTemExperiencia(true)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${temExperiencia === true ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:border-green-500'}`}>
                  Sim
                </button>
                <button type="button" onClick={() => setTemExperiencia(false)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${temExperiencia === false ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:border-green-500'}`}>
                  Não
                </button>
              </div>
            </div>

            {temExperiencia === true && (<>
              <Campo label="Últimos empregos com registro">
                <textarea value={form.empregosRegistrados}
                  onChange={e => setForm(f => ({ ...f, empregosRegistrados: e.target.value }))}
                  rows={3} placeholder="Empresa, cargo, período e motivo da saída"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none" />
              </Campo>
              <Campo label="Trabalhos sem registro">
                <textarea value={form.empregosSemRegistro}
                  onChange={e => setForm(f => ({ ...f, empregosSemRegistro: e.target.value }))}
                  rows={2} placeholder="Trabalhos informais relevantes"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none" />
              </Campo>
              <Campo label="Outras experiências relevantes">
                <textarea value={form.outrasExperiencias}
                  onChange={e => setForm(f => ({ ...f, outrasExperiencias: e.target.value }))}
                  rows={2} placeholder="Cursos, habilidades ou outras informações"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none" />
              </Campo>
            </>)}

            {temExperiencia === false && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                Tudo bem! Estamos abertos a candidatos sem experiência prévia.
              </div>
            )}

            {erros.geral && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠ {erros.geral}</div>
            )}

            <button onClick={handleSalvar} disabled={salvando} className={btnPrimary}>
              {salvando ? 'Salvando...' : <>{editando ? 'Atualizar currículo' : 'Enviar currículo'} <ChevronRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── TELA: SUCESSO ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="text-green-600" size={40} />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          {editando ? 'Currículo atualizado!' : 'Currículo enviado!'}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Obrigado pelo interesse em trabalhar na Hardt Doces e Salgados. Analisaremos seu currículo e entraremos em contato pelo WhatsApp caso haja uma oportunidade.
        </p>
        <p className="text-green-600 font-semibold text-sm">Boa sorte!</p>
      </div>
    </div>
  );
}
