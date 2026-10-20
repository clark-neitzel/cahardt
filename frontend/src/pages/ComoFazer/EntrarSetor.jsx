import { useEffect, useState } from 'react';
import { Loader2, ChevronLeft } from 'lucide-react';
import comoFazerService, {
    gravarSessaoTablet, gravarChaveAparelho, limparChaveAparelho, lerChaveAparelho, codigoErro, semResposta,
} from '../../services/comoFazerService';
import FotoPessoa from '../../components/ComoFazer/FotoPessoa';
import TecladoNumerico from '../../components/ComoFazer/TecladoNumerico';

// /setor/:slug — o funcionário toca na PRÓPRIA FOTO e digita 4 números. Sem digitar nome, sem texto.
export default function EntrarSetor({ slug: slugRota }) {
    const slug = String(slugRota || '').toLowerCase();
    const [setor, setSetor] = useState(null); // { nome, icone } vindo de /tablet/:slug/funcionarios
    const [estado, setEstado] = useState('carregando'); // carregando | liberar | rede | grade
    const [lista, setLista] = useState([]);
    const [escolhido, setEscolhido] = useState(null);
    const [pin, setPin] = useState('');
    const [msg, setMsg] = useState('');
    const [erros, setErros] = useState(0);
    const [enviando, setEnviando] = useState(false);
    const [tremer, setTremer] = useState(false);
    const [hash, setHash] = useState(() => window.location.hash || '');

    // colar o link de pareamento com a página já aberta só muda o "#": também vale
    useEffect(() => {
        const aoMudar = () => setHash(window.location.hash || '');
        window.addEventListener('hashchange', aoMudar);
        return () => window.removeEventListener('hashchange', aoMudar);
    }, []);

    useEffect(() => {
        // Link de pareamento: /setor/cozinha#k=<chave> → guarda no aparelho e limpa o endereço
        const m = /[#&]k=([^&]+)/.exec(hash);
        if (m) {
            gravarChaveAparelho(slug, decodeURIComponent(m[1]));
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (!lerChaveAparelho(slug)) { setEstado('liberar'); return; }
        let vivo = true;
        comoFazerService.grade(slug)
            .then((d) => { if (vivo) { setSetor(d?.setor || null); setLista(Array.isArray(d?.funcionarios) ? d.funcionarios : []); setEstado('grade'); } })
            .catch((e) => {
                if (!vivo) return;
                const c = codigoErro(e);
                if (c === 'APARELHO_NAO_AUTORIZADO') { limparChaveAparelho(slug); setEstado('liberar'); }
                else if (c === 'SETOR_INATIVO' || c === 'SETOR_INVALIDO' || e?.response?.status === 404) setEstado('setor-fora');
                else if (semResposta(e)) setEstado('rede');
                else setEstado('liberar');
            });
        return () => { vivo = false; };
    }, [slug, hash]);

    const tentar = async (valor) => {
        setEnviando(true); setMsg('');
        try {
            const r = await comoFazerService.entrar(slug, escolhido.id, valor);
            gravarSessaoTablet({ token: r.token, expiraEm: r.expiraEm, funcionario: r.funcionario, slug });
        } catch (e) {
            setPin('');
            const cod = codigoErro(e);
            if (cod === 'APARELHO_NAO_AUTORIZADO') { limparChaveAparelho(slug); setEstado('liberar'); return; }
            if (cod === 'SETOR_INATIVO' || cod === 'SETOR_INVALIDO') { setEstado('setor-fora'); return; }
            setTremer(true); setTimeout(() => setTremer(false), 500);
            if (cod === 'PIN_INCORRETO') {
                const n = erros + 1; setErros(n);
                setMsg(n >= 3 ? 'Chame o encarregado.' : 'Número errado. Tente de novo.');
            } else if (cod === 'AGUARDE') setMsg(`Espere ${e.response?.data?.segundos || 30} segundos e tente de novo. Se precisar, chame o encarregado.`);
            else if (cod === 'SEM_PIN') setMsg('Seu número ainda não foi criado. Chame o encarregado.');
            else if (semResposta(e)) setMsg('Sem conexão. Tente de novo.');
            else setMsg('Não deu para entrar. Chame o encarregado.');
        } finally { setEnviando(false); }
    };

    const digitar = (v) => {
        setPin(v);
        if (v.length === 4 && !enviando) tentar(v);
    };

    const moldura = (children) => (
        <div className="min-h-screen bg-house text-white p-4 md:p-8 flex flex-col">
            <h1 className="text-center text-xl md:text-3xl font-extrabold mb-4">{setor?.nome ? `${setor.icone ? `${setor.icone} ` : ''}${setor.nome}` : 'Como Fazer'}</h1>
            {children}
        </div>
    );

    if (estado === 'carregando') return moldura(<Loader2 className="h-10 w-10 animate-spin mx-auto mt-10" />);
    if (estado === 'setor-fora') {
        return moldura(
            <div className="bg-white text-gray-900 rounded-2xl p-6 max-w-md mx-auto text-center mt-6">
                <div className="text-5xl mb-2">🚫</div>
                <h2 className="text-xl font-bold mb-1">Este setor não existe mais</h2>
                <p className="text-gray-700">Este setor foi desativado ou não existe. Fale com o RH.</p>
            </div>
        );
    }
    if (estado === 'liberar') {
        return moldura(
            <div className="bg-white text-gray-900 rounded-2xl p-6 max-w-md mx-auto text-center mt-6">
                <div className="text-5xl mb-2">🔒</div>
                <h2 className="text-xl font-bold mb-1">Aparelho não autorizado</h2>
                <p className="text-gray-700">Este aparelho ainda não foi liberado. Peça ao RH o link de liberação.</p>
            </div>
        );
    }
    if (estado === 'rede') {
        return moldura(
            <div className="bg-white text-gray-900 rounded-2xl p-6 max-w-md mx-auto text-center mt-6 space-y-3">
                <p className="font-bold">Sem conexão com o servidor.</p>
                <button type="button" onClick={() => window.location.reload()} className="w-full min-h-[56px] rounded-full bg-primary text-white font-bold">Tentar de novo</button>
            </div>
        );
    }

    if (escolhido) {
        return moldura(
            <div className={`flex-1 flex flex-col items-center ${tremer ? 'animate-[cf-tremer_0.4s]' : ''}`}>
                <button type="button" onClick={() => { setEscolhido(null); setPin(''); setMsg(''); setErros(0); }} className="self-start min-h-[56px] px-3 inline-flex items-center gap-1 text-white/80 font-semibold"><ChevronLeft className="h-5 w-5" /> Não sou eu</button>
                <FotoPessoa foto={escolhido.foto} nome={escolhido.nome} tamanho={96} />
                <b className="text-xl mt-2">{escolhido.primeiroNome || escolhido.nome}</b>
                <p className="text-white/80 text-sm mb-3">Digite seus 4 números</p>
                <div className="flex gap-3 mb-4">
                    {[0, 1, 2, 3].map((i) => <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-[#cba258]' : 'bg-white/35'}`} />)}
                </div>
                <TecladoNumerico valor={pin} onChange={digitar} maxLen={4} escuro />
                {enviando && <Loader2 className="h-6 w-6 animate-spin mt-4" />}
                {msg && <p className="mt-4 text-center font-bold bg-red-100 text-red-700 rounded-xl p-3 max-w-xs">{msg}</p>}
            </div>
        );
    }

    return moldura(
        lista.length === 0 ? (
            <div className="bg-white text-gray-900 rounded-2xl p-6 max-w-md mx-auto text-center mt-6">
                <p className="font-bold">Ninguém liberado neste setor.</p>
                <p className="text-sm text-gray-700 mt-1">O RH precisa cadastrar o setor e uma senha de 4 números na ficha de cada funcionário.</p>
            </div>
        ) : (
            <>
                <p className="text-center text-white/80 mb-3">Toque na sua foto</p>
                <div className="flex flex-wrap justify-center gap-3 max-w-5xl mx-auto w-full">
                    {lista.map((f) => (
                        <button key={f.id} type="button" onClick={() => setEscolhido(f)}
                            className="bg-white text-gray-900 rounded-2xl p-3 flex flex-col items-center gap-2 min-h-[120px] w-[calc(50%-6px)] sm:w-36 active:scale-95 transition-transform">
                            <FotoPessoa foto={f.foto} nome={f.nome} tamanho={72} />
                            <b className="text-sm text-center break-words">{f.primeiroNome || f.nome}</b>
                        </button>
                    ))}
                </div>
            </>
        )
    );
}
