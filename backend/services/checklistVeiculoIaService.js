// Análise de UMA foto do checklist de veículo pela IA (visão).
// REGRA: a IA NUNCA causa erro nem bloqueia o fluxo. Qualquer falha (sem chave, timeout, JSON ruim)
// vira { statusIa: 'IA_INDISPONIVEL', serve: true } e o checklist segue.
const aiProvider = require('./aiProvider');
const { ANGULOS } = require('../config/checklistVeiculoAngulos');

const TIMEOUT_MS = 25000;

const SYSTEM_PROMPT = `Você confere fotos de checklist de um veículo de entregas (salgados congelados) tirada por um
motorista, muitas vezes de madrugada ou à noite, no pátio. Responda SOMENTE um JSON válido.

REGRAS
1. NUNCA reprove nem peça para refazer porque "a foto está escura/baixa luz". Se algo importante
   não está visível, diga o que NÃO consegue ver e o que o motorista deve fazer
   (ex.: "não vejo o pneu traseiro; aproxime 1 m e aponte o flash para o pneu").
2. Só relate o que enxerga. Em caso de dúvida real, use serve=false com motivoRefazer
   ou gravidade ATENCAO. Nunca invente leitura (placa, KM, nível).
3. REPROVA só para risco de segurança ou operação evidente: pneu visivelmente murcho/careca,
   nível de água ou óleo claramente abaixo do mínimo, luz de aviso grave acesa (freio, óleo,
   temperatura, airbag), porta/baú aberto ou danificado, dano grave. A conferência da placa
   com o cadastro é feita pelo sistema: apenas LEIA a placa em leituras.placa, sem julgar. Sujeira leve, risco pequeno, amassado antigo, dúvida = ATENCAO.
4. Frases curtas, em português do Brasil, para quem dirige. Máx. 140 caracteres cada.
5. serve=false SOMENTE se a foto não permite avaliar o ângulo pedido (cortada, borrada, outro
   assunto, ângulo errado). Informe motivoRefazer e como tirar de novo.

FORMATO
{"serve":bool,"motivoRefazer":string|null,
 "problemas":[{"gravidade":"ATENCAO"|"REPROVA","descricao":string,"oQueFazer":string}],
 "leituras":{"placa":string|null,"km":int|null,"combustivel":string|null,
             "luzesAviso":[string],"nivelAgua":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null,
             "nivelOleo":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null}}
Campos não aplicáveis a este ângulo: null (ou [] para lista).`;

const COMPLEMENTO = {
    frente: 'Frente com a placa legível. Leia a placa. Farol quebrado, para-brisa trincado, para-choque, pneus dianteiros murchos.',
    lateral_direita: 'Veículo inteiro de lado. Dois pneus: murcho, careca, parede estufada. Amassado ou risco grande. Pneu não visível: serve=false ou ATENCAO "aproxime do pneu".',
    lateral_esquerda: 'Veículo inteiro de lado. Dois pneus: murcho, careca, parede estufada. Amassado ou risco grande. Pneu não visível: serve=false ou ATENCAO "aproxime do pneu".',
    traseira: 'Placa traseira legível. Leia a placa. Lanternas, porta/baú fechado, para-choque.',
    painel: 'Painel ligado. Leia o odômetro total (km, inteiro), combustível e luzes de aviso acesas. Freio/óleo/temperatura/airbag acesas = REPROVA. KM ilegível: km=null (NÃO é problema).',
    agua_radiador: 'Reservatório com marcas MIN/MAX. Nível abaixo do MIN = REPROVA; entre as marcas = OK; acima do MAX = ATENCAO. Se a marca não aparece: serve=false ("abra o capô e aproxime o celular do reservatório").',
    vareta_oleo: 'Ponta da vareta sobre papel branco. Entre as marcas = OK; abaixo = REPROVA; óleo muito escuro/espesso = ATENCAO.',
    bau: 'Interior do baú: limpo e organizado? Termômetro se visível. Sujeira grande ou carga solta = ATENCAO.',
    porta_malas: 'Mostruário e caixa térmica no lugar, limpeza do porta-malas.',
};

const NIVEIS = ['ABAIXO_MIN', 'OK', 'ACIMA_MAX'];

const IA_INDISPONIVEL = (extra = {}) => ({
    statusIa: 'IA_INDISPONIVEL',
    serve: true,
    motivoRefazer: null,
    problemas: [],
    leituras: null,
    iaModelo: null,
    iaMs: null,
    iaTokens: null,
    ...extra,
});

