import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Camera, Loader2, Check, AlertTriangle, Info, CornerDownLeft } from 'lucide-react';
import canhotoService from '../services/canhotoService';
import LeitorCodigoBarras from './LeitorCodigoBarras';
import { interpretarBipe, limpar } from '../utils/chaveNfe';

/**
 * CAMPO DE BIPE DO CANHOTO — peça reutilizável.
 *
 * Usada no mutirão do arquivo do mês (aba Canhotos) e, no Pedaço 2, no card do Caixa.
 * Quem está do outro lado é uma pessoa com um maço de papel na mão passando o leitor
 * folha por folha. Duas consequências que mandam no design daqui:
 *
 *  1. **Nada de erro vermelho no caminho normal.** Nota que já estava arquivada é o
 *     resultado ESPERADO do mutirão (o maço tem as que já foram bipadas). Isso volta
 *     como aviso calmo, não como falha.
 *  2. **A mão não sai do maço.** O campo se re-foca sozinho depois de cada leitura, o
 *     som e a vibração dizem o resultado sem precisar olhar a tela, e as últimas
 *     leituras ficam listadas para conferir depois.
 *
 * ⚠️ O LEITOR USB MANDA **ENTER** NO FIM DE CADA LEITURA.
 * Por isso o campo mora dentro de um `<form onSubmit>` com `preventDefault`: o Enter
 * vira o bipe e nada mais. Sem o form, o Enter procuraria o primeiro `<button>` da
 * página e um bipe rápido acionaria outro botão (arquivar, fechar caixa...). Pelo mesmo
 * motivo, **todo botão deste componente e das telas que o usam é `type="button"`
 * explícito** — o único `type="submit"` é o botão "Bipar" logo abaixo, que faz
 * exatamente o que o Enter faz.
 */

const JANELA_REPETICAO_MS = 800; // leitor a laser dispara 2x quando o gatilho fica preso

/** Bip curto pelo WebAudio — sem arquivo de som para baixar. */
function tocar(tipo) {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const agora = ctx.currentTime;
        const bipe = (freq, inicio, duracao, volume = 0.09) => {
            const osc = ctx.createOscillator();
            const gan = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gan.gain.setValueAtTime(volume, agora + inicio);
            gan.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + duracao);
            osc.connect(gan).connect(ctx.destination);
            osc.start(agora + inicio);
            osc.stop(agora + inicio + duracao);
        };
        if (tipo === 'ok') bipe(1040, 0, 0.11);
        else if (tipo === 'repetido' || tipo === 'aviso') { bipe(660, 0, 0.08); bipe(660, 0.12, 0.08); }
        else { bipe(200, 0, 0.22, 0.12); }
        setTimeout(() => { try { ctx.close(); } catch { /* já fechado */ } }, 700);
    } catch { /* som é conforto, nunca requisito */ }
}

function vibrar(tipo) {
    try {
        if (tipo === 'ok') navigator.vibrate?.(55);
        else if (tipo === 'repetido' || tipo === 'aviso') navigator.vibrate?.([30, 40, 30]);
        else navigator.vibrate?.([90, 60, 90]);
    } catch { /* desktop não vibra */ }
}

const TONS = {
    ok: { classe: 'bg-green-100 text-green-800 border-green-200', Icone: Check },
    repetido: { classe: 'bg-blue-100 text-blue-800 border-blue-200', Icone: Info },
    // AVISO ≠ ERRO. Amarelo é para quando a nota EXISTE e está tudo certo com ela —
    // só não é deste mês. Vermelho fica reservado ao que a pessoa precisa consertar.
    aviso: { classe: 'bg-yellow-100 text-yellow-800 border-yellow-300', Icone: Info },
    erro: { classe: 'bg-red-100 text-red-700 border-red-200', Icone: AlertTriangle },
};

