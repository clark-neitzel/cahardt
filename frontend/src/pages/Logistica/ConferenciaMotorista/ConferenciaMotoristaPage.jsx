import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { useFiltroSalvo } from '../../../hooks/useFiltrosSalvos';
import impressaoEtiquetasService from '../../../services/impressaoEtiquetasService';
import useSeparacaoCarga from '../SeparacaoCarga/useSeparacaoCarga';
import { CONFIG_CONFERENCIA } from '../SeparacaoCarga/config';
import { TEXTOS_CONFERENCIA } from '../SeparacaoCarga/textos';
import BarraCarga, { AvisosCarga, CartaoCarga, FaixaEtiquetas, juntarCargas } from '../SeparacaoCarga/BarraCarga';
import LinhaSeparacao from '../SeparacaoCarga/LinhaSeparacao';
import ListaPorPedido from '../SeparacaoCarga/ListaPorPedido';
import FicouFaltando from '../SeparacaoCarga/FicouFaltando';
import AvisoCargaMudou from '../SeparacaoCarga/AvisoCargaMudou';
import {
    celula, chavesDaCarga, classe, conta, faltas, fmtQtd, naoTocadas, ordenarPedidos, separado, todasChaves,
} from '../SeparacaoCarga/separacaoCalculo';
import '../SeparacaoCarga/separacaoCarga.css';

const LETRA_MIN = 15;
const LETRA_MAX = 29;   // D4: de 15 a 29 px, de 2 em 2
const LETRA_PADRAO = 17;

const corBarra = (p) => (p >= 100 ? '#22c55e' : p >= 80 ? '#facc15' : p >= 50 ? '#3b82f6' : '#ef4444');
const fmtFal = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const MOTIVO_TXT = { NAO_TEM: 'não tem', VEM_DEPOIS: 'vem depois' };
const sufixoMotivo = (m) => (MOTIVO_TXT[m] ? ` — ${MOTIVO_TXT[m]}` : '');

// "Separação avisou…": SÓ falta e motivo (o número separado nunca vem do servidor nem aparece aqui).
// Linha da carga inteira (c:X) lê porProduto[X]; linha de pedido (p:P:X) lê porPedidoProduto["P:X"];
// se a separação só marcou no nível do produto, mostra "Na carga faltam N deste produto".
function avisoDaLinha(avisos, chave) {
    if (!avisos || !chave) return null;
    const porProduto = avisos.porProduto || {};
    const porPP = avisos.porPedidoProduto || {};
    const txt = (a) => `${a.falta > 1 ? 'faltam' : 'falta'} ${fmtQtd(a.falta)}${sufixoMotivo(a.motivo)}`;
    if (chave.startsWith('c:')) {
        const a = porProduto[chave.slice(2)];
        return a && a.falta > 0 ? `Separação avisou: ${txt(a)}` : null;
    }
    if (chave.startsWith('p:')) {
        const [, pedidoId, produtoId] = chave.split(':');
        const a = porPP[`${pedidoId}:${produtoId}`];
        if (a && a.falta > 0) return `Separação avisou: ${txt(a)}`;
        const temNivelPedido = Object.keys(porPP).some((x) => x.endsWith(`:${produtoId}`));
        const g = porProduto[produtoId];
        if (!temNivelPedido && g && g.falta > 0) return `Na carga ${g.falta > 1 ? 'faltam' : 'falta'} ${fmtQtd(g.falta)} deste produto${sufixoMotivo(g.motivo)}`;
    }
    return null;
}

export default function ConferenciaMotoristaPage() {
    const [letraSalva, setLetraSalva] = useFiltroSalvo('conferencia-motorista:letra', LETRA_PADRAO);
    const [modo, setModo] = useFiltroSalvo('conferencia-motorista:modo', 'carga');
    const [impressoraSalva, setImpressoraSalva] = useFiltroSalvo(CONFIG_CONFERENCIA.chavePrefImpressora, '');
    const [soFalta, setSoFalta] = useState(false);   // NÃO persiste: volta desligado
    const [painel, setPainel] = useState(false);
    const [aberto, setAberto] = useState(null);      // pedido aberto (modo "Por pedido")
    const [confirmar, setConfirmar] = useState(null); // { nao } — aviso de linhas não tocadas
    const [impressoras, setImpressoras] = useState([]);
    const [impressorasProntas, setImpressorasProntas] = useState(false); // só envia etiqueta depois que a lista chegou
    const [erroImpressoras, setErroImpressoras] = useState(''); // falha PERMANENTE da lista (403/500…): motivo + "Tentar de novo"
    const [tentativaImp, setTentativaImp] = useState(0);
    const avisoRef = useRef(null);

    // Em tela estreita (320–375 px) letra 29 deixaria a barra fixa ocupando quase tudo: o tamanho EFETIVO é limitado
    // pela largura (a escolha salva continua a mesma e vale inteira em tablet/computador).
    const [largura, setLargura] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
    const [altura, setAltura] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
    useEffect(() => {
        const aoRedimensionar = () => { setLargura(window.innerWidth); setAltura(window.innerHeight); };
        window.addEventListener('resize', aoRedimensionar);
        return () => window.removeEventListener('resize', aoRedimensionar);
    }, []);
    const letraEscolhida = Math.max(LETRA_MIN, Math.min(LETRA_MAX, Number(letraSalva) || LETRA_PADRAO));
    const letra = Math.min(letraEscolhida, Math.max(LETRA_MIN, Math.floor((largura - 32) / 12.5)));
    // o BLOCO FIXO de cima (barra + etiquetas + andamento) usa uma letra menor que a lista: com A+ no máximo ele passaria
    // de metade da tela e esconderia a lista. Teto por altura da tela (só o cabeçalho; a lista segue com a letra escolhida).
    const letraFixo = Math.min(letra, altura < 600 ? 15 : altura < 760 ? 16 : 20);
    // com 1 impressora o servidor usa ela; com mais de uma, só vale a que o usuário escolheu (nunca assume a primeira calada)
    const impressora = impressoras.find((i) => i.id === impressoraSalva) || (impressoras.length === 1 ? impressoras[0] : null);
    const precisaEscolher = impressorasProntas && impressoras.length > 1 && !impressora;
    const h = useSeparacaoCarga({ config: CONFIG_CONFERENCIA, impressoraId: impressoras.length > 1 ? impressora?.id : undefined, impressorasProntas, precisaEscolherImpressora: precisaEscolher });
    const { carga, idx, estado, online } = h;

    // O index.css põe `overflow-x:hidden` no body, o que o transforma em "área de rolagem" e faz o sticky da barra
    // de cima NÃO grudar. Enquanto esta tela está aberta o body usa `clip` (não cria área de rolagem; continua sem
    // rolagem lateral). Restaura ao sair. Navegador sem suporte a `clip` ignora e fica como antes.
    useEffect(() => {
        const antes = document.body.style.overflowX;
        document.body.style.overflowX = 'clip';
        return () => { document.body.style.overflowX = antes; };
    }, []);

    // toque fora da barra fecha o painel
    useEffect(() => {
        if (!painel) return undefined;
        const fechar = () => setPainel(false);
        document.addEventListener('click', fechar);
        return () => document.removeEventListener('click', fechar);
    }, [painel]);

    // impressora de etiquetas (só com sinal e com carga aberta). Sem resposta (rede): tenta de novo sozinha.
    // Com resposta de erro (403/500…): para e mostra o motivo + "Tentar de novo" (a etiqueta não fica "esperando" calada).
    useEffect(() => {
        if (!carga || !online) return undefined;
        let vivo = true;
        let timer;
        const buscar = () => impressaoEtiquetasService.impressoras('CONFERENCIA')
            .then((l) => { if (vivo) { setImpressoras(Array.isArray(l) ? l : []); setImpressorasProntas(true); setErroImpressoras(''); } })
            .catch((e) => {
                if (!vivo) return;
                if (!e?.response) { timer = setTimeout(buscar, 20000); return; }
                const s = e.response.status;
                setErroImpressoras(s === 403
                    ? 'sem permissão para imprimir etiquetas de conferência.'
                    : (e.response.data?.error ? `a lista de impressoras falhou (${e.response.data.error}).` : `a lista de impressoras não carregou (erro ${s}).`));
            });
        buscar();
        return () => { vivo = false; clearTimeout(timer); };
    }, [carga?.id, online, tentativaImp]); // eslint-disable-line react-hooks/exhaustive-deps
    const recarregarImpressoras = () => { setErroImpressoras(''); setTentativaImp((n) => n + 1); };
    const irParaAviso = () => {
        setPainel(false);
        avisoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    const mudarLetra = (d) => setLetraSalva(Math.max(LETRA_MIN, Math.min(LETRA_MAX, letraEscolhida + d)));
    const escolherModo = (m) => { setModo(m); setSoFalta(false); setPainel(false); if (m === 'pedido') setAberto(null); };
    const escolherCarga = useCallback(async (id) => {
        setPainel(false);
        setAberto(null);
        await h.trocarCarga(id);
    }, [h]);

    const ordenados = useMemo(() => (carga ? ordenarPedidos(carga, estado.ordem) : []), [carga, estado.ordem]);
    const lista = useMemo(() => juntarCargas(h.cargas, h.baixadas), [h.cargas, h.baixadas]);

    // ───── sem carga aberta: escolher ─────
    if (!carga) {
        return (
            <div className="sepc py-3 md:p-6" style={{ fontSize: `${letra}px` }}>
                <div className="sepc-q">
                    <div className="pick">
                        <h3 style={{ display: 'flex', gap: '.4em', alignItems: 'center' }}><ClipboardCheck className="h-5 w-5" aria-hidden /> Conferir carga (motorista)</h3>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '.92em' }}>
                            {online
                                ? 'Escolha a carga. Abra ainda com sinal: o app baixa a carga para o aparelho e você pode conferir no caminhão sem internet.'
                                : 'Sem internet e nenhuma carga aberta. Se você baixou uma carga antes, escolha abaixo; senão, abra a carga com sinal antes de entrar na câmara.'}
                        </p>
                        {h.erroLista && <div className="aviso-e" style={{ margin: 0 }}>{h.erroLista}</div>}
                        {online && h.cargas === null && !h.erroLista && <p style={{ margin: 0, fontWeight: 700, display: 'flex', gap: '.4em', alignItems: 'center' }}><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procurando cargas…</p>}
                        {lista.map((c) => <CartaoCarga key={c.id} c={c} online={online} onEscolher={escolherCarga} />)}
                        {lista.length === 0 && (online ? h.cargas !== null : true) && !h.erroLista && (
                            <div className="vazio">{online ? 'Nenhuma carga para conferir agora.' : 'Sem internet e nenhuma carga baixada neste aparelho — abra a carga com sinal antes de entrar na câmara.'}</div>
                        )}
                        {h.abrindo && <p className="dica">Baixando a carga…</p>}
                        {online && <button type="button" className="big o" onClick={h.listar}>Atualizar lista</button>}
                    </div>
                </div>
            </div>
        );
    }

    // ───── andamento (sempre à vista) ─────
    const ksCarga = chavesDaCarga(carga);
    const pedidoAberto = modo === 'pedido' && aberto ? idx.pedidos.get(aberto) : null;
    const semPedidos = (carga.pedidos || []).length === 0;   // tudo foi entregue: nada mais a separar
    let txt; let pct; let vt = null;
    const falTxt = (r) => (r.fal ? <> · <span className="fal">falta {fmtFal(r.fal)}</span></> : null);
    if (semPedidos) {
        pct = 0;
        txt = <b>Sem pedido pendente</b>;
    } else if (modo === 'carga') {
        const r = conta(estado, idx, ksCarga); pct = r.pct;
        txt = <><b>{pct}%</b> · {r.ok} de {ksCarga.length} produtos{falTxt(r)}</>;
    } else if (pedidoAberto) {
        const ks = idx.porPedido.get(pedidoAberto.id) || [];
        const r = conta(estado, idx, ks); pct = r.pct;
        vt = <button type="button" className="vt" onClick={() => setAberto(null)} aria-label="Todos os pedidos">‹</button>;
        txt = <><span className="cl">{pedidoAberto.cliente}</span><small>{pct}% · {r.ok} de {ks.length}{falTxt(r)} · pedido {ordenados.indexOf(pedidoAberto) + 1} de {ordenados.length}</small></>;
    } else {
        const f = ordenados.filter((p) => { const ks = idx.porPedido.get(p.id) || []; return ks.length && ks.every((k) => classe(estado, idx, k) === 'ok'); }).length;
        pct = ordenados.length ? Math.round((f / ordenados.length) * 100) : 0;
        txt = <><b>{pct}%</b> · {f} de {ordenados.length} pedidos conferidos</>;
    }

    // ───── concluir ─────
    const chavesDoModo = modo === 'carga' ? ksCarga : todasChaves(idx).filter((k) => k.startsWith('p:'));
    const pedirConcluir = () => {
        const nao = naoTocadas(estado, idx, chavesDoModo);
        if (nao > 0) setConfirmar({ nao }); else fazerConcluir();
    };
    const fazerConcluir = () => {
        setConfirmar(null);
        h.concluir(modo === 'carga' ? 'CARGA' : 'PEDIDO');
        toast.success(`${CONFIG_CONFERENCIA.textos.concluido}${h.online ? '' : ' Será enviada quando o sinal voltar.'}`);
    };

    const avisoLinha = (k) => avisoDaLinha(carga.avisosSeparacao, k);
    const linhaProduto = (p) => {
        const k = h.chaveCarga(p.produtoId);
        const c = celula(estado, k);
        return (
            <LinhaSeparacao key={k} k={k} nome={p.nome} unidade={p.unidade} porCaixa={p.quantidadePorCaixa} pedir={idx.pedir.get(k)}
                sep={separado(estado, idx, k)} cl={classe(estado, idx, k)} tocada={c.t} motivo={c.m} h={h}
                textos={TEXTOS_CONFERENCIA} aviso={avisoLinha(k)} />
        );
    };

    const conc = estado.conclusao;
    return (
        <div className="sepc py-3 md:p-6" style={{ fontSize: `${letra}px` }}>
            <div className="sepc-q">
                <div className={`fixo ${painel ? 'ab' : ''}`} style={{ fontSize: `${letraFixo}px` }}>
                    <BarraCarga textos={TEXTOS_CONFERENCIA}
                        carga={carga} modo={modo} setModo={escolherModo} aberta={painel}
                        alternar={(e) => { e.stopPropagation(); setPainel((v) => !v); }}
                        online={online} pendentes={h.pendentes} sincronizando={h.sincronizando} lista={lista} onEscolher={escolherCarga}
                        letra={letra} mudarLetra={mudarLetra} prontoParaCamara={h.prontoParaCamara} semControladorSW={h.semControladorSW}
                        etiquetasN={h.etiquetas.reduce((t, e) => t + (e.bolsas || 0), 0)} memoriaCheia={h.memoriaCheia} erroServidor={h.erroServidor} irParaAviso={irParaAviso} erroLista={h.erroLista} abrindo={h.abrindo}
                    />
                    <div className="prog">
                        <div className="l1">
                            {vt}
                            <div className="txt">{txt}</div>
                            <button type="button" className={`so ${soFalta ? 'on' : ''}`} onClick={() => setSoFalta((v) => !v)}>Só o que falta</button>
                        </div>
                        <div className="bar"><i style={{ width: `${pct}%`, background: corBarra(pct) }} /></div>
                    </div>
                </div>

                <AvisosCarga avisoRef={avisoRef} memoriaCheia={h.memoriaCheia} erroServidor={h.erroServidor} pendentes={h.pendentes}
                    sincronizando={h.sincronizando} tentarDeNovo={h.tentarDeNovo} semControladorSW={h.semControladorSW} />
                <FaixaEtiquetas etiquetas={h.etiquetas} online={online} imprimirAgora={h.imprimirAgora}
                    impressoras={impressoras} impressoraId={impressora?.id || ''} setImpressoraId={setImpressoraSalva} precisaEscolher={precisaEscolher} erroImpressoras={erroImpressoras} recarregarImpressoras={recarregarImpressoras} />
                {carga.amostras?.total > 0 && (
                    <div className="aviso-a">Esta carga tem {carga.amostras.total} amostra{carga.amostras.total > 1 ? 's' : ''} — {TEXTOS_CONFERENCIA.amostraParte}.</div>
                )}
                {conc && (
                    <div className="conc">
                        Conferência concluída{conc.porNome ? ` por ${conc.porNome}` : ''}{conc.em ? ` em ${new Date(conc.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        {conc.local ? ' (ainda não enviada)' : ''}. Pode continuar ajustando e concluir de novo.
                    </div>
                )}

                {semPedidos ? (
                    <div className="vazio">
                        <p style={{ margin: '0 0 .8em' }}>Esta carga não tem mais pedido pendente de entrega.</p>
                        <button type="button" className="big" onClick={(e) => { e.stopPropagation(); setPainel(true); window.scrollTo({ top: 0 }); }}>Escolher outra carga</button>
                    </div>
                ) : modo === 'carga' ? (
                    <>
                        <div className="lst">
                            {carga.produtos.filter((p) => !soFalta || classe(estado, idx, h.chaveCarga(p.produtoId)) !== 'ok').map(linhaProduto)}
                            {soFalta && carga.produtos.every((p) => classe(estado, idx, h.chaveCarga(p.produtoId)) === 'ok') && <div className="vazio">Tudo conferido.</div>}
                        </div>
                        <div className="fim">
                            <FicouFaltando itens={faltas(estado, idx, ksCarga)} textos={TEXTOS_CONFERENCIA} />
                            <button type="button" className="big" onClick={pedirConcluir}>{TEXTOS_CONFERENCIA.concluirCarga}</button>
                        </div>
                    </>
                ) : (
                    <ListaPorPedido carga={carga} idx={idx} estado={estado} ordenados={ordenados} aberto={aberto} setAberto={setAberto}
                        soFalta={soFalta} h={h} onConcluir={pedirConcluir} aoAbrir={() => window.scrollTo({ top: 0 })}
                        textos={TEXTOS_CONFERENCIA} avisoLinha={avisoLinha} />
                )}
            </div>

            <AvisoCargaMudou mudou={h.dados.mudou} onOk={h.confirmarMudanca} textos={TEXTOS_CONFERENCIA} />
            {confirmar && (
                <div className="mdl-f" role="dialog" aria-modal="true" aria-label="Concluir conferência">
                    <div className="mdl">
                        <h3>Concluir a conferência?</h3>
                        <p style={{ margin: 0, fontWeight: 700 }}>
                            {confirmar.nao} {confirmar.nao > 1 ? 'produtos ainda não foram tocados' : 'produto ainda não foi tocado'}. Eles contam como "não conferidos".
                        </p>
                        <div className="bt">
                            <button type="button" className="big o" onClick={() => setConfirmar(null)}>Voltar e conferir</button>
                            <button type="button" className="big" onClick={fazerConcluir}>Concluir mesmo assim</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
