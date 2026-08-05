# syntax=docker/dockerfile:1.7
# =============================================================================
# TenantOS backend — multi-stage build
# =============================================================================
# Layers are ordered by how often they change: base image, then dependencies,
# then source. Editing a source file rebuilds one layer, not an npm install.
#
# The final image contains no compiler, no dev dependencies, and no source —
# only `dist/`, production `node_modules`, and the Prisma schema. Smaller image,
# faster pulls, and a much smaller set of things a CVE scanner can find.
# =============================================================================

ARG NODE_VERSION=20.19-alpine3.20

# -----------------------------------------------------------------------------
# base — shared by every stage so they cannot drift apart
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
# Prisma's query engine links against OpenSSL. Alpine ships without it, and the
# failure mode is a runtime error on the first query rather than a build error.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production

# -----------------------------------------------------------------------------
# deps — production dependencies only
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` (not `install`): installs exactly the lockfile, fails if it is out of
# date with package.json, and never rewrites it — a build must not silently
# resolve a different version than CI tested.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts && \
    # Ignoring scripts skipped Prisma's postinstall, so generate explicitly.
    npx prisma generate

# -----------------------------------------------------------------------------
# build — full toolchain, compiled output
# -----------------------------------------------------------------------------
FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# runner — what actually ships
# -----------------------------------------------------------------------------
FROM base AS runner

# tini as PID 1. Node does not reap zombies and, more importantly, a process
# started directly by Docker gets no default signal handlers — SIGTERM would be
# ignored and every deploy would end in a SIGKILL, dropping in-flight requests.
RUN apk add --no-cache tini curl

# Non-root. The node image ships a `node` user (uid 1000); reusing it avoids the
# usual mistake of creating a user but leaving files owned by root.
ENV NODE_ENV=production \
    APP_PORT=3000 \
    APP_HOST=0.0.0.0 \
    # Container memory is not the same as heap size. Without this, V8 sizes the
    # heap from the *host's* memory and the OOM killer takes the container long
    # before the GC feels any pressure.
    NODE_OPTIONS="--max-old-space-size=384"

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
# Needed at runtime by `prisma migrate deploy` in the release step.
COPY --chown=node:node prisma ./prisma

USER node
EXPOSE 3000

# Compose and standalone Docker use this. Kubernetes ignores it in favour of the
# probes in the manifest — the readiness/liveness split matters there and a
# single HEALTHCHECK cannot express it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${APP_PORT}/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
