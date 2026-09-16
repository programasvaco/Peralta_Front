# syntax=docker/dockerfile:1

# ---------- Etapa 1: build Angular ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

# ---------- Etapa 2: runtime (nginx sirviendo estáticos) ----------
FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY --from=build /app/dist/coreui-free-angular-admin-template/browser /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
