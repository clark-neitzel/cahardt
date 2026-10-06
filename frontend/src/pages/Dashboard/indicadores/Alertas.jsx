import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import EstadoVazio from '../../../components/EstadoVazio';
import { Chip } from './Bloco';
import { useAuth } from '../../../contexts/AuthContext';

// Nível sempre com PALAVRA além do ícone/cor.
const NIVEL = {
    urgente: { ic: '!', palavra: 'urgente', cls: 'bg-red-100 text-red-700' },
    atencao: { ic: '△', palavra: 'atenção', cls: 'bg-amber-100 text-amber-700' },
    info: { ic: 'i', palavra: 'informação', cls: 'bg-gray-100 text-gray-700' },
};

export function contarAlertas(itens) {
    const l = Array.isArray(itens) ? itens : [];
    return { urgente: l.filter((i) => i.nivel === 'urgente').length, atencao: l.filter((i) => i.nivel === 'atencao').length };
}

export default function Alertas({ itens }) {
    const nav = useNavigate();
    const { user, hasPermission } = useAuth();
    // acao.permissao (vem do servidor): chave simples ('Pode_...', 'produtos') ou 'pcp.<chave>'
    // (= canPcp do menu). Sem permissão, o botão some — ninguém cai em "Acesso negado".
    const podeAbrir = (acao) => {
        const perm = acao?.permissao;
        if (!perm) return true;
        if (perm.startsWith('pcp.')) return !!user?.permissoes?.admin || !!user?.permissoes?.pcp?.[perm.slice(4)];
        return hasPermission(perm);
    };
    const l = Array.isArray(itens) ? itens : [];
    if (!l.length) return <EstadoVazio icon={CheckCircle2} titulo="Nada para agir agora" descricao="Nenhum indicador fora do esperado neste período." />;
    return (
        <ul className="space-y-2">
            {l.map((a) => {
                const n = NIVEL[a.nivel] || NIVEL.info;
                return (
                    <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-gray-200 p-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className={`flex-none w-7 h-7 rounded-lg inline-flex items-center justify-center text-sm font-extrabold ${n.cls}`} aria-hidden="true">{n.ic}</span>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900 leading-snug"><Chip cls={n.cls} className="mr-1.5 align-middle">{n.palavra}</Chip>{a.titulo}</div>
                                {a.texto && <p className="text-xs text-gray-600 mt-0.5">{a.texto}</p>}
                            </div>
                        </div>
                        {a.acao?.rota && podeAbrir(a.acao) && (
                            <button type="button" onClick={() => nav(a.acao.rota)} className="self-start sm:self-center flex-none px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-bold">
                                {a.acao.rotulo || 'Abrir'}
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
