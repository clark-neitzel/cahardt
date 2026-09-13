import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import mapaClientesService from '../../../services/mapaClientesService';
import { parseDias } from '../../../components/DayPicker';
import { chavesDoCliente, rotuloDaChave, corDaChave, diasReais, SEM_VALOR, COR_OCULTO } from './coresMapa';

// Padrão dos filtros da tela (persistidos por useFiltrosSalvos em MapaClientes.jsx).
export const FILTROS_PADRAO = {
    cidades: [], bairros: [], categorias: [], vendedores: [],
    diasEntrega: [], diasVenda: [],
    whatsapp: 'todos',   // todos | com | sem
    gps: 'todos',        // todos | com | sem
    ativo: 'ativos',     // ativos | inativos | todos
    colorirPor: 'diaEntrega',
};

const ATIVO_API = { ativos: 'true', inativos: 'false', todos: 'todos' };

const chaveBairro = (c) => `${c.cidade || ''}|${c.bairro || ''}`;

// Carrega a base UMA vez (e a cada salvamento), aplica os filtros no navegador e
// deriva tudo que a tela mostra: pinos, contadores, legenda, valores ocultos.
export default function useDadosMapa(filtros) {
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    // Valores desligados na legenda — NÃO persistido (é um "olhar rápido")
    const [valoresOcultos, setValoresOcultos] = useState(() => new Set());
    const ativoApi = ATIVO_API[filtros.ativo] || 'true';
    const pedidoAtual = useRef(0);

    const carregar = useCallback(async ({ silencioso = false } = {}) => {
        const id = ++pedidoAtual.current;
        if (!silencioso) setCarregando(true);
        setErro(null);
        try {
            const r = await mapaClientesService.carregar({ ativo: ativoApi });
            if (id !== pedidoAtual.current) return; // resposta velha (trocou o filtro no meio)
            setDados(r);
        } catch (e) {
            if (id !== pedidoAtual.current) return;
            console.error('[MapaClientes] carregar', e);
            setErro(e?.response?.data?.error || 'Não foi possível carregar o mapa de clientes.');
        } finally {
            if (id === pedidoAtual.current) setCarregando(false);
        }
    }, [ativoApi]);

    useEffect(() => { carregar(); }, [carregar]);

    // A legenda reinicia quando muda o critério de cor (os valores são outros)
    useEffect(() => { setValoresOcultos(new Set()); }, [filtros.colorirPor]);

    const clientes = dados?.clientes || [];

    // ── Filtros da tela (tudo no navegador) ─────────────────────────────────
    const filtrados = useMemo(() => {
        const f = filtros;
        const cid = new Set(f.cidades || []);
        const bai = new Set(f.bairros || []);
        const cat = new Set(f.categorias || []);
        const ven = new Set(f.vendedores || []);
        const dE = new Set(f.diasEntrega || []);
        const dV = new Set(f.diasVenda || []);
        return clientes.filter(c => {
            if (f.ativo === 'ativos' && c.ativo === false) return false;
            if (f.ativo === 'inativos' && c.ativo !== false) return false;
            if (cid.size && !cid.has(c.cidade)) return false;
            if (bai.size && !bai.has(chaveBairro(c))) return false;
            if (cat.size && !cat.has(c.categoriaId || SEM_VALOR)) return false;
            if (ven.size && !ven.has(c.vendedorId || SEM_VALOR)) return false;
            if (dE.size && !(c.diasEntrega || []).some(d => dE.has(d))) return false;
            if (dV.size && !(c.diasVenda || []).some(d => dV.has(d))) return false;
            if (f.whatsapp === 'com' && !c.whatsapp?.temNumero) return false;
            if (f.whatsapp === 'sem' && c.whatsapp?.temNumero) return false;
            if (f.gps === 'com' && !c.gps) return false;
            if (f.gps === 'sem' && c.gps) return false;
            return true;
        });
    }, [clientes, filtros]);

    const comGps = useMemo(() => filtrados.filter(c => !!c.gps), [filtrados]);
    const semGps = useMemo(() => filtrados.filter(c => !c.gps), [filtrados]);

    // ── Legenda (valor → cor, qtd) montada dos FILTRADOS (o que está no mapa) ──
    const legenda = useMemo(() => {
        const por = filtros.colorirPor;
        const mapa = new Map(); // chave → { chave, rotulo, qtd }
        for (const c of filtrados) {
            for (const ch of chavesDoCliente(c, por)) {
                const item = mapa.get(ch) || { chave: ch, rotulo: rotuloDaChave(ch, por, c), qtd: 0 };
                item.qtd++;
                mapa.set(ch, item);
            }
        }
        const ordem = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];
        const itens = [...mapa.values()].sort((a, b) => {
            if (a.chave === SEM_VALOR) return 1;
            if (b.chave === SEM_VALOR) return -1;
            if (por === 'diaEntrega' || por === 'diaVenda') return ordem.indexOf(a.chave) - ordem.indexOf(b.chave);
            if (por === 'whatsapp') return a.chave === 'sim' ? -1 : 1;
            return a.rotulo.localeCompare(b.rotulo, 'pt-BR');
        });
        // índice alfabético só entre os que têm valor (paleta rotativa estável)
        let i = 0;
        return itens.map(it => ({
            ...it,
            cor: corDaChave(it.chave, por, it.chave === SEM_VALOR ? 0 : i++),
            ligado: !valoresOcultos.has(it.chave),
        }));
    }, [filtrados, filtros.colorirPor, valoresOcultos]);

    const corPorChave = useMemo(() => {
        const m = new Map();
        legenda.forEach(it => m.set(it.chave, it.cor));
        return m;
    }, [legenda]);

    // Pinos de fato desenhados: cliente some se TODOS os seus valores estão
    // desligados; com um valor ligado ele fica, e a fatia desligada sai esmaecida.
    const visiveisNoMapa = useMemo(() => {
        const por = filtros.colorirPor;
        const out = [];
        for (const c of comGps) {
            const chaves = chavesDoCliente(c, por);
            if (valoresOcultos.size && chaves.every(ch => valoresOcultos.has(ch))) continue;
            out.push({
                cliente: c,
                cores: chaves.map(ch => valoresOcultos.has(ch) ? COR_OCULTO : (corPorChave.get(ch) || '#6b7280')),
            });
        }
        return out;
    }, [comGps, filtros.colorirPor, valoresOcultos, corPorChave]);

    // ── Contadores ──────────────────────────────────────────────────────────
    const contadores = useMemo(() => {
        const porDiaEntrega = {}; const porDiaVenda = {};
        let comWhatsapp = 0;
        for (const c of filtrados) {
            if (c.whatsapp?.temNumero) comWhatsapp++;
            diasReais(c.diasEntrega).forEach(d => { porDiaEntrega[d] = (porDiaEntrega[d] || 0) + 1; });
            diasReais(c.diasVenda).forEach(d => { porDiaVenda[d] = (porDiaVenda[d] || 0) + 1; });
        }
        return {
            total: filtrados.length,
            comGps: comGps.length,
            semGps: semGps.length,
            comWhatsapp,
            semWhatsapp: filtrados.length - comWhatsapp,
            // "sem dia" = nenhum dia real (vazio ou só N/D) — mesma régua da legenda e das paradas
            semDiaEntrega: filtrados.filter(c => !diasReais(c.diasEntrega).length).length,
            semDiaVenda: filtrados.filter(c => !diasReais(c.diasVenda).length).length,
            porDiaEntrega, porDiaVenda,
        };
    }, [filtrados, comGps, semGps]);

    const toggleValor = useCallback((chave) => {
        setValoresOcultos(prev => {
            const n = new Set(prev);
            if (n.has(chave)) n.delete(chave); else n.add(chave);
            return n;
        });
    }, []);
    const mostrarTodos = useCallback(() => setValoresOcultos(new Set()), []);

    // Atualização otimista após salvar no painel (o reload leve vem em seguida)
    const atualizarLocal = useCallback((uuid, patch) => {
        setDados(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                clientes: prev.clientes.map(c => {
                    if (c.uuid !== uuid) return c;
                    const n = { ...c };
                    if (patch.Dia_de_entrega !== undefined) { n.diaEntregaRaw = patch.Dia_de_entrega; n.diasEntrega = parseDias(patch.Dia_de_entrega); }
                    if (patch.Dia_de_venda !== undefined) { n.diaVendaRaw = patch.Dia_de_venda; n.diasVenda = parseDias(patch.Dia_de_venda); }
                    if (patch.categoriaId !== undefined) { n.categoriaId = patch.categoriaId; n.categoriaNome = patch.categoriaNome ?? null; }
                    if (patch.vendedorId !== undefined) { n.vendedorId = patch.vendedorId; n.vendedorNome = patch.vendedorNome ?? null; n.vendedorAtivo = patch.vendedorAtivo ?? true; }
                    if (patch.telefoneCelular !== undefined) {
                        n.telefoneCelular = patch.telefoneCelular;
                        n.whatsapp = { temNumero: !!patch.telefoneCelular, situacao: patch.telefoneCelular ? 'SEM_HISTORICO' : 'SEM_NUMERO' };
                    }
                    return n;
                }),
            };
        });
    }, []);

    return {
        dados, carregando, erro, recarregar: carregar, atualizarLocal,
        clientes, filtrados, comGps, semGps, visiveisNoMapa,
        legenda, valoresOcultos, toggleValor, mostrarTodos,
        contadores,
    };
}
