/**
 * F2 — Comprovante da despesa do motorista (foto do cupom/nota/recibo + leitura da IA).
 *
 * REGRAS:
 *  - A IA só LÊ o documento. Quem compara (valor, data, litros, tanque, fornecedor x categoria,
 *    duplicidade, DV do CNPJ) é este arquivo, no servidor. A comparação da IA nunca é usada.
 *  - Só MARCA e AVISA: nada aqui trava a despesa nem o Caixa. Nenhuma função lança por causa da IA.
 *  - Nenhuma fórmula do Caixa é tocada; nada daqui cria conta a pagar (isso é a F3).
 *  - IA, arquivo e rede ficam FORA de qualquer $transaction.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');
const aiProvider = require('./aiProvider');
const anexoService = require('./anexoService');
const JWT_SECRET = require('../config/jwtSecret');
const { validarDoc, normalizarDoc, formatarDoc } = require('../utils/documento');
const { extrairJson } = require('./checklistVeiculoIaService');

const TIMEOUT_MS = 40000;
const REF_VALIDADE_MS = 2 * 60 * 60 * 1000; // 2 h
const DIAS_DUPLICIDADE = 90;
const TOL_VALOR = 0.05;
const TOL_LITROS = 0.5;
const FOLGA_TANQUE = 1.05;

const CATEGORIAS = ['MERCADORIA_EMPRESA', 'COMBUSTIVEL', 'PEDAGIO_BALSA', 'HOTEL_HOSPEDAGEM', 'MANUTENCAO_VEICULO', 'OUTRO'];
const STATUS = ['CONFERIDA', 'DIVERGENTE', 'RECUSADA', 'IA_INDISPONIVEL', 'SEM_COMPROVANTE', 'ACEITA'];
const TIPOS_DOC = ['CUPOM_FISCAL', 'NOTA_FISCAL', 'RECIBO', 'OUTRO'];
const ESTABELECIMENTOS = ['POSTO_COMBUSTIVEL', 'OFICINA_AUTOPECAS', 'PEDAGIO', 'HOTEL', 'RESTAURANTE', 'MERCADO', 'OUTRO'];

// categoria da despesa -> tipos de estabelecimento coerentes. Categoria fora do mapa = sem checagem.
const ESTABELECIMENTO_POR_CATEGORIA = {
    COMBUSTIVEL: ['POSTO_COMBUSTIVEL'],
    MANUTENCAO_VEICULO: ['OFICINA_AUTOPECAS'],
    PEDAGIO_BALSA: ['PEDAGIO'],
    HOTEL_HOSPEDAGEM: ['HOTEL', 'RESTAURANTE'],
};
const ROTULO_ESTAB = {
    POSTO_COMBUSTIVEL: 'posto de combustível', OFICINA_AUTOPECAS: 'oficina/auto peças', PEDAGIO: 'pedágio/balsa',
    HOTEL: 'hotel/hospedagem', RESTAURANTE: 'restaurante', MERCADO: 'mercado/loja', OUTRO: 'outro tipo de estabelecimento',
};

const RASCUNHO_DIR = path.join(__dirname, '../uploads/anexos/_rascunho'); // volume persistente (../uploads)
const LIMITE_RASCUNHO_BYTES = 10 * 1024 * 1024;

const SYSTEM_PROMPT = `Você lê comprovantes de despesa de motoristas de uma distribuidora de salgados congelados no Brasil.
A imagem é uma foto (muitas vezes torta, escura ou amassada) de um DOCUMENTO FISCAL OU RECIBO brasileiro:
cupom fiscal / NFC-e (cupom de posto, mercado, loja), DANFE / nota fiscal eletrônica, recibo ou nota de serviço
(inclusive manuscrito), ticket de pedágio ou balsa, nota de hotel ou restaurante.
Responda SOMENTE um JSON válido, sem texto fora dele.

REGRAS
1. Só relate o que você ENXERGA. NUNCA invente, complete ou deduza valor, data, CNPJ ou número. Se não vê, use null.
2. Números em JSON com ponto decimal (ex.: 245.90), sem "R$" e sem separador de milhar. "1.234,56" vira 1234.56.
3. Data em ISO "AAAA-MM-DD". Ano com 2 dígitos = 20AA. Se a data estiver ambígua ou ilegível, null. Hora "HH:MM" ou null.
4. "valorTotal" é o TOTAL PAGO do documento (não troco, não subtotal de item, não valor recebido em dinheiro).
5. CNPJ: devolva só os 14 caracteres (dígitos; letras só se o documento mostra letras), sem pontos, barras ou traços.
   Se for pessoa física (recibo de autônomo) e só há CPF, devolva o CPF (11 dígitos) no mesmo campo. Se não vê, null.
6. "fornecedorNome" é a razão social ou nome fantasia do EMITENTE (quem vendeu), do cabeçalho do documento.
   Nunca o nome do cliente/destinatário.
7. "tipoEstabelecimento" classifica o EMITENTE (quem vendeu): POSTO_COMBUSTIVEL, OFICINA_AUTOPECAS (oficina, mecânica,
   borracharia, auto peças, lava-jato, elétrica), PEDAGIO (pedágio, balsa, concessionária de rodovia), HOTEL, RESTAURANTE,
   MERCADO (mercado, loja, farmácia, outros varejos), OUTRO. Na dúvida, OUTRO. Não classifique pelo que o motorista disse, só pelo documento.
8. Combustível: "litros" (quantidade abastecida) e "precoLitro" quando o documento mostra; "combustivel" (ex.: "Diesel S10", "Gasolina comum") ou null.
9. "numeroDocumento": número do cupom/nota (COO, nº da NFC-e/NF-e ou do recibo) ou null.
10. "legivel": false se a imagem está tão borrada, cortada ou escura que você não consegue ler o valor total nem o emitente.
11. "ehComprovanteDeCompra": false se a imagem NÃO é um comprovante de compra/serviço (selfie, carro, paisagem, tela de celular
    sem recibo, documento pessoal, outro assunto). Seja objetivo: um cupom, nota ou recibo, mesmo ruim, é true.
12. "tipoDocumento": CUPOM_FISCAL (cupom/NFC-e), NOTA_FISCAL (DANFE/NF-e/NFS-e), RECIBO (recibo simples, manuscrito, ticket) ou OUTRO.

FORMATO (todos os campos obrigatórios, use null quando não vê):
{"legivel":true,"ehComprovanteDeCompra":true,"tipoDocumento":"CUPOM_FISCAL","valorTotal":null,"data":null,"hora":null,
"fornecedorNome":null,"fornecedorCnpj":null,"tipoEstabelecimento":null,"numeroDocumento":null,"litros":null,"precoLitro":null,
"combustivel":null,"observacao":null}
"observacao" é opcional: uma frase curta em português só se algo atrapalhou a leitura.`;

// ── utilidades ──────────────────────────────────────────────────────────────────
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 200) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};
const dataIso = (v) => {
    const s = txt(v, 20);
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
        const b = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
        if (b) m = [null, b[3].length === 2 ? `20${b[3]}` : b[3], b[2], b[1]];
    }
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
};
const arred = (n, c = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** c) / 10 ** c);
const brl = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;
const dataBR = (iso) => String(iso || '').split('-').reverse().join('/');
const apagar = (p) => { try { if (p) fs.unlinkSync(p); } catch (_) { /* já não existe */ } };

