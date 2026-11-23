import SelectBusca from '../../../components/SelectBusca';
import { TEXTOS_SEPARACAO } from './textos';

const dataBr = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
};
const plural = (n, a, b) => (n === 1 ? a : b);

// Lista de cargas para trocar/escolher: as do servidor (online) + as já baixadas neste aparelho (offline).
export function juntarCargas(cargas, baixadas) {
    const mapa = new Map();
    (baixadas || []).forEach((c) => mapa.set(c.id, { ...c, baixada: true }));
    (cargas || []).forEach((c) => mapa.set(c.id, { ...(mapa.get(c.id) || {}), ...c, baixada: !!mapa.get(c.id)?.baixada }));
    return [...mapa.values()].sort((a, b) => String(a.dataSaida).localeCompare(String(b.dataSaida)) || (a.numero - b.numero));
}

export function CartaoCarga({ c, ativa, onEscolher, online }) {
    const desabilitada = !online && !c.baixada;
    return (
        <button type="button" className={`cg ${ativa ? 'on' : ''}`} disabled={desabilitada} onClick={() => onEscolher(c.id)}>
            <b>Carga #{c.numero}{c.baixada ? ' · no aparelho' : ''}</b>
            <span>{[c.motorista, c.dataSaida ? `sai ${dataBr(c.dataSaida)}` : '', c.totalPedidos != null ? `${c.totalPedidos} ${plural(c.totalPedidos, 'pedido', 'pedidos')}` : ''].filter(Boolean).join(' · ')}</span>
        </button>
    );
}