function texto140(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
}

function extrairJson(txt) {
    let t = String(txt || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(t); } catch { /* tenta recortar */ }
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
    throw new Error('JSON ausente na resposta da IA');
}

/** Validação rígida do JSON devolvido. Lança se o formato não for o combinado. */
function validarResposta(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Resposta da IA não é objeto');
    if (typeof obj.serve !== 'boolean') throw new Error('Campo "serve" ausente ou inválido');
    const problemas = [];
    if (obj.problemas != null) {
        if (!Array.isArray(obj.problemas)) throw new Error('Campo "problemas" inválido');
        for (const p of obj.problemas.slice(0, 8)) {
            if (!p || typeof p !== 'object') continue;
            const gravidade = p.gravidade === 'REPROVA' ? 'REPROVA' : p.gravidade === 'ATENCAO' ? 'ATENCAO' : null;
            const descricao = texto140(p.descricao);
            if (!gravidade || !descricao) continue;
            problemas.push({ gravidade, descricao, oQueFazer: texto140(p.oQueFazer) });
        }
    }
    const l = obj.leituras && typeof obj.leituras === 'object' ? obj.leituras : {};
    const kmNum = Number(l.km);
    const leituras = {
        placa: typeof l.placa === 'string' && l.placa.trim() ? l.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : null,
        km: Number.isFinite(kmNum) && kmNum >= 0 && kmNum < 10000000 && l.km !== null && l.km !== '' ? Math.round(kmNum) : null,
        combustivel: typeof l.combustivel === 'string' && l.combustivel.trim() ? l.combustivel.trim().slice(0, 20) : null,
        luzesAviso: Array.isArray(l.luzesAviso) ? l.luzesAviso.filter(x => typeof x === 'string').map(x => x.slice(0, 40)).slice(0, 12) : [],
        nivelAgua: NIVEIS.includes(l.nivelAgua) ? l.nivelAgua : null,
        nivelOleo: NIVEIS.includes(l.nivelOleo) ? l.nivelOleo : null,
    };
    const motivoRefazer = obj.serve ? null : (texto140(obj.motivoRefazer) || 'Não foi possível avaliar esta foto. Tire de novo, mais perto e com a imagem inteira.');
    return { serve: obj.serve, motivoRefazer, problemas, leituras };
}

function statusDe({ serve, problemas }) {
    if (!serve) return 'REFAZER';
    if (problemas.some(p => p.gravidade === 'REPROVA')) return 'REPROVA';
    if (problemas.length) return 'ATENCAO';
    return 'OK';
}

/**
 * @param {{buffer:Buffer, mime:string, angulo:string, veiculo:{placa,modelo}, tipo:string,
 *          kmDigitado?:number, ultimoKmFinal?:number, luzOleoAcesa?:boolean}} p
 */
async function analisarFoto(p) {
    const t0 = Date.now();
    try {
        if (!aiProvider.isConfigured()) return IA_INDISPONIVEL({ motivo: 'sem_chave' });
        const rotulo = ANGULOS[p.angulo]?.rotulo || p.angulo;
        const linhas = [
            `Veículo: ${p.veiculo?.modelo || '?'}, tipo ${p.tipo}. Ângulo: ${rotulo}.`,
            COMPLEMENTO[p.angulo] || '',
        ];
        if (p.angulo === 'painel' && p.luzOleoAcesa) linhas.push('O motorista informou que a luz de óleo está acesa.');
        const r = await aiProvider.analisarImagem({
            system: SYSTEM_PROMPT,
            texto: linhas.filter(Boolean).join('\n'),
            imagens: [{ base64: p.buffer.toString('base64'), mime: p.mime || 'image/jpeg' }],
            maxTokens: 2500,
            json: true,
            timeoutMs: TIMEOUT_MS,
        });
        const v = validarResposta(extrairJson(r.texto));
        return {
            statusIa: statusDe(v),
            serve: v.serve,
            motivoRefazer: v.motivoRefazer,
            problemas: v.problemas,
            leituras: v.leituras,
            iaModelo: r.modelo,
            iaMs: Date.now() - t0,
            iaTokens: r.usage?.total ?? null,
        };
    } catch (e) {
        console.error('[ChecklistVeiculoIA] análise indisponível:', e.message);
        return IA_INDISPONIVEL({ iaMs: Date.now() - t0, motivo: 'erro' });
    }
}

module.exports = { analisarFoto, validarResposta, extrairJson, statusDe, SYSTEM_PROMPT };
