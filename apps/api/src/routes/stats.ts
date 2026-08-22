import { desc, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@hotspot-map/processor";
import type { FastifyInstance } from "fastify";

/** 统计面板数据：总量 / 分类分布 / 24h 新增 / 热度 TOP10 */
export async function registerStatsRoutes(app: FastifyInstance) {
  app.get("/api/stats/summary", async () => {
    const db = getDb();

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.events);

    const byCategory = await db
      .select({
        category: schema.events.category,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.events)
      .groupBy(schema.events.category)
      .orderBy(desc(sql`count(*)`));

    const since24h = new Date(Date.now() - 24 * 3600_000);
    const [last24hRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(gte(schema.events.firstSeenAt, since24h));

    const top = await db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        category: schema.events.category,
        heatScore: schema.events.heatScore,
        lat: schema.events.lat,
        lon: schema.events.lon,
      })
      .from(schema.events)
      .orderBy(desc(schema.events.heatScore))
      .limit(10);

    return {
      total: totalRow?.count ?? 0,
      byCategory,
      last24h: last24hRow?.count ?? 0,
      top,
    };
  });
}
