#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Roda o diagnóstico de cidades duplicadas CONTRA PRODUÇÃO. SOMENTE LEITURA.
#
# Por que este script existe em vez de um `curl` solto:
#   1. o segredo nunca aparece na linha de comando, no histórico do shell nem
#      numa regra de permissão — é lido de backend/scripts/.admin-secret, que
#      é gitignored (o segredo antigo chegou a vazar para .claude/settings.local.json
#      dessa forma e teve de ser rotacionado);
#   2. a permissão liberada fica restrita a ESTE script, e não a "curl em geral".
#
# A rota que ele chama (GET /api/admin-exec/diag-cidades) não grava nada:
# só agrega as grafias de cidade que existem hoje e propõe o nome final para
# o dono aprovar. Ver backend/routes/adminExec.js e backend/utils/cidade.js.
#
# Uso:
#   ./backend/scripts/diag-cidades-producao.sh              # só os grupos que precisam de ação
#   ./backend/scripts/diag-cidades-producao.sh --tudo       # todos os grupos
#   ./backend/scripts/diag-cidades-producao.sh --limite 50  # corta a lista
#   ./backend/scripts/diag-cidades-producao.sh --salvar a.json
# ---------------------------------------------------------------------------
set -euo pipefail

# O /api é servido pelo domínio do FRONTEND (o nginx dele faz proxy para o
# backend). O host `cahardt-hardt-backend...` não responde de fora.
BASE="${DIAG_CIDADES_URL:-https://cahardt-github.xrqvlq.easypanel.host}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARQ_SEGREDO="$AQUI/.admin-secret"

TUDO=""; LIMITE=""; SALVAR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tudo)   TUDO="1"; shift ;;
        --limite) LIMITE="${2:-}"; shift 2 ;;
        --salvar) SALVAR="${2:-}"; shift 2 ;;
        --url)    BASE="${2:-}"; shift 2 ;;
        *) echo "opção desconhecida: $1" >&2; exit 2 ;;
    esac
done

if [[ ! -f "$ARQ_SEGREDO" ]]; then
    echo "ERRO: não achei $ARQ_SEGREDO" >&2
    echo "O valor é o ADMIN_SECRET do EasyPanel. Este arquivo é gitignored." >&2
    exit 1
fi
SEGREDO="$(tr -d '\n\r' < "$ARQ_SEGREDO")"
if [[ -z "$SEGREDO" ]]; then
    echo "ERRO: $ARQ_SEGREDO está vazio." >&2
    exit 1
fi

CONSULTA=""
[[ -n "$TUDO"   ]] && CONSULTA="tudo=1"
[[ -n "$LIMITE" ]] && CONSULTA="${CONSULTA:+$CONSULTA&}limite=$LIMITE"
URL="$BASE/api/admin-exec/diag-cidades${CONSULTA:+?$CONSULTA}"

echo "→ GET $URL" >&2
CORPO="$(mktemp)"
trap 'rm -f "$CORPO"' EXIT

CODIGO="$(curl -sS -m 180 -o "$CORPO" -w '%{http_code}' \
    -H "x-admin-secret: $SEGREDO" "$URL")"

if [[ "$CODIGO" == "404" ]]; then
    echo "ERRO 404: a rota não existe no ar — o deploy da fase 0 ainda não subiu." >&2
    exit 1
elif [[ "$CODIGO" == "401" ]]; then
    echo "ERRO 401: segredo recusado. Confira se .admin-secret bate com o ADMIN_SECRET do EasyPanel." >&2
    exit 1
elif [[ "$CODIGO" != "200" ]]; then
    echo "ERRO HTTP $CODIGO:" >&2
    head -c 2000 "$CORPO" >&2; echo >&2
    exit 1
fi

if [[ -n "$SALVAR" ]]; then
    cp "$CORPO" "$SALVAR"
    echo "→ resposta salva em $SALVAR" >&2
fi

if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool < "$CORPO"
else
    cat "$CORPO"
fi
