import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { fmtNum, fmtRS, fmtPct, fmtPctSinal, fmtInt, fmtData, temValor } from './formatos';

// Nível 2 do painel "Por que…?": quem e o quê está por trás do selo.
// Dados vêm prontos do backend (GET /indicadores-gestao/produtos/:id/causas); aqui só se exibe.
// Listas longas mostram 10 linhas + "Mostrar todos (N)"; resumos vêm do `resumo` do servidor.

const LIMITE = 10;
// quantidade: inteiro quando for inteira, senão 2 casas
const fmtQtd = (x) => (temValor(x) ? (Number.isInteger(Number(x)) ? fmtNum(x, 0) : fmtNum(x, 2)) : '—');
const NEG = 'text-red-700';
const POS = 'text-green-700';

const Chip = ({ cls, children }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>{children}</span>
);
const C = { verde: 'bg-green-100 text-green-800', azul: 'bg-blue-100 text-blue-800', ambar: 'bg-amber-100 text-amber-700', verm: 'bg-red-100 text-red-700', cinza: 'bg-gray-100 text-gray-700' };

function Secao({ n, titulo, acao, children }) {
    return (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2.5 bg-gray-50 border-b border-gray-200">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600 flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-house text-white text-[11px] flex items-center justify-center tracking-normal">{n}</span>
                    {titulo}
                </h3>
                {acao}
            </div>
            {children}
        </div>
    );
}

const Nota = ({ children }) => <div className="px-3 py-2.5 text-xs text-gray-600 bg-gray-50 border-t border-gray-200">{children}</div>;
const Vazio = ({ children }) => <div className="px-3 py-4 text-sm text-gray-600">{children}</div>;

// Corta a lista em 10 e oferece "Mostrar todos (N)" / "Mostrar menos".
function ListaCorte({ itens, children }) {
    const [todos, setTodos] = useState(false);
    const lista = Array.isArray(itens) ? itens : [];
    const visiveis = todos ? lista : lista.slice(0, LIMITE);
    return (
        <>
            {children(visiveis)}
            {lista.length > LIMITE && (
                <div className="px-3 py-3 border-t border-gray-200 flex justify-center">
                    <button type="button" onClick={() => setTodos((t) => !t)}
                        className="px-5 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                        {todos ? 'Mostrar menos' : `Mostrar todos (${lista.length})`}
                    </button>
                </div>
            )}
        </>
    );
}

const Par = ({ t, children }) => (
    <div className="min-w-0"><dt className="text-xs text-gray-600">{t}</dt><dd className="text-sm text-gray-900 font-medium">{children}</dd></div>
);

