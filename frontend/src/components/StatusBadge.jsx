import React from 'react';
import clsx from 'clsx';

const StatusBadge = ({ ativo, estoque }) => {
    if (!ativo) {
        return (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                Inativo
            </span>
        );
    }

    if (estoque <= 0) {
        return (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                Sem Estoque
            </span>
        );
    }

    if (estoque < 10) {
        return (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                Baixo Estoque
            </span>
        );
    }

    return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
            Ativo
        </span>
    );
};

export default StatusBadge;
