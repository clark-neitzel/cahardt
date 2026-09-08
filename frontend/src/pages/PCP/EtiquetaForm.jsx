import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import produtoService from '../../services/produtoService';
import { ALERGENOS_LISTA } from './EtiquetaLabel';
import SelectBusca from '../../components/SelectBusca';

const VAZIO = {
    produtoId: '',
    codigoProduto: '',
    nomeProduto: '',
    pesoUnitario: '',
    pesoTabelaNutricional: '',
    valorEnergetico: '',
    carboidratos: '',
    acucaresTotais: '',
    acucaresAdicionados: '',
    proteinas: '',
    gordurasTotais: '',
    gordurasSaturadas: '',
    gordurasTrans: '',
    fibraAlimentar: '',
    sodio: '',
    quantidadeEmbalagem: '',
    quantidadeAproximada: false,
    pesoPacote: '',   // texto em KG na tela (ex.: "1,350"); vai p/ a API em GRAMAS inteiras
    composicao: '',
    modoPreparo: '',
    codigoBarras: '',
    contemLeite: false,
    contemGluten: false,
    contemLactose: false,
    contemOvo: false,
    alergenos: [],
    especieCrustaceos: '',
    especiePeixes: '',
    outrosAlergenos: '',
    avisosRotulo: '',
    armazenamento: '',
    validadeDias: 90,
    ativo: true,
    tipoProduto: '',
    tarjaPreta: false,
};

// Limites do campo (em GRAMAS inteiras, que é como a API guarda).
// 999.999 kg = 999999 g — cabe folgado no INT4 do banco (teto ~2,1 bilhões).
const PESO_PACOTE_MIN_G = 1;         // 0,001 kg
const PESO_PACOTE_MAX_G = 999999;    // 999,999 kg

// Valida o "Peso do pacote (kg)" digitado na tela.
// Devolve { ok, gramas, erro }:
//   - campo VAZIO  → { ok: true, gramas: null }  ← ÚNICO jeito de limpar o peso gravado
//   - valor válido → { ok: true, gramas: <inteiro em g> }
//   - qualquer outra coisa → { ok: false, erro: '<mensagem para o usuário>' }
// NENHUM valor digitado pode virar null/0: se não dá para gravar exatamente o que foi
// digitado, a gente RECUSA com mensagem (nunca arredonda nem apaga calado).
function validarPesoPacote(txt) {
    const s = String(txt ?? '').trim();
    if (s === '') return { ok: true, gramas: null, erro: '' };

    // Só "123" ou "123,456" / "123.456" — recusa negativo, "abc", "1.350,5", "1e3", "1,".
    if (!/^\d+(?:[.,]\d+)?$/.test(s)) {
        return { ok: false, gramas: null, erro: 'Peso do pacote inválido. Digite em kg, ex.: 1,350.' };
    }

    const normalizado = s.replace(',', '.');
    const n = Number(normalizado);
    if (!Number.isFinite(n)) {
        return { ok: false, gramas: null, erro: 'Peso do pacote inválido. Digite em kg, ex.: 1,350.' };
    }

    const gramas = Math.round(n * 1000);
    if (gramas < PESO_PACOTE_MIN_G) {
        return { ok: false, gramas: null, erro: 'Peso do pacote deve ser no mínimo 0,001 kg.' };
    }
    if (gramas > PESO_PACOTE_MAX_G) {
        return { ok: false, gramas: null, erro: 'Peso do pacote deve ser no máximo 999,999 kg.' };
    }

    // Mais de 3 casas SIGNIFICATIVAS não cabe em gramas inteiras — recusar em vez de arredondar.
    // Zero à direita não conta: "1,3500" e "1,35" são o mesmo peso, os dois viram 1350 g.
    // Já "1,3505" tem dígito de verdade na 4ª casa e continua recusado.
    const casas = (normalizado.split('.')[1] || '').replace(/0+$/, '').length;
    if (casas > 3) {
        return { ok: false, gramas: null, erro: 'Peso do pacote: use no máximo 3 casas decimais (ex.: 1,350).' };
    }

    return { ok: true, gramas, erro: '' };
}

