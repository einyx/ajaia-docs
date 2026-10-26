# Container image for Ajaia Docs — the portable deployment path.
#
# The primary deployment is Cloudflare Workers + D1 (see wrangler.jsonc), which
# has no container at all. This image exists for the "run it anywhere else"
# case: the same Hono app and the same SQL, on Node, with a local SQLite file.
#
#   docker build -t ajaia-docs .
#   docker run -p 8787:8787 -v ajaia-data:/data ajaia-docs
#
# Kubernetes: see deploy/k8s/ — a plain Deployment + Service, deliberately not a
# Helm chart (see the note in deploy/k8s/README.md).

FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    AJAIA_DB=/data/ajaia.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/shared ./src/shared
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787

CMD ["node", "--experimental-strip-types", "src/server/standalone.ts"]
