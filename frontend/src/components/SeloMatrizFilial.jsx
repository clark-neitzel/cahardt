import { tipoEstabelecimentoPorCnpj } from '../utils/documento';

/** Selo Matriz/Filial derivado do CNPJ. Não renderiza nada para CPF/documento inválido. */
export default function SeloMatrizFilial({ documento, className = '' }) {
  const tipo = tipoEstabelecimentoPorCnpj(documento);
  if (!tipo) return null;
  const cor = tipo === 'MATRIZ' ? 'bg-mint text-primaryDark' : 'bg-amber-100 text-amber-700';
  return (
    <span
      title={tipo === 'MATRIZ' ? 'Matriz (CNPJ termina em 0001)' : 'Filial (ordem do CNPJ diferente de 0001)'}
      className={`inline-block px-2 py-0.5 text-[11px] leading-4 font-semibold rounded-full whitespace-nowrap ${cor} ${className}`}
    >
      {tipo === 'MATRIZ' ? 'Matriz' : 'Filial'}
    </span>
  );
}
