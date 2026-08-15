import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    Archive, AlertTriangle, Loader2, Search, CalendarRange, FolderOpen,
    RefreshCw, Printer, PenLine, Truck, HelpCircle,
} from 'lucide-react';
import BipeCanhoto from '../../components/BipeCanhoto';
import api from '../../services/api';
import canhotoService from '../../services/canhotoService';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

/**
 * ABA "CANHOTOS" (Notas Fiscais) — o arquivo do mês.
 *
 * É aqui que a equipe resolve o PASSADO: pega a pasta física "Notas Emitidas Maio
 * 2026", passa o leitor no maço inteiro e vê na hora o que **não** foi bipado — essas
 * são as que faltam. Nada trava nada nesta tela; a trava do caixa é o Pedaço 2.
 *
 * Decisões que valem a pena saber antes de mexer:
 *
 * - **Reaproveita o `FiltroPeriodo` da tela** (vem por prop). Um segundo seletor de
 *   período aqui dentro daria duas datas na mesma tela e a equipe erraria o mês.
 * - **Uma consulta por período; filtro e busca são locais.** Um mês real tem ~600
 *   notas e o backend já devolve tudo com cliente/valor em snapshot. Filtrar no
 *   navegador deixa o clique instantâneo e não repete a auto-cura do backend a cada
 *   tecla digitada.
 * - **Depois de cada bipe a linha muda na hora** (com o canhoto que a resposta trouxe)
 *   e os contadores são resincronizados por uma recarga silenciosa, adiada até parar
 *   de bipar. Recarregar a lista inteira a cada folha faria a tela piscar no meio do
 *   mutirão.
 */

const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));

/**
 * Situação de cada nota. As cores seguem o significado do design system e NÃO devem
 * ser trocadas: verde = resolvido, azul = em andamento, amarelo = pendente com prazo
 * correndo, cinza = pendente sem informação, vermelho = problema.
 */
const SITUACOES = {
    ARQUIVADO: { rotulo: '🗄 Arquivado', classe: 'bg-green-100 text-green-800', concluido: true },
    RECEBIDO: { rotulo: '✓ Recebido', classe: 'bg-blue-100 text-blue-800' },
    AGUARDANDO: { rotulo: '⏳ Na rua', classe: 'bg-yellow-100 text-yellow-800' },
    DESCONHECIDO: { rotulo: '? Estado desconhecido', classe: 'bg-gray-100 text-gray-700' },
    SEM_ASSINATURA: { rotulo: '✎ Sem assinatura', classe: 'bg-red-100 text-red-700', concluido: true },
    SEM_CANHOTO: { rotulo: '✕ Sem canhoto', classe: 'bg-red-100 text-red-700', concluido: true },
};

/**
 * Devolução cujo papel ainda não está no arquivo — exatamente os estados que o backend
 * usa em `contadores.devolucaoAReimprimir`. A lista está repetida aqui de propósito: é
 * o que garante que o número do chip e a quantidade de botões na lista batam.
 *
 * `notaAppId` só existe em nota emitida PELO APP. Na nota antiga do Conta Azul ele vem
 * `null` — não há DANFE para o app gerar, e aí o botão não aparece (o aviso do rodapé
 * manda para a aba Emitidas).
 */
const PRECISA_REIMPRIMIR = ['AGUARDANDO', 'DESCONHECIDO', 'RECEBIDO'];

// Ritmo da recarga silenciosa depois de bipar (ver `agendarRecarga`).
const ESPERA_RECARGA_MS = 1200;   // espera normal, para juntar a rajada
const TETO_ADIAMENTO_MS = 15000;  // ... mas nunca adia além disto
const TETO_BIPES = 10;            // ... nem por mais bipes que isto

const podeReimprimirDanfe = (i) => i.tipo === 'DEVOLUCAO' && !!i.notaAppId && PRECISA_REIMPRIMIR.includes(i.status);

