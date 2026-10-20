// Checklist de veículo por foto + IA (Dia 1, modo TESTE).
// Sem $transaction neste módulo: IA e disco ficam fora de qualquer transação.
// Fotos: path.join(__dirname, '../uploads/...') a partir de services/ => backend/uploads (VOLUME persistente).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');
const catalogo = require('../config/checklistVeiculoAngulos');
const iaService = require('./checklistVeiculoIaService');

const CHAVE_MODO = 'checklist_foto_modo';
const MODOS = ['TESTE', 'DESLIGADO', 'TRAVA'];
const DIR_CHECKLISTS = path.join(__dirname, '../uploads/checklists-veiculo');
const DIR_VEICULOS = path.join(__dirname, '../uploads/veiculos');
const MAX_TENTATIVAS_POR_ANGULO = 6;
const FOTO_MIN_BYTES = 5 * 1024;
const FOTO_MAX_BYTES = 6 * 1024 * 1024;

// Tolerâncias das regras do servidor (configuráveis num lugar só)
const REGRAS = {
    kmOk: 5,            // até 5 km de diferença: ok
    kmReprovaAcima: 1000, // acima disso: REPROVA
    kmFinalOntemFolga: 5,
    placaDistanciaIgnora: 1,
};

const AVISO_TESTE = 'Estamos em período de teste. Em breve não será possível sair com o veículo assim sem liberação do escritório.';

class ErroChecklist extends Error {
    constructor(status, codigo, mensagem) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
    }
}

// ───────────── helpers ─────────────

const permsDe = (user) => user?.permissoes || {};
const ehAdmin = (user) => permsDe(user).admin === true;

function pode(user, ...chaves) {
    if (ehAdmin(user)) return true;
    const p = permsDe(user);
    return chaves.some((c) => p[c] === true);
}

function normPlaca(p) {
    return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function distancia(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[m][n];
}

function detectarImagem(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { mime: 'image/png', ext: '.png' };
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
    return null;
}

function parseKm(v, campo = 'kmDigitado') {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 9999999) {
        throw new ErroChecklist(400, 'KM_INVALIDO', `KM inválido em ${campo}.`);
    }
    return n;
}

function fmtKm(n) {
    return Number(n).toLocaleString('pt-BR');
}

function varetaHoje(dataRef) {
    const dow = new Date(`${dataRef}T12:00:00Z`).getUTCDay(); // 1 = segunda, 4 = quinta
    return dow === 1 || dow === 4;
}

async function getModo() {
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: CHAVE_MODO } });
        if (!reg) {
            try {
                await prisma.appConfig.create({ data: { key: CHAVE_MODO, value: 'TESTE' } });
            } catch { /* corrida com outra requisição: ignora */ }
            return 'TESTE';
        }
        return MODOS.includes(reg.value) ? reg.value : 'TESTE';
    } catch (e) {
        console.error('[ChecklistVeiculo] falha ao ler modo, assumindo TESTE:', e.message);
        return 'TESTE';
    }
}

async function setModo(modo) {
    if (!['TESTE', 'DESLIGADO'].includes(modo)) {
        throw new ErroChecklist(400, 'MODO_INVALIDO', 'Modo inválido. Use TESTE ou DESLIGADO.');
    }
    await prisma.appConfig.upsert({
        where: { key: CHAVE_MODO },
        update: { value: modo },
        create: { key: CHAVE_MODO, value: modo },
    });
    return modo;
}

function fotoDTO(f, extra = {}) {
    return {
        id: f.id,
        angulo: f.angulo,
        url: f.caminho,
        statusIa: f.statusIa,
        serve: f.serve,
        motivoRefazer: f.motivoRefazer,
        problemas: f.problemas || [],
        leituras: f.leituras || null,
        criadoEm: f.criadoEm,
        ...extra,
    };
}

function checklistDTO(c, fotosAtivas) {
    return {
        id: c.id,
        status: c.status,
        veiculoId: c.veiculoId,
        tipo: c.tipoVeiculo,
        modo: c.modo,
        dataReferencia: c.dataReferencia,
        kmDigitado: c.kmDigitado,
        luzOleoAcesa: c.luzOleoAcesa,
        fotos: fotosAtivas.map((f) => fotoDTO(f)),
        fotosPuladas: Array.isArray(c.fotosPuladas) ? c.fotosPuladas : [],
    };
}

