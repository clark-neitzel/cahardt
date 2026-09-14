import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Snowflake, PartyPopper, Link2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/PageHeader';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import SiteAdmin from '../SiteAdmin/SiteAdmin';
import KitFestaAdmin from '../KitFesta/KitFestaAdmin';

// Casca de navegação (B4 do plano nav-design-vendas, 09/2026): uma entrada de
// menu só, "Pedidos Online", com abas Site (Congelados) / Kit Festa. Cada aba
// monta a tela administrativa ORIGINAL inteira (com `embutido`, que só esconde
// o cabeçalho próprio do canal — catálogo, entrega e regras de cada canal
// continuam exatamente como eram nas rotas antigas /site-admin e
// /kit-festa-admin, que agora só redirecionam para cá).
//
// Visual (pedido do dono em 14/09/2026): IGUAL à aba de Pedidos — cabeçalho
// único no topo com as ações do canal à direita, abas em "pasta" (rounded-t)
// e as sub-abas do canal como chips, no lugar dos dois cabeçalhos empilhados.
const CANAIS = [
    {
        id: 'site',
        label: 'Site (Congelados)',
        icon: Snowflake,
        corAtiva: 'text-sky-700',
        linkSite: '/inicio',
        linkCliente: '/congelados',
    },
    {
        id: 'kit-festa',
        label: 'Kit Festa',
        icon: PartyPopper,
        corAtiva: 'text-emerald-700',
        linkSite: '/kit-festa',
        linkCliente: '/kit-festa',
    },
];

export default function PedidosOnlineAdmin() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [abaSalva, setAbaSalva] = useFiltroSalvo('pedidos-online:aba', 'site');

    const abaUrl = searchParams.get('aba');
    const aba = (abaUrl === 'site' || abaUrl === 'kit-festa') ? abaUrl : abaSalva;
    const canal = CANAIS.find((c) => c.id === aba) || CANAIS[0];

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

    const linkSite = `${window.location.origin}${canal.linkSite}`;
    const linkCliente = `${window.location.origin}${canal.linkCliente}`;
    const copiarLink = () => {
        navigator.clipboard.writeText(linkCliente).then(() => toast.success('Link copiado!'));
    };

    return (
        <div className="w-full py-3 sm:py-5 overflow-x-hidden px-3 sm:px-0">
            {/* Topbar — mesmo cabeçalho da aba de Pedidos, com as ações do canal à direita */}
            <PageHeader
                icon={ShoppingBag}
                cor="blue"
                titulo="Pedidos Online"
                className="!p-0 mb-4"
                acoes={
                    <>
                        {/* Site público: abre fora do app de propósito (link externo) */}
                        <a
                            href={linkSite}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm"
                        >
                            <Link2 className="h-4 w-4" /> Abrir site
                        </a>
                        <button
                            onClick={copiarLink}
                            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs md:text-sm"
                        >
                            <Copy className="h-4 w-4" /> Copiar link do cliente
                        </button>
                    </>
                }
            />

            {/* Abas em "pasta": Site (Congelados) | Kit Festa — mesmo desenho das abas de Pedidos */}
            <div className="mb-2">
                <div className="flex overflow-x-auto scrollbar-hide gap-1 pb-0.5">
                    {CANAIS.map((c) => {
                        const Icon = c.icon;
                        const ativa = aba === c.id;
                        return (
                            <button
                                key={c.id}
                                onClick={() => trocarAba(c.id)}
                                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-t border transition-colors ${ativa
                                    ? `bg-white ${c.corAtiva} border-gray-200 border-b-white z-10 -mb-[1px]`
                                    : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {c.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {aba === 'kit-festa' ? <KitFestaAdmin embutido /> : <SiteAdmin embutido />}
        </div>
    );
}
