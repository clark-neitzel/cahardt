import React, { useState, useEffect } from 'react';
import {
    X, MapPin, Navigation, Phone, Mail, Package,
    Calendar, DollarSign, User, FileText, Save,
    Loader, CheckCircle, ExternalLink, AlertCircle, Lock, ClipboardList, Copy, History
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clienteService from '../../services/clienteService';
import toast from 'react-hot-toast';
import HistoricoModal from './HistoricoModal';
import ModalPontoGps from '../../components/ModalPontoGps';
import { formatarDoc, normalizarDoc } from '../../utils/documento'; // inclui CNPJ ALFANUMÉRICO
import { abrirLinkExterno } from '../../utils/linkExterno';

const formatDoc = (doc) => {
    if (!doc) return null;
    const d = normalizarDoc(doc);
    return (d.length === 11 || d.length === 14) ? formatarDoc(d) : doc;
};

// O banco grava 'FISICA'/'JURIDICA' (e há registros antigos com 'F'/'J').
// Comparar com 'F' seco fazia CPF de pessoa física aparecer rotulado como CNPJ.
// Sem tipo confiável, o tamanho do documento decide (11 dígitos = CPF, 14 = CNPJ).
const ehPessoaFisica = (tipo, doc) => {
    const t = String(tipo || '').trim().toUpperCase();
    if (t.startsWith('J')) return false;   // J / JURIDICA
    if (t.startsWith('F')) return true;    // F / FISICA / FÍSICA
    return normalizarDoc(doc || '').length === 11;
};

// Campos do cadastro que esta barra lateral mostra.
// Algumas telas entregam um cliente RESUMIDO: o painel de Atendimentos, por exemplo,
// recebe da listagem só UUID/Nome/NomeFantasia/Cidade/Celular (select enxuto de
// atendimentoService — aquela rota carrega a base inteira, não pode trafegar dado
// pessoal à toa). Nesse objeto a chave nem EXISTE (é diferente de existir valendo
// null) — e é exatamente isso que distingue "cliente sem telefone cadastrado" de
// "telefone que ainda não foi carregado". Faltando qualquer uma, buscamos o cadastro
// completo por UUID e a tela fica igual à da Rota.
const CAMPOS_COMPLETOS = [
    'Telefone', 'Email', 'Documento', 'Tipo_Pessoa',
    'End_Logradouro', 'End_Bairro', 'End_Estado', 'End_CEP',
    'Dia_de_venda', 'Dia_de_entrega', 'Condicao_de_pagamento',
    'Ponto_GPS', 'Observacoes_Gerais', 'Situacao_serasa',
];
// O LEAD tem exatamente o mesmo problema: o painel de Atendimentos manda o lead com
// só id/nomeEstabelecimento/numero (select de atendimentoService) — SEM pontoGps.
// Sem essas chaves a ficha não sabe nada do lead e busca o cadastro por id
// (GET /leads/:id → leadService.buscarPorId devolve o lead inteiro).
const CAMPOS_COMPLETOS_LEAD = [
    'contato', 'whatsapp', 'diasVisita', 'horarioAtendimento',
    'pontoGps', 'etapa', 'proximaVisita', 'observacoes',
];
const estaCompleto = (c, campos) => !!c && campos.every(k => k in c);

const Skel = ({ w = 'w-full' }) => <div className={`h-3 ${w} bg-gray-200 rounded animate-pulse`} />;
const BlocoCarregando = () => (
    <div className="space-y-2 py-2">
        <Skel w="w-2/3" /><Skel w="w-1/2" /><Skel w="w-3/4" />
    </div>
);

// Enquanto o cadastro completo não chega, o popup NÃO sabe se existe ponto GPS.
// Dizer "sem ponto GPS cadastrado" aqui é mentira para quem TEM ponto — e o botão
// de definir/salvar ponto gravaria por cima do ponto que já existe. Vale para
// cliente E para lead (o lead nem tem histórico de ponto para desfazer).
const GpsIndefinido = ({ carregando, onTentar, podeTentar = true }) => (
    <div className="space-y-2">
        {carregando ? (
            <p className="flex items-center gap-2 text-[12px] text-gray-500">
                <Loader className="h-3.5 w-3.5 animate-spin" /> Carregando o ponto GPS...
            </p>
        ) : (
            <>
                <p className="flex items-start gap-2 text-[12px] text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Não foi possível carregar o ponto GPS deste cadastro. Para não apagar um ponto
                    que já exista, a gravação fica bloqueada até o cadastro carregar.
                </p>
                {podeTentar && (
                    <button
                        onClick={onTentar}
                        className="w-full min-h-[44px] py-2.5 text-[13px] font-bold rounded-full border border-primary text-primary bg-white hover:bg-mint/40 transition-colors"
                    >
                        Tentar de novo
                    </button>
                )}
            </>
        )}
    </div>
);

const DataRow = ({ label, value, icon: Icon }) => {
    if (!value) return null;
    return (
        <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
            {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-[13px] text-gray-800 font-medium break-words">{value}</p>
            </div>
        </div>
    );
};

// Últimas alterações do ponto GPS: quem fez, o que fez e quando (data + hora)
const STATUS_GPS_BADGE = {
    PENDENTE: ['bg-amber-100 text-amber-700', 'AGUARDA APROVAÇÃO'],
    REJEITADO: ['bg-red-100 text-red-700', 'REJEITADO'],
    DESFEITO: ['bg-gray-100 text-gray-600', 'DESFEITO'],
};
const HistoricoGpsLista = ({ logs, temPonto }) => {
    if (!logs) return null;
    const fmtDist = (m) => m == null ? '' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
    const acaoDe = (h) =>
        h.tipo === 'BALCAO_ON' ? 'marcou como balcão' :
            h.tipo === 'BALCAO_OFF' ? 'tirou de balcão' :
                h.pontoNovo == null ? 'removeu o ponto' :
                    h.pontoAntigo == null ? 'definiu o primeiro ponto' :
                        `moveu o ponto ${fmtDist(h.distanciaM)}`;
    return (
        <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <History className="h-3 w-3" /> Últimas alterações do ponto
            </p>
            {logs.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">
                    {temPonto
                        ? 'Nenhuma alteração registrada — o ponto atual foi cadastrado antes do histórico existir (07/2026).'
                        : 'Nenhuma alteração registrada ainda.'}
                </p>
            ) : (
                <div className="space-y-1.5">
                    {logs.map(h => {
                        const d = new Date(h.criadoEm);
                        return (
                            <div key={h.id} className="text-[11px] text-gray-600 leading-snug">
                                <b className="text-gray-800">{h.autor || '—'}</b> {acaoDe(h)}
                                <span className="text-gray-400"> · {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} às {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                {h.status !== 'APLICADO' && (
                                    <span className={`ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full align-middle ${(STATUS_GPS_BADGE[h.status] || STATUS_GPS_BADGE.DESFEITO)[0]}`}>
                                        {(STATUS_GPS_BADGE[h.status] || [null, h.status])[1]}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// A ficha em si. NÃO é exportada direta: quem renderiza é o ClientePopup lá embaixo,
// que a monta com `key` = identidade do cadastro. Ver o comentário de lá — é o que
// garante que TODO o estado daqui (ponto GPS, cadastro carregado, histórico, avisos)
// pertence a UM cadastro só.
const ClientePopupFicha = ({ cliente: clienteProp, onClose, onAtualizado }) => {
    const { user } = useAuth();
    const podeEditarGPS = !!(user?.permissoes?.admin || user?.permissoes?.Pode_Editar_GPS || user?.permissoes?.clientes?.edit);
    const isLead = !!(clienteProp?.nomeEstabelecimento); // distingue Lead de Cliente

    // Objeto resumido → busca o cadastro completo: cliente por UUID (clienteService.detalhar),
    // LEAD por id (leadService.buscarPorId). Os dois precisam disso: quem chega resumido
    // não traz o ponto GPS, e sem ele não dá para oferecer gravar ponto nenhum.
    const chaveBusca = isLead ? clienteProp?.id : clienteProp?.UUID;
    const precisaCarregar = !!chaveBusca
        && !estaCompleto(clienteProp, isLead ? CAMPOS_COMPLETOS_LEAD : CAMPOS_COMPLETOS);
    const [clienteCompleto, setClienteCompleto] = useState(null);
    const [carregandoCliente, setCarregandoCliente] = useState(precisaCarregar);
    const [falhouCarregar, setFalhouCarregar] = useState(false);
    const [tentativa, setTentativa] = useState(0);
    const tentarDeNovo = () => setTentativa(t => t + 1);
    // Daqui para baixo o componente lê SEMPRE o objeto mais completo que tem em mãos.
    const cliente = clienteCompleto || clienteProp;
    const dadosCarregados = !precisaCarregar || !!clienteCompleto;
    const nome = isLead ? cliente.nomeEstabelecimento : (cliente.Nome || '');
    const fantasia = isLead ? null : cliente.NomeFantasia;
    const doc = !isLead ? formatDoc(cliente.Documento) : null;
    const pessoaFisica = !isLead && ehPessoaFisica(cliente.Tipo_Pessoa, cliente.Documento);

    const [gpsInput, setGpsInput] = useState(
        (isLead ? cliente.pontoGps : cliente.Ponto_GPS) || ''
    );
    const [capturando, setCapturando] = useState(false);
    const [salvandoGps, setSalvandoGps] = useState(false);
    const [gpsSalvo, setGpsSalvo] = useState(false);
    const [showHistorico, setShowHistorico] = useState(false);
    const [showMapa, setShowMapa] = useState(false);

    // Busca o cadastro completo quando o objeto recebido veio resumido.
    // Falhou (rede/permissão)? mantém o que já tinha e AVISA — nunca afirma que o
    // campo está vazio no cadastro.
    useEffect(() => {
        if (!precisaCarregar) { setCarregandoCliente(false); return; }
        let ativo = true;
        setCarregandoCliente(true);
        setFalhouCarregar(false);
        const busca = isLead
            ? import('../../services/leadService').then(m => m.default.buscarPorId(chaveBusca))
            : clienteService.detalhar(chaveBusca);
        busca
            .then(c => {
                if (!ativo) return;
                // Resposta vazia (200 sem corpo) é tão desconhecida quanto uma falha: sem isso
                // a ficha saía do carregamento sem aviso nenhum no topo e voltava a exibir os
                // campos ausentes como se estivessem vazios no cadastro.
                if (!c) { setFalhouCarregar(true); return; }
                setClienteCompleto(c);
                setGpsInput(prev => prev || ((isLead ? c.pontoGps : c.Ponto_GPS) || ''));
            })
            .catch(() => { if (ativo) setFalhouCarregar(true); })
            .finally(() => { if (ativo) setCarregandoCliente(false); });
        return () => { ativo = false; };
    }, [chaveBusca, isLead, precisaCarregar, tentativa]);

    // Últimas alterações do ponto GPS (quem mexeu, quando e a que horas)
    const [historicoGps, setHistoricoGps] = useState(null);
    const [historicoGpsVersao, setHistoricoGpsVersao] = useState(0); // +1 após salvar ponto → recarrega
    useEffect(() => {
        let ativo = true;
        if (isLead || !cliente?.UUID) { setHistoricoGps(null); return; }
        import('../../services/gpsClientesService')
            .then(m => m.default.historico(cliente.UUID))
            .then(logs => { if (ativo) setHistoricoGps((logs || []).slice(0, 5)); })
            .catch(() => { if (ativo) setHistoricoGps(null); }); // sem rede/permissão: seção não aparece
        return () => { ativo = false; };
    }, [cliente?.UUID, historicoGpsVersao]);

    const capturarGpsAtual = () => {
        if (!navigator.geolocation) {
            toast.error('GPS não disponível neste dispositivo.');
            return;
        }
        setCapturando(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                setGpsInput(coords);
                setCapturando(false);
                toast.success('Localização capturada!');
            },
            () => {
                setCapturando(false);
                toast.error('Não foi possível capturar o GPS. Verifique as permissões.');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // Lead ainda usa o fluxo simples (vira cliente depois, quando o ponto passa
    // pela validação). Cliente usa SEMPRE o mapa (ModalPontoGps) — validado.
    const salvarGpsLead = async () => {
        if (!gpsInput.trim()) return;
        // Trava dura: sem o ponto atual carregado, salvar SOBRESCREVERIA o ponto que
        // já existe — e lead não tem histórico de ponto para desfazer.
        if (gpsDesconhecido) {
            toast.error('O cadastro do lead ainda não carregou. Não dá para salvar o ponto sem saber o que já está gravado.');
            return;
        }
        try {
            setSalvandoGps(true);
            const leadService = (await import('../../services/leadService')).default;
            await leadService.atualizar(cliente.id, { pontoGps: gpsInput.trim() });
            setGpsSalvo(true);
            toast.success('Localização salva com sucesso!');
            if (onAtualizado) onAtualizado({ ...cliente, pontoGps: gpsInput.trim() });
            setTimeout(() => setGpsSalvo(false), 3000);
        } catch {
            toast.error('Erro ao salvar localização.');
        } finally {
            setSalvandoGps(false);
        }
    };

    // Sem a chave do ponto no objeto (Ponto_GPS no cliente, pontoGps no lead) não dá
    // para afirmar NADA sobre o ponto: ou está carregando, ou a busca falhou.
    // Nos dois casos a tela cala a boca — e não deixa gravar por cima.
    const gpsDesconhecido = isLead ? !('pontoGps' in cliente) : !('Ponto_GPS' in cliente);

    const abrirMapa = () => {
        const gps = gpsInput || (isLead ? cliente.pontoGps : cliente.Ponto_GPS);
        if (!gps) return;
        const [lat, lng] = gps.split(',');
        abrirLinkExterno(`https://maps.google.com/?q=${lat},${lng}`);
    };

    // Endereço formatado  
    const endereco = !isLead ? [
        cliente.End_Logradouro,
        cliente.End_Numero,
        cliente.End_Complemento
    ].filter(Boolean).join(', ') : null;
    const cidadeEstado = !isLead ? [cliente.End_Cidade, cliente.End_Estado].filter(Boolean).join(' - ') : null;

    // Endereço completo em uma linha (para copiar e para buscar no Google Maps)
    const enderecoCompleto = !isLead
        ? [endereco, cliente.End_Bairro, cidadeEstado, cliente.End_CEP].filter(Boolean).join(', ')
        : null;

    const copiarEndereco = async () => {
        if (!enderecoCompleto) return;
        try {
            await navigator.clipboard.writeText(enderecoCompleto);
            toast.success('Endereço copiado!');
        } catch {
            // Fallback para navegadores sem clipboard API (ou fora de HTTPS)
            const ta = document.createElement('textarea');
            ta.value = enderecoCompleto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                toast.success('Endereço copiado!');
            } catch {
                toast.error('Não foi possível copiar o endereço.');
            }
            document.body.removeChild(ta);
        }
    };

    const abrirEnderecoNoMaps = () => {
        if (!enderecoCompleto) return;
        abrirLinkExterno(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`);
    };

    return (
        <div className="fixed inset-0 z-[80] flex">
            {/* Overlay */}
            <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer */}
            <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-left">

                {/* Header com nome */}
                <div className="bg-gray-900 text-white px-4 pt-5 pb-4 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            {/* Razão Social */}
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">
                                {isLead ? 'Lead' : (pessoaFisica ? 'Pessoa Física' : 'Razão Social')}
                            </p>
                            <h2 className="text-[15px] font-bold text-white leading-tight break-words">{nome}</h2>

                            {/* Nome Fantasia */}
                            {fantasia && fantasia !== nome && (
                                <p className="text-[12px] text-blue-300 mt-1 font-semibold">
                                    Fantasia: <span className="text-white">{fantasia}</span>
                                </p>
                            )}

                            {/* CNPJ/CPF */}
                            {doc && (
                                <p className="text-[11px] text-gray-400 mt-1.5">
                                    {pessoaFisica ? 'CPF' : 'CNPJ'}: <span className="font-mono text-gray-300">{doc}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowHistorico(true)}
                                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                title="Ver histórico completo"
                            >
                                <ClipboardList className="h-5 w-5" />
                            </button>
                            <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors -mr-1 mt-0.5">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Conteúdo scrollável */}
                <div className="flex-1 overflow-y-auto">

                    {/* Cadastro completo a caminho / não veio — nunca deixar a tela
                        parecer um cadastro vazio quando é só dado não carregado */}
                    {carregandoCliente && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-500">
                            <Loader className="h-3.5 w-3.5 animate-spin shrink-0" />
                            Carregando os dados completos do cliente...
                        </div>
                    )}
                    {!carregandoCliente && falhouCarregar && (
                        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
                            <p className="flex items-start gap-2 text-[11px] text-amber-800">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                Não deu para carregar o cadastro completo agora. O que aparece abaixo é
                                só o que já estava na tela — campo em branco aqui não quer dizer campo
                                vazio no cadastro.
                            </p>
                            {/* Só oferece "tentar de novo" quando existe o que tentar: sem
                                UUID/id o efeito de busca nem roda e o botão não faria nada. */}
                            {precisaCarregar && (
                                <button
                                    onClick={tentarDeNovo}
                                    className="mt-2 inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-[12px] font-bold rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition-colors"
                                >
                                    Tentar de novo
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Contato ── */}
                    <div className="px-4 pt-4 pb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contato</p>
                        <div className="space-y-0">
                            <DataRow label="Telefone" value={isLead ? cliente.whatsapp : cliente.Telefone} icon={Phone} />
                            <DataRow label="Celular" value={!isLead ? cliente.Telefone_Celular : null} icon={Phone} />
                            <DataRow label="WhatsApp" value={!isLead ? cliente.Telefone_Celular || cliente.Telefone : null} icon={Phone} />
                            {isLead
                                ? <DataRow label="Responsável" value={cliente.contato} icon={Mail} />
                                : <DataRow label="E-mail" value={cliente.Email} icon={Mail} />
                            }
                            {!dadosCarregados && (carregandoCliente
                                ? <BlocoCarregando />
                                : <p className="text-[12px] text-gray-500 italic py-2">
                                    {isLead ? 'Contato e WhatsApp não carregados.' : 'Telefone fixo e e-mail não carregados.'}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ── Endereço (só clientes) ── */}
                    {!isLead && carregandoCliente && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Endereço</p>
                            <BlocoCarregando />
                        </div>
                    )}
                    {!isLead && !carregandoCliente && (endereco || cidadeEstado) && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Endereço</p>
                            {endereco && <p className="text-[13px] text-gray-800 font-medium">{endereco}</p>}
                            {cliente.End_Bairro && <p className="text-[12px] text-gray-500">{cliente.End_Bairro}</p>}
                            {cidadeEstado && <p className="text-[12px] text-gray-500">{cidadeEstado}{cliente.End_CEP ? ` · CEP ${cliente.End_CEP}` : ''}</p>}
                            {!dadosCarregados && (
                                <p className="text-[11px] text-amber-700 mt-1.5">Endereço incompleto — o cadastro não foi carregado.</p>
                            )}
                            {dadosCarregados && <div className="flex gap-2 mt-2.5">
                                <button
                                    onClick={copiarEndereco}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                    <Copy className="h-3.5 w-3.5" /> Copiar
                                </button>
                                <button
                                    onClick={abrirEnderecoNoMaps}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" /> Ver no Google Maps
                                </button>
                            </div>}
                        </div>
                    )}

                    {/* ── Configurações de Venda ── */}
                    {!isLead && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Atendimento & Entregas</p>
                            {/* Horario_Atendimento/Horario_Entrega NÃO existem no cadastro de
                                Cliente (não estão no schema) — as linhas nunca renderizaram. */}
                            <DataRow label="Dia(s) de Venda" value={cliente.Dia_de_venda} icon={Calendar} />
                            <DataRow label="Dia(s) de Entrega" value={cliente.Dia_de_entrega} icon={Package} />
                            <DataRow label="Condição de Pagamento" value={cliente.Condicao_de_pagamento} icon={DollarSign} />
                            {!dadosCarregados && (carregandoCliente
                                ? <BlocoCarregando />
                                : <p className="text-[12px] text-gray-500 italic py-2">Dias de venda/entrega e condição de pagamento não carregados.</p>
                            )}
                        </div>
                    )}

                    {/* ── Lead info ── */}
                    {isLead && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Visita</p>
                            <DataRow label="Dias de Visita" value={cliente.diasVisita} icon={Calendar} />
                            <DataRow label="Horário" value={cliente.horarioAtendimento} icon={Calendar} />
                            <DataRow label="Próxima Visita" value={cliente.proximaVisita ? new Date(cliente.proximaVisita).toLocaleDateString('pt-BR') : null} icon={Calendar} />
                            <DataRow label="Etapa" value={cliente.etapa} icon={User} />
                            {!dadosCarregados && (carregandoCliente
                                ? <BlocoCarregando />
                                : <p className="text-[12px] text-gray-500 italic py-2">Dias de visita, horário e etapa não carregados.</p>
                            )}
                        </div>
                    )}

                    {/* ── GPS / Localização ── */}
                    <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">📍 Localização GPS</p>

                        {podeEditarGPS && !isLead ? (
                            <div className="space-y-2">
                                {gpsDesconhecido ? (
                                    <GpsIndefinido carregando={carregandoCliente} onTentar={tentarDeNovo} podeTentar={precisaCarregar} />
                                ) : (
                                    <>
                                        {gpsInput ? (
                                            <div className="flex items-center gap-2">
                                                <p className="text-[12px] font-mono text-gray-600 flex-1">{gpsInput}</p>
                                                <button
                                                    onClick={abrirMapa}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <ExternalLink className="h-3 w-3" /> Google Maps
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-[12px] text-gray-500 italic">Sem ponto GPS cadastrado</p>
                                        )}
                                        {/* Só oferece o mapa sabendo o ponto atual: sem ele o
                                            ModalPontoGps trataria como "primeiro ponto". */}
                                        <button
                                            onClick={() => setShowMapa(true)}
                                            className="w-full py-2.5 text-[13px] font-bold rounded-full flex items-center justify-center gap-2 bg-primary hover:bg-primaryDark text-white transition-colors min-h-[44px]"
                                        >
                                            <MapPin className="h-4 w-4" />
                                            {gpsInput ? 'Ajustar ponto no mapa' : 'Definir ponto no mapa'}
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : podeEditarGPS && isLead ? (
                            <div className="space-y-2">
                                {/* Enquanto o cadastro do lead não carregou, a ficha não sabe se
                                    já existe ponto — e salvar aqui sobrescreveria o que está
                                    gravado (lead não tem histórico de ponto para desfazer). */}
                                {gpsDesconhecido ? (
                                    <GpsIndefinido carregando={carregandoCliente} onTentar={tentarDeNovo} podeTentar={precisaCarregar} />
                                ) : (
                                    <>
                                        {/* Input de coordenadas (lead: fluxo simples, valida ao virar cliente) */}
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={gpsInput}
                                                onChange={e => setGpsInput(e.target.value)}
                                                placeholder="-26.123456,-48.912345"
                                                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded text-[12px] font-mono focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                        </div>

                                        {/* Botões de ação */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={capturarGpsAtual}
                                                disabled={capturando}
                                                className="flex items-center justify-center gap-1.5 min-h-[44px] py-2 text-[12px] font-semibold text-primary border border-primary rounded-full bg-white hover:bg-mint/40 disabled:opacity-50 transition-colors"
                                            >
                                                {capturando ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                                                {capturando ? 'Capturando...' : 'Minha localização'}
                                            </button>

                                            {gpsInput && (
                                                <button
                                                    onClick={abrirMapa}
                                                    className="flex items-center justify-center gap-1.5 min-h-[44px] py-2 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                    Ver no Mapa
                                                </button>
                                            )}
                                        </div>

                                        {/* Salvar GPS */}
                                        <button
                                            onClick={salvarGpsLead}
                                            disabled={salvandoGps || !gpsInput.trim()}
                                            className={`w-full min-h-[44px] py-2.5 text-[13px] font-bold rounded-full flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${gpsSalvo ? 'bg-green-600 text-white' : 'bg-primary hover:bg-primaryDark text-white'}`}
                                        >
                                            {salvandoGps ? (
                                                <><Loader className="h-4 w-4 animate-spin" /> Salvando...</>
                                            ) : gpsSalvo ? (
                                                <><CheckCircle className="h-4 w-4" /> Localização Salva!</>
                                            ) : (
                                                <><Save className="h-4 w-4" /> Salvar Localização</>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Mostra GPS atual (somente leitura) */}
                                {gpsDesconhecido ? (
                                    <GpsIndefinido carregando={carregandoCliente} onTentar={tentarDeNovo} podeTentar={precisaCarregar} />
                                ) : gpsInput ? (
                                    <div className="flex items-center gap-2">
                                        <p className="text-[12px] font-mono text-gray-600 flex-1">{gpsInput}</p>
                                        <button
                                            onClick={abrirMapa}
                                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                        >
                                            <ExternalLink className="h-3 w-3" /> Mapa
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-[12px] text-gray-400 italic">Sem GPS cadastrado</p>
                                )}
                                <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                    <Lock className="h-4 w-4 text-amber-500 shrink-0" />
                                    <p className="text-[11px] text-amber-700">Você não tem permissão para alterar o GPS. Solicite ao administrador.</p>
                                </div>
                            </div>
                        )}

                        {!isLead && !gpsDesconhecido && <HistoricoGpsLista logs={historicoGps} temPonto={!!gpsInput} />}
                    </div>

                    {/* ── Observações ── */}
                    {(cliente.Observacoes_Gerais || cliente.observacoes) && (
                        <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Observações</p>
                            <p className="text-[12px] text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {cliente.Observacoes_Gerais || cliente.observacoes}
                            </p>
                        </div>
                    )}

                    {/* ── Situação Serasa ── */}
                    {cliente.Situacao_serasa && (
                        <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                            <div className={`flex items-center gap-2 p-3 rounded-lg ${cliente.Situacao_serasa === 'REGULAR' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {cliente.Situacao_serasa === 'REGULAR' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide">Situação Serasa</p>
                                    <p className="text-[13px] font-semibold">{cliente.Situacao_serasa}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="h-6" />
                </div>
            </div>

            {showHistorico && (
                <HistoricoModal cliente={cliente} onClose={() => setShowHistorico(false)} />
            )}

            {!isLead && (
                <ModalPontoGps
                    aberto={showMapa}
                    onFechar={() => setShowMapa(false)}
                    clienteUuid={cliente.UUID}
                    clienteNome={fantasia || nome}
                    pontoAtual={gpsInput || null}
                    origem="ROTA"
                    onSalvo={(ponto, r) => {
                        if (r?.pendente) {
                            toast('Mudança registrada — espera aprovação da logística.', { icon: '🕓' });
                        } else if (r?.offline) {
                            toast('Sem internet: o ponto será enviado quando o sinal voltar.', { icon: '📵' });
                            setGpsInput(ponto);
                        } else if (ponto) {
                            setGpsInput(ponto);
                            toast.success('Ponto GPS salvo!');
                            if (onAtualizado) onAtualizado({ ...cliente, Ponto_GPS: ponto });
                        }
                        setHistoricoGpsVersao(v => v + 1); // recarrega "últimas alterações do ponto"
                    }}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// TROCAR DE CLIENTE COM A FICHA ABERTA = FICHA NOVA (remonta pela `key`)
//
// Vários chamadores trocam SÓ a prop `cliente` sem fechar a ficha (painel de
// Atendimentos, Rota/Leads, Contas a Receber, Novo Pedido). Com o mouse o pano de
// fundo intercepta o clique e fecha a ficha antes; pelo TECLADO (Tab até o nome do
// cliente da linha de trás + Enter) não — o React reaproveita o mesmo componente e
// TODO o estado do cliente anterior sobrevive. Foi assim que a ficha de um cliente
// SEM ponto GPS apareceu mostrando o ponto do cliente anterior, com o botão dizendo
// "Ajustar ponto no mapa" — e o mapa abriria no ponto do cliente A com o UUID do
// cliente B (confirmar gravaria o ponto no cliente errado).
//
// Por que `key` e não um efeito que zera os estados na troca:
//  1. O efeito roda DEPOIS da renderização — existe um quadro pintado com o ponto do
//     cliente anterior e o botão de gravar ativo. A `key` desmonta antes: o ponto
//     errado nunca chega à tela.
//  2. O efeito precisaria listar cada estado (gpsInput, clienteCompleto,
//     falhouCarregar, gpsSalvo, capturando, salvandoGps, historicoGps, tentativa,
//     modais abertos...). Esquecer um — ou acrescentar estado novo amanhã sem lembrar
//     do reset — é o mesmo defeito de novo. A `key` zera tudo, inclusive o estado
//     interno dos filhos (ModalPontoGps, HistoricoModal) e requisições em voo (o
//     cleanup do efeito marca `ativo = false`).
//  3. Preserva a proteção da 1ª rodada: dentro do MESMO cadastro nada remonta, então
//     o `setGpsInput(prev => prev || ...)` continua sem atropelar o que o usuário
//     está digitando enquanto a busca do cadastro volta.
const ClientePopup = (props) => {
    const c = props.cliente;
    const ehLead = !!c?.nomeEstabelecimento;
    // Identidade do cadastro. Prefixo separa lead de cliente (id numérico de lead
    // podia coincidir com UUID de cliente); os retornos extras cobrem objeto sem
    // chave — sem eles dois cadastros sem UUID cairiam na mesma `key` (undefined).
    const identidade = ehLead
        ? `lead:${c?.id ?? c?.nomeEstabelecimento ?? '?'}`
        : `cliente:${c?.UUID ?? c?.Documento ?? c?.Nome ?? '?'}`;
    return <ClientePopupFicha key={identidade} {...props} />;
};

export default ClientePopup;
