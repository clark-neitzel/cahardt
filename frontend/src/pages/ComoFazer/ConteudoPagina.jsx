import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, QrCode, Pencil, Volume2, Loader2, PlayCircle } from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, codigoErro, TIPOS, SETORES } from '../../services/comoFazerService';
import TelaEquipe from '../../components/ComoFazer/TelaEquipe';
import { useBaseComoFazer } from '../../components/ComoFazer/BaseComoFazer';
import PassoCard from '../../components/ComoFazer/PassoCard';
import MaquinaTiles from '../../components/ComoFazer/MaquinaTiles';
import FimTreinamento from '../../components/ComoFazer/FimTreinamento';
import { falar, suportaFala, pararFala } from '../../components/ComoFazer/falar';
import { BADGE_VERSAO, CLS_BADGE, fmtData, fmtDataHora } from '../../components/ComoFazer/visual';
import imprimirNaPagina from '../../utils/imprimirNaPagina';
import { useComoFazerMe } from './hooks/useComoFazerMe';
import { montarCorpoDocumento, ESTILOS_FOLHA, esc } from './htmlDocumento';

const BLOCOS = {
    MONTAR: { emoji: '🔧', titulo: 'Montar' },
    USAR: { emoji: '▶️', titulo: 'Usar' },
    LIMPAR: { emoji: '🧼', titulo: 'Limpar' },
    PROBLEMA: { emoji: '🚨', titulo: 'Deu problema' },
    PRINCIPAL: { emoji: '', titulo: 'Passos' },
};
const ORDEM_BLOCO = ['PRINCIPAL', 'MONTAR', 'USAR', 'LIMPAR', 'PROBLEMA'];

function Cabecalho({ rotulo, children }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 min-w-0">
            <b className="block text-[10px] font-bold uppercase tracking-widest text-gray-600">{rotulo}</b>
            <span className="text-sm font-semibold text-gray-900 break-words">{children}</span>
        </div>
    );
}

function SecaoTitulo({ children }) {
    return <div className="flex items-center gap-2 pt-4 pb-2 text-xs font-bold uppercase tracking-widest text-gray-600">{children}<span className="flex-1 h-px bg-gray-200" /></div>;
}

function ModalQr({ url, titulo, onFechar }) {
    const [img, setImg] = useState('');
    useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 360 }).then(setImg).catch(() => setImg('')); }, [url]);
    const imprimir = () => imprimirNaPagina(
        '@page { size: A4 portrait; margin: 12mm; } .qr{font-family:Arial;text-align:center;padding-top:40mm} .qr h1{font-size:26px} .qr img{width:11cm}',
        `<div class="qr"><h1>${esc(titulo)}</h1><img src="${img}" alt=""></div>`);
    return (
        <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-4" onClick={onFechar}>
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold text-gray-900 mb-3 break-words">{titulo}</h3>
                {img ? <img src={img} alt="QR code" className="mx-auto w-64 h-64" /> : <Loader2 className="h-8 w-8 animate-spin mx-auto" />}
                <p className="text-xs text-gray-600 mt-2 break-all">{url}</p>
                <p className="text-xs text-gray-600 mt-1">O QR só abre dentro do app (precisa estar logado ou usar o tablet do setor).</p>
                <div className="flex gap-2 mt-4">
                    <button type="button" onClick={imprimir} disabled={!img} className="flex-1 min-h-[48px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold disabled:opacity-50">Imprimir</button>
                    <button type="button" onClick={onFechar} className="flex-1 min-h-[48px] rounded-full bg-white border border-primary text-primary font-bold">Fechar</button>
                </div>
            </div>
        </div>
    );
}

function AbaVersoes({ id }) {
    const [dados, setDados] = useState(null);
    useEffect(() => { comoFazerService.detalharAdmin(id).then((d) => setDados(d)).catch((e) => setDados({ erro: mensagemErro(e) })); }, [id]);
    if (!dados) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-6" />;
    if (dados.erro) return <p className="text-sm text-red-700">{dados.erro}</p>;
    const lista = Array.isArray(dados.versoes) ? dados.versoes : [];
    if (!lista.length) return <p className="text-sm text-gray-600">Ainda não há versões.</p>;
    return (
        <div className="space-y-2">
            {lista.map((v) => (
                <div key={v.numero} className="rounded-xl border border-gray-200 bg-white p-3 flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900">Versão {v.numero}</span>
                    <span className="text-sm text-gray-600">{v.publicadaEm ? `publicada em ${fmtData(v.publicadaEm)}` : 'rascunho'}</span>
                    <span className={`${CLS_BADGE} ${(BADGE_VERSAO[v.status] || BADGE_VERSAO.RASCUNHO).cls}`}>{(BADGE_VERSAO[v.status] || BADGE_VERSAO.RASCUNHO).rotulo}</span>
                </div>
            ))}
        </div>
    );
}

