# === Builder ===
FROM node:20-alpine AS builder

WORKDIR /app

# Backend deps
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY nest-cli.json tsconfig*.json ./
COPY src ./src

# Frontend deps + build (API в web через api.config.ts)
COPY web/package*.json web/
RUN cd web && if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY web web
RUN cd web && npm run build

# Nest build
RUN npm run build

# === Production ===
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

# Проверка: без dist/main.js контейнер падает с MODULE_NOT_FOUND
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found. Rebuild with: docker compose build --no-cache" && exit 1)

EXPOSE 3000

CMD ["node", "dist/main.js"]
