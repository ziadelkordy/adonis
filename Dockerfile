# Single image that serves the built frontend and the API together.
#
# One process keeps sharing simple: same origin, so the session cookie needs no
# CORS or SameSite special-casing, and there's one thing to deploy and one URL to
# send people.

FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable

# Manifests first, so a dependency-free code change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app

RUN corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
# Production dependencies only — the frontend is already compiled to static files.
RUN pnpm install --frozen-lockfile --prod

COPY server ./server
COPY --from=build /app/dist ./dist

# Same port the platform will probe.
ENV PORT=8787
EXPOSE 8787

# Run from /app, not from server/. `pnpm --filter` changes the working directory
# to the package, which broke static-asset resolution in the container.
# Migrations run on boot so a deploy can't get ahead of its schema.
CMD ["sh", "-c", "node --experimental-strip-types server/src/migrate.ts && node --experimental-strip-types server/src/index.ts"]
