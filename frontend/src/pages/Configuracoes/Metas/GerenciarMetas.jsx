import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MUIDataTable from "mui-datatables";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import dayjs from 'dayjs';
import MetaFormModal from './MetaFormModal';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL;

const GerenciarMetas = () => {
    const [mesAtual, setMesAtual] = useState(dayjs().format('YYYY-MM'));
    const [metas, setMetas] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMeta, setSelectedMeta] = useState(null);

    const getAuthHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    const fetchVendedores = async () => {
        try {
            const res = await axios.get(`${API_URL}/vendedores`, getAuthHeader());
            setVendedores(res.data);
        } catch (error) {
            console.error("Erro ao carregar vendedores", error);
            toast.error("Erro ao carregar vendedores");
        }
    };

    const fetchMetas = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/metas?mesReferencia=${mesAtual}`, getAuthHeader());
            setMetas(res.data);
        } catch (error) {
            console.error('Erro ao buscar metas:', error);
            toast.error("Erro ao buscar metas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendedores();
    }, []);

    useEffect(() => {
        fetchMetas();
    }, [mesAtual]);

    const handleEditClick = (metaData) => {
        setSelectedMeta(metaData);
        setIsModalOpen(true);
    };

    const handleNewClick = () => {
        setSelectedMeta(null);
        setIsModalOpen(true);
    };

    const handleModalClose = (saved) => {
        setIsModalOpen(false);
        if (saved) fetchMetas();
    };

    // Columns configuration for MUI Datatables
    const columns = [
        {
            name: "vendedor",
            label: "Vendedor",
            options: { filter: true, sort: true, customBodyRender: (v) => v?.nome || '-' }
        },
        {
            name: "valorMensal",
            label: "Meta Mensal (R$)",
            options: { filter: true, sort: true, customBodyRender: (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
        },
        {
            name: "diasTrabalho",
            label: "Dias de Atuação",
            options: {
                filter: false, sort: false, customBodyRender: (v) => {
                    const arr = typeof v === 'string' ? JSON.parse(v) : v;
                    return arr ? `${arr.length} dias` : '0 dias';
                }
            }
        },
        {
            name: "id",
            label: "Ações",
            options: {
                filter: false, sort: false,
                customBodyRenderLite: (dataIndex) => {
                    const meta = metas[dataIndex];
                    return (
                        <div className="flex justify-center">
                            <IconButton onClick={() => handleEditClick(meta)} color="primary">
                                <EditIcon />
                            </IconButton>
                        </div>
                    );
                }
            }
        }
    ];

    const options = {
        filterType: 'checkbox',
        selectableRows: 'none',
        print: false,
        download: false,
        viewColumns: false,
        textLabels: {
            body: { noMatch: "Desculpe, nenhum registro encontrado" },
            pagination: { next: "Próxima", previous: "Anterior", rowsPerPage: "Linhas por página:", displayRows: "de" },
            toolbar: { search: "Pesquisar", filterTable: "Filtrar" },
        }
    };

    const getMuiTheme = () => createTheme({
        components: { MUIDataTableHeadCell: { styleOverrides: { root: { fontWeight: 'bold' } } } }
    });

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Gerenciar Metas de Vendas</h1>

                <div className="flex items-center gap-4">
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Mês de Referência</label>
                        <input
                            type="month"
                            className="border p-2 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            value={mesAtual}
                            onChange={(e) => setMesAtual(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={handleNewClick}
                        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow transition-colors"
                    >
                        + Nova Meta
                    </button>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <ThemeProvider theme={getMuiTheme()}>
                    <MUIDataTable
                        title={`Metas Definidas para ${dayjs(mesAtual).format('MM/YYYY')}`}
                        data={metas}
                        columns={columns}
                        options={options}
                    />
                </ThemeProvider>
            </div>

            {isModalOpen && (
                <MetaFormModal
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    metaData={selectedMeta}
                    vendedores={vendedores}
                    mesAtualStr={mesAtual}
                />
            )}
        </div>
    );
};

export default GerenciarMetas;