const motivo = (codigo, mensagem, extra) => ({ codigo, mensagem, ...(extra || {}) });

// ── comprovanteRef: token HMAC curto, amarrado ao vendedor, expira em 2 h ───────
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const assinar = (corpo) => crypto.createHmac('sha256', `${JWT_SECRET}:despesa-comprovante`).update(corpo).digest('base64url').slice(0, 22);

function gerarRef({ vendedorId, rascunhoId }) {
    const corpo = b64u(JSON.stringify({ v: vendedorId, r: rascunhoId, e: Date.now() + REF_VALIDADE_MS }));
    return `${corpo}.${assinar(corpo)}`;
}

/** @returns {{ok:true, rascunhoId}|{ok:false, codigo, mensagem}} */
function validarRef(ref, vendedorId) {
    try {
        const [corpo, sig] = String(ref || '').split('.');
        if (!corpo || !sig) return { ok: false, codigo: 'REF_INVALIDA', mensagem: 'Referência do comprovante inválida.' };
        const esperado = assinar(corpo);
        const a = Buffer.from(sig); const b = Buffer.from(esperado);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, codigo: 'REF_INVALIDA', mensagem: 'Referência do comprovante inválida.' };
        const p = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
        if (p.v !== vendedorId) return { ok: false, codigo: 'REF_DE_OUTRO_USUARIO', mensagem: 'Este comprovante foi enviado por outro usuário.' };
        if (!p.e || Date.now() > p.e) return { ok: false, codigo: 'REF_EXPIRADA', mensagem: 'O comprovante expirou (mais de 2 horas). Tire a foto de novo.' };
        if (!/^[0-9a-f]{24}$/.test(String(p.r))) return { ok: false, codigo: 'REF_INVALIDA', mensagem: 'Referência do comprovante inválida.' };
        return { ok: true, rascunhoId: p.r };
    } catch (_) {
        return { ok: false, codigo: 'REF_INVALIDA', mensagem: 'Referência do comprovante inválida.' };
    }
}

const dirRascunho = (vendedorId) => path.join(RASCUNHO_DIR, String(vendedorId).replace(/[^\w-]/g, '_'));

/** Limpeza oportunista: rascunhos do PRÓPRIO usuário com mais de 24 h (só arquivos que este módulo criou). */
function limparRascunhosVelhos(vendedorId) {
    try {
        const dir = dirRascunho(vendedorId);
        const limite = Date.now() - 24 * 60 * 60 * 1000;
        for (const f of fs.readdirSync(dir)) {
            if (!/^[0-9a-f]{24}\.(bin|json)$/.test(f)) continue;
            const p = path.join(dir, f);
            if (fs.statSync(p).mtimeMs < limite) apagar(p);
        }
    } catch (_) { /* pasta ainda não existe */ }
}

