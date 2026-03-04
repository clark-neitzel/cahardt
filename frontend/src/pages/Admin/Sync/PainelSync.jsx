import React, { useEffect, useState } from 'react';
import syncService from '../../../services/syncService';
import authService from '../../../services/authService';
import { RefreshCw, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react';

const PainelSync = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingPedidos, setSyncingPedidos] = useState(false);
    const [connected, setConnected] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const checkConnection = async () => {
        try {
            const status = await authService.checkStatus();
            setConnected(status.connected);
        } catch (error) {
            console.error('Erro ao verificar conexão:', error);
        }
    };

    const handleConnect = () => {
        const CLIENT_ID = '6f6gpe5la4bvg6oehqjh2ugp97';
        const REDIRECT_URI = 'https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback';
        const STATE = 'ESTADO_SEGURANCA';
        const url = `https://auth.contaazul.com/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${STATE}&scope=openid+profile+aws.cognito.signin.user.admin`;
        window.location.href = url;
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await syncService.listarLogs();
            setLogs(data);
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!connected) { alert('Conecte ao Conta Azul primeiro!'); return; }
        setSyncing(true);
        try {
            await syncService.sincronizar();
            setTimeout(() => fetchLogs(), 1000);
        } catch (error) {
            alert('Erro ao iniciar sincronização.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncPedidos = async () => {
        if (!connected) { alert('Conecte ao Conta Azul primeiro!'); return; }
        setSyncingPedidos(true);
        try {
            await syncService.sincronizarPedidos();
            setTimeout(() => fetchLogs(), 1000);
            alert('Sync de modificações iniciado! Flags alaranjadas aparecerão na lista de Pedidos.');
        } catch (error) {
            alert('Erro ao iniciar rastreio de pedidos.');
        } finally {
            setSyncingPedidos(false);
        }
    };

    useEffect(() => {
        checkConnection();
        fetchLogs();
    }, []);

    return (
        <div className="px-3 md:px-6 py-4 md:py-6 max-w-7xl mx-auto">
            <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Sincronização Conta Azul</h1>

            {/* Status + Ações */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-4 md:mb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg md:text-xl font-semibold mb-1">Status da Conexão</h2>
                        <p className={`flex items-center gap-2 text-sm ${connected ? 'text-green-600' : 'text-red-600'}`}>
                            {connected ? <CheckCircle size={18} /> : <XCircle size={18} />}
                            {connected ? 'Conectado' : 'Desconectado'}
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <button onClick={handleConnect}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium">
                            <LinkIcon size={16} />
                            {connected ? 'Reconectar' : 'Conectar'}
                        </button>
                        <button onClick={handleSync} disabled={syncing || !connected}
                            className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium ${(syncing || !connected) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Sincronizando...' : 'Sync Geral'}
                        </button>
                        <button onClick={handleSyncPedidos} disabled={syncingPedidos || !connected}
                            className={`flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition text-sm font-medium ${(syncingPedidos || !connected) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <RefreshCw size={16} className={syncingPedidos ? 'animate-spin' : ''} />
                            {syncingPedidos ? 'Buscando...' : 'Sync Pedidos'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-md">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Histórico de Execuções</h2>
                    <button onClick={fetchLogs} className="text-sm text-blue-600 hover:text-blue-800">Atualizar</button>
                </div>

                {selectedLog && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                                <h3 className="font-bold text-lg text-gray-800">Detalhes ({selectedLog.tipo})</h3>
                                <button onClick={() => setSelectedLog(null)} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
                            </div>
                            <div className="p-4 flex-1 overflow-auto bg-gray-900 text-green-400 font-mono text-xs m-2 rounded">
                                <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
                            </div>
                            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-lg">
                                <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2)); alert('JSON copiado!'); }}
                                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">Copiar JSON</button>
                                <button onClick={() => setSelectedLog(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded text-sm">Fechar</button>
                            </div>
                        </div>
                    </div>
                )}

                {loading && logs.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Carregando logs...</p>
                ) : logs.length > 0 ? (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full text-sm text-left border-collapse">
                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                    <tr>
                                        <th className="p-3">Data</th>
                                        <th className="p-3">Tipo</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Mensagem</th>
                                        <th className="p-3 text-right">Registros</th>
                                        <th className="p-3 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50 transition">
                                            <td className="p-3 whitespace-nowrap text-gray-600">{new Date(log.dataHora).toLocaleString('pt-BR')}</td>
                                            <td className="p-3 font-medium">{log.tipo}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${log.status === 'SUCESSO' ? 'bg-green-100 text-green-700' : log.status === 'ERRO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {log.status}
                                                </span>
                                            </td>
                                            <td className="p-3 max-w-xs truncate" title={log.mensagem}>{log.mensagem}</td>
                                            <td className="p-3 text-right text-gray-600 font-mono">{log.registrosProcessados}</td>
                                            <td className="p-3 text-center">
                                                <button onClick={() => setSelectedLog(log)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs border">Ver</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="md:hidden space-y-2">
                            {logs.map(log => (
                                <div key={log.id} onClick={() => setSelectedLog(log)} className="bg-gray-50 rounded-lg p-3 border border-gray-200 cursor-pointer active:bg-gray-100">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === 'SUCESSO' ? 'bg-green-100 text-green-700' : log.status === 'ERRO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {log.status}
                                        </span>
                                        <span className="text-[10px] text-gray-400">{new Date(log.dataHora).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <p className="text-[12px] font-medium text-gray-900">{log.tipo}</p>
                                    <p className="text-[11px] text-gray-500 truncate">{log.mensagem}</p>
                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{log.registrosProcessados} registros</p>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <p className="text-gray-500 text-center py-8 bg-gray-50 rounded border border-dashed border-gray-300">
                        Nenhum log encontrado. Clique em <span className="font-bold">"Sync Geral"</span> para iniciar.
                    </p>
                )}
            </div>
        </div>
    );
};

export default PainelSync;
