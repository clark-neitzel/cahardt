require('dotenv').config({ path: '.env.production' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const user = await prisma.vendedor.findFirst({
        where: { email: 'clarksonneitzel@gmail.com' }
    });
    console.log(user ? JSON.stringify(user, null, 2) : 'User not found');
    process.exit(0);
}
test();
