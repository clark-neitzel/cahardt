import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Phone, MessageCircle, ExternalLink, Loader2, Save, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../../services/clienteService';
import SelectBusca from '../../../components/SelectBusca';
import DayPicker from '../../../components/DayPicker';
import ModalWhatsappCliente from '../../../components/ModalWhatsappCliente';

// Ficha resumida + EDIÇÃO RÁPIDA (dia de entrega, dia de venda, categoria,
// vendedor). Salvar manda SÓ os campos alterados + origem:'mapa-clientes' para
// PATCH /clientes/:uuid (formato "SEG, QUI" do DayPicker; '' limpa).
// WhatsApp/celular NÃO vai neste body: usa o ModalWhatsappCliente, que já faz o
// PATCH próprio e trata 403 ("já tem número") / 400 (WHATSAPP_NAO_EXISTE).
// Erro ao salvar: toast, painel continua aberto com os valores digitados.

const SITUACAO = {
    SEM_NUMERO: { rotulo: 'Sem número', classe: 'bg-gray-100 text-gray-700' },
    DISPENSADO: { rotulo: 'Dispensado', classe: 'bg-amber-100 text-amber-700' },
    COM_PROBLEMA: { rotulo: 'Número com problema', classe: 'bg-red-100 text-red-700' },
    EM_USO: { rotulo: 'WhatsApp em uso', classe: 'bg-green-100 text-green-800' },
    SEM_HISTORICO: { rotulo: 'Sem histórico', classe: 'bg-blue-100 text-blue-800' },
};

const fmtData = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
};

