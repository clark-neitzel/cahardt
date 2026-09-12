import React from 'react';

// Estado vazio ÚNICO (Linguagem visual v2, CLAUDE.md, aprovado 12/09/2026).
// Proibido "Nenhum registro encontrado" solto em texto cinza-claro — toda lista
// vazia usa este componente: ícone do módulo em círculo `bg-mint`, frase humana em
// `text-gray-700`, descrição em `text-gray-500` e, quando fizer sentido, um botão
// de ação ("+ Novo cliente", "Limpar filtros").
/**
 * @param {object} props
 * @param {React.ComponentType} [props.icon]
 * @param {string} props.titulo - frase curta e humana (ex.: "Nenhum cliente encontrado")
 * @param {string} [props.descricao] - complemento opcional (ex.: "Tente outro filtro ou cadastre um novo")
 * @param {{label: string, onClick: () => void}} [props.acao]
 * @param {string} [props.className]
 */
export default function EstadoVazio({ icon: Icon, titulo, descricao, acao, className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center text-center py-10 px-4 ${className}`}>
            {Icon && (
                <div className="bg-mint w-14 h-14 rounded-full flex items-center justify-center mb-3">
                    <Icon className="h-6 w-6 text-primary" />
                </div>
            )}
            {titulo && <p className="text-sm font-bold text-gray-700">{titulo}</p>}
            {descricao && <p className="text-xs text-gray-500 mt-1 max-w-xs">{descricao}</p>}
            {acao && (
                <button
                    type="button"
                    onClick={acao.onClick}
                    className="mt-4 px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold min-h-[44px]"
                >
                    {acao.label}
                </button>
            )}
        </div>
    );
}
