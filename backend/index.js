const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const produtoRoutes = require('./routes/produtoRoutes');
const syncRoutes = require('./routes/syncRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir imagens estáticas (Uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas
app.use('/api/produtos', produtoRoutes);
app.use('/api/sync', syncRoutes);

// Rota base
app.get('/', (req, res) => {
    res.send('API Hardt Salgados - v1.0.1 (Prod Data Fix)');
});

app.get('/api/debug-version', (req, res) => {
    const service = require('./services/contaAzulService');
    res.json({
        message: 'Debug Code Version',
        mockDataLength: service.fetchProdutosFromAPI ? 'Function Exists' : 'Missing',
        // Execute the function to see what it returns without writing to DB
        previewData: service.fetchProdutosFromAPI().then(data => data.slice(0, 3))
    });
});

// Inicialização
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
