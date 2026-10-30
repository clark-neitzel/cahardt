// Análise de UMA foto do checklist de veículo pela IA (visão).
// REGRA: a IA NUNCA causa erro nem bloqueia o fluxo. Qualquer falha (sem chave, timeout, JSON ruim)
// vira { statusIa: 'IA_INDISPONIVEL', serve: true } e o checklist segue.
const fs = require('fs');
const path = require('path');
const aiProvider = require('./aiProvider');
const { ANGULOS } = require('../config/checklistVeiculoAngulos');

const TIMEOUT_MS = 40000; // prompt do Dia 2 é maior: fotos de painel chegaram a 17-20 s

const SYSTEM_PROMPT = `Você confere fotos de checklist de um carro/caminhão de entregas (salgados congelados) tiradas
por um motorista no pátio da empresa, muitas vezes de madrugada. Responda SOMENTE um JSON válido.

CONTEXTO FIXO
O carro está PARADO no pátio, chave ligada, motor desligado ou em marcha lenta. Freio de mão puxado,
porta aberta e cinto solto são NORMAIS neste momento: a luz de freio (vermelha, símbolo de freio, P ou !),
a luz de porta aberta e a luz de cinto NÃO são problema.

COMO FALAR (vale para TODA frase que o motorista lê: descricao, oQueFazer, motivoRefazer, pergunta)
- No máximo 2 frases curtas. A PRIMEIRA diz o que fazer. Fale com "você", verbo no imperativo informal
  ("chega", "afasta", "fecha", "tira de novo", "abastece").
- PROIBIDO usar as palavras: veículo, compartimento, nítido, avaliar, "não consigo". Sem ponto de exclamação.
- Quando o problema é enquadramento (cortado, longe, perto), a resposta OBRIGATORIAMENTE diz "mais perto"
  ou "mais longe" (ou "chega"/"afasta") com uma medida em passos ou centímetros.
- Máx. 140 caracteres cada frase. "confira"/"verifique" não: use "confere"/"olha".
- NÃO repita a mesma frase: "descricao" diz o que está errado (curto, 3 a 8 palavras); "oQueFazer" diz a ação.
Exemplos do tom certo:
  "Afasta uns 4 passos e pega o carro inteiro."
  "Fecha o capô e tira de novo. Primeiro as fotos de fora, depois abre o capô."
  "Afasta uns 30 cm e pega o reservatório inteiro, com as letras MIN e MAX."
  "Chega a 20 cm da pontinha da vareta, com ela ocupando a foto toda. Fundo claro ajuda."
  "Abastece antes da rota."
  "Para-choque raspado. Já era assim?"
  "Porta-malas ok: bolsas no lugar, piso limpo."

REGRAS
1. NUNCA reprove nem peça para refazer só porque a foto está escura. Se algo importante não aparece, diga
   o que fazer (chegar, afastar, fechar o capô). Não mande ligar flash no painel.
2. Só relate o que enxerga. Nunca invente leitura (placa, KM, nível).
3. REPROVA só para risco de segurança evidente: pneu visivelmente murcho/careca, nível de água ou óleo
   CLARAMENTE abaixo do mínimo, e no painel SOMENTE estas luzes acesas: óleo (lata pingando),
   temperatura (termômetro), bateria, motor/check engine, airbag, ABS, direção. Dano grave também.
   Sujeira leve, risco pequeno, amassado antigo, dúvida = ATENCAO.
   Nível de óleo/água: só REPROVA se você VÊ com clareza as marcas e o nível claramente abaixo delas.
   Foto desfocada, ponta ilegível ou marcas apagadas: NUNCA reprova nem chuta nível; devolva PERGUNTA.
4. Luz de freio, de porta aberta ou de cinto: liste em leituras.luzesAviso e gere NO MÁXIMO um problema com
   gravidade "PERGUNTA" (nunca REPROVA nem ATENCAO). Ex.: descricao "Tem luz de freio no painel.",
   pergunta "É o freio de mão puxado?", seNao "ATENCAO". Junte freio+porta+cinto numa pergunta só.
5. Combustível: só aponte baixo se o ponteiro está CLARAMENTE no E/reserva (vermelho/zona final) ou a luz de reserva está acesa:
   aí ATENCAO, oQueFazer "Abastece antes da rota." e luzesAviso inclui "reserva". O mostrador de combustível é pequeno e o ponteiro engana: só afirme reserva se a LUZ de reserva (ícone de bomba) está acesa
   ou se o ponteiro está INEQUIVOCAMENTE encostado no E. Só ponha "reserva" em luzesAviso quando a luz da bomba está acesa. Ponteiro no meio, perto do F ou na dúvida:
   leituras.combustivel null e NENHUM problema de combustível.
6. Outras luzes de aviso (triângulo, injeção, etc.): ATENCAO com pergunta curta se você não souber qual é.
7. A placa é conferida pelo sistema: apenas LEIA a placa em leituras.placa, sem julgar.
8. serve=false SOMENTE se a foto não permite ver o ângulo pedido (cortada, longe demais, borrada, outro
   assunto). Informe motivoRefazer com a medida (passos/cm). Se a foto dá para aproveitar, use serve=true
   com ATENCAO em vez de pedir de novo.
9. PERGUNTA = você não consegue confirmar sozinho e o motorista pode responder Sim/Não olhando o carro.
   Sempre com "pergunta" (curta, resposta Sim/Não) e "seNao" ("ATENCAO" ou "REPROVA": o que acontece se
   ele responder Não).

FORMATO
{"serve":bool,"motivoRefazer":string|null,
 "problemas":[{"gravidade":"ATENCAO"|"REPROVA"|"PERGUNTA","descricao":string,"oQueFazer":string,
               "pergunta":string (só PERGUNTA),"seNao":"ATENCAO"|"REPROVA" (só PERGUNTA)}],
 "leituras":{"placa":string|null,"km":int|null,"kmConfianca":"ALTA"|"BAIXA"|null,"combustivel":string|null,
             "luzesAviso":[string]  (use só: freio, porta, cinto, oleo, temperatura, bateria, motor, airbag, abs, direcao, reserva, outra),"nivelAgua":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null,
             "nivelOleo":"ABAIXO_MIN"|"OK"|"ACIMA_MAX"|null}}
Campos não aplicáveis a este ângulo: null (ou [] para lista). Foto sem problema: "problemas":[].`;

