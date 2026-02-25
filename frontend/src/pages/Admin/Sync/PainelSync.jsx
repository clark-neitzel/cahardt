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
    const [selectedLog, setSelectedLog] = useState(null); // Estado para o modal

    const checkConnection = async () => {
        try {
            const status = await authService.checkStatus();
            setConnected(status.connected);
        } catch (error) {
            console.error('Erro ao verificar conexão:', error);
        }
    };

    const handleConnect = () => {
        // Geração de URL movida para o Frontend para garantir disponibilidade imediata
        // Consultar skill: contaazul-autenticacao
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
        if (!connected) {
            alert('Você precisa conectar ao Conta Azul primeiro!');
            return;
        }
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
        if (!connected) {
            alert('Você precisa conectar ao Conta Azul primeiro!');
            return;
        }
        setSyncingPedidos(true);
        try {
            await syncService.sincronizarPedidos();
            setTimeout(() => fetchLogs(), 1000);
            alert('Acompanhamento de Modificações do Conta Azul Iniciado! Em alguns segundos as flags alaranjadas aparecerão na lista de Pedidos se algo houver mudado.');
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
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Sincronização Conta Azul</h1>

            <div className="bg-white p-6 rounded-lg shadow-md mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold mb-2">Status da Conexão</h2>
                    <p className={`flex items-center gap-2 ${connected ? 'text-green-600' : 'text-red-600'}`}>
                        {connected ? <CheckCircle size={20} /> : <XCircle size={20} />}
                        {connected ? 'Conectado' : 'Desconectado'}
                    </p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={handleConnect}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                        <LinkIcon size={18} />
                        {connected ? 'Reconectar' : 'Conectar'}
                    </button>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleSync}
                            disabled={syncing || !connected}
                            className={`flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition ${(syncing || !connected) ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                        >
                            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Sincronizando Produtos/Clientes...' : 'Sincronizar Geral'}
                        </button>
                        <button
                            onClick={handleSyncPedidos}
                            title="Procura por alterações nos orçamentos ou vendas que faturaram no Conta Azul e sinaliza com uma bolinha laranja."
                            disabled={syncingPedidos || !connected}
                            className={`flex justify-center items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition ${(syncingPedidos || !connected) ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                        >
                            <RefreshCw size={18} className={syncingPedidos ? 'animate-spin' : ''} />
                            {syncingPedidos ? 'Buscando Modificações...' : 'Sync Modificações (Pedidos)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Log List Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Histórico de Execuções (Debug)</h2>
                    <button
                        onClick={fetchLogs}
                        className="text-sm text-blue-600 hover:text-blue-800"
                    >
                        Atualizar Logs
                    </button>
                </div>

                {/* MODAL DE DETALHES DO LOG */}
                {selectedLog && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                                <h3 className="font-bold text-lg text-gray-800">
                                    Detalhes do Log ({selectedLog.tipo})
                                </h3>
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="p-4 flex-1 overflow-auto bg-gray-900 text-green-400 font-mono text-xs rounded-b-lg m-2">
                                <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
                            </div>

                            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-lg">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
                                        alert('JSON copiado para a área de transferência!');
                                    }}
                                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    Copiar JSON
                                </button>
                                <button
                                    onClick={() => setSelectedLog(null)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded transition"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading && logs.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Carregando logs...</p>
                ) : logs.length > 0 ? (
                    <div className="overflow-x-auto">
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
                                        <td className="p-3 whitespace-nowrap text-gray-600">
                                            {new Date(log.dataHora).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="p-3 font-medium">{log.tipo}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.status === 'SUCESSO' ? 'bg-green-100 text-green-700' :
                                                log.status === 'ERRO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="p-3 max-w-xs truncate" title={log.mensagem}>
                                            {log.mensagem}
                                        </td>
                                        <td className="p-3 text-right text-gray-600 font-mono">
                                            {log.registrosProcessados}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs transition border"
                                            >
                                                Ver Detalhes
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-500 text-center py-8 bg-gray-50 rounded border border-dashed border-gray-300">
                        Nenhum log encontrado. Clique em <span className="font-bold">"Sincronizar Agora"</span> para iniciar.
                    </p>
                )}
            </div>
        </div>
    );
};

export default PainelSync;
