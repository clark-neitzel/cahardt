import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Loader2,
    Lock, RefreshCw, RotateCcw, Save, ShieldCheck, X
} from 'lucide-react';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { ModalBase, ConfirmModal, BtnPrimario, BtnSecundario } from './ModalBase';

const COR_NIVEL_ATIVO = {
    NAO: 'bg-gray-700 text-white shadow-sm',
    PEDE: 'bg-amber-500 text-white shadow-sm',
    SIM: 'bg-primary text-white shadow-sm',
};

const COR_NIVEL_INATIVO = {
    NAO: 'text-gray-600 hover:bg-gray-100',
    PEDE: 'text-amber-800 hover:bg-amber-50',
    SIM: 'text-primaryDark hover:bg-mint/40',
};

const ROTULO_NIVEL = { NAO: 'NÃO', PEDE: 'PEDE', SIM: 'SIM' };

const ACOES_SENSIVEIS_SIM = new Set(['baixar', 'estornar', 'excluir']);

const ROTULO_GRUPO_FIXO = {
    FIXO_DURO: 'Bloqueios de segurança (nunca liberáveis)',
    EFEITO_EXTERNO: 'Envios e consultas externas bloqueados',
    SO_ADMIN: 'Exclusivo de administrador humano',
    FORA_DE_ESCOPO: 'Fora da matriz (dados pessoais / internos)',
};

function SeletorNivel({ niveisAceitos, valor, onChange, disabled, compacto = false, testId }) {
    const opcoes = Array.isArray(niveisAceitos) && niveisAceitos.length ? niveisAceitos : ['NAO', 'PEDE', 'SIM'];
    return (
        <div
            className="raio-proprio inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 gap-0.5"
            role="group"
            data-testid={testId}
        >
            {opcoes.map((op) => {
                const ativo = valor === op;
                return (
                    <button
                        key={op}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(op)}
                        aria-pressed={ativo}
                        className={`raio-proprio rounded-full font-bold transition-colors disabled:opacity-50 ${
                            compacto
                                ? 'px-2.5 py-1 text-[11px] min-h-[32px]'
                                : 'px-3 py-2 text-xs min-h-[44px] lg:min-h-[32px] lg:px-2.5 lg:py-1 lg:text-[11px]'
                        } ${ativo ? COR_NIVEL_ATIVO[op] : COR_NIVEL_INATIVO[op]}`}
                    >
                        {ROTULO_NIVEL[op] || op}
                    </button>
                );
            })}
        </div>
    );
}

