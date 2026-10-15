import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Plus, Pencil, Trash2, FileText, Tag, Loader2, CheckCircle, XCircle } from 'lucide-react';
import SelectBusca from '../../../components/SelectBusca';
import impressaoService from '../../../services/impressaoService';
import { Card, Modal, EstadoAgente, btnPrim, btnSec, btnPerigo, btnGhost, inputCls, labelCls, erroDe } from './comuns';

const TAMANHOS = { '40x25': '40×25 mm', '100x120': '100×120 mm' };

// Sugestão da linguagem pelo driver (só sugere; o usuário confirma)
export function sugerirLinguagem(driver) {
    const d = String(driver || '').toUpperCase();
    if (!d) return null;
    if (d.includes('TLP 2844') || d.includes('EPL')) return 'EPL2';
    if (d.includes('ZPL') || d.includes('ZDESIGNER') || /\b(ZT|GK|ZD|ZM)\d/.test(d)) return 'ZPL';
    return null;
}

const VAZIO = { nome: '', agenteId: '', nomeWindows: '', linguagem: 'EPL2', tamanho: '40x25', colunas: 2, rotacao: 0, ativa: false };

const ImpressoraForm = ({ inicial, agentes, onFechar, onSalvo }) => {
    const [f, setF] = useState(() => ({ ...VAZIO, agenteId: agentes.find(a => a.ativo !== false)?.id || '', ...inicial }));
    const [manual, setManual] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [sugestao, setSugestao] = useState(null);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const agente = agentes.find(a => a.id === f.agenteId);
    const lista = Array.isArray(agente?.impressorasWindows) ? agente.impressorasWindows : [];
    const nomes = lista.map(i => i.nome);
    const semLista = lista.length === 0;
    const foraDaLista = f.nomeWindows && !nomes.includes(f.nomeWindows);
    const digitando = manual || semLista;

    const escolherWindows = (nome) => {
        set('nomeWindows', nome);
        const imp = lista.find(i => i.nome === nome);
        const sug = sugerirLinguagem(imp?.driver);
        setSugestao(sug ? `Pelo driver "${imp.driver}", a linguagem provável é ${sug}. Confira antes de salvar.` : null);
        if (sug) set('linguagem', sug);
    };
    const mudarTamanho = (t) => setF(p => ({ ...p, tamanho: t, colunas: t === '40x25' ? 2 : 1 }));

    const salvar = async () => {
        if (!f.nome.trim()) return toast.error('Dê um nome para a impressora.');
        if (!f.agenteId) return toast.error('Escolha o computador onde ela está ligada.');
        if (!f.nomeWindows.trim()) return toast.error('Escolha (ou digite) o nome da impressora no Windows.');
        const corpo = { nome: f.nome.trim(), agenteId: f.agenteId, nomeWindows: f.nomeWindows.trim(), linguagem: f.linguagem, tamanho: f.tamanho, colunas: Number(f.colunas) || 1, rotacao: Number(f.rotacao) || 0, ativa: !!f.ativa };
        setSalvando(true);
        try {
            const r = f.id ? await impressaoService.atualizarImpressora(f.id, corpo) : await impressaoService.criarImpressora(corpo);
            toast.success('Impressora salva.');
            onSalvo(r);
        } catch (e) { toast.error(erroDe(e, 'Não foi possível salvar.')); setSalvando(false); }
    };

    return (
        <Modal titulo={f.id ? 'Editar impressora' : 'Nova impressora'} onFechar={onFechar} largura="md:max-w-xl"
            rodape={<><button type="button" className={btnGhost} onClick={onFechar}>Cancelar</button>
                <button type="button" className={btnPrim} disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</button></>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><label className={labelCls}>Nome</label>
                    <input className={inputCls} value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Zebra pequena 40×25" maxLength={60} /></div>
                {agentes.filter(a => a.ativo !== false).length > 1 && (
                    <div className="md:col-span-2"><label className={labelCls}>Computador onde está ligada</label>
                        <SelectBusca value={f.agenteId} onChange={e => set('agenteId', e.target.value)} className="w-full">
                            {agentes.filter(a => a.ativo !== false).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </SelectBusca></div>
                )}
                <div><label className={labelCls}>Tamanho da etiqueta</label>
                    <SelectBusca value={f.tamanho} onChange={e => mudarTamanho(e.target.value)} className="w-full">
                        <option value="40x25">40×25 mm (pequena)</option>
                        <option value="100x120">100×120 mm (grande)</option>
                    </SelectBusca></div>
                <div><label className={labelCls}>Etiquetas lado a lado (colunas)</label>
                    <SelectBusca value={String(f.colunas)} onChange={e => set('colunas', Number(e.target.value))} className="w-full">
                        <option value="1">1 coluna</option>
                        <option value="2">2 colunas</option>
                    </SelectBusca></div>
                <div className="md:col-span-2">
                    <label className={labelCls}>Nome da impressora no Windows</label>
                    {digitando ? (
                        <>
                            <input className={inputCls} value={f.nomeWindows} onChange={e => set('nomeWindows', e.target.value)} placeholder="Exatamente como aparece no Windows" />
                            {semLista && <p className="text-xs text-amber-700 mt-1">O computador ainda não mandou a lista de impressoras. Digite o nome exato ou clique em "Atualizar lista" no card do computador.</p>}
                            {!semLista && <button type="button" className="text-xs text-primary underline mt-1 min-h-[44px] md:min-h-0 inline-flex items-center" onClick={() => setManual(false)}>Escolher da lista</button>}
                        </>
                    ) : (
                        <>
                            <SelectBusca value={f.nomeWindows} onChange={e => escolherWindows(e.target.value)} className="w-full">
                                <option value="">Escolha a impressora…</option>
                                {foraDaLista && <option value={f.nomeWindows}>{f.nomeWindows} (não está na lista atual)</option>}
                                {lista.map(i => <option key={i.nome} value={i.nome}>{i.nome}{i.driver ? ` — ${i.driver}` : ''}</option>)}
                            </SelectBusca>
                            <button type="button" className="text-xs text-primary underline mt-1 min-h-[44px] md:min-h-0 inline-flex items-center" onClick={() => setManual(true)}>Não achou? Digitar o nome</button>
                        </>
                    )}
                </div>
                <div className="md:col-span-2"><label className={labelCls}>Linguagem da impressora</label>
                    <SelectBusca value={f.linguagem} onChange={e => set('linguagem', e.target.value)} className="w-full">
                        <option value="EPL2">EPL2 (Zebra TLP 2844)</option>
                        <option value="ZPL">ZPL (Zebra ZDesigner)</option>
                    </SelectBusca>
                    {sugestao && <p className="text-xs text-gray-600 mt-1">{sugestao}</p>}
                    <p className="text-xs text-gray-500 mt-1">Na dúvida, use "Teste de texto": se sair texto legível, a linguagem está certa.</p></div>
                <div><label className={labelCls}>Girar etiqueta</label>
                    <SelectBusca value={String(f.rotacao)} onChange={e => set('rotacao', Number(e.target.value))} className="w-full">
                        {[0, 90, 180, 270].map(g => <option key={g} value={g}>{g === 0 ? 'Não girar' : `${g}°`}</option>)}
                    </SelectBusca></div>
                <div><label className={labelCls}>Situação</label>
                    <SelectBusca value={f.ativa ? '1' : '0'} onChange={e => set('ativa', e.target.value === '1')} className="w-full">
                        <option value="1">Ativa (pode imprimir etiquetas)</option>
                        <option value="0">Inativa (só aceita teste)</option>
                    </SelectBusca>
                    {!f.id && <p className="text-xs text-gray-500 mt-1">Dica: deixe inativa, faça o teste e só depois ative.</p>}</div>
            </div>
        </Modal>
    );
};

// Acompanha o trabalho de teste (polling 1,5 s) e traduz o estado em português simples.
export function mensagemTrabalho(t) {
    if (!t) return { tom: 'espera', texto: 'Enviando o pedido…' };
    switch (t.status) {
        case 'IMPRESSO': return { tom: 'ok', texto: 'Saiu na impressora.' };
        case 'ERRO': return { tom: 'erro', texto: `Erro: ${t.erro || 'a impressora não aceitou o trabalho.'}` };
        case 'EXPIRADO': return { tom: 'erro', texto: t.agenteOnline === false ? 'O computador da cozinha não respondeu (desligado ou sem internet). O pedido venceu e não vai mais sair.' : 'O pedido venceu antes de imprimir e não vai mais sair.' };
        case 'CANCELADO': return { tom: 'erro', texto: 'O pedido foi cancelado.' };
        case 'ENVIANDO': return { tom: 'espera', texto: 'O computador da cozinha recebeu e está mandando para a impressora…' };
        default: if (t.erro) return { tom: 'aviso', texto: `Deu problema: ${String(t.erro).replace(/[.\s]+$/, '')}. Tentando de novo…` };
            return t.agenteOnline === false
            ? { tom: 'aviso', texto: 'O computador da cozinha não está respondendo (desligado ou sem internet). A etiqueta fica na fila e só sai se ele voltar a tempo.' }
            : { tom: 'espera', texto: 'Na fila, esperando o computador da cozinha buscar…' };
    }
}
const FINAIS = ['IMPRESSO', 'ERRO', 'EXPIRADO', 'CANCELADO'];

const ModalAndamento = ({ trabalhoId, titulo, onFechar }) => {
    const [t, setT] = useState(null);
    const [falhaRede, setFalhaRede] = useState(false);
    const ativo = useRef(true);
    useEffect(() => {
        ativo.current = true;
        let timer;
        const ciclo = async () => {
            try {
                const r = await impressaoService.obterTrabalho(trabalhoId);
                if (!ativo.current) return;
                setT(r); setFalhaRede(false);
                if (FINAIS.includes(r.status)) return;
            } catch { if (ativo.current) setFalhaRede(true); }
            if (ativo.current) timer = setTimeout(ciclo, 1500);
        };
        ciclo();
        return () => { ativo.current = false; clearTimeout(timer); };
    }, [trabalhoId]);
    const m = mensagemTrabalho(t);
    const final = t && FINAIS.includes(t.status);
    return (
        <Modal titulo={titulo} onFechar={onFechar} rodape={<button type="button" className={btnPrim} onClick={onFechar}>{final ? 'Fechar' : 'Fechar (continua na fila)'}</button>}>
            <div className={`flex items-start gap-3 rounded-lg p-3 text-sm ${m.tom === 'ok' ? 'bg-green-50 text-green-800' : m.tom === 'erro' ? 'bg-red-50 text-red-700' : m.tom === 'aviso' ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'}`}>
                {m.tom === 'ok' ? <CheckCircle className="h-5 w-5 shrink-0" /> : m.tom === 'erro' ? <XCircle className="h-5 w-5 shrink-0" /> : <Loader2 className="h-5 w-5 shrink-0 animate-spin" />}
                <p className="font-medium">{m.texto}</p>
            </div>
            {t?.tentativas > 1 && <p className="text-xs text-gray-500">Tentativa {t.tentativas}.</p>}
            {falhaRede && <p className="text-xs text-amber-700">Sem resposta do servidor agora, tentando de novo…</p>}
        </Modal>
    );
};

const ImpressorasCard = ({ impressoras, agentes, onRecarregar }) => {
    const [form, setForm] = useState(null);
    const [andamento, setAndamento] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const ativos = agentes.filter(a => a.ativo !== false);

    const testar = async (imp, tipo, titulo) => {
        setOcupado(imp.id + tipo);
        try { const r = await impressaoService.testar(imp.id, tipo); setAndamento({ id: r.trabalhoId, titulo: `${titulo} — ${imp.nome}` }); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível pedir o teste.')); }
        finally { setOcupado(null); }
    };
    const desativar = async (imp) => {
        if (!window.confirm(`Desativar "${imp.nome}"? O histórico fica guardado.`)) return;
        try { await impressaoService.desativarImpressora(imp.id); toast.success('Impressora desativada.'); onRecarregar(); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível desativar.')); }
    };
    const ativar = async (imp) => {
        try { await impressaoService.atualizarImpressora(imp.id, { ativa: true }); toast.success('Impressora ativada.'); onRecarregar(); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível ativar.')); }
    };
    const estadoDe = (imp) => agentes.find(a => a.id === imp.agenteId)?.estado || imp.estadoAgente;
    const estadoWin = (imp) => {
        if (imp.estadoWindows) return imp.estadoWindows === 'nao_listada' ? 'Não encontrada no Windows' : imp.estadoWindows;
        const a = agentes.find(x => x.id === imp.agenteId);
        const w = (a?.impressorasWindows || []).find(i => i.nome === imp.nomeWindows);
        if (!a || !Array.isArray(a.impressorasWindows) || a.impressorasWindows.length === 0) return '—';
        return w ? (w.status || 'Encontrada') : 'Não encontrada no Windows';
    };
    const acoesLinha = (imp) => (
        <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => testar(imp, 'TEXTO_EPL2', 'Teste de texto (EPL2)')}><FileText className="h-4 w-4" />Teste de texto (EPL2)</button>
            <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => testar(imp, 'TEXTO_ZPL', 'Teste de texto (ZPL)')}><FileText className="h-4 w-4" />Teste de texto (ZPL)</button>
            <button type="button" className={btnSec} disabled={!!ocupado} onClick={() => testar(imp, 'ETIQUETA_EXEMPLO', 'Etiqueta de exemplo')}><Tag className="h-4 w-4" />Etiqueta de exemplo</button>
            <button type="button" className={btnGhost} onClick={() => setForm(imp)}><Pencil className="h-4 w-4 inline mr-1" />Editar</button>
            {imp.ativa === false && <button type="button" className={btnPrim} onClick={() => ativar(imp)}>Ativar</button>}
            {imp.ativa !== false && <button type="button" className={btnPerigo} onClick={() => desativar(imp)}><Trash2 className="h-4 w-4" />Desativar</button>}
        </div>
    );

    return (
        <Card icone={Printer} titulo="Impressoras"
            acoes={<button type="button" className={btnPrim} disabled={ativos.length === 0} onClick={() => setForm({})}><Plus className="h-4 w-4" />Nova impressora</button>}>
            {ativos.length === 0 && <p className="text-sm text-gray-600 mb-3">Cadastre primeiro o computador da cozinha (card acima).</p>}
            {impressoras.length === 0 ? (
                ativos.length > 0 && <p className="text-sm text-gray-600">Nenhuma impressora cadastrada. Clique em <b>Nova impressora</b>.</p>
            ) : (
                <>
                    <div className="md:hidden space-y-3">
                        {impressoras.map(imp => (
                            <div key={imp.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${imp.ativa === false ? 'opacity-70' : ''}`}>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{imp.nome}</span>
                                    {imp.ativa === false ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Inativa</span> : <EstadoAgente estado={estadoDe(imp)} />}
                                </div>
                                <p className="text-sm text-gray-600">{TAMANHOS[imp.tamanho] || imp.tamanho} · {imp.colunas} coluna(s) · {imp.linguagem}</p>
                                <p className="text-sm text-gray-500 break-words">Windows: {imp.nomeWindows} ({estadoWin(imp)})</p>
                                <div className="mt-3">{acoesLinha(imp)}</div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {['Nome', 'Tamanho', 'Colunas', 'Linguagem', 'Nome no Windows', 'Estado'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                            </tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {impressoras.map(imp => (
                                    <React.Fragment key={imp.id}>
                                        <tr className={`hover:bg-gray-50 ${imp.ativa === false ? 'opacity-60' : ''}`}>
                                            <td className="px-4 py-3 text-gray-900 font-medium">{imp.nome}{imp.ativa === false && <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Inativa</span>}</td>
                                            <td className="px-4 py-3 text-gray-700">{TAMANHOS[imp.tamanho] || imp.tamanho}</td>
                                            <td className="px-4 py-3 text-gray-700">{imp.colunas}</td>
                                            <td className="px-4 py-3 text-gray-700">{imp.linguagem}</td>
                                            <td className="px-4 py-3 text-gray-700">{imp.nomeWindows}<div className="text-xs text-gray-500">{estadoWin(imp)}</div></td>
                                            <td className="px-4 py-3"><EstadoAgente estado={estadoDe(imp)} /></td>
                                        </tr>
                                        <tr><td colSpan={6} className="px-4 pb-3 pt-0">{acoesLinha(imp)}</td></tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {form && <ImpressoraForm inicial={form} agentes={agentes} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); onRecarregar(); }} />}
            {andamento && <ModalAndamento trabalhoId={andamento.id} titulo={andamento.titulo} onFechar={() => { setAndamento(null); onRecarregar(); }} />}
        </Card>
    );
};

export default ImpressorasCard;
