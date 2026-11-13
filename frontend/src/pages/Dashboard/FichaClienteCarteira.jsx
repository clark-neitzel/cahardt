import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import api from '../../services/api';
import SelectBusca from '../../components/SelectBusca';
import { fmtRS0, fmtBR, fmtInt } from './dashUi';

/* Ficha do cliente que abre POR CIMA da Carteira (painel à direita no desktop, tela cheia no celular).
   Lê/grava em /dashboards/geral/carteira/cliente/:id. Não navega: a Carteira por baixo não muda de lugar. */

const BASE = '/dashboards/geral/carteira';
const MINUSC = new Set(['de', 'da', 'do', 'e', 'dos', 'das']);
const bonito = (n) => String(n || '').toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => {
    if (i && MINUSC.has(p)) return p;
    if (/^(ltda|me|br|d|epp|sa)$/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
}).join(' ');
const dmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const dm = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const pl = (n, s, p) => `${fmtInt(n)} ${Number(n) === 1 ? s : p}`;
const erroMsg = (e, padrao) => e?.response?.data?.error || padrao;
const NENHUM = '__nenhum';
const SIT = {
    NO_RITMO: 'No ritmo', ATRASO_LEVE: 'Atraso leve', PARADO: 'Parado', INATIVAR: 'Parece que não compra mais',
    NOVO: 'Cliente novo', SEM_PEDIDO: 'Sem pedido ainda', SAZONAL: 'Sazonal'
};
const digitos = (s) => String(s || '').replace(/\D/g, '');
const listaZap = (txt) => String(txt || '').split(/[,;\n]+/).map(digitos).filter(Boolean);
const mesmaLista = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const formDe = (f) => ({
    vendedorId: f?.vendedor?.id || NENHUM,
    ativo: f?.ativo === false ? 'nao' : 'sim',
    categoriaId: f?.categoria?.id || NENHUM,
    diasVenda: Array.isArray(f?.diasVenda) ? [...f.diasVenda] : [],
    cicloDias: f?.cicloPersonalizadoDias != null ? String(f.cicloPersonalizadoDias) : '',
    celular: f?.celular || '',
    whatsapps: Array.isArray(f?.whatsapps) ? f.whatsapps.join(', ') : '',
    observacao: f?.observacaoComercial || ''
});

// Só o que mudou, no formato do PATCH
const diferencas = (f, form) => {
    const p = {};
    if (!f) return p;
    const ini = formDe(f);
    if (form.vendedorId !== ini.vendedorId) p.vendedorId = form.vendedorId === NENHUM ? null : form.vendedorId;
    if (form.ativo !== ini.ativo) p.ativo = form.ativo === 'sim';
    if (form.categoriaId !== ini.categoriaId) p.categoriaId = form.categoriaId === NENHUM ? null : form.categoriaId;
    if (!mesmaLista([...form.diasVenda].sort(), [...ini.diasVenda].sort())) p.diaVenda = form.diasVenda;
    if (form.cicloDias.trim() !== ini.cicloDias) p.cicloDias = form.cicloDias.trim() === '' ? null : Number(form.cicloDias);
    if (digitos(form.celular) !== digitos(ini.celular)) p.celular = digitos(form.celular);
    if (!mesmaLista(listaZap(form.whatsapps), listaZap(ini.whatsapps))) p.whatsapps = listaZap(form.whatsapps);
    if (form.observacao.trim() !== ini.observacao.trim()) p.observacaoComercial = form.observacao.trim() === '' ? null : form.observacao.trim();
    return p;
};
// O inverso do que mudou (para o "Desfazer" do aviso)
const inversoDe = (f, patch) => {
    const inv = {};
    if ('vendedorId' in patch) inv.vendedorId = f.vendedor?.id || null;
    if ('ativo' in patch) inv.ativo = f.ativo !== false;
    if ('categoriaId' in patch) inv.categoriaId = f.categoria?.id || null;
    if ('diaVenda' in patch) inv.diaVenda = Array.isArray(f.diasVenda) ? f.diasVenda : [];
    if ('cicloDias' in patch) inv.cicloDias = f.cicloPersonalizadoDias != null ? f.cicloPersonalizadoDias : null;
    if ('celular' in patch) inv.celular = digitos(f.celular);
    if ('whatsapps' in patch) inv.whatsapps = Array.isArray(f.whatsapps) ? f.whatsapps : [];
    if ('observacaoComercial' in patch) inv.observacaoComercial = f.observacaoComercial || null;
    return inv;
};
const NOMES_CAMPO = {
    vendedorId: 'vendedor', ativo: 'situação', categoriaId: 'tipo de cliente', diaVenda: 'dia de venda', cicloDias: 'ritmo de compra',
    celular: 'celular', whatsapps: 'WhatsApps', observacaoComercial: 'observação'
};