// Barra fixa em cima: carga (encolhida) + painel (trocar carga, modo, letra, internet).
export default function BarraCarga({
    carga, modo, setModo, aberta, alternar, fechar, online, pendentes, sincronizando, lista, onEscolher, letra, mudarLetra, prontoParaCamara,
    semControladorSW, memoriaCheia, erroServidor, erroLista, abrindo, irParaAviso, etiquetasN = 0, textos = TEXTOS_SEPARACAO,
}) {
    const modoTxt = modo === 'carga' ? 'Carga inteira' : 'Por pedido';
    const guardados = pendentes ? `${pendentes} toque${pendentes > 1 ? 's' : ''} guardado${pendentes > 1 ? 's' : ''} no aparelho` : 'tudo guardado no aparelho';
    const estadoTxt = erroServidor
        ? `envio parado${pendentes ? ` · ${pendentes} guardado${pendentes > 1 ? 's' : ''}` : ''}`
        : online
            ? (prontoParaCamara ? 'baixada no aparelho' : 'carga aberta')
            : `sem internet${pendentes ? ` · ${pendentes} guardado${pendentes > 1 ? 's' : ''}` : ''}`;
    return (
        <>
            <button type="button" className="cab" onClick={alternar} aria-label={textos.ariaBarra} aria-expanded={aberta}>
                <div className="tx">
                    <b><span className="nc">Carga #{carga.numero}</span>{carga.motorista ? <span className="mo"> · {carga.motorista}</span> : null}</b>
                    <span className={erroServidor || memoriaCheia ? 'er' : ''}><i className={`dot ${online && !erroServidor ? '' : 'off'}`} />{modoTxt} · {estadoTxt}{etiquetasN > 0 ? ` · 🖨 ${etiquetasN}` : ''}</span>
                </div>
                <span className="tr">{aberta ? 'Fechar ▴' : 'Trocar ▾'}</span>
            </button>
            {/* o detalhe do erro fica no topo do conteúdo (rola junto); aqui só uma linha de alerta, sempre à vista, que leva até ele */}
            {(erroServidor || memoriaCheia) && (
                <button type="button" className="alerta-fx" onClick={irParaAviso}>
                    ⚠ {memoriaCheia ? 'Memória cheia' : 'Envio parado'}{pendentes ? ` · ${pendentes} guardado${pendentes > 1 ? 's' : ''}` : ''} — toque para ver
                </button>
            )}
            <div className="painel" onClick={(e) => e.stopPropagation()}>
                {online
                    ? (
                        <div className="net on">
                            <span className="t">
                                {pendentes
                                    ? `${sincronizando ? 'Enviando' : 'Enviando em instantes'} · ${pendentes} toque${pendentes > 1 ? 's' : ''} ainda não enviado${pendentes > 1 ? 's' : ''}`
                                    : prontoParaCamara ? 'Carga baixada neste aparelho — pode entrar na câmara' : 'Carga aberta neste aparelho'}
                            </span>
                        </div>
                    )
                    : (
                        <div className="net off">
                            <span className="t">Sem internet · {pendentes ? `${pendentes} toque${pendentes > 1 ? 's' : ''} guardado${pendentes > 1 ? 's' : ''} no aparelho` : 'tudo guardado no aparelho'} — envia sozinho quando o sinal voltar</span>
                        </div>
                    )}
                {erroLista && <div className="aviso-e">{erroLista}</div>}
                <div className="cargas">
                    {lista.length === 0 && <span style={{ fontWeight: 700 }}>{online ? 'Nenhuma outra carga disponível.' : 'Nenhuma carga guardada neste aparelho.'}</span>}
                    {lista.map((c) => <CartaoCarga key={c.id} c={c} ativa={c.id === carga.id} online={online} onEscolher={onEscolher} />)}
                </div>
                {abrindo && <p className="dica" style={{ marginTop: '.5em' }}>Baixando a carga…</p>}
                <div className="dica" style={{ marginTop: '.5em', fontSize: '.7em', opacity: .75 }}>versão do app: {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</div>
                <div className="modo">
                    <button type="button" className={modo === 'carga' ? 'on' : ''} onClick={() => setModo('carga')}>Carga inteira<small>somo tudo por produto</small></button>
                    <button type="button" className={modo === 'pedido' ? 'on' : ''} onClick={() => setModo('pedido')}>Por pedido<small>bolsa térmica, um cliente por vez</small></button>
                </div>
                <div className="ltr">
                    <span>Tamanho da letra</span>
                    <div className="letra">
                        <button type="button" onClick={() => mudarLetra(-2)} aria-label="Diminuir letra">A−</button>
                        <button type="button" onClick={() => mudarLetra(2)} aria-label="Aumentar letra">A+</button>
                    </div>
                </div>
            </div>
        </>
    );
}

// Avisos detalhados (erro de envio, memória, abrir uma vez com sinal): ficam NO CONTEÚDO, fora do bloco fixo — assim o
// bloco de cima nunca cresce a ponto de cobrir a lista, nem com letra grande.
export function AvisosCarga({ avisoRef, memoriaCheia, erroServidor, pendentes, sincronizando, tentarDeNovo, semControladorSW }) {
    if (!memoriaCheia && !erroServidor && !semControladorSW) return null;
    const guardados = pendentes ? `${pendentes} toque${pendentes > 1 ? 's' : ''} guardado${pendentes > 1 ? 's' : ''} neste aparelho, nada se perdeu.` : 'Seus toques ficam guardados neste aparelho.';
    return (
        <div ref={avisoRef} className="avisos">
            {memoriaCheia && <div className="aviso-e" role="alert">Memória do aparelho cheia — seus toques podem não estar sendo guardados. Volte ao sinal e envie agora antes de continuar.</div>}
            {erroServidor && (
                <div className="aviso-e er-envio" role="alert">
                    <span>Envio parado: {erroServidor} {guardados}</span>
                    <button type="button" onClick={tentarDeNovo} disabled={sincronizando}>{sincronizando ? 'Enviando…' : 'Tentar de novo'}</button>
                </div>
            )}
            {semControladorSW && <div className="aviso-a" role="status">Este aparelho ainda não está pronto para ficar sem sinal. Feche e abra o app com internet.</div>}
        </div>
    );
}

// Faixa de etiquetas (bolsas): escura sem sinal; amarela com sinal + "Imprimir agora".
export function FaixaEtiquetas({ etiquetas, online, imprimirAgora, impressoras, impressoraId, setImpressoraId, precisaEscolher, erroImpressoras, recarregarImpressoras }) {
    const n = etiquetas.reduce((s, e) => s + (e.bolsas || 0), 0);
    if (!n) return null;
    const m = etiquetas.length;
    const et = `${n} etiqueta${n > 1 ? 's' : ''}`;
    const pd = `${m} pedido${m > 1 ? 's' : ''}`;
    const enviando = etiquetas.some((e) => e.status === 'ENVIANDO');
    const erro = etiquetas.find((e) => e.status === 'ERRO');
    if (!online) return <div className="fila off"><span>🖨 {et} guardada{n > 1 ? 's' : ''} ({pd}) — você imprime ao sair</span></div>;
    if (erroImpressoras) {
        return (
            <div className="fila er">
                <span>🖨 {et} esperando ({pd}) — {erroImpressoras}</span>
                <button type="button" onClick={recarregarImpressoras}>Tentar de novo</button>
            </div>
        );
    }
    return (
        <div className={`fila ${erro ? 'er' : ''}`}>
            <span>🖨 {precisaEscolher ? `${et} esperando (${pd}) — escolha a impressora` : enviando ? `Enviando ${et} (${pd})…` : erro ? `Não saiu: ${erro.erro || 'erro ao imprimir'}` : `${et} esperando (${pd})`}</span>
            {impressoras.length > 1 && (
                <div className="sel">
                    <SelectBusca value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)} className="w-full">
                        {precisaEscolher && <option value="">Escolha a impressora…</option>}
                        {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                    </SelectBusca>
                </div>
            )}
            <button type="button" disabled={enviando || precisaEscolher} onClick={imprimirAgora}>{erro ? 'Tentar de novo' : 'Imprimir agora'}</button>
        </div>
    );
}