// ── leitura pela IA ─────────────────────────────────────────────────────────────
function normalizarLeitura(j) {
    const doc = txt(j?.fornecedorCnpj, 30);
    const cnpj = doc ? normalizarDoc(doc) : null;
    const tipoDoc = TIPOS_DOC.includes(String(j?.tipoDocumento).toUpperCase()) ? String(j.tipoDocumento).toUpperCase() : 'OUTRO';
    const estab = ESTABELECIMENTOS.includes(String(j?.tipoEstabelecimento).toUpperCase()) ? String(j.tipoEstabelecimento).toUpperCase() : null;
    return {
        legivel: j?.legivel !== false,
        ehComprovanteDeCompra: j?.ehComprovanteDeCompra !== false,
        tipoDocumento: tipoDoc,
        valor: arred(num(j?.valorTotal ?? j?.valor)),
        data: dataIso(j?.data),
        hora: /^\d{2}:\d{2}/.test(String(j?.hora || '')) ? String(j.hora).slice(0, 5) : null,
        fornecedorNome: txt(j?.fornecedorNome, 160),
        fornecedorCnpj: cnpj && (cnpj.length === 14 || cnpj.length === 11) ? cnpj : (cnpj || null),
        tipoEstabelecimento: estab,
        numero: txt(j?.numeroDocumento ?? j?.numero, 60),
        litros: arred(num(j?.litros), 3),
        precoLitro: arred(num(j?.precoLitro), 3),
        combustivel: txt(j?.combustivel, 60),
        observacao: txt(j?.observacao, 200),
    };
}

/** Chama a IA. NUNCA lança: devolve { indisponivel:true, motivo } ou { leitura }. */
async function lerComIa({ buffer, mime, categoria }) {
    const t0 = Date.now();
    try {
        if (!aiProvider.isConfigured()) return { indisponivel: true, motivoIa: 'sem_chave' };
        if (!String(mime || '').startsWith('image/')) return { indisponivel: true, motivoIa: 'pdf_nao_lido' };
        const r = await aiProvider.analisarImagem({
            system: SYSTEM_PROMPT,
            texto: `Categoria informada pelo motorista (apenas contexto, não confirme por ela): ${CATEGORIAS.includes(categoria) ? categoria : 'não informada'}. Leia o documento da imagem.`,
            imagens: [{ base64: buffer.toString('base64'), mime }],
            maxTokens: 2500,
            json: true,
            timeoutMs: TIMEOUT_MS,
        });
        const j = extrairJson(r.texto);
        if (!j || typeof j !== 'object') return { indisponivel: true, motivoIa: 'resposta_invalida' };
        return { leitura: normalizarLeitura(j), iaModelo: r.modelo, iaMs: Date.now() - t0 };
    } catch (e) {
        console.error('[CupomDespesa] IA indisponível:', e.message);
        return { indisponivel: true, motivoIa: 'erro' };
    }
}

// ── cadastro de fornecedores por CNPJ ───────────────────────────────────────────
async function fornecedorPorCnpj(cnpj) {
    try {
        const d = normalizarDoc(cnpj);
        if (!d || (d.length !== 14 && d.length !== 11)) return null;
        const f = await prisma.fornecedor.findFirst({
            where: { cnpjCpf: { in: [d, formatarDoc(d)] } },
            orderBy: [{ ativo: 'desc' }, { criadoEm: 'asc' }],
            select: { id: true, razaoSocial: true, nomeFantasia: true, ativo: true },
        });
        return f ? { id: f.id, nome: f.nomeFantasia || f.razaoSocial, razaoSocial: f.razaoSocial, ativo: f.ativo } : null;
    } catch (e) {
        console.warn('[CupomDespesa] busca de fornecedor falhou:', e.message);
        return null;
    }
}

// ── duplicidade (aviso, nunca bloqueio) ─────────────────────────────────────────
async function acharDuplicidade({ sha256, cnpj, numero, ignorarDespesaId }) {
    const achados = [];
    const desde = new Date(Date.now() - DIAS_DUPLICIDADE * 24 * 60 * 60 * 1000);
    try {
        if (sha256) {
            const iguais = await prisma.anexo.findMany({
                where: { sha256, entidadeTipo: 'DESPESA', ativo: true, criadoEm: { gte: desde }, ...(ignorarDespesaId ? { NOT: { entidadeId: ignorarDespesaId } } : {}) },
                select: { entidadeId: true }, take: 3,
            });
            iguais.forEach((a) => achados.push({ por: 'ARQUIVO', despesaId: a.entidadeId }));
        }
        if (cnpj && numero) {
            const iguais = await prisma.despesaComprovante.findMany({
                where: { cupomCnpj: cnpj, cupomNumero: numero, criadoEm: { gte: desde }, ...(ignorarDespesaId ? { NOT: { despesaId: ignorarDespesaId } } : {}) },
                select: { despesaId: true }, take: 3,
            });
            iguais.forEach((a) => { if (!achados.some((x) => x.despesaId === a.despesaId)) achados.push({ por: 'CNPJ_NUMERO', despesaId: a.despesaId }); });
        }
    } catch (e) {
        console.warn('[CupomDespesa] checagem de duplicidade falhou (ignorada):', e.message);
    }
    return achados;
}

