// Despeja o catálogo REAL de rotas (o que a política do agente enxerga) em JSON no stdout.
// Carrega o app SEM subir servidor (CAH_SEM_LISTEN=1) e sai. Usado pelo teste de snapshot e para revisão.
// Uso: node scripts/dump-catalogo-agente.js > catalogo.json
process.env.CAH_SEM_LISTEN = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dump-catalogo';
console.log = () => {}; // o app imprime ao carregar; só o JSON final vai ao stdout
const app = require('../index');
const { construir } = require('../services/agenteCatalogoRotas');
const cat = construir(app);
const saida = cat.rotas.map((r) => ({ chave: r.chave, metodo: r.metodo, exemplo: r.exemplo, familia: r.familia, complexa: r.complexa, ocorrencias: r.ocorrencias }));
process.stdout.write(JSON.stringify(saida), () => process.exit(0));
