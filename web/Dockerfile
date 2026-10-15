# syntax=docker/dockerfile:1
#
# Production image for the web app: Next.js's self-contained server
# (`output: "standalone"`), server-side rendering included.
#
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://bunny.example/api/v2 -t bunny-web .
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build
# arguments; API_INTERNAL_URL (where the server reaches the API privately) is a
# runtime environment variable.

# ---- dependencies ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the only install script is the git-hook setup, which has no
# business in an image.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# ---- build ----------------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_REALTIME_URL=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Without an API URL the app would build as the self-contained demo (MSW and a
# scripted opponent) — never what a deployment wants, so refuse instead.
RUN test -n "$NEXT_PUBLIC_API_URL" \
      || { echo "error: --build-arg NEXT_PUBLIC_API_URL is required" >&2; exit 1; } \
 && if [ -z "$NEXT_PUBLIC_REALTIME_URL" ]; then unset NEXT_PUBLIC_REALTIME_URL; fi \
 && npm run build

# ---- runtime --------------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# The standalone server plus the two things it does not bundle: static assets
# and the public folder.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