// ── comparação (SERVIDOR; a IA só leu) ──────────────────────────────────────────
/**
 * @param leitura  saída de normalizarLeitura
 * @param digitado {categoria, valor, dataReferencia, litros, capacidadeTanque}
 * @param duplicados lista de acharDuplicidade
 * @returns {status, motivos[]}
 */
function conferir({ leitura, digitado, duplicados = [] }) {
    const motivos = [];
    if (!leitura.ehComprovanteDeCompra) {
        motivos.push(motivo('NAO_E_COMPROVANTE', 'A imagem não parece um cupom, nota ou recibo.'));
        return { status: 'RECUSADA', motivos };
    }
    if (!leitura.legivel) {
        motivos.push(motivo('ILEGIVEL', 'A foto está ilegível (borrada, cortada ou escura). Tire outra foto, mais de perto e com luz.'));
        return { status: 'RECUSADA', motivos };
    }

    const valorDig = num(digitado.valor);
    if (leitura.valor === null) motivos.push(motivo('VALOR_NAO_LIDO', 'Não deu para ler o valor total no documento.'));
    else if (valorDig !== null && Math.round(Math.abs(leitura.valor - valorDig) * 100) > Math.round(TOL_VALOR * 100)) {
        motivos.push(motivo('VALOR_DIFERENTE', `O documento mostra ${brl(leitura.valor)}, mas a despesa foi lançada com ${brl(valorDig)}.`, { lido: leitura.valor, digitado: valorDig }));
    }

    if (!leitura.data) motivos.push(motivo('DATA_NAO_LIDA', 'Não deu para ler a data no documento.'));
    else if (digitado.dataReferencia && leitura.data !== digitado.dataReferencia) {
        motivos.push(motivo('DATA_DIFERENTE', `O documento é de ${dataBR(leitura.data)}, mas a despesa é do dia ${dataBR(digitado.dataReferencia)}.`, { lido: leitura.data, digitado: digitado.dataReferencia }));
    }

    if (digitado.categoria === 'COMBUSTIVEL') {
        const litrosDig = num(digitado.litros);
        if (litrosDig !== null && leitura.litros !== null && Math.round(Math.abs(leitura.litros - litrosDig) * 1000) > Math.round(TOL_LITROS * 1000)) {
            motivos.push(motivo('LITROS_DIFERENTE', `O documento mostra ${leitura.litros} L, mas foram informados ${litrosDig} L.`, { lido: leitura.litros, digitado: litrosDig }));
        }
        const cap = num(digitado.capacidadeTanque);
        if (cap) {
            const maior = Math.max(litrosDig ?? 0, leitura.litros ?? 0);
            if (maior > cap * FOLGA_TANQUE) {
                motivos.push(motivo('LITROS_ACIMA_DO_TANQUE', `${maior} L é mais do que cabe no tanque deste veículo (${cap} L).`, { litros: maior, capacidadeTanque: cap }));
            }
        }
    }

    const aceitos = ESTABELECIMENTO_POR_CATEGORIA[digitado.categoria];
    if (aceitos && leitura.tipoEstabelecimento && !aceitos.includes(leitura.tipoEstabelecimento)) {
        motivos.push(motivo('FORNECEDOR_INCOERENTE',
            `O documento é de ${ROTULO_ESTAB[leitura.tipoEstabelecimento] || 'outro tipo de estabelecimento'}${leitura.fornecedorNome ? ` (${leitura.fornecedorNome})` : ''}, mas a despesa é de ${aceitos.map((a) => ROTULO_ESTAB[a]).join(' ou ')}.`,
            { lido: leitura.tipoEstabelecimento, esperado: aceitos }));
    }

    if (leitura.fornecedorCnpj && !validarDoc(leitura.fornecedorCnpj)) {
        motivos.push(motivo('CNPJ_INVALIDO', `O CNPJ/CPF lido (${leitura.fornecedorCnpj}) não é válido; pode ter sido lido errado.`, { lido: leitura.fornecedorCnpj }));
    }

    if (duplicados.length) {
        motivos.push(motivo('DUPLICADO', 'Este comprovante parece já ter sido usado em outra despesa nos últimos 90 dias.', { iguais: duplicados }));
    }

    return { status: motivos.length ? 'DIVERGENTE' : 'CONFERIDA', motivos };
}

async function capacidadeDoVeiculo(veiculoId) {
    if (!veiculoId) return null;
    try {
        const v = await prisma.veiculo.findUnique({ where: { id: String(veiculoId) }, select: { capacidadeTanque: true } });
        return v?.capacidadeTanque != null ? Number(v.capacidadeTanque) : null;
    } catch (_) { return null; }
}

