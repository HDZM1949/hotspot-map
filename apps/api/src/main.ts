import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { registerRealtime } from "./realtime";
import { registerEventRoutes } from "./routes/events";
import { registerStatsRoutes } from "./routes/stats";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(cors, { origin: true });
await app.register(websocket);

// 存活探针：进程存活即返回 200
app.get("/healthz", async () => ({ status: "ok" }));

// 就绪探针：依赖（PostgreSQL）可用才返回 200
app.get("/readyz", async (_req, reply) => {
  try {
    const { getDb, schema } = await import("@hotspot-map/processor");
    await getDb().select({ one: schema.events.id }).from(schema.events).limit(1);
    return { status: "ready" };
  } catch (e) {
    app.log.error(e, "readyz 检查失败");
    return reply.code(503).send({ status: "unready" });
  }
});

await registerEventRoutes(app);
await registerStatsRoutes(app);
await registerRealtime(app);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });
