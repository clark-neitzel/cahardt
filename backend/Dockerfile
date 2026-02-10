FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Gera o Prisma Client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]