function ModalFuncoesCelula({ agenteId, filtro, onFechar }) {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        setDados(null);
        setErro('');
        agenteService.funcoesMatriz(agenteId, { modulo: filtro.modulo, acao: filtro.acao || undefined })
            .then((r) => { if (vivo) setDados(r); })
            .catch((e) => { if (vivo) setErro(mensagemErro(e, 'Não foi possível carregar as funções.')); });
        return () => { vivo = false; };
    }, [agenteId, filtro.modulo, filtro.acao]);

    const titulo = `${filtro.rotuloModulo}${filtro.rotuloAcao ? ` · ${filtro.rotuloAcao}` : ''}`;

    return (
        <ModalBase
            titulo={`Funções — ${titulo}`}
            onFechar={onFechar}
            largura="md:max-w-2xl"
            rodape={<BtnSecundario onClick={onFechar}>Fechar</BtnSecundario>}
        >
            {erro && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800" role="alert">
                    {erro}
                </div>
            )}
            {!dados && !erro && (
                <div className="py-8 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando funções…
                </div>
            )}
            {dados && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                        {dados.total} {dados.total === 1 ? 'função mapeada' : 'funções mapeadas'} nesta seleção.
                    </p>
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                        {(dados.funcoes || []).map((f) => (
                            <div key={f.chave} className="p-3 bg-white space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-gray-900">{f.rotulo}</span>
                                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                        f.nivel === 'SIM'
                                            ? 'bg-green-100 text-green-800'
                                            : f.nivel === 'PEDE'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {ROTULO_NIVEL[f.nivel] || f.nivel}
                                    </span>
                                </div>
                                <p className="font-mono text-xs text-gray-500 break-all">{f.chave}</p>
                                {f.semprePede && (
                                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                        Guarda de segurança: {f.semprePede}
                                    </p>
                                )}
                                {f.efeitoExterno && (
                                    <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                                        Aviso externo: {f.efeitoExterno}
                                    </p>
                                )}
                                {f.excecaoLeitura && (
                                    <p className="text-xs text-gray-600">Fora da leitura padrão ({f.excecaoLeitura}).</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </ModalBase>
    );
}

export default function MatrizApiModal({ agente, onFechar, onSalvo }) {
    const [dados, setDados] = useState(null);
    const [rascunho, setRascunho] = useState({}); // `<modulo>.<acao>` -> 'NAO'|'PEDE'|'SIM'
    const [ativaRascunho, setAtivaRascunho] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [sincronizando, setSincronizando] = useState(false);
    const [verFixos, setVerFixos] = useState(false);
    const [filtroFuncoes, setFiltroFuncoes] = useState(null);
    const [confirmarSensivel, setConfirmarSensivel] = useState(null);

    const carregar = useCallback(async () => {
        setErro('');
        try {
            const r = await agenteService.lerMatriz(agente.id);
            setDados(r);
            const inicial = {};
            for (const m of r.modulos || []) {
                for (const [acao, c] of Object.entries(m.celulas || {})) {
                    if (c?.aplicavel) inicial[`${m.chave}.${acao}`] = c.nivel || 'NAO';
                }
            }
            setRascunho(inicial);
            setAtivaRascunho(r.ativa === true);
        } catch (e) {
            setErro(mensagemErro(e, 'Não foi possível carregar a matriz deste agente.'));
        }
    }, [agente.id]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && !salvando && !filtroFuncoes && !confirmarSensivel) onFechar?.();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onFechar, salvando, filtroFuncoes, confirmarSensivel]);

    const mudancas = useMemo(() => {
        if (!dados) return [];
        const lista = [];
        for (const m of dados.modulos || []) {
            for (const [acao, c] of Object.entries(m.celulas || {})) {
                if (!c?.aplicavel) continue;
                const k = `${m.chave}.${acao}`;
                const novo = rascunho[k];
                if (novo && novo !== c.nivel) {
                    lista.push({
                        modulo: m.chave,
                        rotuloModulo: m.rotulo,
                        acao,
                        rotuloAcao: acao === 'baixar' && m.rotuloBaixar ? m.rotuloBaixar : (dados.acoes?.find((a) => a.chave === acao)?.rotulo || acao),
                        antes: c.nivel,
                        nivel: novo,
                    });
                }
            }
        }
        return lista;
    }, [dados, rascunho]);

    const mudouMarcador = dados ? ativaRascunho !== (dados.ativa === true) : false;
    const temMudanca = mudancas.length > 0 || mudouMarcador;

    const definirCelula = (modulo, acao, nivel) => {
        setRascunho((prev) => ({ ...prev, [`${modulo}.${acao}`]: nivel }));
    };

    const aplicarPadrao = () => {
        if (!dados) return;
        const novo = { ...rascunho };
        for (const m of dados.modulos || []) {
            for (const [acao, c] of Object.entries(m.celulas || {})) {
                if (c?.aplicavel && c.padrao) novo[`${m.chave}.${acao}`] = c.padrao;
            }
        }
        setRascunho(novo);
        setAtivaRascunho(true);
        toast('Regra padrão aplicada no rascunho. Clique em Salvar para confirmar.', { icon: 'ℹ️' });
    };

    const definirColuna = (acao, nivel) => {
        if (!dados) return;
        setRascunho((prev) => {
            const novo = { ...prev };
            for (const m of dados.modulos || []) {
                const c = m.celulas?.[acao];
                if (c?.aplicavel && (c.niveisAceitos || []).includes(nivel)) {
                    novo[`${m.chave}.${acao}`] = nivel;
                }
            }
            return novo;
        });
    };

    const definirLinha = (moduloObj, modo) => {
        setRascunho((prev) => {
            const novo = { ...prev };
            for (const [acao, c] of Object.entries(moduloObj.celulas || {})) {
                if (!c?.aplicavel) continue;
                if (modo === 'FECHAR') novo[`${moduloObj.chave}.${acao}`] = 'NAO';
                else if (modo === 'PADRAO') novo[`${moduloObj.chave}.${acao}`] = c.padrao || (acao === 'ver' ? 'SIM' : 'PEDE');
                else if (modo === 'TUDO_PEDE') novo[`${moduloObj.chave}.${acao}`] = acao === 'ver' ? 'SIM' : 'PEDE';
            }
            return novo;
        });
    };

    const executarSalvar = async () => {
        if (!dados || salvando) return;
        setSalvando(true);
        try {
            const corpo = {
                celulas: mudancas.map((m) => ({ modulo: m.modulo, acao: m.acao, nivel: m.nivel })),
                ...(mudouMarcador ? { ativar: ativaRascunho } : {}),
            };
            await agenteService.gravarMatriz(agente.id, corpo);
            toast.success('Permissões da API salvas.');
            setConfirmarSensivel(null);
            await carregar();
            onSalvo?.();
        } catch (e) {
            toast.error(mensagemErro(e, 'Não foi possível salvar a matriz.'));
        } finally {
            setSalvando(false);
        }
    };

    const aoClicarSalvar = () => {
        if (!temMudanca || salvando) return;
        const sensiveis = mudancas.filter((m) => m.nivel === 'SIM' && ACOES_SENSIVEIS_SIM.has(m.acao));
        if (sensiveis.length > 0) {
            setConfirmarSensivel(sensiveis);
            return;
        }
        executarSalvar();
    };

    const sincronizarBase = async () => {
        if (sincronizando) return;
        setSincronizando(true);
        try {
            const r = await agenteService.sincronizarPermissoesBase(agente.id);
            const n = r?.adicionadas?.length || 0;
            toast.success(n > 0 ? `${n} permissão(ões) de base adicionada(s) ao agente.` : 'Permissões de base já estavam completas.');
            await carregar();
            onSalvo?.();
        } catch (e) {
            toast.error(mensagemErro(e, 'Não foi possível sincronizar as permissões de base.'));
        } finally {
            setSincronizando(false);
        }
    };

    const faltamBase = dados?.prontidao?.faltam || [];

    return (
        <div
            className="fixed inset-0 z-[9050] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
            onMouseDown={(e) => { if (!salvando && e.target === e.currentTarget) onFechar?.(); }}
            role="dialog"
            aria-modal="true"
            data-testid="matriz-api-modal"
        >
            <div className="bg-white w-full h-[95dvh] md:h-[92vh] md:max-w-[1320px] rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col overflow-hidden max-w-full">
                {/* Cabeçalho fixo */}
                <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-b border-gray-200 bg-white shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-mint p-2 rounded-xl shrink-0">
                            <ShieldCheck className="h-5 w-5 text-primaryDark" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base md:text-lg font-bold text-gray-900 truncate">
                                    Permissões da API — {agente.nome}
                                </h2>
                                {dados && (
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                        ativaRascunho ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                        {ativaRascunho ? 'Matriz ativa' : 'Matriz desligada'}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                                Nível por módulo e ação: NÃO bloqueia · PEDE guarda solicitação · SIM executa direto com guardas
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onFechar}
                        disabled={salvando}
                        aria-label="Fechar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 shrink-0"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Corpo rolável */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-4 space-y-4 bg-secondary/40">
                    {erro && (
                        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 flex flex-wrap items-center justify-between gap-3" role="alert">
                            <span>{erro}</span>
                            <BtnSecundario onClick={carregar}>Tentar de novo</BtnSecundario>
                        </div>
                    )}

                    {!dados && !erro && (
                        <div className="py-16 text-center text-sm text-gray-500">
                            <Loader2 className="h-6 w-6 animate-spin inline mr-2" />Carregando matriz de permissões…
                        </div>
                    )}

                    {dados && (
                        <>
                            {/* Barra de estado + atalhos */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={ativaRascunho}
                                            onClick={() => setAtivaRascunho((v) => !v)}
                                            className={`mt-0.5 relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                                                ativaRascunho ? 'bg-primary' : 'bg-gray-300'
                                            }`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                                ativaRascunho ? 'translate-x-5' : 'translate-x-0'
                                            }`} />
                                        </button>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900">
                                                {ativaRascunho ? 'Matriz ligada para esta conexão' : 'Matriz desligada (usa política anterior: só leitura, escrita pede autorização)'}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-0.5">
                                                Mesmo em <b>SIM</b>, o servidor exige <span className="font-mono">Idempotency-Key</span> e rebaixa automaticamente para <b>PEDE</b> despesas já pagas, lotes grandes, ajustes fora da curva e suspeita de duplicata.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={aplicarPadrao}
                                            className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-semibold inline-flex items-center gap-1.5"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" /> Aplicar regra padrão
                                        </button>
                                        <button
                                            type="button"
                                            onClick={sincronizarBase}
                                            disabled={sincronizando}
                                            className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
                                            {sincronizando ? 'Sincronizando…' : 'Sincronizar permissões de base'}
                                        </button>
                                    </div>
                                </div>

                                {faltamBase.length > 0 ? (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900" data-testid="aviso-prontidao">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                                            <span>
                                                <b>Permissões de base faltando neste usuário:</b> {faltamBase.map((f) => f.rotulo).join(', ')}. Sem elas, a rota recusa mesmo que a matriz permita. Clique em <b>Sincronizar permissões de base</b> para copiar do seu usuário (sem dar admin).
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />
                                        <span>Permissões de base prontas para todos os módulos liberados.</span>
                                    </div>
                                )}
                            </div>

                            {/* Desktop: tabela módulo × ação */}
                            <div className="hidden lg:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide w-[22%]">
                                                Módulo
                                            </th>
                                            {(dados.acoes || []).map((a) => (
                                                <th key={a.chave} className="px-2.5 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                                    <div>{a.rotulo}</div>
                                                    <div className="mt-1 flex items-center justify-center gap-1 font-normal normal-case">
                                                        {(a.chave === 'ver' ? ['NAO', 'SIM'] : ['NAO', 'PEDE', 'SIM']).map((nv) => (
                                                            <button
                                                                key={nv}
                                                                type="button"
                                                                onClick={() => definirColuna(a.chave, nv)}
                                                                title={`Marcar toda a coluna "${a.rotulo}" como ${ROTULO_NIVEL[nv]}`}
                                                                className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:text-primary hover:bg-mint/40 rounded-full border border-gray-200"
                                                            >
                                                                {ROTULO_NIVEL[nv]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white text-sm">
                                        {(dados.modulos || []).map((m) => (
                                            <tr key={m.chave} className="hover:bg-gray-50/70">
                                                <td className="px-4 py-3 align-middle">
                                                    <div className="font-bold text-gray-900">{m.rotulo}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setFiltroFuncoes({ modulo: m.chave, rotuloModulo: m.rotulo, acao: null, rotuloAcao: null })}
                                                            className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                                        >
                                                            <Eye className="h-3 w-3" /> Ver todas
                                                        </button>
                                                        <span className="text-gray-300">·</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => definirLinha(m, 'TUDO_PEDE')}
                                                            className="text-[11px] text-gray-500 hover:text-gray-800"
                                                            title="Ver = SIM e demais = PEDE"
                                                        >
                                                            Tudo PEDE
                                                        </button>
                                                        <span className="text-gray-300">·</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => definirLinha(m, 'FECHAR')}
                                                            className="text-[11px] text-gray-500 hover:text-red-700"
                                                            title="Marcar todas as ações deste módulo como NÃO"
                                                        >
                                                            Fechar
                                                        </button>
                                                    </div>
                                                </td>
                                                {(dados.acoes || []).map((a) => {
                                                    const c = m.celulas?.[a.chave];
                                                    if (!c?.aplicavel) {
                                                        return (
                                                            <td key={a.chave} className="px-2 py-3 text-center text-gray-400 select-none">
                                                                —
                                                            </td>
                                                        );
                                                    }
                                                    const k = `${m.chave}.${a.chave}`;
                                                    const valor = rascunho[k] || c.nivel || 'NAO';
                                                    const alterado = valor !== c.nivel;
                                                    const faltaPerm = valor !== 'NAO' && c.prontidao && !c.prontidao.ok;
                                                    const rotuloSub = a.chave === 'baixar' && m.rotuloBaixar ? m.rotuloBaixar : null;
                                                    return (
                                                        <td key={a.chave} className={`px-2 py-2.5 text-center align-middle ${alterado ? 'bg-mint/20' : ''}`}>
                                                            <div className="flex flex-col items-center gap-1">
                                                                <SeletorNivel
                                                                    compacto
                                                                    niveisAceitos={c.niveisAceitos}
                                                                    valor={valor}
                                                                    onChange={(nv) => definirCelula(m.chave, a.chave, nv)}
                                                                    disabled={salvando}
                                                                    testId={`celula-${m.chave}-${a.chave}`}
                                                                />
                                                                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFiltroFuncoes({
                                                                            modulo: m.chave,
                                                                            rotuloModulo: m.rotulo,
                                                                            acao: a.chave,
                                                                            rotuloAcao: rotuloSub || a.rotulo,
                                                                        })}
                                                                        className="hover:text-primary hover:underline"
                                                                    >
                                                                        {c.funcoes} {c.funcoes === 1 ? 'função' : 'funções'}
                                                                    </button>
                                                                    {faltaPerm && (
                                                                        <AlertTriangle
                                                                            className="h-3 w-3 text-amber-600 shrink-0"
                                                                            title={`Falta permissão de base: ${(c.prontidao.faltam || []).map((f) => f.rotulo).join(', ')}`}
                                                                        />
                                                                    )}
                                                                </div>
                                                                {rotuloSub && (
                                                                    <span className="text-[10px] text-gray-500 leading-tight">{rotuloSub}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile / tablet estreito: 1 card por módulo */}
                            <div className="lg:hidden space-y-3">
                                {(dados.modulos || []).map((m) => (
                                    <div key={m.chave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 space-y-2.5">
                                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                                            <h3 className="text-sm font-bold text-gray-900 min-w-0 truncate">{m.rotulo}</h3>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => definirLinha(m, 'PADRAO')}
                                                    className="min-h-[44px] px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-full"
                                                >
                                                    Padrão
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => definirLinha(m, 'FECHAR')}
                                                    className="min-h-[44px] px-3 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-full"
                                                >
                                                    Fechar
                                                </button>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {(dados.acoes || []).map((a) => {
                                                const c = m.celulas?.[a.chave];
                                                if (!c?.aplicavel) return null;
                                                const k = `${m.chave}.${a.chave}`;
                                                const valor = rascunho[k] || c.nivel || 'NAO';
                                                const rotuloAcao = a.chave === 'baixar' && m.rotuloBaixar ? m.rotuloBaixar : a.rotulo;
                                                return (
                                                    <div key={a.chave} className="py-2 flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-gray-800">{rotuloAcao}</div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFiltroFuncoes({
                                                                    modulo: m.chave,
                                                                    rotuloModulo: m.rotulo,
                                                                    acao: a.chave,
                                                                    rotuloAcao,
                                                                })}
                                                                className="text-xs text-primary font-medium hover:underline min-h-[44px] inline-flex items-center"
                                                            >
                                                                Ver {c.funcoes} {c.funcoes === 1 ? 'função' : 'funções'}
                                                            </button>
                                                        </div>
                                                        <SeletorNivel
                                                            niveisAceitos={c.niveisAceitos}
                                                            valor={valor}
                                                            onChange={(nv) => definirCelula(m.chave, a.chave, nv)}
                                                            disabled={salvando}
                                                            testId={`celula-mobile-${m.chave}-${a.chave}`}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Exceções individuais por função (se existirem) */}
                            {(dados.excecoesFuncao || []).length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                        Exceções por função específica ({dados.excecoesFuncao.length})
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        Estas regras pontuais valem acima da tabela de módulos:
                                    </p>
                                    <div className="space-y-1.5">
                                        {dados.excecoesFuncao.map((ex) => (
                                            <div key={ex.chave} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                                <span className="font-mono text-gray-800 break-all">{ex.chave}</span>
                                                <span className="font-bold text-gray-700">{ex.nivel}{ex.motivo ? ` · ${ex.motivo}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bloco fixo: Sempre bloqueado (somente leitura) */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setVerFixos((v) => !v)}
                                    className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left min-h-[44px]"
                                >
                                    <div className="flex items-center gap-2">
                                        <Lock className="h-4 w-4 text-gray-600 shrink-0" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                            Sempre bloqueado para conexões de API (somente leitura)
                                        </span>
                                    </div>
                                    {verFixos ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                                </button>
                                {verFixos && (
                                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {(dados.sempreBloqueado || []).map((g) => (
                                            <div key={g.grupo} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
                                                <p className="text-xs font-bold text-gray-900">
                                                    {ROTULO_GRUPO_FIXO[g.grupo] || g.grupo}
                                                </p>
                                                <p className="text-xs text-gray-600">{g.motivo}</p>
                                                {Array.isArray(g.prefixos) && g.prefixos.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 pt-1">
                                                        {g.prefixos.map((p) => (
                                                            <span key={p} className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                                                                {p}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {Array.isArray(g.funcoes) && g.funcoes.length > 0 && (
                                                    <ul className="text-xs text-gray-700 space-y-1 pt-1 max-h-36 overflow-y-auto">
                                                        {g.funcoes.map((f) => (
                                                            <li key={f.chave} className="font-mono text-[11px] break-all">
                                                                {f.chave}{f.motivo ? <span className="font-sans text-gray-500"> — {f.motivo}</span> : null}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Rodapé fixo */}
                <div className="px-4 md:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <span className="text-xs text-gray-600 min-w-0">
                        {temMudanca ? (
                            <b className="text-amber-700">
                                ● {mudancas.length} {mudancas.length === 1 ? 'célula alterada' : 'células alteradas'}
                                {mudouMarcador ? ` · matriz será ${ativaRascunho ? 'ligada' : 'desligada'}` : ''}
                            </b>
                        ) : (
                            'Nenhuma alteração pendente'
                        )}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                        <BtnSecundario onClick={onFechar} disabled={salvando}>Cancelar</BtnSecundario>
                        <BtnPrimario onClick={aoClicarSalvar} disabled={!temMudanca || salvando} className="inline-flex items-center gap-1.5">
                            <Save className="h-4 w-4" />
                            {salvando ? 'Salvando…' : 'Salvar permissões da API'}
                        </BtnPrimario>
                    </div>
                </div>
            </div>

            {filtroFuncoes && (
                <ModalFuncoesCelula
                    agenteId={agente.id}
                    filtro={filtroFuncoes}
                    onFechar={() => setFiltroFuncoes(null)}
                />
            )}

            {confirmarSensivel && (
                <ConfirmModal
                    titulo="Liberar ação irreversível/sensível sem pedir autorização?"
                    rotuloConfirmar="Sim, liberar execução direta"
                    perigo
                    ocupado={salvando}
                    onConfirmar={executarSalvar}
                    onCancelar={() => setConfirmarSensivel(null)}
                    aviso="Em SIM, o agente executa estas ações na hora, sem passar pela sua fila de Solicitações:"
                >
                    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                        {confirmarSensivel.map((m) => (
                            <li key={`${m.modulo}.${m.acao}`}>
                                <b>{m.rotuloModulo}</b> → <b>{m.rotuloAcao}</b> (de {ROTULO_NIVEL[m.antes] || m.antes} para SIM)
                            </li>
                        ))}
                    </ul>
                </ConfirmModal>
            )}
        </div>
    );
}
