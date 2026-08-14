#!/bin/bash
# Backup do código do CA-Hardt para o Google Drive.
#
# Desde 14/08/2026 o projeto MORA em ~/Projetos/CA-Hardt (disco local) e o Drive é
# SÓ backup — nunca se trabalha direto na cópia do Drive (lá o build levava 31 min
# e o git travava, porque cada arquivo é baixado da nuvem na hora do uso).
#
# O backup de verdade do código é o GitHub (clark-neitzel/cahardt), atualizado a cada
# push. Este arquivo aqui é a rede de segurança fria: leva também o que o git ignora
# (.env, .admin-secret) — que o GitHub, corretamente, nunca vai guardar.
#
# POR QUE UM ARQUIVO ÚNICO COMPACTADO, E NÃO ESPELHAMENTO (rsync):
#   Espelhar exige varrer a pasta de destino inteira, e isso força o Google Drive a
#   materializar milhares de arquivos que estão só na nuvem. Testado em 14/08/2026:
#   o rsync TRAVOU — 60 minutos sem escrever um único arquivo. Um .tgz é UMA escrita:
#   monta local (rápido) e copia um arquivo só. É o mesmo motivo pelo qual o script
#   antigo (scripts/backup-drive.sh) usava zip/bundle.
#
# Uso:  ~/Projetos/CA-Hardt/scripts/backup-para-drive.sh
# Também roda sozinho às 12h e às 20h (crontab) — desde que o macOS tenha dado
# "Acesso Total ao Disco" ao /usr/sbin/cron; sem isso, só funciona quando disparado
# de dentro de uma sessão de trabalho.

set -uo pipefail

ORIGEM="/Users/clarksonneitzel/Projetos/CA-Hardt"
DESTINO="/Users/clarksonneitzel/Library/CloudStorage/GoogleDrive-clarksonneitzel@gmail.com/Meu Drive/appsheet/Conta Azul/CA-Hardt-Backups"
LOG="$ORIGEM/.backup-drive.log"
MANTER=5   # quantas cópias guardar no Drive

registrar() { echo "$(date '+%F %T') $*" >> "$LOG"; }

[ -d "$ORIGEM" ]  || { registrar "ERRO: origem não encontrada: $ORIGEM"; exit 1; }
[ -d "$DESTINO" ] || { registrar "ERRO: destino (Drive) não montado: $DESTINO"; exit 1; }

CARIMBO=$(date '+%Y-%m-%d_%H%M%S')
NOME="completo_${CARIMBO}.tgz"
TMP=$(mktemp -d) || { registrar "ERRO: não consegui criar pasta temporária"; exit 1; }
trap 'rm -rf "$TMP"' EXIT

# 1) Monta o pacote no disco local (rápido). Inclui os arquivos que o git ignora;
#    exclui o que é regenerável (node_modules, dist) e o .git (o histórico já está
#    no GitHub, e o .git guarda credencial — não deve ir para a nuvem).
tar czf "$TMP/$NOME" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    -C "$(dirname "$ORIGEM")" "$(basename "$ORIGEM")" 2>>"$LOG"

if [ ! -s "$TMP/$NOME" ]; then
    registrar "ERRO: o pacote não foi gerado (tar falhou)"
    exit 1
fi
TAMANHO=$(du -h "$TMP/$NOME" | cut -f1)

# 2) Confere que o pacote abre antes de mandar para o Drive — backup corrompido
#    é pior que backup nenhum, porque dá falsa sensação de segurança.
if ! tar tzf "$TMP/$NOME" >/dev/null 2>&1; then
    registrar "ERRO: pacote gerado está corrompido — nada foi enviado ao Drive"
    exit 1
fi

# 3) Uma única escrita no Drive.
if ! cp "$TMP/$NOME" "$DESTINO/$NOME" 2>>"$LOG"; then
    registrar "ERRO: falha ao copiar para o Drive (se disser 'Operation not permitted', é o macOS bloqueando o cron — dar Acesso Total ao Disco ao /usr/sbin/cron)"
    exit 1
fi

# 4) Mantém só as N cópias mais recentes deste formato (não toca em nada mais).
EXCEDENTES=$(ls -1 "$DESTINO" 2>/dev/null | grep '^completo_.*\.tgz$' | sort -r | tail -n +$((MANTER + 1)))
if [ -n "$EXCEDENTES" ]; then
    while IFS= read -r velho; do
        [ -n "$velho" ] && rm -f "$DESTINO/$velho" && registrar "removida cópia antiga: $velho"
    done <<< "$EXCEDENTES"
fi

registrar "backup OK — $NOME ($TAMANHO)"

# mantém o log em no máximo 500 linhas
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
exit 0