const BipeCanhoto = ({
    contexto = 'MUTIRAO',           // 'MUTIRAO' arquiva · 'CAIXA' só marca recebido
    periodo,                        // { de, ate } — desempata o bipe por número
    caixaDiarioId,                  // Pedaço 2 (auditoria da leitura no caixa)
    onResultado,                    // (resposta, textoBipado) → a tela atualiza o que mostra
    placeholder = 'Pegue o maço da pasta e vá bipando…',
    autoFoco = true,
    className = '',
}) => {
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [ultimas, setUltimas] = useState([]);     // últimas leituras (mais nova primeiro)
    const [ambiguidade, setAmbiguidade] = useState(null); // { numero, opcoes[] }
    const [camera, setCamera] = useState(false);

    const inputRef = useRef(null);
    const recentesRef = useRef(new Map());          // chave/número → instante da última leitura
    const seqRef = useRef(0);
    // Mesma guarda de montagem usada na aba (padrão do módulo): o bipe é assíncrono e
    // a tela pode ser trocada no meio de uma leitura.
    const montadoRef = useRef(true);
    useEffect(() => {
        montadoRef.current = true;
        return () => { montadoRef.current = false; };
    }, []);

    const focar = useCallback(() => {
        if (!autoFoco) return;
        // rAF: espera o React terminar de renderizar antes de devolver o cursor
        requestAnimationFrame(() => { try { inputRef.current?.focus(); } catch { /* ignora */ } });
    }, [autoFoco]);

    useEffect(() => { focar(); }, [focar]);

    const registrar = useCallback((tom, rotulo, detalhe) => {
        if (!montadoRef.current) return;
        seqRef.current += 1;
        const item = { id: seqRef.current, tom, rotulo, detalhe, quando: new Date() };
        setUltimas(prev => [item, ...prev].slice(0, 8));
        tocar(tom);
        vibrar(tom);
    }, []);

    /** Descreve a nota em uma linha ("NF 85.109 · Mercado Bom Dia"). */
    const descrever = (c) => {
        if (!c) return '';
        const partes = [];
        if (c.numero != null) partes.push(`NF ${Number(c.numero).toLocaleString('pt-BR')}`);
        if (c.clienteNome) partes.push(c.clienteNome);
        return partes.join(' · ') || 'nota';
    };

    const bipar = useCallback(async (bruto, origem = 'LEITOR') => {
        const cru = String(bruto || '').trim();
        if (!cru) { focar(); return; }

        // 1) Retorno INSTANTÂNEO do que dá para julgar aqui (o backend continua sendo
        //    a autoridade — isto só evita ida à rede para leitura visivelmente torta).
        const lido = interpretarBipe(cru);
        if (lido.tipo === 'invalido') {
            registrar(
                'erro',
                lido.motivo === 'DV' ? 'Código inválido' : 'Não reconheci esse código',
                lido.motivo === 'DV'
                    ? 'O dígito verificador não confere — passe o leitor de novo, mais devagar.'
                    : 'Bipe o código de barras da DANFE ou digite só o número da nota.'
            );
            setTexto('');
            focar();
            return;
        }

        // 2) Anti-repetição: leitor a laser com o gatilho preso manda a mesma leitura
        //    duas ou três vezes seguidas. Dentro da janela, a segunda é ignorada em
        //    silêncio — sem gastar rede e sem poluir a lista de leituras.
        const identidade = lido.tipo === 'chave' ? lido.chave : `n:${lido.numero}`;
        const agora = Date.now();
        const visto = recentesRef.current.get(identidade);
        if (visto && agora - visto < JANELA_REPETICAO_MS) {
            setTexto('');
            focar();
            return;
        }
        recentesRef.current.set(identidade, agora);
        if (recentesRef.current.size > 200) recentesRef.current.clear(); // não cresce sem fim

        setEnviando(true);
        setAmbiguidade(null);
        try {
            const r = await canhotoService.bipar({
                texto: cru,
                contexto,
                origem: lido.tipo === 'numero' ? 'NUMERO' : origem,
                de: periodo?.de || undefined,
                ate: periodo?.ate || undefined,
                caixaDiarioId,
            });

            if (r?.ok) {
                const nota = descrever(r.canhoto);
                if (r.jaEstava) {
                    registrar('repetido', `${nota} — já estava`, contexto === 'MUTIRAO'
                        ? 'Esta já constava no arquivo. Pode seguir para a próxima folha.'
                        : 'Esta já tinha sido recebida.');
                } else {
                    registrar('ok', nota, r.aviso
                        || (contexto === 'MUTIRAO'
                            ? `Arquivada${r.canhoto?.pastaFisica ? ` em ${r.canhoto.pastaFisica}` : ''}.`
                            : 'Canhoto recebido.'));
                }
            } else if (r?.motivo === 'AMBIGUO') {
                if (montadoRef.current) setAmbiguidade({ numero: r.numero, opcoes: Array.isArray(r.opcoes) ? r.opcoes : [] });
                registrar('erro', `Número ${r.numero} está repetido`, r.mensagem || 'Escolha abaixo qual é a nota, ou bipe o código de barras.');
            } else if (r?.motivo === 'FORA_DO_PERIODO') {
                // O sistema ACHOU a nota — ela só não pertence ao período aberto. Dizer
                // "não encontrei" aqui seria mentira justamente onde a pessoa está com o
                // papel na mão, e a mandaria procurar um problema que não existe.
                // A frase explicativa (com o mês certo) vem pronta do backend.
                registrar('aviso', 'Essa nota é de outro mês', r?.mensagem
                    || 'Ela existe, mas não é do período aberto. Troque o período para bipá-la.');
            } else {
                registrar('erro', 'Não encontrei essa nota', r?.mensagem || 'Confira se a nota é deste período.');
            }
            onResultado?.(r, cru);
        } catch (e) {
            // Aqui sim é falha de verdade (rede/500): o backend nunca usa erro para
            // "não achei" — ele responde 200 com `ok:false`.
            console.error('[Canhoto] Falha ao bipar:', e);
            recentesRef.current.delete(identidade); // deixa tentar de novo na hora
            registrar('erro', 'Falha de conexão', e?.response?.data?.error || 'Não consegui falar com o servidor. Confira a internet e bipe de novo.');
        } finally {
            if (montadoRef.current) {
                setEnviando(false);
                setTexto('');
                focar();
            }
        }
    }, [caixaDiarioId, contexto, focar, onResultado, periodo?.ate, periodo?.de, registrar]);

    /**
     * O Enter do leitor USB cai aqui — e para aqui.
     * `preventDefault` impede o navegador de "enviar o formulário" acionando o
     * primeiro botão da página.
     */
    const aoEnviar = (e) => {
        e.preventDefault();
        if (enviando) return;
        bipar(texto, 'LEITOR');
    };

    /**
     * Mantém o campo pronto para o próximo bipe SEM brigar com a tela: só devolve o
     * foco quando ele foi para o nada (clique em área vazia). Se a pessoa clicou na
     * busca ou num filtro, o foco é dela — roubá-lo faria a chave ser digitada dentro
     * do campo errado.
     */
    const aoSairDoCampo = () => {
        if (!autoFoco) return;
        setTimeout(() => {
            const ativo = document.activeElement;
            if (!ativo || ativo === document.body) { try { inputRef.current?.focus(); } catch { /* ignora */ } }
        }, 0);
    };

    const dica = useMemo(() => {
        const c = limpar(texto);
        if (!c) return null;
        if (c.length === 44) return 'chave completa — solte o Enter ou toque em Bipar';
        if (c.length > 9 && c.length < 44) return `${c.length} de 44 dígitos…`;
        return `número da nota: ${Number(c).toLocaleString('pt-BR')}`;
    }, [texto]);

    return (
        <div className={className}>
            <form onSubmit={aoEnviar}>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                        <input
                            ref={inputRef}
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            onBlur={aoSairDoCampo}
                            placeholder={placeholder}
                            inputMode="numeric"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            aria-label="Código de barras ou número da nota"
                            className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-3 min-h-[48px] text-base sm:text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={enviando || !texto.trim()}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                        >
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
                            Bipar
                        </button>
                        <button
                            type="button"
                            onClick={() => setCamera(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                        >
                            <Camera className="h-4 w-4" />
                            Ler pelo celular
                        </button>
                    </div>
                </div>
                {dica && <div className="mt-1.5 text-xs text-gray-500">{dica}</div>}
            </form>

            {/* Número repetido: o backend não adivinha qual é — quem tem o papel escolhe */}
            {ambiguidade && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-2 text-sm text-amber-900 font-medium">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Existe mais de uma nota com o número {ambiguidade.numero}. Toque na que está na sua mão:</span>
                    </div>
                    <div className="mt-2 space-y-2">
                        {ambiguidade.opcoes.map(o => (
                            <button
                                key={o.chave}
                                type="button"
                                onClick={() => { setAmbiguidade(null); bipar(o.chave, 'LEITOR'); }}
                                className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px] hover:border-primary hover:bg-mint/20"
                            >
                                <div className="text-sm font-semibold text-gray-900">
                                    NF {o.numero != null ? Number(o.numero).toLocaleString('pt-BR') : '—'}
                                    {o.serie != null ? ` · série ${o.serie}` : ''}
                                </div>
                                <div className="text-xs text-gray-600">
                                    {o.clienteNome || 'sem cliente'}
                                    {o.emitidaEm ? ` · ${new Date(o.emitidaEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
                                </div>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => { setAmbiguidade(null); focar(); }}
                        className="mt-2 text-xs font-semibold text-gray-600 hover:text-gray-800 underline"
                    >
                        deixar para depois
                    </button>
                </div>
            )}

            {/* Últimas leituras — confere o que passou sem precisar olhar a cada folha */}
            {ultimas.length > 0 && (
                <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1.5">Últimas leituras</div>
                    <div className="space-y-1.5">
                        {ultimas.map(u => {
                            const { classe, Icone } = TONS[u.tom] || TONS.repetido;
                            return (
                                <div key={u.id} className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm ${classe}`}>
                                    <Icone className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold truncate">{u.rotulo}</div>
                                        {u.detalhe && <div className="text-xs opacity-90">{u.detalhe}</div>}
                                    </div>
                                    <span className="text-[11px] opacity-70 shrink-0 tabular-nums">
                                        {u.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {camera && (
                <LeitorCodigoBarras
                    titulo="Bipar a nota pela câmera"
                    onClose={() => { setCamera(false); focar(); }}
                    onLeitura={(chave) => { setCamera(false); bipar(chave, 'CAMERA'); }}
                />
            )}
        </div>
    );
};

export default BipeCanhoto;
