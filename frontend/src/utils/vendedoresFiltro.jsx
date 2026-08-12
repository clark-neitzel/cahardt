import React from 'react';

// Vendedor que saiu da empresa (inativo) continua nos dados históricos — pedidos,
// títulos, entregas, comissões. Por isso TODO filtro de tela/relatório precisa
// oferecer também os inativos; senão não dá para consultar o que ele vendeu.
//
// Regra do sistema:
//   - FILTRO / relatório  → vendedorService.listarParaFiltro() + os helpers daqui
//   - FORMULÁRIO (novo pedido, atribuir cliente/lead, escolher entregador)
//                         → vendedorService.listarAtivos() (ou somenteAtivos())
//
// Os inativos vêm sempre no fim da lista e com o rótulo "(inativo)", para não
// confundir com quem está na ativa.

const porNome = (a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');

export const ehInativo = (v) => v?.ativo === false;

export const rotuloVendedor = (v) => (ehInativo(v) ? `${v?.nome} (inativo)` : v?.nome);

// Ativos (A–Z) primeiro, inativos (A–Z) depois. Cada item ganha `rotulo`.
export function vendedoresParaFiltro(lista) {
    const arr = Array.isArray(lista) ? lista : [];
    const ativos = arr.filter(v => !ehInativo(v)).sort(porNome);
    const inativos = arr.filter(ehInativo).sort(porNome);
    return [...ativos, ...inativos].map(v => ({ ...v, rotulo: rotuloVendedor(v) }));
}

// Opções prontas para <SelectBusca> / <select> (array de <option>).
export function opcoesVendedorFiltro(lista) {
    return vendedoresParaFiltro(lista).map(v => (
        <option key={v.id} value={v.id}>{v.rotulo}</option>
    ));
}

// Opções prontas para os filtros de múltipla escolha ({ valor, label }).
export function opcoesVendedorMulti(lista) {
    return vendedoresParaFiltro(lista).map(v => ({ valor: v.id, label: v.rotulo }));
}

// Só quem está na ativa — para formulário/atribuição.
export function somenteAtivos(lista) {
    return (Array.isArray(lista) ? lista : []).filter(v => !ehInativo(v)).sort(porNome);
}