function AbaRelatorio({ id, parte }) {
    const [dados, setDados] = useState(null);
    useEffect(() => { comoFazerService.painelRelatorio({ conteudoId: id }).then(setDados).catch((e) => setDados({ erro: mensagemErro(e) })); }, [id]);
    if (!dados) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-6" />;
    if (dados.erro) return <p className="text-sm text-red-700">{dados.erro}</p>;
    if (parte === 'treinou') {
        const lista = Array.isArray(dados.treinados) ? dados.treinados : [];
        if (!lista.length) return <p className="text-sm text-gray-600">Ninguém treinou ainda.</p>;
        return (
            <div className="space-y-2">
                {lista.map((t, i) => (
                    <div key={`${t.nome}-${i}`} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                        <b className="text-gray-900">{t.nome || ''}</b>
                        <span className="text-gray-600"> · {fmtDataHora(t.aprendeuEm)}{t.versaoNumero != null ? ` · versão ${t.versaoNumero}` : ''}</span>
                        <div className="text-gray-600">{t.confirmadoPor ? `Confirmado por ${typeof t.confirmadoPor === 'string' ? t.confirmadoPor : (t.confirmadoPor?.nome || '')}` : 'Sem confirmação do encarregado'}</div>
                    </div>
                ))}
            </div>
        );
    }
    const lista = Array.isArray(dados.execucoes) ? dados.execucoes : [];
    if (!lista.length) return <p className="text-sm text-gray-600">Nenhuma execução registrada.</p>;
    return (
        <div className="space-y-2">
            {lista.map((x, i) => (
                <div key={x.id || x.execucaoId || i} className="rounded-xl border border-gray-200 bg-white p-3 text-sm flex flex-wrap items-center gap-2">
                    <b className="text-gray-900">{fmtDataHora(x.quando || x.concluidaEm)}</b>
                    <span className="text-gray-600">{typeof x.funcionario === 'string' ? x.funcionario : (x.funcionario?.nome || x.por || '')}</span>
                    {(x.temDesvio || x.situacao === 'DESVIO') && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Desvio</span>}
                </div>
            ))}
        </div>
    );
}

