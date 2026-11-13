import { useCallback, useEffect, useState } from 'react';
import { History, ArrowRight, Loader2 } from 'lucide-react';
import clienteService from '../../services/clienteService';
import EstadoVazio from '../../components/EstadoVazio';

const POR_PAGINA = 30;

// Nome do campo em português (o servidor guarda o nome técnico da coluna).
const ROTULOS_CAMPO = {
    Nome: 'Razão social / nome',
    NomeFantasia: 'Nome fantasia',
    Documento: 'CNPJ/CPF',
    Tipo_Pessoa: 'Tipo de pessoa',
    Email: 'E-mail',
    Telefone: 'Telefone',
    Telefone_Celular: 'Celular / WhatsApp',
    Whatsapps: 'WhatsApps vinculados',
    Inscricao_Estadual: 'Inscrição estadual',
    Indicador_Inscricao_Estadual: 'Indicador de IE',
    Ativo: 'Situação (ativo)',
    End_Logradouro: 'Endereço — rua',
    End_Numero: 'Endereço — número',
    End_Complemento: 'Endereço — complemento',
    End_Bairro: 'Endereço — bairro',
    End_Cidade: 'Endereço — cidade',
    End_Estado: 'Endereço — UF',
    End_CEP: 'Endereço — CEP',
    Ponto_GPS: 'Ponto no mapa (GPS)',
    Dia_de_entrega: 'Dia de entrega',
    Dia_de_venda: 'Dia de venda',
    idVendedor: 'Vendedor',
    Formas_Atendimento: 'Formas de atendimento',
    Condicao_de_pagamento: 'Condição de pagamento',
    condicoes_pagamento_permitidas: 'Condições de pagamento permitidas',
    indicacaoId: 'Indicação',
    categoriaClienteId: 'Tipo de cliente',
    cicloCompraPersonalizadoDias: 'Ciclo de compra (dias)',
    insightAtivo: 'Insight ativo',
    observacaoComercialFixa: 'Observação comercial fixa',
    recebeAvisoPedido: 'Recebe aviso de pedido',
    Observacoes_Gerais: 'Observações gerais',
    Perfis: 'Perfis (cliente/fornecedor)',
    cadastro: 'Cadastro',
};

const ROTULOS_CAMPO_CONTATO = {
    nome: 'Nome', telefone: 'Telefone', papel: 'Papel', nota: 'Nota',
    ultimoContatoEm: 'Última conversa', contato: 'Pessoa',
};

const BOOLEANOS = new Set(['Ativo', 'insightAtivo', 'recebeAvisoPedido']);

const ORIGENS = { app: 'Aplicativo', api_agente: 'Agente (API)', sistema: 'Sistema' };

function rotuloCampo(l) {
    const tabela = l.entidade === 'contato' ? ROTULOS_CAMPO_CONTATO : ROTULOS_CAMPO;
    const base = tabela[l.campo] || l.campo;
    return l.entidade === 'contato' && l.campo !== 'contato' ? `Contato — ${base}` : (l.entidade === 'contato' ? 'Contato (pessoa do WhatsApp)' : base);
}

function formatarValor(l, bruto, rotulo) {
    if (bruto === null || bruto === undefined || bruto === '') return null;
    if (rotulo) return rotulo;
    if (BOOLEANOS.has(l.campo)) return bruto === 'true' ? 'Sim' : (bruto === 'false' ? 'Não' : bruto);
    if (l.campo === 'ultimoContatoEm') return formatarQuando(bruto) || bruto;
    return bruto;
}

