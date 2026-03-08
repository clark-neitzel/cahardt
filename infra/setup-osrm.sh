#!/bin/bash
# ============================================================
# Script de Setup do OSRM Self-Hosted para o Sul do Brasil
# Executar UMA VEZ no servidor. Requer Docker instalado.
# O serviço ficará disponível em http://localhost:5100
# ============================================================

set -e

OSRM_DIR="/opt/osrm-data"
PBF_URL="https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf"
PBF_FILE="sul-latest.osm.pbf"
CONTAINER_NAME="osrm-routing"
PORT=5100

echo "📁 Criando diretório de dados..."
mkdir -p "$OSRM_DIR"
cd "$OSRM_DIR"

echo "🌎 Baixando dados do Sul do Brasil (Geofabrik)..."
wget -N -c "$PBF_URL" -O "$PBF_FILE"

echo "⚙️ Extraindo dados com perfil de veículo (car.lua)..."
docker run --rm -t -v "${OSRM_DIR}:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/$PBF_FILE

echo "🔀 Particionando grafo..."
docker run --rm -t -v "${OSRM_DIR}:/data" osrm/osrm-backend \
  osrm-partition /data/sul-latest.osrm

echo "🎯 Customizando pesos..."
docker run --rm -t -v "${OSRM_DIR}:/data" osrm/osrm-backend \
  osrm-customize /data/sul-latest.osrm

echo "🚀 Iniciando o serviço OSRM permanente..."
docker rm -f $CONTAINER_NAME 2>/dev/null || true

docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p 127.0.0.1:${PORT}:5000 \
  -v "${OSRM_DIR}:/data" \
  osrm/osrm-backend \
  osrm-routed --algorithm mld --max-table-size 500 /data/sul-latest.osrm

echo ""
echo "✅ OSRM está rodando!"
echo "   URL interna: http://localhost:${PORT}"
echo "   Teste: curl 'http://localhost:${PORT}/route/v1/driving/-48.54,-27.59;-48.50,-27.62'"
echo ""
echo "⚠️  Configure a variável de ambiente no backend:"
echo "   OSRM_URL=http://localhost:${PORT}"
