FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci --workspace=@makgrill/shared --workspace=@makgrill/web

COPY packages/shared packages/shared
COPY packages/web packages/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @makgrill/web

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder /app/packages/web/public ./packages/web/public

EXPOSE 3000
CMD ["node", "packages/web/server.js"]