async function fotosAtivasDe(checklistId) {
    return prisma.checklistVeiculoFoto.findMany({
        where: { checklistId, ativa: true },
        orderBy: { criadoEm: 'asc' },
    });
}

async function carregarDoDono(id, user) {
    const c = await prisma.checklistVeiculo.findUnique({ where: { id } });
    if (!c) throw new ErroChecklist(404, 'CHECKLIST_NAO_ENCONTRADO', 'Checklist não encontrado.');
    if (c.vendedorId !== user.id) {
        throw new ErroChecklist(403, 'SEM_PERMISSAO', 'Este checklist pertence a outro motorista.');
    }
    return c;
}

function exigirAberto(c) {
    if (c.status !== 'RASCUNHO') {
        throw new ErroChecklist(409, 'CHECKLIST_FECHADO', 'Este checklist já foi concluído e não pode mais ser alterado.');
    }
}

// ───────────── configuração (slots) ─────────────

async function fotosModeloAtivasMap(veiculoId) {
    const lista = await prisma.veiculoFotoModelo.findMany({
        where: { veiculoId, ativa: true },
        orderBy: { criadoEm: 'desc' },
    });
    const mapa = {};
    for (const f of lista) if (!mapa[f.angulo]) mapa[f.angulo] = f; // a mais recente
    return mapa;
}

async function montarConfig(veiculoId) {
    const v = await prisma.veiculo.findUnique({ where: { id: veiculoId } });
    if (!v) throw new ErroChecklist(404, 'VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado.');
    if (v.ativo === false) throw new ErroChecklist(400, 'VEICULO_INATIVO', 'Este veículo está inativo.');
    const modo = await getModo();
    const dataReferencia = getDataReferencia();
    const vareta = varetaHoje(dataReferencia);
    const modelos = await fotosModeloAtivasMap(v.id);
    const slots = catalogo.slotsDoTipo(v.tipo).map((s) => ({
        angulo: s.angulo,
        rotulo: s.rotulo,
        instrucao: s.instrucao,
        dicaNoite: s.dicaNoite,
        ordem: s.ordem,
        obrigatorio: s.condicional ? vareta : true,
        condicional: s.condicional,
        ...(s.condicional ? { condicao: s.condicao } : {}),
        fotoModeloUrl: modelos[s.angulo]?.caminho || null,
    }));
    return {
        veiculoId: v.id,
        placa: v.placa,
        modelo: v.modelo,
        tipo: v.tipo,
        modo,
        dataReferencia,
        varetaHoje: vareta,
        temFotoModelo: slots.some((s) => s.fotoModeloUrl),
        fotosModeloFaltando: slots.filter((s) => !s.fotoModeloUrl).map((s) => s.angulo),
        slots,
    };
}

// ───────────── fotos modelo ─────────────

async function listarFotosModelo(veiculoId) {
    const v = await prisma.veiculo.findUnique({ where: { id: veiculoId } });
    if (!v) throw new ErroChecklist(404, 'VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado.');
    const modelos = await fotosModeloAtivasMap(v.id);
    const ids = [...new Set(Object.values(modelos).map((m) => m.criadoPorId).filter(Boolean))];
    const nomes = {};
    if (ids.length) {
        const vs = await prisma.vendedor.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } });
        vs.forEach((x) => { nomes[x.id] = x.nome; });
    }
    return {
        tipo: v.tipo,
        slots: catalogo.slotsDoTipo(v.tipo).map((s) => {
            const m = modelos[s.angulo];
            return {
                angulo: s.angulo,
                rotulo: s.rotulo,
                instrucao: s.instrucao,
                modelo: m ? { id: m.id, url: m.caminho, criadoEm: m.criadoEm, criadoPorNome: nomes[m.criadoPorId] || null } : null,
            };
        }),
    };
}