const SituacaoBadge = ({ item }) => {
    const s = SITUACOES[item.status] || { rotulo: item.status || '—', classe: 'bg-gray-100 text-gray-700' };
    /**
     * O chip vermelho de dias é ALARME — só vale para nota que está mesmo na rua.
     * Antes aparecia também em `DESCONHECIDO`, e como o mutirão nasce com o mês inteiro
     * nesse estado, TODA linha do passado ganhava um "102d" vermelho sem nada de errado.
     * Vermelho em tudo é o jeito mais rápido de a equipe parar de ver o vermelho que
     * importa. Agora casa exatamente com o alerta do backend, que também só conta
     * `AGUARDANDO`.
     */
    const mostrarDias = item.status === 'AGUARDANDO' && item.atrasado && item.diasNaRua != null;
    return (
        <span className="inline-flex items-center gap-1 flex-wrap">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${s.classe}`}>{s.rotulo}</span>
            {mostrarDias && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                    {item.diasNaRua}d
                </span>
            )}
        </span>
    );
};

const CanhotosTab = ({ periodo, onTotal }) => {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [backfilling, setBackfilling] = useState(false);
    const [agindo, setAgindo] = useState(null); // `${chave}:acao` em andamento

    // Filtro de situação fica salvo por usuário; a BUSCA por texto não (regra do projeto).
    const [filtro, setFiltro] = useFiltroSalvo('canhotos:situacao', 'todos');
    const [busca, setBusca] = useState('');

    const recarregaRef = useRef(null);
    const inicioRajadaRef = useRef(0);      // instante do 1º bipe adiado da rajada
    const bipesPendentesRef = useRef(0);    // bipes desde a última recarga
    const seqRef = useRef(0);               // nº da consulta — só a última vale (ver `carregar`)
    const montadoRef = useRef(true);
    useEffect(() => {
        // Ligar de novo na montagem é OBRIGATÓRIO, não enfeite: em desenvolvimento o
        // React monta → desmonta → monta para checar efeitos. Sem esta linha a bandeira
        // ficava `false` para sempre depois da primeira limpeza, toda resposta era
        // descartada e a aba travava em "Carregando…" com os contadores zerados.
        montadoRef.current = true;
        return () => {
            montadoRef.current = false;
            if (recarregaRef.current) clearTimeout(recarregaRef.current);
        };
    }, []);

    const temPeriodo = Boolean(periodo?.de && periodo?.ate);

    /**
     * Carrega o período.
     *
     * ⚠️ `seqRef` existe para a RESPOSTA VELHA NÃO SOBRESCREVER A NOVA. O `clearTimeout`
     * do `agendarRecarga` impede duas recargas *agendadas*, mas não duas *em voo*: o teto
     * dispara uma na hora e os bipes seguintes agendam outra 1,2s depois. Com o banco
     * compartilhado lento em horário de pico (cenário documentado no CLAUDE.md), a
     * primeira pode chegar por último e ressuscitar o estado antigo — linhas recém
     * bipadas voltariam de "Arquivado" para "Desconhecido" e o progresso ANDARIA PARA
     * TRÁS. O dado não se estraga (bipar é idempotente), mas a pessoa acha que os
     * últimos bipes não pegaram e re-bipa o maço inteiro. Só a resposta da última
     * chamada disparada é aplicada; as atrasadas são descartadas em silêncio.
     */
    const carregar = useCallback(async ({ silencioso = false, autocura = true } = {}) => {
        // Sem período o backend NÃO dá erro: devolve 200 com tudo zerado e um `aviso`
        // pronto em português. Deixamos a consulta ir e mostramos esse aviso — assim
        // existe uma explicação só, a do servidor, em vez de duas que podem divergir.
        const meuSeq = ++seqRef.current;
        const atual = () => montadoRef.current && seqRef.current === meuSeq;
        if (!silencioso) { setLoading(true); setErro(''); }
        try {
            const r = await canhotoService.listarPeriodo({ de: periodo.de, ate: periodo.ate, autocura });
            if (!atual()) return;
            setDados(r);
            // devolve o total para a aba mostrar "Canhotos (N)", como as outras abas fazem
            onTotal?.(Number(r?.contadores?.total || 0));
        } catch (e) {
            console.error('[Canhoto] Falha ao carregar o período:', e);
            if (!atual()) return;
            if (!silencioso) {
                setErro(e?.response?.data?.error || 'Não consegui carregar os canhotos deste período.');
                // Falhou ao trocar de período: limpa o que estava na tela. Senão o erro
                // aparecia ACIMA da lista do mês anterior, com o cabeçalho anunciando a
                // pasta velha enquanto o seletor já mostrava o mês novo.
                setDados(null);
                onTotal?.(null);
            }
        } finally {
            if (atual() && !silencioso) setLoading(false);
        }
    }, [periodo?.de, periodo?.ate, onTotal]);

    useEffect(() => { carregar(); }, [carregar]);

    /**
     * Recarga silenciosa adiada: junta uma rajada de bipes numa consulta só.
     *
     * O adiamento tem TETO. Sem ele, quem bipa num ritmo constante (que é o ritmo
     * normal de um maço) reinicia o timer a cada folha e a recarga nunca acontece —
     * a barra de progresso e os contadores ficariam parados o mutirão inteiro,
     * exatamente quando a pessoa quer ver o número subir. Chegando a 15s desde o
     * primeiro adiamento OU a 10 bipes, recarrega na hora.
     */
    const agendarRecarga = useCallback(() => {
        bipesPendentesRef.current += 1;
        if (!inicioRajadaRef.current) inicioRajadaRef.current = Date.now();

        const rodar = () => {
            recarregaRef.current = null;
            inicioRajadaRef.current = 0;
            bipesPendentesRef.current = 0;
            carregar({ silencioso: true, autocura: false });
        };

        if (recarregaRef.current) clearTimeout(recarregaRef.current);
        const estourou = (Date.now() - inicioRajadaRef.current >= TETO_ADIAMENTO_MS)
            || bipesPendentesRef.current >= TETO_BIPES;
        if (estourou) rodar();
        else recarregaRef.current = setTimeout(rodar, ESPERA_RECARGA_MS);
    }, [carregar]);

    /** Troca a linha pelo canhoto que a resposta trouxe (retorno imediato na tela). */
    const aplicarCanhoto = useCallback((canhoto) => {
        if (!canhoto?.chave) return;
        setDados(prev => {
            if (!prev) return prev;
            const itens = Array.isArray(prev.itens) ? prev.itens : [];
            const achou = itens.some(i => i.chave === canhoto.chave);
            // Só ATUALIZA o que já está na lista; nunca insere. Bipar uma folha de outro
            // mês inseria a linha e a recarga a tirava 1,2s depois — a nota piscava e
            // sumia, parecendo defeito. O registro da leitura fica em "Últimas leituras"
            // do campo de bipe de qualquer jeito, que é onde a pessoa confere.
            if (!achou) return prev;
            return {
                ...prev,
                itens: itens.map(i => (i.chave === canhoto.chave ? { ...i, ...canhoto } : i)),
                // some do alerta assim que o papel aparece
                alerta: (prev.alerta || []).filter(a => a.chave !== canhoto.chave),
            };
        });
    }, []);

    const aoBipar = useCallback((resposta) => {
        if (resposta?.ok && resposta.canhoto) aplicarCanhoto(resposta.canhoto);
        agendarRecarga();
    }, [agendarRecarga, aplicarCanhoto]);

    const colocarEmDia = async () => {
        if (!temPeriodo || backfilling) return;
        setBackfilling(true);
        try {
            const r = await canhotoService.backfill({ de: periodo.de, ate: periodo.ate });
            if (!montadoRef.current) return;
            const criados = Number(r?.criados || 0);
            toast.success(
                criados > 0
                    ? `${criados} nota(s) entraram no controle. Agora bipe o maço da pasta.`
                    : 'O mês já estava em dia — nenhuma nota nova para trazer.'
            );
            await carregar({ autocura: false });
        } catch (e) {
            console.error('[Canhoto] Falha no backfill:', e);
            if (montadoRef.current) toast.error(e?.response?.data?.error || 'Não consegui colocar o mês em dia.');
        } finally {
            if (montadoRef.current) setBackfilling(false);
        }
    };

    const marcarSemAssinatura = async (item) => {
        const rotulo = `NF ${fmtNum(item.numero)}${item.clienteNome ? ` · ${item.clienteNome}` : ''}`;
        // Este aviso só pode prometer o que a tela faz de verdade. A versão anterior dizia
        // que a nota "entra na lista de recolher assinatura na próxima visita" — lista que
        // NÃO existe (não há relatório nem tela com esse nome). A pessoa iria procurar, não
        // acharia, e concluiria que o sistema está incompleto ou que ela não sabe usar.
        // O que existe de verdade é o selo "Sem assinatura" e o chip com esse nome, que
        // filtra a lista. Ao mexer aqui, prometa só isso.
        if (!window.confirm(`Marcar ${rotulo} como "veio sem assinatura"?\n\nO papel conta como arquivado (ele está aqui), mas a nota NÃO serve de prova de entrega. Ela fica com o selo "Sem assinatura" — dá para ver todas clicando no chip com esse nome.`)) return;
        setAgindo(`${item.chave}:sem`);
        try {
            const r = await canhotoService.semAssinatura(item.chave);
            if (!montadoRef.current) return;
            if (r?.ok) {
                if (r.canhoto) aplicarCanhoto(r.canhoto);
                toast.success(r.jaEstava ? 'Esta nota já estava marcada como sem assinatura.' : 'Marcada como sem assinatura.');
                agendarRecarga();
            } else {
                toast.error(r?.mensagem || 'Não consegui marcar esta nota.');
            }
        } catch (e) {
            if (montadoRef.current) toast.error(e?.response?.data?.error || 'Falha ao marcar a nota.');
        } finally {
            if (montadoRef.current) setAgindo(null);
        }
    };

    /**
     * Reimprimir a DANFE da nota de DEVOLUÇÃO para guardar junto na pasta do mês.
     *
     * ⚠️ O `window.open` abaixo é CONSCIENTE, não descuido.
     * O `CLAUDE.md` proíbe `window.open` para IMPRESSÃO porque tira o usuário de dentro
     * do PWA no iPad — mas aquela regra trata de conteúdo que o app monta em HTML e
     * manda para a impressora. Aqui não é isso: a DANFE vem PRONTA do servidor como PDF
     * binário (`GET /notas-fiscais/:id/danfe`), e não há como injetar PDF no
     * `#area-impressao` do padrão de impressão da própria página.
     *
     * Este é o MESMO caminho já usado nos outros três pontos que abrem DANFE no app —
     * `Financeiro/NotasFiscais.jsx` (aba Emitidas), `Pedidos/ListaDevolucoes.jsx` e
     * `Caixa/CaixaDiarioPage.jsx`. Manter igual é o ponto: o mesmo botão tem que se
     * comportar do mesmo jeito nas quatro telas.
     *
     * A correção de verdade (endpoint devolvendo a DANFE em HTML, para cair no padrão
     * de impressão do projeto) está registrada como ITEM SEPARADO, para migrar os quatro
     * pontos de uma vez. NÃO troque só este aqui — isso criaria a divergência que a
     * decisão acima quis evitar.
     */
    const abrirDanfeDevolucao = async (item) => {
        setAgindo(`${item.chave}:danfe`);
        try {
            const resp = await api.get(`/notas-fiscais/${item.notaAppId}/danfe`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            let msg = 'Erro ao gerar a DANFE da devolução.';
            try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch (_) { /* mantém genérica */ }
            if (montadoRef.current) toast.error(msg);
        } finally {
            if (montadoRef.current) setAgindo(null);
        }
    };

    const arquivar = async (item) => {
        setAgindo(`${item.chave}:arquivar`);
        try {
            const r = await canhotoService.arquivar([item.chave]);
            if (!montadoRef.current) return;
            if (Number(r?.arquivadas || 0) > 0) {
                aplicarCanhoto({ ...item, status: 'ARQUIVADO', arquivadoEm: new Date().toISOString() });
                toast.success(`Guardada em ${item.pastaFisica || 'a pasta do mês'}.`);
            } else {
                toast('Esta nota não estava pronta para arquivar.', { icon: 'ℹ️' });
            }
            agendarRecarga();
        } catch (e) {
            if (montadoRef.current) toast.error(e?.response?.data?.error || 'Falha ao arquivar.');
        } finally {
            if (montadoRef.current) setAgindo(null);
        }
    };

    const c = dados?.contadores || {};
    const total = Number(c.total || 0);
    const noArquivo = Number(c.noArquivo || 0);
    const percentual = total > 0 ? Math.round((noArquivo / total) * 100) : 0;

    /** Chips que também são o filtro da lista (é o gesto natural: "quero ver essas"). */
    const chips = useMemo(() => ([
        { id: 'arquivo', rotulo: `🗄 No arquivo · ${noArquivo}`, ativo: 'bg-green-600 text-white', inativo: 'bg-green-100 text-green-800' },
        { id: 'AGUARDANDO', rotulo: `⏳ Na rua · ${c.aguardando || 0}`, ativo: 'bg-yellow-500 text-white', inativo: 'bg-yellow-100 text-yellow-800' },
        { id: 'DESCONHECIDO', rotulo: `? Desconhecido · ${c.desconhecido || 0}`, ativo: 'bg-gray-600 text-white', inativo: 'bg-gray-100 text-gray-700' },
        // `bg-blue-800`, não `bg-blue-600`: a camada de tema converte os azuis de AÇÃO
        // (600/700) para o verde primário, e o chip ativo ficava idêntico ao de
        // "Devolução a reimprimir". O 800 não é remapeado e combina com o `text-blue-800`
        // do badge de RECEBIDO, mantendo a família de cor da situação.
        { id: 'RECEBIDO', rotulo: `✓ Recebido · ${c.recebido || 0}`, ativo: 'bg-blue-800 text-white', inativo: 'bg-blue-100 text-blue-800' },
        { id: 'SEM_ASSINATURA', rotulo: `✎ Sem assinatura · ${c.semAssinatura || 0}`, ativo: 'bg-red-600 text-white', inativo: 'bg-red-100 text-red-700' },
        { id: 'DEVOLUCAO', rotulo: `🖨 Devolução a reimprimir · ${c.devolucaoAReimprimir || 0}`, ativo: 'bg-primary text-white', inativo: 'bg-mint text-primaryDark' },
    ]), [c.aguardando, c.desconhecido, c.recebido, c.semAssinatura, c.devolucaoAReimprimir, noArquivo]);

    const itensVisiveis = useMemo(() => {
        const itens = Array.isArray(dados?.itens) ? dados.itens : [];
        const termo = busca.trim().toLowerCase();
        const digitos = termo.replace(/\D/g, '');
        return itens.filter(i => {
            if (filtro === 'arquivo' && !['ARQUIVADO', 'SEM_ASSINATURA'].includes(i.status)) return false;
            if (filtro === 'DEVOLUCAO' && !(i.tipo === 'DEVOLUCAO' && ['AGUARDANDO', 'DESCONHECIDO', 'RECEBIDO'].includes(i.status))) return false;
            if (!['todos', 'arquivo', 'DEVOLUCAO'].includes(filtro) && i.status !== filtro) return false;
            if (!termo) return true;
            if ((i.clienteNome || '').toLowerCase().includes(termo)) return true;
            if (digitos && String(i.numero || '').includes(digitos)) return true;
            if (digitos.length === 44 && i.chave === digitos) return true;
            return false;
        });
    }, [busca, dados?.itens, filtro]);

    // ── Sem período utilizável: quem explica é o backend (campo `aviso`) ──
    // Na prática não acontece — a aba esconde o preset "Todo o período" —, mas a tela
    // nunca pode quebrar por um caminho não previsto.
    if (dados?.aviso) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
                <CalendarRange className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <div className="font-bold text-gray-900">{dados.aviso}</div>
                <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
                    O arquivo dos canhotos é organizado por mês, igual à pasta física.
                    Selecione, por exemplo, <b>Este mês</b> — ou um mês específico em <b>Período personalizado</b>.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Mutirão ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <Archive className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Modo mutirão — bipar o arquivo</span>
                    <span className="ml-auto text-xs font-semibold text-gray-600 tabular-nums">
                        {loading && !dados ? '…' : `${noArquivo} de ${total} no arquivo`}
                    </span>
                </div>

                <div className="p-4 md:p-5">
                    {/* O nome da pasta vem PRONTO do backend (ele o tira do AAMM da chave
                        da nota). Quando o período escolhido cruza meses não existe uma
                        pasta só — aí não se inventa rótulo: cada linha mostra a dela. */}
                    {dados?.periodoCruzaMeses ? (
                        <div className="flex items-start gap-2 mb-3 text-sm text-gray-700">
                            <FolderOpen className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                                Período com <b>mais de um mês</b> — são várias pastas.
                                A pasta de cada nota aparece na linha dela; para bipar um maço, escolha um mês só.
                            </span>
                        </div>
                    ) : dados?.pastaFisica ? (
                        <div className="flex items-center gap-2 mb-3 text-sm text-gray-700">
                            <FolderOpen className="h-4 w-4 text-amber-600 shrink-0" />
                            <span>Pasta do período: <b>{dados.pastaFisica}</b></span>
                        </div>
                    ) : null}

                    {/* Progresso — só transform/opacity animam (regra de CSS do projeto) */}
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
                        <div
                            className="h-full bg-primary rounded-full transition-[width] duration-300"
                            style={{ width: `${percentual}%` }}
                        />
                    </div>

                    <BipeCanhoto
                        contexto="MUTIRAO"
                        periodo={periodo}
                        onResultado={aoBipar}
                        placeholder="Pegue o maço da pasta e vá bipando…"
                    />

                    {/* Contadores = filtros da lista */}
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar mt-4 pb-1">
                        <button
                            type="button"
                            onClick={() => setFiltro('todos')}
                            className={`px-3 py-1.5 min-h-[44px] md:min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap ${filtro === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                            Todas · {total}
                        </button>
                        {chips.map(ch => (
                            <button
                                key={ch.id}
                                type="button"
                                onClick={() => setFiltro(filtro === ch.id ? 'todos' : ch.id)}
                                className={`px-3 py-1.5 min-h-[44px] md:min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap ${filtro === ch.id ? ch.ativo : ch.inativo}`}
                            >
                                {ch.rotulo}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <button
                            type="button"
                            onClick={colocarEmDia}
                            disabled={backfilling}
                            title="Traz para o controle todas as notas já emitidas neste período. Pode clicar mais de uma vez — não duplica nada."
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm disabled:opacity-50"
                        >
                            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Colocar o mês em dia
                        </button>
                        <button
                            type="button"
                            onClick={() => carregar()}
                            disabled={loading}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-semibold text-sm disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Atualizar
                        </button>
                    </div>
                </div>
            </div>

            {erro && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{erro}</span>
                </div>
            )}

            {/* ── Alerta: papel parado na rua ── */}
            {dados?.alerta?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <div className="font-bold text-red-800 text-sm">
                                {dados.alerta.length} nota(s) na rua há mais de {dados.diasAlerta || 3} dias
                            </div>
                            <div className="text-sm text-red-700 mt-1 space-y-0.5">
                                {dados.alerta.slice(0, 8).map(a => (
                                    <div key={a.chave} className="truncate">
                                        NF {fmtNum(a.numero)}
                                        {a.clienteNome ? ` · ${a.clienteNome}` : ''}
                                        {a.diasNaRua != null ? ` · ${a.diasNaRua} dias` : ''}
                                        {a.motoristaNome ? ` · com ${a.motoristaNome}` : ''}
                                    </div>
                                ))}
                                {dados.alerta.length > 8 && (
                                    <div className="text-xs font-semibold">e mais {dados.alerta.length - 8}…</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {dados?.truncado && (
                <div className="flex items-start gap-2 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-4 py-3 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>O período tem notas demais — mostrando só as mais recentes. Escolha um período menor (um mês) para ver tudo.</span>
                </div>
            )}

            {/* ── Lista ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <Archive className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Notas do período</span>
                    <span className="text-xs text-gray-500 tabular-nums">({itensVisiveis.length})</span>
                    <div className="relative w-full md:w-64 md:ml-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar cliente ou nº da nota"
                            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 min-h-[44px] md:min-h-[40px] text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                </div>

                {loading && !dados ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
                        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
                    </div>
                ) : itensVisiveis.length === 0 ? (
                    <div className="py-12 px-4 text-center text-sm text-gray-500">
                        {total === 0 ? (
                            <>
                                Nenhuma nota controlada neste período.
                                <div className="mt-1">Clique em <b>Colocar o mês em dia</b> para trazer as notas já emitidas.</div>
                            </>
                        ) : busca.trim() ? (
                            <>
                                Nenhuma nota deste período combina com <b>“{busca.trim()}”</b>.
                                <div className="mt-1">Confira o nome do cliente ou o número da nota — e lembre que a busca olha só o período escolhido acima.</div>
                            </>
                        ) : 'Nada neste filtro — toque em "Todas" acima para ver o restante.'}
                    </div>
                ) : (
                    <>
                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-3 p-3">
                            {itensVisiveis.map(i => {
                                const concluido = SITUACOES[i.status]?.concluido;
                                return (
                                    <div key={i.chave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        {/* No celular o selo da situação fica em LINHA PRÓPRIA. Lado a lado
                                            com o título, o card de devolução (que ainda carrega a pílula roxa)
                                            espremia "? Estado desconhecido" e jogava o chip de dias para fora
                                            da tela. Em linha inteira nenhum rótulo corta, por mais longo que seja. */}
                                        <div className="flex items-start justify-between gap-2">
                                            <span className={`font-semibold text-gray-900 ${concluido ? 'line-through text-gray-500' : ''}`}>
                                                NF {fmtNum(i.numero)}
                                                {i.tipo === 'DEVOLUCAO' && (
                                                    <span className="ml-1.5 px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">devolução</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 mb-2"><SituacaoBadge item={i} /></div>
                                        <div className="text-sm text-gray-900">{i.clienteNome || '—'}</div>
                                        <div className="flex items-center justify-between mt-1 text-sm">
                                            <span className="text-gray-500">{fmtData(i.emitidaEm)}</span>
                                            {i.valorTotal != null && <span className="font-semibold text-gray-900">R$ {fmtMoeda(i.valorTotal)}</span>}
                                        </div>
                                        {i.motoristaNome && !concluido && (
                                            <div className="text-xs text-gray-500 mt-1">com {i.motoristaNome}</div>
                                        )}
                                        {i.recebidoPorNome && (
                                            <div className="text-xs text-gray-500 mt-1">recebido por {i.recebidoPorNome}</div>
                                        )}
                                        <div className="text-xs text-gray-500 mt-1">{i.pastaFisica || '—'}</div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {podeReimprimirDanfe(i) && (
                                                <button
                                                    type="button"
                                                    onClick={() => abrirDanfeDevolucao(i)}
                                                    disabled={agindo === `${i.chave}:danfe`}
                                                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-semibold disabled:opacity-50"
                                                >
                                                    {agindo === `${i.chave}:danfe` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                                    Reimprimir DANFE
                                                </button>
                                            )}
                                            {i.status === 'RECEBIDO' && (
                                                <button
                                                    type="button"
                                                    onClick={() => arquivar(i)}
                                                    disabled={agindo === `${i.chave}:arquivar`}
                                                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold disabled:opacity-50"
                                                >
                                                    {agindo === `${i.chave}:arquivar` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                                                    Arquivar
                                                </button>
                                            )}
                                            {i.status !== 'SEM_ASSINATURA' && (
                                                <button
                                                    type="button"
                                                    onClick={() => marcarSemAssinatura(i)}
                                                    disabled={agindo === `${i.chave}:sem`}
                                                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-xs font-semibold disabled:opacity-50"
                                                >
                                                    {agindo === `${i.chave}:sem` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                                                    Veio sem assinatura
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop: tabela */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nota</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Emitida</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasta</th>
                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {itensVisiveis.map(i => {
                                        const concluido = SITUACOES[i.status]?.concluido;
                                        return (
                                            <tr key={i.chave} className="hover:bg-gray-50">
                                                <td className={`px-5 py-3 font-semibold ${concluido ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                                    {fmtNum(i.numero)}
                                                    {i.tipo === 'DEVOLUCAO' && (
                                                        <span className="ml-1.5 px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700 no-underline">dev.</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-gray-900">
                                                    <div className="max-w-[22ch] truncate" title={i.clienteNome || ''}>{i.clienteNome || '—'}</div>
                                                    {i.motoristaNome && !concluido && (
                                                        <div className="text-xs text-gray-500">com {i.motoristaNome}</div>
                                                    )}
                                                    {i.recebidoPorNome && (
                                                        <div className="text-xs text-gray-500">recebido por {i.recebidoPorNome}</div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtData(i.emitidaEm)}</td>
                                                <td className="px-5 py-3 text-right text-gray-900 tabular-nums whitespace-nowrap">
                                                    {i.valorTotal != null ? `R$ ${fmtMoeda(i.valorTotal)}` : '—'}
                                                </td>
                                                <td className="px-5 py-3"><SituacaoBadge item={i} /></td>
                                                <td className="px-5 py-3 text-gray-600">
                                                    <div className="max-w-[20ch] truncate" title={i.pastaFisica || ''}>{i.pastaFisica || '—'}</div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {podeReimprimirDanfe(i) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => abrirDanfeDevolucao(i)}
                                                                disabled={agindo === `${i.chave}:danfe`}
                                                                title="Reimprimir a DANFE desta devolução para guardar junto na pasta do mês"
                                                                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                {agindo === `${i.chave}:danfe` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                                                DANFE
                                                            </button>
                                                        )}
                                                        {i.status === 'RECEBIDO' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => arquivar(i)}
                                                                disabled={agindo === `${i.chave}:arquivar`}
                                                                title="Guardar na pasta do mês"
                                                                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                {agindo === `${i.chave}:arquivar` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                                                                Arquivar
                                                            </button>
                                                        )}
                                                        {i.status !== 'SEM_ASSINATURA' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => marcarSemAssinatura(i)}
                                                                disabled={agindo === `${i.chave}:sem`}
                                                                title="O papel voltou, mas o canhoto está em branco"
                                                                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                {agindo === `${i.chave}:sem` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                                                                Sem assinatura
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {Number(c.devolucaoAReimprimir || 0) > 0 && (
                <div className="flex items-start gap-2 bg-mint/40 border border-primary/20 rounded-lg px-4 py-3 text-sm text-gray-700">
                    <Printer className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <span>
                        <b>{c.devolucaoAReimprimir} nota(s) de devolução</b> ainda não estão no arquivo.
                        Use o botão <b>Reimprimir DANFE</b> na linha e guarde o papel junto na pasta do mês.
                        Nas notas antigas do Conta Azul o botão não aparece (a DANFE delas não é gerada pelo app) — baixe pela aba <b>Emitidas</b>.
                    </span>
                </div>
            )}

            <div className="flex items-start gap-2 text-xs text-gray-500 px-1">
                <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                    Bipe a mesma nota quantas vezes quiser — repetir não estraga nada, só avisa que ela já estava.
                    Se o código de barras estiver rasgado, digite só o número da nota.
                </span>
            </div>
        </div>
    );
};

export default CanhotosTab;
