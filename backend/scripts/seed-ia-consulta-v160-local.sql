-- Semente LOCAL para o QA da v1.6.0 da API da IA (docs/plano-ia-consulta-v1.6.0.md §6).
-- Roda SÓ no hardt_local (trava abaixo). Depois: PORT=3011 JWT_SECRET=<qualquer> IA_WHATSAPP_API_KEY=teste-local node index.js
-- Cliente de teste: SEDRIK CARLOS LEMKE PANIFICADORA, telefone 5547999656673 (condição 1002, 2,5% de acréscimo).
DO $$ BEGIN IF current_database() <> 'hardt_local' THEN RAISE EXCEPTION 'Esta semente só roda no hardt_local'; END IF; END $$;
BEGIN;
-- tabela "Site" (visitante)
INSERT INTO tabela_precos (id, id_condicao, nome_condicao, tipo_pagamento, qtd_parcelas, parcelas_dias, acrescimo_preco, valor_minimo, ativo, created_at, updated_at)
VALUES ('SITE','SITE','Site','PIX',1,0,5.00,150.00,true,now(),now()) ON CONFLICT (id) DO NOTHING;
-- produtos no site
INSERT INTO congelados_produtos (id, produto_id, unidades_por_caixa, embalagem, nome_site, ordem, ativo, created_at, updated_at) VALUES
 ('cp-qa-0001','640c37ca-e578-4832-99a3-24c2d6e410b1',20,'pacote','Coxinha Tradicional de Frango G (pct 20un)',1,true,now(),now()),
 ('cp-qa-0002','7f5e61d0-0092-418e-8d48-5512f4b41cf7',20,'pacote',NULL,2,true,now(),now()),
 ('cp-qa-0003','77cacf21-9cf4-4367-a8c4-d2ec3bc36e3c',10,'pacote',NULL,3,true,now(),now()),
 ('cp-qa-0004','be118e68-53f1-4303-8b34-009ff1dd16be',20,'pacote',NULL,4,true,now(),now())
ON CONFLICT (id) DO NOTHING;
-- promoções vigentes: SIMPLES na coxinha tradicional, CONDICIONAL no bolinho (>= 3 pct)
INSERT INTO promocoes (id, produto_id, nome, tipo, preco_promocional, data_inicio, data_fim, status, criado_por, criado_em) VALUES
 ('promo-qa-simples','640c37ca-e578-4832-99a3-24c2d6e410b1','Setembro Coxinha','SIMPLES',38.00,now()-interval '1 day',now()+interval '20 days','ATIVA','cd3dff75-91e1-4284-8d20-f933b7ae31e3',now()),
 ('promo-qa-cond','77cacf21-9cf4-4367-a8c4-d2ec3bc36e3c','Bolinho leve 3','CONDICIONAL',50.00,now()-interval '1 day',now()+interval '20 days','ATIVA','cd3dff75-91e1-4284-8d20-f933b7ae31e3',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO promocao_condicao_grupos (id, promocao_id) VALUES ('promo-qa-cond-g1','promo-qa-cond') ON CONFLICT (id) DO NOTHING;
INSERT INTO promocao_condicoes (id, grupo_id, tipo, produto_id, quantidade_minima, valor_minimo) VALUES
 ('promo-qa-cond-c1','promo-qa-cond-g1','PRODUTO_QUANTIDADE','77cacf21-9cf4-4367-a8c4-d2ec3bc36e3c',3,NULL) ON CONFLICT (id) DO NOTHING;
-- etiqueta da coxinha tradicional (peso unitário 130g, 20 un, pacote 2600g)
INSERT INTO etiquetas_produtos (id, produto_id, codigo_produto, nome_produto, peso_unitario, peso_tabela_nutricional, quantidade_embalagem, peso_pacote, composicao, modo_preparo, ativo, created_at, updated_at)
VALUES ('et-qa-0001','640c37ca-e578-4832-99a3-24c2d6e410b1','3059','COXINHA TRADICIONAL FRANGO',130,100,20,2600,'massa, frango','fritar',true,now(),now()) ON CONFLICT (id) DO NOTHING;
-- preparo por categoria (site)
INSERT INTO congelados_config (chave, valor, updated_at) VALUES ('categoriasNomes', '{"6b469a55-95c6-41e9-b033-6d3b33f33311":{"preparo":"Para fritar"},"83936f52-150c-4e99-b803-4014e581da37":{"preparo":"Para aquecer"}}'::jsonb, now())
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
-- hora de corte
INSERT INTO app_configs(key, value) VALUES ('ia_consulta_config', '{"horaCorte":"17:00"}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- um pedido do cliente com data prevista amanhã (emAberto = true)
UPDATE pedidos SET data_venda = (current_date + 1)::timestamp + interval '12 hours' WHERE id = 'c35972a2-f70f-4616-9597-238e5e60d17a';
COMMIT;
