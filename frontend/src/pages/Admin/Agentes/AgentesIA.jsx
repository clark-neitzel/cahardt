import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, BookOpen, KeyRound, Plus, RefreshCw, ShieldCheck, ChevronDown, ChevronRight, AlertTriangle, Loader2, Ban } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import PageHeader from '../../../components/PageHeader';
import EstadoVazio from '../../../components/EstadoVazio';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { ModalBase, ConfirmModal, BtnPrimario, BtnSecundario, BtnPerigoContorno } from './ModalBase';
import TokenModal from './TokenModal';
import MatrizApiModal from './MatrizApiModal';
import KitConexaoModal from './KitConexaoModal';
import { fmtData, diasRestantes, haQuanto } from './util';

const AVISO_DIAS = 14;

function estadoDoToken(t, agora = Date.now()) {
    if (t.revogadoEm) return { chave: 'revogado', rotulo: 'Revogado', cor: 'bg-gray-100 text-gray-700', ativo: false };
    const dias = diasRestantes(t.expiraEm, agora);
    if (dias !== null && dias <= 0) return { chave: 'expirado', rotulo: 'Expirado', cor: 'bg-red-100 text-red-700', ativo: false };
    if (dias !== null && dias <= AVISO_DIAS) return { chave: 'vencendo', rotulo: `Expira em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, cor: 'bg-amber-100 text-amber-700', ativo: true, dias };
    return { chave: 'ativo', rotulo: 'Ativo', cor: 'bg-green-100 text-green-800', ativo: true, dias };
}

function LinhaToken({ t, onRevogar }) {
    const est = estadoDoToken(t);
    return (
        <div className={`rounded-lg border p-3 ${est.ativo ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`} data-token-id={t.id}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-gray-900 break-all">cah_ag_{t.prefixo}…</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${est.cor}`}>{est.rotulo}</span>
                <span className="text-sm text-gray-600 min-w-0 truncate">{t.nome}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                <div><dt className="text-gray-500">Criado em</dt><dd className="text-gray-800 font-medium">{fmtData(t.criadoEm) || '–'}</dd></div>
                <div><dt className="text-gray-500">{t.revogadoEm ? 'Revogado em' : 'Expira em'}</dt><dd className="text-gray-800 font-medium">{fmtData(t.revogadoEm || t.expiraEm) || 'sem prazo'}</dd></div>
                <div>
                    <dt className="text-gray-500">Último uso</dt>
                    <dd className="text-gray-800 font-medium">{t.ultimoUsoEm ? `${haQuanto(t.ultimoUsoEm)}${t.ultimoUsoIp ? ` · ${t.ultimoUsoIp}` : ''}` : 'nunca usado'}</dd>
                </div>
                <div><dt className="text-gray-500">Usos · limite</dt><dd className="text-gray-800 font-medium">{t.totalUsos ?? 0}{t.limitePorMinuto != null ? ` · ${t.limitePorMinuto}/min` : ''}</dd></div>
            </dl>
            {est.ativo && (
                <div className="mt-2.5">
                    <BtnPerigoContorno onClick={() => onRevogar(t)} className="w-full md:w-auto !min-h-[44px]">Revogar</BtnPerigoContorno>
                </div>
            )}
        </div>
    );
}