// Leitura do odômetro: erro conhecido da IA é PERDER ou TROCAR um dígito (ex.: 273577 lido 73577; 160681 lido 16068).
const REGRA_ODOMETRO = `LEITURA DO ODÔMETRO (importante): leia o número TOTAL de quilometragem (o maior, com 5 ou 6 dígitos na maioria dos carros),
NUNCA o parcial/trip (A/B, "TRIP"), nem o relógio, nem a temperatura. Leia DÍGITO A DÍGITO, da esquerda para a direita, e conte os dígitos:
não pule o primeiro nem o último (o primeiro dígito costuma ficar colado na borda do visor). Se o visor é analógico (roletes), leia cada rolete.
Se algum dígito está cortado, borrado ou com reflexo e você não tem certeza, devolva km=null (melhor sem número do que um número errado).
Preencha leituras.kmConfianca: "ALTA" se leu todos os dígitos com clareza; "BAIXA" se teve dúvida em algum dígito.`;

const COMPLEMENTO = {
    frente: `FRENTE. O motorista deve estar a ~3 passos (4 m), com a FRENTE TODA do carro dentro do quadro: capô, faróis, grade, PLACA legível, para-choque e o PARA-BRISA inteiro visível.
As rodas NÃO são exigidas nesta foto: a ausência delas NUNCA gera ATENCAO nem pedido para afastar. Pneu/roda só é avaliado se aparecer.
Leia a placa. Veja farol quebrado, para-brisa trincado, para-choque danificado; se os pneus dianteiros aparecerem, veja se estão murchos.
Se o PARA-BRISA estiver cortado/fora do quadro, ou o teto/parte de cima do carro cortado: serve=true (NUNCA serve=false por isso) e ATENCAO com oQueFazer curto, sempre com a medida "3 passos", ex.: "Chega 3 passos pra trás: preciso ver o para-brisa e a frente toda."
Se a placa estiver cortada ou ilegível: ATENCAO pedindo para ajustar o enquadramento (chega/afasta com medida em passos).
Capô aberto: ATENCAO "Fecha o capô e tira de novo. Primeiro as fotos de fora, depois abre o capô."`,
    lateral_direita: null,
    lateral_esquerda: null,
    traseira: `TRASEIRA. O motorista deve estar a ~2 passos, com placa e lanternas no quadro e a porta do baú FECHADA.
Leia a placa. Veja lanternas quebradas, para-choque, porta do baú aberta (ATENCAO "Fecha a porta do baú e tira de novo.").
Pintura raspada ou risco pequeno antigo: ATENCAO com PERGUNTA "Já era assim?" (seNao "ATENCAO"), nunca "confira se as peças estão firmes".`,
    painel: `PAINEL. Leia o odômetro total (KM, número inteiro; se não dá para ler, km=null e NÃO é problema),
${REGRA_ODOMETRO}
o combustível e todas as luzes acesas (leituras.luzesAviso). Lembre: carro parado, freio de mão e porta aberta são normais.
Só óleo, temperatura, bateria, motor, airbag, ABS, direção acesas = REPROVA. Freio/porta/cinto = uma PERGUNTA no máximo.
Combustível: ATENCAO "Abastece antes da rota." SÓ se o ponteiro está claramente no E/reserva ou a luz de reserva acesa; na dúvida combustivel=null e nada de ATENCAO. Sem flash: reflexo no vidro atrapalha;
se o reflexo cobre o painel, serve=false com "Inclina um pouco o celular pra tirar o reflexo."`,
    agua_radiador: `ÁGUA DO RADIADOR. Foto a ~30 cm, reservatório inteiro com as marcas MIN e MAX.
O reservatório pode ser OPACO/sujo. Três casos:
 a) Marcas MIN/MAX e nível visíveis: abaixo do MIN = REPROVA; entre as marcas = OK (nivelAgua OK); acima do MAX = ATENCAO.
 b) Marcas MIN/MAX aparecem mas o nível NÃO dá para ver (plástico opaco/sujo): NÃO peça para refazer (serve=true). Devolva PERGUNTA
    descricao "Não dá pra ver o nível por fora.", pergunta "Acende a lanterna atrás dele ou abre a tampa e olha: a água tá entre MIN e MAX?", seNao "ATENCAO".
 c) Nem as marcas aparecem (longe, cortado, borrado): serve=false, motivoRefazer "Afasta uns 30 cm e pega o reservatório inteiro, com as letras MIN e MAX."`,
    vareta_oleo: `VARETA DE ÓLEO. Dois tipos:
 - Plástico laranja com uma área quadriculada (Uno, Fiat, Celta e semelhantes): nível OK = óleo molhando DENTRO do quadriculado; abaixo ou acima do quadriculado = ATENCAO/REPROVA se claramente fora.
 - Metal com duas marcas ou furos (Bongo, Fiorino): nível OK = óleo ENTRE as duas marcas; abaixo da marca de baixo = REPROVA.
Decida o tipo pelo modelo do carro e confirme pela foto; na dúvida, vale o que a foto mostra.
NUNCA peça papel branco; peça "fundo claro" e "chega a 20 cm da pontinha, ela ocupando a foto".
Se a ponta aparece mas dá para ler o nível: nivelOleo e OK sem problema. Se NÃO dá para ler o nível: serve=true e PERGUNTA
descricao "Não deu pra ler o nível do óleo.", pergunta "O óleo tá molhando dentro do quadriculado (ou entre as duas marcas)?", seNao "ATENCAO".
Só serve=false se a ponta da vareta nem aparece: motivoRefazer "Chega a 20 cm da pontinha da vareta, com ela ocupando a foto toda."
Óleo muito escuro/espesso = ATENCAO.`,
    bau: 'BAÚ por dentro: limpo e organizado? Termômetro se visível. Sujeira grande ou carga solta = ATENCAO. Se está limpo e organizado: sem problemas.',
    porta_malas: `PORTA-MALAS (carro de passeio). Olhe SÓ organização, limpeza do piso e tampa/porta. NÃO procure "mostruário" nem "caixa térmica":
as bolsas pretas são o mostruário e são normais. Bolsas no lugar e piso limpo = sem problemas (frase de OK: "Porta-malas ok: bolsas no lugar, piso limpo.").`,
};
const COMPLEMENTO_LATERAL = `LATERAL. O motorista deve estar a ~4 passos (5 m), no meio do carro, com o carro INTEIRO e as DUAS rodas no quadro.
Pneu murcho, careca, parede estufada; amassado ou risco grande. Se o carro está cortado ou uma roda não aparece:
serve=true e ATENCAO "Afasta até pegar o carro inteiro." (ou serve=false se não dá para ver nada).
Capô aberto aparecendo: ATENCAO "Fecha o capô e tira de novo. Primeiro as fotos de fora, depois abre o capô."
Pintura raspada ou risco pequeno antigo: ATENCAO com PERGUNTA "Já era assim?" (seNao "ATENCAO").`;
COMPLEMENTO.lateral_direita = COMPLEMENTO_LATERAL;
COMPLEMENTO.lateral_esquerda = COMPLEMENTO_LATERAL;

