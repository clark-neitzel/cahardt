import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, HelpCircle, FileText, Loader2, ImageOff, Paperclip, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { anexosService } from '../../services/contasPagarService';
import comprimirFoto from '../../utils/comprimirFoto';
import VisualizadorFotos from '../../components/ChecklistVeiculo/VisualizadorFotos';

// Status do comprovante da despesa do motorista (cores semânticas fixas do sistema).
export const STATUS_COMPROVANTE = {
    CONFERIDA: { txt: 'Confere', cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
    ACEITA: { txt: 'Aceita pelo escritório', cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
    DIVERGENTE: { txt: 'Divergente', cls: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
    RECUSADA: { txt: 'Não é desta despesa', cls: 'bg-red-100 text-red-700', Icon: XCircle },
    IA_INDISPONIVEL: { txt: 'IA fora do ar', cls: 'bg-gray-100 text-gray-700', Icon: HelpCircle },
    SEM_COMPROVANTE: { txt: 'Sem comprovante', cls: 'bg-gray-100 text-gray-700', Icon: Paperclip },
};
// Status que o escritório ainda precisa olhar
export const STATUS_PENDENTES = ['DIVERGENTE', 'RECUSADA', 'IA_INDISPONIVEL', 'SEM_COMPROVANTE'];

export const statusDe = (comprovante) => {
    const s = comprovante?.status;
    return STATUS_COMPROVANTE[s] ? s : 'SEM_COMPROVANTE';
};

export const ChipStatus = ({ status, className = '' }) => {
    const cfg = STATUS_COMPROVANTE[status] || STATUS_COMPROVANTE.SEM_COMPROVANTE;
    const Icon = cfg.Icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${cfg.cls} ${className}`}>
            <Icon className="h-3 w-3 shrink-0" /> {cfg.txt}
        </span>
    );
};

// Selo clicável da lista de despesas (alvo de toque de 44 px no celular)
export const SeloComprovante = ({ comprovante, onClick }) => {
    if (comprovante === undefined) return null; // ainda carregando / sem dado: não afirma "sem comprovante"
    const status = statusDe(comprovante);
    const cfg = STATUS_COMPROVANTE[status];
    const Icon = cfg.Icon;
    return (
        <button
            type="button"
            onClick={onClick}
            title="Ver comprovante"
            className={`inline-flex items-center gap-1 px-2.5 min-h-[44px] md:min-h-0 md:py-1 text-xs font-semibold rounded-full ${cfg.cls} hover:opacity-80`}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" /> {cfg.txt}
        </button>
    );
};

// ── formatação segura (campo opcional nunca vira "undefined") ──
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
// diferença em centésimos, inteira (evita falso positivo de ponto flutuante)
const centavosDif = (x, y) => Math.abs(Math.round(Number(x) * 100) - Math.round(Number(y) * 100));
const brl = (v) => (num(v) === null || Number.isNaN(num(v)) ? null : `R$ ${num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dataBR = (d) => {
    if (!d) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};
const litrosTxt = (v) => (num(v) === null || Number.isNaN(num(v)) ? null : `${num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L`);
const TIPO_DOC = { NOTA_FISCAL: 'Nota fiscal', CUPOM_FISCAL: 'Cupom fiscal', RECIBO: 'Recibo', COMPROVANTE: 'Comprovante', OUTRO: 'Outro documento' };
const tipoDocTxt = (t) => (t ? (TIPO_DOC[t] || String(t).replace(/_/g, ' ').toLowerCase()) : null);

const Linha = ({ rotulo, valor, destaque }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
        <span className="text-xs text-gray-500 shrink-0">{rotulo}</span>
        <span className={`text-sm text-right break-words min-w-0 ${destaque ? 'font-bold text-amber-700' : 'font-medium text-gray-900'}`}>{valor || '—'}</span>
    </div>
);

/**
 * Lado a lado: "Você digitou" x "O documento diz".
 * digitado = { valor, data, litros, mostrarLitros, tipoDocumento? }  leitura = objeto da IA (ou null)
 */
export const ComparacaoLeitura = ({ digitado = {}, leitura = null, fornecedorSugerido = null }) => {
    const mostrarLitros = !!digitado.mostrarLitros;
    const difValor = num(digitado.valor) !== null && num(leitura?.valor) !== null && centavosDif(digitado.valor, leitura.valor) > 5;
    const difData = !!digitado.data && !!leitura?.data && String(leitura.data).slice(0, 10) !== String(digitado.data).slice(0, 10);
    const difLitros = num(digitado.litros) !== null && num(leitura?.litros) !== null && centavosDif(digitado.litros, leitura.litros) > 50;
    const forn = leitura?.fornecedorNome || null;
    const cnpjBruto = leitura?.fornecedorCnpj ? String(leitura.fornecedorCnpj) : null;
    const cnpj = cnpjBruto && /^\d{14}$/.test(cnpjBruto) ? cnpjBruto.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cnpjBruto;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">Você digitou</p>
                <Linha rotulo="Valor" valor={brl(digitado.valor)} />
                <Linha rotulo="Data" valor={dataBR(digitado.data)} />
                {mostrarLitros && <Linha rotulo="Litros" valor={litrosTxt(digitado.litros)} />}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">O documento diz</p>
                {leitura ? (
                    <>
                        <Linha rotulo="Documento" valor={tipoDocTxt(leitura.tipoDocumento)} />
                        <Linha rotulo="Valor" valor={brl(leitura.valor)} destaque={difValor} />
                        <Linha rotulo="Data" valor={dataBR(leitura.data)} destaque={difData} />
                        {mostrarLitros && <Linha rotulo="Litros" valor={litrosTxt(leitura.litros)} destaque={difLitros} />}
                        <Linha rotulo="Fornecedor" valor={forn} />
                        <Linha rotulo="CNPJ" valor={cnpj} />
                        {leitura.numero ? <Linha rotulo="Número" valor={String(leitura.numero)} /> : null}
                    </>
                ) : (
                    <p className="text-sm text-gray-500 py-2">Não deu para ler este documento.</p>
                )}
                {fornecedorSugerido?.nome ? (
                    <p className="text-xs text-primaryDark bg-mint rounded-lg px-2 py-1.5 mt-2">
                        Fornecedor no cadastro: <span className="font-semibold">{fornecedorSugerido.nome}</span>
                    </p>
                ) : null}
            </div>
        </div>
    );
};

export const ListaMotivos = ({ motivos }) => {
    const itens = (Array.isArray(motivos) ? motivos : []).map((m) => (typeof m === 'string' ? m : m?.mensagem)).filter(Boolean);
    if (!itens.length) return null;
    return (
        <ul className="space-y-1">
            {itens.map((t, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-amber-600">•</span><span>{t}</span></li>
            ))}
        </ul>
    );
};

/**
 * Painel do escritório: foto + leitura + digitado lado a lado + aceitar com motivo.
 * despesa = linha da lista (id, valor, dataReferencia, litros, categoria, descricao)
 */
export const PainelComprovanteDespesa = ({ despesa, dataReferencia, onClose, onChanged }) => {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');
    const [thumb, setThumb] = useState(null);       // blob url da imagem
    const [temPdf, setTemPdf] = useState(null);     // anexo não imagem
    const [ver, setVer] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const travaRef = useRef(false);
    const thumbRef = useRef(null);
    const reenvioRef = useRef(null);
    const [reenviando, setReenviando] = useState(false);

    const carregar = async () => {
        try {
            const r = await api.get(`/despesas/${despesa.id}/comprovante`);
            setDados(r.data);
            setErro('');
        } catch (e) {
            setErro(e.response?.data?.error || 'Não foi possível abrir o comprovante agora.');
        }
    };
    useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [despesa.id]);

    // foto (blob autenticado)
    useEffect(() => {
        let vivo = true;
        const anexos = dados?.anexos || [];
        const img = anexos.find((a) => String(a.mime || '').startsWith('image/'));
        setTemPdf(anexos.find((a) => !String(a.mime || '').startsWith('image/')) || null);
        if (!img) { setThumb(null); return undefined; }
        anexosService.arquivo(img.id)
            .then((b) => {
                if (!vivo) return;
                const u = URL.createObjectURL(b);
                if (thumbRef.current) URL.revokeObjectURL(thumbRef.current);
                thumbRef.current = u; setThumb(u);
            })
            .catch(() => { if (vivo) setThumb('ERRO'); });
        return () => { vivo = false; };
    }, [dados]);
    useEffect(() => () => { if (thumbRef.current) URL.revokeObjectURL(thumbRef.current); }, []);

    const baixarPdf = async () => {
        try {
            const b = await anexosService.arquivo(temPdf.id);
            const u = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = u; a.download = temPdf.nomeOriginal || 'comprovante';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 4000);
        } catch { toast.error('Não consegui baixar o arquivo.'); }
    };

    const reenviar = async (file) => {
        if (!file || travaRef.current) return;
        travaRef.current = true; setReenviando(true);
        try {
            let f = file;
            try { f = await comprimirFoto(file); } catch { f = file; }
            const form = new FormData();
            form.append('arquivo', f);
            await api.post(`/despesas/${despesa.id}/comprovante`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
            toast.success('Foto enviada.');
            await carregar();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'A foto não subiu. Tente de novo.');
        } finally { travaRef.current = false; setReenviando(false); }
    };

    const comp = dados?.comprovante || null;
    const podeAceitar = dados?.podeAceitar === true;
    const podeAnexar = dados?.podeAnexar === true;
    const arquivoPerdido = thumb === 'ERRO' || (dados?.anexos || []).some((x) => x.arquivoDisponivel === false);
    const status = statusDe(comp);
    const jaAceita = status === 'ACEITA';
    const precisaOlhar = STATUS_PENDENTES.includes(status);
    const motivoOk = motivo.trim().length >= 5;

    const aceitar = async () => {
        if (travaRef.current || !motivoOk) return;
        travaRef.current = true; setEnviando(true);
        try {
            await api.post(`/despesas/${despesa.id}/aceitar`, { motivo: motivo.trim() });
            toast.success('Comprovante aceito.');
            setMotivo('');
            await carregar();
            onChanged?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não consegui aceitar agora. Tente de novo.');
        } finally { travaRef.current = false; setEnviando(false); }
    };

    const catLitros = despesa.categoria === 'COMBUSTIVEL';
    const quem = comp?.aceita?.porNome || comp?.aceitaPorNome || null;
    const aceitaEm = comp?.aceita?.em || comp?.aceitaEm || null;
    const aceitaMotivo = comp?.aceita?.motivo || comp?.aceitaMotivo || null;
    const quando = aceitaEm ? new Date(aceitaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black bg-opacity-50 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
                <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h3 className="text-base font-bold text-gray-900">Comprovante da despesa</h3>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="p-3 -mr-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                    {!dados && !erro && (
                        <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin" /> Abrindo…
                        </div>
                    )}
                    {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

                    {dados && (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <ChipStatus status={status} />
                                {jaAceita && quem ? (
                                    <span className="text-xs text-gray-500">por {quem}{quando ? ` em ${quando}` : ''}</span>
                                ) : null}
                            </div>
                            <ListaMotivos motivos={comp?.motivos} />
                            {jaAceita && aceitaMotivo ? (
                                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">Motivo: {aceitaMotivo}</p>
                            ) : null}
                            {comp?.semComprovanteMotivo ? (
                                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">
                                    O motorista disse que não tem comprovante: <span className="font-semibold">{comp.semComprovanteMotivo}</span>
                                </p>
                            ) : null}

                            {(thumb || temPdf) && (
                                <div className="flex items-center gap-3">
                                    {thumb && thumb !== 'ERRO' ? (
                                        <div role="button" tabIndex={0} onClick={() => setVer(true)} onKeyDown={(e) => { if (e.key === 'Enter') setVer(true); }} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shrink-0 cursor-pointer">
                                            <img src={thumb} alt="Foto do comprovante" className="w-full h-full object-cover" />
                                        </div>
                                    ) : thumb === 'ERRO' ? (
                                        <div className="w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 shrink-0"><ImageOff className="h-6 w-6" /></div>
                                    ) : null}
                                    <div className="min-w-0 space-y-1">
                                        {thumb && thumb !== 'ERRO' && <p className="text-xs text-gray-500">Toque na foto para ampliar.</p>}
                                        {temPdf && (
                                            <button type="button" onClick={baixarPdf} className="inline-flex items-center gap-1.5 px-3 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-medium">
                                                <FileText className="h-4 w-4" /> <span className="truncate max-w-[180px]">{temPdf.nomeOriginal || 'Documento'}</span> <Download className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {arquivoPerdido && <p className="text-sm text-red-700">Arquivo não encontrado.</p>}
                            {!thumb && !temPdf && status !== 'SEM_COMPROVANTE' && (
                                <p className="text-sm text-gray-500">Nenhum arquivo guardado para esta despesa.</p>
                            )}

                            <input ref={reenvioRef} type="file" accept="image/*,application/pdf" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; reenviar(f); }} />
                            {podeAnexar && (
                                <button type="button" onClick={() => reenvioRef.current?.click()} disabled={reenviando}
                                    className="w-full md:w-auto px-5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50">
                                    {reenviando ? 'Enviando…' : (arquivoPerdido || (!thumb && !temPdf) ? 'Reenviar foto' : 'Trocar foto')}
                                </button>
                            )}

                            <ComparacaoLeitura
                                digitado={{ valor: despesa.valor, data: despesa.dataReferencia || dataReferencia, litros: despesa.litros, mostrarLitros: catLitros }}
                                leitura={comp?.leitura ? { ...comp.leitura, fornecedorNome: comp.leitura.fornecedorNome || comp.fornecedorNomeLido || null, fornecedorCnpj: comp.leitura.fornecedorCnpj || comp.fornecedorCnpjLido || null, tipoDocumento: comp.leitura.tipoDocumento || comp.tipoDocumento || null } : null}
                                fornecedorSugerido={comp?.fornecedorSugerido || null}
                            />

                            {podeAceitar && !jaAceita && precisaOlhar && (
                                <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Aceitar com motivo</p>
                                    <textarea
                                        value={motivo}
                                        onChange={(e) => setMotivo(e.target.value)}
                                        rows={2}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="Ex.: conferi com o motorista, o posto errou o cupom"
                                    />
                                    {motivo.length > 0 && !motivoOk && <p className="text-xs text-amber-700">Escreva pelo menos 5 letras.</p>}
                                    <button
                                        type="button"
                                        onClick={aceitar}
                                        disabled={!motivoOk || enviando}
                                        className="w-full md:w-auto px-5 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                                    >
                                        {enviando ? 'Aceitando…' : 'Aceitar este comprovante'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {ver && thumb && thumb !== 'ERRO' && (
                <VisualizadorFotos
                    slides={[{ chave: 'comprovante', rotulo: 'Comprovante', url: thumb, parecer: null, perguntas: [], complemento: null, editavel: false, statusIa: 'NAO_ANALISADA' }]}
                    modo="escritorio" semParecer titulo="Comprovante" onClose={() => setVer(false)}
                />
            )}
        </div>
    );
};

// ───────────────────────── Motorista: foto do recibo/nota ─────────────────────────
// Estado do passo "Foto do recibo ou da nota" do NovaDespesaModal.
// Regra do modo teste: NADA aqui trava o salvamento — falha de rede/IA só vira aviso.
export function useComprovanteDespesa({ categoria, valor, dataReferencia, litros, veiculoId }) {
    const [arquivo, setArquivo] = useState(null);       // File (já comprimido)
    const [previewUrl, setPreviewUrl] = useState(null); // só imagem
    const [analise, setAnalise] = useState(null);       // resposta de /comprovante/analisar
    const [analisando, setAnalisando] = useState(false);
    const [falhaRede, setFalhaRede] = useState(false);
    const [falhaMsg, setFalhaMsg] = useState('');       // erro 4xx com texto do servidor
    const [semComprovante, setSemComprovante] = useState(false);
    const [motivoSem, setMotivoSem] = useState('');
    const [snap, setSnap] = useState(null);             // valores usados na última análise
    const promRef = useRef(null);
    const previewRef = useRef(null);

    useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

    const campos = { categoria, valor: String(valor || ''), dataReferencia, litros: String(litros || ''), veiculoId: veiculoId || '' };
    const podeAnalisar = !!categoria && !!valor && parseFloat(valor) > 0;

    const analisar = (file) => {
        const alvo = file || arquivo;
        if (!alvo || !podeAnalisar) return Promise.resolve(null);
        const form = new FormData();
        form.append('arquivo', alvo);
        form.append('categoria', campos.categoria);
        form.append('valor', campos.valor);
        form.append('dataReferencia', campos.dataReferencia || '');
        if (campos.litros) form.append('litros', campos.litros);
        if (campos.veiculoId) form.append('veiculoId', campos.veiculoId);
        setAnalisando(true); setFalhaRede(false); setFalhaMsg('');
        const p = api.post('/despesas/comprovante/analisar', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
            .then((r) => { setAnalise(r.data || null); setSnap(campos); return r.data || null; })
            .catch((e) => {
                setAnalise(null); setFalhaRede(true);
                const st = e.response?.status;
                const msg = st === 429 ? 'Você já conferiu muitos documentos nesta hora. Pode salvar: o escritório confere.'
                    : (st === 400 || st === 413) ? (e.response?.data?.error || e.response?.data?.mensagem || '') : '';
                setFalhaMsg(msg);
                return null;
            })
            .finally(() => { setAnalisando(false); });
        promRef.current = p;
        return p;
    };

    const escolherArquivo = async (file, comprimir) => {
        if (!file) return;
        let f = file;
        try { f = await comprimir(file); } catch { f = file; }
        if (/hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '')) {
            toast.error('Tire a foto de novo (o formato do celular não foi aceito).', { duration: 6000 });
            return;
        }
        if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = null; }
        if (String(f.type || '').startsWith('image/')) { previewRef.current = URL.createObjectURL(f); setPreviewUrl(previewRef.current); } else setPreviewUrl(null);
        setArquivo(f); setAnalise(null); setSnap(null); setSemComprovante(false);
        analisar(f);
    };

    const remover = () => {
        if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = null; }
        setArquivo(null); setPreviewUrl(null); setAnalise(null); setSnap(null); setFalhaRede(false); setFalhaMsg('');
    };

    // mudou algo digitado depois de ler o documento?
    const desatualizada = !!analise && !!snap && JSON.stringify(snap) !== JSON.stringify(campos);

    return {
        arquivo, previewUrl, analise, analisando, falhaRede, falhaMsg, semComprovante, setSemComprovante, motivoSem, setMotivoSem,
        podeAnalisar, desatualizada, analisar, escolherArquivo, remover, promRef,
    };
}

export const SecaoComprovante = ({ c, comprimir, digitado, obrigatorio, jaTemComprovante, onCorrigir }) => {
    const camRef = useRef(null);
    const arqRef = useRef(null);
    const [ver, setVer] = useState(false);
    const a = c.analise;
    const status = a?.status;
    const divergeValor = a?.leitura && num(a.leitura.valor) !== null && num(digitado.valor) !== null && centavosDif(a.leitura.valor, digitado.valor) > 5;
    const divergeLitros = a?.leitura && num(a.leitura.litros) !== null && num(digitado.litros) !== null && centavosDif(a.leitura.litros, digitado.litros) > 50;
    const ehPdf = String(c.arquivo?.type || '').includes('pdf') || (a?.motivos || []).some((m) => m?.causa === 'pdf_nao_lido' || m?.codigo === 'pdf_nao_lido');
    const motivoSemOk = c.motivoSem.trim().length >= 5;

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <Paperclip className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Foto do recibo ou da nota{obrigatorio ? ' *' : ''}</span>
            </div>
            <div className="p-4 space-y-3">
                <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; c.escolherArquivo(f, comprimir); }} />
                <input ref={arqRef} type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; c.escolherArquivo(f, comprimir); }} />

                {!c.arquivo && !c.semComprovante && (
                    <>
                        {jaTemComprovante && <p className="text-sm text-gray-600">Esta despesa já tem comprovante. Só mande outra foto se quiser trocar.</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button type="button" onClick={() => camRef.current?.click()}
                                className="px-4 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">
                                Tirar foto
                            </button>
                            <button type="button" onClick={() => arqRef.current?.click()}
                                className="px-4 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                Escolher arquivo
                            </button>
                        </div>
                        {!jaTemComprovante && (
                            <button type="button" onClick={() => c.setSemComprovante(true)}
                                className="w-full min-h-[44px] text-sm font-medium text-gray-600 underline">
                                Não tenho comprovante
                            </button>
                        )}
                    </>
                )}

                {c.semComprovante && !c.arquivo && (
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Por que não tem comprovante? *</label>
                        <textarea value={c.motivoSem} onChange={(e) => c.setMotivoSem(e.target.value)} rows={2}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            placeholder="Ex.: o posto não deu cupom" />
                        {!motivoSemOk && <p className="text-xs text-amber-700">Escreva pelo menos 5 letras.</p>}
                        <button type="button" onClick={() => c.setSemComprovante(false)} className="min-h-[44px] text-sm font-medium text-primary underline">
                            Prefiro mandar a foto
                        </button>
                    </div>
                )}

                {c.arquivo && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            {c.previewUrl ? (
                                <div role="button" tabIndex={0} onClick={() => setVer(true)} onKeyDown={(e) => { if (e.key === 'Enter') setVer(true); }} className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shrink-0 cursor-pointer">
                                    <img src={c.previewUrl} alt="Comprovante" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0"><FileText className="h-7 w-7 text-gray-400" /></div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{c.arquivo.name || 'Comprovante'}</p>
                                <div className="flex flex-wrap gap-x-4">
                                    <button type="button" onClick={() => (c.remover(), arqRef.current?.click())} className="min-h-[44px] text-sm font-medium text-primary underline">Trocar</button>
                                    <button type="button" onClick={c.remover} className="min-h-[44px] text-sm font-medium text-gray-600 underline">Tirar</button>
                                </div>
                            </div>
                        </div>

                        {c.analisando && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" /> Lendo o documento… pode levar uns segundos. Você já pode salvar.
                            </div>
                        )}

                        {!c.analisando && !a && !c.falhaRede && !c.podeAnalisar && (
                            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">Escolha a categoria e digite o valor para eu conferir o documento.</p>
                        )}
                        {!c.analisando && !a && !c.falhaRede && c.podeAnalisar && (
                            <button type="button" onClick={() => c.analisar()} className="w-full min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                Conferir o documento
                            </button>
                        )}
                        {!c.analisando && c.falhaRede && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 space-y-2">
                                <p>{c.falhaMsg || 'Não consegui conferir o documento agora (sem sinal?).'} A foto fica guardada e você pode salvar assim mesmo.</p>
                                <button type="button" onClick={() => c.analisar()} className="min-h-[44px] text-sm font-medium text-primary underline">Tentar conferir de novo</button>
                            </div>
                        )}

                        {!c.analisando && a && (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2"><ChipStatus status={status} /></div>
                                {status === 'IA_INDISPONIVEL' && (
                                    <p className="text-sm text-gray-600">
                                        {ehPdf ? 'PDF anexado. A IA não lê PDF; o escritório confere.' : 'Não consegui ler agora. Pode salvar: o escritório confere depois.'}
                                    </p>
                                )}
                                <ListaMotivos motivos={(a.motivos || []).filter((m) => !(m?.causa === 'pdf_nao_lido' || m?.codigo === 'pdf_nao_lido'))} />
                                {status !== 'IA_INDISPONIVEL' && (
                                    <ComparacaoLeitura digitado={digitado} leitura={a.leitura || null} fornecedorSugerido={a.fornecedorSugerido || null} />
                                )}
                                {(divergeValor || divergeLitros) && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {divergeValor && (
                                            <button type="button" onClick={() => onCorrigir({ valor: a.leitura.valor })}
                                                className="px-4 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                                Corrigir o valor para {brl(a.leitura.valor)}
                                            </button>
                                        )}
                                        {divergeLitros && digitado.mostrarLitros && (
                                            <button type="button" onClick={() => onCorrigir({ litros: a.leitura.litros })}
                                                className="px-4 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                                Corrigir os litros para {litrosTxt(a.leitura.litros)}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {status !== 'CONFERIDA' && status !== 'IA_INDISPONIVEL' && (
                                    <p className="text-xs text-gray-500">Se estiver certo como você digitou, é só salvar assim: o escritório confere no fechamento do caixa.</p>
                                )}
                                {c.desatualizada && (
                                    <button type="button" onClick={() => c.analisar()} className="w-full min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                        Você mudou os dados. Conferir de novo
                                    </button>
                                )}
                                {Array.isArray(a.avisos) && a.avisos.length > 0 && (
                                    <ul className="text-xs text-amber-700 space-y-1">
                                        {a.avisos.map((t, i) => <li key={i}>{typeof t === 'string' ? t : t?.mensagem}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {ver && c.previewUrl && (
                <VisualizadorFotos
                    slides={[{ chave: 'novo', rotulo: 'Comprovante', url: c.previewUrl, parecer: null, perguntas: [], complemento: null, editavel: false, statusIa: 'NAO_ANALISADA' }]}
                    modo="escritorio" semParecer titulo="Comprovante" onClose={() => setVer(false)}
                />
            )}
        </div>
    );
};
