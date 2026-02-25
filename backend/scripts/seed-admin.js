const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Buscando vendedor Clarkson Neitzel...');
    const vendedor = await prisma.vendedor.findFirst({
        where: {
            email: 'clarksonneitzel@gmail.com'
        }
    });

    if (!vendedor) {
        console.error('Vendedor (clarksonneitzel@gmail.com) não encontrado. Não foi possível realizar o seed.');
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashSenha = await bcrypt.hash('1234', salt);

    const permissoes = {
        catalogo: { view: true, edit: true },
        pedidos: { view: true, edit: true, clientes: "todos" },
        clientes: { view: true, edit: true },
        produtos: { view: true, edit: true },
        vendedores: { view: true, edit: true },
        sync: { view: true, edit: true },
        configuracoes: { view: true, edit: true },
    };

    await prisma.vendedor.update({
        where: { id: vendedor.id },
        data: {
            login: 'Clarkson',
            senha: hashSenha,
            permissoes: permissoes
        }
    });

    console.log('✅ Vendedor Clarkson configurado com sucesso! (login: Clarkson, senha: 1234, permissões totais)');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
