import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Plus, Loader2 } from 'lucide-react';
import { capitalizarCodigo } from '../../services/setorService';
import comoFazerService, { mensagemErro, statusVisual, TIPOS } from '../../services/comoFazerService';
import TelaEquipe from '../../components/ComoFazer/TelaEquipe';
import { useBaseComoFazer } from '../../components/ComoFazer/BaseComoFazer';
import SelectBusca from '../../components/SelectBusca';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { useComoFazerMe } from './hooks/useComoFazerMe';
import { BADGE_TIPO, CLS_BADGE } from '../../components/ComoFazer/visual';

function Grupo({ titulo, itens, children }) {
    if (!itens.length) return null;
    return (
        <section>
            <div className="flex items-center gap-2 pt-3 pb-2 text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}<span className="flex-1 h-px bg-gray-200" /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
        </section>
    );
}

function Cartao({ item, onAbrir, onFazer }) {
    const st = statusVisual(item.status);
    const rascunho = item.rascunho === true || item.statusConteudo === 'RASCUNHO';
    const tipo = TIPOS[item.tipo] || { rotulo: item.tipo || '', icone: '📘' };
    const codigo = [item.codigo, item.versaoNumero != null ? `v${item.versaoNumero}` : ''].filter(Boolean).join(' · ');
    const pendente = st.pendente && !rascunho;
    return (
        <div role="button" tabIndex={0} onClick={() => onAbrir(item)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAbrir(item); } }}
            className={`text-left rounded-xl bg-white shadow-sm p-3 min-h-[88px] cursor-pointer border-2 ${pendente ? 'border-amber-400' : 'border-gray-200'}`}>
            {codigo ? <div className="text-[11px] font-extrabold tracking-wider text-gray-600">{codigo}</div> : null}
            <div className="text-base font-bold text-gray-900 break-words">{item.icone || tipo.icone} {item.titulo}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                <span className={`${CLS_BADGE} ${BADGE_TIPO[item.tipo] || 'bg-gray-100 text-gray-700'}`}>{tipo.rotulo}</span>
                {rascunho && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Rascunho</span>}
                {item.revisaoVencida === true && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Revisão vencida</span>}
                {pendente
                    ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">{item.status === 'AGUARDANDO_CONFIRMACAO' ? 'Falta o encarregado confirmar' : 'Você não treinou'}</span>
                    : !rascunho && item.status !== 'NAO_SE_APLICA' && <span>{item.tipo === 'DOSAGEM' || item.tipo === 'ROTINA' ? 'já li' : 'já sei'} {st.emoji}</span>}
            </div>
            {(() => {
                // o badge já diz o tipo: tira "Regra · " do começo do subtítulo
                const sub = String(item.subtitulo || '').replace(new RegExp(`^${tipo.rotulo}( · )?`), '');
                const txt = `${sub}${item.novaVersao && !/versão nova/.test(sub) ? `${sub ? ' · ' : ''}versão nova` : ''}`;
                return txt ? <div className="mt-1 text-xs text-gray-600 break-words">{txt}</div> : null;
            })()}
            {item.tipo === 'ROTINA' && !rascunho && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onFazer(item); }}
                    className="mt-2 min-h-[56px] px-6 rounded-full bg-primary hover:bg-primaryDark text-white font-bold text-base">Fazer agora</button>
            )}
        </div>
    );
}