// Volta do dia (Dia 3): o carro voltou da rota, está no pátio. Sobrepõe as regras de saída.
const CONTEXTO_VOLTA = `ESTA É A FOTO DE VOLTA: o carro acabou de voltar da rota de entregas e está parado no pátio.
Poeira, barro e sujeira leve de rua são NORMAIS; não reclame disso. Combustível baixo NÃO é problema na volta
(não gere problema de combustível). Placa e KM: apenas LEIA em leituras. Dano novo e evidente (amassado, lanterna
quebrada, pneu murcho) continua sendo ATENCAO, com PERGUNTA "Já era assim?" quando puder ser antigo.`;
const COMPLEMENTO_VOLTA = {
    bau: 'BAÚ por dentro NA VOLTA: o certo é estar VAZIO e LIMPO. Sobra de produto, caixa, lixo ou sujeira = ATENCAO ("Tira o que sobrou e limpa o baú."). Baú vazio e limpo: sem problemas, NÃO reclame que está vazio.',
    porta_malas: 'PORTA-MALAS NA VOLTA: o certo é estar vazio e limpo (as bolsas pretas do mostruário podem ficar e são normais). Sobra de produto, lixo ou sujeira = ATENCAO. Vazio e limpo: sem problemas.',
    traseira: `TRASEIRA NA VOLTA. O motorista deve estar a ~2 passos, placa e lanternas no quadro, porta do baú FECHADA.
Leia a placa. Veja lanternas quebradas, para-choque amassado, porta do baú aberta (ATENCAO "Fecha a porta do baú e tira de novo.").`,
    painel: `PAINEL NA VOLTA. A tarefa principal é LER o odômetro total (KM, número inteiro; se não dá para ler, km=null e NÃO é problema).
${REGRA_ODOMETRO}
Anote também as luzes acesas em leituras.luzesAviso. Só óleo, temperatura, bateria, motor, airbag, ABS, direção acesas = REPROVA.
Freio/porta/cinto = uma PERGUNTA no máximo. NÃO fale de combustível. Se o reflexo cobre o painel, serve=false com "Inclina um pouco o celular pra tirar o reflexo."`,
};