async function salvarFotoModelo(veiculoId, user, angulo, file) {
    const v = await prisma.veiculo.findUnique({ where: { id: veiculoId } });
    if (!v) throw new ErroChecklist(404, 'VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado.');
    if (!catalogo.anguloDoTipo(v.tipo, angulo)) {
        throw new ErroChecklist(400, 'ANGULO_INVALIDO', 'Esse ângulo não existe para o tipo deste veículo.');
    }
    const img = validarArquivo(file);
    const dir = path.join(DIR_VEICULOS, v.id, 'modelo');
    fs.mkdirSync(dir, { recursive: true });
    const nome = `${angulo}-${crypto.randomBytes(8).toString('hex')}${img.ext}`;
    fs.writeFileSync(path.join(dir, nome), file.buffer);
    const caminho = `/uploads/veiculos/${v.id}/modelo/${nome}`;

    await prisma.veiculoFotoModelo.updateMany({ where: { veiculoId: v.id, angulo, ativa: true }, data: { ativa: false } });
    const nova = await prisma.veiculoFotoModelo.create({
        data: { veiculoId: v.id, angulo, caminho, criadoPorId: user.id },
    });
    const meta = catalogo.ANGULOS[angulo];
    return {
        slot: {
            angulo,
            rotulo: meta.rotulo,
            instrucao: meta.instrucao,
            modelo: { id: nova.id, url: nova.caminho, criadoEm: nova.criadoEm, criadoPorNome: user.nome || null },
        },
    };
}

function validarArquivo(file) {
    if (!file || !file.buffer) throw new ErroChecklist(400, 'ARQUIVO_INVALIDO', 'Nenhuma foto foi enviada.');
    if (file.buffer.length > FOTO_MAX_BYTES) throw new ErroChecklist(413, 'ARQUIVO_GRANDE', 'A foto passa de 6 MB.');
    const img = detectarImagem(file.buffer);
    if (!img) throw new ErroChecklist(400, 'ARQUIVO_INVALIDO', 'Envie uma foto (JPEG, PNG ou WebP).');
    if (file.buffer.length < FOTO_MIN_BYTES) throw new ErroChecklist(400, 'ARQUIVO_INVALIDO', 'A foto veio vazia ou pequena demais. Tire de novo.');
    return img;
}

// ───────────── checklist: rascunho ─────────────

async function criarRascunho(user, body = {}) {
    const veiculoId = body.veiculoId;
    if (!veiculoId) throw new ErroChecklist(400, 'VEICULO_OBRIGATORIO', 'Informe o veículo.');
    const momento = body.momento === 'VOLTA' ? 'VOLTA' : 'SAIDA';
    const kmDigitado = parseKm(body.kmDigitado);
    const v = await prisma.veiculo.findUnique({ where: { id: String(veiculoId) } });
    if (!v) throw new ErroChecklist(404, 'VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado.');
    if (v.ativo === false) throw new ErroChecklist(400, 'VEICULO_INATIVO', 'Este veículo está inativo.');

    const dataReferencia = getDataReferencia();
    let c = await prisma.checklistVeiculo.findFirst({
        where: { vendedorId: user.id, veiculoId: v.id, momento, dataReferencia, diarioId: null, status: 'RASCUNHO' },
        orderBy: { criadoEm: 'desc' },
    });
    const dados = {};
    if (kmDigitado !== undefined) dados.kmDigitado = kmDigitado;
    if (typeof body.luzOleoAcesa === 'boolean') dados.luzOleoAcesa = body.luzOleoAcesa;
    if (c) {
        if (Object.keys(dados).length) c = await prisma.checklistVeiculo.update({ where: { id: c.id }, data: dados });
    } else {
        const modo = await getModo();
        c = await prisma.checklistVeiculo.create({
            data: { veiculoId: v.id, vendedorId: user.id, dataReferencia, momento, tipoVeiculo: v.tipo, modo, ...dados },
        });
    }
    return checklistDTO(c, await fotosAtivasDe(c.id));
}

async function atualizarRascunho(id, user, body = {}) {
    const c = await carregarDoDono(id, user);
    exigirAberto(c);
    const dados = {};
    const km = parseKm(body.kmDigitado);
    if (km !== undefined) dados.kmDigitado = km;
    if (typeof body.luzOleoAcesa === 'boolean') dados.luzOleoAcesa = body.luzOleoAcesa;
    const novo = Object.keys(dados).length ? await prisma.checklistVeiculo.update({ where: { id }, data: dados }) : c;
    return checklistDTO(novo, await fotosAtivasDe(id));
}

