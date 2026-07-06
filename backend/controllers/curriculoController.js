const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const webhookService = require('../services/webhookService');

const prisma = require('../config/database'); // singleton compartilhado (pool único)

// ─── Verificação de acesso do candidato ao próprio currículo ────────────────
// O candidato prova que é dono do CPF recebendo um código no WhatsApp CADASTRADO.
// Sem isso, qualquer um veria/editaria dados pessoais só digitando o CPF (LGPD).
const JWT_SECRET = require('../config/jwtSecret');
const ACESSO_TTL_MIN = 30;          // validade do código
const ACESSO_MAX_TENTATIVAS = 5;    // erros de código antes de exigir novo
const ACESSO_REENVIO_SEG = 60;      // intervalo mínimo entre envios (anti-spam)
const _ultimoEnvioAcesso = new Map(); // cpf -> timestamp do último envio (em memória)

// Máscara do telefone para exibir sem vazar o número inteiro: (47) •••••-••89
function mascararTelefone(tel) {
  const n = (tel || '').replace(/\D/g, '');
  if (n.length < 4) return '••••';
  const ddd = n.length >= 10 ? n.slice(0, 2) : '••';
  return `(${ddd}) •••••-••${n.slice(-2)}`;
}

// Token curto que autoriza editar o currículo daquele CPF (salvar/foto)
function emitirTokenEdicao(cpf) {
  return jwt.sign({ tipo: 'curriculo_edit', cpf }, JWT_SECRET, { expiresIn: '40m' });
}
function tokenEdicaoValido(req, cpf) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return false;
  try {
    const d = jwt.verify(t, JWT_SECRET);
    return d.tipo === 'curriculo_edit' && d.cpf === cpf;
  } catch { return false; }
}

// Campos do currículo devolvidos ao candidato (nunca inclui os campos de acesso)
function curriculoPublico(c) {
  return {
    id: c.id, nome: c.nome, email: c.email, whatsapp: c.whatsapp, cpf: c.cpf,
    dataNascimento: c.dataNascimento, estadoCivil: c.estadoCivil, temFilhos: c.temFilhos,
    naturalidade: c.naturalidade, endereco: c.endereco, foto: c.foto,
    areaInteresse: c.areaInteresse, horarioInicio: c.horarioInicio, horasExtras: c.horasExtras,
    disponibilidade: c.disponibilidade, empregosRegistrados: c.empregosRegistrados,
    empregosSemRegistro: c.empregosSemRegistro, outrasExperiencias: c.outrasExperiencias,
  };
}

// ─── Multer config para fotos de currículo ─────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'curriculos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `curriculo_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// ─── Status permitidos ──────────────────────────────────────────────────────
const STATUS_VALIDOS = [
  'Novo',
  'Editado',
  'Em Análise',
  'Entrevista',
  'Agendado',
  'Entrevistado',
  'Aprovado',
  'Contratado',
  'Não Qualificado',
  'Rejeitado',
  'Desistiu',
  'Não Disponível',
];

