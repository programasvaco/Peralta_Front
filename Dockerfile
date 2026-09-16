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

COPY --from=build /app/dist/coreui-free-angular-admin-template/browser /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