export default function DrawerCliente({ cliente, categorias, vendedoresAtivos, onSalvo, onFechar }) {
    const [form, setForm] = useState({ Dia_de_entrega: '', Dia_de_venda: '', categoriaClienteId: '', idVendedor: '' });
    const [salvando, setSalvando] = useState(false);
    // Ref, não só state: dois cliques no mesmo frame passariam pelo `salvando`
    // ainda false e gravariam 2 PATCH (+ 2 audit_logs).
    const salvandoRef = useRef(false);
    const [modalWpp, setModalWpp] = useState(false);

    // Reinicia o formulário quando muda o cliente (ou quando ele é recarregado)
    useEffect(() => {
        if (!cliente) return;
        setForm({
            Dia_de_entrega: cliente.diaEntregaRaw || '',
            Dia_de_venda: cliente.diaVendaRaw || '',
            categoriaClienteId: cliente.categoriaId || '',
            idVendedor: cliente.vendedorId || '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cliente?.uuid]);

    const original = useMemo(() => cliente ? ({
        Dia_de_entrega: cliente.diaEntregaRaw || '',
        Dia_de_venda: cliente.diaVendaRaw || '',
        categoriaClienteId: cliente.categoriaId || '',
        idVendedor: cliente.vendedorId || '',
    }) : null, [cliente]);

    const alterados = useMemo(() => {
        if (!original) return {};
        const out = {};
        Object.keys(form).forEach(k => { if ((form[k] || '') !== (original[k] || '')) out[k] = form[k] || ''; });
        return out;
    }, [form, original]);
    const temMudanca = Object.keys(alterados).length > 0;

    // Vendedor atual pode estar inativo: mantém como opção para não "sumir" do campo
    const opcoesVendedor = useMemo(() => {
        const lista = [...(vendedoresAtivos || [])];
        if (cliente?.vendedorId && !lista.some(v => v.id === cliente.vendedorId)) {
            lista.push({ id: cliente.vendedorId, nome: `${cliente.vendedorNome || 'Vendedor'} (inativo)` });
        }
        return lista;
    }, [vendedoresAtivos, cliente]);

    if (!cliente) return null;

    const salvar = async () => {
        if (salvandoRef.current || !temMudanca) return;
        salvandoRef.current = true;
        setSalvando(true);
        try {
            await clienteService.atualizar(cliente.uuid, { ...alterados, origem: 'mapa-clientes' });
            toast.success('Cliente atualizado');
            const patch = {};
            if (alterados.Dia_de_entrega !== undefined) patch.Dia_de_entrega = alterados.Dia_de_entrega;
            if (alterados.Dia_de_venda !== undefined) patch.Dia_de_venda = alterados.Dia_de_venda;
            if (alterados.categoriaClienteId !== undefined) {
                patch.categoriaId = alterados.categoriaClienteId || null;
                patch.categoriaNome = (categorias || []).find(c => c.id === alterados.categoriaClienteId)?.nome || null;
            }
            if (alterados.idVendedor !== undefined) {
                const v = opcoesVendedor.find(x => x.id === alterados.idVendedor);
                patch.vendedorId = alterados.idVendedor || null;
                patch.vendedorNome = v?.nome || null;
                patch.vendedorAtivo = v ? v.ativo !== false : true;
            }
            onSalvo?.(cliente.uuid, patch);
        } catch (e) {
            console.error('[MapaClientes] salvar', e);
            toast.error(e?.response?.data?.error || 'Não foi possível salvar. Tente de novo.');
        } finally {
            salvandoRef.current = false;
            setSalvando(false);
        }
    };

    const sit = SITUACAO[cliente.whatsapp?.situacao] || SITUACAO.SEM_NUMERO;
    const ultimo = fmtData(cliente.ultimoPedidoEm);
    const nomeExibicao = cliente.fantasia || cliente.nome || 'Cliente';
    const linhaCompra = cliente.diasSemComprar != null
        ? `${cliente.diasSemComprar}d sem comprar${cliente.cicloDias != null ? ` · ciclo ${cliente.cicloDias}d` : ''}`
        : null;

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{nomeExibicao}</p>
                    {cliente.fantasia && cliente.nome && <p className="text-xs text-gray-500 truncate">{cliente.nome}</p>}
                    <p className="text-xs text-gray-500 truncate">
                        {[cliente.bairro, cliente.cidade].filter(Boolean).join(' · ') || 'Sem endereço'}
                    </p>
                </div>
                <button type="button" aria-label="Fechar" onClick={onFechar} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {cliente.ativo === false && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Inativo</span>}
                {cliente.balcao && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 inline-flex items-center gap-1"><Store className="h-3 w-3" /> Cliente balcão</span>}
                {!cliente.gps && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Sem ponto GPS</span>}
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sit.classe}`}>{sit.rotulo}</span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-sm space-y-1.5">
                <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate">{cliente.telefone || <span className="text-gray-400">Sem telefone</span>}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                    <MessageCircle className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate flex-1">{cliente.telefoneCelular || <span className="text-gray-400">Sem celular/WhatsApp</span>}</span>
                    <button type="button" onClick={() => setModalWpp(true)} className="px-3 py-1.5 min-h-[36px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium shrink-0">
                        {cliente.telefoneCelular ? 'Alterar WhatsApp' : 'Cadastrar WhatsApp'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 pt-1">
                    {ultimo ? `Último pedido: ${ultimo}` : 'Sem pedido registrado'}
                    {linhaCompra ? ` · ${linhaCompra}` : ''}
                </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Edição rápida</p>
                <DayPicker compacto label="Dia de entrega" selected={form.Dia_de_entrega} onChange={v => setForm(f => ({ ...f, Dia_de_entrega: v }))} />
                <DayPicker compacto label="Dia de venda" selected={form.Dia_de_venda} onChange={v => setForm(f => ({ ...f, Dia_de_venda: v }))} />
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                    <SelectBusca value={form.categoriaClienteId} onChange={e => setForm(f => ({ ...f, categoriaClienteId: e.target.value }))} className="w-full">
                        <option value="">Sem categoria</option>
                        {(categorias || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </SelectBusca>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
                    <SelectBusca value={form.idVendedor} onChange={e => setForm(f => ({ ...f, idVendedor: e.target.value }))} className="w-full">
                        <option value="">Sem vendedor</option>
                        {opcoesVendedor.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </SelectBusca>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                    <Link to={`/clientes/${cliente.uuid}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline min-h-[36px]">
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir ficha completa
                    </Link>
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={salvando || !temMudanca}
                        className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] bg-primary hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full shadow-sm font-semibold text-sm"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {salvando ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>

            <ModalWhatsappCliente
                aberto={modalWpp}
                onFechar={() => setModalWpp(false)}
                clienteUuid={cliente.uuid}
                clienteNome={nomeExibicao}
                numeroAtual={cliente.telefoneCelular || ''}
                rotuloSalvar="Salvar"
                permitirDispensa={false}
                onSalvo={({ numero } = {}) => {
                    setModalWpp(false);
                    if (numero) onSalvo?.(cliente.uuid, { telefoneCelular: numero });
                }}
            />
        </div>
    );
}