// ─── Validação CPF ──────────────────────────────────────────────────────────
function validarCPF(cpf) {
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11 || /^(\d)\1{10}$/.test(nums)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(nums[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(nums[10]);
}

// ─── PUBLIC: Solicitar acesso — envia código ao WhatsApp cadastrado ─────────
// NÃO devolve nenhum dado pessoal. Se o CPF não existe, o front segue como novo cadastro.
async function solicitarAcesso(req, res) {
  const cpf = (req.body.cpf || '').replace(/\D/g, '');
  if (!validarCPF(cpf)) return res.status(400).json({ erro: 'CPF inválido' });

  const curriculo = await prisma.curriculo.findUnique({
    where: { cpf },
    select: { id: true, nome: true, whatsapp: true },
  });
  if (!curriculo) return res.json({ existe: false });

  const telefoneMascarado = mascararTelefone(curriculo.whatsapp);
  const agora = Date.now();
  const ultimo = _ultimoEnvioAcesso.get(cpf) || 0;

  // Anti-spam: se já enviou há menos de 60s, não reenvia (o código anterior segue válido)
  if (agora - ultimo < ACESSO_REENVIO_SEG * 1000) {
    return res.json({ existe: true, enviado: true, telefoneMascarado });
  }

  const codigo = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 caracteres
  await prisma.curriculo.update({
    where: { cpf },
    data: {
      acessoCodigo: codigo,
      acessoCodigoExp: new Date(agora + ACESSO_TTL_MIN * 60 * 1000),
      acessoTentativas: 0,
    },
  });
  _ultimoEnvioAcesso.set(cpf, agora);

  const primeiroNome = (curriculo.nome || '').split(' ')[0] || 'Candidato';
  const msg = `Olá, *${primeiroNome}*! 🔐\n\nSeu código para acessar e editar seu currículo na *Hardt* é:\n\n*${codigo}*\n\nVálido por ${ACESSO_TTL_MIN} minutos. Se não foi você, ignore esta mensagem.`;
  const r = await webhookService.enviarMensagemCustom(curriculo.whatsapp, primeiroNome, msg);
  if (!r.ok) console.error('[curriculo] falha ao enviar código de acesso:', r.motivo);

  return res.json({ existe: true, enviado: !!r.ok, telefoneMascarado });
}

// ─── PUBLIC: Validar código — devolve o currículo + token de edição ─────────
async function validarAcesso(req, res) {
  const cpf = (req.body.cpf || '').replace(/\D/g, '');
  const codigo = String(req.body.codigo || '').trim().toUpperCase();
  if (!validarCPF(cpf) || !codigo) return res.status(400).json({ erro: 'Informe o código recebido.' });

  const c = await prisma.curriculo.findUnique({ where: { cpf } });
  if (!c) return res.status(404).json({ erro: 'Currículo não encontrado.' });

  if (!c.acessoCodigo || !c.acessoCodigoExp || c.acessoCodigoExp < new Date()) {
    return res.status(400).json({ erro: 'Código expirado. Solicite um novo.', expirado: true });
  }
  if ((c.acessoTentativas || 0) >= ACESSO_MAX_TENTATIVAS) {
    return res.status(429).json({ erro: 'Muitas tentativas. Solicite um novo código.', bloqueado: true });
  }
  if (c.acessoCodigo !== codigo) {
    await prisma.curriculo.update({ where: { cpf }, data: { acessoTentativas: { increment: 1 } } });
    return res.status(401).json({ erro: 'Código incorreto.' });
  }

  // Sucesso: consome o código e emite o token de edição
  await prisma.curriculo.update({
    where: { cpf },
    data: { acessoCodigo: null, acessoCodigoExp: null, acessoTentativas: 0 },
  });
  return res.json({ curriculo: curriculoPublico(c), token: emitirTokenEdicao(cpf) });
}

// ─── PUBLIC: Criar ou atualizar currículo ───────────────────────────────────
async function salvar(req, res) {
  const {
    nome, email, whatsapp, cpf, dataNascimento, estadoCivil,
    temFilhos, naturalidade, endereco, areaInteresse, horarioInicio,
    horasExtras, disponibilidade, empregosRegistrados,
    empregosSemRegistro, outrasExperiencias,
  } = req.body;

  // Validações
  if (!nome || nome.trim().split(/\s+/).length < 2)
    return res.status(400).json({ erro: 'Informe nome e sobrenome' });

  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  if (!validarCPF(cpfLimpo))
    return res.status(400).json({ erro: 'CPF inválido' });

  const whatsappLimpo = (whatsapp || '').replace(/\D/g, '');
  if (whatsappLimpo.length < 10 || whatsappLimpo.length > 11)
    return res.status(400).json({ erro: 'WhatsApp inválido' });

  if (!dataNascimento) return res.status(400).json({ erro: 'Data de nascimento obrigatória' });
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  const idade = hoje.getFullYear() - nascimento.getFullYear()
    - (hoje < new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate()) ? 1 : 0);
  if (idade < 18)
    return res.status(400).json({ erro: 'É necessário ter ao menos 18 anos' });

  if (!areaInteresse) return res.status(400).json({ erro: 'Área de interesse obrigatória' });

  const dados = {
    nome: nome.trim(),
    email: email?.trim() || null,
    whatsapp: whatsappLimpo,
    cpf: cpfLimpo,
    dataNascimento: nascimento,
    estadoCivil: estadoCivil || null,
    temFilhos: temFilhos || null,
    naturalidade: naturalidade?.trim() || null,
    endereco: endereco?.trim() || null,
    areaInteresse,
    horarioInicio: horarioInicio || null,
    horasExtras: horasExtras || null,
    disponibilidade: disponibilidade || null,
    empregosRegistrados: empregosRegistrados?.trim() || null,
    empregosSemRegistro: empregosSemRegistro?.trim() || null,
    outrasExperiencias: outrasExperiencias?.trim() || null,
  };

  try {
    const existente = await prisma.curriculo.findUnique({ where: { cpf: cpfLimpo } });

    if (existente) {
      // Só edita um currículo já existente quem validou o código do WhatsApp.
      // Impede sobrescrever/adulterar dados (inclusive trocar o WhatsApp) só com o CPF.
      if (!tokenEdicaoValido(req, cpfLimpo)) {
        return res.status(401).json({ erro: 'Para editar um currículo existente, valide o código enviado ao seu WhatsApp.' });
      }
      const agora = new Date();
      const atualizado = await prisma.curriculo.update({
        where: { cpf: cpfLimpo },
        data: {
          ...dados,
          status: 'Editado',
          criadoEm: agora,
          atualizadoEm: agora,
        },
      });
      return res.json({ curriculo: curriculoPublico(atualizado), editado: true, token: emitirTokenEdicao(cpfLimpo) });
    }

    const novo = await prisma.curriculo.create({ data: { ...dados, status: 'Novo' } });
    // Token para o candidato recém-criado poder anexar a foto em seguida.
    return res.status(201).json({ curriculo: curriculoPublico(novo), editado: false, token: emitirTokenEdicao(cpfLimpo) });
  } catch (err) {
    console.error('[salvar curriculo]', err);
    return res.status(500).json({ erro: err.message || 'Erro interno ao salvar currículo' });
  }
}

// ─── PUBLIC: Upload de foto ─────────────────────────────────────────────────
async function uploadFoto(req, res) {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada' });

  const cpfLimpo = (req.body.cpf || '').replace(/\D/g, '');
  if (!cpfLimpo) return res.status(400).json({ erro: 'CPF obrigatório' });

  // Exige o token de edição (obtido ao criar o currículo ou validar o código).
  if (!tokenEdicaoValido(req, cpfLimpo)) {
    return res.status(401).json({ erro: 'Sessão de edição necessária para enviar a foto.' });
  }

  const curriculo = await prisma.curriculo.findUnique({ where: { cpf: cpfLimpo } });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  // Remove foto antiga se existir
  if (curriculo.foto) {
    const fotoAntiga = path.join(__dirname, '..', 'uploads', curriculo.foto);
    if (fs.existsSync(fotoAntiga)) fs.unlinkSync(fotoAntiga);
  }

  const fotoPath = `curriculos/${req.file.filename}`;
  await prisma.curriculo.update({ where: { cpf: cpfLimpo }, data: { foto: fotoPath } });

  return res.json({ foto: fotoPath });
}

// ─── RH: Listar currículos ───────────────────────────────────────────────────
async function listar(req, res) {
  const {
    status, areaInteresse, busca,
    pagina = '1', limite = '20',
  } = req.query;

  const skip = (parseInt(pagina) - 1) * parseInt(limite);
  const take = parseInt(limite);

  const where = {};
  if (status) {
    const arr = String(status).split(',').map(s => s.trim()).filter(Boolean);
    if (arr.length === 1) where.status = arr[0];
    else if (arr.length > 1) where.status = { in: arr };
  }
  if (areaInteresse) where.areaInteresse = areaInteresse;
  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { cpf: { contains: busca.replace(/\D/g, '') } },
      { whatsapp: { contains: busca.replace(/\D/g, '') } },
    ];
  }

  const [total, curriculos] = await Promise.all([
    prisma.curriculo.count({ where }),
    prisma.curriculo.findMany({
      where,
      skip,
      take,
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true, nome: true, whatsapp: true, cpf: true, foto: true,
        areaInteresse: true, disponibilidade: true, status: true,
        criadoEm: true, atualizadoEm: true,
        acessos: {
          orderBy: { acessadoEm: 'desc' },
          take: 1,
          select: { acessadoEm: true, vendedor: { select: { nome: true } } },
        },
      },
    }),
  ]);

  return res.json({ curriculos, total, pagina: parseInt(pagina), limite: take });
}