export default function ConteudoPagina() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { base } = useBaseComoFazer();
    const { me, pode } = useComoFazerMe();
    const [conteudo, setConteudo] = useState(null);
    const [erro, setErro] = useState('');
    const [aba, setAba] = useState('passos');
    const [qr, setQr] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const c = await comoFazerService.conteudo(id);
            setConteudo(c); setErro('');
        } catch (e) {
            const cod = codigoErro(e);
            if (cod === 'SEM_PERMISSAO') { toast.error('Você não tem permissão para isso.'); navigate(base); return; }
            setErro(cod === 'NAO_ENCONTRADO' ? 'Este conteúdo não está disponível.' : mensagemErro(e));
        }
    }, [id, navigate, base]);

    useEffect(() => { carregar(); }, [carregar]);
    // para a voz ao trocar de conteúdo ou sair da tela
    useEffect(() => () => pararFala(), [id]);

    const irPara = (bloco) => {
        const alvo = bloco === 'TREINAMENTO' ? 'treinamento' : `sec-${bloco}`;
        document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (erro) {
        return <TelaEquipe titulo="Como Fazer"><p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p></TelaEquipe>;
    }
    if (!conteudo) {
        return <TelaEquipe titulo="Como Fazer"><Loader2 className="h-8 w-8 animate-spin mx-auto my-10 text-primary" /></TelaEquipe>;
    }

    const doc = conteudo.versao?.doc || {};
    const secoes = (Array.isArray(doc.secoes) ? doc.secoes : []).filter((s) => s && Array.isArray(s.passos));
    const totalPassos = secoes.reduce((t, s) => t + s.passos.length, 0);
    const tipo = TIPOS[conteudo.tipo] || { rotulo: '', icone: '📘' };
    const maquina = conteudo.tipo === 'MAQUINA';
    const nomesSetores = (Array.isArray(conteudo.setores) ? conteudo.setores : [])
        .map((s) => SETORES.find((x) => x.slug === s)?.nome || s).join(' · ');
    const cargos = Array.isArray(conteudo.cargos) && conteudo.cargos.length ? conteudo.cargos.join(', ') : 'Todos os cargos';
    const encarregados = Array.isArray(conteudo.encarregados) ? conteudo.encarregados.map((e) => e?.nome).filter(Boolean).join(', ') : '';
    const subt = [
        conteudo.codigo,
        conteudo.versao?.numero != null ? `versão ${conteudo.versao.numero}` : '',
        conteudo.versao?.publicadaEm ? `aprovada${conteudo.versao.publicadaPor?.nome ? ` por ${conteudo.versao.publicadaPor.nome}` : ''} em ${fmtData(conteudo.versao.publicadaEm)}` : '',
        conteudo.reciclagemMeses ? `treinar de novo a cada ${conteudo.reciclagemMeses} meses` : '',
    ].filter(Boolean).join(' · ');
    const rotina = conteudo.tipo === 'ROTINA';
    const horarios = Array.isArray(conteudo.rotina?.horarios) ? conteudo.rotina.horarios.join(' e ') : '';
    const abas = [
        { id: 'passos', rotulo: 'Passo a passo' },
        ...(pode.editar ? [{ id: 'versoes', rotulo: 'Versões' }] : []),
        ...(pode.painel ? [{ id: 'treinou', rotulo: 'Quem treinou' }] : []),
        ...(pode.painel && rotina ? [{ id: 'execucoes', rotulo: 'Execuções' }] : []),
    ];

    const imprimir = () => imprimirNaPagina(ESTILOS_FOLHA, montarCorpoDocumento(conteudo));
    const botoesGestao = (
        <div className="flex flex-wrap gap-2 mb-3">
            {(pode.painel || pode.editar) && (
                <button type="button" onClick={imprimir} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-800 font-bold text-sm"><Printer className="h-4 w-4" /> Imprimir A4</button>
            )}
            {(pode.painel || pode.editar) && (
                <button type="button" onClick={() => setQr(true)} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-800 font-bold text-sm"><QrCode className="h-4 w-4" /> QR code</button>
            )}
            {pode.editar && (
                <button type="button" onClick={() => navigate(`/rh/como-fazer?aba=conteudos&editar=${conteudo.id}`)} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary font-bold text-sm"><Pencil className="h-4 w-4" /> Nova versão</button>
            )}
        </div>
    );

    return (
        <TelaEquipe titulo={conteudo.titulo} subtitulo={subt} emoji={conteudo.icone || tipo.icone}>
            {botoesGestao}

            {abas.length > 1 && (
                <div className="flex gap-1 border-b border-gray-200 mb-3 overflow-x-auto">
                    {abas.map((a) => (
                        <button key={a.id} type="button" onClick={() => setAba(a.id)}
                            className={`px-3 min-h-[44px] text-sm font-bold whitespace-nowrap border-b-2 ${aba === a.id ? 'text-primaryDark border-primary' : 'text-gray-600 border-transparent'}`}>{a.rotulo}</button>
                    ))}
                </div>
            )}

            {aba === 'versoes' && <AbaVersoes id={conteudo.id} />}
            {aba === 'treinou' && <AbaRelatorio id={conteudo.id} parte="treinou" />}
            {aba === 'execucoes' && <AbaRelatorio id={conteudo.id} parte="execucoes" />}

            {aba === 'passos' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Cabecalho rotulo="Tipo">{tipo.icone} {tipo.rotulo}</Cabecalho>
                        <Cabecalho rotulo="Setor">{nomesSetores || '—'}</Cabecalho>
                        <Cabecalho rotulo="Quem treina">{cargos}</Cabecalho>
                        <Cabecalho rotulo={rotina && horarios ? 'Horários' : 'Encarregado'}>{rotina && horarios ? horarios : (encarregados || '—')}</Cabecalho>
                    </div>

                    {rotina && (
                        <button type="button" onClick={() => navigate(`${base}/fazer/${conteudo.id}`)}
                            className="w-full min-h-[56px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold text-lg inline-flex items-center justify-center gap-2">
                            <PlayCircle className="h-6 w-6" /> Fazer agora
                        </button>
                    )}

                    {maquina && <MaquinaTiles conteudo={conteudo} doc={doc} onIr={irPara} />}

                    {!maquina && doc.avisoPerigo ? (
                        <div className="rounded-xl border-l-4 border-red-600 bg-red-50 p-3 flex items-start gap-2">
                            <p className="flex-1 text-sm md:text-base text-gray-900"><b className="text-red-700">⚠️ Perigo:</b> {doc.avisoPerigo}</p>
                            {suportaFala() && (
                                <button type="button" onClick={() => falar(`Atenção. Perigo. ${doc.avisoPerigo}`)} aria-label="Ouvir o aviso"
                                    className="min-h-[56px] min-w-[56px] shrink-0 rounded-full border-2 border-red-600 text-red-700 bg-white flex items-center justify-center"><Volume2 className="h-5 w-5" /></button>
                            )}
                        </div>
                    ) : null}

                    {doc.objetivo ? (<><SecaoTitulo>Para que serve</SecaoTitulo><p className="text-base text-gray-900 leading-relaxed whitespace-pre-line">{doc.objetivo}</p></>) : null}
                    {doc.materiais ? (<><SecaoTitulo>O que precisa</SecaoTitulo><p className="text-base text-gray-900 leading-relaxed whitespace-pre-line">{doc.materiais}</p></>) : null}

                    {totalPassos === 0 ? (
                        <p className="rounded-xl bg-white border border-gray-200 p-4 text-gray-700">Este conteúdo ainda não tem passos.</p>
                    ) : [...secoes].sort((a, b) => ORDEM_BLOCO.indexOf(a.bloco) - ORDEM_BLOCO.indexOf(b.bloco)).map((s, idxSec) => {
                        const b = BLOCOS[s.bloco] || BLOCOS.PRINCIPAL;
                        const titulo = s.bloco === 'PROBLEMA' ? `${s.icone || b.emoji} ${s.titulo || b.titulo}` : (maquina ? `${b.emoji} ${b.titulo}` : 'Passos');
                        const primeiraDoBloco = s.bloco !== 'PROBLEMA' || !secoes.slice(0, idxSec).some((o) => o.bloco === 'PROBLEMA');
                        return (
                            <div key={s.id || idxSec} id={primeiraDoBloco ? `sec-${s.bloco}` : undefined} className="scroll-mt-4">
                                <SecaoTitulo>{titulo}</SecaoTitulo>
                                {s.passos.length === 0 ? <p className="text-sm text-gray-600">Sem passos nesta parte.</p> : (
                                    <div className="space-y-2">
                                        {s.passos.map((p, i) => <PassoCard key={p.id || i} passo={p} numero={i + 1} />)}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {doc.naoFazer ? (
                        <div className="rounded-xl border-l-4 border-red-600 bg-red-50 p-3 flex items-start gap-2">
                            <p className="flex-1 text-sm md:text-base text-gray-900 whitespace-pre-line"><b className="text-red-700">O que NÃO fazer:</b> {doc.naoFazer}</p>
                            {suportaFala() && (
                                <button type="button" onClick={() => falar(`O que não fazer. ${doc.naoFazer}`)} aria-label="Ouvir"
                                    className="min-h-[56px] min-w-[56px] shrink-0 rounded-full border-2 border-red-600 text-red-700 bg-white flex items-center justify-center"><Volume2 className="h-5 w-5" /></button>
                            )}
                        </div>
                    ) : null}

                    {Array.isArray(doc.seDerErrado) && doc.seDerErrado.length > 0 && (
                        <>
                            <SecaoTitulo>Se der errado</SecaoTitulo>
                            <div className="md:hidden space-y-2">
                                {doc.seDerErrado.map((r, i) => (
                                    <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 text-sm"><b className="block text-gray-900">{r.se}</b><span className="text-gray-700">→ {r.entao}</span></div>
                                ))}
                            </div>
                            <div className="hidden md:block rounded-xl border border-gray-200 bg-white overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Se…</th><th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Então…</th></tr></thead>
                                    <tbody className="divide-y divide-gray-200 text-sm">
                                        {doc.seDerErrado.map((r, i) => <tr key={i}><td className="px-4 py-2 font-semibold text-gray-900">{r.se}</td><td className="px-4 py-2 text-gray-700">{r.entao}</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <div className="pt-4">
                        <FimTreinamento conteudo={conteudo} me={me} onAtualizado={carregar} />
                    </div>
                </div>
            )}

            {qr && <ModalQr url={`${window.location.origin}/como-fazer/c/${conteudo.id}`} titulo={conteudo.titulo} onFechar={() => setQr(false)} />}
        </TelaEquipe>
    );
}