// Foto de REFERÊNCIA = a ÚLTIMA foto aprovada deste mesmo veículo no mesmo ângulo (vinda do serviço).
// A foto modelo (catálogo) é só orientação ao motorista na tela e NÃO vai para a IA.
// Só ângulos de carroceria/interior com enquadramento comparável (baú/porta-malas, painel, água e vareta ficam de fora).
const ANGULOS_COM_REFERENCIA = ['frente', 'traseira', 'lateral_direita', 'lateral_esquerda'];
const REFERENCIA_MAX_LADO = 768; // px: menos tokens e menos tempo

function textoReferencia(ref) {
    const quando = ref?.quando ? `de ${ref.quando}${ref.momento ? `, ${ref.momento === 'VOLTA' ? 'volta' : 'saída'}` : ''}` : '';
    return `FOTO ANTERIOR. Imagem 1 = foto de AGORA. Imagem 2 = a ÚLTIMA foto deste mesmo veículo neste ângulo${quando ? ` (${quando})` : ''}.
Aponte o que é DIFERENTE e NOVO na imagem 1: amassado, risco ou raspão que não estava, peça/lanterna/retrovisor faltando ou quebrado, vidro trincado, pneu diferente, porta aberta.
Dano NOVO (que não está na imagem 2) = ATENCAO, ou PERGUNTA "Já era assim?" se for pequeno, como nas regras do ângulo.
Avaria ESTÉTICA que JÁ aparece na imagem 2 (risco, raspão, pintura gasta, amassado leve) NÃO é novidade: não pergunte "já era assim?" e não gere problema por ela.
REGRA QUE VENCE AS DEMAIS: olhando SÓ a imagem 1, como se a imagem 2 não existisse, confira se há dano de SEGURANÇA: pneu murcho/careca, vidro/para-brisa trincado, farol/lanterna/retrovisor quebrado ou faltando. Se houver, REPORTE (ATENCAO) como nas regras do ângulo MESMO que a imagem 2 mostre o mesmo dano: dizer que "já estava na foto anterior" NUNCA é motivo para calar dano de segurança; na dúvida entre trinca e marca, pergunte "O para-brisa está trincado?" (PERGUNTA) em vez de calar. Só a avaria estética que a imagem 2 já mostrava (risco, raspão, pintura gasta, amassado leve) fica sem comentário.
Diferença de luz, clima, fundo, chão, sujeira normal e pequenas diferenças de enquadramento NÃO são problema. NUNCA serve=false por parecer diferente da imagem 2. Se a imagem 1 mostra OUTRO carro ou OUTRO lado, vale a regra 8. Na dúvida, não peça.
As demais regras deste ângulo continuam valendo; a imagem 2 só ACRESCENTA a comparação. Placa e leituras são da imagem 1.`;
}

