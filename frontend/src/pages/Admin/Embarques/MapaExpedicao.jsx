import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, Loader2, Wand2, Route as RouteIcon, X, Truck, Printer, MapPinOff, Lock, ArrowLeftRight, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import mapaExpedicaoService from '../../../services/mapaExpedicaoService';
import SelectBusca from '../../../components/SelectBusca';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de divisão de cargas: a expedição vê TUDO que vai para a rua no dia —
// pedidos, bonificações (BN#), especiais (ZZ#), amostras e cobranças — e decide
// QUEM leva o quê (a ORDEM continua sendo do motorista, no painel dele).
// Um pino por CLIENTE: badges mostram o que vai para ele, e mover leva o
// conjunto inteiro (itens não-travados) junto — regra do dono.
// Modelo rascunho: mover só recolore localmente; nada grava até o operador
// clicar em "Confirmar". 16:30 é referência visual, nunca trava.
// A sugestão e o mapa NUNCA dependem do OSRM — sem ele, os números saem
// aproximados (haversine local) com o selo "≈".
// ─────────────────────────────────────────────────────────────────────────────

const CORES = ['#00754A', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#9333ea', '#0d9488'];
const COR_SEM_CARGA = '#6b7280';
const REF_RETORNO = '16:30';
const SEM_CARGA = 'SEM_CARGA'; // valor do SelectBusca para "tirar da carga"
const MISTO = 'MISTO';         // itens do mesmo cliente em cargas diferentes

// Marcação por tipo de item (cores semânticas dos badges do sistema:
// roxo = especial/bonificação, âmbar = atenção/amostra, verde = dinheiro).
const BADGE_TIPO = {
    pedido:      { t: 'P',  cls: 'bg-white border border-gray-300 text-gray-700', bg: '#ffffff', fg: '#374151' },
    bonificacao: { t: 'BN', cls: 'bg-purple-100 text-purple-700',                 bg: '#f3e8ff', fg: '#7e22ce' },
    especial:    { t: 'ZZ', cls: 'bg-purple-100 text-purple-700',                 bg: '#f3e8ff', fg: '#7e22ce' },
    amostra:     { t: 'A',  cls: 'bg-amber-100 text-amber-700',                   bg: '#fef3c7', fg: '#b45309' },
    cobranca:    { t: '$',  cls: 'bg-green-100 text-green-800',                   bg: '#dcfce7', fg: '#166534' }
};
const NOME_TIPO = {
    pedido: 'Pedido', bonificacao: 'Bonificação', especial: 'Pedido especial',
    amostra: 'Amostra', cobranca: 'Cobrança'
};
const ORDEM_TIPOS = ['pedido', 'bonificacao', 'especial', 'amostra', 'cobranca'];

const temChave = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataBR = (s) => s ? s.split('-').reverse().join('/') : '';

const hhmmParaMin = (s) => {
    const [h, m] = String(s || '').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const minParaHHMM = (min) => {
    const m = Math.max(0, Math.round(min));
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const distM = (a, b) => {
    const R = 6371000, toRad = (g) => (g * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Estimativa local (sem rede): vizinho mais próximo a partir da base, ida e
// volta, × 1,3 de fator de estrada, 40 km/h + tempo de parada por CLIENTE
// (vários itens no mesmo cliente = UMA parada).
function estimativaLocal(base, pontos, nParadas, horaSaida, tempoParadaMin) {
    let dist = 0;
    if (base && pontos.length) {
        let atual = base;
        const resto = [...pontos];
        while (resto.length) {
            let melhor = 0, melhorD = Infinity;
            resto.forEach((p, i) => { const d = distM(atual, p); if (d < melhorD) { melhorD = d; melhor = i; } });
            dist += melhorD;
            atual = resto.splice(melhor, 1)[0];
        }
        dist += distM(atual, base);
    }
    const km = (dist / 1000) * 1.3;
    const duracaoMin = Math.round((km / 40) * 60 + nParadas * tempoParadaMin);
    return {
        distanciaKm: Math.round(km * 10) / 10,
        duracaoMin,
        previsaoRetorno: minParaHHMM(hhmmParaMin(horaSaida) + duracaoMin),
        precisao: 'aproximada'
    };
}

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtKm = (v) => (v == null ? null : (Math.round(Number(v) * 10) / 10).toLocaleString('pt-BR'));
const fmtDur = (min) => {
    if (min == null) return null;
    const m = Math.round(Number(min));
    const h = Math.floor(m / 60);
    return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

const mensagemErro = (e, fallback) => {
    const data = e.response?.data;
    if (e.response?.status === 400) {
        const detalhe = data?.erro || data?.error || data?.message || data?.mensagem;
        if (detalhe) return `Confira os dados: ${String(detalhe)}`;
    }
    return fallback;
};

// ── Modelo de item unificado ──
// ATENÇÃO: o backend manda SEMPRE `tipo: 'pedido'` nas entregas e sinaliza
// bonificação/especial em campos booleanos separados (é `atribuicoes.tipo` do
// contrato de gravação — não dá para mudar lá). O tipo VISUAL sai dos booleanos;
// a etiqueta (BN# / ZZ#) fica como último recurso (backend antigo).
const tipoDaEntrega = (e) => {
    if (e.bonificacao) return 'bonificacao';
    if (e.especial) return 'especial';
    const et = String(e.etiqueta || e.numero || '');
    if (/^BN/i.test(et)) return 'bonificacao';
    if (/^ZZ/i.test(et)) return 'especial';
    return 'pedido';
};

// Normaliza qualquer item (entrega, amostra, cobrança — inclusive vindos de
// semGps) para o mesmo formato: { chave, tipoItem, tipoPayload, itemId, ... }.
// tipoPayload é o tipo do contrato do backend ('pedido'|'amostra'|'cobranca' —
// bonificação e especial SÃO pedidos para o backend).
const normalizarItem = (raw) => {
    if (raw.amostraId != null) {
        return {
            ...raw,
            tipoItem: 'amostra', tipoPayload: 'amostra',
            itemId: raw.amostraId, chave: `amostra:${raw.amostraId}`,
            valorTotal: raw.valor ?? raw.valorTotal ?? null
        };
    }
    if (raw.cobrancaRotaId != null) {
        return {
            ...raw,
            tipoItem: 'cobranca', tipoPayload: 'cobranca',
            itemId: raw.cobrancaRotaId, chave: `cobranca:${raw.cobrancaRotaId}`,
            valorTotal: raw.valor ?? raw.valorTotal ?? null
        };
    }
    return {
        ...raw,
        tipoItem: tipoDaEntrega(raw), tipoPayload: 'pedido',
        itemId: raw.pedidoId, chave: `pedido:${raw.pedidoId}`
    };
};

// Um pino por cliente: itens do mesmo cliente andam juntos.
// MESMA chave do backend (`chaveLocal` em routes/embarquesMapa.js): cliente →
// `c:id`, amostra de lead → `l:id`, item solto → um local próprio. Agrupar pelo
// NOME juntava dois leads homônimos num pino só (e "mover levava tudo" arrastava
// amostra do lead errado).
const chaveCliente = (p) => (
    p.clienteId != null ? `c:${p.clienteId}`
        : p.leadId != null ? `l:${p.leadId}`
            : `i:${p.chave}`
);

export default function MapaExpedicao() {
    const [data, setData] = useState(hojeISO); // padrão calculado (hoje) — NÃO persiste
    const [periodoEntrega, periodoEntregaCtl] = usePeriodoSalvo('mapa-expedicao:entrega', 'hoje');
    const [params, setParams] = useFiltrosSalvos('mapa-expedicao', { horaSaida: '08:00', tempoParadaMin: 10 });
    const [dados, setDados] = useState(null);           // { cargas, entregas, amostras, cobrancas, semGps, base }
    const [carregando, setCarregando] = useState(true);
    const [erroCarregamento, setErroCarregamento] = useState(null);
    const [rascunho, setRascunho] = useState({});        // chave do item -> embarqueId | null
    const [estimApi, setEstimApi] = useState(null);      // { chave, grupos: { [embarqueId]: {...} } }
    const [avisos, setAvisos] = useState([]);
    const [criterioSugestao, setCriterioSugestao] = useState(null);
    const [trocaDestino, setTrocaDestino] = useState({}); // carga de origem -> carga que receberá a rota inteira
    // Cargas que NÃO entram na "Sugerir divisão" (ex.: alguém da empresa que vai
    // levar UM pedido específico — aquela carga não pode receber o rateio).
    // Guardamos quem está FORA: vazio = todas participam (comportamento de antes).
    // NÃO persiste (nem em useFiltrosSalvos): id de carga muda todo dia, salvar
    // prenderia o operador numa seleção velha — mesma razão de não salvar data absoluta.
    const [foraDaDivisao, setForaDaDivisao] = useState([]);
    const [sugerindo, setSugerindo] = useState(false);
    const [recalculando, setRecalculando] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [confirmandoApagar, setConfirmandoApagar] = useState(false); // aviso antes de apagar cobrança
    const [selecionado, setSelecionado] = useState(null); // chave do CLIENTE do pino clicado
    const [sheetAberta, setSheetAberta] = useState(false); // bottom-sheet no celular
    const requisicaoMapa = useRef(0);
    // Espelho do rascunho para uso DENTRO do `carregar` (que não pode depender dele:
    // entrar na lista de dependências recriaria o callback e o efeito rodaria em laço).
    const rascunhoRef = useRef(rascunho);
    useEffect(() => { rascunhoRef.current = rascunho; }, [rascunho]);
    // Chaves que a "Sugerir divisão" colocou no rascunho — só ELAS podem ser desfeitas
    // quando o operador tira uma carga da divisão. O que ele moveu à mão é dele.
    const chavesDaSugestao = useRef(new Set());

    const tempoParadaMin = Math.max(0, Number(params.tempoParadaMin) || 0);

    // ── Quem participa da sugestão automática ──
    const foraSet = useMemo(() => new Set(foraDaDivisao), [foraDaDivisao]);
    const cargasParticipantes = useMemo(
        () => (dados?.cargas || []).filter(c => !foraSet.has(c.id)),
        [dados, foraSet]
    );

    // ── Carregar o dia ──
    // `limparRascunho` separa QUEM chamou:
    //  • sem o flag (efeito da tela, troca de PERÍODO DE ENTREGA) → o rascunho é
    //    PRESERVADO e só podado. O controle de período fica na mesma caixa, uma linha
    //    acima da data: uma seta do FiltroPeriodo apagava 12 alterações em silêncio.
    //    As cargas do dia são exatamente as mesmas — não há razão técnica para descartar.
    //  • com o flag (depois de aplicar com sucesso e depois de um 409) → o rascunho é
    //    ZERADO. Preservar ali faria a alteração já gravada reaparecer como pendente.
    const carregar = useCallback(async ({ limparRascunho = false } = {}) => {
        const requisicao = ++requisicaoMapa.current;
        setCarregando(true);
        setErroCarregamento(null);
        try {
            const r = await mapaExpedicaoService.mapa({
                data,
                entregaDe: periodoEntrega.de,
                entregaAte: periodoEntrega.ate
            });
            if (requisicao !== requisicaoMapa.current) return;
            setDados(r);
            setEstimApi(null);
            setAvisos([]);
            setSelecionado(null);
            // A seleção "participa da divisão" NÃO é zerada aqui: este `carregar` roda
            // também quando o operador só mexe no PERÍODO DE ENTREGA (o controle fica na
            // mesma caixa, uma linha acima do botão) — e aí as cargas do dia são as mesmas,
            // só muda quais pedidos livres aparecem. Zerar ali apagava em silêncio a
            // proteção da carga dedicada e o "Sugerir" despejava rateio nela.
            // Quem zera é a troca da DATA DO EMBARQUE (`trocarData`), aí sim as cargas são outras.
            // Aqui só descartamos id de carga que não existe mais no dia recarregado.
            const idsDoDia = new Set((r.cargas || []).map(c => c.id));
            setForaDaDivisao(prev => prev.filter(id => idsDoDia.has(id)));
            if (limparRascunho) {
                setRascunho({});
                chavesDaSugestao.current = new Set();
                return;
            }
            // Poda (mesma régua da marcação acima): some do rascunho só o item que
            // deixou de existir no dia recarregado — saiu do período e não está em
            // carga nenhuma. E NUNCA calado: se algo saiu, o operador é avisado.
            const chavesDoDia = new Set(
                [...(r.entregas || []), ...(r.amostras || []), ...(r.cobrancas || []), ...(r.semGps || [])]
                    .map(raw => normalizarItem(raw).chave)
            );
            const podadas = Object.keys(rascunhoRef.current).filter(ch => !chavesDoDia.has(ch));
            if (podadas.length) {
                setRascunho(prev => {
                    const nx = { ...prev };
                    podadas.forEach(ch => { delete nx[ch]; });
                    return nx;
                });
                podadas.forEach(ch => chavesDaSugestao.current.delete(ch));
                toast(
                    podadas.length === 1
                        ? '1 item que você tinha mexido ficou fora do período escolhido — essa alteração foi descartada. O resto do rascunho continua aqui.'
                        : `${podadas.length} itens que você tinha mexido ficaram fora do período escolhido — essas alterações foram descartadas. O resto do rascunho continua aqui.`,
                    { icon: '✂️', duration: 9000 }
                );
            }
        } catch (e) {
            if (requisicao !== requisicaoMapa.current) return;
            setDados(null);
            setErroCarregamento('Não deu para carregar o mapa das entregas. Verifique a conexão e tente de novo.');
        } finally {
            if (requisicao === requisicaoMapa.current) setCarregando(false);
        }
    }, [data, periodoEntrega.de, periodoEntrega.ate]);
    useEffect(() => { carregar(); }, [carregar]);

    // ── Itens do dia (pedidos + amostras + cobranças), dedup por chave ──
    const todas = useMemo(() => {
        const m = new Map();
        const add = (raw) => {
            const it = normalizarItem(raw);
            if (!m.has(it.chave)) m.set(it.chave, it);
        };
        (dados?.entregas || []).forEach(add);
        (dados?.amostras || []).forEach(add);
        (dados?.cobrancas || []).forEach(add);
        (dados?.semGps || []).forEach(add);
        return [...m.values()];
    }, [dados]);
    const semLocalizacao = useMemo(() => todas.filter(e => !e.gps), [todas]);

    // ── Rascunho: onde cada item está AGORA na tela ──
    const embarqueEfetivo = useCallback(
        (p) => (temChave(rascunho, p.chave) ? rascunho[p.chave] : (p.embarqueId ?? null)),
        [rascunho]
    );
    const mudancas = useMemo(
        () => todas.filter(p => temChave(rascunho, p.chave) && rascunho[p.chave] !== (p.embarqueId ?? null)),
        [todas, rascunho]
    );

    // Marcar/desmarcar "participa da divisão".
    // Ao TIRAR a carga da divisão, desfazemos no rascunho o que a SUGESTÃO tinha
    // mandado para ela (os itens voltam para onde estavam). Sem isso o gesto mais
    // natural do operador — rodar "Sugerir", ver entrega indevida na carga dedicada e
    // desmarcá-la para consertar — não consertava nada: o rascunho continuava
    // apontando para a carga e o Confirmar movia os itens para lá, enquanto o cartão
    // afirmava "a sugestão automática não mexe nesta carga".
    // SÓ o que a sugestão pôs (`chavesDaSugestao`): o que o operador moveu À MÃO para
    // esta carga fica onde ele pôs — desmarcar é justamente como ele PROTEGE a carga
    // dedicada, e antes esse gesto puxava de volta a entrega que ele mesmo tinha
    // colocado, com o toast culpando "o rascunho".
    const alternarParticipacao = useCallback((id) => {
        const saindoDaDivisao = !foraSet.has(id);
        setForaDaDivisao(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
        if (!saindoDaDivisao) return;
        const postosPelaSugestao = todas.filter(p => (
            chavesDaSugestao.current.has(p.chave)
            && temChave(rascunho, p.chave)
            && rascunho[p.chave] === id
            && rascunho[p.chave] !== (p.embarqueId ?? null)
        ));
        if (!postosPelaSugestao.length) return;
        setRascunho(prev => {
            const nx = { ...prev };
            postosPelaSugestao.forEach(p => { delete nx[p.chave]; });
            return nx;
        });
        postosPelaSugestao.forEach(p => chavesDaSugestao.current.delete(p.chave));
        toast(
            postosPelaSugestao.length === 1
                ? '1 entrega que a sugestão automática tinha colocado nesta carga voltou para onde estava. O que você moveu à mão continua como está.'
                : `${postosPelaSugestao.length} entregas que a sugestão automática tinha colocado nesta carga voltaram para onde estavam. O que você moveu à mão continua como está.`,
            { icon: '↩️', duration: 7000 }
        );
    }, [foraSet, todas, rascunho]);

    // ── Grupos por cliente (TODOS os itens do cliente andam juntos, mesmo os
    // sem posição — regra do dono: mover leva tudo). Pino só para quem tem gps. ──
    const gruposCliente = useMemo(() => {
        const m = new Map();
        todas.forEach(p => {
            const k = chaveCliente(p);
            if (!m.has(k)) {
                m.set(k, {
                    chave: k,
                    clienteNome: p.clienteNome,
                    cidade: p.cidade,
                    endereco: p.endereco,
                    itens: []
                });
            }
            const g = m.get(k);
            g.itens.push(p);
            if (!g.cidade && p.cidade) g.cidade = p.cidade;
            if (!g.endereco && p.endereco) g.endereco = p.endereco;
        });
        // posição do pino: prefere ponto GPS confirmado a posição pelo endereço
        m.forEach(g => {
            const conf = g.itens.find(i => i.gps && i.origemGps !== 'endereco') || g.itens.find(i => i.gps) || null;
            g.gps = conf?.gps || null;
            g.origemGps = conf?.origemGps;
        });
        return [...m.values()];
    }, [todas]);
    const gruposComPino = useMemo(() => gruposCliente.filter(g => g.gps), [gruposCliente]);

    // "Sem localização": UM cartão por CLIENTE/local (antes o .map rodava por item e
    // repetia o mesmo seletor duas vezes para quem tinha 2 itens sem GPS).
    const gruposSemLocalizacao = useMemo(() => {
        const vistos = new Set();
        const out = [];
        semLocalizacao.forEach(p => {
            const k = chaveCliente(p);
            if (vistos.has(k)) return;
            vistos.add(k);
            const grupo = gruposCliente.find(gr => gr.chave === k);
            out.push({
                chave: k,
                grupo,
                representante: p,
                clienteNome: grupo?.clienteNome ?? p.clienteNome,
                cidade: grupo?.cidade ?? p.cidade,
                semGps: (grupo?.itens || [p]).filter(i => !i.gps)
            });
        });
        return out;
    }, [semLocalizacao, gruposCliente]);

    // O app usa BrowserRouter (roteador declarativo), no qual useBlocker não é
    // suportado. Protegemos os links desta tela e o fechamento/reload do navegador
    // sem depender do Data Router.
    const confirmarSaida = useCallback((e) => {
        if (!mudancas.length) return;
        if (!window.confirm('Há alterações de carga ainda não aplicadas. Deseja sair e descartar o rascunho?')) {
            e.preventDefault();
        }
    }, [mudancas.length]);
    useEffect(() => {
        const avisarSaida = (e) => {
            if (!mudancas.length) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', avisarSaida);
        return () => window.removeEventListener('beforeunload', avisarSaida);
    }, [mudancas.length]);

    const trocarData = (proximaData) => {
        const novaData = proximaData || hojeISO();
        if (novaData === data) return;
        if (mudancas.length && !window.confirm('Há alterações de carga ainda não aplicadas. Deseja mudar o dia e descartar o rascunho?')) return;
        // Outro dia = outras cargas: a marcação "participa da divisão" recomeça com
        // TODAS marcadas (id de carga não se repete entre os dias).
        setForaDaDivisao([]);
        // Quem zera o rascunho é a troca de DATA (o `carregar` só poda) — e só depois
        // do "sim" acima. Trocar o período de entrega não passa por aqui.
        setRascunho({});
        chavesDaSugestao.current = new Set();
        setEstimApi(null);
        setAvisos([]);
        setCriterioSugestao(null);
        setData(novaData);
    };

    // porCarga / semCarga / apagar — cobrança tirada da carga NÃO vira "sem carga":
    // o backend faz hard delete do registro (mesma régua do DELETE /cobrancas-rota/:id).
    // Contá-la em "Sem carga" prometia que ela continuaria por ali.
    const grupos = useMemo(() => {
        const porCarga = {};
        (dados?.cargas || []).forEach(c => { porCarga[c.id] = []; });
        const semCarga = [];
        const apagar = [];
        todas.forEach(p => {
            const eid = embarqueEfetivo(p);
            if (eid != null && porCarga[eid]) porCarga[eid].push(p);
            else if (p.tipoItem === 'cobranca' && temChave(rascunho, p.chave) && rascunho[p.chave] == null) apagar.push(p);
            else semCarga.push(p);
        });
        return { porCarga, semCarga, apagar };
    }, [dados, todas, embarqueEfetivo, rascunho]);

    // Cobranças que o Confirmar vai APAGAR (irreversível pelo mapa).
    const cobrancasApagadas = grupos.apagar;

    const corDaCarga = useCallback((eid) => {
        if (eid == null) return COR_SEM_CARGA;
        const i = (dados?.cargas || []).findIndex(c => c.id === eid);
        return i >= 0 ? CORES[i % CORES.length] : COR_SEM_CARGA;
    }, [dados]);

    // "14 pedidos · 2 amostras · 1 cobrança" (bonificação/especial contam como pedidos)
    const contagemTipos = (ps) => {
        const nPed = ps.filter(p => p.tipoPayload === 'pedido').length;
        const nAmo = ps.filter(p => p.tipoItem === 'amostra').length;
        const nCob = ps.filter(p => p.tipoItem === 'cobranca').length;
        const partes = [];
        if (nPed) partes.push(`${nPed} ${nPed === 1 ? 'pedido' : 'pedidos'}`);
        if (nAmo) partes.push(`${nAmo} ${nAmo === 1 ? 'amostra' : 'amostras'}`);
        if (nCob) partes.push(`${nCob} ${nCob === 1 ? 'cobrança' : 'cobranças'}`);
        return partes.length ? partes.join(' · ') : '0 itens';
    };

    // Uma PARADA por cliente (mesmo com vários itens); posição = a melhor do cliente.
    const paradasPorCliente = useCallback((ps) => {
        const m = new Map();
        ps.forEach(p => {
            const k = chaveCliente(p);
            const atual = m.get(k);
            const melhor = !atual ? p
                : (!atual.gps && p.gps) ? p
                : (atual.gps && atual.origemGps === 'endereco' && p.gps && p.origemGps !== 'endereco') ? p
                : atual;
            m.set(k, melhor);
        });
        const reps = [...m.values()];
        return { pontos: reps.filter(r => r.gps).map(r => r.gps), nParadas: reps.length };
    }, []);

    // ── Estimativas: locais (≈) sempre; as da API valem enquanto o arranjo não mudar ──
    const montarChave = useCallback((porCargaChaves) => JSON.stringify({
        g: (dados?.cargas || []).map(c => [String(c.id), (porCargaChaves[c.id] || []).map(String).sort()]),
        h: params.horaSaida,
        t: String(tempoParadaMin)
    }), [dados, params.horaSaida, tempoParadaMin]);

    const chaveEstim = useMemo(() => {
        const ids = {};
        Object.entries(grupos.porCarga).forEach(([eid, ps]) => { ids[eid] = ps.map(p => p.chave); });
        return montarChave(ids);
    }, [grupos, montarChave]);

    const estimativas = useMemo(() => {
        // A sugestão só devolve números das cargas que participaram; a carga deixada
        // de fora continua com a estimativa local (≈) em vez de ficar sem linha nenhuma.
        const daApi = (estimApi && estimApi.chave === chaveEstim) ? estimApi.grupos : null;
        const out = {};
        (dados?.cargas || []).forEach(c => {
            const ps = grupos.porCarga[c.id] || [];
            if (!ps.length) return;
            if (daApi?.[c.id]) { out[c.id] = daApi[c.id]; return; }
            const { pontos, nParadas } = paradasPorCliente(ps);
            out[c.id] = estimativaLocal(dados?.base, pontos, nParadas, params.horaSaida, tempoParadaMin);
        });
        return out;
    }, [estimApi, chaveEstim, dados, grupos, paradasPorCliente, params.horaSaida, tempoParadaMin]);

    // ── Mover UM item (só rascunho — nada grava) ──
    const mover = useCallback((item, valorSel) => {
        if (item.travado) {
            toast('Este item já saiu para entrega — não pode mais trocar de carga.', { icon: '🔒' });
            return;
        }
        if (valorSel === MISTO) return;
        const destino = valorSel === SEM_CARGA
            ? null
            : ((dados?.cargas || []).find(c => String(c.id) === String(valorSel))?.id ?? null);
        // Mexeu à mão: a entrada passa a ser do operador, não da sugestão.
        chavesDaSugestao.current.delete(item.chave);
        setRascunho(prev => {
            const nx = { ...prev };
            if (destino === (item.embarqueId ?? null)) delete nx[item.chave];
            else nx[item.chave] = destino;
            return nx;
        });
    }, [dados]);

    // ── Mover o CONJUNTO do cliente (regra do dono: vai tudo junto) ──
    const moverGrupo = useCallback((g, valorSel) => {
        if (valorSel === MISTO) return;
        const moviveis = g.itens.filter(i => !i.travado);
        if (!moviveis.length) {
            toast('Tudo deste cliente já saiu para entrega — não pode mais trocar de carga.', { icon: '🔒' });
            return;
        }
        const destino = valorSel === SEM_CARGA
            ? null
            : ((dados?.cargas || []).find(c => String(c.id) === String(valorSel))?.id ?? null);
        moviveis.forEach(p => chavesDaSugestao.current.delete(p.chave)); // passou a ser movimento à mão
        setRascunho(prev => {
            const nx = { ...prev };
            moviveis.forEach(p => {
                if (destino === (p.embarqueId ?? null)) delete nx[p.chave];
                else nx[p.chave] = destino;
            });
            return nx;
        });
    }, [dados]);

    // Troca dois conjuntos inteiros no rascunho (pedidos + amostras + cobranças —
    // nada fica para trás). Não altera motorista/carga nem grava nada.
    const trocarRotas = useCallback((origemId, destinoId) => {
        if (!origemId || !destinoId || origemId === destinoId) return;
        const daOrigem = (grupos.porCarga[origemId] || []).filter(p => !p.travado);
        const doDestino = (grupos.porCarga[destinoId] || []).filter(p => !p.travado);
        if (!daOrigem.length && !doDestino.length) {
            toast('Não há itens que possam ser trocados entre essas rotas.', { icon: 'ℹ️' });
            return;
        }
        [...daOrigem, ...doDestino].forEach(p => chavesDaSugestao.current.delete(p.chave)); // troca é gesto do operador
        setRascunho(prev => {
            const nx = { ...prev };
            for (const p of daOrigem) {
                if (p.embarqueId === destinoId) delete nx[p.chave];
                else nx[p.chave] = destinoId;
            }
            for (const p of doDestino) {
                if (p.embarqueId === origemId) delete nx[p.chave];
                else nx[p.chave] = origemId;
            }
            return nx;
        });
        setEstimApi(null);
        setCriterioSugestao(null);
        setAvisos([]);
        toast('Rotas trocadas no rascunho. Confira e confirme para gravar.', { icon: '↔️' });
    }, [grupos]);

    // Grupos vindos do backend (sugestão): formato novo `itens: [{ tipo, id }]`
    // ou antigo `pedidoIds: []`.
    const itensDoGrupo = (g) => (
        Array.isArray(g.itens) && g.itens.length
            ? g.itens.map(i => `${i.tipo}:${i.id}`)
            : (g.pedidoIds || []).map(id => `pedido:${id}`)
    );

    // ── Sugerir divisão (carrega a proposta como rascunho) ──
    const sugerir = async () => {
        if (!dados?.cargas?.length) {
            toast('Monte as cargas do dia no Painel de Expedição antes de pedir a sugestão.', { icon: '🚚' });
            return;
        }
        // Só as cargas marcadas dividem as entregas. As de fora nem são enviadas —
        // o backend não carrega os itens delas, então nada nelas é lido nem movido.
        const idsParticipantes = cargasParticipantes.map(c => c.id);
        const nFora = dados.cargas.length - idsParticipantes.length;
        if (!idsParticipantes.length) {
            toast('Escolha ao menos uma carga para dividir — marque "participa da divisão" no cartão da carga.', { icon: '☑️', duration: 7000 });
            return;
        }
        setSugerindo(true);
        try {
            const r = await mapaExpedicaoService.sugerirDivisao({
                data,
                entregaDe: periodoEntrega.de,
                entregaAte: periodoEntrega.ate,
                embarqueIds: idsParticipantes,
                horaSaida: params.horaSaida,
                tempoParadaMin
            });
            const nx = {};
            (r.grupos || []).forEach(g => itensDoGrupo(g).forEach(ch => {
                const p = todas.find(t => t.chave === ch);
                if (!p || p.travado) return; // travado fica onde está
                if ((p.embarqueId ?? null) !== g.embarqueId) nx[ch] = g.embarqueId;
            }));
            // Guarda o que a SUGESTÃO criou (antes das preservações abaixo): é esse
            // conjunto — e só ele — que "tirar a carga da divisão" pode desfazer.
            const criadasPelaSugestao = new Set(Object.keys(nx));
            // O que o operador mexeu À MÃO envolvendo carga FORA da divisão fica como ele
            // deixou, nos DOIS sentidos:
            //  • para DENTRO — item livre que ele pôs na carga dedicada;
            //  • para FORA — item GRAVADO na carga dedicada que ele tirou de lá à mão.
            // Vai por ÚLTIMO de propósito: para o backend esses itens ainda estão como
            // estavam gravados (o rascunho não gravou nada), então sem esta sobreposição o
            // `setRascunho(nx)` apagava o movimento manual em silêncio — no sentido "para
            // fora" o item voltava calado para a carga protegida. Combina com o que a tela
            // promete: "a sugestão não mexe nessa carga, nem no que você colocou ou tirou dela".
            const cargasComNumeroVencido = new Set(); // cargas cujos números da API já não valem
            let nPreservados = 0;
            Object.entries(rascunho).forEach(([ch, destino]) => {
                const p = todas.find(t => t.chave === ch);
                if (!p || p.travado) return;
                const gravadaEmCargaFora = p.embarqueId != null && foraSet.has(p.embarqueId);
                const destinoCargaFora = destino != null && foraSet.has(destino);
                if (!gravadaEmCargaFora && !destinoCargaFora) return;
                if (destino === (p.embarqueId ?? null)) return; // não é mudança nenhuma
                const ondeASugestaoPos = temChave(nx, ch) ? nx[ch] : (p.embarqueId ?? null);
                if (ondeASugestaoPos === destino) return;       // a sugestão já concordava
                // Carga que perde o item aqui e carga que o recebe: os km/horário que o
                // backend calculou já não valem para elas. Ficam sem número da API e caem
                // na estimativa local "≈" (honesta) até "Recalcular preciso".
                if (ondeASugestaoPos != null) cargasComNumeroVencido.add(ondeASugestaoPos);
                if (destino != null) cargasComNumeroVencido.add(destino);
                nx[ch] = destino;
                criadasPelaSugestao.delete(ch);
                nPreservados++;
            });
            setRascunho(nx);
            chavesDaSugestao.current = criadasPelaSugestao;
            setAvisos(r.avisos || []);
            // guarda os números da sugestão presos a este arranjo
            const porCargaChaves = {};
            todas.forEach(p => {
                const eid = temChave(nx, p.chave) ? nx[p.chave] : (p.embarqueId ?? null);
                if (eid != null) (porCargaChaves[eid] = porCargaChaves[eid] || []).push(p.chave);
            });
            const gm = {};
            (r.grupos || []).forEach(g => {
                // Carga de onde tiramos item para devolver a uma carga fora da divisão:
                // os km/horário que o backend calculou já não valem para ela. Fica sem
                // número da API e cai na estimativa local "≈" (honesta) até o operador
                // clicar em "Recalcular preciso".
                if (cargasComNumeroVencido.has(g.embarqueId)) return;
                gm[g.embarqueId] = {
                    distanciaKm: g.distanciaKm, duracaoMin: g.duracaoMin,
                    previsaoRetorno: g.previsaoRetorno, precisao: g.precisao || 'aproximada',
                    trajeto: g.trajeto || []
                };
            });
            setEstimApi({ chave: montarChave(porCargaChaves), grupos: gm });
            // guarda quem participou DESTA sugestão (o operador pode mexer nas caixas depois)
            setCriterioSugestao(r.criterio ? { ...r.criterio, nParticipantes: idsParticipantes.length, nFora } : null);
            const baseToast = idsParticipantes.length === 1
                ? 'Sugestão pronta com UMA carga participando — tudo o que estava livre foi para ela. Confira antes de confirmar.'
                : 'Sugestão pronta — confira as linhas das rotas antes de confirmar.';
            const sufixoPreservado = nPreservados
                ? (nPreservados === 1
                    ? ' A mudança que você fez à mão envolvendo carga fora da divisão foi mantida.'
                    : ` As ${nPreservados} mudanças que você fez à mão envolvendo carga fora da divisão foram mantidas.`)
                : '';
            toast.success(
                `${baseToast}${sufixoPreservado}`,
                (idsParticipantes.length === 1 || nPreservados) ? { duration: 9000 } : undefined
            );
        } catch (e) {
            if (e.response?.status === 423) toast('Outro cálculo de rota está em andamento — aguarde um instante e tente de novo.', { icon: '⏳', duration: 6000 });
            else toast.error(mensagemErro(e, 'Não deu para montar a sugestão agora. Tente de novo.'));
        } finally {
            setSugerindo(false);
        }
    };

    // ── Recalcular preciso (uma chamada, nunca a cada arrasto) ──
    const recalcular = async () => {
        const gruposPayload = (dados?.cargas || [])
            .map(c => {
                const ps = grupos.porCarga[c.id] || [];
                return {
                    embarqueId: c.id,
                    // formato novo (tipos) + antigo (só pedidos) para compatibilidade
                    itens: ps.map(p => ({ tipo: p.tipoPayload, id: p.itemId })),
                    pedidoIds: ps.filter(p => p.tipoPayload === 'pedido').map(p => p.itemId)
                };
            })
            .filter(g => g.itens.length);
        if (!gruposPayload.length) {
            toast('Nenhum item dentro das cargas para calcular.', { icon: 'ℹ️' });
            return;
        }
        setRecalculando(true);
        try {
            const r = await mapaExpedicaoService.estimarRotas({
                grupos: gruposPayload,
                horaSaida: params.horaSaida,
                tempoParadaMin
            });
            const gm = {};
            (r.grupos || []).forEach(g => {
                gm[g.embarqueId] = {
                    distanciaKm: g.distanciaKm, duracaoMin: g.duracaoMin,
                    previsaoRetorno: g.previsaoRetorno, precisao: g.precisao || 'aproximada',
                    trajeto: g.trajeto || []
                };
            });
            setEstimApi({ chave: chaveEstim, grupos: gm });
            setAvisos(r.avisos || []);
            if (r.avisos?.length) toast('Cálculo concluído com avisos — confira o painel.', { icon: '⚠️' });
        } catch (e) {
            if (e.response?.status === 423) toast('Outro cálculo de rota está em andamento — aguarde um instante e tente de novo.', { icon: '⏳', duration: 6000 });
            else toast.error(mensagemErro(e, 'Não deu para calcular as rotas precisas agora — os números aproximados (≈) continuam valendo.'));
        } finally {
            setRecalculando(false);
        }
    };

    // Acha o item da tela a partir de um conflito do backend (formato novo
    // { tipo, id }, antigo { pedidoId } ou o id cru).
    const acharItemConflito = useCallback((c) => {
        if (c == null) return null;
        if (typeof c === 'object') {
            if (c.tipo != null && c.id != null) {
                return todas.find(t => t.chave === `${c.tipo}:${c.id}`)
                    || todas.find(t => t.tipoPayload === c.tipo && String(t.itemId) === String(c.id));
            }
            if (c.pedidoId != null) return todas.find(t => t.chave === `pedido:${c.pedidoId}`);
            return null;
        }
        return todas.find(t => t.chave === `pedido:${c}`);
    }, [todas]);

    // ── Confirmar / Descartar ──
    // Confirmar é um PORTÃO: se alguma cobrança vai ser apagada, pede confirmação
    // explícita antes (não dá para desfazer pelo mapa — só pelo "Inserir Cobrança"
    // na tela da carga). Sem cobrança apagada, aplica direto como antes.
    const confirmar = () => {
        if (!mudancas.length || aplicando) return;
        if (cobrancasApagadas.length) { setConfirmandoApagar(true); return; }
        aplicar();
    };

    const aplicar = async () => {
        if (!mudancas.length || aplicando) return;
        setConfirmandoApagar(false);
        const nApagadas = cobrancasApagadas.length;
        setAplicando(true);
        try {
            await mapaExpedicaoService.aplicarDivisao({
                // formato novo com tipo; pedidoId vai junto nos pedidos por compatibilidade
                atribuicoes: mudancas.map(p => ({
                    tipo: p.tipoPayload,
                    id: p.itemId,
                    ...(p.tipoPayload === 'pedido' ? { pedidoId: p.itemId } : {}),
                    embarqueId: rascunho[p.chave]
                })),
                esperado: mudancas.map(p => ({
                    tipo: p.tipoPayload,
                    id: p.itemId,
                    ...(p.tipoPayload === 'pedido' ? { pedidoId: p.itemId } : {}),
                    embarqueIdAtual: p.embarqueId ?? null
                }))
            });
            toast.success(
                nApagadas
                    ? `Divisão aplicada. ${nApagadas === 1 ? '1 cobrança foi apagada' : `${nApagadas} cobranças foram apagadas`} — para trazer de volta, use "Inserir Cobrança" na tela da carga.`
                    : 'Divisão aplicada nas cargas.',
                nApagadas ? { duration: 9000 } : undefined
            );
            // Aplicado: o rascunho ZERA (se fosse preservado, o que acabou de ser gravado
            // reapareceria como pendente na recarga).
            await carregar({ limparRascunho: true });
        } catch (e) {
            if (e.response?.status === 409) {
                // O 409 cobre TRÊS causas diferentes (item sumiu · mudou de carga · mudou de
                // situação: entrega já entregue, amostra entregue, cobrança registrada na rua).
                // Cada conflito vem com a causa REAL pronta em `frase` (e em `motivo`), e
                // `data.error` é o texto completo montado pelo backend. Dizer "foi movido por
                // outro operador" em todos os casos mandava o operador procurar um colega que
                // não existe — essa frase só vale para o conflito de mudança de carga.
                const conflitos = Array.isArray(e.response.data?.conflitos) ? e.response.data.conflitos : [];
                const textoBackend = typeof e.response.data?.error === 'string' ? e.response.data.error.trim() : '';
                const descrever = (c) => {
                    if (!c || typeof c !== 'object') return '';
                    const cliente = c.cliente || acharItemConflito(c)?.clienteNome || '';
                    const frase = typeof c.frase === 'string' ? c.frase.trim() : '';
                    if (frase) return cliente ? `${frase.replace(/\s*\.\s*$/, '')} (${cliente}).` : frase;
                    const alvo = [c.etiqueta || c.pedido, cliente].filter(Boolean).join(' ');
                    const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : '';
                    if (!motivo) return alvo ? `${alvo} mudou desde que a tela foi carregada.` : '';
                    return `${alvo ? `${alvo}: ` : ''}${motivo}${/[.!?]$/.test(motivo) ? '' : '.'}`;
                };
                const frases = conflitos.map(descrever).filter(Boolean);
                // Uma instrução só no fim: quando usamos o texto do backend ele JÁ termina com
                // "Nada foi aplicado — recarregue o mapa e tente de novo." (não concatenar outra).
                const restantes = frases.length > 2 ? frases.length - 2 : 0;
                toast.error(
                    frases.length
                        ? `${frases.slice(0, 2).join(' ')}${restantes ? ` E mais ${restantes === 1 ? '1 item mudou' : `${restantes} itens mudaram`}.` : ''} Nada foi aplicado. O mapa foi recarregado — confira e confirme de novo.`
                        : textoBackend
                            || 'O arranjo mudou desde que a tela foi carregada. Nada foi aplicado. O mapa foi recarregado — confira e confirme de novo.',
                    { duration: 9000 }
                );
                // 409: nada foi aplicado, mas o arranjo de baixo mudou — o rascunho velho
                // não vale mais. Zera junto com a recarga (a mensagem acima já avisou).
                await carregar({ limparRascunho: true });
            } else if (Array.isArray(e.response?.data?.bloqueados) && e.response.data.bloqueados.length) {
                // 400 com a lista do que travou: [{ pedido: '#743', cliente, motivo }] (o
                // backend pode mandar também o cliente; senão, buscamos no que a tela já tem).
                const linhas = e.response.data.bloqueados.map(b => {
                    const etiq = b?.pedido || b?.etiqueta || String(b);
                    const cliente = b?.cliente || b?.clienteNome
                        || todas.find(t => t.etiqueta === etiq)?.clienteNome;
                    return `${etiq}${cliente ? ` ${cliente}` : ''}${b?.motivo ? ` (${b.motivo})` : ''}`;
                });
                toast.error(
                    `Nada foi aplicado. Não remanejados: ${linhas.join(' · ')}. Tire ${linhas.length === 1 ? 'esse item' : 'esses itens'} da mudança e confirme de novo.`,
                    { duration: 12000 }
                );
            } else {
                toast.error(mensagemErro(e, 'Não deu para aplicar a divisão. Nada foi alterado — tente de novo.'));
            }
        } finally {
            setAplicando(false);
        }
    };
    const descartar = () => {
        setRascunho({});
        chavesDaSugestao.current = new Set();
        setEstimApi(null);
        setAvisos([]);
        setCriterioSugestao(null);
        toast('Alterações descartadas — o mapa voltou ao que está salvo.', { icon: '↩️' });
    };

    // ── Leaflet ──
    const mapRef = useRef(null);
    const mapObj = useRef(null);
    const marcadores = useRef({});
    const baseMarker = useRef(null);
    const linhasRotas = useRef([]);
    const ajustouPara = useRef(null);

    useEffect(() => {
        if (!mapRef.current || mapObj.current) return;
        const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
            .setView([-25.9, -49.2], 8);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        map.on('click', () => setSelecionado(null));
        mapObj.current = map;
        // A barra lateral pode alargar a área principal. Leaflet precisa ser
        // avisado da nova largura para redesenhar sem ficar sob o menu.
        const observarTamanho = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        observarTamanho.observe(mapRef.current);
        return () => {
            observarTamanho.disconnect();
            map.remove();
            mapObj.current = null;
            marcadores.current = {};
            baseMarker.current = null;
            linhasRotas.current = [];
        };
    }, []);

    // Pinos por CLIENTE (recriados a cada mudança de dados/rascunho — poucos por dia, é barato)
    useEffect(() => {
        const map = mapObj.current;
        if (!map || !dados) return;

        if (baseMarker.current) { baseMarker.current.remove(); baseMarker.current = null; }
        if (dados.base?.lat != null) {
            baseMarker.current = L.marker([dados.base.lat, dados.base.lng], {
                icon: L.divIcon({
                    className: '',
                    html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">⭐</div>',
                    iconSize: [26, 26], iconAnchor: [13, 13]
                }),
                zIndexOffset: 500
            }).addTo(map).bindTooltip('Hardt Salgados — saída das cargas');
        }

        Object.values(marcadores.current).forEach(m => m.remove());
        marcadores.current = {};
        gruposComPino.forEach(g => {
            // cor do círculo = carga do 1º item (se o cliente estiver repartido em
            // cargas diferentes, os badges e o cartão mostram a situação)
            const eidPino = embarqueEfetivo(g.itens[0]);
            const cor = corDaCarga(eidPino);
            // carga fora da divisão continua no mapa (com pino e cor), só esmaecida —
            // o operador precisa VER onde estão as entregas dela e poder mexer à mão
            const cargaFora = eidPino != null && foraSet.has(eidPino);
            const todosTravados = g.itens.every(i => i.travado);
            const mudou = g.itens.some(i => temChave(rascunho, i.chave) && rascunho[i.chave] !== (i.embarqueId ?? null));
            const aproximado = g.origemGps === 'endereco';
            // bolinha cheia = ponto GPS confirmado; anel tracejado com "≈" = posição pelo endereço
            const estilo = aproximado
                ? `background:#fff;border:2.5px dashed ${cor};color:${cor};`
                : `background:${cor};border:2.5px solid #fff;color:#fff;`;
            const conteudo = todosTravados ? '🔒' : (g.itens.length > 1 ? String(g.itens.length) : (aproximado ? '≈' : ''));
            // badges dos tipos: pino só com pedido normal fica limpo (o mais comum);
            // qualquer outro tipo presente aparece marcado (P junto, quando há mistura)
            const tipos = ORDEM_TIPOS.filter(t => g.itens.some(i => i.tipoItem === t));
            const soPedido = tipos.length === 1 && tipos[0] === 'pedido';
            const chip = (bg, fg, texto) =>
                `<span style="background:${bg};color:${fg};border:1px solid rgba(0,0,0,.18);` +
                `border-radius:999px;font-size:9px;font-weight:800;line-height:1;padding:2px 4px;` +
                `box-shadow:0 1px 2px rgba(0,0,0,.35);white-space:nowrap">${texto}</span>`;
            // Carga fora da divisão: marcação CATEGÓRICA ("FORA"), não só o esmaecido.
            // Esmaecido sozinho (opacity .6) era indistinguível do pino travado (.55) —
            // quem olhava só o mapa via pino claro sem saber por quê. O chip não some no
            // esmaecido (a opacidade fica no círculo, não nele) nem briga com o anel
            // dourado de "movido no rascunho".
            const chipsPino = [
                ...(cargaFora ? [chip('#e5e7eb', '#374151', 'FORA')] : []),
                ...(soPedido ? [] : tipos.map(t => chip(BADGE_TIPO[t].bg, BADGE_TIPO[t].fg, BADGE_TIPO[t].t)))
            ];
            const badges = chipsPino.length
                ? `<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;margin-top:2px">${chipsPino.join('')}</div>`
                : '';
            const html = `<div style="display:flex;flex-direction:column;align-items:center;width:56px">` +
                `<div style="width:26px;height:26px;border-radius:50%;${estilo}` +
                `box-shadow:0 1px 4px rgba(0,0,0,.45);${todosTravados ? 'opacity:.55;' : cargaFora ? 'opacity:.6;' : ''}` +
                `${mudou ? 'outline:3px solid #cba258;outline-offset:1px;' : ''}` +
                `display:flex;align-items:center;justify-content:center;font-size:${todosTravados ? '12px' : '13px'};font-weight:800;line-height:1">` +
                `${conteudo}</div>${badges}</div>`;
            const mk = L.marker([g.gps.lat, g.gps.lng], {
                icon: L.divIcon({ className: '', html, iconSize: [56, badges ? 46 : 26], iconAnchor: [28, 13] }),
                keyboard: false
            }).addTo(map).on('click', () => setSelecionado(g.chave));
            marcadores.current[g.chave] = mk;
        });
    }, [dados, gruposComPino, rascunho, corDaCarga, embarqueEfetivo, foraSet]);

    // Trajetos devolvidos pelo roteirizador: tornam visível por que um ponto
    // pertence a uma carga, em vez de mostrar apenas cores soltas no mapa.
    useEffect(() => {
        const map = mapObj.current;
        if (!map) return;
        linhasRotas.current.forEach(linha => linha.remove());
        linhasRotas.current = [];
        if (!estimApi || estimApi.chave !== chaveEstim) return;
        (dados?.cargas || []).forEach((c, i) => {
            const trajeto = estimApi.grupos?.[c.id]?.trajeto || [];
            if (trajeto.length < 2) return;
            linhasRotas.current.push(L.polyline(
                trajeto.map(p => [p.lat, p.lng]),
                { color: CORES[i % CORES.length], weight: 4, opacity: 0.72 }
            ).addTo(map));
        });
    }, [estimApi, chaveEstim, dados]);

    // Enquadrar o dia uma vez por carga de dados
    useEffect(() => {
        const map = mapObj.current;
        if (!map || !dados || ajustouPara.current === data) return;
        const pts = gruposComPino.map(g => [g.gps.lat, g.gps.lng]);
        if (dados.base?.lat != null) pts.push([dados.base.lat, dados.base.lng]);
        if (pts.length) {
            map.fitBounds(L.latLngBounds(pts).pad(0.15));
            ajustouPara.current = data;
        }
    }, [dados, gruposComPino, data]);

    // ── Peças de UI ──
    const sel = selecionado != null ? gruposCliente.find(g => g.chave === selecionado) : null;
    const focarCliente = useCallback((g) => {
        setSelecionado(g.chave);
        if (g.gps && mapObj.current) mapObj.current.flyTo([g.gps.lat, g.gps.lng], Math.max(mapObj.current.getZoom(), 14));
    }, []);

    // `key` sempre presente: o badge é usado dentro de .map() (lista de tipos do cliente)
    // e sem ela o React reclama "Each child in a list should have a unique key" a cada
    // render. Como o tipo não repete na mesma lista, ele serve de chave; fora de lista
    // o React simplesmente ignora.
    const badgeTipo = (tipoItem, extra = '') => {
        const d = BADGE_TIPO[tipoItem] || BADGE_TIPO.pedido;
        return (
            <span key={tipoItem} className={`px-1.5 py-0.5 text-[10px] font-extrabold rounded-full shrink-0 ${d.cls} ${extra}`}>
                {d.t}
            </span>
        );
    };

    // ⚠️ NUNCA envolver estas <option> num Fragment (<>…</>)!
    // O SelectBusca lê os filhos com React.Children.forEach, que ACHATA ARRAY mas NÃO
    // ACHATA FRAGMENT — um Fragment não é 'option' nem 'optgroup' e é descartado inteiro,
    // deixando TODOS os menus "Mover para…" vazios ("Nada encontrado."). Já aconteceu.
    // Por isso este helper devolve um ARRAY de elementos (cada um com `key`).
    // Para cobrança, "tirar da carga" APAGA o registro (hard delete no backend) —
    // o rótulo tem que dizer isso, senão parece reversível como no pedido.
    const opcoesCargas = (temCobranca = false) => ([
        ...(dados?.cargas || []).map(c => (
            <option key={`carga-${c.id}`} value={String(c.id)}>
                Carga #{c.numero}{c.responsavel?.nome ? ` — ${c.responsavel.nome}` : ''}
            </option>
        )),
        <option key="sem-carga" value={SEM_CARGA}>
            {temCobranca ? 'Tirar da carga (apaga a cobrança)' : 'Tirar da carga (sem carga)'}
        </option>
    ]);

    const seletorMover = (p, larga = 'w-full') => (
        <SelectBusca
            value={embarqueEfetivo(p) == null ? SEM_CARGA : String(embarqueEfetivo(p))}
            onChange={e => mover(p, e.target.value)}
            className={larga}
        >
            {opcoesCargas(p.tipoItem === 'cobranca')}
        </SelectBusca>
    );

    // Um seletor só para o CONJUNTO do cliente: escolher o destino move todos os
    // itens não-travados juntos.
    const seletorMoverGrupo = (g) => {
        const moviveis = g.itens.filter(i => !i.travado);
        const efetivos = [...new Set(moviveis.map(i => {
            const e = embarqueEfetivo(i);
            return e == null ? SEM_CARGA : String(e);
        }))];
        const valor = efetivos.length === 1 ? efetivos[0] : MISTO;
        const temCobranca = moviveis.some(i => i.tipoItem === 'cobranca');
        return (
            <SelectBusca value={valor} onChange={e => moverGrupo(g, e.target.value)} className="w-full">
                {valor === MISTO && <option value={MISTO} disabled>Itens em cargas diferentes — escolha o destino</option>}
                {opcoesCargas(temCobranca)}
            </SelectBusca>
        );
    };

    const linhaEstimativa = (est) => {
        if (!est) return null;
        const atrasada = est.previsaoRetorno && hhmmParaMin(est.previsaoRetorno) > hhmmParaMin(REF_RETORNO);
        return (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-gray-600">
                    {fmtKm(est.distanciaKm) != null ? `${fmtKm(est.distanciaKm)} km` : '— km'} · {fmtDur(est.duracaoMin) || '—'}
                </span>
                {est.previsaoRetorno && (
                    atrasada
                        ? <span className="font-semibold text-amber-700">volta prevista {est.previsaoRetorno} · ref. {REF_RETORNO}</span>
                        : <span className="text-gray-600">volta prevista {est.previsaoRetorno}</span>
                )}
                {est.precisao === 'osrm'
                    ? <span className="px-1.5 py-0.5 rounded-full bg-mint text-primaryDark font-semibold">preciso</span>
                    : <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">≈ aproximado</span>}
            </div>
        );
    };

    // Esc fecha o aviso de apagar cobrança (mesmo efeito de "Cancelar"). Não fecha
    // enquanto está aplicando — o clique já foi dado, sair no meio confunde.
    useEffect(() => {
        if (!confirmandoApagar) return;
        const aoTeclar = (ev) => {
            if (ev.key === 'Escape' && !aplicando) {
                ev.stopPropagation();
                setConfirmandoApagar(false);
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [confirmandoApagar, aplicando]);

    // Aviso antes de apagar cobrança. Vai em portal no <body> porque o contêiner do
    // mapa é `isolate` (prende os z-index do Leaflet) — dentro dele o diálogo ficaria
    // atrás do menu lateral da página.
    const dialogoApagarCobrancas = (!confirmandoApagar || !cobrancasApagadas.length) ? null : createPortal(
        <div
            className="fixed inset-0 z-[2000] bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-apagar-cobrancas"
            onClick={() => setConfirmandoApagar(false)}
        >
            <div
                className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl p-4 md:p-5 max-h-[85dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-2.5 mb-3">
                    <span className="bg-red-100 p-2 rounded-lg shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                    </span>
                    <div className="min-w-0">
                        <h2 id="titulo-apagar-cobrancas" className="text-base md:text-lg font-bold text-gray-900">
                            {cobrancasApagadas.length === 1
                                ? '1 cobrança será apagada'
                                : `${cobrancasApagadas.length} cobranças serão apagadas`}
                        </h2>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Tirar cobrança da carga não é o mesmo que tirar um pedido: o registro é
                            apagado e <strong>não volta pelo mapa</strong>. Para recolocar, use o botão
                            “Inserir Cobrança” na tela da carga.
                        </p>
                    </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg divide-y divide-red-100 mb-4 max-h-48 overflow-y-auto">
                    {cobrancasApagadas.map(c => (
                        <div key={c.chave} className="flex items-center gap-2 px-3 py-2">
                            <Trash2 className="h-3.5 w-3.5 text-red-600 shrink-0" />
                            <span className="text-xs text-red-900 font-medium truncate flex-1">
                                {c.clienteNome || 'Cliente'}{c.etiqueta ? ` · ${c.etiqueta}` : ''}
                            </span>
                            {c.valorTotal != null && (
                                <span className="text-xs font-semibold text-red-900 shrink-0">{fmtBRL(c.valorTotal)}</span>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setConfirmandoApagar(false)}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm min-h-[44px]"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={aplicar}
                        disabled={aplicando}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {cobrancasApagadas.length === 1 ? 'Apagar e aplicar' : 'Apagar as cobranças e aplicar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );

    // Painel lateral (desktop) / bottom-sheet (celular) — renderizado uma vez só
    const toqueY = useRef(null);
    const suprimirClique = useRef(false);

    const selTravados = sel ? sel.itens.filter(i => i.travado) : [];
    const selMoviveis = sel ? sel.itens.filter(i => !i.travado) : [];
    const selComValor = sel ? sel.itens.filter(i => i.valorTotal != null) : [];

    return (
        <div className="relative z-0 isolate w-full max-w-full px-3 md:px-0 py-3 md:py-6 overflow-x-hidden">
            {dialogoApagarCobrancas}
            {/* Topbar */}
            <div className="flex items-center justify-between gap-2 bg-white p-3 md:p-4 rounded-t-xl shadow-sm border border-gray-200 border-b-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-sky-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <MapIcon className="h-4 w-4 md:h-5 md:w-5 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Mapa das entregas</h1>
                        <p className="text-xs text-gray-500 hidden sm:block">
                            Embarque {dataBR(data)} · pedidos com entrega de {dataBR(periodoEntrega.de)} até {dataBR(periodoEntrega.ate)}
                        </p>
                    </div>
                </div>
                <Link
                    to="/admin/embarques"
                    onClick={confirmarSaida}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm min-h-[44px]"
                >
                    <Truck className="h-4 w-4" />
                    <span className="hidden sm:inline">Painel de expedição</span>
                    <span className="sm:hidden">Painel</span>
                </Link>
            </div>

            {/* Corpo: mapa + painel */}
            {/* z-0 + isolate: prende os z-index internos do Leaflet (panes 200–700,
                controles 1000) e dos overlays/legenda/bottom-sheet desta tela dentro
                deste contêiner — para a página, tudo isso vale z-0. Sem isso eles
                competem com o menu lateral (z-50) e forçariam gambiarra de z lá. */}
            <div className="relative z-0 isolate flex flex-col md:flex-row bg-white border border-gray-200 rounded-b-xl shadow-sm overflow-hidden h-[calc(100dvh-170px)] min-h-[440px]">
                {/* Mapa */}
                <div className="relative flex-1 min-w-0">
                    <div ref={mapRef} className="absolute inset-0" />

                    {carregando && (
                        <div className="absolute inset-0 z-[1060] bg-white/70 flex items-center justify-center">
                            <div className="flex items-center gap-2 text-gray-600 text-sm font-medium">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando as entregas do dia…
                            </div>
                        </div>
                    )}

                    {erroCarregamento && !carregando && (
                        <div className="absolute inset-0 z-[1060] bg-white/90 flex items-center justify-center p-6" role="alert">
                            <div className="max-w-sm text-center">
                                <p className="text-sm text-gray-700 mb-3">{erroCarregamento}</p>
                                <button type="button" onClick={carregar} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm min-h-[44px]">
                                    Tentar novamente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Banner do rascunho */}
                    {mudancas.length > 0 && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1040] flex items-center gap-1.5 bg-white rounded-full border border-amber-300 shadow-lg pl-3 pr-1.5 py-1 max-w-[calc(100%-16px)]">
                            <span className="text-xs font-semibold text-amber-800 whitespace-nowrap">
                                {mudancas.length === 1 ? '1 alteração não aplicada' : `${mudancas.length} alterações não aplicadas`}
                            </span>
                            <button
                                onClick={confirmar}
                                disabled={aplicando}
                                className="px-3 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold min-h-[40px] flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {aplicando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Confirmar
                            </button>
                            <button
                                onClick={descartar}
                                disabled={aplicando}
                                className="px-2.5 py-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 text-xs font-medium min-h-[40px] disabled:opacity-60"
                            >
                                Descartar
                            </button>
                        </div>
                    )}

                    {/* Legenda */}
                    <div className="absolute bottom-6 left-2 z-[1000] bg-white/95 rounded-lg border border-gray-200 shadow-sm px-2.5 py-2 space-y-1 text-[10px] leading-tight text-gray-700">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#00754A', border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }} />
                            ponto GPS confirmado
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0 bg-white" style={{ border: '1.5px dashed #00754A' }} />
                            pelo endereço (aproximado)
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COR_SEM_CARGA, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }} />
                            sem carga
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0 flex items-center justify-center text-white font-extrabold text-[8px]" style={{ background: '#00754A', border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }}>2</span>
                            nº de itens do cliente (vão juntos)
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="flex gap-0.5 shrink-0">
                                <span className="px-1 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[8px] leading-3 border border-black/10">BN</span>
                                <span className="px-1 rounded-full bg-purple-100 text-purple-700 font-extrabold text-[8px] leading-3 border border-black/10">ZZ</span>
                            </span>
                            bonificação · especial
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="px-1 rounded-full bg-amber-100 text-amber-700 font-extrabold text-[8px] leading-3 border border-black/10 shrink-0">A</span>
                            amostra
                            <span className="px-1 rounded-full bg-green-100 text-green-800 font-extrabold text-[8px] leading-3 border border-black/10 shrink-0">$</span>
                            cobrança
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Lock className="w-3 h-3 text-gray-500 shrink-0" />
                            já saiu — não move
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="px-1 rounded-full bg-gray-200 text-gray-700 font-extrabold text-[8px] leading-3 border border-black/10 shrink-0">FORA</span>
                            carga fora da divisão automática
                        </div>
                    </div>

                    {/* Cartão do pino selecionado (cliente + tudo que vai para ele) */}
                    {sel && (
                        <div className="absolute bottom-16 left-3 right-3 md:bottom-auto md:top-3 md:right-3 md:left-auto md:w-80 z-[1050] bg-white rounded-xl border border-gray-200 shadow-lg p-3">
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm truncate">{sel.clienteNome || 'Cliente'}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {sel.itens.length === 1
                                            ? `${sel.itens[0].etiqueta || sel.itens[0].numero || ''}${sel.cidade ? ` · ${sel.cidade}` : ''}`
                                            : `${sel.itens.length} itens para este cliente${sel.cidade ? ` · ${sel.cidade}` : ''}`}
                                    </p>
                                </div>
                                <button aria-label="Fechar detalhes da entrega" onClick={() => setSelecionado(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Item a item: tipo, etiqueta, valor (quando houver), cadeado */}
                            <div className="mb-2 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                                {sel.itens.map(i => (
                                    <div key={i.chave} className="flex items-center gap-2 py-1.5">
                                        {badgeTipo(i.tipoItem)}
                                        <span className="text-xs text-gray-700 truncate flex-1">
                                            {NOME_TIPO[i.tipoItem] || 'Item'}{i.etiqueta || i.numero ? ` ${i.etiqueta || i.numero}` : ''}
                                        </span>
                                        {i.valorTotal != null && (
                                            <span className="text-xs font-semibold text-gray-700 shrink-0">{fmtBRL(i.valorTotal)}</span>
                                        )}
                                        {i.travado && <Lock className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
                                    </div>
                                ))}
                                {selComValor.length > 1 && (
                                    <div className="flex items-center justify-between gap-2 py-1.5">
                                        <span className="text-xs text-gray-500">Total</span>
                                        <span className="text-xs font-bold text-gray-900">
                                            {fmtBRL(selComValor.reduce((s, i) => s + (Number(i.valorTotal) || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {sel.endereco && <p className="text-xs text-gray-500 mb-2">{sel.endereco}</p>}
                            {sel.origemGps === 'endereco' && (
                                <p className="text-[11px] text-gray-500 mb-2">
                                    📍 posição pelo endereço do cadastro (aproximada) — o ponto GPS ainda não foi confirmado
                                </p>
                            )}

                            {selMoviveis.length === 0 ? (
                                <div className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-lg px-3 py-2 flex items-start gap-1.5">
                                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>Tudo deste cliente já saiu para entrega — fica na carga onde está.</span>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-1">
                                        Mover para… {sel.itens.length > 1 ? '(leva tudo junto)' : ''}
                                    </p>
                                    {seletorMoverGrupo(sel)}
                                    {selTravados.length > 0 && (
                                        <p className="mt-1.5 text-[11px] text-gray-500 flex items-start gap-1">
                                            <Lock className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span>
                                                {selTravados.length === 1 ? 'O item com cadeado já saiu para entrega e fica' : 'Os itens com cadeado já saíram para entrega e ficam'} fora da mudança.
                                            </span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Painel lateral (desktop) / bottom-sheet (celular) */}
                <div
                    className={`absolute md:static bottom-0 left-0 right-0 z-[1100] md:z-auto md:w-[380px] md:shrink-0 md:h-full
                        bg-white md:border-l md:border-gray-200 rounded-t-2xl md:rounded-none
                        shadow-[0_-8px_24px_rgba(0,0,0,.18)] md:shadow-none flex flex-col
                        max-h-[75%] md:max-h-none transition-transform duration-200 will-change-transform
                        ${sheetAberta ? 'translate-y-0' : 'translate-y-[calc(100%-56px)]'} md:translate-y-0`}
                >
                    {/* Alça (só celular): toque abre/fecha; arrastar também funciona */}
                    <button
                        type="button"
                        className="md:hidden w-full flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[44px] touch-none"
                        onTouchStart={e => { toqueY.current = e.touches[0].clientY; }}
                        onTouchEnd={e => {
                            if (toqueY.current == null) return;
                            const dy = e.changedTouches[0].clientY - toqueY.current;
                            toqueY.current = null;
                            if (Math.abs(dy) > 30) { setSheetAberta(dy < 0); suprimirClique.current = true; }
                        }}
                        onClick={() => {
                            if (suprimirClique.current) { suprimirClique.current = false; return; }
                            setSheetAberta(v => !v);
                        }}
                    >
                        <span className="w-10 h-1.5 rounded-full bg-gray-300" />
                        <span className="text-xs font-semibold text-gray-600">
                            {sheetAberta ? 'Fechar painel' : `Cargas e ajustes${mudancas.length ? ` · ${mudancas.length} pendente${mudancas.length > 1 ? 's' : ''}` : ''}`}
                        </span>
                    </button>

                    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
                        {/* Dia + parâmetros */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Embarque e pedidos</p>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="col-span-2 text-sm font-medium text-gray-700">
                                    Data do embarque
                                    <input
                                        type="date"
                                        value={data}
                                        onChange={e => trocarData(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                                <div className="col-span-2">
                                    <p className="text-sm font-medium text-gray-700 mb-1">Período de entrega dos pedidos</p>
                                    <FiltroPeriodo
                                        periodo={periodoEntrega}
                                        controle={periodoEntregaCtl}
                                        rotulo="Entrega"
                                        ocultarPresets={['todo']}
                                        className="w-full"
                                    />
                                    <p className="mt-1.5 text-xs text-gray-600">
                                        Mostra pedidos livres com entrega nesse período e os que já estão nas cargas deste embarque — junto com amostras e cobranças do dia.
                                    </p>
                                </div>
                                <label className="text-sm font-medium text-gray-700">
                                    Hora de saída
                                    <input
                                        type="time"
                                        value={params.horaSaida}
                                        onChange={e => setParams({ ...params, horaSaida: e.target.value || '08:00' })}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                                <label className="text-sm font-medium text-gray-700">
                                    Min por parada
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={params.tempoParadaMin}
                                        onChange={e => setParams({ ...params, tempoParadaMin: e.target.value })}
                                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    />
                                </label>
                            </div>
                            <div className="mt-3 space-y-2">
                                <button
                                    onClick={sugerir}
                                    disabled={sugerindo || carregando}
                                    className="w-full px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                                >
                                    {sugerindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    {sugerindo ? 'Montando sugestão…' : 'Sugerir divisão'}
                                </button>
                                <button
                                    onClick={recalcular}
                                    disabled={recalculando || carregando}
                                    className="w-full px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-60"
                                >
                                    {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RouteIcon className="h-4 w-4" />}
                                    {recalculando ? 'Calculando rotas…' : 'Recalcular preciso'}
                                </button>
                                {/* Quem entra no rateio automático (o "Recalcular preciso" estima
                                    TODAS as cargas — inclusive as que estão fora da divisão). */}
                                {(dados?.cargas || []).length > 0 && (
                                    cargasParticipantes.length === 0 ? (
                                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                            Nenhuma carga está marcada para participar — escolha ao menos uma em “Cargas do dia”, abaixo.
                                        </p>
                                    ) : cargasParticipantes.length === dados.cargas.length ? (
                                        <p className="text-xs text-gray-600">
                                            {dados.cargas.length === 1
                                                ? 'Só há uma carga no dia — tudo o que estiver livre vai para ela.'
                                                : `A sugestão divide entre as ${dados.cargas.length} cargas do dia. Desmarque no cartão a que não deve entrar.`}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-600">
                                            A sugestão divide entre {cargasParticipantes.length} de {dados.cargas.length} cargas —{' '}
                                            {dados.cargas.length - cargasParticipantes.length === 1
                                                ? 'a desmarcada fica como está'
                                                : 'as desmarcadas ficam como estão'}.
                                        </p>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Avisos da sugestão */}
                        {avisos.length > 0 && (
                            <div className="text-[13px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5 space-y-1">
                                {avisos.map((a, i) => <p key={i} className="m-0">⚠️ {String(a)}</p>)}
                            </div>
                        )}

                        {criterioSugestao && estimApi?.chave === chaveEstim && (
                            <div className="text-[13px] bg-blue-50 border border-blue-200 text-blue-950 rounded-lg px-3 py-2.5 space-y-1.5">
                                <p className="font-semibold m-0">Como a sugestão foi montada</p>
                                <p className="m-0">{criterioSugestao.principal}.</p>
                                {criterioSugestao.nParticipantes != null && (
                                    <p className="m-0 text-blue-900">
                                        {criterioSugestao.nParticipantes === 1
                                            ? 'Participou 1 carga: tudo o que estava livre foi para ela.'
                                            : `Participaram ${criterioSugestao.nParticipantes} cargas.`}
                                        {criterioSugestao.nFora > 0 && (
                                            criterioSugestao.nFora === 1
                                                ? ' 1 carga ficou fora da divisão e não foi alterada.'
                                                : ` ${criterioSugestao.nFora} cargas ficaram fora da divisão e não foram alteradas.`
                                        )}
                                    </p>
                                )}
                                <p className="m-0 text-blue-900">
                                    Considera: {(criterioSugestao.considera || []).join(', ')}.
                                </p>
                                <p className="m-0 text-blue-900">
                                    Não considera: {(criterioSugestao.naoConsidera || []).join(', ')}.
                                </p>
                                <p className="m-0 font-medium">As linhas coloridas mostram o trajeto calculado de cada carga.</p>
                            </div>
                        )}

                        {/* Cartões por carga */}
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">Cargas do dia</p>
                            {(dados?.cargas || []).length === 0 && !carregando && (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-sm text-gray-500">
                                    Nenhuma carga montada para este dia.{' '}
                                    <Link to="/admin/embarques" onClick={confirmarSaida} className="text-primary font-semibold">Montar cargas no painel</Link>.
                                </div>
                            )}
                            {(dados?.cargas || []).map((c, i) => {
                                const ps = grupos.porCarga[c.id] || [];
                                const est = ps.length ? estimativas[c.id] : null;
                                const outrasCargas = (dados?.cargas || []).filter(outra => outra.id !== c.id);
                                const destinoId = trocaDestino[c.id] || outrasCargas[0]?.id || '';
                                const foiImpressa = Number(c.ultimaImpressaoVersao) > 0;
                                const reimprimir = foiImpressa && Number(c.versao) > Number(c.ultimaImpressaoVersao);
                                const participa = !foraSet.has(c.id);
                                return (
                                    <div
                                        key={c.id}
                                        className={`rounded-xl border shadow-sm p-3 ${participa ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-300'}`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: CORES[i % CORES.length] }} />
                                            <span className="font-semibold text-gray-900 text-sm truncate flex-1">
                                                Carga #{c.numero}{c.responsavel?.nome ? ` · ${c.responsavel.nome}` : ''}
                                            </span>
                                            <span className="text-xs text-gray-500 shrink-0 text-right">
                                                {contagemTipos(ps)}
                                            </span>
                                        </div>
                                        {linhaEstimativa(est)}

                                        {/* Participa (ou não) do rateio automático. Desmarcada, a carga
                                            continua no mapa e recebe item pelo "Mover para…" — só a
                                            sugestão automática deixa de mexer nela.
                                            A caixa usa `accent-[#00754A]` (padrão do projeto): este projeto
                                            NÃO tem o plugin @tailwindcss/forms, então `text-primary` só
                                            definiria `color` e a caixa sairia azul, fora do tema. */}
                                        <div className="mt-1 flex items-center justify-between gap-2">
                                            <label className="flex items-center gap-2 min-h-[44px] flex-1 min-w-0 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={participa}
                                                    onChange={() => alternarParticipacao(c.id)}
                                                    className="h-5 w-5 shrink-0 accent-[#00754A]"
                                                />
                                                <span className={`text-xs font-medium truncate ${participa ? 'text-gray-700' : 'text-gray-600'}`}>
                                                    Participa da divisão
                                                </span>
                                            </label>
                                            {!participa && (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 shrink-0">
                                                    fora da divisão
                                                </span>
                                            )}
                                        </div>
                                        {!participa && (
                                            <p className="-mt-1 mb-1 text-[11px] text-gray-600">
                                                A sugestão automática não mexe nesta carga, nem no que você colocar nela ou tirar dela à mão. Ela continua
                                                no mapa (pinos com a marca <span className="px-1 rounded-full bg-gray-200 text-gray-700 font-extrabold text-[9px] leading-3 border border-black/10">FORA</span>) e
                                                aceita item pelo “Mover para…”.
                                            </p>
                                        )}
                                        {outrasCargas.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                                <p className="text-xs text-gray-600 mb-1.5">Trocar tudo desta rota (pedidos, amostras e cobranças) com</p>
                                                <div className="flex gap-1.5">
                                                    <SelectBusca
                                                        value={destinoId}
                                                        onChange={e => setTrocaDestino(prev => ({ ...prev, [c.id]: e.target.value }))}
                                                        className="min-w-0 flex-1"
                                                    >
                                                        {outrasCargas.map(outra => (
                                                            <option key={outra.id} value={outra.id}>
                                                                Carga #{outra.numero}{outra.responsavel?.nome ? ` · ${outra.responsavel.nome}` : ''}
                                                            </option>
                                                        ))}
                                                    </SelectBusca>
                                                    <button
                                                        type="button"
                                                        onClick={() => trocarRotas(c.id, destinoId)}
                                                        className="shrink-0 px-3 py-2 rounded-full bg-white border border-primary text-primary hover:bg-mint/40 text-xs font-semibold flex items-center justify-center gap-1 min-h-[44px]"
                                                    >
                                                        <ArrowLeftRight className="h-3.5 w-3.5" /> Trocar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            {reimprimir && (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                                                    <Printer className="h-3 w-3" />
                                                    impressa na v{c.ultimaImpressaoVersao ?? 0} — reimprimir
                                                </span>
                                            )}
                                            {!foiImpressa && (
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                                                    <Printer className="h-3 w-3" /> ainda não impressa
                                                </span>
                                            )}
                                            <Link to="/admin/embarques" onClick={confirmarSaida} className="text-xs text-primary font-semibold hover:underline py-1.5">
                                                abrir carga
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Sem carga */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: COR_SEM_CARGA }} />
                                <span className="font-semibold text-gray-700 text-sm flex-1">Sem carga</span>
                                <span className="text-xs text-gray-500 text-right">
                                    {contagemTipos(grupos.semCarga)}
                                </span>
                            </div>

                            {/* Cobrança tirada da carga NÃO fica "sem carga": ela é apagada no Confirmar */}
                            {grupos.apagar.length > 0 && (
                                <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-3">
                                    <div className="flex items-center gap-2">
                                        <Trash2 className="h-3.5 w-3.5 text-red-600 shrink-0" />
                                        <span className="font-semibold text-red-800 text-sm flex-1">Serão apagadas</span>
                                        <span className="text-xs font-semibold text-red-700 text-right">
                                            {contagemTipos(grupos.apagar)}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-red-700">
                                        Cobrança tirada da carga é apagada ao confirmar — não volta pelo mapa.
                                        Para recolocar, use “Inserir Cobrança” na tela da carga.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Alternativa navegável aos marcadores do Leaflet — um item por CLIENTE. */}
                        {gruposComPino.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">Clientes no mapa</p>
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                    {gruposComPino.map(g => (
                                        <button
                                            key={g.chave}
                                            type="button"
                                            onClick={() => focarCliente(g)}
                                            aria-label={`Ver no mapa: ${g.clienteNome || 'Cliente'}${g.cidade ? `, ${g.cidade}` : ''}`}
                                            className="w-full min-h-[44px] px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                        >
                                            <span aria-hidden="true" className="w-3 h-3 rounded-full shrink-0" style={{ background: corDaCarga(embarqueEfetivo(g.itens[0])) }} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-gray-800 truncate">{g.clienteNome || 'Cliente'}</span>
                                                <span className="block text-xs text-gray-500 truncate">
                                                    {g.itens.map(i => i.etiqueta || i.numero || NOME_TIPO[i.tipoItem]).join(' · ')}{g.cidade ? ` · ${g.cidade}` : ''}
                                                </span>
                                            </span>
                                            <span aria-hidden="true" className="flex gap-0.5 shrink-0">
                                                {ORDEM_TIPOS.filter(t => t !== 'pedido' && g.itens.some(i => i.tipoItem === t)).map(t => badgeTipo(t))}
                                                {g.itens.length > 1 && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-gray-100 text-gray-600">{g.itens.length}</span>
                                                )}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sem localização (falhou GPS e endereço) — esses itens nunca somem da divisão */}
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1 flex items-center gap-1.5">
                                <MapPinOff className="h-3.5 w-3.5" /> Sem localização
                            </p>
                            {semLocalizacao.length === 0 ? (
                                <p className="text-xs text-gray-500 px-1">
                                    Todos os itens do dia têm posição no mapa (por GPS ou pelo endereço do cadastro).
                                </p>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-500 px-1">
                                        Sem ponto GPS e sem endereço localizável — atribua a carga aqui (eles entram na divisão normalmente).
                                    </p>
                                    {gruposSemLocalizacao.map(({ chave, grupo, representante, clienteNome, cidade, semGps }) => {
                                        const conjunto = grupo && grupo.itens.length > 1;
                                        const itensDoCliente = grupo ? grupo.itens : [representante];
                                        const moviveis = itensDoCliente.filter(i => !i.travado);
                                        return (
                                            <div key={chave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                                <p className="font-semibold text-gray-900 text-sm truncate">
                                                    {clienteNome || 'Cliente'}{cidade ? ` · ${cidade}` : ''}
                                                </p>

                                                {/* Itens sem posição, com o MOTIVO que o backend informou */}
                                                <div className="mt-1.5 mb-2 space-y-1.5">
                                                    {semGps.map(i => (
                                                        <div key={i.chave} className="flex items-start gap-1.5">
                                                            {badgeTipo(i.tipoItem, 'mt-0.5')}
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-xs text-gray-700 truncate">
                                                                    {NOME_TIPO[i.tipoItem] || 'Item'}{i.etiqueta || i.numero ? ` ${i.etiqueta || i.numero}` : ''}
                                                                </span>
                                                                {i.motivo && (
                                                                    <span className="block text-[11px] text-gray-500">{i.motivo}</span>
                                                                )}
                                                            </span>
                                                            {i.valorTotal != null && (
                                                                <span className="text-xs text-gray-500 shrink-0">{fmtBRL(i.valorTotal)}</span>
                                                            )}
                                                            {i.travado && <Lock className="h-3.5 w-3.5 text-gray-500 shrink-0 mt-0.5" />}
                                                        </div>
                                                    ))}
                                                </div>

                                                {moviveis.length === 0 ? (
                                                    <div className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-lg px-3 py-2 flex items-start gap-1.5">
                                                        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                        <span>Já saiu para entrega — fica na carga onde está.</span>
                                                    </div>
                                                ) : conjunto ? (
                                                    <div>
                                                        {seletorMoverGrupo(grupo)}
                                                        <p className="mt-1.5 text-[11px] text-gray-500">
                                                            Este cliente tem {grupo.itens.length} itens no dia — mover leva tudo junto.
                                                        </p>
                                                    </div>
                                                ) : seletorMover(representante)}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
