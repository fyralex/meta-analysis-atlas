# The frontend (#144): the production build, served by nginx, which also passes /api and /health to the
# backend. Built from the repository root, because the build reads the generated map in spec/:
#   docker build -f frontend/Dockerfile .
FROM node:22.21.1-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend
COPY spec ./spec
COPY frontend ./frontend
RUN npm --prefix frontend run build

FROM nginxinc/nginx-unprivileged:1.28.0-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# the build's base path is /meta-analysis-atlas/, as on GitHub Pages
COPY --from=build /src/frontend/dist /usr/share/nginx/html/meta-analysis-atlas
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/meta-analysis-atlas/ || exit 1
