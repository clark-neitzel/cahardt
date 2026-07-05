import React, { useRef, useState } from 'react';
import { X, UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import contasPagarService from '../../services/contasPagarService';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Cartãozinho de número da prévia
const Kpi = ({ label, valor, cor = 'text-gray-900' }) => (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-center">
        <div className={`text-lg md:text-xl font-bold ${cor}`}>{valor}</div>
        <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
    </div>
);

/**
 * Modal "Importar do Conta Azul": sobe o CSV de Contas a pagar, mostra a prévia
 * (sem gravar) e, ao confirmar, importa de fato. As contas entram marcadas como
 * "veio do CA" e nunca são reenviadas ao Conta Azul (não duplica lá).
 */
const ImportarCaModal = ({ onClose, onSuccess }) => {
    const [arquivo, setArquivo] = useState(null);
    const [previa, setPrevia] = useState(null);   // resumo do dryRun
    const [carregando, setCarregando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [arrastando, setArrastando] = useState(false);
    const inputRef = useRef(null);

    const escolher = async (file) => {
        if (!file) return;
        if (!/\.csv$/i.test(file.name)) {
            toast.error('Envie o arquivo .csv exportado do Conta Azul.');
            return;
        }
        setArquivo(file);
        setPrevia(null);
        setCarregando(true);
        try {
            const { resumo } = await contasPagarService.importarCa(file, true);
            setPrevia(resumo);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não consegui ler esse arquivo.');
            setArquivo(null);
        } finally {
            setCarregando(false);
        }
    };

    const confirmar = async () => {
        if (!arquivo) return;
        setImportando(true);
        try {
            const { resumo } = await contasPagarService.importarCa(arquivo, false);
            toast.success(`Importado! ${resumo.novas} nova(s), ${resumo.atualizadas} atualizada(s).`);
            onSuccess?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao importar.');
        } finally {
            setImportando(false);
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        setArrastando(false);
        escolher(e.dataTransfer.files?.[0]);
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div
                className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <UploadCloud className="h-5 w-5 text-blue-600" />
                        <h2 className="font-bold text-gray-900">Importar do Conta Azul</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-gray-600">
                        No Conta Azul: <b>Financeiro → Contas a pagar → Exportar</b>. Depois solte o arquivo
                        <span className="font-medium"> .csv</span> aqui. Só isso — o app já entende se cada conta foi paga ou não.
                    </p>

                    {/* Área de upload */}
                    {!arquivo && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                            onDragLeave={() => setArrastando(false)}
                            onDrop={onDrop}
                            onClick={() => inputRef.current?.click()}
                            className={`cursor-pointer border-2 border-dashed rounded-xl px-4 py-10 text-center transition-colors ${arrastando ? 'border-primary bg-blue-50' : 'border-gray-300 hover:border-primary hover:bg-gray-50'}`}
                        >
                            <UploadCloud className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <div className="text-sm font-medium text-gray-700">Clique ou arraste o CSV aqui</div>
                            <div className="text-xs text-gray-500 mt-1">Arquivo exportado do Conta Azul</div>
                            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
                                onChange={(e) => escolher(e.target.files?.[0])} />
                        </div>
                    )}

                    {/* Arquivo escolhido */}
                    {arquivo && (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-sm text-gray-700 truncate flex-1">{arquivo.name}</span>
                            {!importando && (
                                <button onClick={() => { setArquivo(null); setPrevia(null); }} className="text-xs text-gray-500 hover:text-gray-700 underline shrink-0">
                                    trocar
                                </button>
                            )}
                        </div>
                    )}

                    {carregando && (
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-6">
                            <Loader2 className="h-4 w-4 animate-spin" /> Lendo o arquivo…
                        </div>
                    )}

                    {/* Prévia */}
                    {previa && !carregando && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <Kpi label="contas no arquivo" valor={previa.totalContas} />
                                <Kpi label="novas a importar" valor={previa.novas} cor="text-green-600" />
                                <Kpi label="já pagas" valor={previa.qtdPagas} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Kpi label="valor total" valor={`R$ ${fmt(previa.valorTotal)}`} />
                                <Kpi label="já pago (do arquivo)" valor={`R$ ${fmt(previa.valorPago)}`} cor="text-green-600" />
                            </div>

                            {(previa.jaImportadas > 0 || previa.atualizadas > 0 || previa.ignoradasOutraOrigem > 0) && (
                                <div className="text-xs text-gray-500 flex items-start gap-1.5">
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>
                                        {previa.jaImportadas > 0 && <>{previa.jaImportadas} já estavam importadas (não duplico). </>}
                                        {previa.atualizadas > 0 && <>{previa.atualizadas} vão ganhar a baixa (pagas agora). </>}
                                        {previa.ignoradasOutraOrigem > 0 && <>{previa.ignoradasOutraOrigem} já existem por nota/lançamento do app (mantidas). </>}
                                    </span>
                                </div>
                            )}

                            {previa.categoriasNovas?.length > 0 && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                    <div className="text-xs text-amber-800">
                                        <b>{previa.categoriasNovas.length} categoria(s) nova(s)</b> entram com um palpite de classificação.
                                        Depois confira em <Link to="/financeiro/categorias-despesa" className="underline font-medium">Categorias de Despesa</Link> para a DRE ficar certinha.
                                    </div>
                                </div>
                            )}

                            {previa.avisos?.length > 0 && (
                                <div className="text-xs text-red-600">{previa.avisos.join(' ')}</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Rodapé */}
                <div className="flex gap-3 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                    <button onClick={onClose} disabled={importando}
                        className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={!previa || importando || carregando || previa?.novas + previa?.atualizadas === 0}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                        {importando ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando…</>
                            : <><CheckCircle2 className="h-4 w-4" /> Confirmar importação</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportarCaModal;
