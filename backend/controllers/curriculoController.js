const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

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

// ─── PUBLIC: Buscar currículo por CPF ───────────────────────────────────────
async function buscarPorCpf(req, res) {
  const cpf = (req.query.cpf || '').replace(/\D/g, '');
  if (!cpf) return res.status(400).json({ erro: 'CPF obrigatório' });

  const curriculo = await prisma.curriculo.findUnique({
    where: { cpf },
    select: {
      id: true, nome: true, email: true, whatsapp: true, cpf: true,
      dataNascimento: true, estadoCivil: true, temFilhos: true,
      naturalidade: true, endereco: true, foto: true,
      areaInteresse: true, horarioInicio: true, horasExtras: true,
      disponibilidade: true, empregosRegistrados: true,
      empregosSemRegistro: true, outrasExperiencias: true,
    },
  });

  if (!curriculo) return res.json({ existe: false });
  return res.json({ existe: true, curriculo });
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
      const atualizado = await prisma.curriculo.update({
        where: { cpf: cpfLimpo },
        data: { ...dados, atualizadoEm: new Date() },
      });
      return res.json({ curriculo: atualizado, editado: true });
    }

    const novo = await prisma.curriculo.create({ data: { ...dados, status: 'Novo' } });
    return res.status(201).json({ curriculo: novo, editado: false });
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
  if (status) where.status = status;
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

  // Se ainda for "Novo", muda para "Em Análise" automaticamente
  if (curriculo.status === 'Novo') {
    await prisma.curriculo.update({ where: { id }, data: { status: 'Em Análise' } });
    curriculo.status = 'Em Análise';
  }

  return res.json(curriculo);
}

// ─── RH: Atualizar status / observação ────────────────────────────────────
async function atualizar(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const { status, observacao } = req.body;

  const curriculo = await prisma.curriculo.findUnique({ where: { id } });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  if (status && !STATUS_VALIDOS.includes(status))
    return res.status(400).json({ erro: 'Status inválido' });

  const historicos = [];

  if (status && status !== curriculo.status) {
    historicos.push({
      curriculoId: id,
      vendedorId: req.user.id,
      campo: 'status',
      valorAntes: curriculo.status,
      valorDepois: status,
    });
  }

  if (observacao !== undefined && observacao !== curriculo.observacao) {
    historicos.push({
      curriculoId: id,
      vendedorId: req.user.id,
      campo: 'observacao',
      valorAntes: curriculo.observacao,
      valorDepois: observacao,
    });
  }

  const atualizado = await prisma.curriculo.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(observacao !== undefined ? { observacao } : {}),
      dataAlteracao: new Date(),
    },
  });

  if (historicos.length > 0) {
    await prisma.curriculoHistorico.createMany({ data: historicos });
  }

  return res.json(atualizado);
}

// ─── RH: Gerar link WhatsApp para convite de entrevista ──────────────────
async function linkWhatsapp(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });

  const curriculo = await prisma.curriculo.findUnique({
    where: { id },
    select: { id: true, nome: true, whatsapp: true, status: true },
  });
  if (!curriculo) return res.status(404).json({ erro: 'Currículo não encontrado' });

  const primeiroNome = curriculo.nome.split(' ')[0];
  const mensagem = `Olá ${primeiroNome}! Seu currículo foi analisado e você foi selecionado(a) para uma entrevista na Hardt Salgados. Se ainda tiver interesse, entre em contato para agendarmos seu horário. Atendemos de segunda a sexta, das 08:00 às 11:30 e das 13:30 às 17:30. Aguardamos seu retorno!`;

  const numero = `55${curriculo.whatsapp}`;
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

  // Atualiza status para Entrevista se ainda não estiver
  if (!['Entrevista', 'Agendado', 'Entrevistado', 'Aprovado', 'Contratado'].includes(curriculo.status)) {
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

  return res.json({ link, mensagem });
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
  buscarPorCpf,
  salvar,
  uploadFoto,
  listar,
  detalhe,
  atualizar,
  linkWhatsapp,
  contagens,
};
