import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Barcode, Loader2, CornerDownLeft, Check, AlertTriangle, Ban, HelpCircle,
    RefreshCw, Undo2, X, ClipboardCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import { interpretarCodigoCarga, identidadeDoCodigo } from '../../../utils/codigoCarga';
import { sinalizar, JANELA_REPETICAO_MS } from '../../../utils/feedbackBipe';

/**
 * CONFERÊNCIA DE CARGA POR BIPAGEM — painel da doca.
 *
 * Abre DENTRO do modal "Gerenciamento da Carga" (inline, nunca como modal empilhado:
 * no iPad um segundo modal rouba o foco do campo e a pessoa perde o ritmo do bipe).
 * A pessoa bipa a DANFE (chave de 44 dígitos) ou o recibo do especial/bonificação/
 * amostra (ZZ/BN/AM) a cada volume que entra no caminhão.
 *
 * ⚠️ TRÊS CUIDADOS QUE MANDAM NO CÓDIGO DAQUI:
 *
 * 1. **O LEITOR USB MANDA ENTER NO FIM DE CADA LEITURA.** O campo mora dentro de um
 *    `<form onSubmit>` com `preventDefault`, e **todo botão deste arquivo é
 *    `type="button"` explícito** (o único `submit` é o "Bipar", que faz o mesmo que o
 *    Enter). Sem isso, um Enter perdido procura o primeiro `<button>` da página — e
 *    nesta tela existe um "Retirar do embarque" por linha. Um bipe rápido poderia
 *    TIRAR UM PEDIDO DO CAMINHÃO. Mesmo motivo documentado em `BipeCanhoto.jsx`.
 *
 * 2. **Rajada.** Trinta bipes em vinte segundos são normais. Os POSTs vão numa CADEIA
 *    SERIAL (um por vez, na ordem em que foram bipados) porque o contador vem recontado
 *    do servidor a cada resposta — em paralelo, a resposta mais lenta chegaria por
 *    último e pintaria um contador velho. A trava de "já tem este código em voo" é um
 *    `useRef` (SÍNCRONO): estado só vale no próximo render, e a rajada acontece toda
 *    dentro do mesmo tique (mesma razão de `emVooRef` em `CanhotosTab.jsx`).
 *
 * 3. **Não recarregar a carga a cada bipe.** A resposta já traz o `item` atualizado e a
 *    contagem; aplicamos no estado local. Recarregar de verdade só depois de
 *    "Adicionar a esta carga" e de "Concluir" — que são as ações que mudam a carga.
 */

const TONS = {
    ok: { caixa: 'bg-green-100 text-green-800 border-green-200', Icone: Check, som: 'ok' },
    aviso: { caixa: 'bg-yellow-100 text-yellow-800 border-yellow-300', Icone: AlertTriangle, som: 'aviso' },
    erro: { caixa: 'bg-red-100 text-red-700 border-red-200', Icone: Ban, som: 'erro' },
    duvida: { caixa: 'bg-red-100 text-red-700 border-red-200', Icone: HelpCircle, som: 'erro' },
    neutro: { caixa: 'bg-white text-gray-500 border-gray-200', Icone: Barcode, som: null },
};

/** Cor da barra de progresso — escala por % do design system. */
const corDaBarra = (pct) => {
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 80) return 'bg-yellow-400';
    if (pct >= 50) return 'bg-blue-500';
    return 'bg-red-500';
};

/** Cor da etiqueta (mesma semântica da tabela da carga). */
const corEtiqueta = (item) => {
    if (item?.tipo === 'amostra') return 'text-orange-700 bg-orange-50';
    if (item?.bonificacao) return 'text-green-700 bg-green-50';
    if (item?.especial) return 'text-purple-700 bg-purple-50';
    return 'text-gray-700 bg-gray-100';
};

const chaveItem = (tipo, id) => `${tipo}:${id}`;

