import React from 'react';
import { MapPin, Store, AlertTriangle, Map as MapaIcon } from 'lucide-react';

/**
 * EntregarEm — bloco "Entregar em" (Delivery e Pedidos).
 *
 * Mostra ONDE entregar o pedido:
 *  - Pedido do Kit Festa para entrega com endereço próprio → verde, tag "Endereço do pedido".
 *  - Pedido do Kit Festa de retirada → cinza "Retirada na loja".
 *  - Pedido comum (sem Kit Festa) → endereço do CADASTRO, tag "Endereço do cadastro", sem aviso.
 *  - Aviso amarelo "Diferente do cadastro" SOMENTE quando divergeCadastro === true.
 *  - Sem endereço nenhum → "Endereço não informado" e sem botão de mapa.
 *
 * Props:
 *   modo             'entrega' | 'retirada' | null/undefined (null = pedido comum)
 *   enderecoPedido   texto do endereço digitado no pedido (Kit Festa) ou null
 *   divergeCadastro  true | false | null (só true mostra o aviso)
 *   enderecoCadastro texto do cadastro do cliente (ver enderecoDoCadastro)
 *   compacto         variante menor (lista de Pedidos)
 */

const limpar = (v) => (typeof v === 'string' ? v.trim() : '');

/** Texto do endereço do cadastro do cliente: "Rua X, 10 — Compl — Bairro — Cidade/UF — CEP 00000-000". */
export function enderecoDoCadastro(cliente) {
    if (!cliente) return '';
    const logradouro = limpar(cliente.End_Logradouro);
    const numero = limpar(cliente.End_Numero);
    const cidade = limpar(cliente.End_Cidade);
    const uf = limpar(cliente.End_Estado);
    const cep = limpar(cliente.End_CEP);
    return [
        logradouro && `${logradouro}${numero ? `, ${numero}` : ''}`,
        limpar(cliente.End_Complemento),
        limpar(cliente.End_Bairro),
        cidade && `${cidade}${uf ? `/${uf}` : ''}`,
        cep && `CEP ${cep}`
    ].filter(Boolean).join(' — ');
}

const linkMapa = (endereco) => {
    const consulta = endereco.replace(/\s+—\s+/g, ', ').replace(/CEP\s+/g, '');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
};

export default function EntregarEm({ modo, enderecoPedido, divergeCadastro, enderecoCadastro, compacto = false }) {
    const doPedido = limpar(enderecoPedido);
    const doCadastro = limpar(enderecoCadastro);
    const retirada = modo === 'retirada';

    // Qual endereço aparece e de onde ele vem
    const endereco = retirada ? '' : (doPedido || doCadastro);
    const origemPedido = !retirada && !!doPedido;
    const divergente = origemPedido && divergeCadastro === true;

    const pad = compacto ? 'px-2 py-1.5' : 'px-3 py-2';
    const txtEndereco = compacto ? 'text-xs' : 'text-[13px]';

    if (retirada) {
        return (
            <div className={`mt-2 border-2 border-gray-400 bg-gray-100 rounded-xl ${pad}`}>
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-gray-700">
                    <Store className="h-3.5 w-3.5 shrink-0" />
                    Retirada na loja
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2">
            <div className={`border-2 border-primary bg-[#ecf7f2] rounded-xl ${pad}`}>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-extrabold uppercase tracking-widest text-primaryDark">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    Entregar em
                    {endereco && (
                        <span className={`ml-auto normal-case tracking-normal px-2 py-0.5 rounded-full text-[10px] font-bold ${origemPedido ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                            {origemPedido ? 'Endereço do pedido' : 'Endereço do cadastro'}
                        </span>
                    )}
                </div>
                {endereco ? (
                    <>
                        <p className={`${txtEndereco} font-bold text-gray-900 leading-snug mt-1 break-words ${compacto ? 'line-clamp-2' : ''}`}>
                            {endereco}
                        </p>
                        <a
                            href={linkMapa(endereco)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-1 min-h-[44px] md:min-h-[32px] px-3 text-[11px] font-bold text-primary border border-primary rounded-full bg-white hover:bg-mint/40"
                        >
                            <MapaIcon className="h-3.5 w-3.5" /> Abrir no mapa
                        </a>
                    </>
                ) : (
                    <p className={`${txtEndereco} font-semibold text-gray-600 mt-1`}>Endereço não informado</p>
                )}
            </div>
            {divergente && (
                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                        <b>Diferente do cadastro</b>{doCadastro ? `: ${doCadastro}` : ''}
                    </span>
                </div>
            )}
        </div>
    );
}
