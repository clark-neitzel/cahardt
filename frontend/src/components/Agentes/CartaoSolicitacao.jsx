import React, { useMemo, useState } from 'react';
import { Bot, ExternalLink, Check, X, ChevronDown, ChevronRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { ModalBase, BtnPrimario, BtnSecundario, BtnPerigo, BtnPerigoContorno } from '../../pages/Admin/Agentes/ModalBase';
import { fmtDataHora, haQuanto, expiraEmTexto, jsonLegivel, resumoLimpo } from '../../pages/Admin/Agentes/util';

// Cartão de solicitação do agente de IA (Luke), COMPARTILHADO por:
//  - Admin → Solicitações dos agentes (pages/Admin/Agentes/SolicitacoesAgente.jsx)
//  - Chat do Luke → aba "Autorizações" e cartão dentro da conversa (components/Luke/*)
// As travas de segurança vivem aqui e no hook useDecisaoSolicitacao: confirmação "mudou desde o pedido",
// aviso forte ao repetir, "não sei se foi executado" em falha de rede. Não duplicar em outro lugar.
// `compacto` só muda o espaçamento (cabe no painel do chat); o conteúdo é o mesmo.

export const STATUS = {
    PENDENTE: { rotulo: 'Aguardando você', cor: 'bg-blue-100 text-blue-800' },
    EXECUTANDO: { rotulo: 'Executando…', cor: 'bg-blue-100 text-blue-800' },
    AUTORIZADA: { rotulo: 'Autorizada', cor: 'bg-green-100 text-green-800' },
    RECUSADA: { rotulo: 'Recusada', cor: 'bg-gray-100 text-gray-700' },
    ERRO: { rotulo: 'Erro ao executar', cor: 'bg-red-100 text-red-700' },
    ERRO_INDETERMINADO: { rotulo: 'Resultado incerto', cor: 'bg-amber-100 text-amber-700' },
    EXPIRADA: { rotulo: 'Expirada', cor: 'bg-gray-100 text-gray-700' },
};

// Rota de dentro do app: começa com "/", não é "//dominio" e não tem barra invertida (alguns navegadores tratam "\" como "/").
export const rotaSegura = (r) => typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.includes('\\');

export const horaCurta = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// Erro sem resposta (rede/timeout) ou 5xx: o servidor PODE ter executado a ação. Nunca presumir que falhou.
export const falhaIncerta = (e) => !e?.response || e.response.status >= 500;

// ids devolvidos pela ação (array, objeto ou valor solto) -> texto
function idsEmTexto(ids) {
    if (ids == null || ids === '') return '';
    if (Array.isArray(ids)) return ids.filter((x) => x != null).join(', ');
    if (typeof ids === 'object') return Object.entries(ids).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');
    return String(ids);
}

function mensagemDoResultado(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    const m = r.error || r.erro || r.message || r.mensagem;
    return typeof m === 'string' ? m : '';
}

export function Bloco({ titulo, valor }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">{titulo}</p>
            <pre className="text-xs leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{valor || '(vazio)'}</pre>
        </div>
    );
}

export const Aviso = ({ children, testid, cor = 'amber' }) => (
    <div className={`flex gap-2 rounded-lg border p-2.5 text-sm ${cor === 'red' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`} data-testid={testid}>
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0">{children}</div>
    </div>
);

// "POST /api/x" + ?query em destaque (o dono precisa ver coisas como ?forcar=1)
export function Endereco({ item }) {
    return (
        <p className="text-[11px] text-gray-500 font-mono mt-1 break-all">
            {item.metodo} {item.caminho}
            {item.query ? <span className="ml-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-xs" data-testid="query">?{item.query}</span> : null}
        </p>
    );
}

