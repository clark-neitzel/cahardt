import React, { useEffect, useState } from 'react';
import { HardDriveDownload, Loader2 } from 'lucide-react';
import api from '../../../services/api';

/**
 * Configurações → Backup: mostra se o backup automático (banco a cada 15 min +
 * arquivos 1x/dia, ambos para o Google Drive) está saudável. Somente leitura —
 * o backup roda sozinho no servidor; falha persistente avisa os admins por WhatsApp.
 */
export default function SecaoBackup() {
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        let vivo = true;
        api.get('/config/backup/status')
            .then(({ data }) => { if (vivo) setDados(data); })
            .catch(() => { if (vivo) setDados(null); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, []);

    const banco = dados?.status?.banco;
    const uploads = dados?.status?.uploads;

    const minutosDesde = (iso) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;
    const fmt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

    const minBanco = minutosDesde(banco?.ultimoOk);
    let badge = { cls: 'bg-gray-100 text-gray-700', txt: 'Sem informação' };
    if (dados && !dados.driveConfigurado) badge = { cls: 'bg-red-100 text-red-700', txt: 'Drive não configurado' };
    else if (minBanco != null && minBanco <= 30 && !(banco?.falhasSeguidas > 0)) badge = { cls: 'bg-green-100 text-green-800', txt: 'Protegido' };
    else if (minBanco != null && minBanco <= 120) badge = { cls: 'bg-yellow-100 text-yellow-800', txt: 'Atrasado' };
    else if (banco?.ultimoErro || minBanco != null) badge = { cls: 'bg-red-100 text-red-700', txt: 'Com problema' };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-mint/40">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                        <HardDriveDownload className="h-5 w-5 text-primary" />
                        Backup automático
                    </h2>
                    {!carregando && <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge.cls}`}>{badge.txt}</span>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                    Cópia de segurança no Google Drive: banco de dados a cada 15 minutos e arquivos anexados 1x por dia.
                    Se falhar, os administradores recebem aviso no WhatsApp.
                </p>
            </div>
            <div className="p-6">
                {carregando ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                ) : !dados ? (
                    <p className="text-sm text-gray-500">Não foi possível consultar o status do backup.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border border-gray-200">
                            <p className="text-sm font-semibold text-gray-700 mb-1">Banco de dados (15 em 15 min)</p>
                            <div className="text-xs text-gray-500 space-y-0.5">
                                <p>Último backup: <strong>{fmt(banco?.ultimoOk)}</strong>{minBanco != null && <> ({minBanco} min atrás)</>}</p>
                                {banco?.tamanhoMB != null && <p>Tamanho: {banco.tamanhoMB} MB</p>}
                                {banco?.falhasSeguidas > 0 && (
                                    <p className="text-red-600 font-medium">⚠️ {banco.falhasSeguidas} falha(s) seguida(s): {banco.ultimoErro}</p>
                                )}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg border border-gray-200">
                            <p className="text-sm font-semibold text-gray-700 mb-1">Arquivos anexados (1x por dia)</p>
                            <div className="text-xs text-gray-500 space-y-0.5">
                                <p>Último backup: <strong>{fmt(uploads?.ultimoOk)}</strong></p>
                                {uploads?.tamanhoMB != null && <p>Tamanho: {uploads.tamanhoMB} MB</p>}
                                {uploads?.ultimoErro && !uploads?.ultimoOk && (
                                    <p className="text-red-600 font-medium">⚠️ {uploads.ultimoErro}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
