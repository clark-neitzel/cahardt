#!/usr/bin/env bash
# ============================================================================
# Backup ROTATIVO do projeto CA-Hardt numa pasta SEPARADA do Google Drive.
#
# Por quê: o projeto vive numa pasta do Google Drive e o Drive sincroniza o
# ".git", o que às vezes embaralha o controle de versão. Este backup fica numa
# pasta IRMÃ (fora do projeto) e só LÊ o repositório (git archive / git bundle),
# nunca escreve no ".git" — então o que acontece aqui não interfere no projeto.
#
# O que faz a cada execução:
#   - cria a pasta "CA-Hardt-Backups/backup_<data>_<hora>/" no Drive, com:
#       * codigo-fonte.zip     -> o código versionado (sem node_modules/uploads)
#       * git-completo.bundle  -> TODO o histórico do git (restaura o repo inteiro)
#       * LEIA-COMO-RESTAURAR.txt
#   - mantém só as 5 versões mais recentes (apaga a mais antiga, cria a nova).
#
# Rodar à mão:  bash scripts/backup-drive.sh
# Roda sozinho: pelo hook .githooks/post-commit (a cada commit).
# ============================================================================
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

MANTER=5

# Raiz do projeto = pasta acima de onde este script está
PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Pasta de backups: IRMÃ do projeto (no Drive, fora do projeto)
BACKUPS="$(cd "$PROJETO/.." && pwd)/CA-Hardt-Backups"

cd "$PROJETO" || { echo "[backup] projeto não encontrado"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "[backup] git não encontrado no PATH"; exit 1; }
mkdir -p "$BACKUPS"

CARIMBO="$(date +%Y-%m-%d_%H%M%S)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"

# Monta primeiro num TEMP local (rápido e sem sync pela metade); só no fim move pronto.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! git archive --format=zip -o "$TMP/codigo-fonte.zip" HEAD 2>/dev/null; then
    echo "[backup] falha no git archive — abortando (nada foi mexido)"; exit 1
fi
git bundle create "$TMP/git-completo.bundle" --all >/dev/null 2>&1 || echo "[backup] aviso: bundle não gerado"

cat > "$TMP/LEIA-COMO-RESTAURAR.txt" <<TXT
BACKUP DO PROJETO CA-HARDT
Data: $CARIMBO   |   Commit: $COMMIT

Este backup NÃO substitui o GitHub — é uma cópia de segurança extra no Drive.

------------------------------------------------------------
1) SÓ QUERO VER / PEGAR O CÓDIGO
   Descompacte "codigo-fonte.zip". Dentro estão todos os arquivos do
   projeto (sem as pastas pesadas node_modules, que são reinstaladas).

2) QUERO RECUPERAR O PROJETO INTEIRO (com histórico do git)
   Abra o Terminal e rode:
     git clone git-completo.bundle CA-Hardt-recuperado
   Isso recria o repositório completo, com todo o histórico de versões.

3) DEPOIS DE RECUPERAR, para rodar o sistema:
     cd CA-Hardt-recuperado/frontend && npm install
     cd ../backend && npm install
------------------------------------------------------------
TXT

DEST="$BACKUPS/backup_$CARIMBO"
n=1; while [ -e "$DEST" ]; do DEST="$BACKUPS/backup_${CARIMBO}_$n"; n=$((n+1)); done
mv "$TMP" "$DEST" && trap - EXIT
echo "[backup] criado: $DEST"

# Rotação: mantém só os $MANTER mais recentes (nome tem data → ordem = cronológica)
cnt=$(ls -1d "$BACKUPS"/backup_* 2>/dev/null | wc -l | tr -d ' ')
excesso=$(( cnt - MANTER ))
if [ "$excesso" -gt 0 ]; then
    ls -1d "$BACKUPS"/backup_* 2>/dev/null | sort | head -n "$excesso" | while read -r velho; do
        rm -rf "$velho" && echo "[backup] apagado (rotação): $velho"
    done
fi
