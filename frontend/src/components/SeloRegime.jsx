// Selo do regime tributário do cliente (Simples / MEI / Regime normal).
// `regimeFiscal` vem do backend: null (nunca consultado) ou { regime, erro, ... }.
// Cliente pessoa física não tem selo.
export const clienteEhPJ = (cliente) => {
    if (!cliente) return false;
    if (cliente.Tipo_Pessoa) return cliente.Tipo_Pessoa === 'JURIDICA';
    return String(cliente.Documento || '').replace(/[^0-9A-Za-z]/g, '').length === 14;
};

const VISUAL = {
    SIMPLES: { rotulo: 'Simples', cor: 'bg-green-100 text-green-800' },
    MEI: { rotulo: 'MEI', cor: 'bg-blue-100 text-blue-800' },
    NORMAL: { rotulo: 'Regime normal', cor: 'bg-amber-100 text-amber-700' },
    DESCONHECIDO: { rotulo: 'Não identificado', cor: 'bg-gray-100 text-gray-700' },
};

const SeloRegime = ({ regimeFiscal, compacto = false, className = '' }) => {
    const v = (regimeFiscal && VISUAL[regimeFiscal.regime]) || { rotulo: 'Não consultado', cor: 'bg-gray-100 text-gray-700' };
    const erro = regimeFiscal?.erro;
    return (
        <span
            title={erro ? 'A última consulta falhou; mostrando o regime anterior.' : 'Regime tributário'}
            className={`inline-flex items-center gap-1 font-semibold rounded-full whitespace-nowrap ${compacto ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} ${v.cor} ${className}`}
        >
            {v.rotulo}
            {erro && <span aria-label="última consulta falhou" className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
        </span>
    );
};

export default SeloRegime;
