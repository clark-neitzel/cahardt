/**
 * Config da API de consulta para IA (`/api/ia-consulta/v1`) — chave `ia_consulta_config`
 * em `app_configs`. Hoje só guarda a HORA DE CORTE do pedido (v1.6.0, item 7 do pedido do bot):
 * até que horas o cliente pode fechar o pedido para sair na próxima rota. É um valor único
 * da empresa; a vendedora sabia "de cabeça" e a Ana precisa ler de algum lugar.
 *
 * Sem tela por enquanto (pedido do dono). Como configurar em produção (psql/TablePlus):
 *   INSERT INTO app_configs(key, value) VALUES ('ia_consulta_config', '{"horaCorte":"17:00"}')
 *   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
 *
 * Enquanto ninguém gravar, `horaCorte` vem `null` — o bot já lida com isso.
 *
 * Diferente do canhotoConfig, NÃO grava nada na primeira leitura (não há "linha de partida").
 */
const prisma = require('./database');

const CHAVE = 'ia_consulta_config';

const PADRAO = {
    horaCorte: null, // 'HH:MM' (24h) ou null = não configurada
};

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Cache curto: a config entra em todo reconhecimento por telefone.
let _cache = null;
let _cacheEm = 0;
const TTL_MS = 30000;

const get = async () => {
    if (_cache && Date.now() - _cacheEm < TTL_MS) return _cache;
    try {
        const linha = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
        const valor = linha?.value && typeof linha.value === 'object' ? linha.value : {};
        const cfg = { ...PADRAO, ...valor };
        // Hora inválida vale como "não configurada" — nunca mandar lixo pro bot.
        cfg.horaCorte = (typeof cfg.horaCorte === 'string' && RE_HORA.test(cfg.horaCorte.trim()))
            ? cfg.horaCorte.trim()
            : null;
        _cache = cfg;
    } catch (e) {
        // Banco fora do ar não pode derrubar o reconhecimento: devolve o padrão.
        console.error('[IaConsultaConfig] Falha ao ler config:', e.message);
        _cache = { ...PADRAO };
    }
    _cacheEm = Date.now();
    return _cache;
};

/** Só a hora de corte (atalho usado nos reconhecimentos). Nunca lança. */
const horaCorte = async () => (await get()).horaCorte;

const limparCache = () => { _cache = null; _cacheEm = 0; };

module.exports = { CHAVE, PADRAO, get, horaCorte, limparCache };
