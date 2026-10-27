import dados from '../../data/tabelaDePara2027.json';

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Preço por unidade (ou por kg). Sem quantidade informada devolve null.
function porUnidade(p) {
    if (p.unidades == null || !(p.unidades > 0)) return null;
    const kg = p.tipoUnidade === 'kg';
    return { de: p.de / p.unidades, para: p.para / p.unidades, kg };
}

const fmtUn = (v, kg) => (v == null ? '—' : `${brl(v)}${kg ? '/kg' : ''}`);

const FALTA = [
    ['R$ 5 mil', 'R$ 2.500', 'uns 135 pacotes a menos'],
    ['R$ 10 mil', 'R$ 5.000', 'uns 270 pacotes a menos'],
    ['R$ 20 mil', 'R$ 10.000', 'uns 530 pacotes a menos'],
    ['R$ 30 mil', 'R$ 15.000', 'uns 800 pacotes a menos'],
    ['R$ 50 mil', 'R$ 25.000', 'uns 1.330 pacotes a menos'],
];

const Titulo = ({ children }) => (
    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3">{children}</h2>
);

export default function TabelaNova2027() {
    return (
        <div className="max-w-full overflow-x-hidden pb-12">
            <header className="bg-house text-white px-4 md:px-6 py-6 md:py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#cba258]">Hardt Doces e Salgados · tabela nova</div>
                    <h1 className="text-2xl md:text-3xl font-bold mt-1.5 mb-2 leading-tight">Nova tabela de preços: o que muda e por quê</h1>
                    <p className="text-sm md:text-base text-[#d9e5df] max-w-prose">
                        A empresa vai sair do Simples Nacional. Fora do Simples os impostos mudam e sobem, e os impostos antigos estão sendo parcelados. Para a conta fechar, os preços sobem 25%. Aqui está cada produto, hoje e novo, por pacote e por unidade.
                    </p>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-5">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 text-sm text-gray-700 space-y-3">
                    <Titulo>Explicando em miúdos</Titulo>
                    <p><b>Por que subir?</b> Dentro do Simples a empresa paga um imposto só, de cerca de 11,5% em cada venda. Fora do Simples passam a ser vários impostos (ICMS, CBS, IRPJ, CSLL, INSS sobre a folha) e juntos chegam perto de 19% da venda. Além disso, os impostos atrasados entraram em parcelamento e as parcelas caem todo mês. Somando imposto novo e parcelas, a empresa precisa de <span className="text-xl font-extrabold text-primaryDark">R$ 60 mil a mais por mês</span>.</p>
                    <p><b>Como chega nos 25%?</b> Vendendo os mesmos pacotes de hoje, a tabela nova rende esses R$ 60 mil líquidos (já descontando o imposto que incide sobre o aumento). Não sobra folga: a conta fecha no zero.</p>
                    <p><b>Por isso não pode dar desconto.</b> Cada 1% de desconto médio em cima da tabela nova tira R$ 2,4 mil por mês da conta.</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5 text-sm text-gray-700 space-y-3">
                    <Titulo>Se a venda cair, quanto vai faltar</Titulo>
                    <p>De cada R$ 100 que deixam de ser vendidos, faltam cerca de <b>R$ 50</b> para pagar as contas. Os outros R$ 50 eram o ingrediente e a embalagem do produto que não foi feito.</p>

                    <div className="md:hidden space-y-2">
                        {FALTA.map(([q, f, p]) => (
                            <div key={q} className="rounded-lg border border-gray-200 p-3">
                                <div className="text-gray-600">Se a venda do mês cair <b className="text-gray-900">{q}</b></div>
                                <div>Vai faltar <b className="text-red-700">{f}</b></div>
                                <div className="text-gray-500">{p}</div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Se a venda do mês cair</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vai faltar para pagar</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Em pacotes de mini coxinha</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {FALTA.map(([q, f, p]) => (
                                    <tr key={q}>
                                        <td className="px-4 py-2.5 text-gray-900">{q}</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-red-700">{f}</td>
                                        <td className="px-4 py-2.5 text-gray-700">{p}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p><b>Cada pacote de mini coxinha que deixa de ser vendido</b> são R$ 18 que faltam. Cada cliente que compra R$ 400 por semana e some são R$ 800 por mês que faltam.</p>
                    <p><b>O que ajuda:</b> explicar ao cliente que o imposto mudou para todo mundo; manter a entrega e a qualidade; não dar desconto; e trazer cliente novo, porque cada R$ 100 de venda nova colocam R$ 50 na conta.</p>
                </div>

                {dados.categorias.map((cat) => (
                    <section key={cat.categoria} data-categoria="1">
                        <div className="flex items-baseline flex-wrap gap-2 mb-2">
                            <h2 className="text-base font-extrabold text-gray-900">{cat.categoria}</h2>
                            <span className="text-xs font-bold text-primaryDark bg-mint px-2.5 py-0.5 rounded-full">
                                {cat.produtos.length} {cat.produtos.length === 1 ? 'produto' : 'produtos'}
                            </span>
                        </div>

                        <div className="md:hidden space-y-3">
                            {cat.produtos.map((p) => {
                                const u = porUnidade(p);
                                return (
                                    <div key={p.nome} data-produto="1" className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        <div className="font-semibold text-gray-900 break-words">{p.nome}</div>
                                        <div className="text-sm mt-1.5">
                                            <span className="text-gray-500">Pacote: {brl(p.de)} → </span>
                                            <span className="text-primaryDark font-bold">{brl(p.para)}</span>
                                            <span className="text-gray-500 text-xs"> (+{brl(p.para - p.de)})</span>
                                        </div>
                                        <div className="text-sm">
                                            <span className="text-gray-500">Unidade: {u ? fmtUn(u.de, u.kg) : '—'} → </span>
                                            <span className="text-primaryDark font-bold">{u ? fmtUn(u.para, u.kg) : '—'}</span>
                                            {u && <span className="text-gray-500 text-xs"> (+{brl(u.para - u.de)})</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                                        {['Pacote hoje', 'Pacote novo', '+ por pacote', 'Unidade hoje', 'Unidade nova', '+ por unidade'].map((h) => (
                                            <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {cat.produtos.map((p) => {
                                        const u = porUnidade(p);
                                        return (
                                            <tr key={p.nome} data-produto="1" className="hover:bg-gray-50">
                                                <td className="px-4 py-2.5 font-semibold text-gray-900">{p.nome}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap">{brl(p.de)}</td>
                                                <td className="px-3 py-2.5 text-right text-primaryDark font-bold whitespace-nowrap">{brl(p.para)}</td>
                                                <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">+{brl(p.para - p.de)}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap">{u ? fmtUn(u.de, u.kg) : '—'}</td>
                                                <td className="px-3 py-2.5 text-right text-primaryDark font-bold whitespace-nowrap">{u ? fmtUn(u.para, u.kg) : '—'}</td>
                                                <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">{u ? `+${brl(u.para - u.de)}` : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}

                <p className="text-xs text-gray-500">Preços por pacote em R$. "Unidade" = pacote dividido pela quantidade do nome (C/50, C/30, C/08…); nos de 2 kg e 500 g, preço por kg. Tabela válida a partir da data que a empresa avisar.</p>
            </div>
        </div>
    );
}
