import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Truck, Pencil, X, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import tabelaPrecoService from '../../../services/tabelaPrecoService';
import formasPagamentoService from '../../../services/formasPagamentoService';
import vendedorService from '../../../services/vendedorService';
import SelectBusca from '../../../components/SelectBusca';
import { useFiltroSalvo } from '../../../hooks/useFiltrosSalvos';
import { somenteAtivos, rotuloVendedor } from '../../../utils/vendedoresFiltro';
import { papelResponsavel, ROTULO_PAPEL_CURTO, papelExigePessoa } from '../../../utils/responsavelCobranca';

const hojeISO = new Date().toISOString().slice(0, 10);

// Quem ficou de cobrar esta linha de pagamento. O PAPEL vem do backend
// (`responsavelPapel`), derivado no ponto único de `utils/responsavelCobranca` — nunca
// adivinhado por "tem vendedor? então é vendedor", que escrevia dívida de MOTORISTA
// como se fosse do vendedor.
const responsavelDoPagamento = (pg, vendedores) => {
    const papel = papelResponsavel(pg);
    if (!papel) return null;
    if (papel === 'ESCRITORIO') return 'Resp.: Escritório';
    const v = (vendedores || []).find(x => x.id === pg?.vendedorResponsavelId);
    const rotulo = ROTULO_PAPEL_CURTO[papel].toLowerCase();
    return v?.nome ? `Resp.: ${v.nome} (${rotulo})` : `Resp.: ${rotulo}`;
};

// Linha de pagamento em branco (usada ao abrir a edição sem pagamentos e no "Adicionar").
const LINHA_PGTO_VAZIA = {
    _selectId: '', formaPagamentoEntregaId: null, formaPagamentoNome: '', valor: '',
    responsavelPapel: null, vendedorResponsavelId: null
};

