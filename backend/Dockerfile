# Build Stage - Cache Bust 2026-02-10
FROM node:20-alpine

# pg_dump do backup automático e do GET /api/analytics/v1/backup.
# O Postgres do serviço hardtapp é 17 (backend/docs/backup-restauracao.md).
# pg_dump mais antigo recusa o servidor ("server version mismatch"). Sem
# fallback: uma imagem com o client 16 subiria e o backup falharia em silêncio.
RUN apk add --no-cache postgresql17-client

WORKDIR /app

COPY package*.json ./
# patches/ precisa existir ANTES do npm install (o postinstall roda patch-package)
COPY patches ./patches
RUN npm install

COPY . .

# Gera o Prisma Client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]
