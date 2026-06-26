# Build Stage - Updated for Node 20
FROM node:20-alpine as build-stage

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production Stage
FROM nginx:alpine

COPY --from=build-stage /app/dist /usr/share/nginx/html

# Configuração para SPA (React Router) + cache correto.
# - /assets/ (arquivos com hash no nome): cache longo e imutável.
# - index.html e demais: no-cache (sempre revalida via ETag), senão o PWA/iOS
#   fica preso numa versão antiga e nunca pega o JS novo após um deploy.
RUN echo 'server { \
    listen 80; \
    include /etc/nginx/mime.types; \
    location /assets/ { \
    root /usr/share/nginx/html; \
    expires 1y; \
    add_header Cache-Control "public, immutable"; \
    access_log off; \
    } \
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    add_header Cache-Control "no-cache"; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
