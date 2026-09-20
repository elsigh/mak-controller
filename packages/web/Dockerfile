FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/web/package.json packages/web/package.json

# Include optional native deps. npm ci on linux/arm64 still often skips the
# host lightningcss / @tailwindcss/oxide binary even when the lockfile lists
# it. Pin versions to the optionalDependencies in packages/web/package.json
# (lightningcss does not export ./package.json, so we cannot require it).
RUN npm ci --include=optional --workspace=@makgrill/shared --workspace=@makgrill/web \
  && ARCH="$(uname -m)" \
  && case "$ARCH" in \
       aarch64|arm64) LC="lightningcss-linux-arm64-gnu"; OX="@tailwindcss/oxide-linux-arm64-gnu" ;; \
       x86_64|amd64)  LC="lightningcss-linux-x64-gnu"; OX="@tailwindcss/oxide-linux-x64-gnu" ;; \
       *) echo "unsupported arch: $ARCH" && exit 1 ;; \
     esac \
  && LC_VER=1.32.0 \
  && OX_VER=4.3.3 \
  && echo "Installing Tailwind native binaries for $ARCH: ${LC}@${LC_VER} ${OX}@${OX_VER}" \
  && npm install --no-save --no-package-lock --workspace=@makgrill/web "${LC}@${LC_VER}" "${OX}@${OX_VER}" \
  && node -e "process.chdir('packages/web'); require('lightningcss'); require('@tailwindcss/oxide'); console.log('native css toolchain ok')"

COPY packages/shared packages/shared
COPY packages/web packages/web

ENV NEXT_TELEMETRY_DISABLED=1
ARG GIT_COMMIT=
ARG NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NEXT_PUBLIC_GIT_COMMIT=$NEXT_PUBLIC_GIT_COMMIT
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
