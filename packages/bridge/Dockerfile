FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci --omit=dev --workspace=@makgrill/shared --workspace=@makgrill/bridge

COPY packages/shared packages/shared
COPY packages/bridge packages/bridge

ENV NODE_ENV=production
ENV BRIDGE_PORT=80
EXPOSE 80

CMD ["npx", "tsx", "packages/bridge/src/index.ts"]