// ───────────── foto do checklist ─────────────

async function enviarFoto(id, user, angulo, file) {
    const c = await carregarDoDono(id, user);
    exigirAberto(c);
    if (!catalogo.anguloDoTipo(c.tipoVeiculo, angulo)) {
        throw new ErroChecklist(400, 'ANGULO_INVALIDO', 'Esse ângulo não existe para o tipo deste veículo.');
    }
    const img = validarArquivo(file);
    const tentativas = await prisma.checklistVeiculoFoto.count({ where: { checklistId: id, angulo } });
    if (tentativas >= MAX_TENTATIVAS_POR_ANGULO) {
        throw new ErroChecklist(400, 'MUITAS_TENTATIVAS', 'Muitas tentativas para esta foto. Fale com o escritório.');
    }
    const veiculo = await prisma.veiculo.findUnique({ where: { id: c.veiculoId }, select: { placa: true, modelo: true } });

    const dir = path.join(DIR_CHECKLISTS, c.veiculoId, c.dataReferencia, c.id);
    fs.mkdirSync(dir, { recursive: true });
    const nome = `${angulo}-${crypto.randomBytes(8).toString('hex')}${img.ext}`;
    fs.writeFileSync(path.join(dir, nome), file.buffer);
    const caminho = `/uploads/checklists-veiculo/${c.veiculoId}/${c.dataReferencia}/${c.id}/${nome}`;

    // IA fora de qualquer transação; nunca lança
    const r = await iaService.analisarFoto({
        buffer: file.buffer,
        mime: img.mime,
        angulo,
        veiculo,
        tipo: c.tipoVeiculo,
        kmDigitado: c.kmDigitado,
        luzOleoAcesa: c.luzOleoAcesa,
    });

    await prisma.checklistVeiculoFoto.updateMany({ where: { checklistId: id, angulo, ativa: true }, data: { ativa: false } });
    const foto = await prisma.checklistVeiculoFoto.create({
        data: {
            checklistId: id,
            angulo,
            caminho,
            ativa: true,
            tamanhoBytes: file.buffer.length,
            statusIa: r.statusIa,
            serve: r.serve,
            motivoRefazer: r.motivoRefazer,
            problemas: r.problemas || [],
            leituras: r.leituras || undefined,
            iaModelo: r.iaModelo,
            iaMs: r.iaMs,
            iaTokens: r.iaTokens,
        },
    });

    // enviou a foto: some da lista de puladas
    const puladas = Array.isArray(c.fotosPuladas) ? c.fotosPuladas : [];
    if (puladas.some((p) => p.angulo === angulo)) {
        try {
            await prisma.checklistVeiculo.update({ where: { id }, data: { fotosPuladas: puladas.filter((p) => p.angulo !== angulo) } });
        } catch (e) { console.error('[ChecklistVeiculo] falha ao limpar pulada:', e.message); }
    }
    const total = await prisma.checklistVeiculoFoto.count({ where: { checklistId: id, ativa: true } });
    return { foto: fotoDTO(foto), checklist: { id, fotosEnviadas: total } };
}

async function pularFoto(id, user, body = {}) {
    const c = await carregarDoDono(id, user);
    exigirAberto(c);
    const modo = await getModo();
    if (modo === 'TRAVA') throw new ErroChecklist(400, 'TRAVA_ATIVA', 'Não é possível pular fotos neste momento.');
    const angulo = body.angulo;
    if (!catalogo.anguloDoTipo(c.tipoVeiculo, angulo)) {
        throw new ErroChecklist(400, 'ANGULO_INVALIDO', 'Esse ângulo não existe para o tipo deste veículo.');
    }
    const motivo = ['FALHA_ENVIO', 'SEM_CONDICAO', 'OUTRO'].includes(body.motivo) ? body.motivo : 'OUTRO';
    const puladas = (Array.isArray(c.fotosPuladas) ? c.fotosPuladas : []).filter((p) => p.angulo !== angulo);
    puladas.push({ angulo, motivo, em: new Date().toISOString() });
    const novo = await prisma.checklistVeiculo.update({ where: { id }, data: { fotosPuladas: puladas } });
    return checklistDTO(novo, await fotosAtivasDe(id));
}

// ───────────── avaliação (regras do servidor) ─────────────

