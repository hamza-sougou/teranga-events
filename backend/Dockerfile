# Build context is the repo root (npm workspaces — node_modules is hoisted
# there), not backend/. See docker-compose.yml: `build.context: .`,
# `build.dockerfile: backend/Dockerfile`.

FROM node:20-slim AS deps
WORKDIR /app
# Prisma's query engine needs libssl at generate time too — without it here,
# `prisma generate` silently guesses the wrong OpenSSL version (falls back
# to 1.1.x) and produces an engine binary that then fails to load at runtime
# against Debian bookworm's actual OpenSSL 3.0.x. Confirmed the hard way.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY backend backend
COPY db db
RUN npm run prisma:generate --workspace=backend
RUN npm run build --workspace=backend

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# npm workspaces hoists everything to the root node_modules — there is no
# separate backend/node_modules to copy.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json

EXPOSE 3000
CMD ["node", "backend/dist/src/main.js"]
