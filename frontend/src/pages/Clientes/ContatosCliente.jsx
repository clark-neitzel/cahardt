import { useEffect, useRef, useState } from 'react';
import { Users, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../services/clienteService';
import EstadoVazio from '../../components/EstadoVazio';

const PAPEIS = ['dona', 'gerente', 'compras', 'financeiro', 'recepção'];

const vazio = { nome: '', telefone: '', papel: '', nota: '' };

function soDigitos(v) {
    return String(v || '').replace(/\D/g, '');
}

function formatarTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    let ddi = '';
    if (d.startsWith('55') && d.length > 11) {
        ddi = '+55 ';
        d = d.slice(2);
    }
    if (d.length === 11) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${ddi}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return ddi + d;
}

function formatarQuando(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mensagemErro(err, fallback) {
    return err?.response?.data?.error || fallback;
}

export default function ContatosCliente({ clienteId, podeEditar }) {
    const [lista, setLista] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(false);
    const [form, setForm] = useState(vazio);
    const [editandoId, setEditandoId] = useState(null);
    const [mostrandoForm, setMostrandoForm] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [apagandoId, setApagandoId] = useState(null);
    const nomeRef = useRef(null);

    const carregar = async ({ silencioso = false } = {}) => {
        if (!silencioso) setCarregando(true);
        setErro(false);
        try {
            const r = await clienteService.listarContatos(clienteId);
            setLista(r.data || []);
        } catch {
            setErro(true);
        } finally {
            if (!silencioso) setCarregando(false);
        }
    };

    useEffect(() => { carregar(); }, [clienteId]);

    const abrirNovo = () => {
        setEditandoId(null);
        setApagandoId(null);
        setForm(vazio);
        setMostrandoForm(true);
        setTimeout(() => { nomeRef.current?.focus(); nomeRef.current?.select(); }, 0);
    };

    const abrirEdicao = (c) => {
        setEditandoId(c.id);
        setApagandoId(null);
        setForm({ nome: c.nome || '', telefone: c.telefone || '', papel: c.papel || '', nota: c.nota || '' });
        setMostrandoForm(true);
        setTimeout(() => { nomeRef.current?.focus(); nomeRef.current?.select(); }, 0);
    };

    const cancelar = () => {
        setMostrandoForm(false);
        setEditandoId(null);
        setForm(vazio);
    };

    const salvar = async (e) => {
        e?.preventDefault();
        if (salvando) return;
        const corpo = {
            nome: form.nome.trim(),
            telefone: soDigitos(form.telefone),
            papel: form.papel.trim(),
            nota: form.nota.trim(),
        };
        if (corpo.telefone.length < 10) {
            toast.error('Informe o WhatsApp com DDD.');
            nomeRef.current?.form?.querySelector('[name="telefone"]')?.focus();
            return;
        }
        setSalvando(true);
        try {
            if (editandoId) {
                await clienteService.atualizarContato(clienteId, editandoId, corpo);
                toast.success('Contato atualizado.');
                cancelar();
            } else {
                await clienteService.criarContato(clienteId, corpo);
                toast.success(corpo.nome ? `${corpo.nome} entrou nos contatos.` : 'Número anotado, ainda sem nome.');
                setForm(vazio);
                setTimeout(() => { nomeRef.current?.focus(); }, 0);
            }
            await carregar({ silencioso: true });
        } catch (err) {
            toast.error(mensagemErro(err, 'Não foi possível salvar o contato.'));
        } finally {
            setSalvando(false);
        }
    };

    const apagar = async (c) => {
        if (apagandoId !== c.id) {
            setApagandoId(c.id);
            return;
        }
        setSalvando(true);
        try {
            await clienteService.excluirContato(clienteId, c.id);
            toast.success('Contato apagado.');
            setApagandoId(null);
            if (editandoId === c.id) cancelar();
            await carregar({ silencioso: true });
        } catch (err) {
            toast.error(mensagemErro(err, 'Não foi possível apagar o contato.'));
        } finally {
            setSalvando(false);
        }
    };

    const noTeclado = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelar();
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Pessoas do WhatsApp</span>
                {lista.length > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-mint text-primaryDark">{lista.length}</span>
                )}
            </div>
            <div className="p-5">
                <p className="text-sm text-gray-600 mb-4">
                    O celular do cadastro continua recebendo aviso de pedido e boleto. Aqui ficam as pessoas que atendem o WhatsApp — a Ana usa o nome da última com quem falou.
                </p>

                {carregando && <p className="text-sm text-gray-500">Carregando contatos…</p>}
                {erro && (
                    <div className="text-sm text-gray-600">
                        Não foi possível carregar os contatos.
                        <button type="button" onClick={carregar} className="ml-2 text-primary font-semibold min-h-[44px]">Tentar de novo</button>
                    </div>
                )}

                {!carregando && !erro && lista.length === 0 && !mostrandoForm && (
                    <EstadoVazio
                        icon={Users}
                        titulo="Nenhuma pessoa anotada"
                        descricao="Quando a Ana souber o nome de quem atende, ele aparece aqui. Você também pode incluir agora."
                        acao={podeEditar ? { label: 'Adicionar pessoa', onClick: abrirNovo } : undefined}
                    />
                )}

                {!carregando && !erro && lista.length > 0 && (
                    <ul className="space-y-3 mb-4">
                        {lista.map((c) => {
                            const quando = formatarQuando(c.ultimoContatoEm);
                            return (
                                <li key={c.id} className="rounded-xl border border-gray-200 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-gray-900 truncate">{c.nome || 'Sem nome'}</span>
                                                {!c.nome && (
                                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Ainda sem nome</span>
                                                )}
                                                {c.papel && (
                                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-mint text-primaryDark">{c.papel}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">{formatarTelefone(c.telefone)}</p>
                                            {c.nota && <p className="text-sm text-gray-600 mt-1">{c.nota}</p>}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {quando ? `Última conversa em ${quando}` : 'A Ana ainda não registrou conversa com esta pessoa'}
                                            </p>
                                        </div>
                                        {podeEditar && (
                                            <div className="flex shrink-0 gap-1">
                                                <button type="button" onClick={() => abrirEdicao(c)} aria-label="Editar contato"
                                                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px]">
                                                    <Pencil className="h-4 w-4 mx-auto" />
                                                </button>
                                                <button type="button" onClick={() => apagar(c)} disabled={salvando} aria-label="Apagar contato"
                                                    className="p-2 text-gray-500 hover:text-red-700 rounded-full hover:bg-red-50 min-h-[44px] min-w-[44px] disabled:opacity-50">
                                                    <Trash2 className="h-4 w-4 mx-auto" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {apagandoId === c.id && (
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="text-sm text-gray-700">Apagar {c.nome || 'este contato'}? A Ana deixa de ver esse nome.</span>
                                            <button type="button" onClick={() => apagar(c)} disabled={salvando}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold min-h-[44px] disabled:opacity-50">
                                                {salvando ? 'Apagando…' : 'Apagar'}
                                            </button>
                                            <button type="button" onClick={() => setApagandoId(null)}
                                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium min-h-[44px]">
                                                Cancelar
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {podeEditar && !mostrandoForm && lista.length > 0 && !carregando && !erro && (
                    <button type="button" onClick={abrirNovo}
                        className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">
                        Adicionar pessoa
                    </button>
                )}

                {podeEditar && mostrandoForm && (
                    <form onSubmit={salvar} onKeyDown={noTeclado} className="border-t border-gray-100 pt-4 mt-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">
                            {editandoId ? 'Editar pessoa' : 'Nova pessoa'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="contato-nome">Nome</label>
                                <input id="contato-nome" ref={nomeRef} name="nome" autoFocus
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    placeholder="Quem atende"
                                    maxLength={120}
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="contato-telefone">WhatsApp</label>
                                <input id="contato-telefone" name="telefone" inputMode="numeric" autoComplete="tel"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    placeholder="47999998888"
                                    maxLength={16}
                                    value={form.telefone}
                                    onChange={(e) => setForm({ ...form, telefone: soDigitos(e.target.value).slice(0, 13) })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="contato-papel">Papel</label>
                                <input id="contato-papel" name="papel"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    placeholder="dona, gerente, compras…"
                                    maxLength={40}
                                    value={form.papel}
                                    onChange={(e) => setForm({ ...form, papel: e.target.value })}
                                />
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {PAPEIS.map((p) => (
                                        <button key={p} type="button" onClick={() => setForm({ ...form, papel: p })}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-full min-h-[36px] ${form.papel === p ? 'bg-primary text-white' : 'bg-mint text-primaryDark'}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="contato-nota">Nota</label>
                                <input id="contato-nota" name="nota"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-h-[44px]"
                                    placeholder="Prefere mensagem de manhã"
                                    maxLength={500}
                                    value={form.nota}
                                    onChange={(e) => setForm({ ...form, nota: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); salvar(e); } }}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4">
                            <button type="submit" disabled={salvando}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px] disabled:opacity-50">
                                {salvando ? 'Salvando…' : (editandoId ? 'Salvar contato' : 'Adicionar')}
                            </button>
                            <button type="button" onClick={cancelar}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-sm min-h-[44px]">
                                Cancelar
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