function Resultado({ item }) {
    const [ver, setVer] = useState(false);
    if (!['AUTORIZADA', 'ERRO', 'ERRO_INDETERMINADO'].includes(item.status)) return null;
    const st = item.resultadoStatus;
    const ok = st != null && st >= 200 && st < 300;
    const msg = item.mensagemErro || mensagemDoResultado(item.resultado);
    const ids = idsEmTexto(item.idsResultado);
    const destaque = (st != null && st >= 500) || item.status === 'ERRO_INDETERMINADO';
    return (
        <div className={`rounded-lg border p-3 text-sm ${item.status === 'AUTORIZADA' && ok ? 'bg-green-50 border-green-200 text-green-900' : item.status === 'ERRO_INDETERMINADO' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`} data-testid="resultado">
            <p className="font-semibold">
                {item.status === 'AUTORIZADA' && ok && 'Executado com sucesso'}
                {item.status === 'AUTORIZADA' && !ok && 'Autorizada'}
                {item.status === 'ERRO' && 'A ação deu erro ao executar'}
                {item.status === 'ERRO_INDETERMINADO' && 'O sistema não sabe se a ação foi feita'}
                {st != null && <span className="font-normal"> · resposta {st}</span>}
            </p>
            {ids && <p className="mt-0.5 break-words">Registro(s) gerado(s): <span className="font-mono text-xs">{ids}</span></p>}
            {msg && (destaque
                ? <p className="mt-1.5 rounded-md bg-white border border-amber-300 p-2 font-semibold text-amber-900 break-words" data-testid="mensagem-destaque">{msg}</p>
                : <p className="mt-0.5 break-words">{msg}</p>)}
            {item.resultado != null && (
                <>
                    <button type="button" onClick={() => setVer((v) => !v)} className="mt-1 min-h-[44px] md:min-h-0 inline-flex items-center gap-1 text-xs underline">
                        {ver ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Ver resposta completa
                    </button>
                    {ver && <pre className="text-xs bg-white/70 border border-black/10 rounded-lg p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{jsonLegivel(item.resultado)}</pre>}
                </>
            )}
        </div>
    );
}

export function CartaoSolicitacao({ item, agora, liberaEm, onAbrirTela, onAutorizar, onRecusar, onRepetir, compacto = false }) {
    const [verCorpo, setVerCorpo] = useState(false);
    const st = STATUS[item.status] || { rotulo: item.status, cor: 'bg-gray-100 text-gray-700' };
    const pendente = item.status === 'PENDENTE';
    const expirada = pendente && item.expiraEm && new Date(item.expiraEm).getTime() <= agora;
    const corpo = useMemo(() => (verCorpo ? jsonLegivel(item.body) : ''), [verCorpo, item.body]);
    const temCorpo = item.body != null && !(typeof item.body === 'object' && Object.keys(item.body).length === 0);
    const destino = item.telaDestino && rotaSegura(item.telaDestino.rota) ? item.telaDestino : null;
    // libera às: o que o item traz (repetirLiberaEm) ou o que o servidor informou num 409 REPETIR_MUITO_CEDO (vale o mais tarde)
    const liberaMs = Math.max(item.repetirLiberaEm ? new Date(item.repetirLiberaEm).getTime() || 0 : 0, liberaEm ? new Date(liberaEm).getTime() || 0 : 0);
    const aguardaRepetir = liberaMs > agora;

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${compacto ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`} data-solicitacao-id={item.id} data-status={item.status}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${st.cor}`}>{st.rotulo}</span>
                {item.possivelDuplicata === true && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700" data-testid="selo-duplicata" title="Já existe um pedido igual ou parecido">Possível duplicata</span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Bot className="h-3.5 w-3.5" />{item.agenteNome || 'Agente'}</span>
                <span className="text-xs text-gray-500" title={fmtDataHora(item.createdAt)}>pediu {haQuanto(item.createdAt, agora)}</span>
                {pendente && item.expiraEm && (
                    <span className={`text-xs font-medium ${expirada ? 'text-red-700' : 'text-gray-500'}`}>· {expiraEmTexto(item.expiraEm, agora)}</span>
                )}
            </div>

            <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 break-words">{item.rotulo || item.chave}</p>
                {resumoLimpo(item) && <p className="text-sm text-gray-700 mt-0.5 break-words" data-testid="resumo">{resumoLimpo(item)}</p>}
                <Endereco item={item} />
            </div>

            {item.possivelDuplicata === true && pendente && (
                <Aviso testid="aviso-duplicata">Possível duplicata: já existe um pedido igual ou parecido. Confira a tela de destino antes de autorizar.</Aviso>
            )}

            {item.status === 'EXECUTANDO' && (
                <Aviso testid="aviso-executando">A ação está sendo executada agora. Aguarde alguns instantes e <b>não autorize de novo</b>: esta tela se atualiza sozinha.</Aviso>
            )}

            {item.mudouDesdePedido === true && pendente && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-sm text-amber-900 space-y-2" data-testid="aviso-mudou">
                    <div className="flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>Os dados desta tela mudaram desde que o agente fez o pedido. Confira antes de autorizar.</span>
                    </div>
                    {(item.antes != null || item.agora != null) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Bloco titulo="Quando o agente pediu" valor={item.antes != null ? jsonLegivel(item.antes) : ''} />
                            <Bloco titulo="Agora" valor={item.agora != null ? jsonLegivel(item.agora) : ''} />
                        </div>
                    )}
                </div>
            )}

            {item.bodyTruncado === true && (
                <Aviso testid="aviso-truncado">O corpo mostrado está <b>incompleto</b> (era grande demais). Você não vê tudo o que será enviado: na dúvida, <b>recuse</b>.</Aviso>
            )}

            {item.aviso && item.status !== 'PENDENTE' && <Aviso testid="aviso-repeticao">{item.aviso}</Aviso>}

            {temCorpo && (
                <div>
                    <button type="button" onClick={() => setVerCorpo((v) => !v)} aria-expanded={verCorpo} className="min-h-[44px] md:min-h-0 inline-flex items-center gap-1 text-sm text-primary font-medium">
                        {verCorpo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {verCorpo ? 'Esconder' : 'Ver'} o que será enviado
                    </button>
                    {verCorpo && <div className="mt-1"><Bloco titulo={item.bodyTruncado ? 'Corpo da requisição (INCOMPLETO, dados sensíveis ocultos)' : 'Corpo da requisição (dados sensíveis já ocultos)'} valor={corpo} /></div>}
                </div>
            )}

            {item.status !== 'PENDENTE' && item.status !== 'EXECUTANDO' && (
                <p className="text-xs text-gray-600">
                    {item.status === 'EXPIRADA' ? 'Ninguém decidiu a tempo.' : item.decididoPorNome ? `${item.status === 'RECUSADA' ? 'Recusada' : 'Autorizada'} por ${item.decididoPorNome}${item.decididoEm ? ` em ${fmtDataHora(item.decididoEm)}` : ''}.` : ''}
                    {item.observacaoDecisao ? ` Observação: ${item.observacaoDecisao}` : ''}
                </p>
            )}

            <Resultado item={item} />

            {item.status === 'ERRO_INDETERMINADO' && (
                <Aviso>Antes de tentar de novo, <b>confira na tela</b> se a ação já foi feita. Repetir pode duplicar.</Aviso>
            )}

            <div className={compacto ? 'flex flex-wrap gap-2' : 'flex flex-col sm:flex-row sm:flex-wrap gap-2'}>
                {destino && (
                    <BtnSecundario onClick={() => onAbrirTela(destino.rota)} className="inline-flex items-center justify-center gap-1.5 min-w-0">
                        <ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">Abrir tela{destino.rotulo ? `: ${destino.rotulo}` : ''}</span>
                    </BtnSecundario>
                )}
                {pendente && !expirada && (
                    <>
                        <BtnPrimario onClick={() => onAutorizar(item)} className={`inline-flex items-center justify-center gap-1.5 ${compacto ? 'flex-1 min-w-[120px]' : ''}`}><Check className="h-4 w-4" />Autorizar</BtnPrimario>
                        <BtnPerigoContorno onClick={() => onRecusar(item)} className={`inline-flex items-center justify-center gap-1.5 ${compacto ? 'flex-1 min-w-[120px]' : ''}`}><X className="h-4 w-4" />Recusar</BtnPerigoContorno>
                    </>
                )}
                {pendente && expirada && <p className="text-sm text-red-700 self-center">Prazo vencido. Atualize a lista; o agente precisa pedir de novo.</p>}
                {item.status === 'ERRO_INDETERMINADO' && (
                    <BtnPerigoContorno onClick={() => onRepetir(item)} disabled={!!aguardaRepetir} className="inline-flex items-center justify-center gap-1.5" data-testid="btn-repetir">
                        <RotateCcw className="h-4 w-4" />{aguardaRepetir ? `Tentar de novo (disponível às ${horaCurta(new Date(liberaMs).toISOString())})` : 'Tentar de novo'}
                    </BtnPerigoContorno>
                )}
            </div>
        </div>
    );
}

// Confirmação forte da repetição: repetir uma CRIAÇÃO pode duplicar. Só o "Entendi" habilita o envio.
export function ModalRepetir({ item, avisoServidor, ocupado, onConfirmar, onCancelar, onAbrirTela }) {
    const [entendi, setEntendi] = useState(false);
    const destino = item.telaDestino && rotaSegura(item.telaDestino.rota) ? item.telaDestino : null;
    return (
        <ModalBase
            titulo="Tentar de novo?"
            onFechar={ocupado ? undefined : onCancelar}
            fecharAoClicarFora={false}
            rodape={(
                <>
                    <BtnSecundario onClick={onCancelar} disabled={ocupado}>Cancelar</BtnSecundario>
                    <BtnPerigo onClick={onConfirmar} disabled={!entendi || ocupado}>{ocupado ? 'Aguarde…' : 'Repetir agora'}</BtnPerigo>
                </>
            )}
        >
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-red-900" role="alert" data-testid="aviso-forte-repetir">
                <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 shrink-0" />O sistema não sabe se a ação foi feita.</div>
                <p className="text-sm mt-1">Repetir a <b>criação</b> de algo que já existe <b>pode duplicar</b> (conta, pedido, cadastro). Confira a tela de destino antes.</p>
                {avisoServidor && <p className="text-sm mt-1.5 font-semibold">{avisoServidor}</p>}
            </div>
            <div className="text-sm text-gray-700">
                <p className="font-semibold text-gray-900">{item.rotulo || item.chave}</p>
                {resumoLimpo(item) && <p>{resumoLimpo(item)}</p>}
                <Endereco item={item} />
            </div>
            {destino && (
                <BtnSecundario onClick={() => onAbrirTela(destino.rota)} className="w-full inline-flex items-center justify-center gap-1.5">
                    <ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">Abrir tela{destino.rotulo ? `: ${destino.rotulo}` : ''}</span>
                </BtnSecundario>
            )}
            <label className="flex items-start gap-3 min-h-[44px] rounded-lg border border-gray-300 p-3 cursor-pointer">
                <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" />
                <span className="text-sm font-medium text-gray-900">Entendi, repetir mesmo assim</span>
            </label>
        </ModalBase>
    );
}
