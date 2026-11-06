FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM build AS test
COPY test ./test
RUN npm test

FROM build AS integration-test
COPY test ./test
USER node
CMD ["node", "--test", "test/events.integration.mjs"]

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM production-dependencies AS schema-test
COPY --chown=node:node test/schema.integration.mjs ./test/schema.integration.mjs
USER node
CMD ["node", "test/schema.integration.mjs"]

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/check-vendor.mjs ./scripts/check-vendor.mjs
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
