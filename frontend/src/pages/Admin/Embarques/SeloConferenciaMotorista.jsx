import { ClipboardCheck } from 'lucide-react';

// Comprovante da conferência do motorista no Embarque (escritório). `resumo` = resumos[embarqueId] de
// GET /api/conferencia-motorista/resumo. Verde = conferida; âmbar = saiu sem conferência; nada = ainda não iniciada
// e dentro do prazo (ou resumo indisponível — o Embarque nunca quebra por causa disso).
const hhmm = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return mesmoDia ? h : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${h}`;
};

export default function SeloConferenciaMotorista({ resumo, className = '' }) {
    if (!resumo || typeof resumo !== 'object') return null;
    const base = `inline-flex items-center gap-1 max-w-full px-2 py-0.5 text-[11px] font-semibold rounded-full ${className}`;
    if (resumo.status === 'CONFERIDA') {
        const n = Number(resumo.faltas) || 0;
        const quando = resumo.conferidaEm ? hhmm(resumo.conferidaEm) : '';
        const quem = resumo.conferidaPorNome ? ` por ${String(resumo.conferidaPorNome).split(' ')[0]}` : '';
        return (
            <span className={`${base} bg-green-100 text-green-800`} title={n ? 'Faltas apontadas pelo motorista na conferência' : undefined}>
                <ClipboardCheck className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span className="truncate">Conferida{quem}{quando ? ` ${quando}` : ''} · {n > 0 ? `${n} falta${n > 1 ? 's' : ''}` : 'sem faltas'}</span>
            </span>
        );
    }
    if (resumo.saiuSemConferencia) {
        return <span className={`${base} bg-amber-100 text-amber-700`}>Saiu sem conferência</span>;
    }
    if (resumo.status === 'EM_ANDAMENTO') {
        return <span className={`${base} bg-blue-100 text-blue-800`}>Conferência em andamento</span>;
    }
    return null;
}
