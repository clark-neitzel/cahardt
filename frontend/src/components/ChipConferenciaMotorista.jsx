import { PackageCheck } from 'lucide-react';

// Chip do cartão da entrega: o que o motorista conferiu na carga ("2 bolsas · Faltou: Coxinha 3 (vem depois)").
// Usado em Minhas Entregas (PainelMotorista) e Rota → Entregas (RotaLeads). `conferencia` = pedido.conferenciaMotorista
// (null/undefined = nada a mostrar). Sem preço, sem número separado.
const MOTIVO = { NAO_VEIO: 'não veio', VEM_DEPOIS: 'vem depois' };
const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function ChipConferenciaMotorista({ conferencia, className = '' }) {
    if (!conferencia || typeof conferencia !== 'object') return null;
    const bolsas = Number(conferencia.bolsas) > 0 ? Number(conferencia.bolsas) : 0;
    const faltas = Array.isArray(conferencia.faltas) ? conferencia.faltas.filter((f) => f && Number(f.falta) > 0) : [];
    if (!bolsas && !faltas.length && conferencia.status !== 'CONFERIDA') return null;
    const textoFaltas = faltas.map((f) => {
        const un = f.unidade && f.unidade !== 'UN' ? ` ${f.unidade}` : '';
        const mot = MOTIVO[f.motivo] ? ` (${MOTIVO[f.motivo]})` : '';
        return `${f.produto || 'Produto'} ${fmt(f.falta)}${un}${mot}`;
    }).join(', ');
    return (
        <div className={`flex flex-wrap items-center gap-1.5 text-[11px] md:text-xs ${className}`}>
            {(bolsas > 0 || (!faltas.length && conferencia.status === 'CONFERIDA')) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mint text-primaryDark font-semibold">
                    <PackageCheck className="h-3 w-3" aria-hidden />
                    {bolsas > 0 ? `${bolsas} bolsa${bolsas > 1 ? 's' : ''}` : 'Conferida'}
                </span>
            )}
            {faltas.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold min-w-0 break-words">
                    Faltou: {textoFaltas}
                </span>
            )}
        </div>
    );
}
