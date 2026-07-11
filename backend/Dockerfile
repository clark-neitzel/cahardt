# Build Stage - Cache Bust 2026-02-10
FROM node:20-alpine

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
