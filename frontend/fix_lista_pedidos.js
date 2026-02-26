const fs = require('fs');
const file = 'src/pages/Pedidos/ListaPedidos.jsx';
let content = fs.readFileSync(file, 'utf8');

// The replacement logic:
const newBlock = `                    ) : (
                        pedidos.map((pedido) => (
                            <div key={pedido.id} className="px-3 py-2.5 hover:bg-gray-50 flex flex-row items-center justify-between gap-2 transition-colors">
                                {/* Coluna Esquerda: Cliente, Info e Status */}
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <h3 className="text-[13px] font-semibold text-gray-800 leading-tight truncate">
                                            {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Desconhecido'}
                                        </h3>
                                        {pedido.numero && (
                                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 shrink-0">
                                                #{pedido.numero}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-light mb-1.5">
                                        <span>{new Date(pedido.createdAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'})}</span>
                                        <span className="text-gray-300">•</span>
                                        <span className="truncate">{pedido.vendedor?.nome || '-'}</span>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <StatusBadge status={pedido.statusEnvio} />
                                        {pedido.revisaoPendente && (
                                            <span className="flex items-center text-[9px] font-medium text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded" title="Modificado no CA">
                                                <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Alt CA
                                            </span>
                                        )}
                                        {pedido.situacaoCA && (
                                            <span className="text-[9px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded uppercase">
                                                CA: {pedido.situacaoCA}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Coluna Direita: Valor e Ação */}
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <div className="text-[14px] font-bold text-gray-900 tracking-tight">
                                        R$ {Number(pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                                    </div>
                                    <button
                                        className={\`text-[11px] font-semibold px-2.5 py-1 rounded transition-colors shadow-sm border \${
                                            pedido.statusEnvio === 'ABERTO' 
                                                ? 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100' 
                                                : 'bg-white border-gray-200 text-gray-600 active:bg-gray-50'
                                        }\`}
                                        onClick={() => {
                                            if (pedido.statusEnvio === 'ABERTO') navigate(\`/pedidos/editar/\${pedido.id}\`);
                                            else setSelectedPedido(pedido);
                                        }}
                                    >
                                        {pedido.statusEnvio === 'ABERTO' ? 'Editar' : 'Detalhes'}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}`;

const startIndex = content.indexOf(') : (\\n                        pedidos.map((pedido) => (');
const endIndex = content.indexOf('</div>\\n            </div>\\n\\n            {/* Modal de Detalhes do Pedido', startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + newBlock + "\\n                " + content.substring(endIndex);
    fs.writeFileSync(file, content);
    console.log("Substituição concluída com sucesso.");
} else {
    console.log("Não foi possível encontrar as tags limítrofes.");
}
