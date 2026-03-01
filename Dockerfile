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

# NestJS может собрать в dist/main.js или dist/src/main.js
RUN test -f dist/main.js || test -f dist/src/main.js || (echo "ERROR: main.js not found. dist contents:" && ls -laR dist && exit 1)

EXPOSE 3000

# NestJS собирает в dist/src/main.js
CMD ["node", "dist/src/main.js"]