/** Lê e reduz a foto de referência. Caminho tem que ficar dentro de backend/uploads. Qualquer falha devolve null. */
async function prepararReferencia(caminhoDb) {
    try {
        const rel = String(caminhoDb || '');
        if (!rel.startsWith('/uploads/')) return null;
        const base = path.resolve(__dirname, '../uploads');
        const abs = path.resolve(base, rel.slice('/uploads/'.length));
        if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs)) return null;
        const sharp = require('sharp');
        const buf = await sharp(abs).rotate().resize(REFERENCIA_MAX_LADO, REFERENCIA_MAX_LADO, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        return { base64: buf.toString('base64'), mime: 'image/jpeg' };
    } catch (e) {
        console.error('[ChecklistVeiculoIA] foto de referência indisponível:', e.message);
        return null;
    }
}

const EXTRA_ULTIMA_TENTATIVA = 'ESTA É A ÚLTIMA TENTATIVA: NÃO peça para refazer (serve=true). Avalie o que dá e, se não der para avaliar, devolva uma PERGUNTA.';

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

const LUZES_VOCAB = [
    ['abs', /\babs\b/i], ['freio', /freio|brake|handbrake/i], ['porta', /porta|door/i], ['cinto', /cinto|seat ?belt/i],
    ['oleo', /[óo]leo|oil/i], ['temperatura', /temperatura|term[oô]metro|superaquec|coolant/i],
    ['bateria', /bateria|carga|battery|alternador/i], ['motor', /\bmotor\b|inje[cç][aã]o|check ?engine/i],
    ['airbag', /air ?bag/i], ['direcao', /dire[cç][aã]o|volante|steering/i],
    ['reserva', /reserva|combust[ií]vel/i],
];
/** Vocabulário fixo: freio, porta, cinto, oleo, temperatura, bateria, motor, airbag, abs, direcao, reserva, outra. */
function normalizarLuzes(lista) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    for (const x of lista) {
        if (typeof x !== 'string' || !x.trim()) continue;
        const hit = LUZES_VOCAB.find(([, re]) => re.test(x));
        const k = hit ? hit[0] : 'outra';
        if (!out.includes(k)) out.push(k);
    }
    return out.slice(0, 12);
}

/** No máximo 1 PERGUNTA por foto (mantém a primeira). */
function umaPerguntaPorFoto(problemas) {
    let achou = false;
    return problemas.filter((q) => {
        if (q.gravidade !== 'PERGUNTA') return true;
        if (achou) return false;
        achou = true;
        return true;
    });
}

