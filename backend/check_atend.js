const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.vendedor.findMany({
    where: { 
      OR: [
        { nome: { contains: 'Atendimento', mode: 'insensitive' } },
        { login: { contains: 'atendimento', mode: 'insensitive' } }
      ]
    }
  });

  console.log("Usuários 'Atendimento' encontrados:", JSON.stringify(users, null, 2));

  const totalGeralEspeciais = await prisma.pedido.count({ where: { especial: true } });
  console.log("Total geral de especiais no BD:", totalGeralEspeciais);

  const pedidoService = require('./services/pedidoService');
  
  // Teste 1: Todos os Pedidos (normais e especiais), simulando Atendimento
  const filtrosQuery = {};
  const reqUser = { id: users[0].id, permissoes: users[0].permissoes };
  const permissoes = reqUser.permissoes || {};
  const permissaoPedidos = permissoes.pedidos || {};
  const podeVerTodos = permissoes.admin || permissaoPedidos.clientes === 'todos';
  
  if (!podeVerTodos) filtrosQuery.vendedorId = reqUser.id;

  const results = await pedidoService.listar(filtrosQuery);
  
  console.log("Total Pedidos visíveis para Atendimento:", results.length);
  const vends = [...new Set(results.map(r => r.vendedor?.nome))];
  console.log("Vendedores visíveis para Atendimento:", vends.slice(0, 10));
}

checkUser()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
