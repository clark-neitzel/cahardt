import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MessageCircle } from 'lucide-react';
import SelectBusca from '../../../components/SelectBusca';
import CampoNumero from '../../../components/CampoNumero';
import chatLukeService from '../../../services/chatLukeService';
import { mensagemErro } from '../../../services/agenteService';
import { ConfirmModal, BtnPrimario } from './ModalBase';
import { SELECT_TOQUE } from './util';

// Cartão "Chat do Luke" (Admin → Agentes de IA): LIGAR/DESLIGAR o chat, escolher qual agente atende e ajustar os
// limites gerais por pessoa/dia. Rotas: GET/PUT /api/chat-luke/config (só administrador humano).
// Quem pode conversar com o Luke continua sendo decidido pessoa por pessoa em Usuários → Permissões.
const LIMITES = [
    { chave: 'pedidosDia', rotulo: 'Pedidos ao Luke por dia', dica: 'Cada mensagem enviada na aba "Pedir ao Luke" conta 1' },
    { chave: 'anexosDia', rotulo: 'Anexos por dia', dica: 'Fotos e PDFs enviados' },
    { chave: 'duvidasDia', rotulo: 'Dúvidas por dia', dica: 'Perguntas na aba "Tirar dúvida"' },
];
const paraTexto = (l) => Object.fromEntries(LIMITES.map((x) => [x.chave, String(l?.[x.chave] ?? '')]));

