/**
 * Chave de ativação da CONFERÊNCIA DO DINHEIRO no Caixa.
 *
 * ⚠️ POR QUE ISSO EXISTE (não remover):
 * A regra nova impede fechar o caixa sem alguém conferir o dinheiro. Se ela
 * entrasse valendo no mesmo instante do deploy — com as permissões novas
 * nascendo desligadas, como combinado — NENHUM caixa conseguiria fechar e a
 * operação pararia. Então tudo é publicado com a chave DESLIGADA: as telas
 * aparecem, dá para conferir, mas nada trava. O dono liga em
 * Configurações → Caixa depois de dar a permissão para quem confere.
 *
 * `desde` protege o passado: a trava só vale para caixas cuja data seja >= desde
 * (preenchido automaticamente com a data de ativação). Caixas velhos que ficaram
 * abertos não travam retroativamente.
 */

const prisma = require('./database');

const CHAVE = 'caixa_conferencia';

const PADRAO = {
    ativo: false,              // trava do fechar + trava do caixa fechado
    desde: null,               // 'YYYY-MM-DD' — trava só vale deste dia em diante
    instaladoEm: null,         // 'YYYY-MM-DD' — dia em que a função entrou no ar (linha de partida)
    soDiasUteis: false,        // sáb/dom não têm caixa (movimento cai na segunda)
    whatsappAtrasoDias: 2,     // dias parados até o bot avisar quem confere
    tarefaDiferenca: true,     // sugerir tarefa na agenda quando houver diferença
};

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Cache curto: a config é lida em quase toda rota do caixa.
let _cache = null;
let _cacheEm = 0;
const TTL_MS = 30000;

const get = async () => {
    if (_cache && Date.now() - _cacheEm < TTL_MS) return _cache;
    try {
        const linha = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
        const valor = linha?.value && typeof linha.value === 'object' ? linha.value : {};
        _cache = { ...PADRAO, ...valor };
        // Linha de partida: gravada na PRIMEIRA leitura (dia em que a função subiu).
        // Sem isso, no primeiro deploy a fila puxaria todo caixa antigo que ficou
        // aberto no banco — a agenda nasceria com dezenas de pendências mortas.
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
        console.error('[CaixaConferencia] Falha ao ler config:', e.message);
        _cache = { ...PADRAO };
    }
    _cacheEm = Date.now();
    return _cache;
};

const salvar = async (parcial) => {
    const atual = await get();
    const novo = { ...atual, ...parcial };
    // Ligar sem data = passa a valer de hoje em diante (nunca retroativo).
    if (novo.ativo && !novo.desde) novo.desde = hojeISO();
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

/**
 * Data de corte das FILAS: nada anterior a ela entra na agenda de ninguém.
 * É a data em que a regra foi ligada ou, antes disso, o dia em que a função
 * subiu — o que impede caixa velho esquecido de aparecer como pendência nova.
 */
const dataCorte = (cfg) => cfg?.desde || cfg?.instaladoEm || null;

/** A trava do fechamento vale para este caixa? */
const exigeConferencia = async (dataReferencia) => {
    const cfg = await get();
    if (!cfg.ativo) return false;
    if (cfg.desde && String(dataReferencia) < cfg.desde) return false;
    return true;
};

/** O caixa fechado deste dia está travado para lançamentos? (mesma regra) */
const bloqueiaLancamento = exigeConferencia;

const limparCache = () => { _cache = null; _cacheEm = 0; };

module.exports = { CHAVE, PADRAO, get, salvar, dataCorte, exigeConferencia, bloqueiaLancamento, limparCache };