const ordemGrav = { REPROVA: 0, ATENCAO: 1 };

async function avaliar(id, user, body = {}) {
    const c = await carregarDoDono(id, user);
    exigirAberto(c);
    const kmBody = parseKm(body.kmDigitado);
    const kmDigitado = kmBody !== undefined && kmBody !== null ? kmBody : c.kmDigitado;
    const modo = await getModo();
    const veiculo = await prisma.veiculo.findUnique({ where: { id: c.veiculoId }, select: { placa: true } });
    const fotos = await fotosAtivasDe(id);
    const porAngulo = {};
    fotos.forEach((f) => { porAngulo[f.angulo] = f; });
    const puladas = Array.isArray(c.fotosPuladas) ? c.fotosPuladas : [];

    const vareta = varetaHoje(c.dataReferencia) || c.luzOleoAcesa === true;
    const slots = catalogo.slotsDoTipo(c.tipoVeiculo);
    const problemas = [];
    const faltando = [];

    for (const s of slots) {
        const obrigatorio = s.condicional ? vareta : true;
        const f = porAngulo[s.angulo];
        if (!f) {
            const pulada = puladas.find((p) => p.angulo === s.angulo);
            if (pulada) {
                problemas.push({ angulo: s.angulo, gravidade: 'ATENCAO', descricao: `Foto não enviada: ${s.rotulo}`, oQueFazer: 'Se puder, tire esta foto antes de sair.', origem: 'REGRA' });
            } else if (obrigatorio) {
                faltando.push(s.angulo);
            }
            continue;
        }
        if (f.statusIa === 'REFAZER' || f.serve === false) {
            problemas.push({ angulo: s.angulo, gravidade: 'ATENCAO', descricao: f.motivoRefazer || `Não foi possível avaliar: ${s.rotulo}`, oQueFazer: 'Tire esta foto de novo.', origem: 'IA' });
            continue;
        }
        for (const p of (Array.isArray(f.problemas) ? f.problemas : [])) {
            problemas.push({ angulo: s.angulo, gravidade: p.gravidade === 'REPROVA' ? 'REPROVA' : 'ATENCAO', descricao: p.descricao, oQueFazer: p.oQueFazer || '', origem: 'IA' });
        }
    }

    // Regra: placa
    const placaVeiculo = normPlaca(veiculo?.placa);
    for (const ang of ['frente', 'traseira']) {
        const lida = normPlaca(porAngulo[ang]?.leituras?.placa);
        if (!lida || !placaVeiculo) continue;
        const dist = distancia(lida, placaVeiculo);
        if (dist > REGRAS.placaDistanciaIgnora) {
            problemas.push({ angulo: ang, gravidade: 'REPROVA', descricao: `A placa da foto (${lida}) não é a do veículo (${placaVeiculo})`, oQueFazer: 'Confira se escolheu o veículo certo e refaça a foto.', origem: 'REGRA' });
        }
    }

    // Regra: KM lido × digitado × KM final de ontem
    const kmLido = porAngulo.painel?.leituras?.km ?? null;
    if (kmLido !== null && kmDigitado !== null && kmDigitado !== undefined) {
        const dif = Math.abs(kmLido - kmDigitado);
        if (dif > REGRAS.kmOk) {
            problemas.push({
                angulo: 'painel',
                gravidade: dif > REGRAS.kmReprovaAcima ? 'REPROVA' : 'ATENCAO',
                descricao: `KM do painel (${fmtKm(kmLido)}) diferente do digitado (${fmtKm(kmDigitado)})`,
                oQueFazer: 'Confira o KM digitado.',
                origem: 'REGRA',
            });
        }
    }
    if (kmLido !== null) {
        try {
            const ultimo = await require('./veiculoService').ultimoKmFinal(c.veiculoId);
            if (ultimo?.kmFinal != null && kmLido < ultimo.kmFinal - REGRAS.kmFinalOntemFolga) {
                problemas.push({ angulo: 'painel', gravidade: 'ATENCAO', descricao: `KM do painel (${fmtKm(kmLido)}) menor que o último KM final registrado (${fmtKm(ultimo.kmFinal)})`, oQueFazer: 'Confira a foto do painel e o veículo escolhido.', origem: 'REGRA' });
            }
        } catch (e) { console.error('[ChecklistVeiculo] ultimoKmFinal:', e.message); }
    }

    problemas.sort((a, b) => ordemGrav[a.gravidade] - ordemGrav[b.gravidade]);

    const analisadas = fotos.filter((f) => !['IA_INDISPONIVEL', 'NAO_ANALISADA'].includes(f.statusIa));
    let veredito;
    if (problemas.some((p) => p.gravidade === 'REPROVA')) veredito = 'REPROVADO';
    else if (problemas.length || faltando.length) veredito = 'ATENCAO';
    else if (!analisadas.length) veredito = 'IA_INDISPONIVEL';
    else veredito = 'APROVADO';

    const temProblema = veredito === 'ATENCAO' || veredito === 'REPROVADO';
    const podeSeguir = modo !== 'TRAVA' || !temProblema;
    const aviso = temProblema
        ? (modo === 'TRAVA'
            ? 'Não é possível sair com o veículo assim sem liberação do escritório.'
            : AVISO_TESTE)
        : null;

    const dados = { veredito, problemas, kmLido };
    if (kmDigitado !== null && kmDigitado !== undefined) dados.kmDigitado = kmDigitado;
    await prisma.checklistVeiculo.update({ where: { id }, data: dados });

    return {
        veredito,
        modo,
        completo: faltando.length === 0,
        faltando,
        problemas,
        aviso,
        podeSeguir,
        podePedirLiberacao: false,
    };
}

