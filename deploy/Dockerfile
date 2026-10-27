# Production images (phase-19-plan.md §3). Not used in development or CI.
# Targets:
#   api     the Express API (node apps/api/src/main.ts), production dependencies only
#   migrate the same code with the Prisma CLI, run once per release
#           (prisma migrate deploy); it also carries deploy/compose.production.yaml
#   web     Caddy with the storefront and admin builds and the Caddyfile
# Build from the repository root:
#   docker build -f deploy/Dockerfile --target api -t sanea-api .

FROM node:24.11.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/storefront/package.json apps/storefront/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts && npm rebuild sharp
COPY . .
# NODE_ENV=production for the builds, so React's production build is bundled.
RUN npx prisma generate \
  && NODE_ENV=production npm run build -w @sanea/storefront \
  && NODE_ENV=production npm run build -w @sanea/admin

FROM build AS migrate
ENV NODE_ENV=production
# Prisma takes its own TLS parameters (MIGRATE_DATABASE_URL, deploy/runbook.md).
CMD ["sh", "-c", "DATABASE_URL=\"${MIGRATE_DATABASE_URL:-$DATABASE_URL}\" exec npx prisma migrate deploy"]

FROM build AS prune
RUN npm prune --omit=dev

FROM node:24.11.0-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /app/package.json /app/package-lock.json ./
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/packages ./packages
COPY --from=prune /app/apps/api ./apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/api/src/main.ts"]

FROM caddy:2.10.2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/storefront/dist /srv/storefront
COPY --from=build /app/apps/admin/dist /srv/admin
