#!/bin/bash
# Baixa um snapshot completo da produção e importa para o banco local.
# Agendado 3x/dia via cron: 07:00, 12:00, 18:00.
#
# Uso manual: bash scripts/sync-from-prod-full.sh

set -euo pipefail

PROD_URL="https://cahardt-hardt-backend.xrqvlq.easypanel.host"
ADMIN_SECRET="hardt-admin-2026"
# Pula logs volumosos por padrão; remova da lista se quiser incluí-los
SKIP="sync_logs,ia_analise_logs"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$BACKEND_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.json"
LOG_FILE="$BACKUP_DIR/sync.log"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Início sync produção → local ==="
log "Baixando backup de $PROD_URL ..."

HTTP_CODE=$(curl -s -o "$BACKUP_FILE" -w "%{http_code}" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    "${PROD_URL}/api/admin-exec/export-full-db?skip=${SKIP}")

if [ "$HTTP_CODE" != "200" ]; then
    log "ERRO: HTTP $HTTP_CODE ao exportar. Abortando."
    rm -f "$BACKUP_FILE"
    exit 1
fi

SIZE=$(wc -c < "$BACKUP_FILE")
log "Backup salvo: $BACKUP_FILE ($(echo "$SIZE / 1024" | bc) KB)"

log "Importando para banco local..."
cd "$BACKEND_DIR"
node scripts/import-from-backup.js "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"

# Mantém apenas os últimos 10 backups
ls -t "$BACKUP_DIR"/backup_*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

log "=== Sync concluído ==="