const AuditoriaEntregas = () => {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroDivergente, setFiltroDivergente] = useFiltroSalvo('auditoria-entregas:filtroDivergente', false);
    const [embarqueIdFilter, setEmbarqueIdFilter] = useState('');
    const [dataFilter, setDataFilter] = useState(hojeISO); // data padrão calculada (hoje) — não persistir
    const [motoristaFilter, setMotoristaFilter] = useState('');
    const [clienteFilter, setClienteFilter] = useState('');

    const [editandoEntrega, setEditandoEntrega] = useState(null);
    const [editPagamentos, setEditPagamentos] = useState([]);
    const [formasPagamento, setFormasPagamento] = useState([]);
    // Vendedores (ativos + inativos): o seletor de responsável oferece os ATIVOS, mas
    // precisa saber o nome de um inativo que já esteja marcado numa entrega antiga.
    const [vendedores, setVendedores] = useState([]);
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);

    const fetchAuditoria = async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtroDivergente) params.divergente = true;
            if (embarqueIdFilter) params.embarqueId = embarqueIdFilter;
            if (dataFilter) params.data = dataFilter;
            if (motoristaFilter) params.motorista = motoristaFilter;
            if (clienteFilter) params.cliente = clienteFilter;

            const response = await api.get('/entregas/auditoria', { params });
            setEntregas(response.data);
        } catch (error) {
            console.error('Erro ao buscar auditoria:', error);
            toast.error('Erro de conexão ao auditar as viagens.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        vendedorService.listarParaFiltro()
            .then(v => setVendedores(Array.isArray(v) ? v : []))
            .catch(() => setVendedores([]));
    }, []);

    useEffect(() => {
        const t = setTimeout(fetchAuditoria, 300);
        return () => clearTimeout(t);
    }, [filtroDivergente, embarqueIdFilter, dataFilter, motoristaFilter, clienteFilter]);

    const abrirEdicao = async (entrega) => {
        try {
            const [customForms, tabelaForms] = await Promise.all([
                formasPagamentoService.listar(),
                tabelaPrecoService.listar(true)
            ]);

            const ativas = customForms.filter(f => f.ativo).map(f => ({
                _selectId: f.id,
                nome: f.nome,
                formaPagamentoEntregaId: f.id,
            }));
            const nomesFormas = new Set(ativas.map(f => f.nome.toLowerCase().trim()));
            const tabelas = tabelaForms
                .filter(t => !nomesFormas.has(t.nomeCondicao.toLowerCase().trim()))
                .map(t => ({
                    _selectId: 'tabela_' + t.idCondicao,
                    nome: t.nomeCondicao,
                    formaPagamentoEntregaId: null,
                }));

            let todasFormas = [...tabelas, ...ativas];

            const nomeCond = (entrega.nomeCondicaoPagamento || entrega.opcaoCondicaoPagamento || '').toLowerCase();
            const tipoPed = (entrega.tipoPagamento || '').toLowerCase();
            const pedidoEhBoleto = nomeCond.includes('boleto') || tipoPed.includes('boleto');

            let condicaoPedido = null;
            if (entrega.nomeCondicaoPagamento)
                condicaoPedido = tabelaForms.find(t => t.nomeCondicao === entrega.nomeCondicaoPagamento);
            if (!condicaoPedido && entrega.idCondicaoResolvido)
                condicaoPedido = tabelaForms.find(t => t.idCondicao === entrega.idCondicaoResolvido);
            if (!condicaoPedido && (entrega.tipoPagamento || entrega.opcaoCondicaoPagamento)) {
                const chave = `${entrega.tipoPagamento || ''}|${entrega.opcaoCondicaoPagamento || ''}`;
                condicaoPedido = tabelaForms.find(t => `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}` === chave)
                    || tabelaForms.find(t => t.opcaoCondicao === entrega.opcaoCondicaoPagamento);
            }

            if (condicaoPedido?.formasRecebimentoPermitidas?.length > 0) {
                const permitidas = condicaoPedido.formasRecebimentoPermitidas;
                todasFormas = todasFormas.filter(f => permitidas.includes(f._selectId));
            }

            const idCondicaoResolvido = condicaoPedido?.idCondicao || entrega.idCondicaoResolvido || null;
            const selectIdPedido = idCondicaoResolvido ? 'tabela_' + idCondicaoResolvido : null;
            todasFormas = todasFormas.filter(f => {
                if (!f._selectId.startsWith('tabela_')) return true;
                if (selectIdPedido && f._selectId === selectIdPedido) return true;
                const nomeLower = f.nome.toLowerCase();
                if (pedidoEhBoleto) return nomeLower.includes('boleto');
                return !nomeLower.includes('boleto');
            });

            setFormasPagamento(todasFormas);

            // Mapeia pagamentos existentes para _selectId
            const pgIniciais = entrega.pagamentosReais?.length > 0
                ? entrega.pagamentosReais.map(pg => {
                    const selectId = pg.formaPagamentoEntregaId
                        ? pg.formaPagamentoEntregaId
                        : (todasFormas.find(f => f.nome === pg.formaPagamentoNome)?._selectId || '');
                    return {
                        _selectId: selectId,
                        formaPagamentoEntregaId: pg.formaPagamentoEntregaId || null,
                        formaPagamentoNome: pg.formaPagamentoNome,
                        valor: String(Number(pg.valor).toFixed(2)),
                        // Papel DERIVADO (linha gravada antes de 08/2026 tem o campo vazio) —
                        // sem isso a marcação antiga sumiria da tela e seria apagada ao salvar.
                        responsavelPapel: papelResponsavel(pg),
                        // Sem carregar (e reenviar) a pessoa responsável, editar o valor da
                        // entrega apagava o encargo do título — sem aviso nenhum na tela.
                        vendedorResponsavelId: pg.vendedorResponsavelId || null,
                    };
                })
                : [{ ...LINHA_PGTO_VAZIA }];

            setEditPagamentos(pgIniciais);
            setEditandoEntrega(entrega);
        } catch {
            toast.error('Erro ao carregar formas de pagamento.');
        }
    };

    // Só quem está na ativa pode ser ESCOLHIDO como responsável...
    const vendedoresAtivos = useMemo(() => somenteAtivos(vendedores), [vendedores]);

    // ...mas se a linha já estiver no nome de um vendedor inativo (ou de alguém que
    // sumiu do cadastro), ele entra na lista mesmo assim — senão o menu abriria vazio
    // e não haveria como TIRAR a marcação errada pela tela.
    const opcoesVendedorDaLinha = (pg) => {
        const lista = [...vendedoresAtivos];
        const id = pg?.vendedorResponsavelId;
        if (id && !lista.some(v => v.id === id)) {
            const conhecido = vendedores.find(v => v.id === id);
            lista.push(conhecido || { id, nome: 'Vendedor fora do cadastro', ativo: false });
        }
        return lista;
    };

    const atualizarPg = (idx, patch) => {
        setEditPagamentos(atual => atual.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    };

    const handleSalvarEdicao = async () => {
        const pagamentos = editPagamentos
            .filter(p => p.formaPagamentoNome && Number(p.valor) > 0)
            .map(p => ({
                formaPagamentoEntregaId: p._selectId?.startsWith('tabela_') ? null : (p.formaPagamentoEntregaId || null),
                formaPagamentoNome: p.formaPagamentoNome,
                valor: Number(p.valor),
                // O PAPEL vai SEMPRE, explícito — inclusive `null`, que é o que LIMPA a
                // marcação no servidor. (Omitir os campos faria a linha HERDAR o que estava:
                // o oposto do que o botão "Tirar responsável" promete na tela.)
                responsavelPapel: p.responsavelPapel || null,
                // A pessoa acompanha VENDEDOR e MOTORISTA; no escritório vai vazia.
                vendedorResponsavelId: papelExigePessoa(p.responsavelPapel) ? (p.vendedorResponsavelId || null) : null,
            }));

        if (pagamentos.length === 0) {
            toast.error('Informe ao menos um pagamento válido.');
            return;
        }

        // O servidor recusa (400) papel de pessoa sem pessoa — avisar aqui, com o nome do
        // papel, em vez de deixar o escritório levar erro genérico depois de salvar.
        const semPessoa = pagamentos.find(p => papelExigePessoa(p.responsavelPapel) && !p.vendedorResponsavelId);
        if (semPessoa) {
            toast.error(`Escolha quem é o ${ROTULO_PAPEL_CURTO[semPessoa.responsavelPapel].toLowerCase()} responsável pela cobrança.`);
            return;
        }

        setSalvandoEdicao(true);
        try {
            await api.patch(`/entregas/${editandoEntrega.id}/editar`, { pagamentos });
            toast.success('Pagamento atualizado com sucesso!');
            setEditandoEntrega(null);
            fetchAuditoria();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar alteração.');
        } finally {
            setSalvandoEdicao(false);
        }
    };

    const handleEstorno = async (pedidoId, cliente) => {
        if (!window.confirm(`ATENÇÃO FINANCEIRO: Tem certeza que deseja estornar a baixa de entrega do cliente ${cliente}? Essa ação apagará a entrada de dinheiro do caixa do motorista e devolverá o pedido para o Caminhão.`)) return;

        try {
            await api.delete(`/entregas/${pedidoId}/estorno`);
            toast.success('Check-in logístico estornado com sucesso!');
            fetchAuditoria();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro Crítico. Requer privilégio financeiro.');
        }
    };

    return (
        <div className="w-full py-4 md:py-6 px-3 md:px-6">
            <div className="flex items-center gap-3 mb-5">
                <div className="bg-amber-100 p-2 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Auditoria Logística</h1>
                    <p className="text-xs text-gray-500">Monitoramento contábil e reversão de viagens finalizadas.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-3 md:p-4 rounded-t-xl shadow-sm border border-gray-200 border-b-0 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Data</label>
                        <input
                            type="date"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={dataFilter}
                            onChange={(e) => setDataFilter(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Embarque</label>
                        <input
                            type="text"
                            placeholder="ID"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={embarqueIdFilter}
                            onChange={(e) => setEmbarqueIdFilter(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Motorista</label>
                        <input
                            type="text"
                            placeholder="Nome"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={motoristaFilter}
                            onChange={(e) => setMotoristaFilter(e.target.value)}
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Cliente / Nº Pedido</label>
                        <input
                            type="text"
                            placeholder="Nome ou número CA"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={clienteFilter}
                            onChange={(e) => setClienteFilter(e.target.value)}
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1 flex items-end">
                        <button
                            type="button"
                            onClick={() => { setDataFilter(hojeISO); setEmbarqueIdFilter(''); setMotoristaFilter(''); setClienteFilter(''); setFiltroDivergente(false); }}
                            className="w-full px-2 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md"
                        >
                            Limpar filtros
                        </button>
                    </div>
                </div>
                <label className="flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                        checked={filtroDivergente}
                        onChange={(e) => setFiltroDivergente(e.target.checked)}
                    />
                    <span className="ml-2 text-[12px] md:text-sm text-gray-900 font-medium">
                        Apenas Divergências
                    </span>
                </label>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow-sm rounded-b-xl border border-gray-200 border-t-0">
                <table className="w-full table-fixed divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-[11%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                            <th className="w-[10%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Viagem / Resp.</th>
                            <th className="w-[22%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">NF / Cliente</th>
                            <th className="w-[10%] px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="w-[37%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Caixa / Devoluções</th>
                            <th className="w-[10%] px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading ? (
                            <tr><td colSpan="6" className="py-10">
                                <div className="flex items-center justify-center gap-2 text-gray-500">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
                                    <span className="text-sm">Varrendo histórico logístico…</span>
                                </div>
                            </td></tr>
                        ) : entregas.length === 0 ? (
                            <tr><td colSpan="6" className="py-10">
                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <Truck className="h-10 w-10 text-gray-200" />
                                    <span className="text-sm">Nenhuma viagem finalizada encontrada.</span>
                                </div>
                            </td></tr>
                        ) : entregas.map((entrega) => (
                            <tr key={entrega.id} className={entrega.divergenciaPagamento ? "bg-amber-50" : "hover:bg-gray-50"}>
                                <td className="px-4 py-4 text-gray-500 text-xs">
                                    {new Date(entrega.dataEntrega).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-4 py-4 text-gray-900 font-medium">
                                    <div className="flex flex-col">
                                        <span className="flex items-center font-mono"><Truck className="h-3 w-3 mr-1" /> #{entrega.embarque?.numero}</span>
                                        <span className="text-xs text-gray-500">{entrega.embarque?.responsavel?.nome}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900 break-words">{entrega.cliente?.NomeFantasia || entrega.cliente?.Nome || <span className="text-gray-400 italic font-normal">Sem cadastro</span>}</span>
                                        <span className="text-xs text-gray-500 font-mono">Ped CA: {entrega.numero || 'S/N'}</span>
                                    </div>
                                    {entrega.gpsEntrega && (
                                        <a href={`https://www.google.com/maps?q=${entrega.gpsEntrega}`} target="_blank" rel="noreferrer" className="text-[10px] text-sky-600 hover:underline inline-block mt-1">
                                            Ver no Mapa
                                        </a>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-center">
                                    {entrega.statusEntrega === 'ENTREGUE' && <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded-full">ENTREGUE</span>}
                                    {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="px-2 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">PARCIAL</span>}
                                    {entrega.statusEntrega === 'DEVOLVIDO' && <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded-full">DEVOLVIDO</span>}
                                </td>
                                <td className="px-4 py-4 text-xs">
                                    {entrega.divergenciaPagamento && (
                                        <div className="text-amber-700 font-bold mb-1 flex items-center">
                                            <AlertTriangle className="h-3 w-3 mr-1" /> Divergência de Pagamento
                                        </div>
                                    )}
                                    {entrega.pagamentosReais?.length > 0 ? (
                                        <div className="space-y-1">
                                            {entrega.pagamentosReais.map(pg => (
                                                <div key={pg.id} className="text-green-700">
                                                    + R$ {Number(pg.valor).toFixed(2)} ({pg.formaPagamentoNome})
                                                    {responsavelDoPagamento(pg, vendedores) && (
                                                        <span className="ml-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">
                                                            {responsavelDoPagamento(pg, vendedores)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : <span className="text-gray-400 italic">Sem valor apurado.</span>}
                                    {entrega.itensDevolvidos?.length > 0 && (
                                        <div className="mt-2 border-t pt-1 space-y-1">
                                            <strong className="text-red-600">Devolvidos:</strong>
                                            {entrega.itensDevolvidos.map(it => (
                                                <div key={it.id} className="text-gray-600">
                                                    - {it.quantidade}x {it.produto?.nome} (R$ {(Number(it.quantidade) * Number(it.valorBaseItem)).toFixed(2)})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => abrirEdicao(entrega)}
                                            className="text-sky-600 hover:text-sky-900 bg-sky-50 p-2 rounded-md transition-colors"
                                            title="Editar pagamento"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleEstorno(entrega.id, entrega.cliente?.NomeFantasia)}
                                            className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-md transition-colors"
                                        >
                                            Estornar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-2 mt-2">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
                        <span className="text-sm">Varrendo histórico…</span>
                    </div>
                ) : entregas.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                        <Truck className="h-10 w-10 text-gray-200" />
                        <span className="text-sm">Nenhuma viagem encontrada.</span>
                    </div>
                ) : entregas.map(entrega => (
                    <div key={entrega.id} className={`bg-white rounded-xl border shadow-sm p-3 ${entrega.divergenciaPagamento ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {entrega.statusEntrega === 'ENTREGUE' && <span className="text-[10px] font-bold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">ENTREGUE</span>}
                                {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">PARCIAL</span>}
                                {entrega.statusEntrega === 'DEVOLVIDO' && <span className="text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">DEVOLVIDO</span>}
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5 font-mono"><Truck className="h-3 w-3" />#{entrega.embarque?.numero}</span>
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(entrega.dataEntrega).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="font-bold text-[13px] text-gray-900">{entrega.cliente?.NomeFantasia || entrega.cliente?.Nome || <span className="text-gray-400 italic font-normal">Sem cadastro</span>}</p>
                        <p className="text-[11px] text-gray-500">{entrega.embarque?.responsavel?.nome}</p>

                        {entrega.divergenciaPagamento && (
                            <div className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Divergência de Pagamento
                            </div>
                        )}

                        {entrega.pagamentosReais?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {entrega.pagamentosReais.map(pg => (
                                    <React.Fragment key={pg.id}>
                                        <span className="text-[10px] bg-green-50 text-green-700 px-1 py-0.5 rounded font-mono">
                                            {pg.formaPagamentoNome}: R$ {Number(pg.valor).toFixed(2)}
                                        </span>
                                        {responsavelDoPagamento(pg, vendedores) && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                {responsavelDoPagamento(pg, vendedores)}
                                            </span>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}

                        {entrega.itensDevolvidos?.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                                {entrega.itensDevolvidos.map(it => (
                                    <p key={it.id} className="text-[10px] text-red-600">- {it.quantidade}x {it.produto?.nome}</p>
                                ))}
                            </div>
                        )}

                        <div className="mt-2 flex gap-2">
                            <button
                                onClick={() => abrirEdicao(entrega)}
                                className="flex-1 text-[11px] font-semibold text-sky-600 bg-sky-50 py-1.5 rounded-lg border border-sky-200 flex items-center justify-center gap-1"
                            >
                                <Pencil className="h-3 w-3" /> Editar
                            </button>
                            <button
                                onClick={() => handleEstorno(entrega.id, entrega.cliente?.NomeFantasia)}
                                className="flex-1 text-[11px] font-semibold text-red-600 bg-red-50 py-1.5 rounded-lg border border-red-200"
                            >
                                Estornar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

        {/* Modal Editar Pagamento */}
        {editandoEntrega && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">Editar Pagamentos</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {editandoEntrega.cliente?.NomeFantasia || editandoEntrega.cliente?.Nome} — Ped CA: {editandoEntrega.numero}
                            </p>
                        </div>
                        <button onClick={() => setEditandoEntrega(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="px-4 md:px-5 py-4 space-y-3 max-h-[60vh] md:max-h-96 overflow-y-auto">
                        {editPagamentos.map((pg, idx) => {
                            const papel = pg.responsavelPapel || null;
                            const opcoesPapel = [
                                { valor: 'MOTORISTA', texto: 'Motorista' },
                                { valor: 'ESCRITORIO', texto: 'Escritório' },
                                { valor: 'VENDEDOR', texto: 'Vendedor' }
                            ];
                            return (
                            <div key={idx} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
                                <div className="flex gap-2 items-start">
                                    <div className="flex-1 space-y-1.5 min-w-0">
                                        <SelectBusca
                                            className="w-full"
                                            value={pg._selectId || ''}
                                            onChange={(e) => {
                                                const selected = formasPagamento.find(f => f._selectId === e.target.value);
                                                atualizarPg(idx, {
                                                    _selectId: selected?._selectId || '',
                                                    formaPagamentoEntregaId: selected?.formaPagamentoEntregaId || null,
                                                    formaPagamentoNome: selected?.nome || '',
                                                });
                                            }}
                                        >
                                            <option value="">Selecionar forma...</option>
                                            {formasPagamento.map(f => (
                                                <option key={f._selectId} value={f._selectId}>{f.nome}</option>
                                            ))}
                                        </SelectBusca>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Valor (R$)"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            value={pg.valor}
                                            onChange={(e) => atualizarPg(idx, { valor: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setEditPagamentos(editPagamentos.filter((_, i) => i !== idx))}
                                        className="mt-1 text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50"
                                        title="Remover esta linha de pagamento"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                {/* Quem fica responsável por COBRAR o que ficou nesta linha.
                                    Três papéis desde 08/2026 (motorista deixou de ser gravado
                                    como se fosse vendedor). Sem este bloco, marcação errada só
                                    saía por SQL. */}
                                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                            Responsável por cobrar
                                        </span>
                                        {papel && (
                                            <button
                                                onClick={() => atualizarPg(idx, { responsavelPapel: null, vendedorResponsavelId: null })}
                                                className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-full hover:bg-red-50"
                                            >
                                                Tirar responsável
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {opcoesPapel.map(op => (
                                            <button
                                                key={op.valor}
                                                type="button"
                                                onClick={() => atualizarPg(idx, {
                                                    responsavelPapel: op.valor,
                                                    // Escritório não tem pessoa; trocar de papel
                                                    // não pode deixar o id do papel anterior para trás.
                                                    vendedorResponsavelId: papelExigePessoa(op.valor) ? pg.vendedorResponsavelId : null
                                                })}
                                                className={`min-h-[44px] md:min-h-0 md:py-2 px-2 py-2 rounded-full text-xs font-bold border transition-colors ${papel === op.valor
                                                    ? 'bg-primary border-primary text-white shadow-sm'
                                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                            >
                                                {op.texto}
                                            </button>
                                        ))}
                                    </div>

                                    {papelExigePessoa(papel) && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Qual {ROTULO_PAPEL_CURTO[papel].toLowerCase()}?
                                            </label>
                                            <SelectBusca
                                                className="w-full"
                                                value={pg.vendedorResponsavelId || ''}
                                                onChange={(e) => atualizarPg(idx, { vendedorResponsavelId: e.target.value || null })}
                                            >
                                                <option value="">Escolher pessoa...</option>
                                                {opcoesVendedorDaLinha(pg).map(v => (
                                                    <option key={v.id} value={v.id}>{rotuloVendedor(v)}</option>
                                                ))}
                                            </SelectBusca>
                                            {!pg.vendedorResponsavelId && (
                                                <p className="text-xs font-semibold text-red-600 mt-1">
                                                    Escolha a pessoa — sem ela o servidor recusa a alteração.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {papel === 'ESCRITORIO' && (
                                        <p className="text-xs text-gray-500">Fica com o escritório — sem pessoa específica.</p>
                                    )}
                                    {papel && (
                                        <p className="text-xs text-gray-500">
                                            A marcação é desta linha: trocar a forma de pagamento acima NÃO tira o responsável.
                                        </p>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                        <button
                            onClick={() => setEditPagamentos([...editPagamentos, { ...LINHA_PGTO_VAZIA }])}
                            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                        >
                            <Plus className="h-3.5 w-3.5" /> Adicionar pagamento
                        </button>
                    </div>

                    <div className="px-5 py-4 border-t flex justify-end gap-3">
                        <button
                            onClick={() => setEditandoEntrega(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full min-h-[44px] md:min-h-0"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSalvarEdicao}
                            disabled={salvandoEdicao}
                            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primaryDark disabled:opacity-50 rounded-full shadow-sm min-h-[44px] md:min-h-0"
                        >
                            {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
    );
};

export default AuditoriaEntregas;