export default function ComoFazerHome() {
    const navigate = useNavigate();
    const { base, tablet } = useBaseComoFazer();
    const { me, pode } = useComoFazerMe();
    const [setor, setSetor] = useState(null);
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');
    const [tipoSalvo, setTipoSalvo] = useFiltroSalvo('como-fazer:tipo', 'TODOS');
    const [tipoLocal, setTipoLocal] = useState('TODOS'); // tablet é aparelho compartilhado: nada de localStorage
    const tipo = tablet ? tipoLocal : tipoSalvo;
    const setTipo = tablet ? setTipoLocal : setTipoSalvo;

    useEffect(() => {
        let vivo = true;
        comoFazerService.home(setor || undefined)
            .then((d) => { if (vivo) { setDados(d); setErro(''); } })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [setor]);

    const itens = useMemo(() => (Array.isArray(dados?.itens) ? dados.itens : []).filter((i) => tipo === 'TODOS' || i.tipo === tipo), [dados, tipo]);
    const faltam = itens.filter((i) => statusVisual(i.status).pendente && !(i.rascunho === true || i.statusConteudo === 'RASCUNHO'));
    const resto = itens.filter((i) => !faltam.includes(i));
    const rotinas = resto.filter((i) => i.tipo === 'ROTINA');
    const outros = resto.filter((i) => i.tipo !== 'ROTINA');
    const totalFalta = (Array.isArray(dados?.itens) ? dados.itens : []).filter((i) => statusVisual(i.status).pendente).length;
    const primeiro = String(me?.funcionario?.nome || '').split(' ')[0];
    const setorAtual = dados?.setorAtual || setor || '';
    // setores vêm do servidor (/home) — o tablet não tem login para ler /api/setores. Valor = codigo; slug só para a chamada.
    const setoresChips = (Array.isArray(dados?.setores) ? dados.setores : []).filter((s) => s && (s.codigo || s.slug)).map((s) => {
        const slug = String(s.slug || s.codigo).toLowerCase();
        const codigo = String(s.codigo || s.slug).toUpperCase();
        return { slug, codigo, nome: s.nome || capitalizarCodigo(codigo), emoji: s.icone || '', pendentes: s.pendentes || 0 };
    });
    const nomeSetor = setoresChips.find((s) => s.codigo === String(setorAtual).toUpperCase())?.nome || '';

    const abrir = (i) => navigate(`${base}/c/${i.id}`);
    const fazer = (i) => {
        // data e hora vêm do SERVIDOR (fuso de São Paulo) — nunca do relógio do aparelho
        const r = i.rotina || {};
        const qs = new URLSearchParams({ ...(r.dataRef ? { data: r.dataRef } : {}), ...(r.horaAlvo ? { hora: r.horaAlvo } : {}) }).toString();
        navigate(`${base}/fazer/${i.id}${qs ? `?${qs}` : ''}`);
    };

    const subt = [primeiro ? `Olá, ${primeiro}` : '', nomeSetor, totalFalta > 0 ? `${totalFalta} ${totalFalta === 1 ? 'coisa' : 'coisas'} para aprender` : 'tudo em dia'].filter(Boolean).join(' · ');

    const acoes = (pode.painel || pode.editar) ? (
        <div className="flex gap-2 shrink-0">
            {(pode.painel || pode.editar) && <button type="button" onClick={() => navigate(pode.painel ? '/rh/como-fazer' : '/rh/como-fazer?aba=conteudos')} aria-label="Painel" className="min-h-[48px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary font-bold text-sm"><BarChart3 className="h-4 w-4" /> <span className="hidden sm:inline">Painel</span></button>}
            {pode.editar && <button type="button" onClick={() => navigate('/rh/como-fazer?aba=conteudos&novo=1')} aria-label="Novo conteúdo" className="min-h-[48px] px-4 inline-flex items-center gap-2 rounded-full bg-primary hover:bg-primaryDark text-white font-bold text-sm"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo</span></button>}
        </div>
    ) : null;

    return (
        <TelaEquipe titulo="Como Fazer" emoji="📘" subtitulo={subt} mostrarVoltar={false} acoes={acoes}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                {setoresChips.map((s) => (
                    <button key={s.codigo} type="button" onClick={() => setSetor(s.slug)}
                        className={`min-h-[56px] px-5 rounded-full border text-base font-bold ${String(setorAtual).toUpperCase() === s.codigo ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-800'}`}>
                        {s.emoji ? `${s.emoji} ` : ''}{s.nome}{s.pendentes > 0 ? ` (${s.pendentes})` : ''}
                    </button>
                ))}
                <div className="w-full md:w-auto md:ml-auto">
                    <SelectBusca value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full md:w-44">
                        <option value="TODOS">Tipo: Todos</option>
                        {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                    </SelectBusca>
                </div>
            </div>

            {erro && <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4 my-3">{erro}</p>}
            {!dados && !erro && <Loader2 className="h-8 w-8 animate-spin mx-auto my-10 text-primary" />}
            {dados && itens.length === 0 && !erro && (
                <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-gray-700">Ainda não há nada publicado {nomeSetor ? `na ${nomeSetor}` : 'aqui'}.</p>
            )}

            <Grupo titulo="Falta aprender" itens={faltam}>{faltam.map((i) => <Cartao key={i.id} item={i} onAbrir={abrir} onFazer={fazer} />)}</Grupo>
            <Grupo titulo="Rotinas (com checklist)" itens={rotinas}>{rotinas.map((i) => <Cartao key={i.id} item={i} onAbrir={abrir} onFazer={fazer} />)}</Grupo>
            <Grupo titulo="Máquinas · Regras · Dosagens" itens={outros}>{outros.map((i) => <Cartao key={i.id} item={i} onAbrir={abrir} onFazer={fazer} />)}</Grupo>
        </TelaEquipe>
    );
}
