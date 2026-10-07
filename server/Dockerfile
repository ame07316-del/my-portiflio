# Sovereign Server — production image
#
# Build context MUST be the repository root (the server compiles shared
# modules from ../web/src, mirroring the local tsconfig rootDir ".."):
#
#   docker build -f server/Dockerfile -t sovereign-server .
#
# Run:
#   docker run -d --name sovereign \
#     -p 8081:8081 -p 9443:9443/udp \
#     -e MASTER_SECRET="$(openssl rand -base64 48)" \
#     -e IDEMPOTENCY_SECRET="$(openssl rand -base64 48)" \
#     -e DB_DIR=/data/pg \
#     -v sovereign-data:/data \
#     sovereign-server

FROM node:22-alpine AS build
WORKDIR /repo

# Shared sources (compiled into the server output; no web runtime needed).
COPY web/ web/

# Server dependencies (PGlite is a RUNTIME dep: it is the embedded engine).
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci

COPY server/ server/
RUN cd server && npm run build

# ---- runtime: code + runtime deps only, no toolchain ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/server/package.json /repo/server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/server/dist ./dist

# HTTP control plane + UDP edge gateway
EXPOSE 8081
EXPOSE 9443/udp

# Least privilege: run as the built-in node user.
USER node

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1

CMD ["node", "dist/server/src/control-plane.js"]
