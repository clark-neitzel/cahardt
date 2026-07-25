import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, UserPlus, Link2, Loader2, CheckCircle } from 'lucide-react';
import clienteService from '../../../services/clienteService';
import vendedorService from '../../../services/vendedorService';
import toast from 'react-hot-toast';

// Modal de 2 passos: busca a pessoa no cadastro de clientes (futuro cadastro de pessoas)
// e cria o usuário (modo 'criar') ou vincula um usuário existente ao cadastro (modo 'vincular').
// Desde 25/07/2026 o usuário nasce daqui — o sync de vendedores com o Conta Azul foi desligado.
const NovoUsuarioModal = ({ modo = 'criar', vendedor = null, onClose, onDone }) => {
    const navigate = useNavigate();
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [pessoa, setPessoa] = useState(null); // cadastro selecionado
    const [form, setForm] = useState({ nome: '', email: '', telefone: '', login: '', senha: '' });
    const [salvando, setSalvando] = useState(false);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    // Busca com debounce no cadastro (mesma base da tela de clientes)
    useEffect(() => {
        clearTimeout(debounceRef.current);
        const termo = busca.trim();
        if (termo.length < 2) { setResultados([]); setBuscando(false); return; }
        setBuscando(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const r = await clienteService.buscarGlobal(termo, 15);
                setResultados(r.data || []);
            } catch {
                setResultados([]);
            } finally {
                setBuscando(false);
            }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [busca]);

    const formatarDoc = (doc) => {
        if (!doc) return 'Sem documento';
        const d = String(doc);
        if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
        if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
        return d;
    };

    const selecionar = async (c) => {
        if (modo === 'vincular') {
            // Vincula direto: um clique a menos para o usuário
            setSalvando(true);
            try {
                await vendedorService.atualizar(vendedor.id, { clienteUuid: c.UUID });
                toast.success(`${vendedor.nome} vinculado ao cadastro de ${c.Nome}`);
                onDone?.();
            } catch (e) {
                toast.error(e.response?.data?.error || 'Erro ao vincular cadastro');
            } finally {
                setSalvando(false);
            }
            return;
        }
        setPessoa(c);
        setForm({
            nome: c.Nome || '',
            email: c.Email || '',
            telefone: c.Telefone_Celular || c.Telefone || '',
            login: (c.Nome || '').split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
            senha: ''
        });
    };

    const criar = async () => {
        const erros = [];
        if (!form.nome.trim()) erros.push('Informe o nome completo');
        if (!form.login.trim()) erros.push('Informe o login');
        if (!form.senha.trim() || form.senha.trim().length < 4) erros.push('Senha com pelo menos 4 caracteres');
        if (erros.length) { toast.error(erros.join(' · ')); return; }
        setSalvando(true);
        try {
            const criado = await vendedorService.criar({
                nome: form.nome.trim(),
                email: form.email.trim() || null,
                telefone: form.telefone.trim() || null,
                login: form.login.trim(),
                senha: form.senha,
                clienteUuid: pessoa?.UUID || null
            });
            toast.success(`Usuário ${criado.nome} criado! Agora defina as permissões.`);
            onDone?.(criado);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar usuário');
        } finally {
            setSalvando(false);
        }
    };

    const inputCls = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";
    const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1";

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-8 md:pt-16 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        {modo === 'vincular' ? <Link2 className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
                        <div>
                            <h2 className="text-base font-bold text-gray-900">{modo === 'vincular' ? 'Vincular ao cadastro' : 'Novo Usuário'}</h2>
                            <p className="text-xs text-gray-500">
                                {modo === 'vincular'
                                    ? `Escolha o cadastro de ${vendedor?.nome}`
                                    : (pessoa ? 'Confira os dados e defina o acesso' : 'Busque a pessoa no cadastro — o mesmo dos clientes')}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                {/* Passo 1 — buscar no cadastro */}
                {!pessoa && (
                    <div className="p-5">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Nome, documento ou código…"
                                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>

                        <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                            {buscando ? (
                                <div className="p-4 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                                </div>
                            ) : busca.trim().length < 2 ? (
                                <div className="p-4 text-center text-sm text-gray-400">Digite pelo menos 2 letras para buscar.</div>
                            ) : resultados.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-500">Ninguém encontrado com “{busca.trim()}”.</div>
                            ) : resultados.map(c => (
                                <button
                                    key={c.UUID}
                                    onClick={() => selecionar(c)}
                                    disabled={salvando}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-b-0 hover:bg-mint/30 disabled:opacity-50 min-h-[44px]"
                                >
                                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-mint text-primaryDark flex items-center justify-center text-xs font-bold">
                                        {(c.Nome || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{c.Nome}</div>
                                        <div className="text-xs text-gray-500 truncate">
                                            {formatarDoc(c.Documento)}{c.End_Cidade ? ` · ${c.End_Cidade}${c.End_Estado ? ` · ${c.End_Estado}` : ''}` : ''}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-secondary/60 border-t border-gray-100">
                                <span className="text-xs text-gray-500">Não achou a pessoa?</span>
                                <button
                                    onClick={() => navigate('/clientes/novo')}
                                    className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs whitespace-nowrap"
                                >
                                    Cadastrar nova pessoa
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Passo 2 — dados de acesso (só no modo criar) */}
                {pessoa && (
                    <div className="p-5">
                        <div className="flex items-center gap-3 bg-mint rounded-xl px-4 py-3 mb-4">
                            <CheckCircle className="h-4 w-4 text-primaryDark flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-primaryDark truncate">{pessoa.Nome}</div>
                                <div className="text-xs text-primaryDark/70 truncate">{formatarDoc(pessoa.Documento)}</div>
                            </div>
                            <button onClick={() => setPessoa(null)} className="px-3 py-1 bg-white text-primary text-xs font-semibold rounded-full flex-shrink-0">Trocar</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className={labelCls}>Nome completo *</label>
                                <input className={inputCls} value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} />
                            </div>
                            <div>
                                <label className={labelCls}>E-mail <span className="normal-case font-medium text-gray-400">(do cadastro)</span></label>
                                <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div>
                                <label className={labelCls}>Telefone <span className="normal-case font-medium text-gray-400">(do cadastro)</span></label>
                                <input className={inputCls} type="tel" value={form.telefone} onChange={(e) => setForm(f => ({ ...f, telefone: e.target.value }))} />
                            </div>
                            <div>
                                <label className={labelCls}>Login *</label>
                                <input className={inputCls} autoCapitalize="none" value={form.login} onChange={(e) => setForm(f => ({ ...f, login: e.target.value }))} />
                            </div>
                            <div>
                                <label className={labelCls}>Senha *</label>
                                <input className={inputCls} type="password" placeholder="Mínimo 4 caracteres" value={form.senha} onChange={(e) => setForm(f => ({ ...f, senha: e.target.value }))} />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3">As permissões são definidas no próximo passo — o painel abre sozinho após criar.</p>
                    </div>
                )}

                {/* Rodapé */}
                <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm min-h-[44px]">Cancelar</button>
                    {modo === 'criar' && (
                        <button
                            onClick={criar}
                            disabled={!pessoa || salvando}
                            className="px-5 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
                        >
                            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                            {salvando ? 'Criando…' : 'Criar usuário'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NovoUsuarioModal;
