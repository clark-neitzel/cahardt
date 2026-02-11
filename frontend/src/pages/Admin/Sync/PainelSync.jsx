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

    const handleConnect = async () => {
        try {
            const url = await authService.getAuthUrl();
            window.location.href = url;
        } catch (error) {
            alert('Erro ao obter URL de conexão.');
        }
    };

    const fetchLogs = async () => {
        // ... (resto da função igual)
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

        // Check for success param (redirect from callback)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('status') === 'success') {
            setConnected(true);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Sincronização Conta Azul</h1>

                <div className="flex gap-3">
                    {connected ? (
                        <div className="flex items-center px-4 py-2 rounded-md font-medium text-green-700 bg-green-100 border border-green-200">
                            <CheckCircle className="h-5 w-5 mr-2" />
                            Conectado
                        </div>
                    ) : (
                        <div className="flex items-center px-4 py-2 rounded-md font-medium text-red-700 bg-red-100 border border-red-200">
                            <XCircle className="h-5 w-5 mr-2" />
                            Desconectado
                        </div>
                    )}

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className={`flex items-center px-4 py-2 rounded-md font-medium text-white transition-colors ${syncing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-sm'
                            }`}
                    >
                        <RefreshCw className={`h-5 w-5 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                    </button>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Histórico de Execuções
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                        Últimos registros de sincronização de produtos e clientes.
                    </p>
                </div>

                {loading && logs.length === 0 ? (
                    <div className="p-4 text-center">Carregando logs...</div>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {logs.map((log) => (
                            <li key={log.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        {log.status === 'SUCESSO' ? (
                                            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                                        ) : log.status === 'ERRO' ? (
                                            <XCircle className="h-5 w-5 text-red-500 mr-3" />
                                        ) : (
                                            <RefreshCw className="h-5 w-5 text-blue-500 mr-3 animate-spin" />
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-primary truncate">
                                                {log.tipo}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {log.mensagem}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-900 font-semibold">
                                            {log.registrosProcessados} registros
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {new Date(log.dataHora).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                        {logs.length === 0 && (
                            <li className="px-4 py-4 text-center text-gray-500">
                                Nenhum log encontrado.
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default PainelSync;
