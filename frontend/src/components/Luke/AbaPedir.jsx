import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowUp, Camera, FileText, Image as ImagemIcon, Paperclip, X } from 'lucide-react';
import chatLukeService, { erroDoChat, novaChaveEnvio } from '../../services/chatLukeService';
import agenteService, { mensagemErro } from '../../services/agenteService';
import { comprimirFoto } from '../../utils/comprimirFoto';
import { CartaoSolicitacao } from '../Agentes/CartaoSolicitacao';
import LukeMascote from './LukeMascote';
import { FotoMsg, PdfMsg, VisorAnexo } from './AnexosChat';
import { horaCurta, rotuloDia, useAbaVisivel } from './lukeHooks';

// Aba "Pedir ao Luke": conversa contínua de cada pessoa com o Luke (BPO financeiro). Texto, foto, PDF.
//  - polling de 4 s só com a aba do Luke aberta e visível (pausa com a aba do navegador oculta, volta na hora);
//  - envio em UMA requisição (multipart) com Idempotency-Key gerada no aparelho: repetir o envio nunca duplica;
//  - o que o Luke e o usuário escrevem é TEXTO PURO (nunca HTML).
const INTERVALO_MS = 4000;
const MAX_ANEXOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ESPERA_MAX_MS = 10 * 60 * 1000; // depois disso o "Luke está lendo…" some (ele pode ter demorado ou estar fora)
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

const ASSUNTOS = [
    { v: 'LANCAMENTO', t: '📎 Lançar pagamento', dica: 'Ex.: Pix de R$ 350,00 para a Gás do Vale' },
    { v: 'NOTA', t: '🧾 Enviar nota', dica: 'Ex.: Nota da Embalagens Sul, vence dia 10' },
    { v: 'CORRECAO', t: '✏️ Corrigir', dica: 'O que precisa ser corrigido?' },
    { v: 'DUVIDA', t: '❓ Dúvida', dica: 'Qual é a sua dúvida para o Luke?' },
];
// códigos em que repetir o MESMO envio não adianta (a pessoa precisa mudar algo)
const SEM_RETENTATIVA = ['TIPO_NAO_ACEITO', 'ANEXO_GRANDE', 'TEXTO_GRANDE', 'MENSAGEM_VAZIA', 'LIMITE_ARQUIVOS', 'CHAT_LIMITE_DIA', 'CHAT_LIMITE_ANEXOS', 'SEM_PERMISSAO', 'CHAT_DESLIGADO', 'ASSUNTO_INVALIDO', 'ARQUIVO_INVALIDO'];

const pareceDuvida = (t) => /^(como|onde|o que|qual tela)\b/i.test(String(t || '').trim());

const BADGE_SOL = {
    PENDENTE: ['lk-b-ambar', 'Aguardando autorização'], EXECUTANDO: ['lk-b-ambar', 'Executando…'],
    AUTORIZADA: ['lk-b-verde', 'Autorizado'], RECUSADA: ['lk-b-verm', 'Recusado'],
    ERRO: ['lk-b-verm', 'Erro ao executar'], ERRO_INDETERMINADO: ['lk-b-ambar', 'Resultado incerto'], EXPIRADA: ['lk-b-cinza', 'Expirado'],
};

const revogarPreviews = (lista) => (lista || []).forEach((p) => { if (p?.url) { try { URL.revokeObjectURL(p.url); } catch { /* ignora */ } } });

// Singular/plural (nunca "Você usou os 1 pedidos")
const textoLimitePedidos = (n) => (n === 0 ? 'Seu limite de pedidos de hoje é 0.' : n === 1 ? 'Você usou o único pedido de hoje.' : `Você usou os ${n} pedidos de hoje.`);

function mesclar(atual, novas) {
    const mapa = new Map(atual.map((m) => [m.id, m]));
    novas.forEach((m) => mapa.set(m.id, m));
    return [...mapa.values()].sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
}

