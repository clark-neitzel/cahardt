/**
 * QUEM OPERA CAIXA — critério único (11/2026)
 *
 * Usuário de ACESSO EXTERNO (contador, agente de IA como o "Luke") não recebe
 * dinheiro, não faz entrega, não tem caixa para conferir nem fechar. Ele nunca
 * pode aparecer como pílula do dia, fila de conferência/fechamento, aviso de
 * "caixa parado" nem seletor de vendedor do Caixa.
 *
 * Um vendedor NÃO opera caixa quando QUALQUER uma destas é verdade:
 *   - acessoExterno = true            (coluna; é o que o cadastro de agente grava)
 *   - permissoes.Usuario_Externo = true  (marca do usuário do contador)
 *   - agente = true                   (coluna futura do cadastro de agente — se vier no objeto)
 *
 * Por que NÃO filtrar `permissoes` no SQL: o JSON de permissões pode ser nulo e o
 * `NOT` do Prisma/SQL exclui linhas null (regra do projeto). A parte booleana
 * (`acessoExterno: false`) é segura no banco; o resto se confere em JS.
 */

const prisma = require('../config/database');

/** permissoes pode vir como objeto, string JSON ou null. Nunca lança. */
const lerPermissoes = (v) => {
    const p = v?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') {
        try { return JSON.parse(p) || {}; } catch { return {}; }
    }
    return typeof p === 'object' ? p : {};
};

/**
 * @param {{acessoExterno?: boolean, permissoes?: any, agente?: boolean}|null|undefined} v
 *   Precisa ter vindo com `acessoExterno` e `permissoes` no select.
 * @returns {boolean} true se a pessoa PODE ter caixa.
 */
const vendedorOperaCaixa = (v) => {
    if (!v) return false;
    if (v.acessoExterno === true) return false;
    if (v.agente === true) return false;
    if (lerPermissoes(v).Usuario_Externo === true) return false;
    return true;
};

/**
 * Campos que o select/include precisa trazer para o critério funcionar.
 *
 * ATENÇÃO — coluna `agente`: `vendedorOperaCaixa` já considera `v.agente === true`,
 * mas HOJE a coluna `agente` NÃO existe no schema.prisma (o PR do usuário-agente
 * ainda não foi publicado), então ela NÃO está neste select de propósito: pedir um
 * campo inexistente derrubaria a consulta em produção. Hoje o agente (Luke) é pego
 * por `acessoExterno = true`.
 * Quem criar/publicar a coluna `agente` DEVE incluir `agente: true` aqui. Sem isso,
 * a regra do agente fica sem efeito EM SILÊNCIO (o select não traz o campo e
 * `v.agente` chega `undefined`) — e nenhum teste de mock avisa.
 */
const SELECT_OPERA_CAIXA = { acessoExterno: true, permissoes: true };

/** Parte segura do filtro no banco (coluna booleana não-nula). Usar JUNTO do filtro em JS. */
const WHERE_NAO_EXTERNO = { acessoExterno: false };

/**
 * Dado um conjunto de ids de vendedor, devolve o Set dos que OPERAM caixa
 * (1 consulta). Id inexistente no cadastro fica de fora.
 */
const idsQueOperamCaixa = async (ids) => {
    const unicos = [...new Set([...(ids || [])].filter(Boolean))];
    if (!unicos.length) return new Set();
    const vendedores = await prisma.vendedor.findMany({
        where: { id: { in: unicos } },
        select: { id: true, ...SELECT_OPERA_CAIXA },
    });
    return new Set(vendedores.filter(vendedorOperaCaixa).map(v => v.id));
};

module.exports = {
    vendedorOperaCaixa, idsQueOperamCaixa, lerPermissoes,
    SELECT_OPERA_CAIXA, WHERE_NAO_EXTERNO,
};
