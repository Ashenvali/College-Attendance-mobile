FROM node:22.13.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN npm ci --include=dev --workspace=@bitsknl/api --workspace=@bitsknl/web --include-workspace-root=false --no-audit --no-fund

COPY . .
# The web portal and the Expo web build both talk to /api on the same origin, so the mobile
# bundle is exported with the relative API base URL (no host is baked into the client).
RUN npm run build
RUN npm run mobile:export

FROM node:22.13.0-bookworm-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN npm ci --omit=dev --workspace=@bitsknl/api --include-workspace-root=false --no-audit --no-fund

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/certs/supabase-prod-ca-2021.crt ./apps/api/certs/supabase-prod-ca-2021.crt
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/mobile/dist ./apps/mobile/dist
COPY --from=build /app/docs ./docs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
