import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpenCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TabTreinamentos from './comoFazer/TabTreinamentos';
import TabRotinas from './comoFazer/TabRotinas';
import TabConteudos from './comoFazer/TabConteudos';
import PareamentoTablet from './comoFazer/PareamentoTablet';

// Painel do gestor do Como Fazer (/rh/como-fazer). Espelha o backend:
//   Pode_Ver_Painel_Como_Fazer → /painel/*   ·   Pode_Editar_Como_Fazer → /admin/*, lembrar, parear
export default function ComoFazerPainel() {
    const { user, hasPermission } = useAuth();
    const [params, setParams] = useSearchParams();
    const isAdmin = user?.permissoes?.admin === true;
    const podePainel = isAdmin || hasPermission('Pode_Ver_Painel_Como_Fazer') === true;
    const podeEditar = isAdmin || hasPermission('Pode_Editar_Como_Fazer') === true;

    const abas = useMemo(() => [
        ...(podePainel ? [{ id: 'treinamentos', rotulo: 'Treinamentos' }, { id: 'rotinas', rotulo: 'Rotinas' }] : []),
        ...(podeEditar ? [{ id: 'conteudos', rotulo: 'Conteúdos' }, { id: 'aparelhos', rotulo: 'Aparelhos' }] : []),
    ], [podePainel, podeEditar]);

    const pedida = params.get('aba');
    const aba = abas.some((a) => a.id === pedida) ? pedida : (abas[0]?.id || '');
    const trocar = (id) => setParams({ aba: id }, { replace: true });

    return (
        <div className="p-3 md:p-6 max-w-full overflow-x-hidden space-y-4">
            <div className="flex items-center gap-2">
                <div className="bg-mint p-1.5 md:p-2 rounded-lg"><BookOpenCheck className="h-4 w-4 md:h-5 md:w-5 text-blue-600" /></div>
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900">Painel Como Fazer</h1>
                    <p className="text-xs md:text-sm text-gray-600">Quem já treinou, rotinas feitas e o que precisa de atenção</p>
                </div>
            </div>

            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
                {abas.map((a) => (
                    <button key={a.id} type="button" onClick={() => trocar(a.id)}
                        className={`px-4 min-h-[44px] text-sm font-bold whitespace-nowrap border-b-2 ${aba === a.id ? 'text-primaryDark border-primary' : 'text-gray-600 border-transparent'}`}>{a.rotulo}</button>
                ))}
            </div>

            {aba === 'treinamentos' && <TabTreinamentos podeEditar={podeEditar} />}
            {aba === 'rotinas' && <TabRotinas destaque={params.get('execucao') || ''} />}
            {aba === 'conteudos' && <TabConteudos abrirId={params.get('editar') || ''} abrirNovo={params.get('novo') === '1'} />}
            {aba === 'aparelhos' && <PareamentoTablet />}
            {!aba && <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Você não tem permissão para ver nada neste painel.</p>}
        </div>
    );
}
