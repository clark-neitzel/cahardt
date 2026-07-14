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

# Configuração para SPA (React Router) + cache correto + proxy da API.
# - /assets/ (arquivos com hash no nome): cache longo e imutável.
# - index.html e demais: no-cache (sempre revalida via ETag), senão o PWA/iOS
#   fica preso numa versão antiga e nunca pega o JS novo após um deploy.
# - /api e /uploads: repassados ao backend pelo IP fixo do servidor (Traefik do
#   EasyPanel roteia pelo header Host/SNI). Assim o app usa a MESMA origem para a
#   API e funciona em qualquer domínio — em 07/2026 o DNS do easypanel.host caiu
#   no mundo todo e o endereço absoluto do backend derrubou o app inteiro.
#   (O IP 76.13.160.151 é o do próprio servidor EasyPanel, documentado no CLAUDE.md.)
RUN echo 'server { \
    listen 80; \
    include /etc/nginx/mime.types; \
    client_max_body_size 50m; \
    location /assets/ { \
    root /usr/share/nginx/html; \
    expires 1y; \
    add_header Cache-Control "public, immutable"; \
    access_log off; \
    } \
    location /api/ { \
    proxy_pass https://76.13.160.151; \
    proxy_set_header Host cahardt-hardt-backend.xrqvlq.easypanel.host; \
    proxy_ssl_server_name on; \
    proxy_ssl_name cahardt-hardt-backend.xrqvlq.easypanel.host; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_http_version 1.1; \
    proxy_read_timeout 300s; \
    proxy_buffering off; \
    } \
    location /uploads/ { \
    proxy_pass https://76.13.160.151; \
    proxy_set_header Host cahardt-hardt-backend.xrqvlq.easypanel.host; \
    proxy_ssl_server_name on; \
    proxy_ssl_name cahardt-hardt-backend.xrqvlq.easypanel.host; \
    proxy_http_version 1.1; \
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
