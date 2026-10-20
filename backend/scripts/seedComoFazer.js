// Seed idempotente do Como Fazer (Fase 1): 3 conteúdos de EXEMPLO da cozinha, todos como RASCUNHO.
// As fotos reais ainda não existem e os textos precisam da conferência do dono / responsável técnico.
// NÃO é norma sanitária. Rodar: POST /api/admin-exec/como-fazer-seed (ou `node scripts/seedComoFazer.js` local).
const prisma = require('../config/database');
const schema = require('../services/comoFazerSchema');

const passo = (id, texto, extra = {}) => ({ id, texto, detalhe: null, foto: null, video: null, perigo: false, itens: null, pergunta: null, ...extra });

const CONTEUDOS = [
    {
        codigo: 'POP-HIG-001', tipo: 'REGRA', titulo: 'Higiene e uniforme', icone: '👕',
        setores: ['COZINHA'], exigeConfirmacao: true,
        doc: {
            schema: 1,
            objetivo: 'Ninguém entra na cozinha sem estar limpo e com o uniforme completo. Isso protege o produto e a saúde de quem come.',
            materiais: 'Touca · avental limpo · sapato fechado · unhas curtas e sem esmalte · sem anel, brinco, relógio ou celular.',
            naoFazer: 'Entrar com celular, comer na área de produção, usar o mesmo avental de ontem, sair para a rua de uniforme.',
            seDerErrado: [
                { se: 'Esqueci a touca ou o avental', entao: 'Não entre. Pegue um novo com o encarregado.' },
                { se: 'Estou com ferida ou machucado na mão', entao: 'Avise o encarregado antes de entrar. Ele decide o que fazer.' },
                { se: 'Estou doente (gripe, diarreia, vômito)', entao: 'Não trabalhe com alimento. Avise o encarregado.' },
            ],
            secoes: [{
                id: 's_hig_1', bloco: 'PRINCIPAL', titulo: 'Passo a passo',
                passos: [
                    passo('p_hig_01', 'Tire anéis, pulseiras, relógio e brincos antes de entrar.'),
                    passo('p_hig_02', 'Prenda o cabelo e cubra tudo com a touca.'),
                    passo('p_hig_03', 'Lave as mãos até o cotovelo, com sabão, por 20 segundos.', { detalhe: 'Antes de começar, depois do banheiro e toda vez que sair da cozinha.' }),
                    passo('p_hig_04', 'Seque as mãos com papel descartável.'),
                    passo('p_hig_05', 'Vista o uniforme limpo e completo.'),
                    passo('p_hig_06', 'Use sapato fechado e que não escorrega.'),
                    passo('p_hig_07', 'Mantenha as unhas curtas, limpas e sem esmalte.'),
                    passo('p_hig_08', 'Quem tem barba usa a proteção.'),
                    passo('p_hig_09', 'Celular fica guardado no armário, não entra na cozinha.'),
                    passo('p_hig_10', 'Está doente ou com ferida na mão? Avise o encarregado antes de entrar.', { perigo: true }),
                ],
            }],
        },
    },
    {
        codigo: 'POP-FRZ-001', tipo: 'ROTINA', titulo: 'Temperatura dos freezers', icone: '🧊',
        setores: ['COZINHA'], exigeConfirmacao: false,
        horarios: ['07:30', '16:30'], recorrencia: 'DIARIA', responsaveisIds: [], // o dono escolhe o encarregado no painel antes de publicar
        doc: {
            schema: 1,
            objetivo: 'Conferir duas vezes por dia se os freezers estão frios o bastante para o produto não estragar.',
            materiais: 'Nada além de olhar o visor de cada freezer. Celular ou tablet para responder.',
            naoFazer: 'Anotar a temperatura de memória, ou sem olhar o visor na hora.',
            seDerErrado: [
                { se: 'A temperatura está mais quente que o limite', entao: 'Passe o produto para outro freezer e avise o encarregado. O sistema já avisa por você.' },
                { se: 'A porta não fecha bem', entao: 'Chame o encarregado agora.' },
            ],
            secoes: [{
                id: 's_frz_1', bloco: 'PRINCIPAL', titulo: 'Passo a passo',
                passos: [
                    passo('p_frz_00', 'Olhe a temperatura no visor de cada freezer.'),
                    ...[1, 2].flatMap(n => [
                        passo(`p_frz_${n}1`, `Freezer ${n}: anote a temperatura.`, {
                            pergunta: { tipo: 'NUMERO', rotulo: `Freezer ${n} — qual a temperatura?`, obrigatoria: true, min: -18, max: -12, unidade: '°C', avisoDesvio: 'Está muito quente. Passe o produto para outro freezer e avise o encarregado.' },
                        }),
                        passo(`p_frz_${n}2`, `Freezer ${n}: confira a porta.`, {
                            pergunta: { tipo: 'SIMNAO', rotulo: `Freezer ${n} — a porta fecha bem?`, obrigatoria: true, respostaEsperada: 'SIM', avisoDesvio: 'Chame o encarregado: a porta não está vedando.' },
                        }),
                        passo(`p_frz_${n}3`, `Freezer ${n}: tire uma foto do visor.`, {
                            pergunta: { tipo: 'FOTO', rotulo: `Freezer ${n} — foto do visor`, obrigatoria: true },
                        }),
                    ]),
                ],
            }],
        },
    },
    {
        codigo: 'POP-MAQ-001', tipo: 'MAQUINA', titulo: 'Fritadeira', icone: '🍟',
        setores: ['COZINHA'], exigeConfirmacao: true,
        doc: {
            schema: 1,
            avisoPerigo: 'Óleo quente. Nunca encher com água. Nunca ligar sem o cesto. Use a luva térmica.',
            objetivo: 'EXEMPLO — troque pelo seu: usar a fritadeira sem se queimar e sem estragar o produto.',
            materiais: 'EXEMPLO — troque pelo seu: luva térmica · cesto · óleo novo · pano seco.',
            naoFazer: 'EXEMPLO — troque pelo seu: colocar produto molhado ou congelado com gelo no óleo quente; deixar a fritadeira ligada sozinha.',
            seDerErrado: [
                { se: 'O óleo espirra muito', entao: 'Afaste-se, desligue e chame o encarregado.' },
                { se: 'Queimei a mão', entao: 'Água corrente fria na hora e avise o encarregado.' },
            ],
            secoes: [
                { id: 's_maq_m', bloco: 'MONTAR', titulo: 'Montar', passos: [
                    passo('p_maq_m1', 'EXEMPLO — troque pelo seu: confira se o cesto está encaixado.'),
                    passo('p_maq_m2', 'EXEMPLO — troque pelo seu: coloque o óleo até a marca de nível.', { perigo: true }),
                ] },
                { id: 's_maq_u', bloco: 'USAR', titulo: 'Usar', passos: [
                    passo('p_maq_u1', 'EXEMPLO — troque pelo seu: ligue e espere a luz de pronto.'),
                    passo('p_maq_u2', 'EXEMPLO — troque pelo seu: baixe o cesto devagar com a luva.', { perigo: true }),
                ] },
                { id: 's_maq_l', bloco: 'LIMPAR', titulo: 'Limpar', passos: [
                    passo('p_maq_l1', 'EXEMPLO — troque pelo seu: desligue e espere esfriar por completo.', { perigo: true }),
                    passo('p_maq_l2', 'EXEMPLO — troque pelo seu: lave o cesto com água e detergente e seque.'),
                ] },
                { id: 's_maq_p1', bloco: 'PROBLEMA', titulo: 'Não esquenta', icone: '🌡️', passos: [
                    passo('p_maq_p1', 'EXEMPLO — troque pelo seu: confira se está na tomada e se o botão está ligado.'),
                    passo('p_maq_p2', 'EXEMPLO — troque pelo seu: continua frio? Desligue e chame o encarregado.'),
                ] },
            ],
        },
    },
];

