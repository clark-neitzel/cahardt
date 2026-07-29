# Build Stage - Cache Bust 2026-02-10
FROM node:20-alpine

# pg_dump p/ o backup automático do banco (backupService). Tenta a versão mais
# nova disponível no Alpine desta imagem; pg_dump novo lê servidor antigo.
RUN apk add --no-cache postgresql17-client \
    || apk add --no-cache postgresql16-client \
    || apk add --no-cache postgresql15-client

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
