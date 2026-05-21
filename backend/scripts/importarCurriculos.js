/**
 * Script de importação dos currículos do CSV para o banco de dados.
 * Uso: node scripts/importarCurriculos.js [caminho_do_csv]
 * Padrão: ./scripts/Curriculos.csv
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Parse CSV (lida com campos quoted multi-linha, vírgulas internas) ────────
function parseCSV(conteudo) {
  // Divide em linhas lógicas respeitando campos entre aspas (que podem ter \n interno)
  const linhasLogicas = [];
  let linhaAtual = '';
  let dentroAspas = false;
  const raw = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') { dentroAspas = !dentroAspas; linhaAtual += c; }
    else if (c === '\n' && !dentroAspas) { linhasLogicas.push(linhaAtual); linhaAtual = ''; }
    else { linhaAtual += c; }
  }
  if (linhaAtual.trim()) linhasLogicas.push(linhaAtual);

  const cabecalho = parseLinha(linhasLogicas[0]).map(c => c.trim());
  const registros = [];
  for (let i = 1; i < linhasLogicas.length; i++) {
    const linha = linhasLogicas[i].trim();
    if (!linha) continue;
    const valores = parseLinha(linha);
    if (valores.length < 3) continue;
    const obj = {};
    cabecalho.forEach((col, idx) => { obj[col] = (valores[idx] || '').trim(); });
    registros.push(obj);
  }
  return registros;
}

function parseLinha(linha) {
  const result = [];
  let cur = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentroAspas = !dentroAspas; }
    else if (c === ',' && !dentroAspas) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

// ─── Normalizar texto com encoding quebrado (latin1 → utf8 simulado) ─────────
function norm(str) {
  if (!str) return null;
  const s = str.trim();
  return s === '' || s === 'Sem informação' || s === 'Sem informações' || s === 'Sem informaÃ§Ã£o' || s === 'Sem informaÃ§Ãµes' ? null : s;
}

// ─── Sanitizar CPF ────────────────────────────────────────────────────────────
function sanitizarCPF(cpf) {
  const n = (cpf || '').replace(/\D/g, '');
  // CPF deve ter 11 dígitos
  if (n.length !== 11) return null;
  // Rejeitar CPFs com todos dígitos iguais
  if (/^(\d)\1{10}$/.test(n)) return null;
  return n;
}

// ─── Parse data ───────────────────────────────────────────────────────────────
function parseData(str) {
  if (!str) return null;
  // Formato DD/MM/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`);
    if (isNaN(d.getTime())) return null;
    // Rejeitar anos absurdos
    if (d.getFullYear() < 1920 || d.getFullYear() > 2020) return null;
    // Checar se tem pelo menos 18 anos
    const hoje = new Date();
    const idade = hoje.getFullYear() - d.getFullYear()
      - (hoje < new Date(hoje.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
    if (idade < 14) return null; // alguns no CSV são menores de aprendiz
    return d;
  }
  return null;
}

// ─── Sanitizar WhatsApp ───────────────────────────────────────────────────────
function sanitizarWA(wa) {
  const n = (wa || '').replace(/\D/g, '');
  if (n.length < 10 || n.length > 11) return null;
  return n;
}

// ─── Mapear área de interesse ─────────────────────────────────────────────────
function mapearArea(area) {
  const a = (area || '').toLowerCase();
  if (a.includes('produ')) return 'Produção';
  if (a.includes('entrega') || a.includes('motorista')) return 'Entrega';
  if (a.includes('vend')) return 'Vendas';
  if (a.includes('admin')) return 'Administrativo';
  return 'Outros';
}

// ─── Mapear status ────────────────────────────────────────────────────────────
function mapearStatus(classificar, statusCol) {
  const s = (statusCol || classificar || '').trim();
  const validos = [
    'Novo', 'Em Análise', 'Entrevista', 'Agendado',
    'Entrevistado', 'Aprovado', 'Contratado',
    'Não Qualificado', 'Rejeitado', 'Desistiu', 'Não Disponível',
  ];

  if (!s) return 'Novo';
  if (s.includes('Contratado')) return 'Contratado';
  if (s.includes('Entrevistado')) return 'Entrevistado';
  if (s.includes('Entrevista')) return 'Entrevista';
  if (s.includes('Agendado')) return 'Agendado';
  if (s.includes('qualificado') || s.toLowerCase().includes('n') && s.toLowerCase().includes('qualificado')) return 'Não Qualificado';
  if (s.includes('Rejeitado')) return 'Rejeitado';
  if (s.includes('Desistiu')) return 'Desistiu';
  if (s.includes('disponível') || s.includes('disponivel')) return 'Não Disponível';

  const classificarLower = (classificar || '').toLowerCase();
  if (classificarLower.includes('qualificado') && classificarLower.includes('não')) return 'Não Qualificado';
  if (classificarLower.includes('entrevista')) return 'Entrevista';

  return 'Novo';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'Curriculos.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo CSV não encontrado: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Lendo CSV: ${csvPath}`);
  const conteudo = fs.readFileSync(csvPath, 'utf8');
  const registros = parseCSV(conteudo);
  console.log(`Total de linhas no CSV: ${registros.length}`);

  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const r of registros) {
    // Pegar as colunas pelo nome (podem ter espaços extras)
    const nome = norm(r['Nome completo']);
    const email = norm(r['Endereço de e-mail']);
    const whatsappRaw = r['WhatsApp para contato\n'] || r['WhatsApp para contato'] || '';
    const cpfRaw = r['CPF\n'] || r['CPF'] || '';
    const dataNascRaw = r['Data Nascimento'] || '';
    const estadoCivil = norm(r['Estado Civil '] || r['Estado Civil']);
    const temFilhos = norm(r['Você tem filhos?  '] || r['Você tem filhos?']);
    const naturalidade = norm(r['Naturalidade (Cidade e Estado onde nasceu)  '] || r['Naturalidade']);
    const endereco = norm(r['Endereço completo (Rua, número, bairro, cidade e CEP)  '] || r['Endereço completo']);
    const areaRaw = r['Área de interesse  '] || r['Área de interesse'] || '';
    const horarioInicio = norm(r['Horário disponível para início das atividades  '] || r['Horário disponível para início das atividades']);
    const horasExtras = norm(r['Você tem disponibilidade para fazer horas extras?  '] || r['Você tem disponibilidade para fazer horas extras?']);
    const disponibilidade = norm(r['Disponibilidade de horário em geral  '] || r['Disponibilidade de horário em geral']);
    const empregosReg = norm(r['Últimos 3 empregos com registro'] || r['Ãltimos 3 empregos com registro']);
    const empregosSem = norm(r['Últimos 3 trabalhos sem registro  '] || r['Ãltimos 3 trabalhos sem registro  '] || r['Últimos 3 trabalhos sem registro']);
    const outrasExp = norm(r['Outras experiências profissionais relevantes  '] || r['Outras experiÃªncias profissionais relevantes  ']);
    const classificar = norm(r['Classificar'] || '');
    const statusCol = norm(r['Status'] || '');
    const observacao = norm(r['ObservacaoDesqualificacao'] || '');
    const dataAlteracaoRaw = r['dataAlteracao'] || '';

    // Validar campos obrigatórios
    if (!nome) { ignorados++; continue; }

    const cpf = sanitizarCPF(cpfRaw);
    if (!cpf) { console.log(`  ⚠ CPF inválido para "${nome}" (${cpfRaw}) — ignorado`); ignorados++; continue; }

    const whatsapp = sanitizarWA(whatsappRaw);
    if (!whatsapp) { console.log(`  ⚠ WhatsApp inválido para "${nome}" (${whatsappRaw}) — ignorado`); ignorados++; continue; }

    const dataNascimento = parseData(dataNascRaw);
    if (!dataNascimento) { console.log(`  ⚠ Data de nascimento inválida para "${nome}" (${dataNascRaw}) — ignorado`); ignorados++; continue; }

    const areaInteresse = mapearArea(areaRaw);
    const status = mapearStatus(classificar, statusCol);

    // Parse dataAlteracao
    let dataAlteracao = null;
    if (dataAlteracaoRaw) {
      const m = dataAlteracaoRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
        if (!isNaN(d.getTime())) dataAlteracao = d;
      }
    }

    const dados = {
      nome,
      email,
      whatsapp,
      dataNascimento,
      estadoCivil,
      temFilhos,
      naturalidade,
      endereco,
      areaInteresse,
      horarioInicio,
      horasExtras,
      disponibilidade,
      empregosRegistrados: empregosReg,
      empregosSemRegistro: empregosSem,
      outrasExperiencias: outrasExp,
      status,
      observacao,
      dataAlteracao,
    };

    try {
      const existente = await prisma.curriculo.findUnique({ where: { cpf } });
      if (existente) {
        // Só atualiza se o novo status for "mais avançado"
        await prisma.curriculo.update({ where: { cpf }, data: dados });
        atualizados++;
        console.log(`  ✓ Atualizado: ${nome}`);
      } else {
        await prisma.curriculo.create({ data: { cpf, ...dados } });
        inseridos++;
        console.log(`  + Inserido: ${nome}`);
      }
    } catch (err) {
      console.log(`  ✗ Erro em "${nome}": ${err.message}`);
      ignorados++;
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`Inseridos:  ${inseridos}`);
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Ignorados:  ${ignorados}`);
  console.log(`═══════════════════════════════════════`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