// ─── RH: Detalhe do currículo ─────────────────────────────────────────────
async function detalhe(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const curriculo = await prisma.curriculo.findUnique({
    where: { id },
    include: {
      acessos: {
        orderBy: { acessadoEm: 'desc' },
        include: { vendedor: { select: { id: true, nome: true } } },
      },
      historico: {
        orderBy: { criadoEm: 'desc' },
        include: { vendedor: { select: { id: true, nome: true } } },
      },
    },
  });

  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  // Registra acesso
  await prisma.curriculoAcesso.create({
    data: { curriculoId: id, vendedorId: req.user.id },
  });

  // Se ainda for "Novo" ou "Editado", muda para "Em Análise" automaticamente
  if (curriculo.status === 'Novo' || curriculo.status === 'Editado') {
    await prisma.curriculo.update({ where: { id }, data: { status: 'Em Análise' } });
    curriculo.status = 'Em Análise';
  }

  return res.json(curriculo);
}

// ─── RH: Atualizar status / observação / dados do candidato ──────────────
const CAMPOS_DADOS = [
  'nome', 'email', 'whatsapp', 'dataNascimento', 'estadoCivil', 'temFilhos',
  'naturalidade', 'endereco', 'areaInteresse', 'horarioInicio', 'horasExtras',
  'disponibilidade', 'empregosRegistrados', 'empregosSemRegistro', 'outrasExperiencias',
];

