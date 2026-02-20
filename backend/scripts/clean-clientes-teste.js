const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando limpeza emergencial de Clientes Fantasmas...");

    // Remove todos os Itens de Pedidos primeiro para evitar erro de Foreign Key
    try { await prisma.pedidoItem.deleteMany({}); } catch (e) { }

    // Remove todos os Pedidos Rascunhos / de Testes
    try { await prisma.pedido.deleteMany({}); } catch (e) { }

    // Remove arquivos associados a clientes
    try { await prisma.clienteArquivo.deleteMany({}); } catch (e) { }

    // Finalmente remove Clientes
    const deleted = await prisma.cliente.deleteMany({});

    console.log(`✅ Sucesso! Foram deletados ${deleted.count} clientes corrompidos da base de dados.`);
    console.log("👉 Volte no app e clique em 'Sincronizar Clientes' para baixar a base limpa e oficial!");
}

main()
    .catch(e => {
        console.error("Erro na limpeza:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