function formatarQuando(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function textoOrigem(l) {
    const base = ORIGENS[l.origem] || l.origem;
    return l.tela ? `${base} · ${l.tela}` : base;
}

function Valor({ texto, vazio = '(vazio)' }) {
    if (texto === null) return <span className="text-gray-500 italic">{vazio}</span>;
    return <span className="text-gray-900 break-words">{texto}</span>;
}

function Mudanca({ l }) {
    const de = formatarValor(l, l.valorAntigo, l.valorAntigoRotulo);
    const para = formatarValor(l, l.valorNovo, l.valorNovoRotulo);
    if (l.acao === 'criado') return <span className="text-sm text-gray-600">Criado: <Valor texto={para} /></span>;
    if (l.acao === 'excluido') return <span className="text-sm text-gray-600">Excluído: <Valor texto={de} /></span>;
    return (
        <span className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <Valor texto={de} />
            <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <Valor texto={para} vazio="(apagado)" />
        </span>
    );
}

export default function HistoricoAlteracoesCliente({ clienteId }) {
    const [linhas, setLinhas] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [carregando, setCarregando] = useState(true);
    const [carregandoMais, setCarregandoMais] = useState(false);
    const [erro, setErro] = useState('');

    const buscar = useCallback(async (p) => {
        const r = await clienteService.listarAlteracoes(clienteId, { pagina: p, limite: POR_PAGINA });
        return r;
    }, [clienteId]);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        setErro('');
        buscar(1)
            .then((r) => { if (vivo) { setLinhas(r.data || []); setTotal(r.total || 0); setPagina(1); } })
            .catch((e) => { if (vivo) setErro(e?.response?.data?.error || 'Não foi possível carregar o histórico.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [buscar]);

    const carregarMais = async () => {
        if (carregandoMais) return;
        setCarregandoMais(true);
        try {
            const r = await buscar(pagina + 1);
            setLinhas((atual) => {
                const ids = new Set(atual.map((x) => x.id));
                return [...atual, ...(r.data || []).filter((x) => !ids.has(x.id))];
            });
            setTotal(r.total || 0);
            setPagina(pagina + 1);
        } catch (e) {
            setErro(e?.response?.data?.error || 'Não foi possível carregar mais.');
        } finally {
            setCarregandoMais(false);
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <History className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Alterações no cadastro</span>
                {total > 0 && <span className="ml-auto text-xs text-gray-500">{total} {total === 1 ? 'registro' : 'registros'}</span>}
            </div>

            {carregando ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : erro && linhas.length === 0 ? (
                <p className="p-5 text-sm text-red-700">{erro}</p>
            ) : linhas.length === 0 ? (
                <EstadoVazio icon={History} titulo="Nenhuma alteração registrada" descricao="As mudanças feitas neste cadastro a partir de agora aparecem aqui, com quem fez e quando." />
            ) : (
                <>
                    <p className="px-5 pt-3 text-xs text-gray-500">Uso interno. O histórico só cresce: ninguém consegue editar ou apagar um registro.</p>
                    {/* Mobile: cards */}
                    <div className="md:hidden space-y-3 p-3">
                        {linhas.map((l) => (
                            <div key={l.id} className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-gray-900 text-sm">{rotuloCampo(l)}</span>
                                    <span className="text-xs text-gray-500 shrink-0">{formatarQuando(l.em)}</span>
                                </div>
                                <Mudanca l={l} />
                                <div className="text-xs text-gray-500 mt-2">{l.autor?.nome || '—'} · {textoOrigem(l)}</div>
                            </div>
                        ))}
                    </div>
                    {/* Desktop: tabela */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['Data e hora', 'Quem', 'Origem', 'Campo', 'Antes → Depois'].map((h) => (
                                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {linhas.map((l) => (
                                    <tr key={l.id} className="hover:bg-gray-50 align-top">
                                        <td className="px-5 py-3 text-gray-900 whitespace-nowrap">{formatarQuando(l.em)}</td>
                                        <td className="px-5 py-3 text-gray-900">{l.autor?.nome || '—'}</td>
                                        <td className="px-5 py-3 text-gray-600">{textoOrigem(l)}</td>
                                        <td className="px-5 py-3 text-gray-900">{rotuloCampo(l)}</td>
                                        <td className="px-5 py-3 max-w-md"><Mudanca l={l} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {erro && <p className="px-5 pb-2 text-sm text-red-700">{erro}</p>}
                    {linhas.length < total && (
                        <div className="p-4 flex justify-center border-t border-gray-100">
                            <button
                                type="button"
                                onClick={carregarMais}
                                disabled={carregandoMais}
                                className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-60"
                            >
                                {carregandoMais ? 'Carregando…' : `Carregar mais (${total - linhas.length} restantes)`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
