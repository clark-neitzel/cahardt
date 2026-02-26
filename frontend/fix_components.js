const fs = require('fs');
let code = fs.readFileSync('src/pages/Pedidos/NovoPedido.jsx', 'utf8');

const regexComponentRow = /const ListaProdutoRow = \(\{ produto \}\) => \{[\s\S]*?return \([\s\S]*?<\/div>\n        \);\n    \};/;

const regexInsideRow = /const ListaProdutoRow = \(\{ produto \}\) => \{/;

if (regexInsideRow.test(code)) {
    let replaced = code.replace(regexInsideRow, `const ListaProdutoRow = ({ produto }) => {
        const item = itensMap.get(produto.id);
        const [valorLocal, setValorLocal] = useState(item?.valorUnitario ? Number(item.valorUnitario).toFixed(2) : '');
        
        // Sincronizar o valor local quando o item global mudar (ex: aplicar condição pgto)
        useEffect(() => {
            if (item?.valorUnitario !== undefined) {
                setValorLocal(Number(item.valorUnitario).toFixed(2));
            }
        }, [item?.valorUnitario]);

        const handleBlurValor = () => {
             const parsed = Number(valorLocal.replace(',', '.'));
             if (!isNaN(parsed) && parsed > 0) {
                 setValorUnitario(produto.id, parsed);
             } else {
                 setValorLocal(item?.valorUnitario ? Number(item.valorUnitario).toFixed(2) : '');
             }
        };

        const handleKeyDownValor = (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        };
`);

    // Agora substituir o input de valor unitário
    const inputRegex = /<input\s*type="text"\s*inputMode="decimal"[\s\S]*?onChange=\{e => setValorUnitario\(produto\.id, e\.target\.value\)\}\s*\/>/;
    
    replaced = replaced.replace(inputRegex, `<input
                                    type="text" inputMode="decimal"
                                    className="w-16 sm:w-20 text-center border border-blue-200 rounded px-1 py-0.5 text-blue-700 font-bold text-sm bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    value={valorLocal}
                                    onFocus={e => e.target.select()}
                                    onChange={e => setValorLocal(e.target.value)}
                                    onBlur={handleBlurValor}
                                    onKeyDown={handleKeyDownValor}
                                />`);

    // Auto-Save Effect
    const effectAfter = `    // Recalcular flex sempre que itensMap mudar
    useEffect(() => {
        let total = 0;
        itensMap.forEach(item => { total += item.flexUnitario * item.quantidade; });
        setFlexTotal(total);
    }, [itensMap]);`;

    const newAutoSave = `    // Sincronizar auto-save do rascunho local
    useEffect(() => {
        if (!loading && !editId) { // Só auto-salva se for NOVO pedido
            const dataToSave = {
                clienteId,
                clienteSearchText,
                dataEntrega,
                condicaoPagamentoId,
                isEncaixe,
                observacoes,
                itensMap: Array.from(itensMap.entries())
            };
            try {
                localStorage.setItem('@CAHardt:NovoPedido_Draft', JSON.stringify(dataToSave));
            } catch (e) { }
        }
    }, [clienteId, clienteSearchText, dataEntrega, condicaoPagamentoId, isEncaixe, observacoes, itensMap, loading, editId]);

    // Recalcular flex sempre que itensMap mudar`;

    replaced = replaced.replace('    // Recalcular flex sempre que itensMap mudar', newAutoSave);

    // Load Auto-Save
    const mountEffectRegex = /carregarDados\(\);/;
    const loadDraftLogic = `carregarDados();
        
        // Restaura draft local
        if (!id) {
            try {
                const draft = localStorage.getItem('@CAHardt:NovoPedido_Draft');
                if (draft) {
                    const pd = JSON.parse(draft);
                    if (pd.clienteId) setClienteId(pd.clienteId);
                    if (pd.clienteSearchText) setClienteSearchText(pd.clienteSearchText);
                    if (pd.dataEntrega) setDataEntrega(pd.dataEntrega);
                    if (pd.condicaoPagamentoId) setCondicaoPagamentoId(pd.condicaoPagamentoId);
                    if (pd.isEncaixe !== undefined) setIsEncaixe(pd.isEncaixe);
                    if (pd.observacoes) setObservacoes(pd.observacoes);
                    if (pd.itensMap && Array.isArray(pd.itensMap)) {
                        setItensMap(new Map(pd.itensMap));
                    }
                }
            } catch (e) {}
        }`;
    
    replaced = replaced.replace(mountEffectRegex, loadDraftLogic);

    // Botões Footer
    const footerRegex = /<button\s*disabled=\{saving\}[\s\S]*?onClick=\{[\s\S]*?handleSalvar\('ENVIAR'\)\}[\s\S]*?FECHAR PEDIDO · R\$ \{vTotal[\s\S]*?<\/button>/;
    const newFooter = `<button
                        disabled={saving}
                        onClick={() => handleSalvar('ABERTO')}
                        className="flex-1 bg-white text-blue-700 border-2 border-blue-600 font-bold py-3 rounded-xl hover:bg-blue-50 active:bg-blue-100 shadow-sm flex items-center justify-center gap-2 text-[14px]"
                    >
                        <Save className="h-4 w-4" />
                        SALVAR RASCUNHO
                    </button>
                    <button
                        disabled={saving}
                        onClick={() => {
                            // Limpa o draft se estiver enviando
                            localStorage.removeItem('@CAHardt:NovoPedido_Draft');
                            handleSalvar('ENVIAR');
                        }}
                        className="flex-[1.5] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 active:bg-blue-800 shadow-md flex flex-col items-center justify-center leading-tight transition-colors"
                    >
                        <span className="flex items-center gap-1.5 text-[15px]">
                            <Package className="h-4 w-4" />
                            ENVIAR PEDIDO
                        </span>
                        <span className="text-[11px] font-medium opacity-90">
                            Total: R$ {vTotal.toFixed(2).replace('.', ',')}
                        </span>
                    </button>`;

    replaced = replaced.replace(footerRegex, newFooter);
    
    // Substituir clear de botão apagar draft e excluir
    const excluirRegex = /await pedidoService\.excluir\(editId\);/;
    replaced = replaced.replace(excluirRegex, `await pedidoService.excluir(editId);\n            localStorage.removeItem('@CAHardt:NovoPedido_Draft');`);

    fs.writeFileSync('src/pages/Pedidos/NovoPedido.jsx', replaced);
    console.log("SUCCESS");
} else {
    console.log("REGEX FAIL");
}