/** Validação rígida do JSON devolvido. Lança se o formato não for o combinado. */
function validarResposta(obj, angulo) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Resposta da IA não é objeto');
    if (typeof obj.serve !== 'boolean') throw new Error('Campo "serve" ausente ou inválido');
    const problemas = [];
    if (obj.problemas != null) {
        if (!Array.isArray(obj.problemas)) throw new Error('Campo "problemas" inválido');
        for (let p of obj.problemas.slice(0, 8)) {
            if (!p || typeof p !== 'object') continue;
            let gravidade = ['REPROVA', 'ATENCAO', 'PERGUNTA'].includes(p.gravidade) ? p.gravidade : null;
            const descricao = texto140(p.descricao);
            if (!gravidade || !descricao) continue;
            let oQueFazer = texto140(p.oQueFazer);
            // Evita a mesma frase duas vezes (descricao + oQueFazer)
            const norm = (t) => t.toLowerCase().replace(/[^a-zà-ú0-9 ]/g, '').trim();
            if (oQueFazer && norm(descricao).includes(norm(oQueFazer))) oQueFazer = '';
            const frases = descricao.split(/(?<=[.?])\s+/);
            const descLimpa = frases.filter((f) => !oQueFazer || !norm(oQueFazer).includes(norm(f))).join(' ') || descricao;
            // Rede de segurança: no painel, freio/porta/cinto nunca reprovam nem pedem atenção (carro parado no pátio).
            if (angulo === 'painel' && gravidade !== 'PERGUNTA' && /freio|porta|cinto/i.test(descricao)
                && !/[óo]leo|temperatura|bateria|\bmotor\b|airbag|\babs\b|dire[cç][aã]o/i.test(descricao)) {
                gravidade = 'PERGUNTA';
                const tf = /freio/i.test(descricao), tp = /porta/i.test(descricao), tc = /cinto/i.test(descricao);
                const pergunta = (tf && tp) ? 'É o freio de mão puxado e a porta aberta?'
                    : tf ? 'O freio de mão está puxado?'
                    : tp ? 'A porta está aberta?'
                    : tc ? 'É o cinto que está solto?'
                    : 'É o freio de mão puxado e a porta aberta?';
                p = { ...p, pergunta, seNao: 'ATENCAO' };
            }
            if (gravidade === 'PERGUNTA') {
                const pergunta = texto140(p.pergunta) || 'Você conferiu e está tudo certo?';
                problemas.push({ gravidade, descricao, oQueFazer: '', pergunta, seNao: p.seNao === 'REPROVA' ? 'REPROVA' : 'ATENCAO' });
            } else {
                problemas.push({ gravidade, descricao: descLimpa, oQueFazer });
            }
        }
    }
    // no máximo 1 PERGUNTA por foto (mantém a primeira)
    const problemasUnicos = umaPerguntaPorFoto(problemas);
    problemas.length = 0;
    problemas.push(...problemasUnicos);
    const l = obj.leituras && typeof obj.leituras === 'object' ? obj.leituras : {};
    const kmNum = Number(l.km);
    const leituras = {
        placa: typeof l.placa === 'string' && l.placa.trim() ? l.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : null,
        kmConfianca: l.kmConfianca === 'ALTA' || l.kmConfianca === 'BAIXA' ? l.kmConfianca : null,
        km: Number.isFinite(kmNum) && kmNum >= 0 && kmNum < 10000000 && l.km !== null && l.km !== '' ? Math.round(kmNum) : null,
        combustivel: typeof l.combustivel === 'string' && l.combustivel.trim() ? l.combustivel.trim().slice(0, 20) : null,
        luzesAviso: normalizarLuzes(l.luzesAviso),
        nivelAgua: NIVEIS.includes(l.nivelAgua) ? l.nivelAgua : null,
        nivelOleo: NIVEIS.includes(l.nivelOleo) ? l.nivelOleo : null,
    };
    // Combustível só vira problema se a leitura é firme (ponteiro claramente no E ou luz de reserva): na dúvida, nada.
    if (angulo === 'painel' && !leituras.combustivel && !leituras.luzesAviso.includes('reserva')) {
        for (let i = problemas.length - 1; i >= 0; i--) {
            if (/combust|reserva|tanque|abaste/i.test(`${problemas[i].descricao} ${problemas[i].oQueFazer}`)) problemas.splice(i, 1);
        }
    }
    const motivoRefazer = obj.serve ? null : (texto140(obj.motivoRefazer) || 'Não deu pra ver a foto. Tira de novo, mais perto e com a imagem inteira.');
    return { serve: obj.serve, motivoRefazer, problemas, leituras };
}

