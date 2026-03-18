const prisma = require('./backend/config/database');

async function test() {
  const user = await prisma.vendedor.findFirst({
    where: { nome: { contains: 'Clarkson' } }
  });
  console.log(user ? JSON.stringify(user.permissoes, null, 2) : 'User not found');
  process.exit(0);
}
test();
