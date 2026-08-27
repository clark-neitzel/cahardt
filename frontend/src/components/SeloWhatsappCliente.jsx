import { MessageCircle, MessageCircleOff, AlertTriangle } from 'lucide-react';
import { numeroWhatsappValido } from '../services/whatsappClientesService';

// ─────────────────────────────────────────────────────────────────────────────
// Selo de WhatsApp na LINHA da lista (Rota → Atendimento/Atendidos/Entregas/
// Entregues, modo Organizar Rota e Painel de Atendimentos).
//
// O vendedor em campo e o motorista precisam saber se o cliente tem WhatsApp
// SEM abrir a ficha. Modelado no ChipGpsEndereco que já vive nesses cards:
// mesma pílula, mesmo text-[10px], mesmo ícone h-3 w-3.
//
// ⚠️ VOCABULÁRIO — regra do projeto, não mexer:
// o selo EM_USO significa APENAS "já saiu mensagem nossa para esse número".
// NÃO é "validado", "verificado", "confirmado" nem "o cliente recebeu" — o
// sistema não sabe disso. Nunca escrever essas palavras aqui.
// `verificacaoStatus` (o eco do bot) NÃO entra nas listas: hoje é sempre
// INDISPONIVEL/null e mostrá-lo seria a tela prometer o que não sabe. Ele fica
// só no Detalhe do Cliente.
//
// Só os DOIS estados ruins levam texto (são os acionáveis e são minoria); os
// bons ocupam ~14px, então uma lista inteira deles não empurra nada em 320px.
// ─────────────────────────────────────────────────────────────────────────────

const CHIP = 'inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold';

const TITULO = {
    SEM: 'Este cliente não tem número de WhatsApp no cadastro.',
    SEM_CLICAVEL: 'Este cliente não tem número de WhatsApp no cadastro. Toque para cadastrar agora.',
    PROBLEMA: 'A última tentativa de mensagem para este número não foi entregue. O escritório precisa conferir.',
    EM_USO: 'Já saiu mensagem nossa para este número. Não quer dizer que o cliente respondeu ou confirmou.',
    NEUTRO: 'Tem número cadastrado, mas ainda não saiu mensagem nossa para ele.',
};

