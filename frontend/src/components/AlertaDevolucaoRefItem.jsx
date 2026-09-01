import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, X, ExternalLink, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import configNotasService from '../services/configNotasService';

// ─────────────────────────────────────────────────────────────────────────────
// LEMBRETE DA CHAVE DA NF-e DE DEVOLUÇÃO POR ITEM — só para o Clarkson.
//
// Pedido dele (09/2026), nas palavras dele: "deixe um comunicado para o usuário clarkson
// a cada 10 minutos na tela do app enquanto ele não acionar a chave, para eu não esquecer".
// É isso literalmente: pop-up a cada 10 minutos, some quando a chave estiver acionada.
//
// Por que este componente e não o Clippy: o Clippy é `hidden lg:block` (não aparece no
// celular nem no iPad em retrato) e a novidade dele é de uma vez só — ao ver, marca
// `clippy_novidade_vista` no localStorage e nunca mais volta. Insistência a cada N minutos
// já tem mecanismo pronto e em produção neste projeto: a família `Alerta*` do App.jsx
// (AlertaFaturamento = 10 min, AlertaPedidoConvertido = 5 min, AlertaPedidosNaoEnviados =
// 30 min). Este arquivo é a mesma receita do `AlertaFaturamento`, sem o bip.
//
// A chave em si (`nfe_devolucao_ref_item`) mora no backend; quem manda no estado é o
// GET /config-notas/devolucao-ref-item, que devolve `ligado` calculado pela MESMA função
// que a emissão usa. Nada de refazer essa conta aqui.
// ─────────────────────────────────────────────────────────────────────────────

const INTERVALO_MS = 10 * 60 * 1000;  // 10 minutos — o que ele pediu
const DELAY_INICIAL_MS = 8000;        // 8s para não disputar com o carregamento da tela

// ─── Quando o lembrete COMEÇA a aparecer ─────────────────────────────────────
// Pedido do dono em 01/09/2026, depois de ver funcionando: "aparece direto (…) me comunique
// no dia 03 em diante, assim vai ficar todo o dia até lá é muito". Do jeito original seriam
// 34 dias de modal a cada 10 min (01/09 → 05/10). Fica quieto até a data abaixo e só cobra
// nos 3 dias que importam: 03, 04 e 05/10.
// A FREQUÊNCIA não mudou (continua 10 min) — ele pediu para mudar quando COMEÇA.
// Para antecipar ou adiar, basta trocar esta linha.
const INICIO_LEMBRETE = '2026-10-03';   // 'YYYY-MM-DD', no fuso de Brasília

// Dia 'YYYY-MM-DD' → milissegundos UTC, montado pelos pedaços (nunca `new Date('2026-10-05')`,
// que é lido como UTC e vira 04/10 no Brasil). Serve só para comparar datas entre si.
const diaEmMs = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// "Hoje" vem do SERVIDOR, nunca do relógio do aparelho: `obrigatorioEm` menos `diasRestantes`
// devolve a data de hoje já no fuso de Brasília — o mesmo fuso com que o backend decide o
// próprio interruptor. O relógio do iPad pode estar errado ou em outro fuso, e numa janela de
// 3 dias começar um dia tarde custa um terço dela.
// Se o servidor não mandar os dados, ERRA PARA O LADO DE LEMBRAR: um aviso a mais é melhor do
// que um prazo fiscal perdido em silêncio.
const jaPodeLembrar = (data) => {
    const dias = Number(data?.diasRestantes);
    const prazoMs = diaEmMs(data?.obrigatorioEm);
    const inicioMs = diaEmMs(INICIO_LEMBRETE);
    if (!Number.isFinite(dias) || prazoMs === null || inicioMs === null) return true;
    const hojeMs = prazoMs - dias * 86400000;   // data de hoje segundo o servidor
    return hojeMs >= inicioMs;
};

// ─── Quem é o Clarkson ───────────────────────────────────────────────────────
// ⚠️ NÃO "simplificar" isto de volta para só o ID.
//
// O casamento é por DUAS vias e basta UMA bater, de propósito. O ID abaixo foi conferido no
// banco LOCAL (`vendedores`: Clarkson Neitzel / login "Clarkson" / clarksonneitzel@gmail.com),
// mas NÃO foi possível confirmá-lo no banco de PRODUÇÃO — não existe rota que exponha isso e o
// `export-full-db` do admin-exec está bloqueado no ambiente. Se o ID de produção for outro e o
// critério dependesse só dele, o lembrete simplesmente nunca apareceria, sem erro nenhum na
// tela nem no log — que é exatamente o que ele pediu para NÃO acontecer ("para eu não esquecer").
//
// Por isso o LOGIN é a via principal: é o que se confirmou existir de fato, e é a credencial que
// ele digita para entrar (diferente do `nome`, que é texto livre e pode ser reescrito no cadastro).
//
// Uma 3ª via por e-mail (clarksonneitzel@gmail.com) foi pedida e NÃO dá para fazer hoje: o
// usuário logado não traz e-mail. `GET /auth/me` e o login (backend/controllers/appAuthController.js)
// devolvem só `id`, `nome`, `login`, `permissoes` e `formasAtendimentoVisiveis` — comparar com
// `user.email` seria comparar com `undefined`, que nunca casa e só daria falsa sensação de rede
// de segurança. Para ligar essa via, o `/auth/me` precisa passar a devolver `email`; aí é só
// acrescentar a comparação aqui.
const LOGINS_CLARKSON = ['clarkson'];                          // via 1 (principal, confirmada)
const IDS_CLARKSON = ['cd3dff75-91e1-4284-8d20-f933b7ae31e3']; // via 2 (não confirmada em produção)

