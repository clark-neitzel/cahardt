import React, { useEffect, useState } from 'react';
import { Landmark, Save, Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

// ── Configurações → Asaas (boleto e PIX) ─────────────────────────────────────
// Multa/juros do boleto, mensagens das cobranças, validade padrão do PIX e
// avisos do Asaas ao cliente. Salva em app_configs.asaas_config (PUT /asaas/config).

const Toggle = ({ ligado, onClick, disabled }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${ligado ? 'bg-primary' : 'bg-gray-300'} disabled:opacity-50`}
    >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const StatusItem = ({ emoji, titulo, detalhe, ok, okTexto, falhaTexto }) => (
    <div className="flex items-center gap-2.5 border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5">
        <span className="text-lg">{emoji}</span>
        <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-700 leading-tight">{titulo}</p>
            <p className="text-[11px] text-gray-500 leading-tight">{detalhe}</p>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
            {ok ? okTexto : falhaTexto}
        </span>
    </div>
);

const VALIDADES = [
    { dias: 0, rotulo: 'Hoje' },
    { dias: 1, rotulo: 'Amanhã' },
    { dias: 3, rotulo: '3 dias' },
    { dias: 7, rotulo: '7 dias' },
];

const SecaoAsaas = () => {
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const resp = await api.get('/asaas/config', { params: { completo: '1' } });
                setConfig(resp.data.config);
                setStatus(resp.data.status);
            } catch {
                toast.error('Não consegui carregar a configuração do Asaas.');
            } finally {
                setCarregando(false);
            }
        })();
    }, []);

    const set = (campo, valor) => setConfig(prev => ({ ...prev, [campo]: valor }));

    const salvar = async () => {
        setSalvando(true);
        try {
            const resp = await api.put('/asaas/config', config);
            setConfig(resp.data.config);
            toast.success('Configuração do Asaas salva! Vale para as próximas cobranças.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    // Exemplo didático: boleto de R$ 500 pago 15 dias atrasado, com os valores da tela
    const exMulta = config?.multaAtiva ? 500 * (Number(config.multaPercent) || 0) / 100 : 0;
    const exJuros = config?.jurosAtivo ? 500 * ((Number(config.jurosMesPercent) || 0) / 100) * (15 / 30) : 0;
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-emerald-50">
                <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-primary" />
                    Asaas — Boleto e PIX
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Multa e juros do boleto, mensagens das cobranças e validade padrão do PIX.</p>
            </div>

            {carregando ? (
                <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Consultando o Asaas...
                </div>
            ) : !config ? (
                <div className="p-6 text-sm text-gray-500">Configuração indisponível no momento.</div>
            ) : (
                <div className="p-6 space-y-6">

                    {/* ── Status da integração ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">Status da integração</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <StatusItem emoji="🔑" titulo="Chave da conta" detalhe="guardada no servidor (EasyPanel)"
                                ok={!!status?.configurado && !status?.erro}
                                okTexto={status?.ambiente === 'PRODUCAO' ? 'Produção ✓' : 'Sandbox ✓'}
                                falhaTexto={status?.erro || 'Não configurada'} />
                            <StatusItem emoji="📥" titulo="Aviso de pagamento" detalhe="webhook: o Asaas avisa o app na hora"
                                ok={!!status?.webhookAtivo} okTexto="Ativo ✓" falhaTexto="Não confirmado" />
                            <StatusItem emoji="🔗" titulo="Conta no Conta Azul" detalhe='baixas entram na conta "ASAAS"'
                                ok={!!status?.contaCaVinculada} okTexto="Vinculada ✓" falhaTexto="Não vinculada" />
                            <StatusItem emoji="🔁" titulo="Vigia de segurança" detalhe="reprocessa baixas pendentes a cada 10 min"
                                ok okTexto="Rodando ✓" falhaTexto="" />
                        </div>
                        <div className="mt-3 bg-mint rounded-xl px-4 py-3 text-[13px] text-primaryDark leading-relaxed">
                            <b>Como o dinheiro vira baixa:</b> 1️⃣ o app emite a cobrança no Asaas → 2️⃣ o cliente paga →
                            3️⃣ o Asaas avisa o app em segundos → 4️⃣ o app dá baixa na parcela <b>aqui e no Conta Azul</b>.
                            Se o aviso falhar, o vigia de 10 min busca o pagamento sozinho.
                        </div>
                    </div>

                    {/* ── Boleto ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">Boleto — multa, juros e mensagem</p>
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-700">Multa por atraso</p>
                                    <p className="text-xs text-gray-500">Cobrada uma vez, no dia seguinte ao vencimento. O banco calcula e cobra sozinho. Máximo por lei: 2%.</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <input
                                        type="number" step="0.25" min="0" max="2"
                                        value={config.multaPercent}
                                        onChange={e => set('multaPercent', e.target.value)}
                                        disabled={!config.multaAtiva}
                                        className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-40"
                                    />
                                    <span className="text-xs font-semibold text-gray-500">%</span>
                                    <Toggle ligado={!!config.multaAtiva} onClick={() => set('multaAtiva', !config.multaAtiva)} />
                                </div>
                            </div>

                            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-700">Juros por atraso</p>
                                    <p className="text-xs text-gray-500">Por mês de atraso, proporcional aos dias (1%/mês ≈ 0,033% por dia). Máximo por lei: 1% ao mês.</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <input
                                        type="number" step="0.25" min="0" max="1"
                                        value={config.jurosMesPercent}
                                        onChange={e => set('jurosMesPercent', e.target.value)}
                                        disabled={!config.jurosAtivo}
                                        className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-40"
                                    />
                                    <span className="text-xs font-semibold text-gray-500">% a.m.</span>
                                    <Toggle ligado={!!config.jurosAtivo} onClick={() => set('jurosAtivo', !config.jurosAtivo)} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem impressa no boleto</label>
                                <textarea
                                    rows={2}
                                    value={config.msgBoleto}
                                    onChange={e => set('msgBoleto', e.target.value)}
                                    maxLength={400}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Variáveis: <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{pedido}'}</code>{' '}
                                    <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{parcela}'}</code>{' '}
                                    <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{cliente}'}</code>{' '}
                                    <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{vencimento}'}</code>
                                    {' '}— o app troca pelo dado real de cada boleto.
                                </p>
                            </div>

                            {(config.multaAtiva || config.jurosAtivo) && (
                                <div className="border border-dashed border-gray-300 rounded-xl px-4 py-3 bg-gray-50 text-[13px]">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Exemplo com os valores acima</p>
                                    <p className="text-gray-600">
                                        Boleto de <b className="text-gray-900">R$ 500,00</b> pago com <b className="text-gray-900">15 dias de atraso</b>:{' '}
                                        {config.multaAtiva && <>multa = <b className="text-gray-900">{fmt(exMulta)}</b></>}
                                        {config.multaAtiva && config.jurosAtivo && ' + '}
                                        {config.jurosAtivo && <>juros de 15 dias = <b className="text-gray-900">{fmt(exJuros)}</b></>}
                                        {' '}→ o cliente paga <b className="text-gray-900">{fmt(500 + exMulta + exJuros)}</b>, e a baixa entra com o extra registrado como multa/juros.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── PIX ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">PIX — validade e mensagem</p>
                        <div className="space-y-4">
                            <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                                <p className="text-sm font-semibold text-gray-700">Validade padrão do QR Code</p>
                                <p className="text-xs text-gray-500 mb-2.5">O que já vem selecionado ao abrir a tela de gerar PIX (dá pra mudar na hora). PIX do motorista na entrega é sempre do dia.</p>
                                <div className="flex gap-2 flex-wrap">
                                    {VALIDADES.map(v => (
                                        <button
                                            key={v.dias}
                                            type="button"
                                            onClick={() => set('pixValidadePadraoDias', v.dias)}
                                            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${Number(config.pixValidadePadraoDias) === v.dias ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:border-primary'}`}
                                        >
                                            {v.rotulo}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do PIX</label>
                                <textarea
                                    rows={2}
                                    value={config.msgPix}
                                    onChange={e => set('msgPix', e.target.value)}
                                    maxLength={400}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Aparece na tela de pagamento e no comprovante do cliente. Variáveis:{' '}
                                    <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{pedido}'}</code>{' '}
                                    <code className="bg-gray-100 rounded px-1.5 py-0.5">{'{cliente}'}</code>
                                </p>
                            </div>
                            <p className="text-xs text-gray-500 flex items-start gap-1.5">
                                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                PIX não tem multa nem juros — venceu, o QR Code simplesmente para de funcionar. Por isso a validade é a única regra dele.
                            </p>
                        </div>
                    </div>

                    {/* ── Avisos ao cliente ── */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">Avisos ao cliente</p>
                        <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-700">Deixar o Asaas avisar o cliente (e-mail/SMS)</p>
                                <p className="text-xs text-gray-500">
                                    O Asaas pode mandar por conta dele: boleto emitido, lembrete de vencimento e aviso de atraso.
                                    <b> Recomendação: manter desligado</b> — nosso WhatsApp + Régua de Cobrança já fazem isso com a cara da Hardt (ligado = cliente avisado em dobro).
                                    Vale para clientes cadastrados no Asaas a partir da mudança.
                                </p>
                            </div>
                            <Toggle ligado={!!config.avisosAsaas} onClick={() => set('avisosAsaas', !config.avisosAsaas)} />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-gray-500">
                            Vale para cobranças <b>emitidas depois de salvar</b> — boletos/PIX já emitidos não mudam (regra do banco).
                        </p>
                        <button
                            onClick={salvar}
                            disabled={salvando}
                            className="px-5 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
                        >
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecaoAsaas;