async function criadorPadrao() {
    const vs = await prisma.vendedor.findMany({ where: { ativo: true }, select: { id: true, permissoes: true } });
    const admin = vs.find(v => { let p = v.permissoes; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } } return p && p.admin === true; });
    return (admin || vs[0])?.id || null;
}

async function seed() {
    const criadoPorId = await criadorPadrao();
    if (!criadoPorId) throw new Error('Nenhum usuário ativo para ser o autor do seed.');
    const resultado = [];
    for (const c of CONTEUDOS) {
        const ja = await prisma.comoFazerConteudo.findUnique({ where: { codigo: c.codigo } });
        if (ja) { resultado.push({ codigo: c.codigo, situacao: 'JA_EXISTE', id: ja.id }); continue; } // idempotente: nunca sobrescreve
        const { doc, erros } = schema.processarDoc(c.doc, { tipo: c.tipo, horarios: c.horarios || [], responsaveisIds: c.responsaveisIds || [], recorrencia: c.recorrencia });
        const criado = await prisma.comoFazerConteudo.create({
            data: {
                codigo: c.codigo, tipo: c.tipo, titulo: c.titulo, icone: c.icone, setores: c.setores, cargos: [],
                exigeConfirmacao: c.exigeConfirmacao, horarios: c.horarios || [], recorrencia: c.recorrencia || 'NUNCA',
                responsaveisIds: c.responsaveisIds || [], criadoPorId,
                versoes: { create: { numero: 1, status: 'RASCUNHO', passos: doc } },
            },
        });
        resultado.push({ codigo: c.codigo, situacao: 'CRIADO', id: criado.id, pendenciasParaPublicar: erros });
    }
    return resultado;
}

module.exports = { seed, CONTEUDOS };

if (require.main === module) {
    seed().then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}
