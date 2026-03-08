---
name: 09-servidor-osrm
description: 🗺️ SERVIDOR OSRM. Documentação de instalação e configuração do servidor local de rotas OSRM (Docker) com dados do Sul do Brasil.
---

# Instalação e Configuração do Servidor OSRM

Este documento descreve os passos exatos utilizados para instalar, processar os dados e rodar o servidor OSRM (Open Source Routing Machine) utilizando Docker, focado na região Sul do Brasil. 

Sempre consulte esta documentação caso precise recriar o servidor em uma nova máquina ou atualizar a base de mapas.

## Pré-requisitos
- Servidor Linux com Docker instalado.
- Privilégios de `root` ou equivalente (`sudo`).

## Passo a Passo Executado

### 1. Preparação do Diretório
Criado o diretório padrão para armazenar todos os dados espaciais e processados:
```bash
mkdir -p /opt/osrm-data && cd /opt/osrm-data
```

### 2. Download do Mapa (Geofabrik)
Baixado o arquivo consolidado de mapa PBF (`.osm.pbf`) da região Sul do Brasil (aprox. 392 MB):
```bash
wget -c https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf
```

### 3. Extração dos Dados (Car Profile)
Utilizado o container `osrm-backend` para extrair os nós e vias focando no roteamento de veículos (perfil `car.lua`):
```bash
docker run --rm -t -v /opt/osrm-data:/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/sul-latest.osm.pbf
```
*(Este processo extrai regras de conversão, limites de velocidade e vias navegáveis).*

### 4. Particionamento (MLD - Multi-Level Dijkstra)
O algoritmo adotado foi o MLD (mais flexível para atualizações rápidas de trânsito se necessário no futuro):
```bash
docker run --rm -t -v /opt/osrm-data:/data osrm/osrm-backend osrm-partition /data/sul-latest.osrm
```

### 5. Customização
Etapa final de cálculo dos pesos (tempos de viagem, distâncias) das rotas particionadas:
```bash
docker run --rm -t -v /opt/osrm-data:/data osrm/osrm-backend osrm-customize /data/sul-latest.osrm
```

### 6. Subir o Serviço de Roteamento (Daemon)
O servidor foi instanciado mapeando a porta local `5100`. Ele possui `--max-table-size 500` para permitir cálculos de Matriz (Table API) razoáveis para várias entregas simultâneas.
```bash
docker run -d \
  --name osrm-routing \
  --restart unless-stopped \
  -p 127.0.0.1:5100:5000 \
  -v /opt/osrm-data:/data \
  osrm/osrm-backend \
  osrm-routed --algorithm mld --max-table-size 500 /data/sul-latest.osrm
```

## Como Integrar (Uso Interno)

A API do OSRM ficará disponível no host via:
`http://127.0.0.1:5100`

Se você tiver um proxy reverso (Nginx) ou for consumir do backend local no mesmo servidor:
- **Routes API:** `http://127.0.0.1:5100/route/v1/driving/-49.2,-25.4;-48.6,-26.8?overview=false`
- **Table API (Matriz de Distâncias):** `http://127.0.0.1:5100/table/v1/driving/lon1,lat1;lon2,lat2;lon3,lat3`
