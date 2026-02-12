import React, { useEffect, useState } from 'react';
import syncService from '../../../services/syncService';
import authService from '../../../services/authService';
import { RefreshCw, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react';

const PainelSync = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [connected, setConnected] = useState(false);

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
                    <button
                        onClick={handleSync}
                        disabled={syncing || !connected}
                        className={`flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition ${(syncing || !connected) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                    >
                        <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                    </button>
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

                {loading && logs.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Carregando logs...</p>
                ) : logs.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-medium">
                                <tr>
                                    <th className="p-3">Data</th>
                                    <th className="p-3">Tipo</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Mensagem</th>
                                    <th className="p-3 text-right">Registros</th>
                                    <th className="p-3">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition">
                                        <td className="p-3 whitespace-nowrap text-gray-600">
                                            {new Date(log.dataHora).toLocaleString()}
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
                                        <td className="p-3 text-right text-gray-600">
                                            {log.registrosProcessados}
                                        </td>
                                        <td className="p-3">
                                            <button
                                                onClick={() => {
                                                    // Usar prompt permite copiar o texto (hack rápido e funcional)
                                                    window.prompt('Copie o JSON abaixo:', JSON.stringify(log, null, 2));
                                                }}
                                                className="text-blue-600 hover:underline text-xs"
                                            >
                                                Ver JSON/Copiar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-500 text-center py-8 bg-gray-50 rounded">
                        Nenhum log encontrado. Clique em "Sincronizar Agora" para iniciar.
                    </p>
                )}
            </div>
        </div>
    );
};

export default PainelSync;
