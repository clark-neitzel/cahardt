import { MessageCircle, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Aviso AMIGÁVEL (não bloqueante) de que o cliente escolhido ainda não tem
// WhatsApp no cadastro. Aparece assim que o cliente é selecionado no pedido —
// é o melhor momento: o vendedor está com ele na frente.
//
// Não trava nada: o vendedor pode ignorar e seguir. Quem bloqueia (quando o
// escritório liga a exigência) é o servidor, na hora de ENVIAR.
// ─────────────────────────────────────────────────────────────────────────────
export default function AvisoWhatsappFaltante({ nomeCliente, onPegarAgora, onDispensar }) {
    return (
        <div className="mx-3 mt-1 mb-1 px-3 py-2.5 rounded-lg border bg-amber-50 border-amber-300 text-amber-800 flex items-start gap-2.5 text-sm">
            <MessageCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">
                    {nomeCliente ? `${nomeCliente} ainda não tem WhatsApp cadastrado` : 'Cliente ainda não tem WhatsApp cadastrado'}
                </p>
                <p className="text-xs mt-0.5 opacity-90 leading-snug">
                    Aproveite que você está com ele e pegue o número — é por ele que o cliente recebe a
                    confirmação do pedido e o escritório consegue falar com ele.
                </p>
                <button
                    type="button"
                    onClick={onPegarAgora}
                    className="mt-2 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1.5 min-h-[36px]"
                >
                    <MessageCircle className="h-3.5 w-3.5" /> Pegar o WhatsApp agora
                </button>
            </div>
            <button
                type="button"
                onClick={onDispensar}
                aria-label="Dispensar aviso"
                className="p-2 -mr-1 -mt-1 text-amber-500 hover:text-amber-700 rounded-full hover:bg-amber-100 shrink-0"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
