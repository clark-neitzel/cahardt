// Data de hoje (ou de um instante qualquer) no fuso de Brasília, em 'YYYY-MM-DD'.
//
// O servidor roda em UTC dentro do container — `new Date().setHours(0,0,0,0)` zera a
// meia-noite de UTC, não a de São Paulo. Perto da virada (21h-23h59 em Brasília, já é
// madrugada em UTC) isso aponta pro dia ERRADO. Extraído do `getDataReferencia` que já
// existia em `diarioService.js` para poder ser reaproveitado por outros services (ex.:
// `atendimentoService.buscarPendenciasRota`) sem duplicar a lógica nem criar require
// circular entre os dois.
const getDataReferencia = (data) => {
    const d = data ? new Date(data) : new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const partes = formatter.formatToParts(d);
    const ano = partes.find(p => p.type === 'year').value;
    const mes = partes.find(p => p.type === 'month').value;
    const dia = partes.find(p => p.type === 'day').value;
    return `${ano}-${mes}-${dia}`;
};

module.exports = { getDataReferencia };