async function atualizar(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const { status, observacao } = req.body;
  const curriculo = await prisma.curriculo.findUnique({ where: { id } });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  if (status && !STATUS_VALIDOS.includes(status))
    return res.status(400).json({ erro: 'Status inválido' });

  // Validações dos dados (só quando fornecidos)
  if (req.body.nome !== undefined) {
    if (!req.body.nome || req.body.nome.trim().split(/\s+/).length < 2)
      return res.status(400).json({ erro: 'Informe nome e sobrenome' });
  }
  if (req.body.whatsapp !== undefined) {
    const w = (req.body.whatsapp || '').replace(/\D/g, '');
    if (w.length < 10 || w.length > 11)
      return res.status(400).json({ erro: 'WhatsApp inválido' });
  }
  if (req.body.dataNascimento !== undefined && req.body.dataNascimento) {
    const d = new Date(req.body.dataNascimento);
    if (isNaN(d.getTime())) return res.status(400).json({ erro: 'Data de nascimento inválida' });
  }
  if (req.body.areaInteresse !== undefined && !req.body.areaInteresse) {
    return res.status(400).json({ erro: 'Área de interesse obrigatória' });
  }

  const historicos = [];
  const dataToUpdate = { dataAlteracao: new Date() };

  if (status && status !== curriculo.status) {
    historicos.push({
      curriculoId: id, vendedorId: req.user.id, campo: 'status',
      valorAntes: curriculo.status, valorDepois: status,
    });
    dataToUpdate.status = status;
  }

  if (observacao !== undefined && observacao !== curriculo.observacao) {
    historicos.push({
      curriculoId: id, vendedorId: req.user.id, campo: 'observacao',
      valorAntes: curriculo.observacao, valorDepois: observacao,
    });
    dataToUpdate.observacao = observacao;
  }

  // Atualiza campos do candidato (apenas os enviados)
  const camposAlterados = [];
  for (const k of CAMPOS_DADOS) {
    if (req.body[k] === undefined) continue;
    let novo = req.body[k];
    if (typeof novo === 'string') novo = novo.trim();
    let valor = novo;
    let antigoCmp = curriculo[k];
    if (k === 'whatsapp') {
      valor = (novo || '').replace(/\D/g, '');
    } else if (k === 'dataNascimento') {
      valor = novo ? new Date(novo) : curriculo.dataNascimento;
      const novoStr = valor ? new Date(valor).toISOString().slice(0, 10) : null;
      const antigoStr = curriculo.dataNascimento ? new Date(curriculo.dataNascimento).toISOString().slice(0, 10) : null;
      if (novoStr !== antigoStr) camposAlterados.push(k);
      dataToUpdate[k] = valor;
      continue;
    } else if (['email', 'naturalidade', 'endereco', 'estadoCivil', 'temFilhos',
                'horarioInicio', 'horasExtras', 'disponibilidade',
                'empregosRegistrados', 'empregosSemRegistro', 'outrasExperiencias'].includes(k)) {
      valor = valor || null;
    }
    if ((valor || null) !== (antigoCmp || null)) camposAlterados.push(k);
    dataToUpdate[k] = valor;
  }

  if (camposAlterados.length > 0) {
    historicos.push({
      curriculoId: id, vendedorId: req.user.id, campo: 'dados',
      valorAntes: null, valorDepois: camposAlterados.join(', '),
    });
  }

  const atualizado = await prisma.curriculo.update({
    where: { id },
    data: dataToUpdate,
  });

  if (historicos.length > 0) {
    await prisma.curriculoHistorico.createMany({ data: historicos });
  }

  return res.json(atualizado);
}