/**
 * Quem é o item, em uma linha: "Cliente · Cidade".
 * Vale para TODOS os desfechos do bipe, não só o verde: quem está na doca com o volume
 * na mão precisa do nome e da cidade para decidir se aquele volume sobe no caminhão —
 * "#904293 não está nesta carga" sozinho não ajuda ninguém. Campos podem vir nulos
 * (o `filter(Boolean)` é o que impede um "undefined" na tela).
 */
const quemEh = (item) => [item?.cliente, item?.cidade].filter(Boolean).join(' · ');

/** Junta a explicação do servidor com o "de quem é", sem inventar travessão sobrando. */
const comQuem = (mensagem, item) => [mensagem, quemEh(item)].filter(Boolean).join(' — ');

/**
 * A etiqueta já está no TÍTULO da faixa — repetir no detalhe ("ZZ#4821 já tinha sido
 * conferido" em cima de "ZZ#4821 já tinha sido conferido por Fulano") só rouba espaço
 * da informação que interessa. Corta o prefixo repetido sem reescrever a frase do servidor.
 */
const semEtiqueta = (mensagem, etiqueta) => {
    const m = String(mensagem || '').trim();
    if (!etiqueta || !m.startsWith(etiqueta)) return m;
    return m.slice(etiqueta.length).replace(/^[\s—:-]+/, '');
};

/**
 * LEITOR × DIGITADO — como a tela decide o que carimbar na auditoria.
 *
 * O backend só entende `LEITOR` ou `DIGITADO` (`conferenciaCargaService.biparNaCarga`),
 * e é esse carimbo que vai para `cargaConferidaOrigem` — ele existe justamente para
 * mostrar depois quem bipou de verdade e quem digitou o número na mão.
 *
 * O leitor USB é um teclado: ele "digita" o código inteiro numa rajada (poucos ms entre
 * as teclas) e manda Enter. Pessoa nenhuma digita nesse ritmo. Então medimos a cadência
 * das teclas no campo: rajada = LEITOR; qualquer outra coisa = DIGITADO.
 *
 * Na dúvida (poucas teclas, colagem, código vindo de botão da tela) o carimbo é
 * DIGITADO — é o que se pode PROVAR; afirmar "LEITOR" sem a rajada seria inventar
 * auditoria, que foi exatamente o defeito antigo (mandava um valor inexistente,
 * 'NUMERO', e o backend caía no `LEITOR` de fallback).
 */
const RITMO_LEITOR_MS = 35;      // média máxima entre teclas para valer como rajada de leitor
const MIN_TECLAS_LEITOR = 4;     // menos que isso não dá para afirmar rajada
const PAUSA_RECOMECO_MS = 1200;  // silêncio maior que isso = leitura nova

/**
 * Código que resolve a opção SEM ambiguidade quando o backend pede o prefixo.
 * O pedido faturado comum não tem prefixo (a etiqueta dele é só `#777777`), então
 * re-mandar o número cairia no mesmo PEDE_PREFIXO — para ele a saída é bipar a DANFE.
 */
const codigoDaOpcao = (o) => {
    if (!o || o.numero == null) return null;
    if (o.tipo === 'amostra') return `AM${o.numero}`;
    if (o.bonificacao) return `BN${o.numero}`;
    if (o.especial) return `ZZ${o.numero}`;
    return null;
};

const horaCurta = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
};

const dataHora = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
};

