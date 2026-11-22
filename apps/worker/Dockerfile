# ─────────────────────────────────────────────────────────────
#  Quiz_Rush · worker de trabajos en segundo plano (BullMQ)
#  Construir desde la RAÍZ del monorepo:
#    docker build -f apps/worker/Dockerfile -t quiz-rush-worker .
#  Variables: REDIS_URL, JOBS_SECRET y WEB_INTERNAL_URL (URL interna de la web).
#  Se pueden tener varias réplicas: BullMQ reparte los trabajos sin repetirlos.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN npm ci --ignore-scripts --workspace @quiz-rush/worker --workspace @quiz-rush/shared --include-workspace-root
COPY . .
RUN npm run build -w @quiz-rush/worker \
  && npm prune --omit=dev --workspace @quiz-rush/worker --workspace @quiz-rush/shared

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production WORKER_PORT=4100
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/worker/dist ./dist
USER app
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:4100/health || exit 1
CMD ["node", "dist/index.js"]
