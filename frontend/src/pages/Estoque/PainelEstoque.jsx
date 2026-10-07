import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Minus, Search, Package, AlertCircle, Loader2, History, AlertTriangle, Unlock, X, ChevronLeft, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import estoqueService from '../../services/estoqueService';
import { useAuth } from '../../contexts/AuthContext';
import { useAtualizaAoVoltar } from '../../hooks/useAtualizaAoVoltar';
import { useFocoInicial } from '../../hooks/useFocoInicial';
import { useLeitorCodigoBarras } from '../../hooks/useLeitorCodigoBarras';
import ConfirmarAjusteModal from '../../components/ConfirmarAjusteModal';

// ─── Embalagem / peso do produto ──────────────────────────────────────────────
// O catálogo tem 11 produtos com "COXINHA FRANGO" no nome. A embalagem ("C/50 30GR",
// "500GR", "2KG") ajuda a CONFERIR, mas NÃO identifica sozinha — em produção
// "C/20 · 130GR" sai igual para 3 produtos (códigos 1, 3059 e 3051) e "C/10 · 170GR"
// para 2 (5151 e 5182). Quem identifica é o CÓDIGO; a etiqueta é apoio visual.
// Não existe campo de embalagem no produto: `unidade` é texto livre (quase tudo
// "PT"/"UN") e `quantidadePorCaixa` é nulo em quase todo o catálogo — por isso a
// etiqueta é extraída do nome. Sem correspondência, devolve null (nada na tela).
// Duas formas: "C/50" (quantidade por pacote) e número+unidade ("30GR", "1,5L", "2KG").
// O grupo 1 é o caractere ANTERIOR ao número — existe só para recusar um número que
// comece no meio de outro ("6X1,5L" precisa virar "1,5L", nunca "5L") e é descartado.
// NÃO usar lookbehind `(?<!…)`: em literal de regex é ERRO DE SINTAXE no Safari
// anterior ao iOS 16.4 e derruba o módulo inteiro (tela branca no iPad antigo).
// O `(?!\/)` no fim recusa vazão/proporção ("2 KG/H" não é embalagem). Lookahead
// é seguro em qualquer navegador; só o lookBEHIND é proibido.
const RE_EMBALAGEM = /\bC\/\s?\d+\b|(^|[^0-9,])(\d+(?:[.,]\d+)?\s?(?:KG|GRS|GR|G|ML|LT|L|UNID|UN))\b(?!\/)/gi;

function embalagemDoNome(nome) {
    const texto = String(nome || '');
    if (!texto) return null;
    const re = new RegExp(RE_EMBALAGEM.source, 'gi');   // regex própria: `lastIndex` não vaza entre chamadas
    const vistos = new Set();
    const partes = [];
    let achado;
    while ((achado = re.exec(texto)) !== null) {
        const bruto = achado[2] !== undefined ? achado[2] : achado[0];  // grupo 2 = etiqueta sem o caractere anterior
        const t = bruto.toUpperCase().replace(/\s+/g, '');
        if (!vistos.has(t)) {
            vistos.add(t);
            partes.push(t);
        }
        if (partes.length === 2) break;   // "C/50 · 30GR" já basta para conferir
    }
    return partes.length > 0 ? partes.join(' · ') : null;
}

// Motivo obrigatório na SAÍDA — mesma regra do backend (POST /estoque/ajuste
// devolve 400 se a observação tiver menos de 3 caracteres depois do trim).
const MOTIVO_MINIMO = 3;
// Teto de sanidade: acima disso quase certamente foram os dígitos do leitor caindo no campo.
const QUANTIDADE_MAXIMA = 10000;
const motivoValido = (texto) => String(texto || '').trim().length >= MOTIVO_MINIMO;

// ─── Card de produto ──────────────────────────────────────────────────────────

