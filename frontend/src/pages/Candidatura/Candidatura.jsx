import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, CheckCircle, User, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { buscarCurriculoPorCpf, salvarCurriculo, uploadFotoCurriculo } from '../../services/curriculoService';

// ─── Helpers de validação ────────────────────────────────────────────────────
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
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
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

function Campo({ id, label, obrigatorio, children, erro }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
    </div>
  );
}

const CAMPO_LABEL = {
  nome: 'Nome completo', email: 'E-mail', whatsapp: 'WhatsApp', cpf: 'CPF',
  dataNascimento: 'Data de nascimento', estadoCivil: 'Estado civil',
  temFilhos: 'Tem filhos?', naturalidade: 'Naturalidade', endereco: 'Endereço completo',
  areaInteresse: 'Área de interesse', horarioInicio: 'Horário disponível para início',
  horasExtras: 'Disponível para horas extras?', disponibilidade: 'Disponibilidade de horário',
  empregosRegistrados: 'Últimos empregos com registro', empregosSemRegistro: 'Trabalhos sem registro',
  outrasExperiencias: 'Outras experiências relevantes',
};

const INICIAL = {
  nome: '', email: '', whatsapp: '', cpf: '', dataNascimento: '',
  estadoCivil: '', temFilhos: '', naturalidade: '',
  cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '',
  areaInteresse: '', horarioInicio: '', horasExtras: '', disponibilidade: '',
  empregosRegistrados: '', empregosSemRegistro: '', outrasExperiencias: '',
};