async function registrarDecisao(id, user, body = {}) {
    const c = await carregarDoDono(id, user);
    exigirAberto(c);
    const decisao = body.decisao;
    if (!['CORRIGIU', 'SEGUIU_TESTE'].includes(decisao)) {
        throw new ErroChecklist(400, 'DECISAO_INVALIDA', 'Decisão inválida. Use CORRIGIU ou SEGUIU_TESTE.');
    }
    if (decisao === 'SEGUIU_TESTE') {
        const modo = await getModo();
        if (modo !== 'TESTE') throw new ErroChecklist(400, 'TRAVA_ATIVA', 'Neste momento não é possível seguir sem corrigir.');
    }
    const agora = new Date();
    const log = Array.isArray(c.decisoes) ? c.decisoes : [];
    log.push({ decisao, em: agora.toISOString() });
    await prisma.checklistVeiculo.update({ where: { id }, data: { decisao, decisaoEm: agora, decisoes: log } });
    return { ok: true, decisao };
}

// ───────────── detalhe e listagem (escritório) ─────────────

function podeVerDetalhe(user, c) {
    return c.vendedorId === user.id || pode(user, 'Pode_Acessar_Veiculos', 'Pode_Acessar_Caixa', 'Pode_Editar_Caixa');
}

function dtoCompleto(c, fotosAtivas) {
    return {
        id: c.id,
        dataReferencia: c.dataReferencia,
        momento: c.momento,
        status: c.status,
        veiculoId: c.veiculoId,
        tipo: c.tipoVeiculo,
        vendedor: c.vendedor ? { id: c.vendedor.id, nome: c.vendedor.nome } : { id: c.vendedorId, nome: null },
        veredito: c.veredito,
        decisao: c.decisao,
        modo: c.modo,
        kmDigitado: c.kmDigitado,
        kmLido: c.kmLido,
        luzOleoAcesa: c.luzOleoAcesa,
        problemas: c.problemas || [],
        fotosPuladas: Array.isArray(c.fotosPuladas) ? c.fotosPuladas : [],
        diarioId: c.diarioId,
        fotos: fotosAtivas.map((f) => fotoDTO(f, { rotulo: catalogo.ANGULOS[f.angulo]?.rotulo || f.angulo })),
        criadoEm: c.criadoEm,
    };
}

async function detalhe(id, user) {
    const c = await prisma.checklistVeiculo.findUnique({
        where: { id },
        include: { vendedor: { select: { id: true, nome: true } } },
    });
    if (!c) throw new ErroChecklist(404, 'CHECKLIST_NAO_ENCONTRADO', 'Checklist não encontrado.');
    if (!podeVerDetalhe(user, c)) throw new ErroChecklist(403, 'SEM_PERMISSAO', 'Sem permissão para ver este checklist.');
    return dtoCompleto(c, await fotosAtivasDe(id));
}

