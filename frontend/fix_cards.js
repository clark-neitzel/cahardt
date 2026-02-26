const fs = require('fs');
let code = fs.readFileSync('src/pages/Pedidos/ListaPedidos.jsx', 'utf8');

const regex = /pedidos\.map\(\(pedido\) => \([\s\S]*?\)\n\s*\)\s*\)/;

const newCard = `pedidos.map((pedido) => (
                            <div key={pedido.id} className="p-3 hover:bg-gray-50 flex flex-col justify-between gap-1 border-b border-gray-100 transition-colors">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center gap-1.5 mb-0.5">
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
                                            <span>{new Date(pedido.createdAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</span>
                                            <span className="text-gray-300">•</span>
                                            <span className="truncate">{pedido.vendedor?.nome || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="text-[13px] font-bold text-gray-900 tracking-tight shrink-0 mt-0.5">
                                        R$ {Number(pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toFixed(2).replace('.', ',')}
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between mt-0.5">
                                    <div className="flex flex-wrap items-center gap-1">
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
                                    <button
                                        className={\`text-[11px] font-semibold px-2.5 py-1 rounded transition-colors shadow-sm outline-none border \${
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
                    )`;

if (regex.test(code)) {
    fs.writeFileSync('src/pages/Pedidos/ListaPedidos.jsx', code.replace(regex, newCard));
    console.log("SUCCESS");
} else {
    console.log("REGEX FAIL");
}