/** Resultado completo da análise de um arquivo (lê + compara + fornecedor + duplicidade). Nunca lança. */
async function analisarArquivo({ arquivoPath, mime, sha256, digitado, ignorarDespesaId }) {
    const buffer = fs.readFileSync(arquivoPath);
    const ia = await lerComIa({ buffer, mime, categoria: digitado?.categoria });
    if (ia.indisponivel) {
        const duplicados = await acharDuplicidade({ sha256, ignorarDespesaId });
        const motivos = [motivo('IA_INDISPONIVEL', ia.motivoIa === 'pdf_nao_lido'
            ? 'PDF anexado, mas a leitura automática só funciona com foto. O escritório vai conferir.'
            : 'A leitura automática não está disponível agora. O escritório vai conferir o comprovante.', { causa: ia.motivoIa })];
        if (duplicados.length) motivos.push(motivo('DUPLICADO', 'Este arquivo já foi usado em outra despesa nos últimos 90 dias.', { iguais: duplicados }));
        return { status: 'IA_INDISPONIVEL', motivos, leitura: null, tipoDocumento: null, fornecedorSugerido: null, iaModelo: null };
    }
    const { leitura } = ia;
    const duplicados = await acharDuplicidade({ sha256, cnpj: leitura.fornecedorCnpj, numero: leitura.numero, ignorarDespesaId });
    const fornecedorSugerido = leitura.fornecedorCnpj && validarDoc(leitura.fornecedorCnpj) ? await fornecedorPorCnpj(leitura.fornecedorCnpj) : null;
    const { status, motivos } = conferir({ leitura, digitado: digitado || {}, duplicados });
    return {
        status, motivos, leitura,
        tipoDocumento: leitura.tipoDocumento,
        fornecedorSugerido: fornecedorSugerido ? { id: fornecedorSugerido.id, nome: fornecedorSugerido.nome } : null,
        iaModelo: ia.iaModelo || null,
    };
}

// ── rascunho (POST /analisar) ───────────────────────────────────────────────────
/**
 * Recebe o temporário do multer, valida (foto JPEG/PNG/WebP ou PDF, ≤ 10 MB), guarda em
 * uploads/anexos/_rascunho/<vendedorId>/ e analisa. A IA roda aqui, fora de qualquer transação.
 */
async function analisarRascunho({ arquivo, vendedorId, digitado }) {
    const stat = fs.statSync(arquivo.path);
    if (stat.size === 0) { apagar(arquivo.path); throw new anexoService.AnexoErro('O arquivo está vazio.', 'ARQUIVO_INVALIDO'); }
    if (stat.size > LIMITE_RASCUNHO_BYTES) { apagar(arquivo.path); throw new anexoService.AnexoErro('O comprovante tem mais de 10 MB. Tire a foto de novo.', 'ARQUIVO_GRANDE', 413); }
    const real = anexoService.detectarPeloConteudo(anexoService.lerCabecalho(arquivo.path));
    if (!real || real === 'xml') { apagar(arquivo.path); throw new anexoService.AnexoErro('Envie uma foto (JPG, PNG ou WebP) ou um PDF do comprovante.', 'ARQUIVO_INVALIDO'); }
    const declarado = String(arquivo.mimetype || '').toLowerCase();
    const canon = anexoService.CANONICO[real];
    if (declarado && !['application/octet-stream'].includes(declarado) && !anexoService.MIMES_DECLARADOS[real].includes(declarado)) {
        apagar(arquivo.path);
        throw new anexoService.AnexoErro('O arquivo não confere com o tipo informado. Envie a foto de novo.', 'ARQUIVO_INVALIDO');
    }
    const sha256 = await anexoService.sha256DoArquivo(arquivo.path);

    const dir = dirRascunho(vendedorId);
    fs.mkdirSync(dir, { recursive: true });
    limparRascunhosVelhos(vendedorId);
    const rascunhoId = crypto.randomBytes(12).toString('hex');
    const destino = path.join(dir, `${rascunhoId}.bin`);
    try { fs.renameSync(arquivo.path, destino); } catch (_) { fs.copyFileSync(arquivo.path, destino); apagar(arquivo.path); }

    const capacidadeTanque = await capacidadeDoVeiculo(digitado?.veiculoId);
    const r = await analisarArquivo({ arquivoPath: destino, mime: canon.mime, sha256, digitado: { ...digitado, capacidadeTanque } });

    // sidecar: o POST da despesa recalcula a comparação com os valores finais SEM chamar a IA de novo
    const meta = {
        nomeOriginal: anexoService.corrigirNome(arquivo.originalname) || `comprovante.${canon.ext}`,
        mime: canon.mime, sha256, tamanho: stat.size,
        iaStatus: r.status, leitura: r.leitura, tipoDocumento: r.tipoDocumento, fornecedorSugerido: r.fornecedorSugerido,
        iaModelo: r.iaModelo, criadoEm: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, `${rascunhoId}.json`), JSON.stringify(meta));

    const avisos = [];
    if (r.status === 'IA_INDISPONIVEL') avisos.push(motivo('IA_INDISPONIVEL', 'Não foi possível ler o comprovante automaticamente. Você pode salvar a despesa mesmo assim; o escritório confere.'));
    return {
        comprovanteRef: gerarRef({ vendedorId, rascunhoId }),
        validoAte: new Date(Date.now() + REF_VALIDADE_MS).toISOString(),
        status: r.status, motivos: r.motivos, leitura: r.leitura,
        fornecedorSugerido: r.fornecedorSugerido, tipoDocumento: r.tipoDocumento,
        avisos, trava: false,
    };
}

