import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Snowflake, PartyPopper } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import SiteAdmin from '../SiteAdmin/SiteAdmin';
import KitFestaAdmin from '../KitFesta/KitFestaAdmin';

// Casca de navegação (B4 do plano nav-design-vendas, 09/2026): uma entrada de
// menu só, "Pedidos Online", com abas Site (Congelados) / Kit Festa. Cada aba
// monta a tela administrativa ORIGINAL inteira, sem alterar nada por dentro
// dela — catálogo, entrega e regras de cada canal continuam exatamente como
// eram nas rotas antigas (/site-admin e /kit-festa-admin, que agora só
// redirecionam para cá).
const ABAS = [
    { id: 'site', label: 'Site (Congelados)', icon: Snowflake },
    { id: 'kit-festa', label: 'Kit Festa', icon: PartyPopper },
];

export default function PedidosOnlineAdmin() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [abaSalva, setAbaSalva] = useFiltroSalvo('pedidos-online:aba', 'site');

    const abaUrl = searchParams.get('aba');
    const aba = (abaUrl === 'site' || abaUrl === 'kit-festa') ? abaUrl : abaSalva;

    // Um link/favorito antigo chega aqui via redirect com ?aba=... — essa vira
    // a escolha lembrada do usuário; sem parâmetro, usa a última aba salva.
    useEffect(() => {
        if ((abaUrl === 'site' || abaUrl === 'kit-festa') && abaUrl !== abaSalva) {
            setAbaSalva(abaUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abaUrl]);

    const trocarAba = (id) => {
        setAbaSalva(id);
        setSearchParams((prev) => {
            const novo = new URLSearchParams(prev);
            novo.set('aba', id);
            return novo;
        }, { replace: true });
    };

    return (
        <div className="max-w-full overflow-x-hidden">
            <PageHeader
                icon={ShoppingBag}
                cor="blue"
                titulo="Pedidos Online"
                subtitulo="Site de Congelados e Kit Festa — pedidos vindos de fora, num só lugar"
            />

            <div className="px-3 md:px-6">
                <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-4">
                    {ABAS.map((a) => {
                        const Icon = a.icon;
                        const ativa = aba === a.id;
                        return (
                            <button
                                key={a.id}
                                onClick={() => trocarAba(a.id)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${ativa
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {a.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {aba === 'kit-festa' ? <KitFestaAdmin /> : <SiteAdmin />}
        </div>
    );
}
