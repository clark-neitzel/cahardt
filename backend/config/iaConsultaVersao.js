// Fonte única da versão do contrato da API de consulta para IA externa (Antigravity/WhatsApp).
// Ver regras de uso em backend/docs/ia-consulta-api.md — NUNCA remover/renomear campo de resposta
// sem antes registrar um aviso aqui com antecedência.
//
// Ao dar um AVISO de mudança futura, adicione um objeto em AVISOS com { desde, mensagem }.
// Toda resposta da API inclui esse array em `meta.avisos`, para o app consumidor logar/alertar
// e se ajustar ANTES da mudança acontecer — assim o serviço nunca quebra "do nada" para o cliente.
// Histórico completo em backend/docs/ia-consulta-api.md.
// 1.0.0 (2026-07-01) Kit Festa · 1.1.0 (2026-07-02) + Congelados por CPF sem senha (nunca consumido
// externamente) · 1.2.0 (2026-07-02) corrige a 1.1.0: reconhecimento por telefone + login/senha/código
// com token, removendo o endpoint que aceitava só CPF/CNPJ sem prova de identidade.
const VERSAO_API = '1.2.0';

const AVISOS = [
    // Exemplo (remover quando o aviso deixar de ser válido):
    // { desde: '2026-07-01', mensagem: "O campo 'bairros' será removido em 2026-09-01. A verificação de entrega agora é só por CEP/raio — use POST /kitfesta/verificar-entrega." }
];

module.exports = { VERSAO_API, AVISOS };
