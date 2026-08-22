FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --config.confirmModulesPurge=false
RUN pnpm --filter @hotspot-map/api build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
