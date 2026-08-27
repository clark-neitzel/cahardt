import { useEffect, useState } from 'react';
import { X, MessageCircle, Check, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../services/clienteService';
import whatsappClientesService, { MOTIVOS_DISPENSA } from '../services/whatsappClientesService';

// ─────────────────────────────────────────────────────────────────────────────
// Pegar o WhatsApp do cliente NA HORA (espelho do ModalPontoGps).
// Usado quando o servidor recusa o envio do pedido com codigo SEM_WHATSAPP:
// o vendedor está EM PÉ, NA FRENTE DO CLIENTE — então é um campo só, botão
// grande, e o pedido segue sozinho depois de salvar (retry automático de quem
// chamou, via onSalvo).
//
// Escape (link discreto "Não consegui agora") registra o motivo no servidor,
// com autor e data — para o escritório ver quem dispensou e por quê.
// ─────────────────────────────────────────────────────────────────────────────

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// Cadastro antigo importado pode ter vindo com o DDI 55 na frente — o campo mostra
// o número local (mesma normalização que o backend faz antes de validar)
const semDdi = (v) => {
    const d = soDigitos(v);
    return (d.length > 11 && d.startsWith('55')) ? d.slice(2) : d;
};

// Só para LER na tela — o que vai para o backend são apenas os dígitos
const formatarVisual = (d) => {
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return '';
};

export default function ModalWhatsappCliente({
    aberto,
    onFechar,
    clienteUuid,
    clienteNome = '',
    numeroAtual = '',
    rotuloSalvar = 'Salvar e enviar o pedido',
    // O escape "Não consegui agora" registra uma DISPENSA de 60 dias que vale para
    // TODO MUNDO naquele cliente. Ele foi desenhado para o momento do bloqueio do
    // ENVIAR — ali o vendedor está preso e precisa de uma saída. Aberto de outro
    // lugar (ex.: o selo de WhatsApp na linha da Rota), viraria uma porta para
    // dispensar qualquer cliente da lista sem nunca ter esbarrado no bloqueio.
    // Por isso quem abre o modal fora do ENVIAR passa `permitirDispensa={false}`:
    // ali o objetivo é PEGAR o número; se não der, é só não usar.
    // Padrão `true` — o uso atual (bloqueio do ENVIAR) não muda.
    permitirDispensa = true,
    onSalvo = null,   // ({ numero }) | ({ dispensaMotivo }) => void
}) {
    const [numero, setNumero] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState(null);            // { texto, noCampo }
    const [mostrarEscape, setMostrarEscape] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [dispensando, setDispensando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setNumero(semDdi(numeroAtual));
        setErro(null);
        setMostrarEscape(false);
        setMotivo('');
        setSalvando(false);
        setDispensando(false);
    }, [aberto, numeroAtual]);

    if (!aberto) return null;

    const digitos = soDigitos(numero);
    const tamanhoOk = digitos.length === 10 || digitos.length === 11;

    const salvar = async () => {
        if (!tamanhoOk) {
            setErro({ texto: 'O número precisa ter 10 ou 11 dígitos, com DDD (ex.: 47999998888).', noCampo: true });
            return;
        }
        if (!clienteUuid) {
            setErro({ texto: 'Cliente não identificado — feche e abra o pedido de novo.', noCampo: false });
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            await clienteService.atualizar(clienteUuid, { Telefone_Celular: digitos });

            // CONFERIR que gravou mesmo. Hoje o PATCH /clientes/:uuid devolve 403 quando
            // quem está salvando não pode mexer no cadastro (só admin / clientes.edit /
            // Pode_Editar_GPS podem) — esse caso cai no catch abaixo, com a mensagem do
            // servidor. Esta conferência é o cinto de segurança para qualquer resposta de
            // sucesso em que o número não tenha sido aplicado: sem ela o modal diria
            // "salvo", o pedido seria reenviado, o servidor barraria de novo e o vendedor
            // ficaria preso no mesmo popup, sem entender o motivo.
            let gravou = true;
            try {
                const atual = await clienteService.detalhar(clienteUuid);
                gravou = soDigitos(atual?.Telefone_Celular) === digitos;
            } catch {
                gravou = true; // não deu para conferir: seguir em frente em vez de travar
            }
            if (!gravou) {
                // Sem o escape na tela, não adianta mandar usar "Não consegui agora"
                setErro({
                    texto: permitirDispensa
                        ? 'O número não foi gravado — o seu usuário não tem permissão para alterar o cadastro do cliente. Peça ao escritório para cadastrar o WhatsApp, ou use "Não consegui agora" para registrar o motivo.'
                        : 'O número não foi gravado — o seu usuário não tem permissão para alterar o cadastro do cliente. Peça ao escritório para cadastrar o WhatsApp deste cliente.',
                    noCampo: false
                });
                if (permitirDispensa) setMostrarEscape(true);
                return;
            }
            if (onSalvo) onSalvo({ numero: digitos });
        } catch (e) {
            const resp = e.response?.data;
            if (!e.response) {
                setErro({ texto: 'Sem internet agora — o número não foi salvo. Tente de novo quando o sinal voltar.', noCampo: false });
            } else if (resp?.codigo === 'WHATSAPP_NAO_EXISTE') {
                // Mensagem vem pronta do backend — não inventar texto próprio aqui
                setErro({ texto: resp.error, noCampo: true });
            } else {
                setErro({ texto: resp?.error || 'Não foi possível salvar o número.', noCampo: false });
            }
        } finally {
            setSalvando(false);
        }
    };

    const dispensar = async () => {
        if (!motivo) return;
        if (!clienteUuid) {
            setErro({ texto: 'Cliente não identificado — feche e abra o pedido de novo.', noCampo: false });
            return;
        }
        setDispensando(true);
        setErro(null);
        try {
            await whatsappClientesService.dispensar(clienteUuid, motivo);
            toast('Motivo registrado — o escritório vai ver esta pendência.', { icon: '📝', duration: 5000 });
            if (onSalvo) onSalvo({ dispensaMotivo: motivo });
        } catch (e) {
            setErro({
                texto: !e.response
                    ? 'Sem internet agora — o motivo não foi registrado. Tente de novo quando o sinal voltar.'
                    : (e.response?.data?.error || 'Não foi possível registrar o motivo.'),
                noCampo: false
            });
        } finally {
            setDispensando(false);
        }
    };

    const visual = formatarVisual(digitos);

    return (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-1.5 rounded-lg shrink-0"><MessageCircle className="h-4 w-4 text-primary" /></div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">
                                WhatsApp do cliente{clienteNome ? ` — ${clienteNome}` : ''}
                            </p>
                            <p className="text-[11px] text-gray-500">Peça o número agora, enquanto você está com ele</p>
                        </div>
                    </div>
                    <button onClick={onFechar} aria-label="Fechar"
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto">
                    <p className="text-[13px] text-gray-600 leading-snug">
                        É por esse número que o cliente recebe a <b>confirmação do pedido</b> e o
                        <b> escritório consegue falar com ele</b> quando você não estiver por perto.
                    </p>

                    {/* Campo do número */}
                    <div>
                        <label htmlFor="campoWhatsappCliente" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Número com DDD *
                        </label>
                        <input
                            id="campoWhatsappCliente"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            autoFocus
                            maxLength={11}
                            placeholder="47999998888"
                            value={numero}
                            onChange={(e) => { setNumero(soDigitos(e.target.value)); setErro(null); }}
                            className={`w-full border rounded px-3 py-3 text-base tabular-nums min-h-[48px] focus:ring-1 focus:outline-none ${erro?.noCampo
                                ? 'border-red-400 focus:border-red-500 focus:ring-red-400 bg-red-50'
                                : 'border-gray-300 focus:border-primary focus:ring-primary'}`}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {visual ? <>Vai ser salvo como <b className="text-gray-700">{visual}</b></> : 'Só números, com DDD (10 ou 11 dígitos).'}
                        </p>
                    </div>

                    {erro && (
                        <div className="text-[13px] bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{erro.texto}</span>
                        </div>
                    )}

                    <button
                        onClick={salvar}
                        disabled={salvando || dispensando || !tamanhoOk}
                        className="w-full px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {salvando ? 'Salvando…' : rotuloSalvar}
                    </button>

                    {/* Escape — discreto de propósito: só abre se a pessoa pedir.
                        Fora do bloqueio do ENVIAR ele não existe (ver permitirDispensa). */}
                    {!permitirDispensa ? null : !mostrarEscape ? (
                        <button
                            onClick={() => setMostrarEscape(true)}
                            className="w-full text-center text-[13px] text-gray-500 underline underline-offset-2 hover:text-gray-700 min-h-[44px]"
                        >
                            Não consegui agora
                        </button>
                    ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Por que não deu?</p>
                            <p className="text-[12px] text-gray-500 leading-snug">
                                O motivo fica registrado com o seu nome e a data — o escritório acompanha essas pendências.
                            </p>
                            <div className="space-y-2">
                                {MOTIVOS_DISPENSA.map(m => (
                                    <button
                                        key={m.valor}
                                        type="button"
                                        onClick={() => setMotivo(m.valor)}
                                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium min-h-[48px] transition-colors ${motivo === m.valor
                                            ? 'bg-mint border-primary text-primaryDark font-semibold'
                                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        {motivo === m.valor ? '● ' : '○ '}{m.rotulo}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-col md:flex-row gap-2 pt-1">
                                <button
                                    onClick={() => { setMostrarEscape(false); setMotivo(''); }}
                                    className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm min-h-[44px]"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={dispensar}
                                    disabled={!motivo || dispensando || salvando}
                                    className="flex-1 px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                                >
                                    {dispensando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {dispensando ? 'Registrando…' : 'Registrar e continuar'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
