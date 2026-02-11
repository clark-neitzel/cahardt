const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Iniciando atualização do banco de dados...');

  // 1. MIGRATION: Atualizar estrutura da tabela produtos
  console.log('📦 1/2 Aplicando alterações na tabela produtos (Schema)...');

  // Array de comandos SQL para rodar sequencialmente (Prisma não suporta múltiplos comandos em string única)
  const migrationCommands = [
    `DO $$
    BEGIN
      IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='produtos' AND column_name='preco_venda') THEN
        ALTER TABLE "produtos" RENAME COLUMN "preco_venda" TO "valor_venda";
      END IF;
      IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name='produtos' AND column_name='saldo_estoque') THEN
        ALTER TABLE "produtos" RENAME COLUMN "saldo_estoque" TO "estoque_disponivel";
      END IF;
    END $$`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ean" TEXT`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "status" TEXT`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "estoque_reservado" DECIMAL(12,3) DEFAULT 0`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "estoque_total" DECIMAL(12,3) DEFAULT 0`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "estoque_minimo" DECIMAL(12,3) DEFAULT 0`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "categoria" TEXT`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "custo_medio" DECIMAL(12,3)`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "peso_liquido" DECIMAL(12,3)`,
    `ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "descricao" TEXT`
  ];

  for (const cmd of migrationCommands) {
    try {
      await prisma.$executeRawUnsafe(cmd);
    } catch (e) {
      console.log('⚠️ Aviso na migração (pode já existir):', e.message);
    }
  }
  console.log('✅ Schema atualizado com sucesso.');

  // 2. SEED: Popular dados reais
  console.log('🌱 2/2 Inserindo/Atualizando produtos reais...');

  const seedSQL = `
    INSERT INTO "produtos" (
        "conta_azul_id", "nome", "codigo", "ean", "status", "valor_venda", 
        "estoque_disponivel", "estoque_reservado", "estoque_total", "estoque_minimo", 
        "categoria", "custo_medio", "peso_liquido", "descricao", "updated_at", "id", "unidade"
    ) VALUES
    ('a7396475-2759-4386-b26f-5322815b6a7e', '1-G-COXINHA AIPIM FRANGO C/20 130GR', '1', '7898620330217', 'ATIVO', 53.30, 112, 0, 112, 80, 'Produto Acabado', 4.56, 1.25, '', '2026-02-05T18:31:45.504175Z', gen_random_uuid(), 'UN'),
    ('030bfa5e-e7b4-434d-aaab-bd1833056c74', '1-G-COXINHA TRADICIONAL FRANGO C/20 130GR', '3059', '7898620330224', 'ATIVO', 54.50, 120, 0, 120, 180, 'Produto Acabado', 3.35, 1.25, '', '2026-02-05T18:31:45.796034Z', gen_random_uuid(), 'UN'),
    ('b4d36edf-88b1-4b97-953a-a2464785428e', '1-G-EMPANADO SALSICHA C/10 140GR', '3078', '7898620330262', 'ATIVO', 39.18, 145, 0, 145, 50, 'Produto Acabado', 4.61, 1.40, '', '2026-01-20T11:20:23.884008Z', gen_random_uuid(), 'UN'),
    ('163a28e9-7233-4085-9016-804c2790d73a', '1-GG-COXINHA FRANGO C/10 170GR', '5151', '7898620330842', 'ATIVO', 40.29, 165, 5, 170, 100, 'Produto Acabado', 5.26, 1.25, '', '2026-01-20T11:20:23.461753Z', gen_random_uuid(), 'UN'),
    ('65158d61-d0fe-48ab-b39e-4236ad8d3d7f', '1-G-[O]-EMPANADO SALSICHA C/10 140GR', '5544', '7898620330989', 'ATIVO', 35.28, 0, 0, 24, 0, 'Produto Acabado', 4.61, 1.40, '', '2026-01-20T13:09:47.052175Z', gen_random_uuid(), 'UN'),
    ('fdebd8b9-b5b5-4974-acd7-a72e2d8b7b7d', '1-G-RISOLES CARNE C/10 140GR', '3063', '7898620330491', 'ATIVO', 28.46, 82, 0, 82, 40, 'Produto Acabado', 6.03, 1.40, '', '2026-02-05T18:31:45.893238Z', gen_random_uuid(), 'UN'),
    ('34571b82-2738-4d2d-8200-17a16a6611f0', '1-G-RISOLES PIZZA C/10 140GR', '3062', '7898620330521', 'ATIVO', 28.46, 72, 0, 72, 40, 'Produto Acabado', 6.23, 1.40, '', '2026-01-20T10:52:48.594893Z', gen_random_uuid(), 'UN'),
    ('6c91e31b-dfc1-435a-a2a0-d569a584e35d', '2-FR-EMPANADO SALSICHA C/10 140GR', '3079', '7898620330255', 'ATIVO', 46.68, 0, 0, 12, 0, 'Produto Acabado', 0, 1.40, '', '2026-02-05T18:31:45.761344Z', gen_random_uuid(), 'UN'),
    ('7ff8bae1-57b7-4bad-bb8b-07840c339029', '2-FR-G-COXINHA-AIPIM-FRANGO C/20 130GR', '3051', '7898620330149', 'ATIVO', 59.35, 0, 0, 55, 0, 'Produto Acabado', 0, 1.00, '', '2026-02-05T18:31:45.908376Z', gen_random_uuid(), 'UN'),
    ('4fabcc3f-6af0-4021-8087-a91b2b48c402', '2-FR-GG-COXINHA FRANGO C/10 170GR', '5182', '7898620330866', 'ATIVO', 45.58, 0, 0, 100, 0, 'Produto Acabado', 5.61, 1.70, '', '2026-01-20T10:55:28.618939Z', gen_random_uuid(), 'UN'),
    ('c161cfd2-8b3b-4416-8e22-8b4cb4117976', '2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR', '5023', '7898620330767', 'ATIVO', 50.10, 66, 0, 66, 58, 'Produto Acabado', 3.61, 1.20, '', '2026-01-20T10:55:44.422489Z', gen_random_uuid(), 'UN'),
    ('ccacc0e0-9127-44de-9790-16ce8801ea56', '2-FR-M-COXINHA KIBE C/20 75GR', '5592', '7898620331108', 'ATIVO', 56.91, 0, 0, 5, 0, 'Produto Acabado', 0, 1.50, '', '2026-01-20T10:55:58.913264Z', gen_random_uuid(), 'UN'),
    ('b109b753-b260-4e71-8336-05d17f18fd5c', '2-FR-M-COXINHA LING.BLUMEN.C/30 65GR', '5298', '7898620330873', 'ATIVO', 57.61, 0, 0, 16, 0, 'Produto Acabado', 0, 1.50, '', '2026-01-20T10:56:12.111935Z', gen_random_uuid(), 'UN'),
    ('7bc47f82-1c49-4d5a-a92b-853b3f9a3ac2', '2-FR-RISOLES DE CARNE C/10', '3069', '7898620330484', 'ATIVO', 40.29, 17, 0, 17, 25, 'Produto Acabado', 3.66, 1.00, '', '2026-01-20T10:56:24.946012Z', gen_random_uuid(), 'UN'),
    ('580a6d50-ca00-480d-ad00-9fa1086fdf9e', '2-FR-RISOLES DE PIZZA C/10', '3070', '7898620330538', 'ATIVO', 40.29, 0, 0, 5, 0, 'Produto Acabado', 0, 1.00, '', '2026-01-20T10:56:35.773932Z', gen_random_uuid(), 'UN'),
    ('ceee06ba-71ed-46a8-bdd3-669b006b22ce', '3-DOGUINHO 2.SALSICHAS C/08 220GR', '3086', '7898620330248', 'ATIVO', 52.83, 138, 0, 138, 80, 'Produto Acabado', 10.50, 1.76, '', '2026-01-20T10:56:59.649871Z', gen_random_uuid(), 'UN'),
    ('ce8f0c71-80ac-46ad-a734-bf923739abd9', '3-ENROLADINHO CALABRESA C/08 140GR', '5200', '7898620330880', 'ATIVO', 45.32, 132, 0, 132, 75, 'Produto Acabado', 0, 1.12, '', '2026-01-20T10:57:10.260518Z', gen_random_uuid(), 'UN'),
    ('996950ce-92dd-41b1-8d68-6eefbf00dd32', '3-ENROLADINHO FRANGO C/08 140GR', '3088', '7898620330293', 'ATIVO', 37.69, 85, 5, 90, 60, 'Produto Acabado', 4.91, 1.12, '', '2026-02-05T18:31:53.195476Z', gen_random_uuid(), 'UN'),
    ('86d31905-2439-4bd8-a698-6d625a532feb', '3-ENROLADINHO PIZZA C/08 140GR', '3272', '7898620330415', 'ATIVO', 37.69, 48, 0, 48, 50, 'Produto Acabado', 5.49, 1.01, '', '2026-01-20T10:57:36.198839Z', gen_random_uuid(), 'UN'),
    ('8c3bfd1e-0c9c-4ae4-bb91-3e8375deb3ef', '3-HAMBURGAO CHEEDAR/CEBOLA C/05 280GR', '3087', '7898620330583', 'ATIVO', 43.28, 92, 3, 95, 130, 'Produto Acabado', 13.46, 1.40, '', '2026-02-05T18:31:53.106962Z', gen_random_uuid(), 'UN'),
    ('094ef19e-b26c-4cd7-84d5-afa0f8bfb620', '4-MINI BOCADINHO DE PALMITO C/50 30GR', '3084', '7898620330323', 'ATIVO', 34.08, 227, 0, 227, 70, 'Produto Acabado', 3.24, 1.50, '', '2026-01-20T10:58:17.928182Z', gen_random_uuid(), 'UN'),
    ('a75d7667-60f6-4917-944a-37d7e52a11cc', '4-MINI BOLINHA DE QUEIJO C/50 30GR', '3082', '7898620330460', 'ATIVO', 34.08, 94, 0, 94, 240, 'Produto Acabado', 5.94, 1.50, '', '2026-01-20T10:58:28.023777Z', gen_random_uuid(), 'UN'),
    ('64b36251-b076-43ab-9693-9966ef2c0ce7', '4-MINI CHURROS DOCE LEITE C/50 30GR', '4091', '7898620330705', 'ATIVO', 34.08, 128, 0, 128, 125, 'Produto Acabado', 6.23, 1.50, '', '2026-02-01T18:59:46.732739Z', gen_random_uuid(), 'UN'),
    ('7faa9f2d-4b9d-452e-bfae-ac824502ec34', '4-MINI COXINHA FRANGO C/50 30GR', '3081', '7898620330316', 'ATIVO', 34.08, 265, 0, 265, 480, 'Produto Acabado', 4.16, 1.50, '', '2026-02-05T18:31:53.162698Z', gen_random_uuid(), 'UN'),
    ('ed9c2a08-24d1-40e9-8f12-7e0a929c9f21', '4-MINI COXINHA LING.BLUMEN.C/50 30GR', '5286', '7898620330897', 'ATIVO', 39.18, 55, 0, 55, 30, 'Produto Acabado', 0, 1.50, '', '2026-02-01T18:59:46.768762Z', gen_random_uuid(), 'UN'),
    ('d6f12774-8388-4469-9246-8f42e752acc5', '4-MINI CROQUETE DE CARNE C/50 30GR', '3083', '7898620330347', 'ATIVO', 34.08, 239, 0, 239, 105, 'Produto Acabado', 4.95, 1.50, '', '2026-01-20T10:59:08.299606Z', gen_random_uuid(), 'UN'),
    ('fc6d66d9-24c1-4bcf-84d4-69f69c9b3e6e', '4-MINI EMPADA FRANGO C/50 32GR', '4765', '7898620330910', 'ATIVO', 54.39, 106, 0, 106, 105, 'Produto Acabado', 7.64, 1.00, '', '2026-01-20T10:59:21.967579Z', gen_random_uuid(), 'UN'),
    ('15f10c02-ed24-4fdc-9b8b-0b2031183942', '4-MINI EMPADA PALMITO C/50 32GR', '5040', '7898620330927', 'ATIVO', 41.84, 0, 0, 0, 0, 'Produto Acabado', 0, 0, '', '2026-01-20T10:59:34.017167Z', gen_random_uuid(), 'UN'),
    ('bba43b79-c690-43f4-9e2d-054636bd16d0', '4-MINI KIBE CARNE C/50 28GR', '3972', '7898620330651', 'ATIVO', 52.50, 193, 0, 193, 50, 'Produto Acabado', 8.66, 1.45, '', '2026-01-20T10:59:48.963353Z', gen_random_uuid(), 'UN'),
    ('7d707801-3bf5-4efb-ad10-5c9b6fba5012', '4-MINI SALSICHA C/50 25GR', '5183', '7898620330934', 'ATIVO', 37.82, 115, 0, 115, 40, 'Produto Acabado', 8.17, 1.50, '', '2026-02-01T18:59:46.819465Z', gen_random_uuid(), 'UN'),
    ('2d4cafc5-6383-4188-bc0f-f36047fe8f82', '4-MINI TRAVESSEIRO PIZZA C/50 30GR', '3085', '7898620330453', 'ATIVO', 34.08, 0, 0, 130, 0, 'Produto Acabado', 5.55, 1.50, '', '2026-01-20T11:00:15.459049Z', gen_random_uuid(), 'UN'),
    ('8b8e8c6a-625a-4de3-a8b2-fa1898998d22', '5-CALZONE CALABRESA C/CHEEDAR C/08 160GR', '3072', '7898620330170', 'ATIVO', 46.72, 27, 0, 27, 24, 'Produto Acabado', 9.48, 1.08, '', '2026-01-20T11:00:46.326495Z', gen_random_uuid(), 'UN'),
    ('a0b181bb-8b92-438e-a324-beb5cba8cc21', '5-CALZONE CARNE C/REQUEIJAO C/08 160GR', '3073', '7898620330187', 'ATIVO', 46.72, 46, 0, 46, 35, 'Produto Acabado', 7.78, 1.40, '', '2026-01-20T11:00:59.395428Z', gen_random_uuid(), 'UN'),
    ('6b2a5427-87b0-4c17-bdd4-feded6a97e34', '5-CALZONE FRANGO C/REQ.C/08 160GR', '3071', '7898620330194', 'ATIVO', 46.72, 18, 0, 18, 30, 'Produto Acabado', 7.08, 1.28, '', '2026-01-20T11:01:11.383737Z', gen_random_uuid(), 'UN'),
    ('a4bf4279-b6b1-4db9-80a7-e5e8d52fcdba', '6-TORTINHA CALABRESA C/08 130GR', '5557', '7898620331085', 'ATIVO', 52.15, 80, 0, 80, 5, 'Produto Acabado', 9.48, 1.04, '', '2026-01-20T11:01:39.475725Z', gen_random_uuid(), 'UN'),
    ('24b70308-785a-4ae1-9461-4fea1b48cb3b', '6-TORTINHA CAMARAO C/REQ C/08 135GR', '3728', '7898620330606', 'ATIVO', 65.12, 59, 0, 59, 60, 'Produto Acabado', 11.88, 1.08, '', '2026-02-05T18:31:45.709722Z', gen_random_uuid(), 'UN'),
    ('c033a4de-6767-4d7a-8fa2-58932b7a2d86', '6-TORTINHA CARNE C/08 130GR', '4614', '7898620330002', 'ATIVO', 52.15, 47, 0, 47, 20, 'Produto Acabado', 9.48, 1.04, '', '2026-01-20T11:02:03.030029Z', gen_random_uuid(), 'UN'),
    ('b888088a-cb15-4dc9-8e19-fcd568a6e2c6', '6-TORTINHA FRANGO C/REQ C/08 130GR', '3611', '7898620330378', 'ATIVO', 52.15, 0, 0, 250, 0, 'Produto Acabado', 0, 1.04, '', '2026-02-05T18:31:45.925594Z', gen_random_uuid(), 'UN'),
    ('303e47de-3d17-4ffb-9a8c-185a166f7b89', '6-TORTINHA FRANGO PALMITO C/REQ.C/08 135GR', '4032', '7898620331092', 'ATIVO', 52.15, 37, 0, 37, 25, 'Produto Acabado', 6.69, 1.05, '', '2026-02-05T18:31:45.803562Z', gen_random_uuid(), 'UN'),
    ('d397b6a6-7da5-4134-b006-c9dccf60c571', '6-TORTINHA PALMITO C/REQ.C/08 130GR', '3609', '7898620330385', 'ATIVO', 52.15, 0, 0, 100, 0, 'Produto Acabado', 0, 1.05, '', '2026-02-05T18:31:45.84915Z', gen_random_uuid(), 'UN'),
    ('4df3aa13-3943-4cb5-aa1d-a681a8e0dbe5', '7-M-BOCADINHO PALMITO C/30 60GR', '4823', '7898620330996', 'ATIVO', 34.60, 0, 0, 10, 0, 'Produto Acabado', 3.14, 1.20, '', '2026-01-20T11:03:01.753164Z', gen_random_uuid(), 'UN'),
    ('8d24dbe8-7c9d-4d63-a22f-ece68714f196', '7-M-BOLINHA QUEIJO C/30 60GR', '5128', '7898620331009', 'ATIVO', 42.51, 141, 0, 141, 90, 'Produto Acabado', 5.03, 1.20, '', '2026-01-20T11:03:15.420208Z', gen_random_uuid(), 'UN'),
    ('5d9c5033-f88b-4c51-8c56-b3e1d84d84ec', '7-M-COXINHA AIPIM FRANGO C/30 60GR', '4826', '7898620330743', 'ATIVO', 42.51, 216, 0, 216, 460, 'Produto Acabado', 4.70, 1.20, '', '2026-02-05T18:32:39.268589Z', gen_random_uuid(), 'UN'),
    ('dd7ab114-f055-4f17-8ca6-a98659bfc0c1', '7-M-COXINHA CALABRESA.C/30 65GR', '5553', '7898620331016', 'ATIVO', 43.28, 28, 0, 28, 5, 'Produto Acabado', 0, 1.50, '', '2026-01-20T11:03:42.341397Z', gen_random_uuid(), 'UN'),
    ('4175e86f-17c1-4c54-b5cf-e159c2126bd4', '7-M-COXINHA KIBE C/20 75GR', '5560', '7898620331023', 'ATIVO', 48.09, 21, 0, 21, 5, 'Produto Acabado', 0, 1.50, '', '2026-01-20T11:03:55.853697Z', gen_random_uuid(), 'UN'),
    ('e3e36310-d690-4209-8fe2-f6975ab26fe3', '7-M-COXINHA LING.BLUMEN.C/30 65GR', '5296', '7898620331030', 'ATIVO', 47.37, 73, 0, 73, 70, 'Produto Acabado', 0, 1.50, '', '2026-01-20T11:04:08.990007Z', gen_random_uuid(), 'UN'),
    ('03a776de-0353-4757-8efd-310842644bf4', '7-M-CROQUETE CARNE C/30 60GR', '4809', '7898620331047', 'ATIVO', 42.51, 93, 0, 93, 40, 'Produto Acabado', 4.44, 1.20, '', '2026-01-20T11:04:23.211778Z', gen_random_uuid(), 'UN'),
    ('9e87a34f-cf1f-4a40-8737-02284432ea17', '7-M-EMPANADO SALSICHA C/20 80GR', '5050', '7898620331054', 'ATIVO', 35.96, 0, 0, 20, 0, 'Produto Acabado', 5.22, 1.60, '', '2026-01-20T11:04:36.437622Z', gen_random_uuid(), 'UN'),
    ('30f8bc77-67c9-4649-8f33-aeb22420bb23', '7-M-TRAVESSEIRO PIZZA C/30 60GR', '4824', '7898620331061', 'ATIVO', 42.51, 93, 0, 93, 70, 'Produto Acabado', 4.19, 1.20, '', '2026-01-20T11:04:49.578529Z', gen_random_uuid(), 'UN'),
    ('4f3f7d75-943f-4675-92e5-bcc7715cbb2b', 'G-MINI BOLINHA QUEIJO 500GR', '5570', '7898620330965', 'ATIVO', 12.99, 10, 0, 10, 5, 'Produto Acabado', 7.64, 1.00, '', '2026-01-20T11:05:22.121802Z', gen_random_uuid(), 'UN'),
    ('bea6d01f-992c-45ba-93aa-83668bc8a9bd', 'G-MINI COXINHA FRANGO 500GR', '5569', '7898620330439', 'ATIVO', 12.99, 10, 0, 10, 5, 'Produto Acabado', 7.64, 1.00, '', '2026-01-20T11:05:34.735322Z', gen_random_uuid(), 'UN'),
    ('5cd42b98-fa5b-407f-b025-c155e88faa5e', 'G-MINI EMPADA FRANGO 500GR', '5568', '7898620330958', 'ATIVO', 19.49, 10, 0, 10, 5, 'Produto Acabado', 7.64, 1.00, '', '2026-01-20T11:05:46.395571Z', gen_random_uuid(), 'UN'),
    ('7bd52f70-d90c-41c8-b898-939c48b2ad11', 'G-MINI TRAVESSEIRO PIZZA 500GR', '5571', '7898620330972', 'ATIVO', 12.99, 30, 0, 30, 5, 'Produto Acabado', 7.64, 1.00, '', '2026-01-20T11:05:57.878488Z', gen_random_uuid())
    ON CONFLICT ("conta_azul_id") DO UPDATE SET
        "nome" = EXCLUDED."nome",
        "codigo" = EXCLUDED."codigo",
        "ean" = EXCLUDED."ean",
        "status" = EXCLUDED."status",
        "valor_venda" = EXCLUDED."valor_venda",
        "estoque_disponivel" = EXCLUDED."estoque_disponivel",
        "estoque_reservado" = EXCLUDED."estoque_reservado",
        "estoque_total" = EXCLUDED."estoque_total",
        "estoque_minimo" = EXCLUDED."estoque_minimo",
        "categoria" = EXCLUDED."categoria",
        "custo_medio" = EXCLUDED."custo_medio",
        "peso_liquido" = EXCLUDED."peso_liquido",
        "descricao" = EXCLUDED."descricao",
        "updated_at" = EXCLUDED."updated_at",
        "unidade" = EXCLUDED."unidade";
  `;

  try {
    await prisma.$executeRawUnsafe(seedSQL);
    console.log('✅ Produtos inseridos/atualizados com sucesso!');
  } catch (e) {
    console.error('❌ Erro ao inserir dados:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