function lerRascunho(ref, vendedorId) {
    const v = validarRef(ref, vendedorId);
    if (!v.ok) return v;
    const dir = dirRascunho(vendedorId);
    const bin = path.join(dir, `${v.rascunhoId}.bin`);
    const jsonPath = path.join(dir, `${v.rascunhoId}.json`);
    if (!fs.existsSync(bin) || !fs.existsSync(jsonPath)) {
        return { ok: false, codigo: 'REF_USADA_OU_PERDIDA', mensagem: 'O comprovante já foi usado ou se perdeu. Tire a foto de novo.' };
    }
    try {
        return { ok: true, bin, jsonPath, meta: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
    } catch (_) {
        return { ok: false, codigo: 'REF_INVALIDA', mensagem: 'Comprovante ilegível no servidor. Tire a foto de novo.' };
    }
}

// ── gravação ligada à despesa (sempre DEPOIS da despesa salva; nunca lança) ──────
function digitadoDaDespesa(d, capacidadeTanque) {
    return { categoria: d.categoria, valor: d.valor != null ? Number(d.valor) : null, dataReferencia: d.dataReferencia, litros: d.litros != null ? Number(d.litros) : null, capacidadeTanque };
}

const dadosDaLeitura = (leitura) => ({
    cupomCnpj: leitura?.fornecedorCnpj || null,
    cupomNumero: leitura?.numero || null,
    fornecedorNomeLido: leitura?.fornecedorNome || null,
    fornecedorCnpjLido: leitura?.fornecedorCnpj || null,
});

async function gravarLinha(despesaId, dados) {
    return prisma.despesaComprovante.upsert({
        where: { despesaId },
        create: { despesaId, ...dados },
        update: dados,
    });
}

const LIMPA_ACEITE = { aceitaPorId: null, aceitaPorNome: null, aceitaEm: null, aceitaMotivo: null };

/**
 * Chamada pelas rotas que criam/editam despesa. NUNCA lança e nunca desfaz a despesa.
 * Devolve o resumo para a resposta da rota: { status, motivos, comprovanteErro? }.
 */
async function registrarParaDespesa({ despesa, comprovanteRef, semComprovanteMotivo, usuario, substituir = false }) {
    try {
        const capacidade = despesa.categoria === 'COMBUSTIVEL' ? await capacidadeDoVeiculo(despesa.veiculoId) : null;
        const digitado = digitadoDaDespesa(despesa, capacidade);

        if (comprovanteRef) {
            const rasc = lerRascunho(comprovanteRef, usuario.id);
            if (!rasc.ok) {
                const erroRef = { codigo: rasc.codigo, mensagem: rasc.mensagem };
                // já existe comprovante (edição/substituição/clique repetido): só avisa, NÃO mexe na linha existente
                if (substituir || (await prisma.anexo.count({ where: { entidadeTipo: 'DESPESA', entidadeId: despesa.id, tipo: 'COMPROVANTE', ativo: true } })) > 0) {
                    return { status: null, motivos: [], comprovanteErro: erroRef };
                }
                // referência ruim e despesa sem comprovante: o escritório vê "sem comprovante" + o motivo
                const motivos = [motivo(rasc.codigo, rasc.mensagem)];
                await gravarLinha(despesa.id, { status: 'SEM_COMPROVANTE', motivos, anexoId: null, semComprovanteMotivo: null, ...LIMPA_ACEITE });
                return { status: 'SEM_COMPROVANTE', motivos, comprovanteErro: { codigo: rasc.codigo, mensagem: rasc.mensagem } };
            }
            const { meta } = rasc;
            const { anexo } = await anexoService.salvar({
                entidadeTipo: 'DESPESA', entidadeId: despesa.id, tipo: 'COMPROVANTE', usuario,
                arquivo: { path: rasc.bin, originalname: meta.nomeOriginal, mimetype: meta.mime, size: meta.tamanho },
            });
            apagar(rasc.jsonPath);
            // substituir: só DEPOIS de gravar o novo, tira os comprovantes anteriores (soft delete)
            if (substituir) {
                try {
                    const antigos = await anexoService.listar('DESPESA', despesa.id);
                    for (const a of antigos.filter((x) => x.tipo === 'COMPROVANTE' && x.id !== anexo.id)) await anexoService.remover(a, usuario, { manterArquivo: true });
                } catch (e) { console.error('[CupomDespesa] não removeu o comprovante antigo:', e.message); }
            }

            let status; let motivos; let fornecedorSugeridoId = null;
            if (meta.iaStatus === 'IA_INDISPONIVEL' || !meta.leitura) {
                const dup = await acharDuplicidade({ sha256: meta.sha256, ignorarDespesaId: despesa.id });
                motivos = [motivo('IA_INDISPONIVEL', 'A leitura automática não estava disponível; o escritório confere o comprovante.')];
                if (dup.length) motivos.push(motivo('DUPLICADO', 'Este arquivo já foi usado em outra despesa nos últimos 90 dias.', { iguais: dup }));
                status = 'IA_INDISPONIVEL';
            } else {
                const dup = await acharDuplicidade({ sha256: meta.sha256, cnpj: meta.leitura.fornecedorCnpj, numero: meta.leitura.numero, ignorarDespesaId: despesa.id });
                ({ status, motivos } = conferir({ leitura: meta.leitura, digitado, duplicados: dup }));
                fornecedorSugeridoId = meta.fornecedorSugerido?.id || null;
            }
            await gravarLinha(despesa.id, {
                anexoId: anexo.id, status, motivos, leitura: meta.leitura || null,
                tipoDocumento: meta.tipoDocumento || null, semComprovanteMotivo: null,
                fornecedorSugeridoId, ...dadosDaLeitura(meta.leitura), ...LIMPA_ACEITE,
            });
            return { status, motivos };
        }

        // sem foto
        const m = txt(semComprovanteMotivo, 300);
        const motivos = [motivo('SEM_COMPROVANTE', m ? `Sem comprovante: ${m}` : 'Despesa lançada sem foto do comprovante.')];
        await gravarLinha(despesa.id, {
            status: 'SEM_COMPROVANTE', motivos, anexoId: null, leitura: null, tipoDocumento: null,
            semComprovanteMotivo: m, fornecedorSugeridoId: null, cupomCnpj: null, cupomNumero: null,
            fornecedorNomeLido: null, fornecedorCnpjLido: null, ...LIMPA_ACEITE,
        });
        return { status: 'SEM_COMPROVANTE', motivos };
    } catch (e) {
        console.error('[CupomDespesa] falha ao registrar comprovante (a despesa JÁ está salva):', e);
        return { status: null, motivos: [], comprovanteErro: { codigo: 'FALHA_COMPROVANTE', mensagem: 'A despesa foi salva, mas o comprovante não pôde ser gravado. Anexe de novo pelo detalhe da despesa.' } };
    }
}

/** Valor/litros/categoria mudaram numa despesa que já tem leitura: refaz a comparação (sem IA). Nunca lança. */
async function recalcularParaDespesa(despesa) {
    try {
        const linha = await prisma.despesaComprovante.findUnique({ where: { despesaId: despesa.id } });
        if (!linha || !linha.leitura) return null;
        const capacidade = despesa.categoria === 'COMBUSTIVEL' ? await capacidadeDoVeiculo(despesa.veiculoId) : null;
        const anexo = linha.anexoId ? await anexoService.porId(linha.anexoId) : null;
        const dup = await acharDuplicidade({ sha256: anexo?.sha256, cnpj: linha.cupomCnpj, numero: linha.cupomNumero, ignorarDespesaId: despesa.id });
        const { status, motivos } = conferir({ leitura: linha.leitura, digitado: digitadoDaDespesa(despesa, capacidade), duplicados: dup });
        if (linha.status === 'ACEITA' && JSON.stringify(motivos) === JSON.stringify(linha.motivos) ) return { status: 'ACEITA', motivos };
        await gravarLinha(despesa.id, { status, motivos, ...LIMPA_ACEITE });
        return { status, motivos };
    } catch (e) {
        console.error('[CupomDespesa] recálculo falhou (ignorado):', e.message);
        return null;
    }
}

/** DELETE da despesa: solta o comprovante (soft delete do anexo + linha). Nunca lança. */
async function aoExcluirDespesa(despesaId, usuario) {
    try {
        const anexos = await anexoService.listar('DESPESA', despesaId);
        for (const a of anexos) await anexoService.remover(a, usuario, { manterArquivo: true }); // trilha: arquivo fica no disco
        await prisma.despesaComprovante.deleteMany({ where: { despesaId } });
    } catch (e) {
        console.error('[CupomDespesa] limpeza ao excluir despesa falhou (ignorada):', e.message);
    }
}

/** Anexo COMPROVANTE removido pela rota de anexos: a linha volta a SEM_COMPROVANTE. Nunca lança. */
async function aoRemoverAnexo(anexo) {
    try {
        if (anexo.entidadeTipo !== 'DESPESA' || anexo.tipo !== 'COMPROVANTE') return;
        const restante = (await anexoService.listar('DESPESA', anexo.entidadeId)).find((x) => x.tipo === 'COMPROVANTE');
        if (restante) return;
        const atual = await prisma.despesaComprovante.findUnique({ where: { despesaId: anexo.entidadeId } });
        const trilha = atual ? { status: atual.status, motivos: atual.motivos, aceitaPorNome: atual.aceitaPorNome, aceitaMotivo: atual.aceitaMotivo, removidoEm: new Date().toISOString() } : null;
        await prisma.despesaComprovante.updateMany({
            where: { despesaId: anexo.entidadeId },
            data: { ...(trilha ? { motivosAnteriores: [...(Array.isArray(atual.motivosAnteriores) ? atual.motivosAnteriores : []), trilha] } : {}), status: 'SEM_COMPROVANTE', anexoId: null, leitura: null, tipoDocumento: null, cupomCnpj: null, cupomNumero: null, fornecedorNomeLido: null, fornecedorCnpjLido: null, fornecedorSugeridoId: null, motivos: [motivo('COMPROVANTE_REMOVIDO', 'O comprovante foi removido.')], ...LIMPA_ACEITE },
        });
    } catch (e) {
        console.error('[CupomDespesa] ajuste ao remover anexo falhou (ignorado):', e.message);
    }
}

// ── leitura p/ as telas ─────────────────────────────────────────────────────────
async function fornecedoresPorIds(ids) {
    const lim = [...new Set(ids.filter(Boolean))];
    if (!lim.length) return new Map();
    const fs_ = await prisma.fornecedor.findMany({ where: { id: { in: lim } }, select: { id: true, razaoSocial: true, nomeFantasia: true } });
    return new Map(fs_.map((f) => [f.id, { id: f.id, nome: f.nomeFantasia || f.razaoSocial }]));
}

function formatarLinha(l, fornecedores) {
    if (!l) return null;
    return {
        status: l.status,
        motivos: Array.isArray(l.motivos) ? l.motivos : [],
        motivosAnteriores: Array.isArray(l.motivosAnteriores) ? l.motivosAnteriores : [],
        leitura: l.leitura || null,
        tipoDocumento: l.tipoDocumento || null,
        semComprovanteMotivo: l.semComprovanteMotivo || null,
        fornecedorSugerido: l.fornecedorSugeridoId ? (fornecedores?.get(l.fornecedorSugeridoId) || { id: l.fornecedorSugeridoId, nome: l.fornecedorNomeLido || null }) : null,
        fornecedorNomeLido: l.fornecedorNomeLido || null,
        fornecedorCnpjLido: l.fornecedorCnpjLido || null,
        anexoId: l.anexoId || null,
        aceita: l.aceitaEm ? { porId: l.aceitaPorId, porNome: l.aceitaPorNome, em: l.aceitaEm, motivo: l.aceitaMotivo } : null,
        atualizadoEm: l.atualizadoEm,
    };
}

/**
 * Resumo por despesa para o Caixa/listas: { status, motivos, qtdAnexos, fornecedorSugerido } (sem a leitura bruta).
 * Em qualquer falha devolve um Map vazio (as telas tratam como null). Nunca lança.
 */
async function resumoPorDespesas(despesaIds) {
    const mapa = new Map();
    try {
        const ids = [...new Set((despesaIds || []).filter(Boolean))];
        if (!ids.length) return mapa;
        const [linhas, anexos] = await Promise.all([
            prisma.despesaComprovante.findMany({ where: { despesaId: { in: ids } } }),
            prisma.anexo.groupBy({ by: ['entidadeId'], where: { entidadeTipo: 'DESPESA', ativo: true, entidadeId: { in: ids } }, _count: { _all: true } }),
        ]);
        const qtd = new Map(anexos.map((a) => [a.entidadeId, a._count._all]));
        const forn = await fornecedoresPorIds(linhas.map((l) => l.fornecedorSugeridoId));
        for (const l of linhas) {
            mapa.set(l.despesaId, {
                status: l.status,
                motivos: Array.isArray(l.motivos) ? l.motivos : [],
                qtdAnexos: qtd.get(l.despesaId) || 0,
                fornecedorSugerido: l.fornecedorSugeridoId ? (forn.get(l.fornecedorSugeridoId) || null) : null,
            });
        }
        // anexo sem linha (não deveria): ainda assim informa a quantidade
        for (const [id, q] of qtd) if (!mapa.has(id)) mapa.set(id, { status: null, motivos: [], qtdAnexos: q, fornecedorSugerido: null });
    } catch (e) {
        console.error('[CupomDespesa] resumo por despesas falhou (ignorado):', e.message);
        return new Map();
    }
    return mapa;
}

async function aceitar({ despesaId, motivo: mot, usuario }) {
    const existente = await prisma.despesaComprovante.findUnique({ where: { despesaId } });
    if (existente?.status === 'ACEITA') return { jaAceita: true, linha: existente };
    const dados = { status: 'ACEITA', aceitaPorId: usuario.id, aceitaPorNome: usuario.nome || null, aceitaEm: new Date(), aceitaMotivo: String(mot).trim() };
    const linha = existente
        ? await prisma.despesaComprovante.update({ where: { despesaId }, data: dados })
        : await prisma.despesaComprovante.create({ data: { despesaId, ...dados } });
    return { jaAceita: false, linha };
}

async function detalhe(despesaId) {
    const linha = await prisma.despesaComprovante.findUnique({ where: { despesaId } });
    const fornecedores = await fornecedoresPorIds([linha?.fornecedorSugeridoId]);
    return formatarLinha(linha, fornecedores);
}

module.exports = {
    STATUS, TIPOS_DOC, SYSTEM_PROMPT,
    gerarRef, validarRef, analisarRascunho, analisarArquivo, lerRascunho, conferir, normalizarLeitura,
    registrarParaDespesa, recalcularParaDespesa, aoExcluirDespesa, aoRemoverAnexo,
    resumoPorDespesas, aceitar, detalhe, capacidadeDoVeiculo, fornecedorPorCnpj,
};