export default function CartaoChatLuke({ agentes }) {
    const [cfg, setCfg] = useState(null);
    const [erro, setErro] = useState('');
    const [agenteId, setAgenteId] = useState('');
    const [limites, setLimites] = useState({ pedidosDia: '', anexosDia: '', duvidasDia: '' });
    const [salvando, setSalvando] = useState(false);
    const [confirmaDesligar, setConfirmaDesligar] = useState(false);
    const [erroForm, setErroForm] = useState('');

    const aplicar = useCallback((c) => {
        setCfg(c);
        setAgenteId(c.agenteId || '');
        setLimites(paraTexto(c.limites));
    }, []);
    const carregar = useCallback(() => {
        setErro('');
        chatLukeService.lerConfig().then(aplicar).catch((e) => setErro(mensagemErro(e, 'Não foi possível carregar a configuração do chat.')));
    }, [aplicar]);
    useEffect(() => { carregar(); }, [carregar]);

    const agentesAtivos = useMemo(() => (agentes || []).filter((a) => a.ativo !== false), [agentes]);
    const mudouAgente = cfg ? (agenteId || '') !== (cfg.agenteId || '') : false;
    const mudouLimites = cfg ? LIMITES.some((l) => String(limites[l.chave]) !== String(cfg.limites?.[l.chave] ?? '')) : false;
    const sujo = mudouAgente || mudouLimites;

    // Aplica uma mudança e devolve o estado salvo pelo servidor (o servidor é quem manda no que ficou valendo)
    const gravar = async (corpo, okMsg) => {
        if (salvando) return false;
        setSalvando(true); setErroForm('');
        try {
            await chatLukeService.salvarConfig(corpo);
            const novo = await chatLukeService.lerConfig();
            aplicar(novo);
            toast.success(okMsg);
            return true;
        } catch (e) {
            const m = mensagemErro(e, 'Não foi possível salvar. Tente de novo.');
            setErroForm(m); toast.error(m);
            return false;
        } finally { setSalvando(false); }
    };

    const alternar = () => {
        if (!cfg || salvando) return;
        if (cfg.ativo) setConfirmaDesligar(true);
        else gravar({ ativo: true }, 'Chat do Luke ligado.');
    };
    const desligar = async () => { await gravar({ ativo: false }, 'Chat do Luke desligado.'); setConfirmaDesligar(false); };

    const salvar = async () => {
        const corpo = {};
        if (mudouAgente) corpo.agenteId = agenteId || null;
        if (mudouLimites) {
            const lim = {};
            for (const l of LIMITES) {
                const n = Number(limites[l.chave]);
                if (limites[l.chave] === '' || !Number.isInteger(n) || n < 0 || n > 100000) { setErroForm(`${l.rotulo}: use um número inteiro de 0 a 100000.`); return; }
                lim[l.chave] = n;
            }
            corpo.limites = lim;
        }
        await gravar(corpo, 'Configuração salva.');
    };

    const wh = cfg?.webhook;
    const avisoTxt = !wh ? '' : (wh.ligado ? 'configurado' : 'não configurado (falta LUKE_WEBHOOK_URL ou LUKE_WEBHOOK_SECRET no EasyPanel)');

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm" data-testid="cartao-chat-luke">
            <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                <MessageCircle className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Chat do Luke</span>
            </div>
            <div className="p-4 md:p-5 space-y-4">
                {erro && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex flex-wrap items-center gap-3" role="alert">
                        <span className="flex-1 min-w-0">{erro}</span>
                        <button type="button" onClick={carregar} className="min-h-[44px] px-4 rounded-full border border-red-300 bg-white text-red-700 font-medium">Tentar de novo</button>
                    </div>
                )}
                {!cfg && !erro && <div className="py-4 text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>}
                {cfg && (
                    <>
                        {/* (1) interruptor geral */}
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                            <div className="min-w-0">
                                <p className="text-base font-bold text-gray-900">Chat do Luke {cfg.ativo ? 'ligado' : 'desligado'}</p>
                                <p className="text-sm text-gray-600 mt-0.5">
                                    {cfg.ativo
                                        ? 'Quem tem permissão pode mandar pedidos ao Luke.'
                                        : 'A aba "Pedir ao Luke" está desligada para todos. Novidades e dúvidas continuam funcionando.'}
                                </p>
                            </div>
                            <button
                                type="button" role="switch" aria-checked={cfg.ativo} aria-label="Chat do Luke ligado" onClick={alternar} disabled={salvando} data-testid="chave-chat-luke"
                                className={`relative inline-flex h-9 w-16 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-60 ${cfg.ativo ? 'bg-primary' : 'bg-gray-300'}`}
                            >
                                <span className={`pointer-events-none inline-block h-8 w-8 transform rounded-full bg-white shadow transition duration-200 ${cfg.ativo ? 'translate-x-7' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* (2) agente que atende */}
                        <div>
                            <label className="text-sm font-medium text-gray-700">Qual agente atende o chat</label>
                            <SelectBusca value={agenteId} onChange={(e) => { setAgenteId(e.target.value); setErroForm(''); }} className={`w-full mt-1 ${SELECT_TOQUE}`}>
                                <option value="">Nenhum (o chat grava, mas ninguém responde)</option>
                                {agentesAtivos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                                {/* agente já escolhido que saiu da lista de ativos continua aparecendo, para não sumir sem aviso */}
                                {cfg.agenteId && !agentesAtivos.some((a) => a.id === cfg.agenteId) && <option value={cfg.agenteId}>{cfg.agenteNome || 'Agente (inativo)'}</option>}
                            </SelectBusca>
                            <p className="text-xs text-gray-500 mt-1">Só o agente escolhido aqui lê e responde as conversas. Sem agente, o usuário vê "Luke ainda não conectado".</p>
                        </div>

                        {/* (3) limites gerais */}
                        <div>
                            <p className="text-sm font-medium text-gray-700">Limites por pessoa, por dia</p>
                            <p className="text-xs text-gray-500">Administrador não tem limite diário. Ao chegar no limite, a pessoa vê o aviso e volta no dia seguinte.</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                                {LIMITES.map((l) => (
                                    <label key={l.chave} className="block">
                                        <span className="text-sm text-gray-700">{l.rotulo}</span>
                                        <CampoNumero
                                            value={limites[l.chave]} min={0} max={100000} inputMode="numeric"
                                            onChange={(e) => { setLimites((x) => ({ ...x, [l.chave]: e.target.value })); setErroForm(''); }}
                                            className="mt-1 w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            aria-label={l.rotulo} data-testid={`limite-${l.chave}`}
                                        />
                                        <span className="block text-xs text-gray-500 mt-0.5">{l.dica}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {erroForm && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{erroForm}</p>}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <BtnPrimario onClick={salvar} disabled={!sujo || salvando} data-testid="salvar-chat-luke">{salvando ? 'Salvando…' : 'Salvar alterações'}</BtnPrimario>
                            {sujo && !salvando && <span className="text-xs text-amber-700">Há alterações não salvas.</span>}
                        </div>

                        {/* (4) estado do aviso automático (só leitura, sem segredo) + (5) ajuda */}
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 space-y-1.5">
                            <p><b>Aviso automático ao Luke:</b> {avisoTxt}{wh?.ligado && wh.modo ? ` (assinatura ${wh.modo})` : ''}. <span className="text-gray-500">É configurado no EasyPanel (LUKE_WEBHOOK_URL e LUKE_WEBHOOK_SECRET); aqui só se vê o estado.</span></p>
                            <p>Para alguém conversar com o Luke, ligue <b>"Conversar com o Luke"</b> nas permissões da pessoa (Usuários → Permissões).</p>
                        </div>
                    </>
                )}
            </div>

            {confirmaDesligar && (
                <ConfirmModal
                    titulo="Desligar o chat do Luke?"
                    rotuloConfirmar="Desligar o chat" perigo ocupado={salvando}
                    onConfirmar={desligar} onCancelar={() => setConfirmaDesligar(false)}
                    aviso="A aba 'Pedir ao Luke' deixa de funcionar para TODOS, na hora. Pedidos já enviados continuam guardados."
                >
                    <p>Novidades e a aba "Tirar dúvida" continuam funcionando. Você pode ligar de novo quando quiser.</p>
                </ConfirmModal>
            )}
        </div>
    );
}
