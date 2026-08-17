# Scripts

Organização dos scripts auxiliares do backend.

## Estrutura

- `scripts/` — scripts operacionais/manutenção (usados em runtime, deploy ou tarefas recorrentes)
- `scripts/dev-tools/` — ferramentas de debug/inspeção usadas apenas em desenvolvimento

---

## `scripts/` (operacionais)

### Referenciados no `package.json`
| Script | Finalidade |
|---|---|
| `cleanup-pedido-teste-94.js` | Limpa pedido de teste órfão #94. Roda no `npm start` do deploy. |
| `clean-clientes-teste.js` | Remove clientes marcados como teste. Comando: `npm run clean:clientes`. |

### Migrações/one-off (manter por histórico)
| Script | Finalidade |
|---|---|
| `add_ncm_column.sql` / `apply_ncm_migration.js` / `migration_ncm_timestamp.sql` | Migração legada de coluna NCM. |
| `add_timestamp_column.js` | Migração legada de timestamps. |
| `apply_migration.sh` | Wrapper shell para aplicar migração Prisma. |
| `run_clientes_migration.js` / `run_clientes_update_01.js` | Migrações pontuais de clientes. |
| `run_custom_sql.js` | Executa SQL arbitrário (dev). |
| `sync-from-production.js` | Import one-off de dados de produção. |

### Sync / seed / manutenção
| Script | Finalidade |
|---|---|
| `seed-admin.js` | Cria usuário admin inicial. |
| `seed-pcp.js` | Popula dados iniciais do módulo PCP. |
| `sync-contas-receber.js` | Sincroniza contas a receber com Conta Azul. |
| `sync_clientes_manual.js` | Sincronização manual de clientes. |
| `force_sync_products.js` | Força re-sync de produtos. |
| `populate_manual.js` | Popular dados manualmente (dev). |
| `recalcular-estoque-retroativo.js` | Recalcula posição de estoque a partir do histórico. |
| `check-pedidos.js` | Verifica consistência de pedidos. |
| `simple_verify.js` / `verify_sync_status.js` | Verificações rápidas de integridade. |
| `debug-ca-product.js` / `debug_products.js` | Debug de produtos Conta Azul. |
| `test-client-payload.js` / `test-vendas-api.js` / `test_api_v2_clientes.js` | Testes manuais contra API Conta Azul. |

### Seed/teste do pacote "correção de entrada / produtos da despesa"

Os que escrevem no banco começam com `require('./exigir-banco-local')(...)`: se a
`DATABASE_URL` não for de um banco local, o processo **aborta antes de ler ou escrever
qualquer coisa** (inclusive no `--limpar`). Não existe variável de escape — dentro do
container de produção eles simplesmente não rodam.

| Script | Finalidade |
|---|---|
| `exigir-banco-local.js` | A trava em si. Exige host `localhost`/`127.0.0.1`/`::1` **e** banco `hardt_local` (ou nome terminado em `_local`/`_teste`/`_test`), e recusa `NODE_ENV=production`. Use em todo script novo que grave no banco. |
| `seed-cenarios-correcao-despesa.js` | Fixtures do QA para "corrigir os produtos de uma despesa" (despesa quitada, vinda de NF-e, compra legada, cancelada) **+ 3 usuários de teste com senha conhecida**. `--limpar` apaga tudo. |
| `teste-editar-produtos-despesa.js` | Prova no banco a edição de produtos da despesa: custo/estoque, replay fora de ordem, `dataCompra` preservada, trava de concorrência, linha legada. Cria e apaga os próprios dados. |
| `teste-correcao-entrada-banco.js` | Prova no banco a correção da conversão de um item de nota (estoque/custo mudam, financeiro intocado). |
| `teste-correcao-entrada-estoque.js` | Contas da correção de entrada (não grava — só aritmética de custo/quantidade). |

---

## `scripts/dev-tools/` (apenas desenvolvimento)

Ferramentas de inspeção rápida. Não são executadas em produção.

| Script | Finalidade |
|---|---|
| `checkCaProd.js` | Inspeção de produto Conta Azul. |
| `checkCliContatos.js` | Inspeção de contatos de cliente. |
| `checkProd.js` | Inspeção de produto local. |
| `check_atend.js` | Inspeção de atendimento. |
| `debug_endpoints.js` | Lista/debug dos endpoints. |
| `dump_pg_simple.js` | Dump simples do Postgres. |
| `dump_products.js` | Dump de produtos. |
| `test-auth.js` | Teste de autenticação. |
| `test-busca-venda.js` | Teste de busca de venda. |
| `test-db.js` | Teste de conexão com DB. |
| `test-perms.js` / `test-perms-root.js` | Testes de permissões. |
| `test-proxy.js` | Teste de proxy. |
| `test2.js` … `test6.js` | Testes ad-hoc (candidatos a remoção após revisão). |
| `test_osrm.js` | Teste de integração OSRM. |
| `test_pedido_faturado.js` | Teste de pedido faturado. |

## Convenções

- Novos scripts de debug/inspeção → `scripts/dev-tools/`
- Novos scripts operacionais (migração, seed, cron) → `scripts/`
- Sempre adicionar entrada nesta tabela ao criar script novo.
- Scripts one-off (rodados uma única vez) devem ser prefixados com a data: `2026-04-15-nome.js`.