// ---------- cartões de decomposição ----------
function Cartao({ titulo, valor, cor, detalhe, lider }) {
    return (
        <div className={`rounded-xl border p-3 ${lider ? 'border-red-400 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</div>
                {lider && <Chip cls={C.verm}>maior causa</Chip>}
            </div>
            <div className={`text-2xl font-extrabold mt-1 ${cor}`}>{valor}</div>
            <div className="text-xs text-gray-600 mt-1">{detalhe}</div>
        </div>
    );
}

function pp(x) {
    if (!temValor(x) || Math.abs(Number(x)) < 0.05) return null;
    const n = Number(x);
    return <>{n < 0 ? 'tirou' : 'somou'} <b className="text-gray-900">{fmtNum(Math.abs(n), 1)} pp</b> {n < 0 ? 'da' : 'à'} margem</>;
}

function Decomposicao({ d }) {
    if (!d) return null;
    if (!d.comparavel) {
        return (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-gray-600" aria-hidden="true" />
                <span>{d.motivoSemComparacao || 'Não dá para comparar este período com o anterior.'}</span>
            </div>
        );
    }
    const { custo, preco, volume } = d;
    const corVar = (v, bomSobe) => (!temValor(v) || Math.abs(Number(v)) < 0.05 ? 'text-gray-700' : ((Number(v) > 0) === bomSobe ? POS : NEG));
    const impVol = volume?.impactoMcTotal;
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {custo && (<Cartao lider={d.maiorCausa === 'custo'} titulo="Custo por unidade" valor={fmtPctSinal(custo.variacaoPct)} cor={corVar(custo.variacaoPct, false)}
                    detalhe={<>{fmtRS(custo.antes)} → {fmtRS(custo.agora)}{pp(custo.ppMargem) && <> · {pp(custo.ppMargem)}</>}</>} />)}
                {preco && (<Cartao lider={d.maiorCausa === 'preco'} titulo="Preço médio" valor={fmtPctSinal(preco.variacaoPct)} cor={corVar(preco.variacaoPct, true)}
                    detalhe={<>{fmtRS(preco.antes)} → {fmtRS(preco.agora)}{pp(preco.ppMargem) && <> · {pp(preco.ppMargem)}</>}</>} />)}
                {volume && (<Cartao lider={d.maiorCausa === 'volume'} titulo="Volume" valor={fmtPctSinal(volume.variacaoPct, 0)} cor={corVar(volume.variacaoPct, true)}
                    detalhe={<>{fmtQtd(volume.antes)} → {fmtQtd(volume.agora)} un · não muda a MC %{temValor(impVol) && Math.abs(Number(impVol)) >= 0.5 ? <>, mas a MC total {Number(impVol) < 0 ? 'caiu' : 'subiu'} <b className="text-gray-900">{fmtRS(Math.abs(Number(impVol)))}</b></> : ''}</>} />)}
            </div>
            {custo && preco && volume && <p className="text-xs text-gray-600">
                Os três cartões somam a variação da margem total ({fmtRS(d.variacaoMcTotal)}).
                {temValor(d.interacaoPp) && Math.abs(Number(d.interacaoPp)) >= 0.1 && <> Efeito combinado de custo e preço: {fmtNum(d.interacaoPp, 1)} pp.</>}
            </p>}
        </div>
    );
}

// ---------- 1. Custo ----------
export function BlocoCusto({ dados, podeFicha, onFicha }) {
    const insumos = dados.insumos || [];
    const revenda = dados.classe && dados.classe !== 'FABRICADO';
    const botao = dados.links?.fichaTecnica && podeFicha ? (
        <button type="button" onClick={onFicha} className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Abrir ficha técnica</button>
    ) : null;
    const onde = (i) => {
        if (i.semCompra) return <span className="text-gray-600">sem compra registrada</span>;
        const m = i.mudouEm;
        if (!m) return <span className="text-gray-600">sem compra nova</span>;
        const ant = m.compraAnterior;
        return (
            <>
                {m.numeroNota ? `NF ${m.numeroNota}` : 'Compra'}{m.fornecedor ? ` · ${m.fornecedor}` : ''}{m.data ? ` · ${fmtData(m.data)}` : ''}
                {ant && <span className="block text-xs text-gray-600">compra anterior: {ant.fornecedor || '—'} {fmtRS(ant.custo)}</span>}
            </>
        );
    };
    const corImp = (v) => (!temValor(v) || Math.abs(Number(v)) < 0.00005 ? 'text-gray-600' : (Number(v) > 0 ? NEG : POS));
    const impTxt = (v) => (!temValor(v) || Math.abs(Number(v)) < 0.00005 ? '—' : `${Number(v) > 0 ? '+' : '−'}${fmtRS(Math.abs(Number(v)), 4)}`);
    const varTxt = (i) => (!temValor(i.variacaoPct) || Math.abs(Number(i.variacaoPct)) < 0.05 ? '=' : `${Number(i.variacaoPct) > 0 ? '▲' : '▼'} ${fmtNum(Math.abs(Number(i.variacaoPct)), 1)}%`);
    return (
        <Secao n={1} titulo={revenda ? 'Custo: compra do produto' : 'Custo: qual insumo subiu'} acao={botao}>
            {insumos.length === 0 ? <Vazio>Sem ficha técnica nem compra registrada para este produto.</Vazio> : (
                <>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-white text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                <tr>
                                    <th className="px-3 py-2 text-left">{revenda ? 'Produto' : 'Insumo da ficha'}</th>
                                    <th className="px-3 py-2 text-right">Por unidade</th>
                                    <th className="px-3 py-2 text-right">Custo antes</th>
                                    <th className="px-3 py-2 text-right">Custo agora</th>
                                    <th className="px-3 py-2 text-right">Variação</th>
                                    <th className="px-3 py-2 text-right">Impacto/un</th>
                                    <th className="px-3 py-2 text-left">Onde mudou</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 align-top">
                                {insumos.map((i, k) => (
                                    <tr key={i.itemPcpId || k}>
                                        <td className="px-3 py-2 font-semibold text-gray-900">{i.nome}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(i.qtdPorUn, 3)}{i.unidade ? ` ${i.unidade}` : ''}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtRS(i.custoAntes, 4)}{i.antesEstimado && <span className="block text-xs text-gray-600">estimado</span>}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtRS(i.custoAgora, 4)}</td>
                                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${corImp(i.variacaoPct)}`}>{varTxt(i)}</td>
                                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${corImp(i.impactoUn)}`}>{impTxt(i.impactoUn)}</td>
                                        <td className="px-3 py-2">{onde(i)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="md:hidden p-3 space-y-2">
                        {insumos.map((i, k) => (
                            <div key={i.itemPcpId || k} className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-gray-900 text-sm min-w-0 break-words">{i.nome}</span>
                                    <span className={`text-sm font-bold whitespace-nowrap ${corImp(i.variacaoPct)}`}>{varTxt(i)}</span>
                                </div>
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                    <Par t="Antes → agora">{fmtRS(i.custoAntes, 4)} → {fmtRS(i.custoAgora, 4)}</Par>
                                    <Par t="Impacto/un"><span className={`font-bold ${corImp(i.impactoUn)}`}>{impTxt(i.impactoUn)}</span></Par>
                                    <Par t="Por unidade">{fmtNum(i.qtdPorUn, 3)}{i.unidade ? ` ${i.unidade}` : ''}</Par>
                                </dl>
                                <div className="text-xs text-gray-700 mt-2">{onde(i)}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
            <Nota>
                Custo da {revenda ? 'compra' : 'ficha'} com os últimos preços: <b className="text-gray-900">{fmtRS(dados.custoFichaAtual, 4)}</b>
                {temValor(dados.custoFichaAnterior) && <> (antes {fmtRS(dados.custoFichaAnterior, 4)})</>}
                {' '}· custo médio gravado: <b className="text-gray-900">{fmtRS(dados.custoMedioGravado, 4)}</b>.
                {dados.fichaDeReferencia && ' Ficha de outro produto (referência).'} O custo gravado vem do pedido na hora da venda e pode diferir da compra mais recente.
            </Nota>
        </Secao>
    );
}

// ---------- 2. Preço ----------
function chipComo(c) {
    switch (c.como) {
        case 'flex': return <Chip cls={C.azul}>flex −{fmtRS(c.flexRS)}</Chip>;
        case 'desconto_manual': return <Chip cls={C.ambar}>desconto manual, sem flex</Chip>;
        case 'abaixo_custo': return <Chip cls={C.verm}>abaixo do custo</Chip>;
        default: return <span className="text-sm text-gray-600">tabela</span>;
    }
}
const pedidosTxt = (ps) => (Array.isArray(ps) ? ps.map((p) => p.rotulo).filter(Boolean).join(' · ') : '');
const corDif = (v) => (!temValor(v) || Math.abs(Number(v)) < 0.05 ? 'text-gray-600' : (Number(v) < 0 ? NEG : POS));
const difTxt = (v) => (!temValor(v) || Math.abs(Number(v)) < 0.05 ? '=' : `${Number(v) < 0 ? '▼' : '▲'} ${fmtNum(Math.abs(Number(v)), 1)}%`);

function BlocoPreco({ bloco }) {
    const r = bloco?.resumo || {};
    return (
        <Secao n={2} titulo="Preço: quem comprou abaixo da tabela">
            {(bloco?.itens || []).length === 0 ? <Vazio>Nenhuma venda deste produto no período.</Vazio> : (
                <ListaCorte itens={bloco.itens}>
                    {(vis) => (
                        <>
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Vendedor</th>
                                            <th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Tabela</th>
                                            <th className="px-3 py-2 text-right">Praticado</th><th className="px-3 py-2 text-right">Diferença</th>
                                            <th className="px-3 py-2 text-left">Como</th><th className="px-3 py-2 text-left">Pedidos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 align-top">
                                        {vis.map((c) => (
                                            <tr key={c.clienteId}>
                                                <td className="px-3 py-2 font-semibold text-gray-900">{c.cliente}</td>
                                                <td className="px-3 py-2">{c.vendedor || '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(c.qtd)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtRS(c.precoTabela)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtRS(c.precoPraticado)}</td>
                                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${corDif(c.diferencaPct)}`}>{difTxt(c.diferencaPct)}</td>
                                                <td className="px-3 py-2">{chipComo(c)}{c.como !== 'tabela' && Number(c.perdidoRS) > 0 && <span className="block text-xs text-gray-600">perdeu {fmtRS(c.perdidoRS)}</span>}</td>
                                                <td className="px-3 py-2 text-gray-700">{pedidosTxt(c.pedidos) || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden p-3 space-y-2">
                                {vis.map((c) => (
                                    <div key={c.clienteId} className="rounded-xl border border-gray-200 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-semibold text-gray-900 text-sm min-w-0 break-words">{c.cliente}</span>
                                            <span className={`text-sm font-bold whitespace-nowrap ${corDif(c.diferencaPct)}`}>{difTxt(c.diferencaPct)}</span>
                                        </div>
                                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                            <Par t="Vendedor">{c.vendedor || '—'}</Par>
                                            <Par t="Quantidade">{fmtQtd(c.qtd)} un</Par>
                                            <Par t="Tabela → praticado">{fmtRS(c.precoTabela)} → {fmtRS(c.precoPraticado)}</Par>
                                            <div className="col-span-2 min-w-0"><dt className="text-xs text-gray-600">Como</dt><dd className="mt-0.5 flex flex-wrap">{chipComo(c)}</dd></div>
                                        </dl>
                                        {pedidosTxt(c.pedidos) && <div className="text-xs text-gray-600 mt-2 break-words">{pedidosTxt(c.pedidos)}</div>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </ListaCorte>
            )}
            <Nota>
                <b className="text-gray-900">{fmtQtd(r.qtdAbaixo)} de {fmtQtd(r.qtdTotal)} unidades</b> saíram abaixo da tabela: <b className={NEG}>−{fmtRS(r.perdidoRS)}</b>
                {' '}(flex concedido {fmtRS(r.flexRS)} + desconto manual {fmtRS(r.manualRS)}).
                {Number(r.abaixoCustoQtd) > 0 && <> {fmtQtd(r.abaixoCustoQtd)} un abaixo do custo variável.</>}
                {' '}Flex = preço reduzido usando o saldo flex do vendedor (previsto na regra). Desconto manual = preço digitado abaixo da tabela sem flex, é o que merece pergunta.
            </Nota>
        </Secao>
    );
}

// ---------- 3. Bonificações ----------
function chipRetorno(b) {
    if (b.retorno === 'comprou') return <Chip cls={C.verde}>comprou {fmtQtd(b.comprouDepoisQtd)} un</Chip>;
    if (b.retorno === 'dentro_prazo') return <Chip cls={C.cinza}>ainda dentro dos 30 d</Chip>;
    return <Chip cls={C.verm}>sem retorno</Chip>;
}
function BlocoBonificacao({ bloco }) {
    const r = bloco?.resumo || {};
    const custo = (b) => (b.semCusto ? 'sem custo' : fmtRS(b.custoRS));
    return (
        <Secao n={3} titulo="Bonificações e retorno" acao={<Chip cls="bg-purple-100 text-purple-700">BN#</Chip>}>
            {(bloco?.itens || []).length === 0 ? <Vazio>Nenhuma bonificação deste produto no período.</Vazio> : (
                <ListaCorte itens={bloco.itens}>
                    {(vis) => (
                        <>
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Vendedor</th>
                                            <th className="px-3 py-2 text-right">Bonificado</th><th className="px-3 py-2 text-right">Custo</th>
                                            <th className="px-3 py-2 text-right">Comprou depois (30 d)</th><th className="px-3 py-2 text-left">Retorno</th>
                                            <th className="px-3 py-2 text-left">Pedido</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {vis.map((b) => (
                                            <tr key={b.pedidoId}>
                                                <td className="px-3 py-2 font-semibold text-gray-900">{b.cliente}</td>
                                                <td className="px-3 py-2">{b.vendedor || '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(b.qtd)} un</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{custo(b)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtRS(b.comprouDepoisRS)}</td>
                                                <td className="px-3 py-2">{chipRetorno(b)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{b.rotulo}{b.data ? ` · ${fmtData(b.data)}` : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden p-3 space-y-2">
                                {vis.map((b) => (
                                    <div key={b.pedidoId} className="rounded-xl border border-gray-200 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-semibold text-gray-900 text-sm min-w-0 break-words">{b.cliente}</span>
                                            {chipRetorno(b)}
                                        </div>
                                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                            <Par t="Vendedor">{b.vendedor || '—'}</Par>
                                            <Par t="Pedido">{b.rotulo}{b.data ? ` · ${fmtData(b.data)}` : ''}</Par>
                                            <Par t="Bonificado">{fmtQtd(b.qtd)} un · {custo(b)}</Par>
                                            <Par t="Comprou depois">{fmtRS(b.comprouDepoisRS)}</Par>
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </ListaCorte>
            )}
            <Nota>
                {fmtQtd(r.qtd)} un bonificadas em {fmtInt(r.pedidos)} pedido(s): custo <b className="text-gray-900">{fmtRS(r.custoRS)}</b>
                {' '}· <b className={NEG}>{fmtRS(r.custoSemRetornoRS)}</b> sem retorno até agora. Bonificação não entra na receita nem na MC %; aqui aparece como custo dado e se o cliente comprou o mesmo produto nos 30 dias seguintes.
            </Nota>
        </Secao>
    );
}

// ---------- 4. Volume ----------
function chipSituacao(v) {
    const pct = temValor(v.variacaoPct) ? Math.round(Math.abs(Number(v.variacaoPct))) : null;
    switch (v.situacao) {
        case 'parou': return <Chip cls={C.verm}>parou{temValor(v.diasSemComprar) ? ` · ${fmtInt(v.diasSemComprar)} d sem comprar` : ''}</Chip>;
        case 'reduziu': return <Chip cls={C.ambar}>reduziu{pct != null ? ` ${pct}%` : ''}</Chip>;
        case 'cresceu': return <Chip cls={C.verde}>cresceu</Chip>;
        case 'novo': return <Chip cls={C.azul}>novo</Chip>;
        default: return <Chip cls={C.cinza}>estável</Chip>;
    }
}
const ultimoTxt = (u) => (u ? `${u.rotulo || ''}${u.data ? ` · ${fmtData(u.data)}` : ''}` : '—');
function BlocoVolume({ bloco }) {
    const r = bloco?.resumo || {};
    const dif = (v) => (!temValor(v.diferenca) || Number(v.diferenca) === 0 ? '=' : `${Number(v.diferenca) < 0 ? '▼' : '▲'} ${fmtQtd(Math.abs(Number(v.diferenca)))}`);
    const corD = (v) => (!temValor(v.diferenca) || Number(v.diferenca) === 0 ? 'text-gray-600' : (Number(v.diferenca) < 0 ? NEG : POS));
    return (
        <Secao n={4} titulo="Volume: quem parou ou reduziu">
            {(bloco?.itens || []).length === 0 ? <Vazio>Nenhum cliente comprou este produto nos dois períodos.</Vazio> : (
                <ListaCorte itens={bloco.itens}>
                    {(vis) => (
                        <>
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Vendedor</th>
                                            <th className="px-3 py-2 text-right">Anterior</th><th className="px-3 py-2 text-right">Este período</th>
                                            <th className="px-3 py-2 text-right">Diferença</th><th className="px-3 py-2 text-left">Último pedido</th>
                                            <th className="px-3 py-2 text-left">Situação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {vis.map((v) => (
                                            <tr key={v.clienteId}>
                                                <td className="px-3 py-2 font-semibold text-gray-900">{v.cliente}</td>
                                                <td className="px-3 py-2">{v.vendedor || '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(v.qtdAnterior)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(v.qtdAtual)}</td>
                                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${corD(v)}`}>{dif(v)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{ultimoTxt(v.ultimoPedido)}</td>
                                                <td className="px-3 py-2">{chipSituacao(v)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="md:hidden p-3 space-y-2">
                                {vis.map((v) => (
                                    <div key={v.clienteId} className="rounded-xl border border-gray-200 p-3">
                                        <div className="font-semibold text-gray-900 text-sm break-words">{v.cliente}</div>
                                        <div className="mt-1">{chipSituacao(v)}</div>
                                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                            <Par t="Vendedor">{v.vendedor || '—'}</Par>
                                            <Par t="Anterior → atual">{fmtQtd(v.qtdAnterior)} → {fmtQtd(v.qtdAtual)} <span className={`font-bold ${corD(v)}`}>({dif(v)})</span></Par>
                                            <Par t="Último pedido">{ultimoTxt(v.ultimoPedido)}</Par>
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </ListaCorte>
            )}
            <Nota>
                {fmtQtd(r.qtdAnterior)} → {fmtQtd(r.qtdAtual)} unidades.
                {Number(r.clientesQueda) > 0 && <> {fmtInt(r.clientesQueda)} {Number(r.clientesQueda) === 1 ? 'cliente comprou' : 'clientes compraram'} <b className="text-gray-900">{fmtQtd(r.unidadesQueda)} un a menos</b>.</>}
                {Number(r.clientesAlta) > 0 && <> {fmtInt(r.clientesAlta)} {Number(r.clientesAlta) === 1 ? 'comprou' : 'compraram'} <b className="text-gray-900">{fmtQtd(r.unidadesAlta)} un a mais</b>.</>}
                {temValor(r.qtdAtual) && temValor(r.qtdAnterior) && (() => {
                    const saldo = Number(r.qtdAtual) - Number(r.qtdAnterior);
                    return <> Saldo: <b className={saldo < 0 ? NEG : (saldo > 0 ? POS : 'text-gray-900')}>{saldo > 0 ? '+' : (saldo < 0 ? '−' : '')}{fmtQtd(Math.abs(saldo))} un</b>.</>;
                })()}
                {' '}Números brutos, sem descontar devoluções.
            </Nota>
        </Secao>
    );
}

// ---------- nível 2 ----------
export default function CausasNivel2({ causas, onFechar }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    // espelha App.jsx canPcp('receitas'): admin ou pcp.receitas
    const podeFicha = !!user?.permissoes?.admin || !!user?.permissoes?.pcp?.receitas;

    if (causas.proibido) return null; // 403: some em silêncio
    const caixa = 'rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700';
    if (causas.carregando && !causas.dados) {
        return (
            <div className={`${caixa} flex items-center gap-2`} role="status">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Buscando as causas (clientes, insumos e bonificações)…
            </div>
        );
    }
    if (causas.erro || !causas.dados) {
        return (
            <div className={`${caixa} flex items-center justify-between gap-3 flex-wrap`} role="alert">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />{causas.erro || 'Não foi possível carregar as causas; tente de novo.'}</span>
                <button type="button" onClick={causas.recarregar} className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Tentar de novo</button>
            </div>
        );
    }
    const d = causas.dados;
    const abrirFicha = () => { onFechar(); navigate(d.links.fichaTecnica); };
    if (d.visao === 'producao') {
        return (
            <div className="space-y-4">
                <Decomposicao d={d.decomposicao} />
                <BlocoCusto dados={d} podeFicha={podeFicha} onFicha={abrirFicha} />
            </div>
        );
    }
    return (
        <div className="space-y-4">
            {causas.exemplo && <p className="text-xs font-semibold text-amber-700">Dados de exemplo (rota ainda não disponível no servidor).</p>}
            <Decomposicao d={d.decomposicao} />
            <BlocoCusto dados={d} podeFicha={podeFicha} onFicha={abrirFicha} />
            <BlocoPreco bloco={d.precoClientes} />
            <BlocoBonificacao bloco={d.bonificacoes} />
            <BlocoVolume bloco={d.volumeClientes} />
            {d.links?.fichaTecnica && podeFicha && (
                <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={abrirFicha} className="px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">Abrir ficha técnica</button>
                </div>
            )}
        </div>
    );
}