export default function Candidatura() {
  const [etapa, setEtapa] = useState('cpf'); // cpf | formulario | foto | sucesso
  const [cpfInput, setCpfInput] = useState('');
  const [cpfErro, setCpfErro] = useState('');
  const [cpfCarregando, setCpfCarregando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(INICIAL);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [foto, setFoto] = useState(null); // File object
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadandoFoto, setUploadandoFoto] = useState(false);
  const [curriculoId, setCurriculoId] = useState(null);
  const [temExperiencia, setTemExperiencia] = useState(null); // null | true | false

  const fileInputRef = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const [camerAberta, setCameraAberta] = useState(false);
  const [stream, setStream] = useState(null);

  // ─── Etapa CPF ─────────────────────────────────────────────────────────────
  async function verificarCpf() {
    const cpfLimpo = cpfInput.replace(/\D/g, '');
    if (!validarCPF(cpfLimpo)) { setCpfErro('CPF inválido'); return; }
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

  // ─── Validação do formulário ────────────────────────────────────────────────
  function validar() {
    const e = {};
    if (!form.nome.trim() || form.nome.trim().split(/\s+/).length < 2)
      e.nome = 'Informe nome e sobrenome';
    const wa = form.whatsapp.replace(/\D/g, '');
    if (wa.length < 10 || wa.length > 11) e.whatsapp = 'WhatsApp inválido';
    if (!validarCPF(form.cpf.replace(/\D/g, ''))) e.cpf = 'CPF inválido';
    if (!form.dataNascimento) e.dataNascimento = 'Data de nascimento obrigatória';
    else if (calcularIdade(form.dataNascimento) < 18) e.dataNascimento = 'É necessário ter ao menos 18 anos';
    if (!form.areaInteresse) e.areaInteresse = 'Selecione uma área de interesse';
    setErros(e);
    return Object.keys(e).length === 0;
  }

  // ─── Salvar formulário ──────────────────────────────────────────────────────
  async function handleSalvar() {
    if (!validar()) return;
    setSalvando(true);
    try {
      const partes = [
        form.rua,
        form.numero,
        form.bairro,
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
      setCurriculoId(res.curriculo.id);
      setEtapa('foto');
    } catch (err) {
      const msg = err.response?.data?.erro || 'Erro ao salvar. Tente novamente.';
      setErros({ geral: msg });
    } finally {
      setSalvando(false);
    }
  }

  // ─── Foto: upload de arquivo ─────────────────────────────────────────────
  function handleArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  // ─── Foto: câmera ────────────────────────────────────────────────────────
  async function abrirCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(s);
      setCameraAberta(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch {
      alert('Não foi possível acessar a câmera.');
    }
  }
  function fecharCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setCameraAberta(false);
  }
  function tirarFoto() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      setFoto(file);
      setFotoPreview(URL.createObjectURL(blob));
      fecharCamera();
    }, 'image/jpeg', 0.85);
  }

  // ─── Upload foto e finalizar ──────────────────────────────────────────────
  async function handleFinalizarComFoto() {
    const cpfLimpo = form.cpf.replace(/\D/g, '');
    if (foto) {
      setUploadandoFoto(true);
      try {
        await uploadFotoCurriculo(cpfLimpo, foto);
      } catch { /* ignora erro de foto, não bloqueia */ }
      setUploadandoFoto(false);
    }
    setEtapa('sucesso');
  }

  // ─── Busca CEP ───────────────────────────────────────────────────────────────
  const [cepCarregando, setCepCarregando] = useState(false);
  const [cepErro, setCepErro] = useState('');

  async function buscarCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepCarregando(true);
    setCepErro('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepErro('CEP não encontrado'); return; }
      setForm(f => ({
        ...f,
        rua: data.logradouro || f.rua,
        bairro: data.bairro || f.bairro,
        cidade: data.localidade || f.cidade,
        uf: data.uf || f.uf,
      }));
    } catch { setCepErro('Erro ao buscar CEP'); }
    finally { setCepCarregando(false); }
  }

  function pularFoto() { setEtapa('sucesso'); }

  // ─── Render: CPF ───────────────────────────────────────────────────────────
  if (etapa === 'cpf') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-orange-500" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Trabalhe conosco</h1>
          <p className="text-gray-500 mt-2 text-sm">Hardt Salgados — Pirabeiraba, Joinville</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Digite seu CPF para começar
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={14}
              value={cpfInput}
              onChange={e => setCpfInput(formatarCPF(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && verificarCpf()}
              placeholder="000.000.000-00"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {cpfErro && <p className="text-red-500 text-sm mt-1 text-center">{cpfErro}</p>}
          </div>

          <button
            onClick={verificarCpf}
            disabled={cpfCarregando}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            {cpfCarregando ? 'Verificando...' : (<>Continuar <ChevronRight size={18} /></>)}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Se já enviou seu currículo antes, seus dados serão carregados para edição.
        </p>
      </div>
    </div>
  );

  // ─── Render: Formulário ────────────────────────────────────────────────────
  if (etapa === 'formulario') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-4">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setEtapa('cpf')} className="text-gray-400 hover:text-gray-600">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                {editando ? 'Atualizar currículo' : 'Preencha seu currículo'}
              </h1>
              {editando && <p className="text-xs text-orange-600">Encontramos um currículo com este CPF. Você pode atualizar os dados.</p>}
            </div>
          </div>

          <div className="space-y-5">
            {/* Dados pessoais */}
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">Dados pessoais</h2>

            <Campo id="nome" label={CAMPO_LABEL.nome} obrigatorio erro={erros.nome}>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome e sobrenome"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo id="cpf" label={CAMPO_LABEL.cpf} obrigatorio erro={erros.cpf}>
                <input value={form.cpf} readOnly
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-gray-500 cursor-not-allowed" />
              </Campo>
              <Campo id="dataNascimento" label={CAMPO_LABEL.dataNascimento} obrigatorio erro={erros.dataNascimento}>
                <input type="date" value={form.dataNascimento}
                  onChange={e => setForm(f => ({ ...f, dataNascimento: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo id="whatsapp" label={CAMPO_LABEL.whatsapp} obrigatorio erro={erros.whatsapp}>
                <input type="tel" value={form.whatsapp} inputMode="numeric" maxLength={15}
                  onChange={e => setForm(f => ({ ...f, whatsapp: formatarWhatsApp(e.target.value) }))}
                  placeholder="(47) 99999-9999"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
              <Campo id="email" label={CAMPO_LABEL.email}>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="seu@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo id="estadoCivil" label={CAMPO_LABEL.estadoCivil}>
                <select value={form.estadoCivil} onChange={e => setForm(f => ({ ...f, estadoCivil: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione</option>
                  {ESTADOS_CIVIS.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
              <Campo id="temFilhos" label={CAMPO_LABEL.temFilhos}>
                <select value={form.temFilhos} onChange={e => setForm(f => ({ ...f, temFilhos: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione</option>
                  {FILHOS.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
            </div>

            <Campo id="naturalidade" label={CAMPO_LABEL.naturalidade}>
              <input value={form.naturalidade} onChange={e => setForm(f => ({ ...f, naturalidade: e.target.value }))}
                placeholder="Cidade e Estado onde nasceu"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </Campo>

            {/* CEP com busca automática */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Campo id="cep" label="CEP">
                <div className="relative">
                  <input
                    value={form.cep}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').slice(0, 9);
                      setForm(f => ({ ...f, cep: v }));
                      if (v.replace(/\D/g, '').length === 8) buscarCep(v);
                    }}
                    placeholder="00000-000"
                    inputMode="numeric"
                    maxLength={9}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {cepCarregando && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">buscando...</span>}
                </div>
                {cepErro && <p className="text-red-500 text-xs mt-1">{cepErro}</p>}
              </Campo>
              <Campo id="numero" label="Número">
                <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                  placeholder="Ex: 123"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
              <Campo id="uf" label="UF">
                <input value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SC"
                  maxLength={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
            </div>
            <Campo id="rua" label="Rua / Logradouro">
              <input value={form.rua} onChange={e => setForm(f => ({ ...f, rua: e.target.value }))}
                placeholder="Preenchido automaticamente pelo CEP"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo id="bairro" label="Bairro">
                <input value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))}
                  placeholder="Preenchido pelo CEP"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
              <Campo id="cidade" label="Cidade">
                <input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                  placeholder="Preenchido pelo CEP"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </Campo>
            </div>

            {/* Disponibilidade */}
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-1 pt-2">Disponibilidade</h2>

            <Campo id="areaInteresse" label={CAMPO_LABEL.areaInteresse} obrigatorio erro={erros.areaInteresse}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AREAS.map(a => (
                  <button key={a} type="button"
                    onClick={() => setForm(f => ({ ...f, areaInteresse: a }))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${form.areaInteresse === a ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-300 text-gray-700 hover:border-orange-400'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo id="horarioInicio" label={CAMPO_LABEL.horarioInicio}>
                <select value={form.horarioInicio} onChange={e => setForm(f => ({ ...f, horarioInicio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione</option>
                  {HORARIOS_INICIO.map(v => <option key={v}>{v}</option>)}
                </select>
              </Campo>
              <Campo id="horasExtras" label={CAMPO_LABEL.horasExtras}>
                <select value={form.horasExtras} onChange={e => setForm(f => ({ ...f, horasExtras: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">Selecione</option>
                  <option>Sim</option><option>Não</option>
                </select>
              </Campo>
            </div>

            <Campo id="disponibilidade" label={CAMPO_LABEL.disponibilidade}>
              <select value={form.disponibilidade} onChange={e => setForm(f => ({ ...f, disponibilidade: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">Selecione</option>
                {DISPONIBILIDADES.map(v => <option key={v}>{v}</option>)}
              </select>
            </Campo>

            {/* Experiência */}
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide border-b pb-1 pt-2">Experiência profissional</h2>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Já trabalhou em alguma empresa ou lugar?</p>
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => setTemExperiencia(true)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${temExperiencia === true ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-300 text-gray-700 hover:border-orange-400'}`}>
                  Sim
                </button>
                <button type="button"
                  onClick={() => setTemExperiencia(false)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${temExperiencia === false ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-300 text-gray-700 hover:border-orange-400'}`}>
                  Não
                </button>
              </div>
            </div>

            {temExperiencia === true && (
              <>
                <Campo id="empregosRegistrados" label={CAMPO_LABEL.empregosRegistrados}>
                  <textarea value={form.empregosRegistrados}
                    onChange={e => setForm(f => ({ ...f, empregosRegistrados: e.target.value }))}
                    rows={3} placeholder="Empresa, cargo, período e motivo da saída"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </Campo>

                <Campo id="empregosSemRegistro" label={CAMPO_LABEL.empregosSemRegistro}>
                  <textarea value={form.empregosSemRegistro}
                    onChange={e => setForm(f => ({ ...f, empregosSemRegistro: e.target.value }))}
                    rows={2} placeholder="Trabalhos informais relevantes"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </Campo>

                <Campo id="outrasExperiencias" label={CAMPO_LABEL.outrasExperiencias}>
                  <textarea value={form.outrasExperiencias}
                    onChange={e => setForm(f => ({ ...f, outrasExperiencias: e.target.value }))}
                    rows={2} placeholder="Cursos, habilidades ou outras informações relevantes"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                </Campo>
              </>
            )}

            {temExperiencia === false && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-700">
                Tudo bem! Estamos abertos a candidatos sem experiência prévia.
              </div>
            )}

            {erros.geral && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{erros.geral}</div>
            )}

            <button onClick={handleSalvar} disabled={salvando}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-base mt-2">
              {salvando ? 'Salvando...' : (<>{editando ? 'Atualizar currículo' : 'Salvar e continuar'} <ChevronRight size={18} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Render: Foto ──────────────────────────────────────────────────────────
  if (etapa === 'foto') return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-800 mb-2 text-center">Adicione uma foto</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Opcional, mas ajuda na identificação durante a entrevista.</p>

        {camerAberta ? (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full" />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex gap-3">
              <button onClick={fecharCamera}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium">
                Cancelar
              </button>
              <button onClick={tirarFoto}
                className="flex-1 bg-orange-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
                <Camera size={18} /> Tirar foto
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {fotoPreview ? (
              <div className="relative">
                <img src={fotoPreview} alt="Preview" className="w-40 h-40 object-cover rounded-full mx-auto border-4 border-orange-200" />
                <button onClick={() => { setFoto(null); setFotoPreview(null); }}
                  className="absolute top-0 right-1/2 translate-x-16 bg-red-500 text-white rounded-full p-1">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="w-40 h-40 bg-gray-100 rounded-full mx-auto flex items-center justify-center border-2 border-dashed border-gray-300">
                <User size={48} className="text-gray-300" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={abrirCamera}
                className="border border-gray-300 text-gray-700 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-50">
                <Camera size={18} /> Câmera
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="border border-gray-300 text-gray-700 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-50">
                <Upload size={18} /> Galeria
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleArquivo} />
            </div>

            <button onClick={handleFinalizarComFoto} disabled={uploadandoFoto}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3.5 rounded-xl transition">
              {uploadandoFoto ? 'Enviando...' : foto ? 'Enviar foto e finalizar' : 'Finalizar sem foto'}
            </button>

            {!foto && (
              <button onClick={pularFoto} className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition">
                Pular esta etapa
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render: Sucesso ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="text-green-500" size={40} />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-3">
          {editando ? 'Currículo atualizado!' : 'Currículo enviado!'}
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Obrigado pelo interesse em trabalhar na Hardt Salgados. Analisaremos seu currículo e entraremos em contato pelo WhatsApp caso haja uma oportunidade.
        </p>
        <p className="text-orange-500 font-medium text-sm">Boa sorte! 🍀</p>
      </div>
    </div>
  );
}
