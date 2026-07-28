import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, UserPlus, Search, Building, MapPin, Mail, Save, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import SelectBusca from '../../components/SelectBusca';
import ModalPontoGps from '../../components/ModalPontoGps';
import { mascaraDoc, normalizarDoc, validarDoc } from '../../utils/documento';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const CAMPOS_VAZIOS = {
    Nome: '',
    NomeFantasia: '',
    Inscricao_Estadual: '',
    Indicador_Inscricao_Estadual: '',
    Email: '',
    Telefone_Celular: '',
    Telefone: '',
    End_Logradouro: '',
    End_Numero: '',
    End_Complemento: '',
    End_Bairro: '',
    End_Cidade: '',
    End_Estado: 'SC',
    End_CEP: '',
    Observacoes_Gerais: ''
};

const SectionCard = ({ icon: Icon, title, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <Icon className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{title}</span>
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const Campo = ({ label, children, hint }) => (
    <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
        {children}
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
);

const inputCls = "block w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

const NovoCliente = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [documento, setDocumento] = useState('');
    const [perfil, setPerfil] = useState('CLIENTE'); // CLIENTE | FORNECEDOR | AMBOS
    const [form, setForm] = useState(CAMPOS_VAZIOS);
    const [idVendedor, setIdVendedor] = useState('');
    const [vendedores, setVendedores] = useState([]);
    const [consultando, setConsultando] = useState(false);
    const [consulta, setConsulta] = useState(null); // resultado da busca automática
    const [salvando, setSalvando] = useState(false);
    // Localização: ponto GPS no mapa OU cliente balcão (um dos dois)
    const [pontoGps, setPontoGps] = useState('');
    const [clienteBalcao, setClienteBalcao] = useState(false);
    const [showMapaGps, setShowMapaGps] = useState(false);
    const podeLiberarBalcao = !!(user?.permissoes?.admin || user?.permissoes?.Pode_Liberar_Cliente_Balcao);

    useEffect(() => {
        vendedorService.listarAtivos().then(setVendedores).catch(() => setVendedores([]));
    }, []);

    useEffect(() => {
        if (user?.id) setIdVendedor(v => v || user.id);
    }, [user]);

    const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

    const docNorm = normalizarDoc(documento);
    const docCompleto = docNorm.length === 11 || docNorm.length === 14;
    const docValido = docCompleto && validarDoc(docNorm);

    const buscarDados = async (doc) => {
        const cnpj = normalizarDoc(doc);
        if (cnpj.length !== 14) return; // busca automática só para CNPJ
        setConsultando(true);
        setConsulta(null);
        try {
            const r = await clienteService.consultarCnpj(cnpj);
            setConsulta(r);
            if (r.encontrado) {
                setForm(f => ({
                    ...f,
                    Nome: r.razaoSocial || f.Nome,
                    NomeFantasia: r.nomeFantasia || f.NomeFantasia,
                    Email: r.email || f.Email,
                    Telefone_Celular: (r.telefone || '').length === 11 ? r.telefone : f.Telefone_Celular,
                    Telefone: (r.telefone || '').length === 10 ? r.telefone : f.Telefone,
                    Inscricao_Estadual: r.inscricaoEstadual || f.Inscricao_Estadual,
                    Indicador_Inscricao_Estadual: r.indicadorIeSugerido || f.Indicador_Inscricao_Estadual,
                    End_Logradouro: r.endereco?.logradouro || f.End_Logradouro,
                    End_Numero: r.endereco?.numero || f.End_Numero,
                    End_Complemento: r.endereco?.complemento || f.End_Complemento,
                    End_Bairro: r.endereco?.bairro || f.End_Bairro,
                    End_Cidade: r.endereco?.cidade || f.End_Cidade,
                    End_Estado: r.endereco?.uf || f.End_Estado,
                    End_CEP: r.endereco?.cep || f.End_CEP
                }));
            }
        } catch (e) {
            setConsulta({ encontrado: false, erro: e.response?.data?.erro || 'Falha na consulta — preencha manualmente' });
        } finally {
            setConsultando(false);
        }
    };

    const handleDocumentoChange = (e) => {
        const novo = mascaraDoc(e.target.value);
        setDocumento(novo);
        const norm = normalizarDoc(novo);
        // Busca automática assim que o CNPJ fica completo e válido
        if (norm.length === 14 && validarDoc(norm) && !consultando) {
            buscarDados(norm);
        }
    };

    const handleSalvar = async () => {
        const erros = [];
        if (!docNorm) erros.push('Informe o CNPJ ou CPF');
        else if (!docValido) erros.push('CNPJ/CPF inválido (confira os dígitos)');
        if (!form.Nome.trim()) erros.push('Informe a razão social / nome');
        const ie = form.Inscricao_Estadual.replace(/\D/g, '');
        if (ie && form.End_Estado === 'SC' && ie.length !== 9) erros.push('Inscrição Estadual de SC deve ter 9 dígitos');
        if (erros.length) {
            alert('Corrija antes de salvar:\n• ' + erros.join('\n• '));
            return;
        }
        setSalvando(true);
        try {
            const criado = await clienteService.criar({
                ...form,
                perfil,
                Documento: docNorm,
                Inscricao_Estadual: ie,
                idVendedor: idVendedor || undefined,
                Ponto_GPS: pontoGps || undefined,
                clienteBalcao: clienteBalcao || undefined
            });
            if (perfil === 'FORNECEDOR') {
                alert('Fornecedor cadastrado com sucesso! Ele já aparece no Contas a Pagar e nas Notas de Entrada.');
                navigate('/fornecedores');
                return;
            }
            alert(`${perfil === 'AMBOS' ? 'Cliente + Fornecedor cadastrado' : 'Cliente cadastrado'} com sucesso! Código ${criado.Codigo}.`);
            navigate(`/clientes/${criado.UUID}`);
        } catch (e) {
            const resp = e.response?.data;
            if (resp?.clienteExistente) {
                if (window.confirm(`${resp.error}.\n\nAbrir o cadastro existente?`)) {
                    navigate(`/clientes/${resp.clienteExistente.UUID}`);
                }
            } else {
                alert('Erro ao cadastrar: ' + (resp?.error || e.message));
            }
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 pb-24">
            <button onClick={() => navigate('/clientes')} className="mb-4 flex items-center text-gray-600 hover:text-gray-900 min-h-[44px]">
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
            </button>

            <div className="flex items-center gap-2 mb-4">
                <div className="bg-mint p-1.5 md:p-2 rounded-lg">
                    <UserPlus className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <h1 className="text-base md:text-2xl font-bold text-gray-900">Novo Cadastro</h1>
            </div>

            {/* Tipo de cadastro: cliente, fornecedor ou os dois */}
            <div className="mb-4">
                <span className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Este cadastro é de:</span>
                <div className="flex flex-wrap gap-2">
                    {[
                        { valor: 'CLIENTE', rotulo: 'Cliente' },
                        { valor: 'FORNECEDOR', rotulo: 'Fornecedor' },
                        { valor: 'AMBOS', rotulo: 'Cliente + Fornecedor' }
                    ].map(op => (
                        <button
                            key={op.valor}
                            type="button"
                            onClick={() => setPerfil(op.valor)}
                            className={`px-4 py-2 text-sm font-semibold rounded-full border transition-colors min-h-[40px] ${perfil === op.valor
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        >
                            {op.rotulo}
                        </button>
                    ))}
                </div>
                {perfil !== 'CLIENTE' && (
                    <p className="text-xs text-gray-500 mt-1.5">
                        {perfil === 'FORNECEDOR'
                            ? 'Vai para a lista de Fornecedores (Contas a Pagar / Notas de Entrada) — não aparece como cliente.'
                            : 'Entra como cliente e também na lista de Fornecedores (Contas a Pagar / Notas de Entrada).'}
                    </p>
                )}
            </div>

            <div className="space-y-4">
                {/* ─── CNPJ / BUSCA AUTOMÁTICA ─── */}
                <SectionCard icon={Search} title="CNPJ / CPF">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            inputMode="text"
                            autoFocus
                            className={`${inputCls} flex-1 text-base font-mono`}
                            placeholder="Digite o CNPJ (ou CPF)..."
                            value={documento}
                            onChange={handleDocumentoChange}
                        />
                        <button
                            type="button"
                            onClick={() => buscarDados(documento)}
                            disabled={consultando || docNorm.length !== 14}
                            className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                        >
                            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            {consultando ? 'Consultando...' : 'Buscar dados'}
                        </button>
                    </div>
                    {docCompleto && !docValido && (
                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Documento inválido — confira os dígitos.</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                        Ao digitar um CNPJ completo, os dados da Receita Federal e a Inscrição Estadual (SEFAZ) são preenchidos automaticamente. Tudo pode ser editado antes de salvar.
                    </p>

                    {consulta && (
                        consulta.encontrado ? (
                            <div className="mt-3 p-3 rounded-lg bg-mint/50 border border-primary/20 text-sm">
                                <p className="flex items-center gap-1.5 font-semibold text-primaryDark">
                                    <CheckCircle className="h-4 w-4" /> Dados encontrados ({consulta.fonte})
                                    {consulta.situacao && (
                                        <span className={`ml-1 px-2 py-0.5 text-xs font-semibold rounded-full ${consulta.ativa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                                            {consulta.situacao}
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                    {consulta.inscricaoEstadual
                                        ? `Inscrição Estadual encontrada na SEFAZ: ${consulta.inscricaoEstadual}`
                                        : (consulta.ieConsulta?.ok
                                            ? 'SEFAZ: CNPJ sem Inscrição Estadual (não contribuinte).'
                                            : `Não foi possível consultar a IE automaticamente${consulta.ieConsulta?.motivo ? ` (${consulta.ieConsulta.motivo})` : ''} — confira e preencha abaixo.`)}
                                </p>
                            </div>
                        ) : (
                            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{consulta.erro || 'CNPJ não encontrado — preencha os dados manualmente.'}</span>
                            </div>
                        )
                    )}
                </SectionCard>

                {/* ─── IDENTIFICAÇÃO ─── */}
                <SectionCard icon={Building} title="Identificação">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Razão Social / Nome *">
                            <input type="text" className={inputCls} value={form.Nome} onChange={(e) => set('Nome', e.target.value)} />
                        </Campo>
                        <Campo label="Nome Fantasia">
                            <input type="text" className={inputCls} value={form.NomeFantasia} onChange={(e) => set('NomeFantasia', e.target.value)} />
                        </Campo>
                        <Campo label="Inscrição Estadual" hint={form.End_Estado === 'SC' ? '9 dígitos (SC). Vazio = sem IE.' : 'Só números. Vazio = sem IE.'}>
                            <input type="text" inputMode="numeric" maxLength={14} className={inputCls}
                                value={form.Inscricao_Estadual}
                                onChange={(e) => set('Inscricao_Estadual', e.target.value.replace(/\D/g, ''))} />
                        </Campo>
                        <Campo label="Indicador de IE">
                            <SelectBusca className="w-full" value={form.Indicador_Inscricao_Estadual}
                                onChange={(e) => set('Indicador_Inscricao_Estadual', e.target.value)}>
                                <option value="">— Selecionar —</option>
                                <option value="CONTRIBUINTE">Contribuinte</option>
                                <option value="CONTRIBUINTE_ISENTO">Contribuinte Isento</option>
                                <option value="NAO_CONTRIBUINTE">Não Contribuinte</option>
                            </SelectBusca>
                        </Campo>
                        {perfil !== 'FORNECEDOR' && (
                            <Campo label="Vendedor Responsável">
                                <SelectBusca className="w-full" value={idVendedor} onChange={(e) => setIdVendedor(e.target.value)}>
                                    <option value="">— Sem vendedor —</option>
                                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                </SelectBusca>
                            </Campo>
                        )}
                    </div>
                </SectionCard>

                {/* ─── CONTATO ─── */}
                <SectionCard icon={Mail} title="Contato">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Campo label="E-mail">
                            <input type="email" className={inputCls} placeholder="cliente@email.com" value={form.Email} onChange={(e) => set('Email', e.target.value)} />
                        </Campo>
                        <Campo label="Celular / WhatsApp" hint="Com DDD, só números.">
                            <input type="tel" inputMode="numeric" maxLength={11} className={inputCls} placeholder="47999998888"
                                value={form.Telefone_Celular} onChange={(e) => set('Telefone_Celular', e.target.value.replace(/\D/g, ''))} />
                        </Campo>
                        <Campo label="Telefone Fixo">
                            <input type="tel" inputMode="numeric" maxLength={10} className={inputCls} placeholder="4733334444"
                                value={form.Telefone} onChange={(e) => set('Telefone', e.target.value.replace(/\D/g, ''))} />
                        </Campo>
                    </div>
                </SectionCard>

                {/* ─── ENDEREÇO ─── */}
                <SectionCard icon={MapPin} title="Endereço">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div className="md:col-span-4">
                            <Campo label="Logradouro">
                                <input type="text" className={inputCls} placeholder="Rua / Avenida..." value={form.End_Logradouro} onChange={(e) => set('End_Logradouro', e.target.value)} />
                            </Campo>
                        </div>
                        <div className="md:col-span-2">
                            <Campo label="Número">
                                <input type="text" className={inputCls} value={form.End_Numero} onChange={(e) => set('End_Numero', e.target.value)} />
                            </Campo>
                        </div>
                        <div className="md:col-span-3">
                            <Campo label="Complemento">
                                <input type="text" className={inputCls} value={form.End_Complemento} onChange={(e) => set('End_Complemento', e.target.value)} />
                            </Campo>
                        </div>
                        <div className="md:col-span-3">
                            <Campo label="Bairro">
                                <input type="text" className={inputCls} value={form.End_Bairro} onChange={(e) => set('End_Bairro', e.target.value)} />
                            </Campo>
                        </div>
                        <div className="md:col-span-3">
                            <Campo label="Cidade">
                                <input type="text" className={inputCls} value={form.End_Cidade} onChange={(e) => set('End_Cidade', e.target.value)} />
                            </Campo>
                        </div>
                        <div className="md:col-span-1">
                            <Campo label="UF">
                                <SelectBusca className="w-full" value={form.End_Estado} onChange={(e) => set('End_Estado', e.target.value)}>
                                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                </SelectBusca>
                            </Campo>
                        </div>
                        <div className="md:col-span-2">
                            <Campo label="CEP" hint="Só números.">
                                <input type="text" inputMode="numeric" maxLength={8} className={inputCls} placeholder="89200000"
                                    value={form.End_CEP} onChange={(e) => set('End_CEP', e.target.value.replace(/\D/g, ''))} />
                            </Campo>
                        </div>
                    </div>
                    <p className="text-xs text-amber-600 mt-3 flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        Endereço completo (logradouro, número, bairro, cidade, UF e CEP) é obrigatório para emitir Nota Fiscal para este cliente.
                    </p>
                </SectionCard>

                {/* ─── LOCALIZAÇÃO: ponto GPS OU cliente balcão ─── */}
                {perfil !== 'FORNECEDOR' && (
                    <SectionCard icon={MapPin} title="Localização do cliente">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <input type="text" readOnly
                                    className="block w-full border border-gray-200 rounded-lg p-2.5 bg-gray-50 text-gray-700 font-mono text-sm"
                                    placeholder="Sem ponto definido"
                                    value={clienteBalcao ? '' : pontoGps}
                                    disabled={clienteBalcao}
                                />
                                <button type="button" onClick={() => setShowMapaGps(true)} disabled={clienteBalcao}
                                    className="px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40">
                                    <MapPin className="h-4 w-4" /> Definir no mapa
                                </button>
                            </div>
                            <div className="text-center text-[11px] font-bold text-gray-400 uppercase">— ou —</div>
                            <div className="flex items-start gap-2">
                                <input
                                    type="checkbox"
                                    id="chkBalcaoNovo"
                                    checked={clienteBalcao}
                                    disabled={!podeLiberarBalcao}
                                    onChange={(e) => { setClienteBalcao(e.target.checked); if (e.target.checked) setPontoGps(''); }}
                                    className="h-4 w-4 mt-0.5 rounded text-primary focus:ring-primary"
                                />
                                <label htmlFor="chkBalcaoNovo" className={`text-sm ${podeLiberarBalcao ? 'text-gray-700' : 'text-gray-400'}`}>
                                    🏪 <b>Cliente Balcão</b> — compra e retira na empresa (vende sem exigir ponto GPS)
                                    {!podeLiberarBalcao && <span className="block text-[11px]">Só quem tem a permissão "Liberar Cliente Balcão" pode marcar.</span>}
                                </label>
                            </div>
                            <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                Sem ponto GPS (e sem ser balcão) o cliente não conseguirá receber pedidos quando o bloqueio de envio estiver ligado.
                            </p>
                        </div>
                    </SectionCard>
                )}

                {/* ─── OBSERVAÇÕES ─── */}
                <SectionCard icon={Building} title="Observações">
                    <textarea rows={3} className={`${inputCls} resize-none`} placeholder="Observações sobre o cliente..."
                        value={form.Observacoes_Gerais} onChange={(e) => set('Observacoes_Gerais', e.target.value)} />
                </SectionCard>
            </div>

            {/* ─── BARRA DE AÇÕES ─── */}
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg px-4 sm:px-6 py-3 flex justify-end gap-3">
                <button onClick={() => navigate('/clientes')}
                    className="px-5 py-2.5 rounded-full border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 min-h-[44px]">
                    <X className="h-4 w-4" /> Cancelar
                </button>
                <button onClick={handleSalvar} disabled={salvando}
                    className="px-7 py-2.5 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50 min-h-[44px]">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {salvando ? 'Salvando...' : (perfil === 'FORNECEDOR' ? 'Cadastrar Fornecedor' : perfil === 'AMBOS' ? 'Cadastrar Cliente + Fornecedor' : 'Cadastrar Cliente')}
                </button>
            </div>

            <ModalPontoGps
                aberto={showMapaGps}
                onFechar={() => setShowMapaGps(false)}
                clienteNome={form.NomeFantasia || form.Nome || 'Novo cliente'}
                pontoAtual={pontoGps || null}
                origem="CADASTRO"
                onEscolher={(ponto) => setPontoGps(ponto)}
            />
        </div>
    );
};

export default NovoCliente;