// ── Cartão da solicitação dentro da conversa ──
function SolicitacaoNoChat({ sol, admin, decisao, versao }) {
    const [det, setDet] = useState(null);       // item completo (só admin)
    const [abrir, setAbrir] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [agora, setAgora] = useState(() => Date.now());
    const [badgeCls, badgeTxt] = BADGE_SOL[sol.status] || ['lk-b-cinza', sol.status];
    const pendente = sol.status === 'PENDENTE';

    const carregar = useCallback(async () => {
        setCarregando(true);
        try { const it = await agenteService.solicitacao(sol.id); setDet(it); setAgora(Date.now()); return it; }
        catch (e) { toast.error(mensagemErro(e, 'Não foi possível abrir o pedido.')); return null; }
        finally { setCarregando(false); }
    }, [sol.id]);

    // depois de uma decisão o item completo muda: relê se ele estava aberto
    useEffect(() => { if (abrir) carregar(); }, [versao]); // eslint-disable-line react-hooks/exhaustive-deps

    async function decidir(acao) {
        const it = det || await carregar();
        if (!it) return;
        if (it.status !== 'PENDENTE') { toast('Este pedido já foi decidido.', { icon: 'ℹ️' }); return; }
        if (acao === 'ok') decisao.pedirAutorizar(it); else decisao.pedirRecusar(it);
    }
    async function alternar() {
        if (abrir) { setAbrir(false); return; }
        setAbrir(true);
        if (!det) carregar();
    }

    return (
        <div className="lk-sol" data-testid="luke-solicitacao" data-status={sol.status}>
            <div className="t"><FileText />Solicitação</div>
            <div className="c">
                <b>{sol.resumo || 'Pedido do Luke'}</b>
                <div className="st"><span className={`lk-badge ${badgeCls}`}>{badgeTxt}</span></div>
            </div>
            {admin ? (
                <>
                    {!abrir && pendente && (
                        <div className="bts">
                            <button type="button" className="lk-b-pri" disabled={carregando} onClick={() => decidir('ok')}>Autorizar</button>
                            <button type="button" className="lk-b-rec" disabled={carregando} onClick={() => decidir('nao')}>Recusar</button>
                        </div>
                    )}
                    <div className="bts" style={{ paddingTop: 0 }}>
                        <button type="button" className="lk-b-out" onClick={alternar}>{abrir ? 'Fechar detalhes' : 'Ver detalhes'}</button>
                    </div>
                    {abrir && (
                        <div className="det">
                            {!det ? <p className="nota">Carregando…</p> : (
                                <CartaoSolicitacao
                                    item={det} agora={agora} compacto liberaEm={decisao.liberaEm[det.id]}
                                    onAbrirTela={decisao.abrirTela} onAutorizar={decisao.pedirAutorizar}
                                    onRecusar={decisao.pedirRecusar} onRepetir={decisao.pedirRepetir}
                                />
                            )}
                        </div>
                    )}
                </>
            ) : (
                pendente && <div className="nota">O administrador recebeu o pedido. Eu aviso quando ele responder.</div>
            )}
        </div>
    );
}

