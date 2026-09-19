// Sobe um app Express numa porta aleatória do loopback e devolve um client
// baseado no fetch nativo do Node — evita depender do supertest (sem instalar
// nada novo) e testa o caminho HTTP real (headers, JSON, status code).
const http = require('http');

// Prazo máximo que um teste espera por resposta. Existe porque uma rota com
// handler `async` que lança ANTES de chamar res.json/res.status (ex.: um
// ReferenceError de digitação) nunca gera resposta — o Express 4 não converte
// rejeição de Promise assíncrona em erro tratado sozinho. Sem este timeout,
// o `await request(...)` do teste fica pendurado para sempre e `node --test`
// nunca sai do ar (a suite "trava" em vez de FALHAR com uma mensagem clara).
const TIMEOUT_MS = 5000;

async function startTestServer(app) {
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const close = () => new Promise((resolve) => {
        // closeAllConnections() força o encerramento de qualquer socket ainda
        // aberto (ex.: uma conexão cujo handler nunca respondeu) — sem isso,
        // server.close() espera essas conexões terminarem sozinhas e o
        // callback nunca dispara, mesmo já tendo o fetch do cliente desistido
        // por timeout (o `finally` do teste ficaria pendurado no close()).
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close(resolve);
    });

    const request = async (method, urlPath, { headers = {}, body } = {}) => {
        let resp;
        try {
            resp = await fetch(baseUrl + urlPath, {
                method,
                headers: {
                    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    ...headers,
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                throw new Error(
                    `[httpServer] ${method} ${urlPath} não respondeu em ${TIMEOUT_MS}ms — ` +
                    `a rota provavelmente lançou erro antes de responder (handler async sem catch). ` +
                    `Confira o error handler do app de teste / da rota.`
                );
            }
            throw err;
        }
        let json = null;
        const texto = await resp.text();
        try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
        return { status: resp.status, headers: resp.headers, body: json, texto };
    };

    return { server, baseUrl, close, request };
}

module.exports = { startTestServer };
