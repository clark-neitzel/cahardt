import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import configNotasService from '../../../services/configNotasService';
import { ShieldCheck, Upload, Lock, RefreshCw, Link2, Loader2, Receipt, Save, RotateCcw, Undo2, CalendarClock, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

// Data que vem como 'YYYY-MM-DD' (sem hora): montar pelos pedaços, senão `new Date()` lê como
// UTC e mostra o dia anterior no Brasil.
const fmtDataSimples = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

// Âncora usada pelo lembrete do Clarkson (AlertaDevolucaoRefItem) para cair direto aqui.
const ANCORA_REF_ITEM = 'nfe-devolucao-ref-item';

// O backend devolve 'producao'/'homologacao' sem acento (é o valor cru da env) — na tela sai em português.
const nomeAmbiente = (a) => ({ producao: 'produção', homologacao: 'homologação' }[a] || a || null);

// As três opções do interruptor, com o que cada uma faz em português.
const OPCOES_REF_ITEM = [
    {
        valor: 'auto',
        titulo: 'Automático (recomendado)',
        descricao: 'Segue o prazo da SEFAZ: fica desligado até a data limite e liga sozinho no dia. Não precisa fazer nada.'
    },
    {
        valor: 'sempre',
        titulo: 'Sempre ligado',
        descricao: 'Liga agora, antes do prazo. Use só depois de provar em homologação que a SEFAZ aceita a nota.'
    },
    {
        valor: 'nunca',
        titulo: 'Nunca (desligado à força)',
        descricao: 'Continua desligado mesmo depois da data limite. Só para emergência — passada a data, a SEFAZ pode rejeitar a devolução.'
    }
];
const fmtDataHora = (d) => d
    ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

const BadgeDiasRestantes = ({ dias }) => {
    if (dias == null) return null;
    const d = Number(dias);
    const cls = d > 60 ? 'bg-green-100 text-green-800' : d > 30 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
    const texto = d < 0 ? 'vencido' : `faltam ${d} dias`;
    return <span className={`ml-1 px-2 py-1 text-xs font-semibold rounded-full ${cls}`}>{texto}</span>;
};

// ── Seção "Notas & Certificado" das Configurações ──
// Certificado digital A1 (consulta de notas na SEFAZ/NFS-e) + captura automática de NF-e + conexão CA.
const NotasCertificadoConfig = () => {
    const [cert, setCert] = useState(null);       // { instalado, titular, cnpj, emissor, validade, diasRestantes }
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState(false);

    const [arquivo, setArquivo] = useState(null);
    const [senha, setSenha] = useState('');
    const [instalando, setInstalando] = useState(false);
    const [erroInstalacao, setErroInstalacao] = useState('');

    // Captura automática: { nfeAtiva, ultimaConsulta, ultimoResultado, totalCapturadas, bloqueadoAte }
    const [captura, setCaptura] = useState(null);
    const [capturaErro, setCapturaErro] = useState(false);
    const [alterandoCaptura, setAlterandoCaptura] = useState(false);

    const carregar = async () => {
        setCarregando(true);
        try {
            const data = await configNotasService.getCertificado();
            setCert(data || {});
            setErroCarga(false);
        } catch {
            setErroCarga(true);
        } finally {
            setCarregando(false);
        }
    };

    const carregarCaptura = async () => {
        try {
            const data = await configNotasService.getCaptura();
            setCaptura(data || {});
            setCapturaErro(false);
        } catch {
            setCapturaErro(true);
        }
    };

    // ── Referência da nota de origem POR ITEM na NF-e de devolução (NT 2025.002) ──
    // { modo, ligado, obrigatorioEm, diasRestantes, ambiente, podeEditar, ... }
    const [refItem, setRefItem] = useState(null);
    const [refItemErro, setRefItemErro] = useState(false);
    const [refItemEscolha, setRefItemEscolha] = useState('auto');
    const [salvandoRefItem, setSalvandoRefItem] = useState(false);
    const location = useLocation();

    const carregarRefItem = async () => {
        try {
            const data = await configNotasService.getDevolucaoRefItem();
            setRefItem(data || {});
            setRefItemEscolha(data?.modo || 'auto');
            setRefItemErro(false);
        } catch {
            setRefItemErro(true);
        }
    };

    const salvarRefItem = async () => {
        if (salvandoRefItem) return;
        setSalvandoRefItem(true);
        try {
            const res = await configNotasService.setDevolucaoRefItem(refItemEscolha);
            toast.success(res?.ligado
                ? 'Salvo! A referência por item está LIGADA nas próximas devoluções.'
                : 'Salvo! A referência por item segue desligada por enquanto.');
            await carregarRefItem();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar a configuração da NF-e de devolução.');
        } finally {
            setSalvandoRefItem(false);
        }
    };

    useEffect(() => { carregar(); carregarCaptura(); carregarEmissao(); carregarRefItem(); }, []);

    // Chegou por "#nfe-devolucao-ref-item" (o lembrete da tela) — rola até o cartão.
    // Espera o cartão existir no DOM: ele só aparece depois que o GET responde.
    useEffect(() => {
        if (location.hash !== `#${ANCORA_REF_ITEM}`) return;
        const alvo = document.getElementById(ANCORA_REF_ITEM);
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [location.hash, refItem, refItemErro]);

    const toggleNfe = async () => {
        if (alterandoCaptura) return;
        const ligar = !captura?.nfeAtiva;
        setAlterandoCaptura(true);
        try {
            await configNotasService.setCaptura({ nfeAtiva: ligar });
            toast.success(ligar ? 'Captura de NF-e ligada!' : 'Captura de NF-e pausada.');
            await carregarCaptura();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao alterar a captura de NF-e');
        } finally {
            setAlterandoCaptura(false);
        }
    };

    const toggleNfse = async () => {
        if (alterandoCaptura) return;
        const ligar = !captura?.nfse?.ativa;
        setAlterandoCaptura(true);
        try {
            await configNotasService.setCaptura({ nfseAtiva: ligar });
            toast.success(ligar ? 'Captura de NFS-e ligada!' : 'Captura de NFS-e pausada.');
            await carregarCaptura();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao alterar a captura de NFS-e');
        } finally {
            setAlterandoCaptura(false);
        }
    };

    // Emissão de NF-e (Simples Nacional): alíquota do crédito de ICMS, NCM padrão e textos legais
    const [emissao, setEmissao] = useState(null);       // resposta do servidor (inclui .padrao)
    const [emissaoErro, setEmissaoErro] = useState(false);
    const [formEmissao, setFormEmissao] = useState({ aliquota: '', ncm: '', textos: '' });
    const [salvandoEmissao, setSalvandoEmissao] = useState(false);
    const [erroEmissao, setErroEmissao] = useState('');

    const preencherEmissao = (data) => {
        setFormEmissao({
            aliquota: String(data?.aliquotaCreditoSimples ?? '').replace('.', ','),
            ncm: String(data?.ncmPadrao ?? ''),
            textos: (data?.textosLegais || []).join('\n')
        });
    };

    const carregarEmissao = async () => {
        try {
            const data = await configNotasService.getEmissao();
            setEmissao(data || {});
            preencherEmissao(data);
            setEmissaoErro(false);
        } catch {
            setEmissaoErro(true);
        }
    };

    const salvarEmissao = async () => {
        setErroEmissao('');
        setSalvandoEmissao(true);
        try {
            await configNotasService.setEmissao({
                aliquotaCreditoSimples: formEmissao.aliquota,
                ncmPadrao: formEmissao.ncm,
                textosLegais: formEmissao.textos
            });
            toast.success('Configuração salva! Vale para as próximas notas emitidas.');
            await carregarEmissao();
        } catch (e) {
            setErroEmissao(e.response?.data?.error || 'Erro ao salvar a configuração de emissão.');
        } finally {
            setSalvandoEmissao(false);
        }
    };

    const instalar = async () => {
        setErroInstalacao('');
        if (!arquivo) { toast.error('Escolha o arquivo .pfx ou .p12 do certificado.'); return; }
        if (!senha) { toast.error('Informe a senha do certificado.'); return; }
        setInstalando(true);
        try {
            const res = await configNotasService.instalarCertificado(arquivo, senha);
            if (res?.error) {
                setErroInstalacao(res.error);
            } else {
                toast.success('Certificado instalado com sucesso!');
                setArquivo(null);
                setSenha('');
                carregar();
            }
        } catch (e) {
            setErroInstalacao(e.response?.data?.error || 'Erro ao instalar o certificado. Verifique o arquivo e a senha.');
        } finally {
            setInstalando(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* ── Certificado Digital A1 ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">CERTIFICADO DIGITAL A1</span>
                </div>
                <div className="p-5 space-y-4">
                    {carregando ? (
                        <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                    ) : erroCarga ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                            Não foi possível consultar o certificado agora. Você ainda pode instalar um novo abaixo.
                        </div>
                    ) : cert?.instalado ? (
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-900">{cert.titular || 'Certificado instalado'}</span>
                                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Instalado ✓</span>
                                </div>
                                <div className="text-sm text-gray-500 mt-1">
                                    {cert.cnpj ? `CNPJ ${cert.cnpj}` : ''}
                                    {cert.cnpj && cert.emissor ? ' · ' : ''}
                                    {cert.emissor ? `emitido por ${cert.emissor}` : ''}
                                </div>
                            </div>
                            <div className="text-left md:text-right">
                                <div className="text-sm text-gray-500">Válido até</div>
                                <div className="font-semibold text-gray-900">
                                    {fmtData(cert.validade)}
                                    <BadgeDiasRestantes dias={cert.diasRestantes} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                            Nenhum certificado instalado ainda. Instale o certificado digital A1 (.pfx/.p12) da empresa para o sistema poder consultar as notas recebidas.
                        </div>
                    )}

                    <div className="border-t border-gray-100 pt-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                            {cert?.instalado ? 'Substituir certificado (na renovação anual)' : 'Instalar certificado'}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-4 text-sm text-gray-500 hover:border-primary hover:text-primary cursor-pointer min-h-[44px]">
                                <Upload className="h-4 w-4 shrink-0" />
                                <span className="truncate">{arquivo ? arquivo.name : 'Escolher arquivo .pfx / .p12'}</span>
                                <input
                                    type="file"
                                    accept=".pfx,.p12"
                                    className="hidden"
                                    onChange={e => setArquivo(e.target.files?.[0] || null)}
                                />
                            </label>
                            <input
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="Senha do certificado"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        {erroInstalacao && (
                            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erroInstalacao}</div>
                        )}
                        <button
                            onClick={instalar}
                            disabled={instalando}
                            className="mt-3 w-full md:w-auto px-4 py-3 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                            {instalando && <Loader2 className="h-4 w-4 animate-spin" />}
                            {instalando ? 'Instalando…' : 'Instalar certificado'}
                        </button>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 flex gap-2">
                        <Lock className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
                        <span>
                            O arquivo fica <span className="font-semibold">criptografado no servidor</span> e a senha nunca é exibida a ninguém. O certificado é usado apenas para consultar as notas na SEFAZ e no ambiente nacional de NFS-e. O sistema avisa com 30 dias de antecedência quando estiver perto de vencer.
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Captura automática (Fase 2) ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <RefreshCw className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">CAPTURA AUTOMÁTICA DE NOTAS</span>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3 min-h-[44px]">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">NF-e (mercadorias) — SEFAZ</div>
                            <div className="text-xs text-gray-500">
                                {capturaErro
                                    ? 'Não foi possível consultar o status da captura agora.'
                                    : captura == null
                                        ? 'Carregando…'
                                        : [
                                            captura.ultimaConsulta ? `última consulta: ${fmtDataHora(captura.ultimaConsulta)}` : 'nenhuma consulta realizada ainda',
                                            captura.ultimoResultado || null,
                                            captura.totalCapturadas != null ? `${captura.totalCapturadas} nota(s) capturada(s)` : null
                                        ].filter(Boolean).join(' · ')}
                            </div>
                            {captura?.bloqueadoAte && new Date(captura.bloqueadoAte).getTime() > Date.now() && (
                                <div className="text-xs text-amber-700 mt-0.5">
                                    SEFAZ pediu pausa — retoma às {new Date(captura.bloqueadoAte).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={toggleNfe}
                            disabled={alterandoCaptura || capturaErro || captura == null}
                            role="switch"
                            aria-checked={!!captura?.nfeAtiva}
                            aria-label="Ligar ou desligar a captura automática de NF-e"
                            className="shrink-0 p-2.5 -m-2.5 disabled:opacity-50"
                        >
                            <span className={`block w-11 h-6 rounded-full relative transition-colors ${captura?.nfeAtiva ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${captura?.nfeAtiva ? 'left-[22px]' : 'left-0.5'}`}></span>
                            </span>
                        </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 min-h-[44px] border-t border-gray-100 pt-4">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">NFS-e (serviços tomados) — Ambiente Nacional</div>
                            <div className="text-xs text-gray-500">
                                {capturaErro
                                    ? 'Não foi possível consultar o status da captura agora.'
                                    : captura == null
                                        ? 'Carregando…'
                                        : [
                                            captura.nfse?.ultimaConsulta ? `última consulta: ${fmtDataHora(captura.nfse.ultimaConsulta)}` : 'nenhuma consulta realizada ainda',
                                            captura.nfse?.ultimoResultado || null,
                                            captura.nfse?.totalCapturadas != null ? `${captura.nfse.totalCapturadas} nota(s) capturada(s)` : null
                                        ].filter(Boolean).join(' · ')}
                            </div>
                            {captura?.nfse?.bloqueadoAte && new Date(captura.nfse.bloqueadoAte).getTime() > Date.now() && (
                                <div className="text-xs text-amber-700 mt-0.5">
                                    Ambiente nacional pediu pausa — retoma às {new Date(captura.nfse.bloqueadoAte).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                            <div className="text-xs text-gray-400 mt-0.5">
                                Só chegam notas de municípios já integrados ao sistema nacional da NFS-e (nfse.gov.br).
                            </div>
                        </div>
                        <button
                            onClick={toggleNfse}
                            disabled={alterandoCaptura || capturaErro || captura == null}
                            role="switch"
                            aria-checked={!!captura?.nfse?.ativa}
                            aria-label="Ligar ou desligar a captura automática de NFS-e"
                            className="shrink-0 p-2.5 -m-2.5 disabled:opacity-50"
                        >
                            <span className={`block w-11 h-6 rounded-full relative transition-colors ${captura?.nfse?.ativa ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${captura?.nfse?.ativa ? 'left-[22px]' : 'left-0.5'}`}></span>
                            </span>
                        </button>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                        A SEFAZ só disponibiliza notas dos últimos 90 dias — com a captura ligada, nada se perde. Se a captura falhar, o restante do sistema <span className="font-semibold">não é afetado</span>: o robô roda separado e tenta de novo sozinho.
                    </div>
                </div>
            </div>

            {/* ── Emissão de NF-e (Simples Nacional) ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Receipt className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">EMISSÃO DE NF-E — SIMPLES NACIONAL</span>
                </div>
                <div className="p-5 space-y-4">
                    {emissaoErro ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                            Não foi possível consultar a configuração de emissão agora. Recarregue a página para tentar de novo.
                        </div>
                    ) : emissao == null ? (
                        <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Crédito de ICMS do Simples (%)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formEmissao.aliquota}
                                        onChange={e => setFormEmissao(f => ({ ...f, aliquota: e.target.value }))}
                                        placeholder="3,82"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        É o percentual que o cliente CNPJ pode aproveitar de crédito. Muda conforme a faixa do Simples — confirme com a contabilidade.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">NCM padrão</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formEmissao.ncm}
                                        onChange={e => setFormEmissao(f => ({ ...f, ncm: e.target.value }))}
                                        placeholder="19022000"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Usado só quando o produto não tem NCM próprio no cadastro.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Textos legais da nota <span className="font-normal text-gray-500">(uma linha por frase)</span>
                                </label>
                                <textarea
                                    rows={3}
                                    value={formEmissao.textos}
                                    onChange={e => setFormEmissao(f => ({ ...f, textos: e.target.value }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Saem nas Informações Complementares da nota. A frase do crédito de ICMS é montada sozinha e não precisa ser digitada aqui.
                                </p>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Como vai sair na nota</div>
                                <div className="text-xs text-gray-700 leading-relaxed">
                                    PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ …, CORRESPONDENTE A ALIQUOTA DE{' '}
                                    <span className="font-semibold">{(formEmissao.aliquota || '0').trim()}%</span>, NOS TERMOS DO ART. 23 DA LC 123/2006.
                                </div>
                            </div>

                            {erroEmissao && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erroEmissao}</div>
                            )}

                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <button
                                    onClick={salvarEmissao}
                                    disabled={salvandoEmissao}
                                    className="px-4 py-3 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                >
                                    {salvandoEmissao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {salvandoEmissao ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button
                                    onClick={() => { preencherEmissao(emissao?.padrao); setErroEmissao(''); }}
                                    disabled={salvandoEmissao}
                                    className="px-4 py-3 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Voltar ao padrão
                                </button>
                                {emissao?.atualizadoEm && (
                                    <span className="text-xs text-gray-500 md:ml-1">
                                        Alterado em {fmtData(emissao.atualizadoEm)}
                                        {emissao.atualizadoPorNome ? ` por ${emissao.atualizadoPorNome}` : ''}
                                    </span>
                                )}
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                                Vale para a NF-e de venda <span className="font-semibold">e</span> para a NF-e de devolução, a partir da próxima nota emitida. Notas já autorizadas não mudam.
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── NF-e de devolução: referência da nota de origem POR ITEM (NT 2025.002) ── */}
            <div id={ANCORA_REF_ITEM} className="bg-white rounded-xl border border-gray-200 shadow-sm scroll-mt-4">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Undo2 className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">NF-E DE DEVOLUÇÃO — REFERÊNCIA POR ITEM</span>
                </div>
                <div className="p-5 space-y-4">
                    {refItemErro ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                            Não foi possível consultar essa configuração agora. Recarregue a página para tentar de novo.
                        </div>
                    ) : refItem == null ? (
                        <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600 leading-snug">
                                Na NF-e de devolução, cada item pode apontar para o item correspondente da nota de venda original.
                                A SEFAZ passa a <span className="font-semibold">exigir</span> isso a partir da data abaixo; até lá é opcional.
                            </p>

                            {/* Estado atual */}
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-gray-900">Está valendo agora?</span>
                                        {refItem.ligado ? (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Ligado ✓</span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Desligado</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 break-words">
                                        {refItem.ligado
                                            ? 'As devoluções emitidas agora já saem com a referência item a item.'
                                            : 'As devoluções emitidas agora referenciam só a chave da nota de origem, como sempre foi.'}
                                        {nomeAmbiente(refItem.ambiente) ? ` · ambiente de ${nomeAmbiente(refItem.ambiente)}` : ''}
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 shrink-0">
                                    <CalendarClock className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                                    <div className="text-left md:text-right">
                                        <div className="text-xs text-gray-500">Obrigatório a partir de</div>
                                        <div className="text-sm font-semibold text-gray-900">
                                            {fmtDataSimples(refItem.obrigatorioEm) || '—'}
                                            <BadgeDiasRestantes dias={refItem.diasRestantes} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* As três opções */}
                            <div className="space-y-2" role="radiogroup" aria-label="Quando usar a referência por item na NF-e de devolução">
                                {OPCOES_REF_ITEM.map((op) => {
                                    const marcada = refItemEscolha === op.valor;
                                    return (
                                        <button
                                            key={op.valor}
                                            type="button"
                                            role="radio"
                                            aria-checked={marcada}
                                            disabled={!refItem.podeEditar || salvandoRefItem}
                                            onClick={() => setRefItemEscolha(op.valor)}
                                            className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 min-h-[44px] transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${marcada ? 'border-primary bg-mint/40' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                        >
                                            <span className={`mt-0.5 shrink-0 h-5 w-5 rounded-full border flex items-center justify-center ${marcada ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white'}`}>
                                                {marcada && <Check className="h-3.5 w-3.5" />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-gray-900 break-words">
                                                    {op.titulo}
                                                    {refItem.modo === op.valor && (
                                                        <span className="ml-2 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 text-blue-800 align-middle">em uso</span>
                                                    )}
                                                </span>
                                                <span className="block text-xs text-gray-500 leading-snug mt-0.5 break-words">{op.descricao}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {refItem.podeEditar ? (
                                <div className="flex flex-col md:flex-row md:items-center gap-3">
                                    {/* Fica habilitado quando a escolha mudou OU quando ninguém nunca gravou
                                        a chave (`definido` = false): confirmar o "Automático" é uma decisão
                                        válida, e é o que faz o lembrete da tela parar de aparecer. */}
                                    <button
                                        onClick={salvarRefItem}
                                        disabled={salvandoRefItem || (refItemEscolha === refItem.modo && refItem.definido === true)}
                                        className="px-4 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                    >
                                        {salvandoRefItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {salvandoRefItem
                                            ? 'Salvando…'
                                            : (refItemEscolha === refItem.modo && !refItem.definido) ? 'Confirmar esta opção' : 'Salvar'}
                                    </button>
                                    {refItemEscolha === refItem.modo && refItem.definido === true && (
                                        <span className="text-xs text-gray-500">Nada a salvar — essa já é a opção em uso.</span>
                                    )}
                                    {!refItem.definido && (
                                        <span className="text-xs text-gray-500 break-words">
                                            Ninguém escolheu ainda — está valendo o padrão <span className="font-semibold">Automático</span>.
                                        </span>
                                    )}
                                    {refItem.atualizadoEm && (
                                        <span className="text-xs text-gray-500 md:ml-1 break-words">
                                            Alterado em {fmtData(refItem.atualizadoEm)}
                                            {refItem.atualizadoPorNome ? ` por ${refItem.atualizadoPorNome}` : ''}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                                    Você pode ver essa configuração, mas não alterá-la — é preciso permissão de
                                    <span className="font-semibold"> editar Configurações</span>.
                                </div>
                            )}

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-snug">
                                Em <span className="font-semibold">Automático</span> não é preciso ligar nada à mão: na data limite o sistema
                                passa a mandar a referência por item sozinho. Mudar aqui só vale para as
                                <span className="font-semibold"> próximas</span> devoluções emitidas — notas já autorizadas não mudam.
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Conexão Conta Azul (informativo) ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Link2 className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">CONEXÃO CONTA AZUL</span>
                </div>
                <div className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0"></span>
                            <span className="text-sm font-medium text-gray-900">Conectado (mesma conexão dos pedidos)</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Despesas confirmadas são enviadas automaticamente · baixas conferidas a cada 30 minutos</div>
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 self-start md:self-auto">Ativo</span>
                </div>
            </div>
        </div>
    );
};

export default NotasCertificadoConfig;
