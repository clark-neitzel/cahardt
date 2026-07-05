import React, { useEffect, useState } from 'react';
import configNotasService from '../../../services/configNotasService';
import { ShieldCheck, Upload, Lock, RefreshCw, Link2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

const BadgeDiasRestantes = ({ dias }) => {
    if (dias == null) return null;
    const d = Number(dias);
    const cls = d > 60 ? 'bg-green-100 text-green-800' : d > 30 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
    const texto = d < 0 ? 'vencido' : `faltam ${d} dias`;
    return <span className={`ml-1 px-2 py-1 text-xs font-semibold rounded-full ${cls}`}>{texto}</span>;
};

// ── Seção "Notas & Certificado" das Configurações ──
// Certificado digital A1 (consulta de notas na SEFAZ/NFS-e) + captura automática (Fase 2) + conexão CA.
const NotasCertificadoConfig = () => {
    const [cert, setCert] = useState(null);       // { instalado, titular, cnpj, emissor, validade, diasRestantes }
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState(false);

    const [arquivo, setArquivo] = useState(null);
    const [senha, setSenha] = useState('');
    const [instalando, setInstalando] = useState(false);
    const [erroInstalacao, setErroInstalacao] = useState('');

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

    useEffect(() => { carregar(); }, []);

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
                        <div>
                            <div className="text-sm font-medium text-gray-900">NF-e (mercadorias) — SEFAZ</div>
                            <div className="text-xs text-gray-500">Consulta automática das notas emitidas contra o CNPJ da empresa</div>
                        </div>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 shrink-0 whitespace-nowrap">disponível em breve — Fase 2</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 min-h-[44px] border-t border-gray-100 pt-4">
                        <div>
                            <div className="text-sm font-medium text-gray-900">NFS-e (serviços tomados) — Ambiente Nacional</div>
                            <div className="text-xs text-gray-500">Consulta automática das notas de serviço tomadas pela empresa</div>
                        </div>
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 shrink-0 whitespace-nowrap">disponível em breve — Fase 2</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                        A SEFAZ só disponibiliza notas dos últimos 90 dias — com a captura ligada, nada se perde. Se a captura falhar, o restante do sistema <span className="font-semibold">não é afetado</span>: o robô roda separado e tenta de novo sozinho.
                    </div>
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
