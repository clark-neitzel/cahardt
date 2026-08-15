/**
 * Chave de ativação do CANHOTO DA NOTA FISCAL.
 *
 * ⚠️ POR QUE ISSO EXISTE (não remover):
 * A regra nova impede fechar o caixa enquanto faltar canhoto assinado. Se ela
 * entrasse valendo no instante do deploy, com o passado todo em "estado
 * desconhecido", NENHUM caixa fecharia e a operação pararia. Por isso a função
 * nasce em `modo: 'AVISO'`: o card aparece, os contadores contam, mas nada trava.
 * O dono vira para 'TRAVA' em Configurações → Caixa depois que a equipe já fez o
 * mutirão da pasta física.
 *
 * Modos:
 *   OFF   — o módulo some das telas do caixa; nada é exigido nem contado no caixa.
 *   AVISO — mostra e conta, mas NÃO entra no `podeFechar` (padrão de nascimento).
 *   TRAVA — faltando canhoto, o caixa do dia não fecha.
 *
 * `desde` protege o passado: a trava só vale para caixas cuja data seja >= desde
 * (preenchido automaticamente na virada para TRAVA). Caixa antigo que ficou aberto
 * nunca trava retroativamente.
 *
 * `diasAlerta` (3): nota autorizada há mais dias que isso e ainda na rua entra no
 * alerta vermelho da aba Canhotos.
 */

const prisma = require('./database');

const CHAVE = 'canhoto_nota';

const MODOS = ['OFF', 'AVISO', 'TRAVA'];

const PADRAO = {
    modo: 'AVISO',       // OFF | AVISO | TRAVA — nasce em AVISO (nada trava)
    desde: null,         // 'YYYY-MM-DD' — a trava só vale deste dia em diante
    instaladoEm: null,   // 'YYYY-MM-DD' — dia em que a função entrou no ar (linha de partida)
    diasAlerta: 3,       // dias na rua até a linha ficar vermelha
};

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Cache curto: a config é lida em quase toda rota do módulo e no card do caixa.
let _cache = null;
let _cacheEm = 0;
const TTL_MS = 30000;

const get = async () => {
    if (_cache && Date.now() - _cacheEm < TTL_MS) return _cache;
    try {
        const linha = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
        const valor = linha?.value && typeof linha.value === 'object' ? linha.value : {};
        _cache = { ...PADRAO, ...valor };
        if (!MODOS.includes(_cache.modo)) _cache.modo = PADRAO.modo;
        // Linha de partida: gravada na PRIMEIRA leitura (dia em que a função subiu).
        // Sem isso, ao ligar a trava o sistema puxaria canhoto de caixa antigo e
        // a fila nasceria com dezenas de pendências mortas.
        if (!_cache.instaladoEm) {
            _cache.instaladoEm = hojeISO();
            await prisma.appConfig.upsert({
                where: { key: CHAVE },
                update: { value: _cache },
                create: { key: CHAVE, value: _cache },
            });
        }
    } catch (e) {
        // Banco fora do ar não pode virar trava: sem config, nada é exigido.
        console.error('[Canhoto] Falha ao ler config:', e.message);
        _cache = { ...PADRAO };
    }
    _cacheEm = Date.now();
    return _cache;
};

const salvar = async (parcial) => {
    const atual = await get();
    const novo = { ...atual, ...(parcial || {}) };
    if (!MODOS.includes(novo.modo)) throw new Error(`Modo inválido. Use ${MODOS.join(', ')}.`);
    const dias = Number(novo.diasAlerta);
    novo.diasAlerta = Number.isFinite(dias) && dias >= 1 && dias <= 60 ? Math.round(dias) : PADRAO.diasAlerta;
    // Ligar a trava sem data = passa a valer de hoje em diante (nunca retroativo).
    if (novo.modo === 'TRAVA' && !novo.desde) novo.desde = hojeISO();
    if (novo.modo !== 'TRAVA') novo.desde = atual.desde || null; // desligar não apaga a linha de corte
    if (!novo.instaladoEm) novo.instaladoEm = hojeISO();
    await prisma.appConfig.upsert({
        where: { key: CHAVE },
        update: { value: novo },
        create: { key: CHAVE, value: novo },
    });
    _cache = novo;
    _cacheEm = Date.now();
    return novo;
};

/** O módulo aparece nas telas do caixa? (AVISO e TRAVA aparecem; OFF some) */
const ativo = async () => (await get()).modo !== 'OFF';

/**
 * A trava do fechamento vale para este caixa?
 * (Pedaço 2 usa isto no /resumo e no /fechar — sempre dentro de try/catch que
 * degrada para "sem pendência".)
 */
const exigeCanhoto = async (dataReferencia) => {
    const cfg = await get();
    if (cfg.modo !== 'TRAVA') return false;
    if (cfg.desde && String(dataReferencia) < cfg.desde) return false;
    return true;
};

const limparCache = () => { _cache = null; _cacheEm = 0; };

module.exports = { CHAVE, MODOS, PADRAO, get, salvar, ativo, exigeCanhoto, limparCache };