// 1350 (gramas vindas da API) → "1,350" para preencher o campo. Sem valor → ''.
function gramasParaKgTexto(g) {
    const n = Number(g);
    if (!Number.isFinite(n) || n <= 0) return '';
    return (n / 1000).toFixed(3).replace('.', ',');
}

function Campo({ label, required, children }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const textareaCls = `${inputCls} resize-none`;

export default function EtiquetaForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const editando = Boolean(id);

    const [form, setForm] = useState(VAZIO);
    const [produtos, setProdutos] = useState([]);
    const [etiquetasExistentes, setEtiquetasExistentes] = useState([]);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        produtoService.listar({ ativo: true, limit: 2000, page: 1 }).then(r => {
            // endpoint retorna { data: [...], meta: {...} }
            const arr = Array.isArray(r) ? r : (r?.data || r?.produtos || r?.itens || []);
            setProdutos(arr.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true })));
        }).catch(() => {});
        // Carrega etiquetas existentes para mostrar quantas estão vinculadas por produto
        etiquetaService.listar({}).then(lista => setEtiquetasExistentes(Array.isArray(lista) ? lista : [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!editando) return;
        etiquetaService.buscar(id).then(et => {
            setForm({
                ...VAZIO,
                ...et,
                produtoId:    et.produtoId    ?? '',
                alergenos:    Array.isArray(et.alergenos) ? et.alergenos : [],
                especieCrustaceos: et.especieCrustaceos ?? '',
                especiePeixes:     et.especiePeixes     ?? '',
                outrosAlergenos: et.outrosAlergenos ?? '',
                avisosRotulo:    et.avisosRotulo    ?? '',
                armazenamento:   et.armazenamento   ?? '',
                tipoProduto:     et.tipoProduto     ?? '',
                codigoBarras:    et.codigoBarras    ?? '',
                pesoPacote:      gramasParaKgTexto(et.pesoPacote),
            });
        }).catch(err => { toast.error(err.message); navigate('/pcp/etiquetas/dados'); });
    }, [id, editando, navigate]);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    // Avaliação ao vivo do peso do pacote (texto de ajuda + aviso vermelho abaixo do campo)
    const pesoPacote = validarPesoPacote(form.pesoPacote);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.codigoProduto.trim()) return toast.error('Código é obrigatório.');
        if (!form.nomeProduto.trim())   return toast.error('Nome é obrigatório.');
        if (!form.composicao.trim())    return toast.error('Composição é obrigatória.');
        if (!form.modoPreparo.trim())   return toast.error('Modo de preparo é obrigatório.');
        // Peso do pacote: recusa ANTES de chamar a API (nada digitado pode apagar o peso salvo)
        const peso = validarPesoPacote(form.pesoPacote);   // mesma regra do aviso ao vivo abaixo do campo
        if (!peso.ok) return toast.error(peso.erro);

        setSalvando(true);
        try {
            // pesoPacote vai para a API em GRAMAS inteiras (1,350 kg → 1350); só o campo VAZIO manda null
            const payload = { ...form, produtoId: form.produtoId || null, pesoPacote: peso.gramas };
            if (editando) {
                await etiquetaService.atualizar(id, payload);
                toast.success('Etiqueta atualizada!');
            } else {
                await etiquetaService.criar(payload);
                toast.success('Etiqueta criada!');
            }
            navigate('/pcp/etiquetas/dados');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="w-full px-4 py-6">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate('/pcp/etiquetas/dados')} className="p-2 rounded-lg hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {editando ? 'Editar Etiqueta' : 'Nova Etiqueta'}
                    </h1>
                    <p className="text-sm text-gray-500">Preencha os dados do rótulo do produto</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Identificação */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Identificação</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Código do Produto" required>
                            <input type="text" value={form.codigoProduto} onChange={e => set('codigoProduto', e.target.value)} className={inputCls} placeholder="Ex: 3082" />
                        </Campo>
                        <Campo label="Nome do Produto" required>
                            <input type="text" value={form.nomeProduto} onChange={e => set('nomeProduto', e.target.value)} className={inputCls} placeholder="Ex: MINI BOLINHA QUEIJO" />
                        </Campo>
                        <Campo label="Peso Unitário (g)" required>
                            <input type="number" min="1" value={form.pesoUnitario} onChange={e => set('pesoUnitario', e.target.value)} className={inputCls} placeholder="Ex: 28" />
                        </Campo>
                        <Campo label="Peso Tabela Nutricional / Porção (g)" required>
                            <input type="number" min="1" value={form.pesoTabelaNutricional} onChange={e => set('pesoTabelaNutricional', e.target.value)} className={inputCls} placeholder="Ex: 28" />
                        </Campo>
                        <Campo label="Quantidade por Embalagem" required>
                            <div className="flex items-center gap-3">
                                <input type="number" min="1" value={form.quantidadeEmbalagem} onChange={e => set('quantidadeEmbalagem', e.target.value)} className={inputCls} placeholder="Ex: 50" />
                                <label className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer text-sm text-gray-700 select-none">
                                    <input
                                        type="checkbox"
                                        checked={form.quantidadeAproximada}
                                        onChange={e => set('quantidadeAproximada', e.target.checked)}
                                        className="w-4 h-4 rounded accent-indigo-600"
                                    />
                                    Qtd. aproximada (~)
                                </label>
                            </div>
                        </Campo>
                        <Campo label="Peso do pacote (kg)">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={form.pesoPacote}
                                onChange={e => set('pesoPacote', e.target.value)}
                                className={pesoPacote.ok ? inputCls : `${inputCls} border-red-400 focus:ring-red-400`}
                                placeholder="ex.: 1,350 — até 3 casas"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Valor fixo impresso como <strong>PESO LÍQUIDO</strong>
                                {pesoPacote.gramas != null
                                    ? <> — sai <strong>{gramasParaKgTexto(pesoPacote.gramas)} kg</strong> na etiqueta.</>
                                    : ' — digite em kg com até 3 casas (ex.: 1,350), de 0,001 a 999,999. Em branco, a etiqueta segue calculando quantidade × peso unitário.'}
                            </p>
                            {!pesoPacote.ok && (
                                <p className="mt-1 text-xs font-medium text-red-600">{pesoPacote.erro}</p>
                            )}
                        </Campo>
                        <Campo label="Código de Barras (EAN)">
                            <input type="text" value={form.codigoBarras} onChange={e => set('codigoBarras', e.target.value)} className={inputCls} placeholder="Ex: 7898620330460" />
                        </Campo>
                        <Campo label="Tipo de Produto">
                            <input type="text" value={form.tipoProduto} onChange={e => set('tipoProduto', e.target.value)} className={inputCls} placeholder="Ex: Mini - Fritar" />
                        </Campo>
                        <Campo label="Validade (dias)">
                            <input type="number" min="1" value={form.validadeDias} onChange={e => set('validadeDias', e.target.value)} className={inputCls} />
                        </Campo>
                        <Campo label="Nome do produto na etiqueta">
                            <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                                <input
                                    type="checkbox"
                                    checked={form.tarjaPreta}
                                    onChange={e => set('tarjaPreta', e.target.checked)}
                                    className="w-4 h-4 rounded accent-gray-900"
                                />
                                <span className="text-sm text-gray-700">Tarja preta no nome</span>
                                {form.tarjaPreta && (
                                    <span className="px-2 py-0.5 bg-black text-white text-xs font-bold rounded">NOME DO PRODUTO</span>
                                )}
                            </label>
                        </Campo>
                    </div>
                    <div className="mt-4">
                        <Campo label="Vincular ao Produto do Catálogo (opcional)">
                            {produtos.length === 0 ? (
                                <div className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-400 bg-gray-50">
                                    Carregando produtos...
                                </div>
                            ) : (
                                <SelectBusca value={form.produtoId} onChange={e => set('produtoId', e.target.value)} className="w-full">
                                    <option value="">— Nenhum —</option>
                                    {(() => {
                                        const semEtiqueta = produtos.filter(p =>
                                            !etiquetasExistentes.some(e => e.produtoId === p.id && e.id !== id)
                                        );
                                        const comEtiqueta = produtos.filter(p =>
                                            etiquetasExistentes.some(e => e.produtoId === p.id && e.id !== id)
                                        );
                                        return (
                                            <>
                                                {semEtiqueta.length > 0 && (
                                                    <optgroup label="Sem etiqueta vinculada">
                                                        {semEtiqueta.map(p => (
                                                            <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {comEtiqueta.length > 0 && (
                                                    <optgroup label="Já tem etiqueta (pode adicionar outra)">
                                                        {comEtiqueta.map(p => {
                                                            const n = etiquetasExistentes.filter(e => e.produtoId === p.id && e.id !== id).length;
                                                            return (
                                                                <option key={p.id} value={p.id}>{p.codigo} — {p.nome} ({n} etiqueta{n > 1 ? 's' : ''})</option>
                                                            );
                                                        })}
                                                    </optgroup>
                                                )}
                                            </>
                                        );
                                    })()}
                                </SelectBusca>
                            )}
                            <p className="text-xs text-gray-400 mt-1">Um produto pode ter múltiplas etiquetas (ex: versão 22g e 28g)</p>
                        </Campo>
                    </div>
                </section>

                {/* Informação Nutricional */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Informação Nutricional</h2>
                    <p className="text-xs text-gray-400 mb-4">Preencha o valor da <b>porção</b> com unidade e %VD, ex: <span className="font-mono">34kcal (2% VD)</span>. A coluna "100g" é calculada automaticamente.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Valor Energético"><input type="text" value={form.valorEnergetico} onChange={e => set('valorEnergetico', e.target.value)} className={inputCls} placeholder="34kcal (2% VD)" /></Campo>
                        <Campo label="Carboidratos totais"><input type="text" value={form.carboidratos} onChange={e => set('carboidratos', e.target.value)} className={inputCls} placeholder="5,7g (2% VD)" /></Campo>
                        <Campo label="Açúcares totais"><input type="text" value={form.acucaresTotais} onChange={e => set('acucaresTotais', e.target.value)} className={inputCls} placeholder="0g (0% VD)" /></Campo>
                        <Campo label="Açúcares adicionados"><input type="text" value={form.acucaresAdicionados} onChange={e => set('acucaresAdicionados', e.target.value)} className={inputCls} placeholder="0g (0% VD)" /></Campo>
                        <Campo label="Proteínas"><input type="text" value={form.proteinas} onChange={e => set('proteinas', e.target.value)} className={inputCls} placeholder="0,9g (1% VD)" /></Campo>
                        <Campo label="Gorduras Totais"><input type="text" value={form.gordurasTotais} onChange={e => set('gordurasTotais', e.target.value)} className={inputCls} placeholder="0,8g (1% VD)" /></Campo>
                        <Campo label="Gorduras Saturadas"><input type="text" value={form.gordurasSaturadas} onChange={e => set('gordurasSaturadas', e.target.value)} className={inputCls} placeholder="0,3g (2% VD)" /></Campo>
                        <Campo label="Gorduras Trans"><input type="text" value={form.gordurasTrans} onChange={e => set('gordurasTrans', e.target.value)} className={inputCls} placeholder="0g (0% VD)" /></Campo>
                        <Campo label="Fibra Alimentar"><input type="text" value={form.fibraAlimentar} onChange={e => set('fibraAlimentar', e.target.value)} className={inputCls} placeholder="0,4g (2% VD)" /></Campo>
                        <Campo label="Sódio"><input type="text" value={form.sodio} onChange={e => set('sodio', e.target.value)} className={inputCls} placeholder="147mg (6% VD)" /></Campo>
                    </div>
                </section>

                {/* Composição e Preparo */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Composição e Preparo</h2>
                    <div className="space-y-4">
                        <Campo label="Composição / Ingredientes" required>
                            <textarea rows={4} value={form.composicao} onChange={e => set('composicao', e.target.value)} className={textareaCls} placeholder="Água, Farinha de Trigo, Queijo mussarela..." />
                        </Campo>
                        <Campo label="Modo de Preparo" required>
                            <textarea rows={4} value={form.modoPreparo} onChange={e => set('modoPreparo', e.target.value)} className={textareaCls} placeholder="Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos..." />
                        </Campo>
                        <Campo label="Armazenamento / Conservação">
                            <input type="text" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)} className={inputCls} placeholder="Congelar -12ºC. Após descongelado, não recongelar." />
                        </Campo>
                    </div>
                </section>

                {/* Glúten / Lactose / Alérgenos */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Glúten, Lactose e Alérgenos</h2>

                    {/* Glúten e Lactose */}
                    <div className="flex flex-wrap gap-6 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.contemGluten} onChange={e => set('contemGluten', e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                            <span className="text-sm text-gray-700">
                                {form.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                                <span className="text-xs text-gray-400 ml-1">(sempre aparece na etiqueta)</span>
                            </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.contemLactose} onChange={e => set('contemLactose', e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                            <span className="text-sm text-gray-700">
                                Contém lactose
                                <span className="text-xs text-gray-400 ml-1">(só aparece se marcado)</span>
                            </span>
                        </label>
                    </div>

                    {/* Lista de alérgenos (RDC 26/2015) */}
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Alérgicos — marque os que o produto contém</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
                        {ALERGENOS_LISTA.map(nome => {
                            const marcado = (form.alergenos || []).includes(nome);
                            return (
                                <label key={nome} className="flex items-center gap-1.5 cursor-pointer text-sm hover:bg-white rounded px-1 py-0.5">
                                    <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={e => {
                                            const atual = form.alergenos || [];
                                            set('alergenos', e.target.checked ? [...atual, nome] : atual.filter(a => a !== nome));
                                        }}
                                        className="w-4 h-4 rounded accent-indigo-600"
                                    />
                                    <span className="text-gray-700">{nome}</span>
                                </label>
                            );
                        })}
                    </div>

                    {/* Espécies (obrigatório p/ crustáceos e peixes pela RDC 26/2015) */}
                    {(form.alergenos || []).includes('Crustáceos') && (
                        <Campo label="Espécie(s) de Crustáceo">
                            <input type="text" value={form.especieCrustaceos} onChange={e => set('especieCrustaceos', e.target.value)} className={inputCls} placeholder="Ex: camarão" />
                        </Campo>
                    )}
                    {(form.alergenos || []).includes('Peixes') && (
                        <Campo label="Espécie(s) de Peixe">
                            <input type="text" value={form.especiePeixes} onChange={e => set('especiePeixes', e.target.value)} className={inputCls} placeholder="Ex: tilápia" />
                        </Campo>
                    )}

                    <Campo label="Aviso adicional no rótulo (ex: pode conter traços)">
                        <input type="text" value={form.avisosRotulo} onChange={e => set('avisosRotulo', e.target.value)} className={inputCls} placeholder="Pode conter traços: Leite, Soja, Ovos" />
                    </Campo>

                    {/* Preview do bloco */}
                    <div className="mt-3 p-3 bg-gray-900 text-white rounded-lg text-xs font-bold uppercase leading-relaxed">
                        {form.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                        {form.contemLactose && ' · CONTÉM LACTOSE'}
                        {(form.alergenos || []).length > 0 && ` · ALÉRGICOS: CONTÉM ${(form.alergenos || []).map(a => {
                            if (a === 'Crustáceos' && form.especieCrustaceos) return `${a} (${form.especieCrustaceos})`;
                            if (a === 'Peixes' && form.especiePeixes) return `${a} (${form.especiePeixes})`;
                            return a;
                        }).join(', ').toUpperCase()}.`}
                        {form.avisosRotulo && ` ${form.avisosRotulo.toUpperCase()}`}
                    </div>
                </section>

                {/* Rodapé */}
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                        <span className="text-sm text-gray-700">Ativo</span>
                    </label>
                    <div className="flex gap-3">
                        <button type="button" onClick={() => navigate('/pcp/etiquetas/dados')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={salvando} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                            <Save className="h-4 w-4" />
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
