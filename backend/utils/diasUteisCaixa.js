/**
 * Caixa só de segunda a sexta (regra do dono, 08/2026).
 *
 * Sábado e domingo não abrem caixa: a movimentação do fim de semana é prestada
 * no caixa da SEGUNDA SEGUINTE. O registro da entrega/despesa continua com a
 * data real — muda só em QUAL caixa ela é somada.
 *
 * Tudo aqui é puro (sem banco) e só entra em ação quando `soDiasUteis` está
 * ligado em `caixaConferenciaConfig`. Com a chave desligada, `diasDoCaixa`
 * devolve só o próprio dia e o comportamento é o de sempre.
 */

const p2 = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// Meio-dia evita qualquer surpresa de fuso ao somar dias.
const fromStr = (s) => new Date(`${s}T12:00:00`);

/** 0=dom … 6=sáb */
const diaSemana = (dataISO) => fromStr(dataISO).getDay();

const ehFimDeSemana = (dataISO) => [0, 6].includes(diaSemana(dataISO));

/** Em qual caixa esta data é prestada. Sáb → segunda (+2); dom → segunda (+1). */
const dataCaixaDe = (dataISO) => {
    const dow = diaSemana(dataISO);
    if (dow !== 0 && dow !== 6) return dataISO;
    const d = fromStr(dataISO);
    d.setDate(d.getDate() + (dow === 6 ? 2 : 1));
    return toStr(d);
};

/**
 * Quais dias compõem o caixa desta data.
 * Segunda → [sábado, domingo, segunda]; demais dias úteis → [o próprio dia].
 * Se `soDiasUteis` estiver desligado, devolve sempre [dataISO].
 */
const diasDoCaixa = (dataISO, soDiasUteis = true) => {
    if (!soDiasUteis) return [dataISO];
    if (diaSemana(dataISO) !== 1) return [dataISO]; // só a segunda agrega
    const sab = fromStr(dataISO); sab.setDate(sab.getDate() - 2);
    const dom = fromStr(dataISO); dom.setDate(dom.getDate() - 1);
    return [toStr(sab), toStr(dom), dataISO];
};

/** Intervalo (UTC) para filtrar dataEntrega do caixa desta data. */
const intervaloDoCaixa = (dataISO, soDiasUteis = true) => {
    const dias = diasDoCaixa(dataISO, soDiasUteis);
    return {
        dias,
        inicio: new Date(`${dias[0]}T00:00:00.000Z`),
        fim: new Date(`${dias[dias.length - 1]}T23:59:59.999Z`),
    };
};

/** Próximo dia útil (usado quando alguém cai num sábado/domingo). */
const proximoDiaUtil = (dataISO) => dataCaixaDe(dataISO);

/** Dia útil anterior (navegação com as setas do seletor). */
const diaUtilAnterior = (dataISO) => {
    const d = fromStr(dataISO);
    do { d.setDate(d.getDate() - 1); } while ([0, 6].includes(d.getDay()));
    return toStr(d);
};

/** Próximo dia útil depois deste (navegação com as setas). */
const diaUtilSeguinte = (dataISO) => {
    const d = fromStr(dataISO);
    do { d.setDate(d.getDate() + 1); } while ([0, 6].includes(d.getDay()));
    return toStr(d);
};

const hojeStr = () => toStr(new Date());

module.exports = {
    p2, toStr, fromStr, diaSemana, ehFimDeSemana,
    dataCaixaDe, diasDoCaixa, intervaloDoCaixa,
    proximoDiaUtil, diaUtilAnterior, diaUtilSeguinte, hojeStr,
};
