import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Check, ShieldAlert, KeyRound } from 'lucide-react';
import SelectBusca from '../../../components/SelectBusca';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { ModalBase, BtnPrimario, BtnSecundario, BtnPerigo } from './ModalBase';
import { copiarTexto, fmtData, SELECT_TOQUE } from './util';

const VALIDADES = [
    { v: '30', t: '30 dias' },
    { v: '90', t: '90 dias (recomendado)' },
    { v: '180', t: '180 dias' },
    { v: '365', t: '1 ano' },
];

/**
 * Gera um token novo (modo 'novo') ou gera um novo e oferece revogar os antigos (modo 'rotacionar').
 * O token em claro vive SÓ no estado deste modal — fechou, sumiu. Nada vai para storage, URL ou log.
 */
export default function TokenModal({ agente, modo = 'novo', tokensAtivos: tokensAtivosAoAbrir = [], onFechar, onMudou }) {
    // Foto dos tokens ativos NO MOMENTO DE ABRIR: depois de gerar, a lista da tela já inclui o token novo,
    // e "revogar os antigos" jamais pode pegar o recém-criado.
    const [tokensAtivos] = useState(() => tokensAtivosAoAbrir.slice());
    const [nome, setNome] = useState(modo === 'rotacionar' ? 'Token rotacionado' : 'Token de uso');
    const [validade, setValidade] = useState('90');
    const [gerando, setGerando] = useState(false);
    const [erro, setErro] = useState('');
    const [criado, setCriado] = useState(null); // { token, prefixo, expiraEm }
    const [copiado, setCopiado] = useState(false);
    const [confirmaFechar, setConfirmaFechar] = useState(false);
    const [revogando, setRevogando] = useState(false);
    const [antigosRevogados, setAntigosRevogados] = useState(false);

    const gerar = async () => {
        if (gerando) return;
        setGerando(true);
        setErro('');
        try {
            const r = await agenteService.criarToken(agente.id, { nome: nome.trim() || 'token', validadeDias: Number(validade) });
            setCriado({ token: r.token, prefixo: r.prefixo, expiraEm: r.expiraEm });
            onMudou?.();
        } catch (e) {
            setErro(mensagemErro(e, 'Não foi possível gerar o token.'));
        } finally {
            setGerando(false);
        }
    };

    const copiar = async () => {
        const ok = await copiarTexto(criado.token);
        if (ok) { setCopiado(true); toast.success('Token copiado.'); }
        else toast.error('Não consegui copiar sozinho. Selecione o texto e copie à mão.');
    };

    const revogarAntigos = async () => {
        setRevogando(true);
        let falhas = 0;
        let recusadas = 0;
        for (const t of tokensAtivos) {
            try {
                const r = await agenteService.revogarToken(agente.id, t.id);
                recusadas += Number(r?.recusadasAutomaticamente) || 0;
            } catch { falhas += 1; }
        }
        setRevogando(false);
        setAntigosRevogados(true);
        onMudou?.();
        if (falhas) toast.error(`${falhas} token(s) antigo(s) não foram revogados. Revogue-os na lista.`);
        else toast.success('Tokens antigos revogados.');
        if (recusadas > 0) toast(`${recusadas} ${recusadas === 1 ? 'solicitação pendente foi recusada' : 'solicitações pendentes foram recusadas'}.`, { icon: 'ℹ️', duration: 9000 });
    };

    const tentarFechar = () => {
        if (criado && !copiado && !confirmaFechar) { setConfirmaFechar(true); return; }
        onFechar();
    };

    // ── Passo 1: formulário ──
    if (!criado) {
        return (
            <ModalBase
                titulo={modo === 'rotacionar' ? `Rotacionar token — ${agente.nome}` : `Novo token — ${agente.nome}`}
                onFechar={gerando ? undefined : onFechar}
                rodape={(
                    <>
                        <BtnSecundario onClick={onFechar} disabled={gerando}>Cancelar</BtnSecundario>
                        <BtnPrimario onClick={gerar} disabled={gerando}>{gerando ? 'Gerando…' : 'Gerar token'}</BtnPrimario>
                    </>
                )}
            >
                {modo === 'rotacionar' && (
                    <p className="text-sm text-gray-600">
                        Vamos gerar um token novo. Depois de copiar e colocar no agente, você poderá revogar
                        {tokensAtivos.length === 1 ? ' o token antigo' : ` os ${tokensAtivos.length} tokens antigos`} com um clique.
                    </p>
                )}
                <label className="block">
                    <span className="text-sm font-medium text-gray-700">Nome (para você reconhecer depois)</span>
                    <input
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        maxLength={80}
                        autoComplete="off"
                        name="nome-do-token"
                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </label>
                <div>
                    <span className="text-sm font-medium text-gray-700">Validade</span>
                    <SelectBusca value={validade} onChange={(e) => setValidade(e.target.value)} className={`mt-1 w-full ${SELECT_TOQUE}`}>
                        {VALIDADES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </SelectBusca>
                </div>
                {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{erro}</p>}
            </ModalBase>
        );
    }

    // ── Passo 2: token aparece UMA vez ──
    return (
        <ModalBase
            titulo="Token gerado"
            onFechar={tentarFechar}
            fecharAoClicarFora={false}
            esconderX
            largura="md:max-w-lg"
            rodape={(
                confirmaFechar ? (
                    <>
                        <BtnSecundario onClick={() => setConfirmaFechar(false)}>Voltar e copiar</BtnSecundario>
                        <BtnPerigo onClick={onFechar}>Fechar mesmo assim</BtnPerigo>
                    </>
                ) : (
                    <BtnPrimario onClick={tentarFechar}>{copiado ? 'Já guardei, fechar' : 'Fechar'}</BtnPrimario>
                )
            )}
        >
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-red-900" role="alert">
                <div className="flex items-center gap-2 font-bold text-base">
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                    Copie agora. Não será mostrado de novo.
                </div>
                <ul className="mt-1.5 text-sm list-disc pl-5 space-y-0.5">
                    <li>Depois de fechar esta janela não há como ver este token.</li>
                    <li>Não cole em conversa, e-mail ou WhatsApp. Coloque direto na configuração do agente.</li>
                </ul>
            </div>

            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">Token</p>
                <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-[13px] leading-snug break-all select-all text-gray-900" data-testid="token-em-claro">
                    {criado.token}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                    Começa com <span className="font-mono">cah_ag_{criado.prefixo}…</span>
                    {criado.expiraEm ? ` · vale até ${fmtData(criado.expiraEm)}` : ''}
                </p>
            </div>

            <button
                type="button"
                onClick={copiar}
                className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sm ${copiado ? 'bg-mint text-primaryDark border border-primary' : 'bg-primary hover:bg-primaryDark text-white shadow-sm'}`}
            >
                {copiado ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar token</>}
            </button>

            {confirmaFechar && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
                    Você ainda não copiou o token. Se fechar agora, ele se perde e será preciso gerar outro.
                </p>
            )}

            {modo === 'rotacionar' && tokensAtivos.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <p className="text-sm text-gray-700 flex items-start gap-2">
                        <KeyRound className="h-4 w-4 mt-0.5 shrink-0 text-gray-500" />
                        <span>
                            {antigosRevogados
                                ? 'Os tokens antigos foram revogados. As solicitações pendentes DESTE AGENTE foram recusadas automaticamente (todas, não só as dos tokens revogados).'
                                : <>Quando o agente já estiver usando o token novo, revogue {tokensAtivos.length === 1 ? 'o token antigo' : `os ${tokensAtivos.length} tokens antigos`}: <span className="font-mono text-xs">{tokensAtivos.map((t) => `cah_ag_${t.prefixo}…`).join(', ')}</span>. <b className="text-red-800">Atenção: as solicitações pendentes DESTE AGENTE serão RECUSADAS automaticamente (todas, não só as dos tokens revogados).</b></>}
                        </span>
                    </p>
                    {!antigosRevogados && (
                        <BtnPerigo onClick={revogarAntigos} disabled={revogando} className="w-full">
                            {revogando ? 'Revogando…' : 'Revogar os antigos agora'}
                        </BtnPerigo>
                    )}
                </div>
            )}
        </ModalBase>
    );
}