function ProdutoCard({ produto, isSelected, onEscolher, lancamentoHoje }) {
    const entradas = lancamentoHoje?.entradas ?? 0;
    const saidas = lancamentoHoje?.saidas ?? 0;
    const abaixoMin = (produto.estoqueMinimo || 0) > 0 &&
        parseFloat(produto.estoqueDisponivel || 0) < parseFloat(produto.estoqueMinimo || 0);
    const embalagem = embalagemDoNome(produto.nome);

    return (
        <div
            className={`bg-white border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all ${
                isSelected
                    ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
            }`}
            onClick={() => onEscolher(produto)}
        >
            <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                    {/* Código (identifica) e embalagem (confere) acima do nome, para não
                        lançar no produto errado. O nome agora vai até 3 linhas: com
                        line-clamp-2 sumia justo o final — "500GR" / "2KG" — e sem limite
                        nenhum um nome de 100 caracteres esticava o card vizinho do grid. */}
                    <div className="flex flex-wrap items-center gap-1 mb-1">
                        <span className="inline-block text-[11px] font-mono font-bold text-white bg-house px-1.5 py-0.5 rounded">
                            {produto.codigo || 'sem código'}
                        </span>
                        {embalagem && (
                            <span className="inline-block text-[11px] font-bold text-primaryDark bg-mint px-1.5 py-0.5 rounded">
                                {embalagem}
                            </span>
                        )}
                    </div>
                    <h3 className="font-bold text-gray-900 text-xs leading-tight line-clamp-3 break-words">{produto.nome}</h3>
                </div>
                {abaixoMin && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
            </div>

            <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                    <span className="text-gray-400">Disponível</span>
                    <span className={`font-semibold ${abaixoMin ? 'text-amber-600' : 'text-blue-700'}`}>
                        {Number(produto.estoqueDisponivel || 0).toFixed(0)} {produto.unidade}
                        {produto.quantidadePorCaixa != null && (
                            <span className="text-primaryDark font-bold"> · cx de {produto.quantidadePorCaixa}</span>
                        )}
                    </span>
                </div>
                {entradas > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Entrada hoje</span>
                        <span className="font-semibold text-green-600">+{entradas.toFixed(0)}</span>
                    </div>
                )}
                {saidas > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Saída hoje</span>
                        <span className="font-semibold text-red-500">-{saidas.toFixed(0)}</span>
                    </div>
                )}
            </div>

            <button
                onClick={e => { e.stopPropagation(); onEscolher(produto); }}
                className={`w-full flex items-center justify-center min-h-[44px] py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    isSelected
                        ? 'bg-primary text-white'
                        : 'bg-mint text-primaryDark hover:bg-primary hover:text-white'
                }`}
            >
                {isSelected ? 'Selecionado' : 'Escolher'}
            </button>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PainelEstoque() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // Lista de produtos
    const [todos, setTodos] = useState([]);
    const [loadingProdutos, setLoadingProdutos] = useState(true);
    const [search, setSearch] = useState('');
    const [categoriaSel, setCategoriaSel] = useState(
        () => localStorage.getItem('estoque_ajuste_cat') || null
    );
    const [lancamentosHoje, setLancamentosHoje] = useState({});

    // Form de ajuste
    const [produtoSelecionado, setProdutoSelecionadoEstado] = useState(null);
    const [quantidade, setQuantidadeEstado] = useState('');
    // Espelhos SÍNCRONOS da seleção e da quantidade: o tratamento do bipe é assíncrono (busca na
    // API) e, lendo o estado da closure, enxergava o valor de antes. Os refs mudam no mesmo instante.
    const selecionadoRef = useRef(null);
    const quantidadeValRef = useRef('');
    const setProdutoSelecionado = (p) => { selecionadoRef.current = p; setProdutoSelecionadoEstado(p); };
    const setQuantidade = (v) => {
        const novo = typeof v === 'function' ? v(quantidadeValRef.current) : v;
        quantidadeValRef.current = novo;
        setQuantidadeEstado(novo);
    };
    // Fila dos bipes: um de cada vez, na ordem em que o leitor mandou ("3 bipes = 3").
    const filaBipeRef = useRef(Promise.resolve());
    // Código do último produto escolhido À MÃO durante um bipe em voo (a resposta não pode atropelar)
    const escolhaManualRef = useRef(0);
    const [observacao, setObservacao] = useState('');
    const [loadingAjuste, setLoadingAjuste] = useState(false);
    // Janela de confirmação: { tipo: 'ENTRADA'|'SAIDA', qtd } — null = fechada
    const [confirmacao, setConfirmacao] = useState(null);
    const confirmacaoRef = useRef(null);   // espelho síncrono: bipe em voo precisa saber se a janela abriu depois
    confirmacaoRef.current = confirmacao;
    // Chip "Bipado …" (1,5 s) mostrado quando o leitor de código de barras lê um código
    const [chipBipe, setChipBipe] = useState('');
    const chipTimerRef = useRef(null);

    // Histórico do produto selecionado
    const [historicoItem, setHistoricoItem] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [permissoes, setPermissoes] = useState(null);
    const [editandoMinimo, setEditandoMinimo] = useState(false);
    const [estoqueMinimo, setEstoqueMinimo] = useState('');
    const [salvandoMinimo, setSalvandoMinimo] = useState(false);

    const formRef = useRef(null);
    const obsRef = useRef(null);
    const { ref: quantidadeRef, voltarFoco: voltarFocoQuantidade } = useFocoInicial();
    // Guarda SÍNCRONA contra dois cliques/Enter muito rápidos: `loadingAjuste` é estado —
    // só vira `true` no próximo render, e dois cliques no mesmo tique passam pela checagem
    // do `disabled` antes de o React re-renderizar (foi assim que saiu lançamento em dobro).
    // Um `ref` muda no mesmo instante, então o 2º clique é barrado antes de virar rede.
    const salvandoRef = useRef(false);
    const isAdmin = user?.permissoes?.admin === true;

    // Carrega permissões
    useEffect(() => {
        estoqueService.getPermissoes()
            .then(setPermissoes)
            .catch(() => setPermissoes({ admin: false, regras: [] }));
    }, []);

    // Carrega todos os produtos (após permissões)
    const carregarProdutos = useCallback(async () => {
        if (!permissoes) return;
        setLoadingProdutos(true);
        try {
            const data = await estoqueService.getPosicao();
            setTodos(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Erro ao carregar produtos.');
        } finally {
            setLoadingProdutos(false);
        }
    }, [permissoes]);

    useEffect(() => { carregarProdutos(); }, [carregarProdutos]);

    // Carrega movimentos de hoje para exibir nos cards
    const carregarLancamentosHoje = useCallback(async () => {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const res = await estoqueService.listarHistorico({ dataInicio: hoje, dataFim: hoje, tamanhoPagina: 1000 });
            const movs = res.items || [];
            const mapa = {};
            movs.forEach(m => {
                if (!mapa[m.produtoId]) mapa[m.produtoId] = { entradas: 0, saidas: 0 };
                if (m.tipo === 'ENTRADA') mapa[m.produtoId].entradas += Number(m.quantidade || 0);
                else if (m.tipo === 'SAIDA') mapa[m.produtoId].saidas += Number(m.quantidade || 0);
            });
            setLancamentosHoje(mapa);
        } catch (err) {
            console.error('[Estoque] Erro ao carregar lançamentos de hoje:', err);
        }
    }, []);

    useEffect(() => { carregarLancamentosHoje(); }, [carregarLancamentosHoje]);

    // Rebusca ao voltar ao app / a cada 5 min (tela deixada aberta): estoque e movimentos de hoje
    useAtualizaAoVoltar(() => { carregarProdutos(); carregarLancamentosHoje(); });

    // Carrega últimos lançamentos do produto selecionado
    const carregarHistoricoItem = useCallback(async (produtoId) => {
        if (!produtoId) return;
        setLoadingHistorico(true);
        try {
            const res = await estoqueService.listarHistorico({ produtoId, tamanhoPagina: 8 });
            setHistoricoItem(res.items || []);
        } catch {
            setHistoricoItem([]);
        } finally {
            setLoadingHistorico(false);
        }
    }, []);

    useEffect(() => {
        if (produtoSelecionado) carregarHistoricoItem(produtoSelecionado.id);
        else setHistoricoItem([]);
    }, [produtoSelecionado, carregarHistoricoItem]);

    // Categorias comerciais únicas dos produtos carregados
    const categorias = [...new Map(
        todos
            .filter(p => p.categoriaProduto)
            .map(p => [p.categoriaProduto.id, p.categoriaProduto])
    ).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    // Filtragem client-side — apenas produtos do catálogo (com categoria comercial)
    const filtrados = todos.filter(p => {
        if (!p.categoriaProduto) return false;
        if (categoriaSel && p.categoriaProduto.id !== categoriaSel) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.nome.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q);
    });

    const selecionarCategoria = (id) => {
        setCategoriaSel(id);
        if (id) localStorage.setItem('estoque_ajuste_cat', id);
        else localStorage.removeItem('estoque_ajuste_cat');
    };

    const selecionarProduto = (produto) => {
        setConfirmacao(null);
        escolhaManualRef.current += 1;
        setProdutoSelecionado(produto);
        setQuantidade('');
        setObservacao('');
        setEditandoMinimo(false);
        setEstoqueMinimo(String(produto.estoqueMinimo ?? '0'));
        // Mobile: rola para o formulário
        if (window.innerWidth < 768) setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        // Desktop: "seleciona, digita, Enter" — foco direto na Quantidade (no celular não abre o teclado sozinho)
        else setTimeout(() => voltarFocoQuantidade(), 80);
    };

    const limparSelecao = () => {
        escolhaManualRef.current += 1;
        setProdutoSelecionado(null);
        setQuantidade('');
        setObservacao('');
        setEditandoMinimo(false);
    };

    const podeFazer = (tipo, produto = produtoSelecionado) => {
        if (!permissoes) return false;
        if (permissoes.admin) return true;
        const regras = permissoes.regras || [];
        const acao = tipo === 'ENTRADA' ? 'adicionar' : 'diminuir';
        if (!produto) return regras.some(r => Array.isArray(r.pode) && r.pode.includes(acao));
        return regras.some(r => {
            const catOk = !r.categoria || r.categoria === produto.categoria;
            return catOk && Array.isArray(r.pode) && r.pode.includes(acao);
        });
    };

    // Passo 1: valida e ABRE a janela de confirmação (verde = entrada, vermelha = saída).
    // Botões e Enter passam todos por aqui; nada é lançado sem o 2º Enter/clique.
    const handleAjuste = (tipo) => {
        if (salvandoRef.current || confirmacao) return;
        if (!produtoSelecionado) return toast.error('Selecione um produto.');
        const qtd = parseFloat(quantidade);
        if (!qtd || qtd <= 0) return toast.error('Informe uma quantidade válida.');
        if (qtd > QUANTIDADE_MAXIMA) return toast.error('Quantidade muito alta — confira se não foi o leitor.');
        if (!podeFazer(tipo)) return toast.error('Você não tem permissão para esta operação.');
        // Saída sem motivo já deixou produto negativo sem ninguém saber explicar depois.
        // Mesma regra do backend (400 'Informe o motivo da saída (mínimo 3 caracteres).').
        if (tipo === 'SAIDA' && !motivoValido(observacao)) {
            obsRef.current?.focus();
            return toast.error('Para dar SAÍDA é obrigatório escrever o motivo (mínimo 3 letras). Ex.: perda, quebra, uso interno.');
        }
        setConfirmacao({ tipo, qtd });
    };

    // Passo 2: o usuário confirmou na janela — grava de verdade.
    const executarAjuste = async () => {
        if (salvandoRef.current) return; // 2º clique/Enter no mesmo tique — barrado antes da rede
        if (!confirmacao || !produtoSelecionado) return;
        const { tipo, qtd } = confirmacao;

        salvandoRef.current = true;
        setLoadingAjuste(true);
        try {
            const res = await estoqueService.ajustar({
                produtoId: produtoSelecionado.id,
                tipo,
                quantidade: qtd,
                observacao: observacao || undefined
            });

            const atualizado = {
                ...produtoSelecionado,
                estoqueTotal: res.estoqueTotal,
                estoqueReservado: res.estoqueReservado,
                estoqueDisponivel: res.estoqueDisponivel
            };
            setProdutoSelecionado(atualizado);

            // Atualiza o card na lista também
            setTodos(prev => prev.map(p => p.id === produtoSelecionado.id ? { ...p, ...atualizado } : p));

            // Atualiza lançamentos de hoje
            setLancamentosHoje(prev => {
                const cur = prev[produtoSelecionado.id] || { entradas: 0, saidas: 0 };
                return {
                    ...prev,
                    [produtoSelecionado.id]: tipo === 'ENTRADA'
                        ? { ...cur, entradas: cur.entradas + qtd }
                        : { ...cur, saidas: cur.saidas + qtd }
                };
            });

            setQuantidade('');
            setObservacao('');
            setConfirmacao(null);
            carregarHistoricoItem(produtoSelecionado.id);

            const label = tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
            toast.success(
                `${label} registrada! Disponível: ${Number(res.estoqueDisponivel).toFixed(0)} ${produtoSelecionado.unidade || 'un'}`,
                { duration: 3000 }
            );
            // Pedido do dono: depois de dar entrada/saída, o cursor volta sozinho pro campo
            // Quantidade, pronto pro próximo lançamento (sem precisar clicar de novo).
            setTimeout(voltarFocoQuantidade, 50);   // depois de a janela sair do DOM
        } catch (err) {
            // Falhou: fecha a janela e volta ao formulário com os dados intactos para tentar de novo
            setConfirmacao(null);
            toast.error(err.response?.data?.error || 'Erro ao ajustar estoque.');
            setTimeout(voltarFocoQuantidade, 50);
        } finally {
            salvandoRef.current = false;
            setLoadingAjuste(false);
        }
    };

    const handleSalvarMinimo = async () => {
        if (!produtoSelecionado) return;
        const val = parseFloat(estoqueMinimo);
        if (isNaN(val) || val < 0) return toast.error('Valor de mínimo inválido.');
        setSalvandoMinimo(true);
        try {
            const res = await estoqueService.atualizarMinimo(produtoSelecionado.id, val);
            const atualizado = { ...produtoSelecionado, estoqueMinimo: res.estoqueMinimo };
            setProdutoSelecionado(atualizado);
            setTodos(prev => prev.map(p => p.id === produtoSelecionado.id ? { ...p, estoqueMinimo: res.estoqueMinimo } : p));
            setEditandoMinimo(false);
            toast.success('Estoque mínimo atualizado.');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar estoque mínimo.');
        } finally {
            setSalvandoMinimo(false);
        }
    };

    // ─── Leitor de código de barras (bipe) ───────────────────────────────────
    const mostrarChip = (codigo) => {
        setChipBipe(codigo);
        clearTimeout(chipTimerRef.current);
        chipTimerRef.current = setTimeout(() => setChipBipe(''), 1500);
    };
    useEffect(() => () => clearTimeout(chipTimerRef.current), []);

    const vincularCodigo = async (produto, codigo, toastId) => {
        toast.dismiss(toastId);
        try {
            await estoqueService.vincularCodigoBarras(produto.id, codigo);
            toast.success(`Código ${codigo} vinculado ao ${produto.codigo || produto.nome}.`);
        } catch (err) {
            toast.error(err.response?.data?.erro || err.response?.data?.error || 'Não foi possível vincular o código.');
        }
    };

    const processarBipe = async (codigo) => {
        mostrarChip(codigo);
        const geracao = escolhaManualRef.current;   // se mudar durante a busca, o usuário escolheu outro produto à mão
        let achado;
        try {
            const res = await estoqueService.buscarPorCodigoBarras(codigo);
            achado = res?.produto;
        } catch (err) {
            if (err.response?.status !== 404) {
                return toast.error(err.response?.data?.erro || err.response?.data?.error || 'Falha ao buscar o código');
            }
        }
        if (!achado) {
            const atual = selecionadoRef.current;
            const podeVincular = !!atual && (podeFazer('ENTRADA', atual) || podeFazer('SAIDA', atual));
            return toast.error((t) => (
                <span className="text-sm">
                    Código <b>{codigo}</b> não está em nenhum produto.
                    {podeVincular && (
                        <button
                            onClick={() => vincularCodigo(atual, codigo, t.id)}
                            className="block mt-2 px-3 min-h-[44px] rounded-full bg-primary hover:bg-primaryDark text-white text-xs font-semibold"
                        >
                            Vincular ao {atual.codigo || atual.nome}
                        </button>
                    )}
                </span>
            ), { duration: podeVincular ? 10000 : 4000 });
        }

        // Se o leitor já está digitando o PRÓXIMO código, espera ele terminar antes de mexer na quantidade
        // (a restauração do campo ao fim do pacote apagaria o resultado). No máx. ~0,5 s.
        for (let i = 0; i < 25 && pacoteEmAndamento(); i++) await new Promise(r => setTimeout(r, 20));

        if (confirmacaoRef.current) {
            // A janela de confirmação abriu enquanto a busca estava em voo: descarta o bipe por inteiro
            return toast.error('Bipe ignorado: confirme ou cancele o lançamento primeiro');
        }

        if (escolhaManualRef.current !== geracao) {
            // O usuário clicou em outro card (ou voltou à lista) enquanto a busca estava em voo:
            // a escolha manual vale mais que a resposta do bipe.
            return toast(`Bipe de ${achado.codigo || achado.nome} ignorado: você escolheu outro produto.`);
        }

        const atual = selecionadoRef.current;
        if (atual && atual.id === achado.id) {
            // mesmo produto: cada bipe soma +1
            setQuantidade(q => String((parseFloat(q) || 0) + 1));
            setTimeout(() => voltarFocoQuantidade({ selecionar: false }), 0);
            return;
        }
        const tinhaQuantidade = !!atual && parseFloat(quantidadeValRef.current) > 0;
        selecionarProduto(achado);   // mesmo fora do filtro de categoria; já zera quantidade e motivo
        if (tinhaQuantidade) toast(`Troquei para ${achado.codigo || achado.nome} e zerei a quantidade.`);
        setTimeout(() => voltarFocoQuantidade(), 80);   // o campo só existe depois do render do painel
    };

    // Um bipe de cada vez, na ordem: promessa encadeada (nunca rejeita, para a fila não travar)
    const aoBipar = (codigo) => {
        filaBipeRef.current = filaBipeRef.current
            .then(() => processarBipe(codigo))
            .catch((err) => console.error('[Bipe] erro:', err));
    };

    // Escuta SEMPRE (inclusive com a janela aberta e durante o carregamento da lista): com a janela
    // aberta o hook engole o Enter do leitor e só avisa — o bipe nunca confirma o lançamento.
    const pacoteEmAndamento = useLeitorCodigoBarras({
        onCodigo: aoBipar,
        bloqueado: !!confirmacao,
        onBloqueado: () => toast.error('Confirme ou cancele o lançamento antes de bipar'),
    });

    const podeEntrada = podeFazer('ENTRADA');
    const podeSaida = podeFazer('SAIDA');
    const embalagemSelecionado = embalagemDoNome(produtoSelecionado?.nome);
    const motivoOk = motivoValido(observacao);
    // Quem só tem permissão de ADICIONAR nunca vai dar saída: para essa pessoa o motivo
    // é sempre opcional e o campo NÃO pode aparecer pintado de erro numa entrada legítima.
    // Rótulo, borda do campo e faixa de aviso usam esta mesma condição.
    const exigeMotivo = podeSaida && !motivoOk;
    const estoqueMin = parseFloat(produtoSelecionado?.estoqueMinimo || 0);
    const estoqueDisp = parseFloat(produtoSelecionado?.estoqueDisponivel || 0);
    const abaixoMinimo = estoqueMin > 0 && estoqueDisp < estoqueMin;

    const historicoBloco = (
                <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Últimos lançamentos</p>
                    {loadingHistorico ? (
                        <div className="flex justify-center py-3">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
                        </div>
                    ) : historicoItem.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Nenhum lançamento registrado.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {historicoItem.map(m => {
                                const isEntrada = m.tipo === 'ENTRADA';
                                const dt = new Date(m.createdAt);
                                const dataStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                                const desc = m.observacao || m.motivo?.toLowerCase().replace(/_/g, ' ') || '';
                                return (
                                    <div key={m.id} className="flex items-center gap-2 text-xs">
                                        <span className={`shrink-0 w-10 text-right font-bold ${isEntrada ? 'text-green-600' : 'text-red-500'}`}>
                                            {isEntrada ? '+' : '-'}{Number(m.quantidade).toFixed(0)}
                                        </span>
                                        <span className="text-gray-500 truncate flex-1 capitalize">{desc}</span>
                                        <span className="text-gray-400 shrink-0 tabular-nums">{dataStr}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
    );

    return (
        // A partir de md (768 px): a tela tem a altura da janela (100dvh, com fallback 100vh) menos o pb-10 do
        // <main> (2.5rem) e a barra de visitantes (--topo-extra, 38px quando visível) — só a lista rola na
        // esquerda; o painel da direita fica parado e rola POR DENTRO se não couber (zoom).
        <div className="w-full px-4 py-6 md:h-[calc(100vh-2.5rem-var(--topo-extra,0px))] md:supports-[height:100dvh]:h-[calc(100dvh-2.5rem-var(--topo-extra,0px))] md:flex md:flex-col md:py-4">
            {confirmacao && produtoSelecionado && (
                <ConfirmarAjusteModal
                    tipo={confirmacao.tipo}
                    produto={produtoSelecionado}
                    quantidade={confirmacao.qtd}
                    observacao={observacao}
                    salvando={loadingAjuste}
                    onConfirmar={executarAjuste}
                    onCancelar={() => { if (salvandoRef.current) return; setConfirmacao(null); setTimeout(voltarFocoQuantidade, 50); }}
                />
            )}
            {/* Header */}
            <div className="flex items-center justify-between mb-4 md:shrink-0 gap-2">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Ajuste de Estoque</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Produção / Estoque</p>
                </div>
                {chipBipe && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-mint text-primaryDark text-xs font-bold truncate max-w-[50%]">
                        <ScanLine className="h-3.5 w-3.5 shrink-0" /> Bipado {chipBipe}
                    </span>
                )}
                <button
                    onClick={() => navigate('/estoque/historico')}
                    className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-sm text-primary hover:text-primaryDark hover:bg-mint/50 font-medium"
                >
                    <History className="h-4 w-4" />
                    Histórico
                </button>
            </div>

            {/* Layout split: lista à esquerda, formulário à direita */}
            <div className="flex flex-col md:flex-row gap-5 md:flex-1 md:min-h-0">

                {/* PAINEL ESQUERDO — lista de produtos (rola sozinha no desktop) */}
                <div className={`md:w-[58%] md:h-full md:overflow-y-auto md:pr-1 ${produtoSelecionado ? 'hidden md:block' : ''}`}>

                    {/* Busca */}
                    <div className="relative mb-2">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou código..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                            autoComplete="off"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        )}
                    </div>

                    {/* Filtros de categoria comercial */}
                    {categorias.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            <button
                                onClick={() => selecionarCategoria(null)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                    categoriaSel === null
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                                        : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                }`}
                            >
                                Todos
                            </button>
                            {categorias.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => selecionarCategoria(categoriaSel === cat.id ? null : cat.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                        categoriaSel === cat.id
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                                            : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                                >
                                    {cat.nome}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Contador */}
                    {!loadingProdutos && (
                        <p className="text-xs text-gray-400 mb-3">
                            {filtrados.length} produto(s){categoriaSel || search ? ' filtrado(s)' : ''}
                        </p>
                    )}

                    {/* Grid de cards */}
                    {loadingProdutos ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="bg-gray-100 rounded-xl h-28 animate-pulse" />
                            ))}
                        </div>
                    ) : filtrados.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">{search ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 gap-3">
                            {filtrados.map(p => (
                                <ProdutoCard
                                    key={p.id}
                                    produto={p}
                                    isSelected={produtoSelecionado?.id === p.id}
                                    onEscolher={selecionarProduto}
                                    lancamentoHoje={lancamentosHoje[p.id] || null}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* PAINEL DIREITO — formulário de ajuste */}
                <div ref={formRef} className="scroll-mt-16 md:scroll-mt-0 md:w-[42%] md:h-full md:min-h-0 md:flex md:flex-col">

                    {/* Botão voltar (mobile) */}
                    {produtoSelecionado && (
                        <button
                            onClick={limparSelecao}
                            className="md:hidden flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 mb-2 min-h-[44px] px-1"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Voltar à lista
                        </button>
                    )}

                    <div className="md:flex-1 md:min-h-0 md:flex md:flex-col">
                        {produtoSelecionado ? (
                            <div className="space-y-4 md:space-y-0 md:flex md:flex-col md:h-full md:min-h-0">
                                {/* Desktop: card + campos + últimos lançamentos rolam aqui dentro; os botões ficam fixos embaixo */}
                                <div className="space-y-4 md:pb-3 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
                                {/* Card do produto selecionado */}
                                <div className={`border rounded-xl p-4 ${abaixoMinimo ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            {/* Código + embalagem em destaque ANTES do nome: é a última
                                                conferência antes de lançar entrada/saída. */}
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="inline-block text-xs font-mono font-bold text-white bg-house px-2 py-0.5 rounded-full">
                                                    {produtoSelecionado.codigo || 'sem código'}
                                                </span>
                                                {embalagemSelecionado && (
                                                    <span className="inline-block text-xs font-bold text-primaryDark bg-mint px-2 py-0.5 rounded-full">
                                                        {embalagemSelecionado}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-gray-900 leading-snug break-words">{produtoSelecionado.nome}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {produtoSelecionado.categoria || 'sem categoria'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={limparSelecao}
                                            className="hidden md:block text-gray-400 hover:text-gray-600 text-xl font-light shrink-0 leading-none mt-0.5"
                                        >×</button>
                                    </div>

                                    {/* 3 estados de estoque */}
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-white rounded-lg p-2 border border-gray-200">
                                            <p className="text-xs text-gray-500 mb-0.5">Total</p>
                                            <p className="text-base font-bold text-gray-800">
                                                {Number(produtoSelecionado.estoqueTotal || 0).toFixed(0)}
                                            </p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2 border border-orange-200">
                                            <p className="text-xs text-orange-600 mb-0.5">Reservado</p>
                                            <p className="text-base font-bold text-orange-600">
                                                {Number(produtoSelecionado.estoqueReservado || 0).toFixed(0)}
                                            </p>
                                        </div>
                                        <div className={`bg-white rounded-lg p-2 border ${abaixoMinimo ? 'border-amber-400' : 'border-blue-200'}`}>
                                            <p className={`text-xs mb-0.5 ${abaixoMinimo ? 'text-amber-600' : 'text-blue-600'}`}>Disponível</p>
                                            <p className={`text-base font-bold ${abaixoMinimo ? 'text-amber-600' : 'text-blue-700'}`}>
                                                {Number(produtoSelecionado.estoqueDisponivel || 0).toFixed(0)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-gray-400 mt-1">{produtoSelecionado.unidade || 'un'}</p>

                                    {abaixoMinimo && (
                                        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            Abaixo do mínimo ({Number(estoqueMin).toFixed(0)} {produtoSelecionado.unidade || 'un'})
                                        </div>
                                    )}

                                    {isAdmin && (
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Mínimo:</span>
                                            {editandoMinimo ? (
                                                <>
                                                    <input
                                                        type="number"
                                                        value={estoqueMinimo}
                                                        onChange={e => setEstoqueMinimo(e.target.value)}
                                                        className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                        min="0"
                                                        step="1"
                                                        inputMode="decimal"
                                                    />
                                                    <button
                                                        onClick={handleSalvarMinimo}
                                                        disabled={salvandoMinimo}
                                                        className="text-xs text-blue-600 font-medium hover:text-blue-800 disabled:opacity-50"
                                                    >
                                                        {salvandoMinimo ? 'Salvando...' : 'Salvar'}
                                                    </button>
                                                    <button onClick={() => setEditandoMinimo(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs font-medium text-gray-700">{Number(produtoSelecionado.estoqueMinimo || 0).toFixed(0)} {produtoSelecionado.unidade || 'un'}</span>
                                                    <button
                                                        onClick={() => { setEditandoMinimo(true); setEstoqueMinimo(String(produtoSelecionado.estoqueMinimo ?? '0')); }}
                                                        className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
                                                        title="Editar estoque mínimo"
                                                    >
                                                        <Unlock className="h-3 w-3" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Motivo — obrigatório para SAÍDA, opcional para ENTRADA */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Motivo
                                        {exigeMotivo ? (
                                            <span className="text-red-600 font-semibold"> * obrigatório para dar Saída</span>
                                        ) : (
                                            <span className="text-gray-500 font-normal"> · opcional na entrada</span>
                                        )}
                                    </label>
                                    <input
                                        ref={obsRef}
                                        type="text"
                                        value={observacao}
                                        onChange={e => setObservacao(e.target.value)}
                                        placeholder="Ex.: perda, quebra, uso interno, ajuste de inventário"
                                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
                                            exigeMotivo
                                                ? 'border-red-300 bg-red-50/40 focus:ring-red-400 focus:border-red-400'
                                                : 'border-gray-300 focus:ring-primary focus:border-primary'
                                        }`}
                                    />
                                </div>

                                {/* Aviso visível: por que a Saída ainda não vai passar */}
                                {exigeMotivo && (
                                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                                        <span>
                                            <span className="font-semibold">Para dar Saída, escreva o motivo acima.</span>{' '}
                                            A entrada pode ser lançada sem motivo.
                                        </span>
                                    </div>
                                )}

                                {/* Aviso de permissão */}
                                {!podeEntrada && !podeSaida && (
                                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        Você não tem permissão para ajustar estoque nesta categoria.
                                    </div>
                                )}
                                {(podeEntrada || podeSaida) && (
                                    <p className="text-xs text-center text-gray-500">
                                        {podeEntrada && podeSaida
                                            ? 'Você pode adicionar e diminuir estoque nesta categoria.'
                                            : podeEntrada
                                                ? 'Você pode apenas adicionar estoque nesta categoria.'
                                                : 'Você pode apenas diminuir estoque nesta categoria.'}
                                    </p>
                                )}

                                {/* Desktop: últimos lançamentos rolam dentro do painel */}
                                <div className="hidden md:block">{historicoBloco}</div>
                                </div>

                                {/* BLOCO DE AÇÃO — Quantidade + botões. No celular (< 768 px) é uma barra FIXA no rodapé,
                                    sempre à vista; a partir de md fica no pé do painel (sempre acessível, mesmo com zoom). */}
                                <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:z-auto md:px-0 md:pt-3 md:pb-0 md:bg-secondary md:shrink-0">
                                <div className="flex items-end gap-2 md:block">
                                    <div className="w-24 shrink-0 md:w-auto md:mb-3">
                                        <label className="block text-xs md:text-sm font-medium text-gray-700 mb-0.5 md:mb-1.5">Quantidade</label>
                                        <input
                                            ref={quantidadeRef}
                                            type="number"
                                            value={quantidade}
                                            onChange={e => setQuantidade(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key !== 'Enter') return;
                                                e.preventDefault();
                                                // Enter lança Entrada por padrão (ação mais comum); se só Saída
                                                // estiver liberada para o produto, usa Saída.
                                                if (loadingAjuste) return;
                                                if (podeEntrada) handleAjuste('ENTRADA');
                                                else if (podeSaida) handleAjuste('SAIDA');
                                            }}
                                            placeholder="0"
                                            min="0"
                                            step="0.001"
                                            className="w-full px-2 md:px-4 py-2 md:py-3 border border-gray-300 rounded-xl text-center text-xl md:text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                                            inputMode="decimal"
                                        />
                                    </div>
                                    {/* Botões Saída / Entrada */}
                                    <div className="grid grid-cols-2 gap-2 md:gap-3 flex-1">
                                        <button
                                            onClick={() => handleAjuste('SAIDA')}
                                            disabled={!podeSaida || loadingAjuste}
                                            title={!podeSaida ? 'Sem permissão para diminuir estoque nesta categoria' : ''}
                                            className={`flex items-center justify-center gap-1 md:gap-2 min-h-[52px] py-3 rounded-full text-sm md:text-base font-bold transition-all ${
                                                podeSaida && !loadingAjuste
                                                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm active:scale-95'
                                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            {loadingAjuste ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                                            − Saída
                                        </button>
                                        <button
                                            onClick={() => handleAjuste('ENTRADA')}
                                            disabled={!podeEntrada || loadingAjuste}
                                            title={!podeEntrada ? 'Sem permissão para adicionar estoque nesta categoria' : ''}
                                            className={`flex items-center justify-center gap-1 md:gap-2 min-h-[52px] py-3 rounded-full text-sm md:text-base font-bold transition-all ${
                                                podeEntrada && !loadingAjuste
                                                    ? 'bg-primary hover:bg-primaryDark text-white shadow-sm active:scale-95'
                                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            {loadingAjuste ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                                            + Entrada
                                        </button>
                                    </div>
                                </div>
                                </div>

                                {/* Mobile: histórico depois dos botões */}
                                <div className="md:hidden pb-32">{historicoBloco}</div>
                            </div>
                        ) : (
                            // Desktop: placeholder quando nenhum produto está selecionado
                            <div className="hidden md:flex flex-col items-center justify-center min-h-[320px] border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                                <Package className="h-12 w-12 mb-3 opacity-30" />
                                <p className="text-sm text-center px-6">Selecione um produto na lista ao lado para ajustar o estoque.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
