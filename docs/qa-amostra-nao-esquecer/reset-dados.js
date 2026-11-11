// Volta as amostras A1-A8 ao estado inicial (banco LOCAL hardt_local). Uso: node docs/qa-amostra-nao-esquecer/reset-dados.js
const p = require('../../backend/config/database');
const C1 = '4eec8dc1-a306-433a-812f-ae725d6cab33';
const A = {
  A1: ['ea4ea57a-db7c-43a6-b8bb-c2ca7e808e83', 'SOLICITADA', null],
  A2: ['758592b0-a410-4850-88db-ab0ccdfcb0dd', 'PREPARACAO', null],
  A3: ['77305aca-3d4e-486b-b262-1a167dcf8f09', 'LIBERADO', null],
  A4: ['3a1f7b01-6085-4fc4-936c-122c33c9bb11', 'SOLICITADA', null],
  A5: ['99a8dd06-b295-4d23-aed7-1a415b7262a9', 'SOLICITADA', null],
  A6: ['4d062d52-3821-4166-b846-92c02021f152', 'LIBERADO', C1],
  A7: ['53762924-fd31-4aeb-96b8-3be8d0738b8e', 'ENTREGUE', C1],
  A8: ['edecee1f-13cd-4621-ac34-852560c7b3af', 'CANCELADA', null],
};
(async () => {
  for (const [k, [id, status, embarqueId]] of Object.entries(A))
    await p.amostra.update({ where: { id }, data: { status, embarqueId } });
  console.log('A1-A8 resetadas'); process.exit(0);
})();