async function listarPorVeiculo(veiculoId, { limit, de, ate } = {}) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
    const where = { veiculoId, status: 'CONCLUIDO' };
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if ((de && re.test(de)) || (ate && re.test(ate))) {
        where.dataReferencia = {};
        if (de && re.test(de)) where.dataReferencia.gte = de;
        if (ate && re.test(ate)) where.dataReferencia.lte = ate;
    }
    const lista = await prisma.checklistVeiculo.findMany({
        where,
        orderBy: [{ dataReferencia: 'desc' }, { criadoEm: 'desc' }],
        take,
        include: {
            vendedor: { select: { id: true, nome: true } },
            fotos: { where: { ativa: true }, orderBy: { criadoEm: 'asc' } },
        },
    });
    return lista.map((c) => dtoCompleto(c, c.fotos));
}

// ───────────── integração com o diário ─────────────

/**
 * Valida o checklist informado no início do dia / pegar veículo e devolve o resumo
 * compatível (booleanos *Ok) para DiarioVendedor.checklist. NUNCA lança: inválido => { ok:false }.
 */
async function resumoParaDiario({ checklistId, vendedorId, veiculoId }) {
    try {
        const c = await prisma.checklistVeiculo.findUnique({ where: { id: String(checklistId) } });
        if (!c) return { ok: false, motivo: 'inexistente' };
        if (c.vendedorId !== vendedorId) return { ok: false, motivo: 'outro_vendedor' };
        if (c.veiculoId !== veiculoId) return { ok: false, motivo: 'outro_veiculo' };
        if (c.diarioId) return { ok: false, motivo: 'ja_amarrado' };
        const fotos = await fotosAtivasDe(c.id);
        const por = {};
        fotos.forEach((f) => { por[f.angulo] = f; });
        const puladas = Array.isArray(c.fotosPuladas) ? c.fotosPuladas : [];
        const vareta = varetaHoje(c.dataReferencia) || c.luzOleoAcesa === true;
        const resumo = {};
        // Se o avaliar já rodou, vale o consolidado dele (IA + REGRA); senão, só os problemas da própria foto.
        const consolidado = c.veredito ? (Array.isArray(c.problemas) ? c.problemas : []) : null;
        for (const s of catalogo.slotsDoTipo(c.tipoVeiculo)) {
            const obrigatorio = s.condicional ? vareta : true;
            const f = por[s.angulo];
            const pulada = puladas.some((p) => p.angulo === s.angulo);
            if (!f && !pulada && !obrigatorio) continue; // vareta não exigida e não tirada: fica fora
            const reprova = consolidado
                ? consolidado.some((p) => p && p.angulo === s.angulo && p.gravidade === 'REPROVA')
                : (!!f && (f.statusIa === 'REPROVA' || (Array.isArray(f.problemas) && f.problemas.some((p) => p && p.gravidade === 'REPROVA'))));
            resumo[catalogo.CHAVE_RESUMO[s.angulo]] = !!f && f.serve !== false && !reprova;
        }
        return { ok: true, resumo };
    } catch (e) {
        console.error('[ChecklistVeiculo] resumoParaDiario:', e.message);
        return { ok: false, motivo: 'erro' };
    }
}

/** Amarra o rascunho ao diário já criado — só se for do mesmo vendedor/veículo e ainda RASCUNHO solto.
 *  Devolve true se amarrou, false se ignorou. Chamar em try/catch próprio. */
async function amarrarAoDiario(checklistId, diarioId, vendedorId, veiculoId) {
    const r = await prisma.checklistVeiculo.updateMany({
        where: { id: checklistId, vendedorId, veiculoId, diarioId: null, status: 'RASCUNHO' },
        data: { diarioId, status: 'CONCLUIDO', concluidoEm: new Date() },
    });
    return r.count > 0;
}

module.exports = {
    ErroChecklist, getModo, setModo, montarConfig,
    listarFotosModelo, salvarFotoModelo,
    criarRascunho, atualizarRascunho, enviarFoto, pularFoto, avaliar, registrarDecisao,
    detalhe, listarPorVeiculo, resumoParaDiario, amarrarAoDiario,
    pode, ehAdmin, REGRAS,
};
