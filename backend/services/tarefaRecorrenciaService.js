// Regras PURAS de recorrência das Tarefas (sem banco). Extraído de routes/tarefaRoutes.js
// sem mudar o comportamento — o módulo Como Fazer usa as mesmas funções para calcular
// "rotina não feita". Datas sempre 'YYYY-MM-DD'.

// dia da semana de 'YYYY-MM-DD' sem depender do fuso do servidor (0=dom ... 6=sáb)
const diaSemana = (dataStr) => new Date(`${dataStr}T12:00:00Z`).getUTCDay();

// a tarefa "toca" no dia dataRef?
function ocorreNoDia(tarefa, dataRef) {
    if (dataRef < tarefa.dataInicio) return false;
    if (tarefa.recorrenciaFim && dataRef > tarefa.recorrenciaFim) return false;
    switch (tarefa.recorrencia) {
        case 'NUNCA': return dataRef === tarefa.dataInicio;
        case 'DIARIA': return true;
        case 'DIAS_UTEIS': {
            const d = diaSemana(dataRef);
            return d >= 1 && d <= 5;
        }
        case 'SEMANAL': return diaSemana(dataRef) === diaSemana(tarefa.dataInicio);
        case 'MENSAL': return dataRef.slice(8) === tarefa.dataInicio.slice(8);
        case 'DIAS_SEMANA': return (tarefa.diasSemana || []).includes(diaSemana(dataRef));
        default: return false;
    }
}

// lista de datas 'YYYY-MM-DD' entre de..ate (inclusive), com trava de tamanho
function datasDoIntervalo(de, ate, maxDias = 62) {
    const datas = [];
    const d = new Date(`${de}T12:00:00Z`);
    const fim = new Date(`${ate}T12:00:00Z`);
    while (d <= fim && datas.length < maxDias) {
        datas.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return datas;
}

module.exports = { diaSemana, ocorreNoDia, datasDoIntervalo };