export default function SeloWhatsappCliente({
    cliente,
    mostrar = false,          // flag mostrarSeloNasListas (GET /whatsapp-clientes/config)
    podeEditar = false,       // espelho do gate do backend — calculado na tela
    onPegarNumero = null,     // (cliente) => void — abre o ModalWhatsappCliente da tela
    className = '',
}) {
    // Flag desligada = o app fica exatamente como era.
    if (!mostrar) return null;

    // Sem UUID = não é um cliente do cadastro. É o caso da AMOSTRA DE LEAD:
    // backend/routes/entregas.js monta um `cliente` sintético só com nome e GPS —
    // sem UUID e SEM A CHAVE `whatsappStatus` (ausente, não `null`).
    // Sem esta guarda a aba Entregas quebraria.
    if (!cliente?.UUID) return null;

    const temNumero = numeroWhatsappValido(cliente?.Telefone_Celular);
    // Encadeamento opcional em CADA nível: a chave pode estar ausente (backend
    // antigo, cliente sintético) — ausente e null caem os dois no estado neutro.
    const selo = cliente?.whatsappStatus?.selo || null;

    // 1) SEM NÚMERO — o único estado que vira ação. O vendedor está com o cliente
    //    na frente: toca, digita, pronto.
    if (!temNumero) {
        const conteudo = <><MessageCircleOff className="h-3 w-3 shrink-0" /> Sem WhatsApp</>;

        // Quem não passa no gate vê o chip ESTÁTICO — nunca um botão que leva a 403.
        if (!podeEditar || !onPegarNumero) {
            return <span className={`${CHIP} bg-amber-100 text-amber-700 ${className}`} title={TITULO.SEM}>{conteudo}</span>;
        }
        return (
            <button
                type="button"
                // O nome do cliente ao lado já é botão (abre o ClientePopup) e alguns
                // cards inteiros são clicáveis: o selo não pode roubar esse clique.
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPegarNumero(cliente); }}
                title={TITULO.SEM_CLICAVEL}
                // Alvo de toque de ~38px SEM caixa de 38px: o pseudo-elemento NÃO ocupa
                // layout, então o chip continua do tamanho dos vizinhos e a fileira não
                // cresce nem empurra o nome. `-inset-y-2` cresce 8px para cima e para
                // baixo, onde não há vizinho (a fileira de chips é uma linha só);
                // `-inset-x-1` (4px) cabe dentro do gap da fileira, e os vizinhos ali são
                // <span> não clicáveis — o único botão irmão é o do GPS, que fica com folga.
                //
                // `before:z-[1]` é PRECAUÇÃO, não conserto de defeito: NÃO houve bug aqui.
                // O alvo mede 39-40px com ou sem esta classe — medido no app real pelo QA e
                // em bancada nos 5 pontos de inserção (08/2026). Ela existe porque o modo de
                // falha é barato de evitar e caro de descobrir: o botão é `relative` com
                // `z-index: auto`, ou seja NÃO cria contexto de empilhamento, então o ::before
                // disputa a pintura direto com os irmãos do card. Um irmão POSICIONADO pintado
                // depois cobriria a área ampliada e derrubaria o alvo para os 23px do chip —
                // reproduzido em bancada, mas NÃO presente em nenhum card de hoje. O `1` ganha
                // de qualquer irmão em `auto`/`0` e é o MENOR valor que serve.
                // NÃO mover o z-index para o botão: elevar o botão inteiro faz o chip cobrir
                // mais do nome do cliente, que é exatamente o que não pode crescer.
                className={`${CHIP} bg-amber-100 text-amber-700 hover:bg-amber-200 active:bg-amber-200 py-1 touch-manipulation relative before:absolute before:z-[1] before:content-[''] before:-inset-y-2 before:-inset-x-1 ${className}`}
            >
                {conteudo}
            </button>
        );
    }

    // 2) NÚMERO COM PROBLEMA — não vira botão: o número existe e o vendedor não
    //    sabe o que está errado. É caso de escritório.
    if (selo === 'COM_PROBLEMA') {
        return (
            <span className={`${CHIP} bg-red-100 text-red-700 ${className}`} title={TITULO.PROBLEMA}>
                <AlertTriangle className="h-3 w-3 shrink-0" /> WhatsApp com problema
            </span>
        );
    }

    // 3) EM USO — só o ícone, verde.
    if (selo === 'EM_USO') {
        return (
            <span
                className={`inline-flex items-center shrink-0 ${className}`}
                title={TITULO.EM_USO}
                role="img"
                aria-label="WhatsApp em uso"
            >
                <MessageCircle className="h-3.5 w-3.5 text-primary" />
            </span>
        );
    }

    // 4) NEUTRO — tem número, sem histórico de mensagem nossa.
    return (
        <span
            className={`inline-flex items-center shrink-0 ${className}`}
            title={TITULO.NEUTRO}
            role="img"
            aria-label="Tem WhatsApp cadastrado, sem histórico de mensagem"
        >
            <MessageCircle className="h-3.5 w-3.5 text-gray-300" />
        </span>
    );
}

// Legenda da tela — o tooltip não abre no toque, então a explicação aparece uma
// vez por tela, discreta, sob a barra de abas/filtros. NÃO pode sugerir tempo
// real: o selo é recalculado no job das 04:20.
export function LegendaSeloWhatsapp({ mostrar = false, className = '' }) {
    if (!mostrar) return null;
    return (
        <p className={`text-[10px] text-gray-500 leading-snug ${className}`}>
            💬 verde = WhatsApp em uso · cinza = sem histórico · âmbar = sem número
            <span className="text-gray-400"> · atualizado de madrugada</span>
        </p>
    );
}
