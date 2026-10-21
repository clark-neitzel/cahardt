// Funções puras do checklist de veículo por foto, compartilhadas pelo motorista (Diario/*)
// e pelo escritório (pages/Veiculos/*). Contrato: docs/checklist-veiculo/PLANO-dia2.md, seção 5.
import { urlImagem } from '../services/checklistVeiculoService';

export const ORDEM_GRUPOS = ['FORA', 'PAINEL', 'CAPO', 'CARGA'];

export const TITULO_GRUPO = {
    FORA: '1 · Por fora (capô fechado)',
    PAINEL: '2 · Painel (porta fechada, chave ligada)',
    CAPO: '3 · Capô aberto',
    CARGA: '4 · Baú / Porta-malas',
};

const DICA_FALLBACK = {
    FORA: 'Fotos de fora com o capô fechado',
    PAINEL: 'Porta fechada, chave ligada, sem flash',
    CAPO: 'Agora pode abrir o capô',
    CARGA: 'Por último, abre o baú ou o porta-malas',
};

// Fallback quando o servidor não manda `grupo` (config antiga).
const GRUPO_FALLBACK = {
    frente: 'FORA', lateral_direita: 'FORA', lateral_esquerda: 'FORA', traseira: 'FORA',
    painel: 'PAINEL', agua_radiador: 'CAPO', vareta_oleo: 'CAPO', bau: 'CARGA', porta_malas: 'CARGA',
};

export const grupoDoSlot = (slot) => {
    const g = slot?.grupo || GRUPO_FALLBACK[slot?.angulo];
    return ORDEM_GRUPOS.includes(g) ? g : 'CARGA';
};