const ConferenciaCargaPanel = ({ embarqueId, onFechar, onSituacao, onCargaAlterada }) => {
    const [dados, setDados] = useState(null);       // { embarque, itens, conferidas, total, faltam }
    const [carregando, setCarregando] = useState(true);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [concluindo, setConcluindo] = useState(false);
    const [adicionando, setAdicionando] = useState(false);
    const [desmarcando, setDesmarcando] = useState(null);
    const [feedback, setFeedback] = useState({ tom: 'neutro', titulo: 'Aguardando o primeiro bipe…', detalhe: '' });

    const inputRef = useRef(null);
    const montadoRef = useRef(true);
    const filaRef = useRef(Promise.resolve());      // cadeia serial dos POSTs (ver cabeçalho, item 2)
    const emVooRef = useRef(new Set());             // trava SÍNCRONA por código
    const recentesRef = useRef(new Map());          // identidade → instante da última leitura
    const desmarcandoRef = useRef(new Set());       // trava SÍNCRONA do desmarcar
    const digitacaoRef = useRef({ inicio: 0, ultimo: 0, teclas: 0 });  // cadência do campo (LEITOR × DIGITADO)

    useEffect(() => {
        montadoRef.current = true;
        return () => { montadoRef.current = false; };
    }, []);

    /** Devolve o cursor ao campo depois que o React terminou de desenhar. */
    const focar = useCallback(() => {
        requestAnimationFrame(() => { try { inputRef.current?.focus(); } catch { /* ignora */ } });
    }, []);

    const avisar = useCallback((tom, titulo, detalhe = '', extra = null) => {
        if (!montadoRef.current) return;
        setFeedback({ tom, titulo, detalhe, ...(extra || {}) });
        const som = TONS[tom]?.som;
        if (som) sinalizar(som);
    }, []);

    const publicar = useCallback((d) => {
        onSituacao?.(d);
    }, [onSituacao]);

    const carregar = useCallback(async (silencioso = false) => {
        if (!silencioso) setCarregando(true);
        try {
            const d = await embarqueService.conferenciaCarga(embarqueId);
            if (!montadoRef.current) return;
            setDados(d);   // o aviso ao modal-pai sai no efeito abaixo (updater de estado é puro)
        } catch (e) {
            console.error('[Conferência] Falha ao carregar:', e);
            if (montadoRef.current) toast.error('Não consegui carregar a conferência desta carga.');
        } finally {
            if (montadoRef.current) setCarregando(false);
            focar();
        }
    }, [embarqueId, focar]);

    useEffect(() => { carregar(); }, [carregar]);

    /**
     * Avisa o modal-pai (linhas da tabela da carga) sempre que a situação muda.
     * Fica FORA dos updaters de `setDados`: updater de estado tem que ser puro — em
     * StrictMode de desenvolvimento o React roda o updater duas vezes, e o setState do
     * pai era disparado em dobro.
     */
    useEffect(() => { if (dados) publicar(dados); }, [dados, publicar]);

    /** Aplica no estado local o que a resposta trouxe (sem ir de novo à rede). */
    const aplicarResposta = useCallback((r) => {
        if (!montadoRef.current) return;
        setDados(prev => {
            if (!prev) return prev;
            let itens = prev.itens;
            if (r?.item?.id && r?.item?.tipo) {
                const alvo = chaveItem(r.item.tipo, r.item.id);
                if (itens.some(i => chaveItem(i.tipo, i.id) === alvo)) {
                    itens = itens.map(i => (chaveItem(i.tipo, i.id) === alvo ? { ...i, ...r.item } : i));
                }
            }
            return {
                ...prev,
                itens,
                conferidas: r?.conferidas ?? prev.conferidas,
                total: r?.total ?? prev.total,
                faltam: r?.faltam ?? prev.faltam,
            };
        });
    }, []);

    /** Enfileira uma tarefa na cadeia serial — um POST por vez, na ordem do bipe. */
    const enfileirar = useCallback((tarefa) => {
        const proxima = filaRef.current.then(tarefa, tarefa);
        filaRef.current = proxima.catch(() => { /* uma falha não trava a fila */ });
        return proxima;
    }, []);

    const bipar = useCallback((bruto, origemBruta) => {
        const cru = String(bruto || '').trim();
        const origem = origemBruta === 'LEITOR' ? 'LEITOR' : 'DIGITADO';
        setTexto('');
        digitacaoRef.current = { inicio: 0, ultimo: 0, teclas: 0 };   // próxima leitura começa do zero
        if (!cru) { focar(); return; }

        // 1) Retorno instantâneo do que dá para julgar aqui. A autoridade continua
        //    sendo o backend — isto só evita ida à rede para leitura visivelmente torta.
        const lido = interpretarCodigoCarga(cru);
        if (lido.tipo === 'INVALIDO') {
            avisar('duvida',
                lido.motivo === 'DV' ? 'Leitura torta' : 'Não reconheci esse código',
                lido.motivo === 'DV'
                    ? 'O dígito verificador da chave não confere — passe o leitor de novo, mais devagar.'
                    : 'Bipe o código de barras da DANFE ou o do recibo (ZZ / BN / AM).');
            focar();
            return;
        }

        // 2) Janela anti-repetição do laser (gatilho preso dispara a mesma leitura 2–3x).
        const identidade = identidadeDoCodigo(lido);
        const agora = Date.now();
        const visto = recentesRef.current.get(identidade);
        if (visto && agora - visto < JANELA_REPETICAO_MS) { focar(); return; }
        recentesRef.current.set(identidade, agora);
        if (recentesRef.current.size > 300) recentesRef.current.clear();

        // 3) Trava SÍNCRONA: o mesmo código já tem um POST em voo.
        if (emVooRef.current.has(identidade)) { focar(); return; }
        emVooRef.current.add(identidade);

        setEnviando(true);
        enfileirar(async () => {
            try {
                // `origem` já vem resolvida como LEITOR ou DIGITADO — os únicos valores que o
                // backend conhece. (Antes ia 'NUMERO' aqui, que o backend não previa: o número
                // digitado à mão era gravado como LEITOR, apagando a distinção que o campo
                // `cargaConferidaOrigem` existe para guardar.)
                const r = await embarqueService.conferirBipe(embarqueId, cru, origem);
                aplicarResposta(r);

                switch (r?.resultado) {
                    case 'CONFERIDA':
                        avisar('ok', `${r.item?.etiqueta || 'Item'} no caminhão`, quemEh(r.item));
                        break;
                    case 'JA_CONFERIDA': {
                        const por = r.item?.conferidaPorNome ? `por ${r.item.conferidaPorNome}` : '';
                        const hora = r.item?.conferidaEm ? `às ${horaCurta(r.item.conferidaEm)}` : '';
                        const quando = [por, hora].filter(Boolean).join(' ');
                        avisar('aviso', `${r.item?.etiqueta || 'Item'} já tinha sido conferido`,
                            comQuem(quando || semEtiqueta(r.mensagem, r.item?.etiqueta), r.item));
                        break;
                    }
                    case 'FORA_DA_CARGA':
                        avisar('erro', `${r.item?.etiqueta || 'Item'} não é desta carga`,
                            quemEh(r.item) || semEtiqueta(r.mensagem, r.item?.etiqueta), {
                                acao: r.podeAdicionar ? { tipo: r.item?.tipo, id: r.item?.id, etiqueta: r.item?.etiqueta } : null,
                            });
                        break;
                    case 'EM_OUTRA_CARGA': {
                        const onde = r.outraCarga?.numero != null
                            ? `Carga #${r.outraCarga.numero}${r.outraCarga.motorista ? ` · ${r.outraCarga.motorista}` : ''}`
                            : semEtiqueta(r.mensagem, r.item?.etiqueta);
                        avisar('erro', `${r.item?.etiqueta || 'Item'} está em outra carga`, comQuem(onde, r.item));
                        break;
                    }
                    case 'PEDE_PREFIXO':
                        avisar('duvida', 'Preciso do prefixo', r.mensagem || '', {
                            opcoes: Array.isArray(r.opcoes) ? r.opcoes : [],
                        });
                        break;
                    case 'INVALIDO':
                        avisar('duvida', 'Código inválido', r.mensagem || '');
                        break;
                    case 'DESCONHECIDO':
                    default:
                        avisar('duvida', 'Não encontrei esse código', r?.mensagem || 'Confira se o volume é desta carga.');
                        break;
                }
            } catch (e) {
                // Falha de verdade (rede/500). O backend nunca usa erro para "não achei":
                // recusa vem como 200 com ok:false.
                console.error('[Conferência] Falha ao bipar:', e);
                recentesRef.current.delete(identidade); // deixa tentar de novo na hora
                avisar('erro', 'Falha de conexão',
                    e?.response?.data?.error || 'Não consegui falar com o servidor. Bipe de novo.');
            } finally {
                emVooRef.current.delete(identidade);
                if (montadoRef.current) {
                    setEnviando(emVooRef.current.size > 0);
                    focar();  // rAF — o campo fica pronto para o próximo volume
                }
            }
        });
    }, [aplicarResposta, avisar, embarqueId, enfileirar, focar]);

    /** Mede a cadência das teclas no campo (é o que separa o leitor da mão humana). */
    const aoDigitar = (e) => {
        const agora = Date.now();
        const d = digitacaoRef.current;
        if (!d.teclas || agora - d.ultimo > PAUSA_RECOMECO_MS) digitacaoRef.current = { inicio: agora, ultimo: agora, teclas: 1 };
        else { d.ultimo = agora; d.teclas += 1; }
        setTexto(e.target.value);
    };

    /** Rajada de leitor ou digitação humana? Na dúvida, DIGITADO (ver bloco no topo). */
    const origemDoCampo = () => {
        const { inicio, ultimo, teclas } = digitacaoRef.current;
        if (teclas < MIN_TECLAS_LEITOR) return 'DIGITADO';
        return (ultimo - inicio) / (teclas - 1) <= RITMO_LEITOR_MS ? 'LEITOR' : 'DIGITADO';
    };

    /** O Enter do leitor cai aqui — e PARA aqui (ver cabeçalho, item 1). */
    const aoEnviar = (e) => {
        e.preventDefault();
        bipar(texto, origemDoCampo());
    };

    /** Só recupera o foco quando ele foi para o nada; se a pessoa clicou em outro campo, o foco é dela. */
    const aoSairDoCampo = () => {
        setTimeout(() => {
            const ativo = document.activeElement;
            if (!ativo || ativo === document.body) { try { inputRef.current?.focus(); } catch { /* ignora */ } }
        }, 0);
    };

    const desmarcar = useCallback(async (item) => {
        const k = chaveItem(item.tipo, item.id);
        if (desmarcandoRef.current.has(k)) return;   // trava SÍNCRONA (2º clique do mesmo tique)
        desmarcandoRef.current.add(k);
        focar();                                     // antes da rede: o Enter do próximo bipe não pode "clicar" este botão
        setDesmarcando(k);
        try {
            const r = await embarqueService.desconferir(embarqueId, item.tipo, item.id);
            if (!montadoRef.current) return;
            if (r?.ok) {
                setDados(prev => (prev ? {
                    ...prev,
                    itens: prev.itens.map(i => (chaveItem(i.tipo, i.id) === k
                        ? { ...i, conferidaEm: null, conferidaPorNome: null, conferidaOrigem: null }
                        : i)),
                    conferidas: r.conferidas ?? prev.conferidas,
                    total: r.total ?? prev.total,
                    faltam: r.faltam ?? prev.faltam,
                } : prev));
                avisar('aviso', `${item.etiqueta} voltou para "falta bipar"`, 'Bipe de novo quando o volume entrar no caminhão.');
            } else {
                avisar('aviso', 'Não deu para desfazer', r?.mensagem || 'Recarregue a conferência.');
            }
        } catch (e) {
            console.error('[Conferência] Falha ao desmarcar:', e);
            avisar('erro', 'Falha de conexão', 'Não consegui desfazer — o item continua como está.');
        } finally {
            desmarcandoRef.current.delete(k);
            if (montadoRef.current) { setDesmarcando(null); focar(); }
        }
    }, [avisar, embarqueId, focar]);

    /**
     * "Adicionar a esta carga" reusa a rota de sempre (POST /:id/pedidos ou /:id/amostras),
     * que SOBE A VERSÃO da carga — a folha impressa fica para trás de propósito.
     * O item entra NÃO CONFERIDO: o backend zera a conferência de quem troca de carga.
     * Por isso a mensagem manda bipar de novo.
     */
    const adicionarACarga = useCallback(async (acao) => {
        if (!acao?.id || adicionando) return;
        setAdicionando(true);
        focar();
        try {
            if (acao.tipo === 'amostra') await embarqueService.inserirAmostras(embarqueId, [acao.id]);
            else await embarqueService.inserirPedidos(embarqueId, [acao.id]);
            await carregar(true);
            onCargaAlterada?.();
            avisar('aviso', `${acao.etiqueta || 'Item'} entrou na carga — agora bipe de novo`,
                'Ele entra como "falta bipar": o bipe é o que marca que o volume subiu no caminhão. A folha impressa ficou para trás (a versão da carga mudou).');
        } catch (e) {
            console.error('[Conferência] Falha ao adicionar à carga:', e);
            avisar('erro', 'Não consegui adicionar',
                e?.response?.data?.error || 'Tente pelo botão "Atrelar Notas FATURADAS".');
        } finally {
            if (montadoRef.current) { setAdicionando(false); focar(); }
        }
    }, [adicionando, carregar, avisar, embarqueId, focar, onCargaAlterada]);

    const concluir = useCallback(async (confirmarFaltantes = false) => {
        if (concluindo) return;
        setConcluindo(true);
        try {
            const r = await embarqueService.concluirConferencia(embarqueId, confirmarFaltantes);
            if (!montadoRef.current) return;
            if (!r?.ok && r?.resultado === 'FALTAM') {
                const lista = (r.faltantes || []).map(f => `• ${f.etiqueta}${f.cliente ? ` — ${f.cliente}` : ''}`).join('\n');
                const segue = window.confirm(
                    `${r.mensagem}\n\nAinda não entraram no caminhão:\n${lista}\n\nConcluir mesmo assim? Fica registrado que a carga saiu incompleta.`
                );
                setConcluindo(false);
                if (segue) concluir(true);
                else focar();
                return;
            }
            if (r?.ok) {
                await carregar(true);
                onCargaAlterada?.();
                avisar(r.faltam > 0 ? 'aviso' : 'ok', 'Conferência concluída', r.mensagem || '');
                toast.success(r.mensagem || 'Conferência concluída.');
            } else {
                avisar('erro', 'Não deu para concluir', r?.mensagem || '');
            }
        } catch (e) {
            console.error('[Conferência] Falha ao concluir:', e);
            avisar('erro', 'Falha de conexão', 'Não consegui concluir a conferência.');
        } finally {
            if (montadoRef.current) { setConcluindo(false); focar(); }
        }
    }, [avisar, carregar, concluindo, embarqueId, focar, onCargaAlterada]);

    const total = dados?.total || 0;
    const conferidas = dados?.conferidas || 0;
    const faltam = dados?.faltam || 0;
    const pct = total > 0 ? Math.round((conferidas / total) * 100) : 0;
    const faltantes = useMemo(() => (dados?.itens || []).filter(i => !i.conferidaEm), [dados]);
    const concluidaEm = dados?.embarque?.concluidaEm;
    const { caixa: caixaFb, Icone: IconeFb } = TONS[feedback.tom] || TONS.neutro;

    return (
        <div className="mb-5 border-2 border-primary rounded-xl overflow-hidden">
            {/* Cabeçalho: quem/quando + contador + progresso */}
            <div className="bg-house px-3 py-3 md:px-5 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-mint shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest text-white">Conferência de carregamento</span>
                    </div>
                    <div className="text-[11px] md:text-xs text-mint mt-1 leading-snug">
                        {dados?.embarque?.motorista ? `Motorista: ${dados.embarque.motorista} · ` : ''}
                        Bipe cada volume ao colocar no caminhão.
                    </div>
                </div>
                <div className="md:text-right shrink-0">
                    <div className="text-white text-sm font-bold">
                        <span className="text-2xl">{conferidas}</span> de {total} conferidos
                    </div>
                    <div className="h-2 w-full md:w-52 bg-white/20 rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full ${corDaBarra(pct)} transition-all duration-200`} style={{ width: `${pct}%` }} />
                    </div>
                </div>
            </div>

            {/* Campo de bipe — o Enter do leitor morre no onSubmit */}
            <div className="bg-secondary px-3 py-3 md:px-5 md:py-4">
                <form onSubmit={aoEnviar}>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1 min-w-0">
                            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                            <input
                                ref={inputRef}
                                value={texto}
                                onChange={aoDigitar}
                                onBlur={aoSairDoCampo}
                                placeholder="Bipe a DANFE ou o recibo (ZZ / BN / AM)…"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                aria-label="Código de barras da nota ou do recibo"
                                className="w-full border-2 border-primary rounded-xl bg-white pl-10 pr-3 py-3 min-h-[48px] text-base font-mono font-bold tracking-wider text-gray-900 focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={!texto.trim()}
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                            >
                                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
                                Bipar
                            </button>
                            <button
                                type="button"
                                onClick={() => carregar(true)}
                                title="Recarregar a conferência (duas pessoas bipando a mesma carga)"
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                            >
                                <RefreshCw className="h-4 w-4" />
                                <span className="hidden sm:inline">Atualizar</span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-gray-600 leading-snug">
                        O campo volta a ficar pronto sozinho depois de cada bipe — dá para bipar em sequência sem clicar em nada.
                        Também aceita o número digitado à mão (com o prefixo: <b>ZZ4821</b>, <b>BN233</b>, <b>AM17</b>).
                    </div>
                </form>
            </div>

            {/* Faixa de retorno do último bipe */}
            <div className={`px-3 py-3 md:px-5 border-y ${caixaFb}`}>
                <div className="flex items-start gap-2.5">
                    <IconeFb className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold break-words">{feedback.titulo}</div>
                        {feedback.detalhe && <div className="text-xs mt-0.5 break-words opacity-90">{feedback.detalhe}</div>}
                        {Array.isArray(feedback.opcoes) && feedback.opcoes.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {feedback.opcoes.map(o => {
                                    const codigo = codigoDaOpcao(o);
                                    const rotulo = `${o.etiqueta}${o.cliente ? ` — ${o.cliente}` : ''}`;
                                    return codigo ? (
                                        <button
                                            key={chaveItem(o.tipo, o.id)}
                                            type="button"
                                            onClick={() => bipar(codigo, 'DIGITADO')}
                                            className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 rounded-full text-xs font-bold text-gray-800 hover:border-primary hover:bg-mint/30"
                                        >
                                            {rotulo}
                                        </button>
                                    ) : (
                                        <span
                                            key={chaveItem(o.tipo, o.id)}
                                            className="px-3 py-2 min-h-[44px] inline-flex items-center bg-white border border-dashed border-gray-300 rounded-full text-xs font-semibold text-gray-600"
                                        >
                                            {rotulo} · bipe a DANFE
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {feedback.acao && (
                        <button
                            type="button"
                            onClick={() => adicionarACarga(feedback.acao)}
                            disabled={adicionando}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-bold disabled:opacity-50"
                        >
                            {adicionando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Adicionar a esta carga
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white p-3 md:p-5">
                {concluidaEm && (
                    <div className="mb-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-800">
                        <b>Conferência concluída</b>
                        {dados?.embarque?.concluidaPorNome ? ` por ${dados.embarque.concluidaPorNome}` : ''}
                        {` em ${dataHora(concluidaEm)}`}
                        {dados?.embarque?.faltantesNoFecho > 0
                            ? ` — saiu com ${dados.embarque.faltantesNoFecho} item(ns) faltando.`
                            : ' — carga completa.'}
                    </div>
                )}

                {carregando ? (
                    <div className="py-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a conferência…
                    </div>
                ) : total === 0 ? (
                    <div className="py-8 text-center text-gray-500 text-sm">Caminhão vazio — nada para conferir.</div>
                ) : (
                    <>
                        {/* Mobile: cards (é tablet/celular na doca) */}
                        <div className="md:hidden space-y-2">
                            {dados.itens.map(item => (
                                <div
                                    key={chaveItem(item.tipo, item.id)}
                                    className={`rounded-xl border p-3 ${item.conferidaEm ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`text-sm font-mono font-bold px-1.5 py-0.5 rounded ${corEtiqueta(item)}`}>{item.etiqueta}</span>
                                        {item.conferidaEm ? (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ No caminhão</span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">falta bipar</span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 text-sm font-semibold text-gray-900 break-words">{item.cliente || '—'}</div>
                                    <div className="text-xs text-gray-600">{item.cidade || '—'}</div>
                                    {item.conferidaEm && (
                                        <div className="mt-1.5 flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-green-700 font-semibold">
                                                bipado {horaCurta(item.conferidaEm)}{item.conferidaPorNome ? ` · ${item.conferidaPorNome}` : ''}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => desmarcar(item)}
                                                disabled={desmarcando === chaveItem(item.tipo, item.id)}
                                                className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-full text-[11px] font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                            >
                                                {desmarcando === chaveItem(item.tipo, item.id)
                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                    : <Undo2 className="h-3 w-3" />}
                                                Desfazer
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop: tabela */}
                        <div className="hidden md:block border border-gray-200 rounded-xl overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Tipo / Nº</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cidade</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-56">Conferência</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {dados.itens.map(item => (
                                        <tr key={chaveItem(item.tipo, item.id)} className={item.conferidaEm ? 'bg-green-50' : ''}>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`text-sm font-mono font-bold px-1.5 py-0.5 rounded ${corEtiqueta(item)}`}>{item.etiqueta}</span>
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-gray-900">{item.cliente || '—'}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.cidade || '—'}</td>
                                            <td className="px-4 py-3 text-center">
                                                {item.conferidaEm ? (
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ No caminhão</span>
                                                        <span className="text-[11px] text-green-700 font-semibold">
                                                            bipado {horaCurta(item.conferidaEm)}{item.conferidaPorNome ? ` · ${item.conferidaPorNome}` : ''}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => desmarcar(item)}
                                                            disabled={desmarcando === chaveItem(item.tipo, item.id)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                                        >
                                                            {desmarcando === chaveItem(item.tipo, item.id)
                                                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                : <Undo2 className="h-3 w-3" />}
                                                            Desfazer
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">falta bipar</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* O que ainda não subiu no caminhão */}
                        {faltantes.length > 0 && (
                            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 md:p-4">
                                <div className="text-xs font-bold uppercase tracking-widest text-amber-800 flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    Ainda não entraram no caminhão ({faltantes.length})
                                </div>
                                <div className="mt-1.5 text-sm text-amber-900 leading-relaxed break-words">
                                    {faltantes.map(f => (
                                        <div key={chaveItem(f.tipo, f.id)}>
                                            <b className="font-mono">{f.etiqueta}</b>{f.cliente ? ` — ${f.cliente}` : ''}{f.cidade ? ` · ${f.cidade}` : ''}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <button
                                type="button"
                                onClick={onFechar}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm"
                            >
                                <X className="h-4 w-4" />
                                Fechar conferência
                            </button>
                            <button
                                type="button"
                                onClick={() => concluir(false)}
                                disabled={concluindo}
                                className="inline-flex items-center justify-center gap-1.5 px-5 py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                            >
                                {concluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                {faltam > 0 ? `Concluir mesmo faltando ${faltam}` : 'Concluir conferência'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ConferenciaCargaPanel;