export default function AbaPedir({
    ativa, aberto, compacto, admin, ajudaDisponivel, geracaoAnexos = 0, rascunho, decisao, versaoDecisao,
    onHumor, onAguardando, onLida, onDuvida, onTrocarParaDuvida, onDesligado,
}) {
    const visivel = useAbaVisivel();
    const [carga, setCarga] = useState({ fase: 'carregando', erro: '' }); // carregando | ok | erro | desligado
    const [mensagens, setMensagens] = useState([]);
    const [temMais, setTemMais] = useState(false);
    const [saldo, setSaldo] = useState(null);
    const [conectado, setConectado] = useState(true);
    const [locais, setLocais] = useState([]);           // envios do aparelho ainda sem confirmação do servidor
    const [extras, setExtras] = useState({});           // id da mensagem -> { avisos, previews }
    const [texto, setTexto] = useState('');
    const [assunto, setAssunto] = useState('');
    const [anexos, setAnexos] = useState([]);           // { id, file, url, tipo, nome }
    const [processando, setProcessando] = useState(false);
    const [guarda, setGuarda] = useState(false);
    const [arrastando, setArrastando] = useState(false);
    const [visor, setVisor] = useState(null);
    const [agora, setAgora] = useState(() => Date.now());

    const cursorRef = useRef(null);
    const emVooPoll = useRef(false);
    const enviosEmVoo = useRef(0);
    const msgsRef = useRef(null);
    const grudado = useRef(true);                      // rola para o fim quando chega mensagem (se a pessoa já estava no fim)
    const campoRef = useRef(null);
    const camRef = useRef(null); const galRef = useRef(null); const pdfRef = useRef(null);
    const lidaRef = useRef('');
    const totalLukeRef = useRef(null);
    const timerFeliz = useRef(0);
    const montado = useRef(true);
    const vivosRef = useRef({ anexos: [], locais: [] });
    vivosRef.current = { anexos, locais }; // para revogar as URLs de preview se o chat for desmontado
    useEffect(() => { montado.current = true; return () => { montado.current = false; clearTimeout(timerFeliz.current); vivosRef.current.anexos.forEach((a) => a.url && URL.revokeObjectURL(a.url)); vivosRef.current.locais.forEach((l) => revogarPreviews(l.previews)); }; }, []);

    // ── carga inicial ──
    const carregarConversa = useCallback(async () => {
        setCarga({ fase: 'carregando', erro: '' });
        try {
            const r = await chatLukeService.abrirConversa();
            if (!montado.current) return;
            if (r.ativo === false) { setCarga({ fase: 'desligado', erro: '' }); return; }
            cursorRef.current = r.cursor || null;
            setMensagens(r.mensagens || []);
            setTemMais(!!r.temMais);
            setSaldo(r.saldo || null);
            setConectado(r.conectado !== false);
            totalLukeRef.current = (r.mensagens || []).filter((m) => m.autor !== 'USUARIO').length;
            grudado.current = true;
            setCarga({ fase: 'ok', erro: '' });
        } catch (e) {
            if (!montado.current) return;
            if (e?.response?.status === 503 && e?.response?.data?.codigo === 'CHAT_DESLIGADO') { setCarga({ fase: 'desligado', erro: '' }); return; }
            setCarga({ fase: 'erro', erro: erroDoChat(e, 'Não foi possível abrir a conversa.').mensagem });
        }
    }, []);
    const jaCarregou = useRef(false);
    useEffect(() => {
        if (aberto && !jaCarregou.current) { jaCarregou.current = true; carregarConversa(); }
    }, [aberto, carregarConversa]);

    // ── polling (4 s): só com o painel aberto, esta aba à vista e a aba do navegador visível ──
    const pollAtivo = aberto && ativa && visivel && carga.fase === 'ok';
    const buscarNovas = useCallback(async () => {
        if (emVooPoll.current || enviosEmVoo.current > 0) return;
        emVooPoll.current = true;
        try {
            // conversa ainda sem cursor (nenhuma mensagem até agora): lê as mais recentes; senão, só o que mudou desde o cursor
            const r = await chatLukeService.mensagens(cursorRef.current ? { depoisDe: cursorRef.current, limit: 50 } : { limit: 50 });
            if (!montado.current) return;
            if (r.cursor) cursorRef.current = r.cursor;
            if (r.mensagens?.length) {
                setMensagens((atual) => mesclar(atual, r.mensagens));
                // um envio que falhou por rede MAS chegou ao servidor: some o cartão "não enviada" (o texto igual já está na conversa)
                setLocais((ls) => ls.filter((l) => !(l.fase === 'falhou' && l.semRede && r.mensagens.some((m) => m.autor === 'USUARIO' && (m.texto || '') === (l.texto || '') && m.qtdAnexos === l.arquivos.length && new Date(m.criadoEm) >= new Date(l.criadoEm) - 5000))));
            }
        } catch (e) {
            if (e?.response?.status === 503) setCarga({ fase: 'desligado', erro: '' });
            // rede/500: tenta de novo no próximo ciclo
        } finally { emVooPoll.current = false; }
    }, []);
    useEffect(() => {
        if (!pollAtivo) return undefined;
        buscarNovas(); // ao voltar para a aba/tela já busca na hora
        const t = setInterval(buscarNovas, INTERVALO_MS);
        return () => clearInterval(t);
    }, [pollAtivo, buscarNovas]);
    // uma decisão (autorizar/recusar) mudou o estado do cartão: busca já
    useEffect(() => { if (versaoDecisao) buscarNovas(); }, [versaoDecisao, buscarNovas]);

    // ── marcar como lido + humor do cachorro quando o Luke responde ──
    useEffect(() => {
        if (carga.fase !== 'ok') return;
        const doLuke = mensagens.filter((m) => m.autor !== 'USUARIO');
        if (totalLukeRef.current != null && doLuke.length > totalLukeRef.current) {
            onHumor?.('feliz');
            clearTimeout(timerFeliz.current);
            timerFeliz.current = setTimeout(() => onHumor?.('idle'), 3200);
        }
        totalLukeRef.current = doLuke.length;
        const ultima = doLuke[doLuke.length - 1];
        if (pollAtivo && ultima && ultima.id !== lidaRef.current) {
            lidaRef.current = ultima.id;
            chatLukeService.marcarLida(ultima.criadoEm).then(() => onLida?.()).catch(() => { lidaRef.current = ''; });
        }
    }, [mensagens, carga.fase, pollAtivo, onHumor, onLida]);

    useEffect(() => { onDesligado?.(carga.fase === 'desligado'); }, [carga.fase, onDesligado]);

    // ── "Luke está lendo…" ──
    const aguardando = useMemo(() => {
        if (!conectado) return false;
        const ultimaUsuario = [...mensagens].reverse().find((m) => m.autor === 'USUARIO');
        if (!ultimaUsuario || !['ENVIADO', 'PROCESSANDO'].includes(ultimaUsuario.status)) return false;
        if (mensagens.some((m) => m.autor !== 'USUARIO' && new Date(m.criadoEm) > new Date(ultimaUsuario.criadoEm))) return false;
        return agora - new Date(ultimaUsuario.criadoEm).getTime() < ESPERA_MAX_MS;
    }, [mensagens, conectado, agora]);
    useEffect(() => { onAguardando?.(aguardando); }, [aguardando, onAguardando]);
    useEffect(() => {
        if (!aguardando) return undefined;
        const t = setInterval(() => setAgora(Date.now()), 30000);
        return () => clearInterval(t);
    }, [aguardando]);

    // ── rolagem ──
    const aoRolar = () => {
        const el = msgsRef.current;
        if (el) grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    };
    useEffect(() => {
        const el = msgsRef.current;
        if (el && grudado.current) el.scrollTop = el.scrollHeight;
    }, [mensagens, locais, aguardando, carga.fase, ativa, aberto, anexos.length, guarda]);

    // ── rascunho vindo da aba "Tirar dúvida" ("Mandar para o Luke") ──
    const ultimoRascunho = useRef(0);
    useEffect(() => {
        if (rascunho && rascunho.n !== ultimoRascunho.current) {
            ultimoRascunho.current = rascunho.n;
            setTexto(rascunho.texto || ''); setGuarda(false);
            if (!compacto) setTimeout(() => campoRef.current?.focus(), 60);
        }
    }, [rascunho, compacto]);

    // campo de texto cresce até ~5 linhas
    useEffect(() => {
        const el = campoRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [texto, ativa]);
    useEffect(() => { if (ativa && aberto && !compacto && carga.fase === 'ok') campoRef.current?.focus(); }, [ativa, aberto, compacto, carga.fase]);

    // ── anexos ──
    const adicionarArquivos = useCallback(async (lista) => {
        const arquivos = Array.from(lista || []);
        if (!arquivos.length) return;
        setProcessando(true);
        try {
            let vagas = MAX_ANEXOS - anexos.length;
            const novos = [];
            for (const original of arquivos) {
                if (vagas <= 0) { toast.error(`Máximo de ${MAX_ANEXOS} arquivos por mensagem.`); break; }
                const ehPdf = original.type === 'application/pdf' || /\.pdf$/i.test(original.name || '');
                const ehImg = (original.type || '').startsWith('image/');
                if (!ehPdf && !ehImg) { toast.error(`"${original.name || 'Arquivo'}" não é aceito. Envie foto (JPG, PNG ou WebP) ou PDF.`); continue; }
                const arq = ehImg ? await comprimirFoto(original) : original; // foto sempre reduzida no aparelho (vira JPEG ~350 KB)
                if (ehImg && !TIPOS_FOTO.includes(arq.type)) {
                    toast.error('Esta foto está num formato que o Luke não lê (HEIC). Tire a foto de novo pelo botão da câmera do chat.', { duration: 7000 });
                    continue;
                }
                if (arq.size > MAX_BYTES) { toast.error(`"${arq.name}" tem mais de 10 MB. Reduza o arquivo.`); continue; }
                const tipo = ehPdf ? 'pdf' : 'foto';
                novos.push({ id: novaChaveEnvio(), file: arq, tipo, nome: arq.name || (ehPdf ? 'documento.pdf' : 'foto.jpg'), url: tipo === 'foto' ? URL.createObjectURL(arq) : '' });
                vagas -= 1;
            }
            if (novos.length && montado.current) setAnexos((a) => [...a, ...novos].slice(0, MAX_ANEXOS));
        } finally { if (montado.current) setProcessando(false); }
    }, [anexos.length]);

    const removerAnexo = (id) => setAnexos((a) => {
        const x = a.find((i) => i.id === id);
        if (x?.url) URL.revokeObjectURL(x.url);
        return a.filter((i) => i.id !== id);
    });
    const escolher = (e) => { adicionarArquivos(e.target.files); e.target.value = ''; };
    const aoColar = (e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length) { e.preventDefault(); adicionarArquivos(files); }
    };
    const aoSoltar = (e) => {
        e.preventDefault(); setArrastando(false);
        if (e.dataTransfer?.files?.length) adicionarArquivos(e.dataTransfer.files);
    };

    // ── envio ──
    const transmitir = useCallback(async (local) => {
        enviosEmVoo.current += 1;
        setLocais((ls) => ls.map((l) => (l.tempId === local.tempId ? { ...l, fase: 'enviando', erro: '' } : l)));
        grudado.current = true;
        try {
            const r = await chatLukeService.enviar({ texto: local.texto, assunto: local.assunto, arquivos: local.arquivos, chave: local.chave });
            if (!montado.current) return;
            const m = r.mensagem;
            setLocais((ls) => ls.filter((l) => l.tempId !== local.tempId));
            setExtras((x) => ({ ...x, [m.id]: { avisos: r.avisos || [] } }));
            revogarPreviews(local.previews); // a conversa passa a mostrar a foto vinda do servidor
            setMensagens((atual) => mesclar(atual, [m]));
            // NÃO avança o cursor aqui: uma resposta do Luke que chegou durante um upload lento só aparece se o próximo
            // polling ainda cobrir o intervalo (a própria mensagem já foi mesclada por id, repetir não duplica)
            if (!r.duplicada) setSaldo((s) => (s ? { ...s, pedidosUsados: s.pedidosUsados + 1, pedidosRestantes: Math.max(0, s.pedidosRestantes - 1), anexosUsados: s.anexosUsados + local.arquivos.length, anexosRestantes: Math.max(0, s.anexosRestantes - local.arquivos.length) } : s));
        } catch (e) {
            if (!montado.current) return;
            const er = erroDoChat(e);
            // o limite que vale é o que o SERVIDOR devolveu (a tela pode estar aberta há horas com o valor antigo)
            if (er.codigo === 'CHAT_LIMITE_DIA') setSaldo((s) => (s ? { ...s, pedidosRestantes: 0, ...(Number.isInteger(er.limite) ? { pedidosDia: er.limite, pedidosUsados: Number.isInteger(er.usados) ? er.usados : er.limite } : {}) } : s));
            if (er.codigo === 'CHAT_DESLIGADO') setCarga({ fase: 'desligado', erro: '' });
            setLocais((ls) => ls.map((l) => (l.tempId === local.tempId ? { ...l, fase: 'falhou', erro: er.mensagem, codigo: er.codigo, semRede: er.semRede } : l)));
        } finally { enviosEmVoo.current -= 1; }
    }, []);

    const disparar = useCallback((t, ass, itens) => {
        const local = {
            tempId: `l-${novaChaveEnvio()}`, chave: novaChaveEnvio(), texto: t, assunto: ass || null,
            arquivos: itens.map((a) => a.file), previews: itens.map((a) => ({ tipo: a.tipo, url: a.url, nome: a.nome })),
            fase: 'enviando', erro: '', criadoEm: new Date().toISOString(),
        };
        setLocais((ls) => [...ls, local]);
        setTexto(''); setAssunto(''); setAnexos([]); setGuarda(false);
        transmitir(local);
    }, [transmitir]);

    function aoEnviar() {
        const t = texto.trim();
        if ((!t && !anexos.length) || processando) return;
        if (!anexos.length && ajudaDisponivel && pareceDuvida(t) && !guarda) { setGuarda(true); return; }
        disparar(t, assunto, anexos);
    }
    const descartar = (tempId) => setLocais((ls) => {
        const l = ls.find((x) => x.tempId === tempId);
        if (l) revogarPreviews(l.previews);
        return ls.filter((x) => x.tempId !== tempId);
    });
    function devolverAoCampo(local) {
        // volta o texto e os arquivos para o compositor (a pessoa corrige e envia de novo, com chave NOVA)
        setTexto(local.texto || ''); setAssunto(local.assunto || '');
        setAnexos(local.arquivos.map((f, i) => ({ id: novaChaveEnvio(), file: f, tipo: local.previews[i]?.tipo || 'foto', nome: local.previews[i]?.nome || f.name, url: local.previews[i]?.url || '' })));
        setLocais((ls) => ls.filter((x) => x.tempId !== local.tempId)); // sem revogar: as URLs seguem para o compositor
    }

    // ── itens da conversa (mensagens do servidor + locais), com separadores de dia ──
    const itens = useMemo(() => {
        const lista = [];
        let diaAnterior = '';
        const todos = [
            ...mensagens.map((m) => ({ k: m.id, tipo: 'srv', m, quando: m.criadoEm })),
            ...locais.map((l) => ({ k: l.tempId, tipo: 'loc', l, quando: l.criadoEm })),
        ];
        todos.forEach((it) => {
            const dia = rotuloDia(it.quando);
            if (dia !== diaAnterior) { lista.push({ k: `d-${it.k}`, tipo: 'dia', dia }); diaAnterior = dia; }
            lista.push(it);
        });
        return lista;
    }, [mensagens, locais]);

    const assuntoAtual = ASSUNTOS.find((a) => a.v === assunto);
    const restantes = saldo ? saldo.pedidosRestantes : null;
    const cheio = restantes === 0;
    const mostraSaldo = saldo && restantes > 0 && restantes <= 5;

    function statusDaMsg(m) {
        const h = horaCurta(m.criadoEm);
        if (m.estado === 'AGUARDANDO_AUTORIZACAO') return { t: 'Aguardando autorização', erro: false };
        if (m.estado === 'ERRO') return { t: 'O Luke não conseguiu concluir. Veja a resposta abaixo.', erro: true };
        if (m.status === 'RESPONDIDO') return { t: `Respondido · ${h}`, erro: false };
        if (m.status === 'PROCESSANDO') return { t: `Luke está lendo · ${h}`, erro: false };
        return { t: `Enviado · ${h}`, erro: false };
    }

    function renderAnexosMsg(m, souEu) {
        if (!m.anexos?.length) return null;
        return (
            <div className="lk-anx-msg" style={souEu ? undefined : { justifyContent: 'flex-start' }}>
                {m.anexos.map((a, i) => (a.tipo === 'pdf'
                    ? <PdfMsg key={`${a.id}-${geracaoAnexos}`} anexo={a} onAbrir={setVisor} />
                    : <FotoMsg key={`${a.id}-${geracaoAnexos}`} anexo={a} ativo={aberto} onAbrir={setVisor} />))}
            </div>
        );
    }

    return (
        <div
            className="lk-painel" data-painel="pedir" hidden={!ativa} style={{ position: 'relative' }}
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false); }}
            onDrop={aoSoltar}
        >
            {arrastando && <div className="lk-soltar">Solte a foto ou o PDF aqui</div>}
            {/* uma faixa só, coerente com o estado (desligado não mostra "responde em alguns minutos" nem "não conectado") */}
            {carga.fase !== 'desligado' && (conectado ? (
                <div className="lk-sub"><b>Responde em alguns minutos</b> — pode fechar, ele avisa aqui.</div>
            ) : (
                <div className="lk-sub aviso"><b>O Luke ainda não está conectado.</b> Seus pedidos ficam guardados e ele responde quando estiver no ar.</div>
            ))}

            <div className="lk-msgs" ref={msgsRef} onScroll={aoRolar} data-testid="luke-msgs-pedir">
                {carga.fase === 'carregando' && <div className="lk-vazio">Abrindo a conversa…</div>}
                {carga.fase === 'erro' && (
                    <div className="lk-vazio"><b>Não consegui abrir a conversa</b>{carga.erro}<br /><button type="button" className="lk-acao" style={{ marginTop: 10 }} onClick={carregarConversa}>Tentar de novo</button></div>
                )}
                {carga.fase === 'desligado' && <div className="lk-vazio"><b>Chat desligado pelo administrador</b>Fale com o administrador. As dúvidas de uso continuam funcionando.</div>}
                {carga.fase === 'ok' && (
                    <>
                        <p className="lk-dia" style={{ alignSelf: 'center', fontWeight: 600 }}>A administração pode ver esta conversa.</p>
                        {temMais && (
                            <button type="button" className="lk-mais" onClick={async () => {
                                const primeira = mensagens[0];
                                if (!primeira) return;
                                try {
                                    const r = await chatLukeService.mensagens({ antesDe: primeira.criadoEm, limit: 50 });
                                    setMensagens((atual) => mesclar(atual, r.mensagens || []));
                                    setTemMais(!!r.temMais);
                                } catch (e) { toast.error(erroDoChat(e, 'Não foi possível carregar as mensagens antigas.').mensagem); }
                            }}>Ver mensagens anteriores</button>
                        )}
                        {itens.length === 0 && (
                            <div className="lk-vazio"><b>Fale com o Luke.</b>Mande um comprovante ou uma nota e diga o que precisa. Use os atalhos abaixo.</div>
                        )}
                        {itens.map((it) => {
                            if (it.tipo === 'dia') return <span key={it.k} className="lk-dia">{it.dia}</span>;
                            if (it.tipo === 'loc') {
                                const l = it.l;
                                const podeRepetir = !SEM_RETENTATIVA.includes(l.codigo);
                                return (
                                    <div key={it.k} className={`lk-m eu ${l.fase === 'enviando' ? 'lk-enviando' : ''}`} data-testid="luke-msg-local">
                                        <div className="col">
                                            {l.previews.length > 0 && (
                                                <div className="lk-anx-msg">
                                                    {l.previews.map((p, i) => (p.tipo === 'pdf'
                                                        ? <span key={i} className="lk-pdf"><i>PDF</i><span>{p.nome}</span></span>
                                                        : <span key={i} className="lk-foto"><img src={p.url} alt="" /></span>))}
                                                </div>
                                            )}
                                            {l.texto ? <div className="lk-bolha">{l.texto}</div> : null}
                                            {l.fase === 'enviando' ? <span className="lk-status">Enviando…</span> : (
                                                <>
                                                    <span className="lk-status erro">Não enviada — {l.erro || 'tente de novo'}</span>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                        {podeRepetir
                                                            ? <button type="button" className="lk-acao pri" onClick={() => transmitir(l)}>Tentar de novo</button>
                                                            : <button type="button" className="lk-acao pri" onClick={() => devolverAoCampo(l)}>Corrigir e enviar</button>}
                                                        <button type="button" className="lk-acao" onClick={() => descartar(l.tempId)}>Descartar</button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            const m = it.m;
                            const souEu = m.autor === 'USUARIO';
                            const st = souEu ? statusDaMsg(m) : null;
                            const ex = extras[m.id];
                            return (
                                <div key={it.k} className={`lk-m ${souEu ? 'eu' : ''}`}>
                                    {!souEu && <span className="lk-avatar p"><LukeMascote parado /></span>}
                                    <div className="col">
                                        {renderAnexosMsg(m, souEu)}
                                        {m.texto ? <div className="lk-bolha">{m.texto}</div> : null}
                                        {(m.solicitacoes || []).map((s) => <SolicitacaoNoChat key={s.id} sol={s} admin={admin} decisao={decisao} versao={versaoDecisao} />)}
                                        {(ex?.avisos || []).map((av, i) => <div key={i} className="lk-aviso-dup">{av.mensagem || 'Este comprovante já foi enviado antes.'}{av.arquivo ? ` (${av.arquivo})` : ''}</div>)}
                                        {st && <span className={`lk-status ${st.erro ? 'erro' : ''}`}>{st.t}</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {aguardando && (
                            <div className="lk-m"><span className="lk-avatar p"><LukeMascote parado /></span><div className="col"><div className="lk-bolha lk-digit" aria-label="Luke está lendo"><i /><i /><i /></div></div></div>
                        )}
                    </>
                )}
            </div>

            {carga.fase === 'ok' && (cheio ? (
                <div className="lk-cheio" data-testid="luke-limite-cheio">
                    <b>{textoLimitePedidos(saldo.pedidosDia)}</b>
                    <span>Volta amanhã ou fale com o administrador.{ajudaDisponivel ? ' As dúvidas continuam liberadas.' : ''}</span>
                    {ajudaDisponivel && <button type="button" className="lk-b-out" onClick={onTrocarParaDuvida}>Tirar dúvida</button>}
                </div>
            ) : (
                <div className="lk-compor">
                    {guarda && (
                        <div className="lk-guarda" role="alert">
                            <span>Parece uma dúvida de uso. Quer a resposta na hora?</span>
                            <div>
                                <button type="button" className="lk-b-pri" onClick={() => { const t = texto.trim(); setTexto(''); setGuarda(false); onDuvida?.(t); }}>Tirar dúvida agora</button>
                                <button type="button" className="lk-b-out" onClick={() => disparar(texto.trim(), assunto, anexos)}>É um pedido mesmo</button>
                            </div>
                        </div>
                    )}
                    <div className="lk-chips">
                        {ASSUNTOS.map((a) => (
                            <button key={a.v} type="button" aria-pressed={assunto === a.v} onClick={() => {
                                setAssunto((x) => (x === a.v ? '' : a.v));
                                if (a.v === 'NOTA' && assunto !== 'NOTA') galRef.current?.click();
                                else campoRef.current?.focus();
                            }}>{a.t}</button>
                        ))}
                    </div>
                    {anexos.length > 0 && (
                        <div className="lk-bandeja" data-testid="luke-bandeja">
                            {anexos.map((a) => (
                                <div key={a.id} className="lk-anx">
                                    <span className={`mini ${a.tipo === 'pdf' ? 'pdf' : ''}`}>{a.tipo === 'pdf' ? 'PDF' : <img src={a.url} alt="" />}</span>
                                    <span className="nm">{a.nome}</span>
                                    <button type="button" aria-label={`Remover ${a.nome}`} onClick={() => removerAnexo(a.id)}><X size={14} strokeWidth={3} /></button>
                                </div>
                            ))}
                            <span className="cont">{anexos.length} de {MAX_ANEXOS}</span>
                        </div>
                    )}
                    <form className="lk-linha-txt" onSubmit={(e) => { e.preventDefault(); aoEnviar(); }}>
                        <textarea
                            ref={campoRef} rows={1} value={texto} maxLength={4000} data-testid="luke-campo-pedido"
                            onChange={(e) => { setTexto(e.target.value); if (guarda) setGuarda(false); }}
                            onPaste={aoColar}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !compacto) { e.preventDefault(); aoEnviar(); } }}
                            placeholder={assuntoAtual ? assuntoAtual.dica : 'Diga ao Luke o que precisa…'} aria-label="Pedido ao Luke"
                        />
                        <button type="submit" className="lk-enviar" aria-label="Enviar" disabled={processando || (!texto.trim() && !anexos.length)}><ArrowUp /></button>
                    </form>
                    <div className="lk-linha-ic">
                        <button type="button" className="lk-ic cam" aria-label="Tirar foto" title="Tirar foto" onClick={() => camRef.current?.click()}><Camera /></button>
                        <button type="button" className="lk-ic" aria-label="Escolher imagem da galeria" title="Escolher imagem" onClick={() => galRef.current?.click()}><ImagemIcon /></button>
                        <button type="button" className="lk-ic" aria-label="Anexar PDF" title="Anexar PDF" onClick={() => pdfRef.current?.click()}><Paperclip /></button>
                        {processando && <span className="lk-status" style={{ marginLeft: 6 }}>Preparando…</span>}
                        {mostraSaldo && (
                            <div className="lk-limite" data-testid="luke-saldo"><span>Restam {restantes} {restantes === 1 ? 'pedido' : 'pedidos'} hoje</span><span className="tr"><i style={{ transform: `scaleX(${Math.min(1, saldo.pedidosUsados / Math.max(1, saldo.pedidosDia))})` }} /></span></div>
                        )}
                    </div>
                    <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={escolher} />
                    <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden onChange={escolher} />
                    <input ref={pdfRef} type="file" accept="application/pdf" multiple hidden onChange={escolher} />
                </div>
            ))}
            <VisorAnexo aberto={visor} onFechar={() => setVisor(null)} />
        </div>
    );
}
