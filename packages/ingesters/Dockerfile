FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --config.confirmModulesPurge=false
RUN pnpm --filter @hotspot-map/ingesters build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/packages/ingesters/dist ./packages/ingesters/dist
COPY --from=build /app/node_modules ./node_modules
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
CMD ["node", "packages/ingesters/dist/scheduler.js"]
