import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Camera, Loader2, Check, AlertTriangle, Info, CornerDownLeft, Undo2 } from 'lucide-react';
import canhotoService from '../services/canhotoService';
import LeitorCodigoBarras from './LeitorCodigoBarras';
import { interpretarBipe, limpar } from '../utils/chaveNfe';
import { sinalizar, JANELA_REPETICAO_MS } from '../utils/feedbackBipe';

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

/**
 * ⚠️ O som/vibração do bipe mora em `utils/feedbackBipe.js` (junto da janela
 * anti-repetição do laser) — é a MESMA peça usada pela conferência de carga na doca.
 * Não recriar aqui: dois vocabulários de bip para o mesmo resultado confundem quem
 * trabalha sem olhar a tela.
 */

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
    onDesfeito,                     // (resposta do desfazer) → idem, depois de desfazer uma leitura
    placeholder = 'Pegue o maço da pasta e vá bipando…',
    autoFoco = true,
    className = '',
}) => {
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [ultimas, setUltimas] = useState([]);     // últimas leituras (mais nova primeiro)
    const [ambiguidade, setAmbiguidade] = useState(null); // { numero, opcoes[] }
    const [camera, setCamera] = useState(false);
    // Chave do desfazer em andamento — serve para DESENHAR (rodinha + botão apagado).
    // A guarda contra clique repetido é o `desfazendoRef` abaixo, nunca este estado.
    const [desfazendo, setDesfazendo] = useState(null);

    const inputRef = useRef(null);
    const recentesRef = useRef(new Map());          // chave/número → instante da última leitura
    const seqRef = useRef(0);
    /**
     * Chaves com um Desfazer em andamento. É `ref`, e não o estado `desfazendo`, **de
     * propósito**: dois cliques no mesmo tique de render passam por uma guarda de estado,
     * porque o React só re-renderiza (e só aplica o `disabled`) depois do tique. O
     * resultado eram dois envios da mesma leitura — o segundo voltava "já desfeito" e
     * pintava um aviso amarelo *"Não deu para desfazer"* logo abaixo do "Desfeito" verde,
     * para UM clique. O banco aguentava (o backend recusa o segundo), mas a pessoa lia
     * duas respostas contrárias sobre o próprio clique. Um `Set` num ref muda no mesmo
     * instante. Mesma trava da tabela da aba (`acaoDaLinha`, em `CanhotosTab`).
     */
    const desfazendoRef = useRef(new Set());
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

    /**
     * `extra` carrega a `chave` quando aquela leitura MUDOU alguma coisa — é ela que
     * libera o "Desfazer" na linha. Leitura que não mudou nada (repetida, de outro mês,
     * não encontrada) fica sem chave e sem botão: não há passo para voltar.
     */
    const registrar = useCallback((tom, rotulo, detalhe, extra = null) => {
        if (!montadoRef.current) return;
        seqRef.current += 1;
        const item = { id: seqRef.current, tom, rotulo, detalhe, quando: new Date(), ...(extra || {}) };
        setUltimas(prev => [item, ...prev].slice(0, 8));
        sinalizar(tom);
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
                    /**
                     * Bipe repetido. Quase sempre é o mutirão normal — a mesma folha
                     * passando duas vezes pelo leitor —, e aí a resposta é a de sempre,
                     * AZUL e tranquila: prometemos à equipe que repetir não estraga nada.
                     *
                     * Mas existe um caso em que o backend manda `desfazerGasto`: quem já
                     * gastou o Desfazer daquela nota e bipa a folha de novo está tentando
                     * TIRÁ-LA do arquivo — e a linha dela, nesse estado, já não mostra o
                     * botão Desfazer, então este bipe é o único lugar por onde a pessoa
                     * passa. Dizer "pode seguir para a próxima folha" ali a manda em
                     * frente justamente quando ela quer o contrário.
                     *
                     * Por isso o tom muda junto com o texto: AMARELO ("pare e leia"), não
                     * azul ("está tudo certo, siga") — o azul é parte do que induzia ao
                     * erro. A frase vem pronta do servidor (`aviso`), a mesma da recusa do
                     * Desfazer, para as duas portas contarem a mesma história.
                     */
                    registrar(r.desfazerGasto ? 'aviso' : 'repetido', `${nota} — já estava`,
                        r.aviso || (contexto === 'MUTIRAO'
                            ? 'Esta já constava no arquivo. Pode seguir para a próxima folha.'
                            : 'Esta já tinha sido recebida.'));
                } else {
                    // Só a leitura que MUDOU a nota ganha o "Desfazer" (ver `registrar`):
                    // é exatamente o caso do "bipei a folha errada", percebido na hora.
                    registrar('ok', nota, r.aviso
                        || (contexto === 'MUTIRAO'
                            ? `Arquivada${r.canhoto?.pastaFisica ? ` em ${r.canhoto.pastaFisica}` : ''}.`
                            : 'Canhoto recebido.'),
                    { chave: r.canhoto?.chave || null });
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
     * DESFAZER a leitura que acabou de sair — o lugar onde o erro é percebido.
     *
     * "Bipei a folha errada" e "esta folha veio sem assinatura, não era para arquivar"
     * se descobrem UM segundo depois do bip, olhando esta lista. Mandar a pessoa
     * procurar a linha lá embaixo, no meio de 600 notas, para consertar o que ela viu
     * aqui é fazê-la parar o mutirão.
     *
     * ⚠️ O FOCO VOLTA PARA O CAMPO ANTES DA REDE, não depois. O leitor USB termina cada
     * leitura com **Enter**: se o foco ficasse neste botão enquanto a requisição roda, o
     * Enter da próxima folha "clicaria" o Desfazer de novo em vez de bipar — e os
     * dígitos da leitura iriam para lugar nenhum. Devolvendo o cursor no clique, o
     * ritmo do maço não muda: quem só bipa nunca encosta neste botão.
     */
    const desfazerLeitura = useCallback(async (item) => {
        const chave = item?.chave;
        // Trava SÍNCRONA (ver `desfazendoRef`): o 2º clique do duplo clique para aqui,
        // antes de virar rede. O estado `desfazendo` continua existindo — mas só para
        // desenhar o rodinha no botão, nunca como guarda.
        if (!chave || desfazendoRef.current.has(chave)) return;
        desfazendoRef.current.add(chave);
        focar();                       // antes da rede — ver o aviso acima
        setDesfazendo(chave);
        try {
            const r = await canhotoService.desfazer(chave);
            if (!montadoRef.current) return;
            // Some com o botão de todas as leituras daquela nota: o Desfazer volta UM
            // passo e o backend recusa o segundo seguido. Deixar o botão ali seria
            // oferecer uma ação que já sabemos que vai ser negada.
            setUltimas(prev => prev.map(u => (u.chave === chave ? { ...u, chave: null } : u)));
            // A frase vem pronta do servidor (diz para onde a nota voltou). Recusa não é
            // erro vermelho: é 'aviso' (amarelo), a mesma escala do resto do módulo.
            if (r?.ok) registrar('repetido', 'Desfeito', r.mensagem || 'A nota voltou ao estado anterior.');
            else registrar('aviso', 'Não deu para desfazer', r?.mensagem || 'Confira a linha da nota na lista abaixo.');
            onDesfeito?.(r);
        } catch (e) {
            console.error('[Canhoto] Falha ao desfazer a leitura:', e);
            registrar('erro', 'Falha de conexão', e?.response?.data?.error
                || 'Não consegui desfazer. Confira a internet — a nota continua como está.');
        } finally {
            desfazendoRef.current.delete(chave);
            if (montadoRef.current) {
                setDesfazendo(null);
                focar();
            }
        }
    }, [focar, onDesfeito, registrar]);

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
                                    {/* Herda a cor do próprio aviso (verde do "arquivada") em vez de
                                        ganhar uma cor de ação: é conserto, não o caminho normal. */}
                                    {u.chave && (
                                        <button
                                            type="button"
                                            onClick={() => desfazerLeitura(u)}
                                            disabled={desfazendo === u.chave}
                                            title="Bipou a folha errada? Volta esta nota ao estado anterior."
                                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] rounded-full text-[11px] font-bold underline hover:bg-black/5 disabled:opacity-50"
                                        >
                                            {desfazendo === u.chave ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                                            Desfazer
                                        </button>
                                    )}
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