/** [{ grupo, titulo, dica, slots }] na ordem FORA, PAINEL, CAPO, CARGA (só grupos que existem). */
export function agruparSlots(slots) {
    const lista = [...(slots || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    return ORDEM_GRUPOS
        .map((grupo) => {
            const doGrupo = lista.filter((s) => grupoDoSlot(s) === grupo);
            return {
                grupo,
                titulo: TITULO_GRUPO[grupo],
                dica: doGrupo.find((s) => s.dicaGrupo)?.dicaGrupo || DICA_FALLBACK[grupo],
                slots: doGrupo,
            };
        })
        .filter((g) => g.slots.length > 0);
}

/** Foto principal ATIVA do ângulo (a última que não é complemento). */
export function fotoPrincipal(fotos, angulo) {
    const lista = (fotos || []).filter((f) => f.angulo === angulo && f.complemento !== true);
    return lista.length ? lista[lista.length - 1] : null;
}

/** Foto extra (complemento) do ângulo, se houver. */
export function complementoDe(fotos, angulo) {
    const lista = (fotos || []).filter((f) => f.angulo === angulo && f.complemento === true);
    return lista.length ? lista[lista.length - 1] : null;
}

const problemasDe = (foto) => (Array.isArray(foto?.problemas) ? foto.problemas : []);
const ehPergunta = (p) => p && p.gravidade === 'PERGUNTA';
const perguntaAberta = (p) => ehPergunta(p) && !p.resposta;
// Gravidade que vale para o problema (PERGUNTA respondida NAO vira ATENCAO/REPROVA)
const gravEfetiva = (p) => {
    if (!p) return 'OK';
    if (ehPergunta(p)) {
        if (p.resposta === 'NAO') return p.gravidadeAplicada === 'REPROVA' ? 'REPROVA' : 'ATENCAO';
        return p.resposta === 'SIM' ? 'OK' : 'PERGUNTA';
    }
    return p.gravidade === 'REPROVA' ? 'REPROVA' : 'ATENCAO';
};

export const temPerguntaAberta = (foto) => problemasDe(foto).some(perguntaAberta);

/** A foto está resolvida para o motorista (não pede mais nada dele)? */
export const fotoResolvida = (foto) => !!foto && (foto.serve !== false || foto.aceitaPeloMotorista === true);

const corta = (txt, n = 14) => {
    const s = String(txt || '').trim();
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/**
 * Estado do quadrinho em UMA palavra.
 * @returns {{ codigo, palavra, faixa, moldura, camera }}
 *   camera=true só no quadrinho vazio.
 */
export function estadoDoQuadrinho(foto, { envio, pulada } = {}) {
    if (envio && (envio.fase === 'enviando' || envio.fase === 'analisando')) {
        return { codigo: 'ENVIANDO', palavra: envio.fase === 'enviando' ? 'Enviando…' : 'Analisando…',
            faixa: 'bg-gray-800/80 text-white', moldura: 'border-gray-300 bg-gray-100', camera: false };
    }
    if (!foto) {
        if (pulada) return { codigo: 'PULADA', palavra: 'Pulada (teste)', faixa: 'bg-gray-500 text-white', moldura: 'border-gray-300 bg-gray-100', camera: false };
        return { codigo: 'VAZIO', palavra: null, faixa: null, moldura: 'border-dashed border-gray-300 bg-gray-50', camera: true };
    }
    const probs = problemasDe(foto);
    const curto = probs.find((p) => !ehPergunta(p) && p.curto)?.curto || probs.find((p) => p.curto)?.curto;
    const st = foto.statusIa;
    if (foto.aceitaPeloMotorista === true && (foto.serve === false || st === 'ATENCAO' || st === 'REFAZER')) {
        return { codigo: 'ACEITA', palavra: '✓ aceita', faixa: 'bg-green-600 text-white', moldura: 'border-green-500', camera: false };
    }
    if (foto.serve === false || st === 'REFAZER') {
        return { codigo: 'REFAZER', palavra: `↻ ${corta(curto) || 'refazer'}`, faixa: 'bg-red-600 text-white', moldura: 'border-red-400 bg-red-50', camera: false };
    }
    if (st === 'IA_INDISPONIVEL' || st === 'NAO_ANALISADA') {
        return { codigo: 'SEM_ANALISE', palavra: 'sem análise', faixa: 'bg-gray-700/85 text-white', moldura: 'border-gray-400 bg-gray-50', camera: false };
    }
    if (probs.some(perguntaAberta) || st === 'PERGUNTA') {
        return { codigo: 'PERGUNTA', palavra: '? pergunta', faixa: 'bg-amber-500 text-white', moldura: 'border-amber-400', camera: false };
    }
    if (st === 'REPROVA' || probs.some((p) => gravEfetiva(p) === 'REPROVA')) {
        return { codigo: 'REPROVA', palavra: `✕ ${corta(curto) || 'problema'}`, faixa: 'bg-red-600 text-white', moldura: 'border-red-400', camera: false };
    }
    if (st === 'ATENCAO' || probs.some((p) => gravEfetiva(p) === 'ATENCAO')) {
        return { codigo: 'ATENCAO', palavra: `⚠ ${corta(curto) || 'atenção'}`, faixa: 'bg-amber-500 text-white', moldura: 'border-amber-400', camera: false };
    }
    return { codigo: 'OK', palavra: '✓ ok', faixa: 'bg-green-600 text-white', moldura: 'border-green-500', camera: false };
}

/** Parecer da foto para o visualizador: { gravidade, titulo, oQueFazer } ou null quando está tudo bem. */
export function parecerDaFoto(foto) {
    if (!foto) return null;
    const probs = problemasDe(foto);
    const reprova = probs.find((p) => !ehPergunta(p) && gravEfetiva(p) === 'REPROVA')
        || probs.find((p) => ehPergunta(p) && gravEfetiva(p) === 'REPROVA');
    if (reprova) return { gravidade: 'REPROVA', titulo: reprova.descricao || 'Problema na foto', oQueFazer: reprova.oQueFazer || '' };
    if (foto.serve === false) {
        return { gravidade: 'REFAZER', titulo: foto.motivoRefazer || probs[0]?.descricao || 'Esta foto precisa ser refeita',
            oQueFazer: probs[0]?.oQueFazer || 'Tire a foto de novo.' };
    }
    const aberta = probs.find(perguntaAberta);
    if (aberta) return { gravidade: 'PERGUNTA', titulo: aberta.descricao || aberta.pergunta || 'Confirma uma coisa?', oQueFazer: aberta.oQueFazer || '' };
    const atencao = probs.find((p) => gravEfetiva(p) === 'ATENCAO');
    if (atencao) return { gravidade: 'ATENCAO', titulo: atencao.descricao || 'Atenção', oQueFazer: atencao.oQueFazer || '' };
    return null;
}

/** Perguntas (abertas e respondidas) da foto, com o índice que o /responder espera. */
export function perguntasDaFoto(foto) {
    return problemasDe(foto)
        .map((p, indice) => (ehPergunta(p) ? { indice, texto: p.pergunta || p.descricao || '', resposta: p.resposta || null } : null))
        .filter(Boolean);
}

/**
 * Slides para o VisualizadorFotos.
 *   fotos  = checklist.fotos (principais + complementos)
 *   slots  = config.slots (ou [{angulo, rotulo}]) na ordem de exibição
 *   opcoes = { editavel, modo }
 */
export function montarSlides(fotos, slots, { editavel = false, modo = 'motorista' } = {}) {
    const ordenados = [...(slots || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const slides = [];
    for (const s of ordenados) {
        const foto = fotoPrincipal(fotos, s.angulo);
        if (!foto) continue;
        const comp = complementoDe(fotos, s.angulo);
        slides.push({
            chave: foto.id || s.angulo,
            angulo: s.angulo,
            fotoId: foto.id,
            rotulo: s.rotulo || s.angulo,
            url: urlImagem(foto.url),
            statusIa: foto.statusIa,
            serve: foto.serve,
            aceitaPeloMotorista: foto.aceitaPeloMotorista === true,
            aceitaEm: foto.aceitaEm || null,
            leituras: foto.leituras || null,
            parecer: parecerDaFoto(foto),
            perguntas: perguntasDaFoto(foto),
            complementoRotulo: s.complementoRotulo || null,
            complemento: comp ? { url: urlImagem(comp.url) } : null,
            editavel: editavel && modo === 'motorista',
        });
    }
    return slides;
}

/** KM lido pela IA no painel (foto principal), ou null. */
export function kmLidoDoPainel(fotos) {
    const f = fotoPrincipal(fotos, 'painel');
    const km = Number(f?.leituras?.km);
    return Number.isFinite(km) && km > 0 ? { km, fotoId: f.id } : null;
}
