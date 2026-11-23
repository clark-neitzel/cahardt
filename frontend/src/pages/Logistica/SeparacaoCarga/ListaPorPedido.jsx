import { Fragment } from 'react';
import LinhaSeparacao from './LinhaSeparacao';
import FicouFaltando from './FicouFaltando';
import { classe, celula, faltas, pedidoPronto, proximoPedido, separado, statusPedido } from './separacaoCalculo';
import { TEXTOS_SEPARACAO } from './textos';

// Modo "Por pedido": lista dos pedidos (com a ordem para separar) + detalhe do pedido aberto
// (linhas, "Ficou faltando", bolsas/etiquetas e "Próximo pedido").
// `textos` e `avisoLinha(chave)` (opcionais): vocabulário da conferência e a linha "Separação avisou…" por chave.
export default function ListaPorPedido({ carga, idx, estado, ordenados, aberto, setAberto, soFalta, h, onConcluir, aoAbrir, textos = TEXTOS_SEPARACAO, avisoLinha = null }) {
    const regra = estado.ordem?.regra || 'CARGA';
    const manual = estado.ordem?.manual || [];
    const ped = aberto ? idx.pedidos.get(aberto) : null;

    const seg = (r, t) => <button type="button" className={regra === r ? 'on' : ''} onClick={() => h.trocarRegra(r)}>{t}</button>;

    let cidadeAtual = null; let divisor = false;
    const visiveis = ordenados.filter((x) => !soFalta || !pedidoPronto(estado, idx, x) || (ped && ped.id === x.id));
    const lista = (
        <div className="pl">
            <div className="ord">
                <span>{textos.ordemPara}</span>
                <div className="seg">{seg('CARGA', 'Da carga')}{seg('CIDADE', 'Por cidade')}{seg('MANUAL', 'Eu escolho')}</div>
                {regra === 'MANUAL' && (
                    <p>Toque no quadrado para numerar: 1º, 2º, 3º… Toque de novo para tirar o número. Quem ficar sem número vai depois, em qualquer ordem.
                        {manual.length > 0 && <> <button type="button" className="lim" onClick={h.limparOrdem}>Limpar ordem</button></>}
                    </p>
                )}
            </div>
            {visiveis.map((x) => {
                const pos = manual.indexOf(x.id);
                const st = statusPedido(estado, idx, x, textos.pedidoStatus);
                const cab = [];
                if (regra === 'CIDADE' && x.cidade !== cidadeAtual) { cidadeAtual = x.cidade; cab.push(<div key={`c-${x.id}`} className="cidh">{x.cidade || 'Sem cidade'}</div>); }
                if (regra === 'MANUAL' && pos < 0 && !divisor && manual.length) { divisor = true; cab.push(<div key={`d-${x.id}`} className="cidh">{textos.semOrdem}</div>); }
                return (
                    <Fragment key={x.id}>
                        {cab}
                        <div className="pcw">
                            {regra === 'MANUAL' && (
                                <button type="button" className={`nb2 ${pos >= 0 ? 'tem' : ''}`} onClick={() => h.numerar(x.id)} aria-label="Ordem deste pedido">{pos >= 0 ? `${pos + 1}º` : '+'}</button>
                            )}
                            <button type="button" className={`pc ${ped && ped.id === x.id ? 'on' : ''}`} onClick={() => { setAberto(x.id); aoAbrir?.(); }}>
                                <div className="c">{x.cliente}</div>
                                <div className="d">{x.cidade}</div>
                                <div className="l"><span className="nn">{x.etiqueta} · {x.itens.length} produto{x.itens.length > 1 ? 's' : ''}</span><span className={`bd ${st.cor}`}>{st.texto}</span></div>
                            </button>
                        </div>
                    </Fragment>
                );
            })}
            <button type="button" className="big" onClick={onConcluir}>{textos.concluirCarga}</button>
        </div>
    );

    let detalhe;
    if (!ped) detalhe = <div className="vazio">{textos.tocarPedido}</div>;
    else {
        const ks = idx.porPedido.get(ped.id) || [];
        const b = estado.pedidos?.[ped.id]?.b || 0;
        const prox = proximoPedido(estado, idx, ordenados, ped.id);
        const enfileirada = h.etiquetas.find((e) => e.pedidoId === ped.id);
        detalhe = (
            <>
                <div className="dh">
                    <div className="c">{ped.cliente}</div>
                    <div className="d">{[ped.cidade, `Pedido ${ped.etiqueta}`, `Carga #${carga.numero}`].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="lst">
                    {ks.filter((k) => !soFalta || classe(estado, idx, k) !== 'ok').map((k) => {
                        const c = celula(estado, k);
                        const it = ped.itens.find((i) => k === `p:${ped.id}:${i.produtoId}`);
                        return (
                            <LinhaSeparacao key={k} k={k} nome={it?.nome} unidade={it?.unidade} pedir={idx.pedir.get(k)} sep={separado(estado, idx, k)}
                                cl={classe(estado, idx, k)} tocada={c.t} motivo={c.m} h={h} textos={textos} aviso={avisoLinha ? avisoLinha(k) : null} />
                        );
                    })}
                </div>
                <FicouFaltando itens={faltas(estado, idx, ks)} textos={textos} />
                <div className="bol">
                    <h4>{textos.quantasBolsas}</h4>
                    <div className="ln">
                        <button type="button" className="rd" onClick={() => h.mudarBolsas(ped.id, b - 1)} aria-label="Menos uma bolsa" disabled={b <= 0}>−</button>
                        <span className="nb">{b}</span>
                        <button type="button" className="rd" onClick={() => h.mudarBolsas(ped.id, b + 1)} aria-label="Mais uma bolsa" disabled={b >= 20}>+</button>
                        <button type="button" className="big" disabled={!b || enfileirada?.status === 'ENVIANDO'} onClick={() => h.imprimirBolsas(ped)}>
                            🖨 Imprimir {b || ''} etiqueta{b === 1 ? '' : 's'}
                        </button>
                    </div>
                    <p>Sai uma etiqueta por bolsa{b > 1 ? `: 1 de ${b} até ${b} de ${b}` : ''}. Vale também para caixa.</p>
                    {enfileirada && <p style={{ color: '#92400e', fontWeight: 800 }}>{enfileirada.status === 'ENVIANDO' ? 'Enviando para a impressora…' : enfileirada.status === 'ERRO' ? `Não saiu: ${enfileirada.erro || 'erro ao imprimir'}` : 'Etiquetas deste pedido guardadas — veja a faixa de cima.'}</p>}
                </div>
                {prox
                    ? (<><button type="button" className="big o" onClick={() => { setAberto(prox.id); aoAbrir?.(); }}>Próximo pedido: {prox.cliente} ›</button>
                        <p className="dica">{textos.dicaProximo}</p></>)
                    : <div className="vazio">{textos.semOutroPedido}</div>}
            </>
        );
    }

    return (
        <div className={`dois ${ped ? 'ab' : ''}`}>
            {lista}
            <div className="det">{detalhe}</div>
        </div>
    );
}

