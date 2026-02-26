const fs = require('fs');
let code = fs.readFileSync('src/pages/Pedidos/NovoPedido.jsx', 'utf8');

code = code.replace(
    'const [showClienteDropdown, setShowClienteDropdown] = useState(false);',
    'const [showClienteModal, setShowClienteModal] = useState(false);'
);

const searchFormRegex = /\{\/\* Campo cliente sempre visível \*\/\}[\s\S]*?<\/div>\n                <\/div>/;

const newSearchForm = `{/* Campo cliente (agora um gatilho de modal) */}
                <div className="px-3 py-3 border-b border-gray-100 bg-white">
                    <button 
                        className="w-full relative flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 active:bg-gray-100 transition-colors text-left"
                        onClick={() => setShowClienteModal(true)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <User className="h-5 w-5 text-gray-500 shrink-0" />
                            {clienteId && clienteSelecionado ? (
                                <span className="text-[14px] font-bold text-gray-900 truncate">
                                    {clienteSelecionado.NomeFantasia || clienteSelecionado.Nome || clienteSearchText}
                                </span>
                            ) : (
                                <span className="text-[14px] font-semibold text-gray-500">
                                    Toque para buscar cliente...
                                </span>
                            )}
                        </div>
                        {clienteId && (
                            <div 
                                className="text-gray-400 p-0.5 shrink-0 bg-white rounded-full border border-gray-200 ml-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setClienteId('');
                                    setClienteSearchText('');
                                }}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </div>
                        )}
                    </button>
                </div>`;

const modalHTML = `
            {/* Modal de Busca de Cliente (Tela Cheia) */}
            {showClienteModal && (
                <div className="fixed inset-0 z-50 bg-white flex flex-col">
                    <div className="flex items-center gap-2 px-3 py-3 border-b bg-gray-50 shadow-sm">
                        <button onClick={() => setShowClienteModal(false)} className="text-gray-600 p-1.5 rounded-full hover:bg-gray-200 active:bg-gray-300 transition-colors">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                className="w-full pl-10 pr-10 py-2.5 text-base font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                                placeholder="NomeFantasia ou CNPJ..."
                                value={clienteSearchText}
                                onChange={e => setClienteSearchText(e.target.value)}
                            />
                            {clienteSearchText && (
                                <button onClick={() => setClienteSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 p-1.5 hover:text-gray-600">
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-gray-100 px-3 pb-6 pt-3">
                        <div className="space-y-2.5">
                            {clientes
                                .filter(c => !clienteSearchText || (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText))
                                .slice(0, 50)
                                .map(c => (
                                    <div 
                                        key={c.UUID}
                                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer active:bg-blue-50 transition-colors"
                                        onClick={() => {
                                            setClienteId(c.UUID);
                                            setShowClienteModal(false);
                                            setClienteSearchText(c.NomeFantasia || c.Nome);
                                        }}
                                    >
                                        <div className="font-bold text-lg text-gray-900 mb-1 leading-tight">{c.NomeFantasia || c.Nome}</div>
                                        <div className="text-[14px] text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                                            <span>{c.Documento || 'Sem Documento'}</span>
                                            {c.End_Cidade && (
                                                <>
                                                    <span className="text-gray-300">•</span>
                                                    <span>{c.End_Cidade}</span>
                                                </>
                                            )}
                                        </div>
                                        {c.Dia_de_entrega && (
                                            <div className="mt-2.5 inline-block bg-blue-50 text-blue-800 text-[12px] font-bold px-2 py-1 rounded border border-blue-100">
                                                Entregas: {c.Dia_de_entrega}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            {clientes.filter(c => !clienteSearchText || (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText)).length === 0 && (
                                <div className="p-10 text-center text-gray-500 flex flex-col items-center">
                                    <Search className="h-10 w-10 text-gray-300 mb-2" />
                                    <p className="text-base font-semibold">Nenhum cliente encontrado</p>
                                    <p className="text-sm mt-1">Tente buscar por outro termo.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
`;

code = code.replace(searchFormRegex, newSearchForm);

// Add the modal HTML right before the final return closing div
const finalReturnIndex = code.lastIndexOf('</div>\n    );\n};\n\nexport default NovoPedido;');
if(finalReturnIndex !== -1) {
    code = code.substring(0, finalReturnIndex) + modalHTML + '\n        ' + code.substring(finalReturnIndex);
}

fs.writeFileSync('src/pages/Pedidos/NovoPedido.jsx', code);
console.log("SUCCESS");