export function ehClarkson(user) {
    if (!user) return false;
    if (LOGINS_CLARKSON.includes(String(user.login ?? '').trim().toLowerCase())) return true;
    return IDS_CLARKSON.includes(String(user.id ?? '').trim());
}

const fmtData = (iso) => {
    // `obrigatorioEm` vem como 'YYYY-MM-DD' — montar a data pelos pedaços evita o pulo de
    // fuso do `new Date('2026-10-05')` (que é lido como UTC e vira 04/10 no Brasil).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

const AlertaDevolucaoRefItem = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [estado, setEstado] = useState(null);   // resposta do GET
    const [visivel, setVisivel] = useState(false);
    const dispensadoRef = useRef(false);
    const intervalRef = useRef(null);

    const paraMim = ehClarkson(user);

    // Quando o lembrete para de aparecer.
    //
    // ⚠️ NÃO voltar para "só `ligado === true`". Em `refItemLigada()`, no modo `auto`, existe
    //    `if (focusNfe.ambiente() === 'homologacao') return true;`
    // Ou seja: em HOMOLOGAÇÃO a chave aparece como ligada sem ninguém ter acionado nada. E é
    // justamente para homologação que o dono vai virar o ambiente quando conseguir o token da
    // Focus (item 2 da lista deste lembrete) — o aviso calaria na hora em que ele mais precisa
    // dele, sem erro nem log. Estar ligado por causa do AMBIENTE não é um ato dele.
    //
    // Os dois motivos legítimos de parar:
    //  1. `definido` — ele escolheu conscientemente uma das três opções (é o critério principal;
    //     o backend só devolve true quando há escolha VÁLIDA gravada, lixo no banco dá false);
    //  2. a chave ligada DE VERDADE em produção — quando o modo `auto` virar sozinho em
    //     05/10/2026 não há mais nada a lembrar.
    // "Nunca" escolhido de propósito também encerra: foi decisão dele, e o lembrete não pode
    // virar armadilha que só some se ele ligar.
    const chaveAcionada = (data) => !!data && (
        data.definido === true ||
        (data.ligado === true && data.ambiente === 'producao')
    );

    const verificar = useCallback(async () => {
        try {
            const data = await configNotasService.getDevolucaoRefItem();
            setEstado(data || null);
            if (chaveAcionada(data)) {
                setVisivel(false);
                // Cumpriu o papel: para de perguntar (não fica um GET a cada 10 min para sempre).
                if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
                return;
            }
            // Antes de INICIO_LEMBRETE o ciclo continua rodando (barato, e é ele que descobre
            // quando a data chega), mas nada aparece na tela.
            if (!dispensadoRef.current && jaPodeLembrar(data)) setVisivel(true);
        } catch (error) {
            // Fica quieto na tela (sem internet ou backend ainda sem a rota não é assunto do
            // usuário) — mas NUNCA em silêncio no console: se um dia o lembrete sumir, tem que
            // dar para descobrir o motivo aqui, em vez de ficar no escuro.
            const status = error?.response?.status;
            const motivo = status === 404
                ? 'a rota GET /config-notas/devolucao-ref-item não existe neste servidor (backend ainda não publicado?)'
                : status === 401 || status === 403
                    ? `o servidor recusou a consulta (HTTP ${status})`
                    : status
                        ? `o servidor respondeu HTTP ${status}`
                        : `falha de rede (${error?.message || 'sem detalhe'})`;
            console.warn(
                `[AlertaDevolucaoRefItem] lembrete NÃO exibido nesta rodada: ${motivo}. ` +
                'Tenta de novo no próximo ciclo de 10 min.'
            );
        }
    }, []);

    useEffect(() => {
        if (!paraMim) return;

        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);

        // A cada 10 minutos o "dispensar" da vez é esquecido e o aviso volta — é o pedido.
        intervalRef.current = setInterval(() => {
            dispensadoRef.current = false;
            verificar();
        }, INTERVALO_MS);

        return () => {
            clearTimeout(timer);
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        };
    }, [paraMim, verificar]);

    const dispensar = () => {
        dispensadoRef.current = true;
        setVisivel(false);
    };

    const irParaChave = () => {
        dispensar();
        navigate('/admin/config#nfe-devolucao-ref-item');
    };

    // `jaPodeLembrar` também aqui, e não só no `verificar`: é a última porta antes de pintar na
    // tela — protege de qualquer caminho que ligue `visivel` sem passar pela checagem de data.
    if (!paraMim || !visivel || !estado || chaveAcionada(estado) || !jaPodeLembrar(estado)) return null;

    const dias = Number.isFinite(Number(estado.diasRestantes)) ? Number(estado.diasRestantes) : null;
    const dataLimite = fmtData(estado.obrigatorioEm) || '05/10/2026';
    const prazoTexto = dias == null
        ? `prazo: ${dataLimite}`
        : dias > 0
            ? `faltam ${dias} dia${dias === 1 ? '' : 's'} (até ${dataLimite})`
            : dias === 0
                ? `o prazo é HOJE (${dataLimite})`
                : `o prazo venceu em ${dataLimite}`;

    const modoTexto = { auto: 'Automático', sempre: 'Sempre ligado', nunca: 'Nunca' }[estado.modo] || estado.modo || '—';
    // O backend devolve 'producao'/'homologacao' sem acento (é o valor da env) — na tela sai em português.
    const ambienteTexto = { producao: 'produção', homologacao: 'homologação' }[estado.ambiente] || estado.ambiente || null;

    return (
        // z-[9990]: um degrau ABAIXO de todos os outros avisos (9999 = faturamento, tarefas,
        // autorização de devolução, pedidos do site; 9998 = comissão, pedidos não enviados).
        // Lembrete de configuração nunca pode passar na frente de aviso operacional — e o
        // z-index resolve isso independente da ordem de montagem no App.jsx, que muda quando
        // alguém acrescenta um alerta novo.
        <div className="no-print fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="bg-amber-500 px-4 md:px-5 py-3.5 flex items-start justify-between gap-2 shrink-0">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="bg-white/20 rounded-full p-2 shrink-0">
                            <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-white font-bold text-base md:text-lg leading-tight break-words">
                                Falta acionar a chave da devolução por item
                            </h2>
                            <p className="text-amber-50 text-xs md:text-sm leading-snug break-words">
                                Lembrete só seu, Clarkson — volta a cada 10 minutos até a chave estar acionada.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={dispensar}
                        aria-label="Fechar o lembrete"
                        className="text-white/80 hover:text-white transition-colors shrink-0 p-2 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 md:px-5 py-4 overflow-y-auto space-y-3">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-sm text-amber-800 font-semibold break-words">{prazoTexto}</span>
                    </div>

                    <p className="text-sm text-gray-600 leading-snug break-words">
                        A NF-e de devolução referenciando a nota de origem <span className="font-semibold">item a item</span> já
                        está publicada, mas continua <span className="font-semibold">desligada</span>. O que ainda falta:
                    </p>

                    <ol className="space-y-2">
                        {[
                            <>
                                <span className="font-semibold">Acionar a chave</span> em Configurações → Notas &amp; Certificado
                                (hoje está em <span className="font-semibold">{modoTexto}</span>).
                            </>,
                            <>
                                Conseguir o <span className="font-semibold">token de homologação da Focus</span> — sem ele não dá
                                para provar que a SEFAZ aceita a nota antes de valer para os clientes.
                            </>,
                            <>
                                Levar a pergunta da <span className="font-semibold">VC02-50</span> para a contabilidade.
                            </>,
                        ].map((texto, i) => (
                            <li key={i} className="flex gap-2.5 items-start bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                                <span className="shrink-0 h-6 w-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
                                    {i + 1}
                                </span>
                                <span className="text-sm text-gray-700 leading-snug break-words min-w-0">{texto}</span>
                            </li>
                        ))}
                    </ol>

                    <p className="text-xs text-gray-500 leading-snug break-words">
                        Se ninguém mexer, a chave em <span className="font-semibold">Automático</span> liga sozinha em {dataLimite}.
                        {ambienteTexto ? ` Emissão hoje no ambiente de ${ambienteTexto}.` : ''}
                    </p>
                </div>

                {/* Footer */}
                <div className="px-4 md:px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2 shrink-0">
                    <button
                        onClick={dispensar}
                        className="px-4 py-3 md:py-2 min-h-[44px] text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors rounded-full"
                    >
                        Fechar (volta em 10 min)
                    </button>
                    <button
                        onClick={irParaChave}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm transition-colors"
                    >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        Ir para a chave
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaDevolucaoRefItem;
