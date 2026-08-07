/**
 * Garantia de conta financeira (Fase 0 Contabilidade — pré-requisito das FKs).
 *
 * contaFinanceiraCaId virou FK de verdade para contas_financeiras. Baixas e
 * extratos que chegam DE FORA (sync do Conta Azul, Asaas, tela Baixa CA) podem
 * citar uma conta que ainda não existe no cadastro local — sem esta garantia a
 * gravação falharia na FK e a baixa se perderia.
 *
 * `garantirContaFinanceira(id, tx)` confere se a conta existe e, se não existir,
 * cria uma linha INATIVA com nome provisório ("Conta CA abc12345…"). A conta
 * aparece nos relatórios pelo id certo e o dono pode renomear/ativar depois em
 * Financeiro → Saldos por Conta (o sync de contas também corrige o nome).
 */
const prisma = require('../config/database');

// Cache de ids já confirmados NO BANCO (evita um findUnique por baixa em lote).
// Só entra no cache quando a conta foi ENCONTRADA — criação dentro de transação
// pode sofrer rollback, então criar não basta para cachear.
const _conhecidas = new Set();

async function garantirContaFinanceira(id, tx = prisma) {
    if (!id) return null;
    const chave = String(id);
    if (_conhecidas.has(chave)) return chave;

    const existe = await tx.contaFinanceira.findUnique({ where: { id: chave }, select: { id: true } });
    if (existe) {
        _conhecidas.add(chave);
        return chave;
    }
    try {
        await tx.contaFinanceira.create({
            data: {
                id: chave,
                nomeBanco: `Conta CA ${chave.slice(0, 8)}…`,
                tipoUso: 'DESCONHECIDA',
                ativo: false,
                obs: 'Criada automaticamente: apareceu numa baixa/extrato antes de existir no cadastro. Se for uma conta real, renomeie e ative.'
            }
        });
        console.warn(`[ContaFinanceira] Conta desconhecida ${chave} criada inativa (veio de baixa/extrato externo).`);
    } catch (_) {
        // corrida: outra requisição criou primeiro — segue o jogo
    }
    return chave;
}

module.exports = { garantirContaFinanceira };