const Titulo = ({ children }) => <h4 className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">{children}</h4>;
const Motivo = ({ children }) => <p className="text-xs font-medium text-gray-500 mt-1">{children}</p>;
const Botao = ({ children, onClick, primario = false, perigo = false, disabled = false, className = '' }) => (
    <button type="button" onClick={onClick} disabled={disabled}
        className={`min-h-[44px] px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${perigo ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm' : primario ? 'bg-primary hover:bg-primaryDark text-white shadow-sm' : 'bg-white border border-primary text-primary hover:bg-mint/40'} ${className}`}>
        {children}
    </button>
);
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 min-h-[44px] text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-500';

const FichaClienteCarteira = ({ clienteId, inativarInicial = false, versao = 0, bloqueado = false, onClose, onSalvo, onMudou, onAbrirJaSei }) => {
    const navigate = useNavigate();
    const [f, setF] = useState(null);
    const [erroCarga, setErroCarga] = useState('');
    const [form, setForm] = useState(formDe(null));
    const [salvando, setSalvando] = useState(false);
    const [erroSalvar, setErroSalvar] = useState('');
    const [confirma, setConfirma] = useState(null); // 'inativar' | 'fechar' | null
    const painelRef = useRef(null);
    const voltarPara = useRef(null);
    const travaSalvar = useRef(false);
    const sujoRef = useRef(false);
    const fRef = useRef(null);

    const patch = diferencas(f, form);
    const sujo = Object.keys(patch).length > 0;
    sujoRef.current = sujo;
    fRef.current = f;

    const carregar = useCallback(async () => {
        try {
            const r = await api.get(`${BASE}/cliente/${clienteId}`);
            setF(r.data); setErroCarga('');
            if (!sujoRef.current || !fRef.current) {
                const novo = formDe(r.data);
                if (inativarInicial && !fRef.current && r.data?.podeEditar?.ativo && r.data?.ativo !== false) novo.ativo = 'nao';
                setForm(novo);
            }
        } catch (e) { setErroCarga(erroMsg(e, 'Não foi possível abrir a ficha deste cliente.')); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteId]);

    useEffect(() => { carregar(); }, [carregar, versao]);

    // foco entra na ficha e volta para onde estava; fundo não rola
    useEffect(() => {
        voltarPara.current = document.activeElement;
        const html = document.documentElement;
        const antes = { overflow: document.body.style.overflow, pr: document.body.style.paddingRight, ho: html.style.overflow };
        const barra = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        html.style.overflow = 'hidden';
        if (barra > 0) document.body.style.paddingRight = `${barra}px`;
        painelRef.current?.focus({ preventScroll: true });
        return () => {
            document.body.style.overflow = antes.overflow;
            html.style.overflow = antes.ho;
            document.body.style.paddingRight = antes.pr;
            const el = voltarPara.current;
            if (el && document.contains(el) && el.focus) el.focus({ preventScroll: true });
        };
    }, []);

    const tentarFechar = useCallback(() => {
        if (sujoRef.current) setConfirma('fechar'); else onClose();
    }, [onClose]);

    useEffect(() => {
        const onKey = (e) => {
            if (bloqueado) return;
            // Menu do SelectBusca aberto (portal no body, z-[9999]): o Esc é dele e só fecha o menu
            if (e.key === 'Escape' && document.querySelector('body > div[class*="z-[9999]"]')) return;
            if (e.key === 'Escape') { e.stopPropagation(); if (confirma) setConfirma(null); else tentarFechar(); return; }
            if (e.key === 'Tab' && painelRef.current) { // mantém o Tab dentro da ficha
                const itens = [...painelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
                    .filter((x) => x.offsetParent !== null);
                if (!itens.length) return;
                const primeiro = itens[0]; const ultimo = itens[itens.length - 1];
                if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painelRef.current)) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
            }
        };
        document.addEventListener('keydown', onKey, true); // captura: roda antes do SelectBusca fechar o menu
        return () => document.removeEventListener('keydown', onKey, true);
    }, [bloqueado, confirma, tentarFechar]);

    const set = (campo, v) => { setForm((x) => ({ ...x, [campo]: v })); setErroSalvar(''); if (confirma === 'inativar') setConfirma(null); };
    const alternaDia = (d) => set('diasVenda', form.diasVenda.includes(d) ? form.diasVenda.filter((x) => x !== d) : [...form.diasVenda, d]);

    const salvar = async (confirmado = false) => {
        if (travaSalvar.current || !sujo) return;
        if (patch.ativo === false && !confirmado) { setConfirma('inativar'); return; }
        travaSalvar.current = true; setSalvando(true); setErroSalvar(''); setConfirma(null);
        const anterior = f; const enviado = patch;
        try {
            const r = await api.patch(`${BASE}/cliente/${clienteId}`, enviado);
            setF(r.data); setForm(formDe(r.data));
            const campos = Object.keys(enviado).map((k) => NOMES_CAMPO[k]).filter(Boolean);
            const inverso = inversoDe(anterior, enviado);
            onSalvo(`${bonito(r.data?.fantasia || r.data?.nome || anterior?.fantasia || anterior?.nome)}: salvo (${campos.join(', ')}).`,
                async () => { await api.patch(`${BASE}/cliente/${clienteId}`, inverso); });
        } catch (e) {
            setErroSalvar(erroMsg(e, 'Não foi possível salvar. Tente de novo.'));
        } finally { travaSalvar.current = false; setSalvando(false); }
    };

    const desfazerJaSei = async (url, msg) => {
        try { await api.delete(url); onMudou(msg); await carregar(); }
        catch (e) { setErroSalvar(erroMsg(e, 'Não foi possível desfazer.')); }
    };

    const pe = f?.podeEditar || {};
    const opc = f?.opcoes || {};
    const n = f?.numeros || null;
    const sub = [f?.categoria?.nome, f?.cidade, f?.vendedor?.nome ? `carteira de ${String(f.vendedor.nome).split(' ')[0]}` : 'sem vendedor'].filter(Boolean).join(' · ');
    const semPerm = 'Você não tem permissão para mudar isto.';
    const cicloHint = f?.cicloEfetivoDias != null
        ? (form.cicloDias.trim() === '' ? `Sem valor próprio: vale ${pl(f.cicloEfetivoDias, 'dia', 'dias')} (padrão do tipo ou 7).` : 'Vale este número no lugar do padrão do tipo.')
        : '';
    const silencios = Array.isArray(f?.jaSei?.silencios) ? f.jaSei.silencios : [];
    const vinculos = Array.isArray(f?.jaSei?.vinculos) ? f.jaSei.vinculos : [];
    const pedidos = Array.isArray(f?.ultimosPedidos) ? f.ultimosPedidos : [];
    const atends = Array.isArray(f?.ultimosAtendimentos) ? f.ultimosAtendimentos : [];
    const cli = { clienteId, nome: f?.nome || '' };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[90] bg-black/40" onClick={tentarFechar} aria-hidden="true" data-testid="ficha-veu" />
            <aside ref={painelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Ficha do cliente" data-testid="ficha-cliente"
                className="fixed top-0 right-0 bottom-0 z-[91] w-full md:w-[440px] bg-white md:border-l border-gray-200 shadow-xl flex flex-col outline-none"
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-200">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Ficha do cliente</p>
                        <h3 className="text-lg font-bold text-gray-900 break-words leading-tight">{f ? bonito(f.fantasia || f.nome) : 'Carregando…'}</h3>
                        {f && f.fantasia && f.nome && <p className="text-xs text-gray-500 font-medium break-words">{bonito(f.nome)}</p>}
                        {f && <p className="text-sm text-gray-600 font-medium break-words">{sub}{f.ativo === false ? ' · inativo' : ''}</p>}
                    </div>
                    <button type="button" onClick={tentarFechar} aria-label="Fechar a ficha" data-testid="ficha-fechar"
                        className="flex-none w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
                    {!f && !erroCarga && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}
                    {erroCarga && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2" role="alert">
                            <p className="text-sm font-semibold text-red-800">{erroCarga}</p>
                            <Botao primario onClick={carregar}>Tentar novamente</Botao>
                        </div>
                    )}

                    {f && (
                        <>
                            {f.unidoA && <p className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">Este cadastro conta junto com <b>{bonito(f.unidoA.nome)}</b>. Os números abaixo são dos dois juntos.</p>}
                            {Array.isArray(f.cadastrosUnidos) && f.cadastrosUnidos.length > 0 && !f.unidoA && <p className="text-xs font-medium text-gray-600">Cadastros unidos: {f.cadastrosUnidos.map(bonito).join(', ')}.</p>}

                            {n ? (
                                <>
                                    {n.textoGerente && (
                                        <div className="bg-mint/40 border border-mint rounded-lg px-3 py-2.5">
                                            <p className="text-xs font-bold uppercase tracking-widest text-primaryDark mb-0.5">O gerente escreve</p>
                                            <p className="text-sm text-gray-800">{n.textoGerente}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-gray-50 rounded-lg px-1 py-2.5"><p className="text-lg font-extrabold text-gray-900 tabular-nums">{n.diasSemComprar != null ? pl(n.diasSemComprar, 'dia', 'dias') : '—'}</p><p className="text-[11px] font-bold text-gray-500">sem comprar</p></div>
                                        <div className="bg-gray-50 rounded-lg px-1 py-2.5"><p className="text-lg font-extrabold text-gray-900 tabular-nums">{n.ticketMedio != null ? fmtRS0(n.ticketMedio) : '—'}</p><p className="text-[11px] font-bold text-gray-500">por pedido</p></div>
                                        <div className="bg-gray-50 rounded-lg px-1 py-2.5"><p className="text-lg font-extrabold text-gray-900 tabular-nums">{n.totalPedidos != null ? fmtInt(n.totalPedidos) : '—'}</p><p className="text-[11px] font-bold text-gray-500">pedidos no total</p></div>
                                    </div>
                                    <p className="text-xs font-medium text-gray-500 -mt-2">
                                        {SIT[n.situacao] || ''}{n.ritmoDias != null ? `${n.situacao && SIT[n.situacao] ? ' · ' : ''}compra a cada ${pl(Math.round(n.ritmoDias), 'dia', 'dias')}` : ''}{n.ultimoPedido ? ` · último pedido em ${dmy(n.ultimoPedido)}` : ''}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">Este cadastro é novo demais para ter números de ritmo. Eles aparecem depois dos primeiros pedidos.</p>
                            )}

                            <div>
                                <Titulo>O que dá para mudar aqui</Titulo>
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">Vendedor
                                        <SelectBusca value={form.vendedorId} onChange={(e) => set('vendedorId', e.target.value)} disabled={!pe.vendedor} className="w-full h-11 mt-1">
                                            <option value={NENHUM}>Sem vendedor</option>
                                            {(opc.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                        </SelectBusca>
                                        {!pe.vendedor && <Motivo>{semPerm}</Motivo>}
                                    </label>
                                    <label className="block text-sm font-medium text-gray-700">Situação
                                        <SelectBusca value={form.ativo} onChange={(e) => set('ativo', e.target.value)} disabled={!pe.ativo} className="w-full h-11 mt-1">
                                            <option value="sim">Ativo</option>
                                            <option value="nao">Inativo (não compra mais)</option>
                                        </SelectBusca>
                                        {!pe.ativo && <Motivo>Só quem pode editar cadastros de clientes muda a situação.</Motivo>}
                                    </label>
                                    <label className="block text-sm font-medium text-gray-700">Tipo de cliente
                                        <SelectBusca value={form.categoriaId} onChange={(e) => set('categoriaId', e.target.value)} disabled={!pe.categoria} className="w-full h-11 mt-1">
                                            <option value={NENHUM}>Sem tipo</option>
                                            {(opc.categorias || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                        </SelectBusca>
                                        {!pe.categoria && <Motivo>{semPerm}</Motivo>}
                                    </label>
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">Dia de venda <span className="text-gray-500 font-normal">(pode marcar vários)</span></p>
                                        <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Dia de venda">
                                            {(opc.dias || []).map((d) => {
                                                const on = form.diasVenda.includes(d);
                                                return (
                                                    <button key={d} type="button" disabled={!pe.diaVenda} onClick={() => alternaDia(d)} aria-pressed={on}
                                                        className={`min-h-[44px] min-w-[52px] px-3 rounded-full text-sm font-semibold border disabled:opacity-60 ${on ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{d}</button>
                                                );
                                            })}
                                        </div>
                                        {!pe.diaVenda && <Motivo>{semPerm}</Motivo>}
                                    </div>
                                    <label className="block text-sm font-medium text-gray-700">Compra a cada (dias)
                                        <input value={form.cicloDias} onChange={(e) => set('cicloDias', e.target.value.replace(/[^\d]/g, '').slice(0, 3))} disabled={!pe.ciclo}
                                            inputMode="numeric" placeholder={f.cicloEfetivoDias != null ? String(f.cicloEfetivoDias) : ''} className={`${inputCls} mt-1`} />
                                        {!pe.ciclo ? <Motivo>{semPerm}</Motivo> : cicloHint && <Motivo>{cicloHint}</Motivo>}
                                    </label>
                                    <label className="block text-sm font-medium text-gray-700">Celular
                                        <input value={form.celular} onChange={(e) => set('celular', e.target.value)} disabled={!pe.celular} inputMode="tel" placeholder="47999990000" className={`${inputCls} mt-1`} />
                                        {!pe.celular && <Motivo>Só quem pode editar cadastros de clientes muda o celular.</Motivo>}
                                    </label>
                                    <label className="block text-sm font-medium text-gray-700">WhatsApps <span className="text-gray-500 font-normal">(separe por vírgula)</span>
                                        <input value={form.whatsapps} onChange={(e) => set('whatsapps', e.target.value)} disabled={!pe.whatsapps} inputMode="tel" className={`${inputCls} mt-1`} />
                                        {!pe.whatsapps && <Motivo>Só quem pode editar cadastros de clientes muda os WhatsApps.</Motivo>}
                                    </label>
                                    <label className="block text-sm font-medium text-gray-700">Observação para a equipe
                                        <textarea value={form.observacao} onChange={(e) => set('observacao', e.target.value.slice(0, 2000))} disabled={!pe.observacao} rows={3}
                                            placeholder="Ex.: só compra em temporada" className={`${inputCls} mt-1 py-2`} />
                                        {!pe.observacao && <Motivo>{semPerm}</Motivo>}
                                    </label>
                                </div>
                            </div>

                            <div>
                                <Titulo>Já sei</Titulo>
                                {silencios.map((s) => (
                                    <div key={s.clienteId} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-2">
                                        <span className="text-sm text-gray-800">Sem avisos até <b>{dmy(s.ate)}</b></span>
                                        <button type="button" onClick={() => desfazerJaSei(`${BASE}/silencio/${s.clienteId}`, 'Voltou a avisar sobre este cliente.')} className="min-h-[44px] px-2 text-sm font-bold text-primary underline">Desfazer</button>
                                    </div>
                                ))}
                                {vinculos.map((v) => (
                                    <div key={v.id} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-2">
                                        <span className="text-sm text-gray-800 min-w-0 break-words"><b>{bonito(v.antigoNome)}</b> conta junto com <b>{bonito(v.atualNome)}</b></span>
                                        <button type="button" onClick={() => desfazerJaSei(`${BASE}/mesmo-cliente/${v.id}`, 'Os cadastros voltaram a contar separados.')} className="flex-none min-h-[44px] px-2 text-sm font-bold text-primary underline">Desfazer</button>
                                    </div>
                                ))}
                                <div className="flex flex-wrap gap-2">
                                    <Botao onClick={() => onAbrirJaSei(cli, 'mesmo')}>É o mesmo cliente de outro cadastro</Botao>
                                    <Botao onClick={() => onAbrirJaSei(cli, 'silencio')}>Não avisar por 30 ou 90 dias</Botao>
                                </div>
                            </div>

                            <div>
                                <Titulo>Últimos pedidos</Titulo>
                                {pedidos.length === 0 && <p className="text-sm text-gray-500">Nenhum pedido válido ainda.</p>}
                                <div className="divide-y divide-gray-100">
                                    {pedidos.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                            <span className="text-gray-700 min-w-0">{dmy(p.data)}{p.numero != null ? ` · #${p.numero}` : ''}{p.status === 'ESPECIAL' ? ' · especial' : ''}</span>
                                            <b className="text-gray-900 tabular-nums">{p.valor != null ? `R$ ${fmtBR(p.valor, 2)}` : '—'}</b>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Titulo>Últimos atendimentos</Titulo>
                                {atends.length === 0 && <p className="text-sm text-gray-500">Nenhum contato registrado.</p>}
                                <div className="divide-y divide-gray-100">
                                    {atends.map((a) => {
                                        const linha = [a.tipo ? String(a.tipo).replace(/_/g, ' ').toLowerCase() : '', a.acao || '', a.quem ? `por ${a.quem}` : ''].filter(Boolean).join(' · ');
                                        return (
                                            <div key={a.id} className="py-2 text-sm">
                                                <p className="text-gray-700"><b className="text-gray-900">{dmy(a.data)}</b>{linha ? ` · ${linha}` : ''}</p>
                                                {a.observacao && <p className="text-xs font-medium text-gray-500 break-words">{a.observacao}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <a href={`/clientes/${clienteId}`} onClick={(e) => { e.preventDefault(); if (sujo) setConfirma('cadastro'); else navigate(`/clientes/${clienteId}`); }}
                                className="inline-block text-xs font-semibold text-gray-500 underline min-h-[44px] leading-[44px]">abrir cadastro completo</a>
                        </>
                    )}
                </div>

                {f && (
                    <div className="px-4 py-3 border-t border-gray-200 space-y-2 bg-white">
                        {erroSalvar && <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert" data-testid="ficha-erro">{erroSalvar}</p>}
                        {confirma === 'inativar' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2" role="alertdialog" data-testid="ficha-confirma-inativar">
                                <p className="text-sm text-amber-900"><b>Inativar {bonito(f.nome)}?</b> Ele sai da Carteira: listas de atenção, 20 maiores e decisões. O histórico de vendas continua contando.</p>
                                <div className="flex gap-2">
                                    <Botao onClick={() => setConfirma(null)} className="flex-1">Voltar</Botao>
                                    <Botao perigo onClick={() => salvar(true)} disabled={salvando} className="flex-1">{salvando ? 'Inativando…' : 'Sim, inativar'}</Botao>
                                </div>
                            </div>
                        )}
                        {confirma === 'fechar' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2" role="alertdialog" data-testid="ficha-confirma-fechar">
                                <p className="text-sm text-amber-900"><b>Você mexeu em campos e não salvou.</b> Fechar agora descarta a mudança.</p>
                                <div className="flex gap-2">
                                    <Botao onClick={() => setConfirma(null)} className="flex-1">Continuar editando</Botao>
                                    <Botao perigo onClick={onClose} className="flex-1">Descartar e fechar</Botao>
                                </div>
                            </div>
                        )}
                        {confirma === 'cadastro' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2" role="alertdialog" data-testid="ficha-confirma-cadastro">
                                <p className="text-sm text-amber-900"><b>Você mexeu em campos e não salvou.</b> Abrir o cadastro agora descarta a mudança.</p>
                                <div className="flex gap-2">
                                    <Botao onClick={() => setConfirma(null)} className="flex-1">Continuar editando</Botao>
                                    <Botao perigo onClick={() => navigate(`/clientes/${clienteId}`)} className="flex-1">Descartar e abrir</Botao>
                                </div>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Botao onClick={tentarFechar} className="flex-1">Fechar</Botao>
                            <Botao primario onClick={() => salvar(false)} disabled={!sujo || salvando} className="flex-1">
                                <span data-testid="ficha-salvar">{salvando ? 'Salvando…' : 'Salvar'}</span>
                            </Botao>
                        </div>
                    </div>
                )}
            </aside>
        </>,
        document.body
    );
};

export default FichaClienteCarteira;
