# ─────────────────────────────────────────────────────────────
#  Quiz_Rush · servidor de tiempo real (Socket.IO)
#  Construir desde la RAÍZ del monorepo:
#    docker build -f apps/realtime/Dockerfile -t quiz-rush-realtime .
#  Varias réplicas detrás de un balanceador comparten las partidas a través de Redis.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/realtime/package.json apps/realtime/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN npm ci --ignore-scripts --workspace @quiz-rush/realtime --workspace @quiz-rush/db --workspace @quiz-rush/shared --include-workspace-root
COPY . .
# Cliente de Prisma (guardado de respuestas y resultados) y empaquetado del servidor
RUN npm run generate -w @quiz-rush/db \
  && npm run build -w @quiz-rush/realtime \
  && npm prune --omit=dev --workspace @quiz-rush/realtime --workspace @quiz-rush/db --workspace @quiz-rush/shared

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production REALTIME_PORT=4000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/realtime/dist ./dist
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