/** Gravidade que PESA de um problema. PERGUNTA sem resposta ou respondida SIM não pesa (null);
 *  respondida NAO pesa como `gravidadeAplicada` (ou `seNao`). */
function gravEfetiva(p) {
    if (!p) return null;
    if (p.gravidade !== 'PERGUNTA') return p.gravidade === 'REPROVA' ? 'REPROVA' : 'ATENCAO';
    if (p.resposta !== 'NAO') return null;
    return (p.gravidadeAplicada || p.seNao) === 'REPROVA' ? 'REPROVA' : 'ATENCAO';
}

function statusDe({ serve, problemas }) {
    if (!serve) return 'REFAZER';
    if (problemas.some(p => gravEfetiva(p) === 'REPROVA')) return 'REPROVA';
    if (problemas.some(p => gravEfetiva(p) === 'ATENCAO')) return 'ATENCAO';
    if (problemas.some(p => p.gravidade === 'PERGUNTA' && !p.resposta)) return 'PERGUNTA';
    return 'OK';
}

// Contexto cadastrado no veículo (Dia 2). Cada linha só entra quando o campo existe.
// O texto digitado pelo escritório vai entre aspas e truncado a 500 caracteres (dado, não instrução).
const ANGULOS_EXTERNOS = ['frente', 'lateral_direita', 'lateral_esquerda', 'traseira'];
const cortaTxt = (t) => String(t || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim().slice(0, 500);
function contextoDoVeiculo(angulo, v) {
    const out = [];
    if (!v) return out;
    if (angulo === 'vareta_oleo' && v.tipoVareta === 'PLASTICO_QUADRICULADA') {
        out.push('A vareta deste carro é de plástico laranja com área quadriculada; o nível está certo quando o óleo molha dentro do quadriculado.');
    } else if (angulo === 'vareta_oleo' && v.tipoVareta === 'METAL_MARCAS') {
        out.push('A vareta deste carro é de metal com duas marcas; o nível está certo quando o óleo fica entre as duas marcas.');
    }
    if (angulo === 'agua_radiador' && v.reservatorioOpaco) {
        out.push('O reservatório deste carro é opaco/sujo; se não enxergar o nível, use gravidade PERGUNTA em vez de pedir outra foto.');
    }
    if ((angulo === 'bau' || angulo === 'porta_malas') && cortaTxt(v.normalDentro)) {
        out.push(`É NORMAL ter dentro (texto do cadastro): "${cortaTxt(v.normalDentro)}". Não reclame disso.`);
    }
    if (ANGULOS_EXTERNOS.includes(angulo) && cortaTxt(v.avariasConhecidas)) {
        out.push(`Avarias já conhecidas (texto do cadastro), não aponte de novo: "${cortaTxt(v.avariasConhecidas)}".`);
    }
    return out;
}

/**
 * @param {{buffer:Buffer, mime:string, angulo:string, veiculo:{placa,modelo}, tipo:string,
 *          kmDigitado?:number, ultimoKmFinal?:number, luzOleoAcesa?:boolean, ultimaTentativa?:boolean}} p
 */
async function analisarFoto(p) {
    const t0 = Date.now();
    try {
        if (!aiProvider.isConfigured()) return IA_INDISPONIVEL({ motivo: 'sem_chave' });
        const rotulo = ANGULOS[p.angulo]?.rotulo || p.angulo;
        const volta = p.momento === 'VOLTA';
        const linhas = [
            `Carro: ${p.veiculo?.modelo || '?'}, tipo ${p.tipo}. Ângulo: ${rotulo}.`,
            (volta && COMPLEMENTO_VOLTA[p.angulo]) || COMPLEMENTO[p.angulo] || '',
        ];
        if (volta) linhas.push(CONTEXTO_VOLTA);
        linhas.push(...contextoDoVeiculo(p.angulo, p.veiculo));
        if (p.ultimaTentativa) linhas.push(EXTRA_ULTIMA_TENTATIVA);
        const imagens = [{ base64: p.buffer.toString('base64'), mime: p.mime || 'image/jpeg' }];
        let usouReferencia = false;
        if (p.referencia?.caminho && ANGULOS_COM_REFERENCIA.includes(p.angulo)) {
            const m = await prepararReferencia(p.referencia.caminho);
            if (m) { imagens.push(m); linhas.push(textoReferencia(p.referencia)); usouReferencia = true; }
        }
        if (p.angulo === 'painel' && Number.isInteger(p.ultimoKmFinal) && p.ultimoKmFinal > 0) {
            const u = p.ultimoKmFinal;
            linhas.push(`DICA (não copie, leia a foto): o último KM registrado deste carro foi ${u} (${String(u).length} dígitos). O odômetro de hoje deve ser IGUAL ou um pouco MAIOR, com o mesmo número de dígitos. `
                + 'Se o que você leu é MENOR ou tem menos dígitos, releia a foto com calma: provavelmente perdeu o primeiro ou o último dígito. '
                + 'Se mesmo assim a foto mostra outro número, devolva o que você vê com kmConfianca "BAIXA" (ou km=null se não tem certeza).');
        }
        if (p.angulo === 'painel' && p.luzOleoAcesa) linhas.push('O motorista informou que a luz de óleo está acesa.');
        const r = await aiProvider.analisarImagem({
            system: SYSTEM_PROMPT,
            texto: linhas.filter(Boolean).join('\n'),
            imagens,
            maxTokens: 2500,
            json: true,
            timeoutMs: TIMEOUT_MS,
            uso: { origem: 'CHECKLIST_FOTO', usuarioId: p.usuarioId || null, usuarioNome: p.usuarioNome || null, referencia: p.checklistId || null },
        });
        const v = validarResposta(extrairJson(r.texto), p.angulo);
        if (volta) {
            // Volta: combustível baixo não é problema (rede de segurança, caso a IA gere mesmo assim)
            v.problemas = v.problemas.filter((q) => !/combust|reserva|tanque|abaste/i.test(`${q.descricao} ${q.oQueFazer}`));
        }
        if (!v.serve && p.ultimaTentativa) {
            // Última tentativa: nunca devolve "refazer". Vira atenção com pergunta de um toque.
            v.serve = true;
            v.motivoRefazer = null;
            if (!v.problemas.some((q) => q.gravidade === 'PERGUNTA')) v.problemas = [...v.problemas, { gravidade: 'PERGUNTA', descricao: 'Não deu pra ver na foto.', oQueFazer: '', pergunta: 'Você conferiu e está ok?', seNao: 'ATENCAO' }];
            v.problemas = umaPerguntaPorFoto(v.problemas); // 1 PERGUNTA por foto, também depois da inserção
            v.forcarAtencao = true;
        }
        return {
            statusIa: v.forcarAtencao ? 'ATENCAO' : statusDe(v),
            serve: v.serve,
            motivoRefazer: v.motivoRefazer,
            problemas: v.problemas,
            // usouModelo fica false (compatibilidade): a foto modelo não vai mais para a IA
            leituras: v.leituras ? { ...v.leituras, usouModelo: false, usouReferencia, referenciaFotoId: usouReferencia ? (p.referencia.id || null) : null } : v.leituras,
            usouReferencia,
            iaModelo: r.modelo,
            iaMs: Date.now() - t0,
            iaTokens: r.usage?.total ?? null,
        };
    } catch (e) {
        console.error('[ChecklistVeiculoIA] análise indisponível:', e.message);
        return IA_INDISPONIVEL({ iaMs: Date.now() - t0, motivo: 'erro' });
    }
}

module.exports = {
    prepararReferencia, ANGULOS_COM_REFERENCIA, contextoDoVeiculo, umaPerguntaPorFoto, gravEfetiva, normalizarLuzes, analisarFoto, validarResposta, extrairJson, statusDe, SYSTEM_PROMPT };