function CartaoAgente({ agente, onMudou }) {
    const [tokenModal, setTokenModal] = useState(null); // 'novo' | 'rotacionar'
    const [matrizAberta, setMatrizAberta] = useState(false);
    const [kitAberto, setKitAberto] = useState(false);
    const [revogar, setRevogar] = useState(null);
    const [revogando, setRevogando] = useState(false);
    const [verInativos, setVerInativos] = useState(false);

    const tokens = useMemo(() => agente.agenteTokens || agente.tokens || [], [agente.agenteTokens, agente.tokens]);
    const ativos = useMemo(() => tokens.filter((t) => estadoDoToken(t).ativo), [tokens]);
    const inativos = useMemo(() => tokens.filter((t) => !estadoDoToken(t).ativo), [tokens]);
    const vencendo = ativos.filter((t) => estadoDoToken(t).chave === 'vencendo');

    const confirmarRevogar = async () => {
        if (!revogar || revogando) return;
        setRevogando(true);
        try {
            const r = await agenteService.revogarToken(agente.id, revogar.id);
            toast.success('Token revogado. O agente que o usa perde o acesso agora.');
            const n = Number(r?.recusadasAutomaticamente) || 0;
            if (n > 0) toast(`${n} ${n === 1 ? 'solicitação pendente foi recusada' : 'solicitações pendentes foram recusadas'}.`, { icon: 'ℹ️', duration: 9000 });
            setRevogar(null);
            onMudou();
        } catch (e) {
            toast.error(mensagemErro(e, 'Não foi possível revogar.'));
        } finally {
            setRevogando(false);
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm" data-agente-id={agente.id}>
            {/* cabeçalho do agente */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 border-b border-gray-100">
                <div className="bg-purple-100 p-2 rounded-lg shrink-0"><Bot className="h-5 w-5 text-purple-600" /></div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900 break-words">{agente.nome}</h2>
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-100 text-purple-700 tracking-wide">AGENTE</span>
                        {agente.ativo === false
                            ? <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">Inativo</span>
                            : <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Ativo</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{ativos.length} token(s) ativo(s){agente.createdAt ? ` · criado em ${fmtData(agente.createdAt)}` : ''}</p>
                </div>
            </div>

            {/* tokens */}
            <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Tokens de acesso</span>
                </div>

                {ativos.length === 0 && (
                    <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>Este agente não tem token ativo: ele não consegue acessar o sistema. Gere um novo token.</span>
                    </div>
                )}
                {vencendo.length > 0 && (
                    <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900" data-testid="aviso-vencendo">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{vencendo.length === 1 ? 'Um token expira' : `${vencendo.length} tokens expiram`} em até {AVISO_DIAS} dias. Use <b>Rotacionar</b> para trocar sem deixar o agente sem acesso.</span>
                    </div>
                )}

                <div className="space-y-2">
                    {ativos.map((t) => <LinhaToken key={t.id} t={t} onRevogar={setRevogar} />)}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                    <BtnPrimario onClick={() => setTokenModal('novo')} className="inline-flex items-center justify-center gap-1.5"><Plus className="h-4 w-4" />Gerar novo token</BtnPrimario>
                    {ativos.length > 0 && (
                        <BtnSecundario onClick={() => setTokenModal('rotacionar')} className="inline-flex items-center justify-center gap-1.5"><RefreshCw className="h-4 w-4" />Rotacionar</BtnSecundario>
                    )}
                </div>

                {inativos.length > 0 && (
                    <div>
                        <button type="button" onClick={() => setVerInativos((v) => !v)} className="min-h-[44px] inline-flex items-center gap-1 text-sm text-gray-600 hover:text-primary">
                            {verInativos ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            Tokens revogados ou vencidos ({inativos.length})
                        </button>
                        {verInativos && <div className="space-y-2 mt-1">{inativos.map((t) => <LinhaToken key={t.id} t={t} onRevogar={setRevogar} />)}</div>}
                    </div>
                )}
            </div>

            {/* permissões da API (módulo × ação) */}
            <div className="border-t border-gray-100 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 rounded-b-xl">
                <div className="flex items-start gap-2.5 min-w-0">
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primaryDark" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Permissões da API (módulo × ação)</p>
                        <p className="text-xs text-gray-600">Escolha por módulo o que é bloqueado (NÃO), pede autorização (PEDE) ou executa direto (SIM).</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    <BtnSecundario onClick={() => setKitAberto(true)} className="inline-flex items-center justify-center gap-1.5" data-testid="btn-kit-conexao">
                        <BookOpen className="h-4 w-4" /> Kit de conexão
                    </BtnSecundario>
                    <BtnPrimario onClick={() => setMatrizAberta(true)} className="inline-flex items-center justify-center gap-1.5" data-testid="btn-permissoes-api">
                        <ShieldCheck className="h-4 w-4" /> Permissões da API
                    </BtnPrimario>
                </div>
            </div>

            {kitAberto && (
                <KitConexaoModal
                    agente={agente}
                    onFechar={() => setKitAberto(false)}
                />
            )}

            {matrizAberta && (
                <MatrizApiModal
                    agente={agente}
                    onFechar={() => setMatrizAberta(false)}
                    onSalvo={onMudou}
                />
            )}

            {tokenModal && (
                <TokenModal
                    agente={agente}
                    modo={tokenModal}
                    tokensAtivos={ativos}
                    onFechar={() => setTokenModal(null)}
                    onMudou={onMudou}
                />
            )}
            {revogar && (
                <ConfirmModal
                    titulo="Revogar token"
                    rotuloConfirmar="Revogar agora"
                    perigo
                    ocupado={revogando}
                    onConfirmar={confirmarRevogar}
                    onCancelar={() => setRevogar(null)}
                    aviso="Quem estiver usando este token perde o acesso imediatamente. Não dá para desfazer; só gerando outro token."
                >
                    <p className="text-red-800 font-semibold" data-testid="aviso-pendentes-token">As solicitações pendentes DESTE AGENTE serão RECUSADAS automaticamente: todas, não só as do token revogado.</p>
                    <p>Token <span className="font-mono font-semibold">cah_ag_{revogar.prefixo}…</span> ({revogar.nome}) do agente <b>{agente.nome}</b>.</p>
                </ConfirmModal>
            )}
        </div>
    );
}

function NovoAgenteModal({ onFechar, onCriado }) {
    const [nome, setNome] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const criar = async () => {
        if (!nome.trim() || salvando) return;
        setSalvando(true); setErro('');
        try {
            await agenteService.criar(nome.trim());
            toast.success('Agente criado. Agora gere o token dele.');
            onCriado();
        } catch (e) {
            setErro(mensagemErro(e, 'Não foi possível criar o agente.'));
        } finally { setSalvando(false); }
    };
    return (
        <ModalBase titulo="Novo agente" onFechar={salvando ? undefined : onFechar} rodape={(
            <>
                <BtnSecundario onClick={onFechar} disabled={salvando}>Cancelar</BtnSecundario>
                <BtnPrimario onClick={criar} disabled={!nome.trim() || salvando}>{salvando ? 'Criando…' : 'Criar agente'}</BtnPrimario>
            </>
        )}>
            <label className="block">
                <span className="text-sm font-medium text-gray-700">Nome do agente</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter') criar(); }}
                    placeholder="Ex.: Luke (agente)"
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
            </label>
            <p className="text-xs text-gray-500">O agente nasce com as permissões de base necessárias (nunca administrador) e acessa a API exclusivamente por token, obedecendo à Matriz de Permissões da API (SIM · PEDE · NÃO).</p>
            {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{erro}</p>}
        </ModalBase>
    );
}

function Conteudo() {
    const [agentes, setAgentes] = useState(null);
    const [erro, setErro] = useState('');
    const [novo, setNovo] = useState(false);

    const [recarga, setRecarga] = useState(0);
    const carregar = useCallback(() => setRecarga((n) => n + 1), []);
    useEffect(() => {
        let vivo = true;
        agenteService.listar()
            .then((r) => { if (vivo) { setAgentes(Array.isArray(r) ? r : []); setErro(''); } })
            .catch((e) => { if (vivo) setErro(mensagemErro(e, 'Não foi possível carregar os agentes.')); });
        return () => { vivo = false; };
    }, [recarga]);

    return (
        <div className="max-w-full overflow-x-hidden pb-6">
            <PageHeader
                icon={Bot}
                cor="purple"
                titulo="Agentes de IA"
                subtitulo="Robôs com token de acesso: quem são e os tokens de cada um"
                acoes={<BtnSecundario onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />Novo agente</BtnSecundario>}
            />
            <div className="px-3 md:px-6 space-y-4">
                {erro && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex flex-wrap items-center gap-3" role="alert">
                        <span className="flex-1 min-w-0">{erro}</span>
                        <button type="button" onClick={carregar} className="min-h-[44px] px-4 rounded-full border border-red-300 bg-white text-red-700 font-medium">Tentar de novo</button>
                    </div>
                )}
                {!agentes && !erro && <div className="py-10 text-center text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>}
                {agentes && agentes.length === 0 && (
                    <EstadoVazio icon={Ban} titulo="Nenhum agente cadastrado" descricao="Crie um agente para dar a ele um token de acesso." acao={{ label: 'Novo agente', onClick: () => setNovo(true) }} />
                )}
                {agentes && agentes.map((a) => <CartaoAgente key={a.id} agente={a} onMudou={carregar} />)}
            </div>
            {novo && <NovoAgenteModal onFechar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar(); }} />}
        </div>
    );
}

// Porta de entrada: só admin. Quem não é admin e digita a URL vê o aviso e NENHUMA chamada à API é feita.
export default function AgentesIA() {
    const { user } = useAuth();
    if (!user?.permissoes?.admin) {
        return <div className="p-8 text-center text-red-600 font-bold" data-testid="sem-permissao">Sem permissão. Esta tela é só para administradores.</div>;
    }
    return <Conteudo />;
}
