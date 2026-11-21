# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# ---------- deps: tidak ada native module, jadi tidak perlu toolchain ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM deps AS build
COPY . .
RUN npx prisma generate --config prisma7.config.ts
RUN npm run build

# Image ini KHUSUS untuk api. Migrasi database dijalankan manual dari laptop:
#   npx prisma migrate deploy --config prisma7.config.ts

# ---------- prod-deps ----------
FROM deps AS prod-deps
# @prisma/client punya peerOptional ke `prisma` & `typescript`, jadi `--omit=dev`
# tetap menyimpannya (~250 MB: CLI, Studio, PGlite, ...). Buang manual: Prisma CLI
# hanya dibutuhkan stage migrate. Prune kedua membersihkan typescript yang tersisa.
RUN npm prune --omit=dev \
  && npm uninstall prisma typescript --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm prune --omit=dev

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production \
  PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

RUN mkdir -p /app/logs && chown node:node /app/logs

USER node
EXPOSE 3000
CMD ["node", "dist/src/main"]
