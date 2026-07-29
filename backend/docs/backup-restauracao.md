# Backup automático — como funciona e como RESTAURAR

## O que é copiado, e quando

| O quê | Frequência | Onde fica no Drive | Guarda por quanto tempo |
|---|---|---|---|
| Banco de dados (pg_dump) | a cada **15 minutos** | `Backup Sistema Hardt/Banco 15min/` | últimas 48 horas |
| Banco — 1º backup do dia | diário (cópia) | `Backup Sistema Hardt/Banco Diario/` | últimos 60 dias |
| Banco — 1º backup do mês | mensal (cópia) | `Backup Sistema Hardt/Banco Mensal/` | para sempre |
| Arquivos (`backend/uploads`: PDFs, XMLs, fotos, certificado) | 1x/dia (madrugada) | `Backup Sistema Hardt/Arquivos/` | últimos 30 dias |

- Código: `backend/services/backupService.js`; agendamento em `backend/workers/scheduler.js` (job 12).
- Conta do Drive: a mesma já conectada para os XMLs da contabilidade (`app_configs.gdrive_config`).
  A pasta raiz pode ser trocada com a chave `backupPastaId` dentro dessa config.
- Status na tela **Configurações → Backup automático** (rota `GET /api/config/backup/status`).
- Falha 3x seguidas do banco (≈ 45 min desprotegido) ou falha do backup de arquivos →
  **WhatsApp interno para os admins** (máx. 1 aviso/dia).
- Janela máxima de perda de dados do banco: **15 minutos**.

## Disparar um backup manualmente (produção)

```bash
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" \
  "https://cahardt-github.xrqvlq.easypanel.host/api/admin-exec/backup-executar?tipo=banco"
# tipo=uploads (&forcar=1 para re-enviar o de hoje)
curl -H "x-admin-secret: $ADMIN_SECRET" \
  "https://cahardt-github.xrqvlq.easypanel.host/api/admin-exec/diag-backup"
```

## RESTAURAR o banco (o passo que importa no dia ruim)

1. Baixe do Drive o arquivo mais recente de `Banco 15min/` (ex.: `banco-2026-07-28-1615.dump`).
2. Restaure num banco **vazio** (nunca por cima de um banco com dados que ainda importam):

```bash
createdb hardt_restaurado
pg_restore --no-owner --no-privileges -d hardt_restaurado banco-2026-07-28-1615.dump
```

3. Confira: `psql hardt_restaurado -c "SELECT count(*) FROM pedidos;"` (e compare com o esperado).
4. Para colocar em produção: aponte a `DATABASE_URL` do backend (EasyPanel) para o banco
   restaurado **ou** restaure com `-d` no banco de produção recém-criado/zerado, e reinicie o backend.

O dump é formato *custom* do Postgres (`pg_dump --format=custom`), já comprimido.
`--no-owner --no-privileges` na geração e na restauração permitem restaurar com qualquer usuário.

**Versão do pg_restore:** o servidor de produção é Postgres **17** — o `pg_restore` precisa ser
17 ou mais novo (o 16 falha com `unsupported version (1.16) in file header`). No Mac do
escritório: `brew install postgresql@17` e usar `/opt/homebrew/opt/postgresql@17/bin/pg_restore`
(instalado e testado em 28/07/2026 — restauração do dump de produção conferida com contagens).
Restaurar num servidor 16 funciona (warning inofensivo de `SET transaction_timeout`), desde que
o `pg_restore` seja 17.

## RESTAURAR os arquivos (uploads)

1. Baixe `Arquivos/arquivos-<dia>.tar.gz` do Drive.
2. Extraia dentro do volume de uploads do backend:

```bash
tar -xzf arquivos-2026-07-28.tar.gz -C backend/uploads/
```

## Teste periódico

Backup que nunca foi restaurado não é backup. Pelo menos 1x a cada poucos meses:
baixar um dump do Drive, restaurar num banco local (`hardt_restauro_teste`) e conferir
contagens de `pedidos`, `clientes` e `parcelas`.