// ─── RH: Enviar convite de entrevista via BotConversa ────────────────────
async function linkWhatsapp(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const curriculo = await prisma.curriculo.findUnique({
    where: { id },
    select: { id: true, nome: true, whatsapp: true, status: true },
  });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  const primeiroNome = curriculo.nome.split(' ')[0];
  const mensagem = `Olá *${primeiroNome}*! 👋\n\nSeu currículo foi analisado e você foi selecionado(a) para uma entrevista na *Hardt Salgados*. 🎉\n\nSe ainda tiver interesse, entre em contato para agendarmos seu horário.\n\n🕐 Atendemos de segunda a sexta, das *08:00 às 11:30* e das *13:30 às 17:30*.\n\nAguardamos seu retorno!`;

  // Atualiza status para Entrevista se ainda não estiver
  const statusNaoMudar = ['Entrevista', 'Agendado', 'Entrevistado', 'Aprovado', 'Contratado'];
  if (!statusNaoMudar.includes(curriculo.status)) {
    await prisma.curriculo.update({
      where: { id },
      data: { status: 'Entrevista', dataAlteracao: new Date() },
    });
    await prisma.curriculoHistorico.create({
      data: {
        curriculoId: id,
        vendedorId: req.user.id,
        campo: 'status',
        valorAntes: curriculo.status,
        valorDepois: 'Entrevista',
      },
    });
  }

  const resultado = await webhookService.enviarMensagemCustom(curriculo.whatsapp, primeiroNome, mensagem);
  if (!resultado.ok) {
    return res.status(500).json({ erro: resultado.motivo || 'Erro ao enviar mensagem' });
  }

  return res.json({ ok: true, mensagem });
}

// ─── RH: Excluir currículo ────────────────────────────────────────────────
async function excluir(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const curriculo = await prisma.curriculo.findUnique({ where: { id }, select: { id: true, foto: true } });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  // Remove arquivo de foto se existir
  if (curriculo.foto) {
    const fotoPath = path.join(__dirname, '..', 'uploads', curriculo.foto);
    if (fs.existsSync(fotoPath)) fs.unlinkSync(fotoPath);
  }

  await prisma.curriculo.delete({ where: { id } });
  return res.json({ ok: true });
}

// ─── RH: Contagem por status (dashboard) ─────────────────────────────────
async function contagens(req, res) {
  const grupos = await prisma.curriculo.groupBy({
    by: ['status'],
    _count: { status: true },
    orderBy: { _count: { status: 'desc' } },
  });
  const porArea = await prisma.curriculo.groupBy({
    by: ['areaInteresse'],
    _count: { areaInteresse: true },
    orderBy: { _count: { areaInteresse: 'desc' } },
  });
  return res.json({ porStatus: grupos, porArea });
}

module.exports = {
  upload,
  solicitarAcesso,
  validarAcesso,
  salvar,
  uploadFoto,
  listar,
  detalhe,
  atualizar,
  linkWhatsapp,
  excluir,
  contagens,
};
