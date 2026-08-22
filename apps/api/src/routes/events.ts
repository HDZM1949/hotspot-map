import { and, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@hotspot-map/processor";
import { EventCategorySchema } from "@hotspot-map/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const EventQuerySchema = z.object({
  // 地图可横向无限滚动，bbox 可能轻微越界：放宽校验（±5°），查询前再钳制
  west: z.coerce.number().min(-185).max(185).default(-180),
  south: z.coerce.number().min(-95).max(95).default(-90),
  east: z.coerce.number().min(-185).max(185).default(180),
  north: z.coerce.number().min(-95).max(95).default(90),
  category: EventCategorySchema.optional(),
  /** 来源筛选：逗号分隔，如 source=gdelt,usgs */
  source: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  /** 关键词搜索：标题/摘要模糊匹配 */
  q: z.string().max(100).optional(),
});

export async function registerEventRoutes(app: FastifyInstance) {
  app.get("/api/events", async (req, reply) => {
    const parsed = EventQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors });
    }
    const q = parsed.data;
    // 钳制到合法地理范围，防止越界值导致查询语义错误
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const west = clamp(q.west, -180, 180);
    const east = clamp(q.east, -180, 180);
    const south = clamp(q.south, -90, 90);
    const north = clamp(q.north, -90, 90);
    const db = getDb();

    const conditions = [
      gte(schema.events.lat, south),
      lte(schema.events.lat, north),
      gte(schema.events.lon, west),
      lte(schema.events.lon, east),
    ];
    if (q.category) conditions.push(eq(schema.events.category, q.category));
    if (q.q) {
      const like = `%${q.q.trim()}%`;
      conditions.push(or(ilike(schema.events.title, like), ilike(schema.events.summary, like))!);
    }
    if (q.source) {
      const sources = q.source.split(",").map((s) => s.trim()).filter(Boolean);
      if (sources.length > 0) {
        conditions.push(
          exists(
            db
              .select({ id: schema.eventMentions.id })
              .from(schema.eventMentions)
              .where(
                and(
                  eq(schema.eventMentions.eventId, schema.events.id),
                  inArray(schema.eventMentions.source, sources),
                ),
              ),
          ),
        );
      }
    }
    if (q.from) conditions.push(gte(schema.events.occurredAt, new Date(q.from)));
    if (q.to) conditions.push(lte(schema.events.occurredAt, new Date(q.to)));

    const rows = await db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        summary: schema.events.summary,
        category: schema.events.category,
        severity: schema.events.severity,
        heatScore: schema.events.heatScore,
        lat: schema.events.lat,
        lon: schema.events.lon,
        countryCode: schema.events.countryCode,
        occurredAt: schema.events.occurredAt,
        firstSeenAt: schema.events.firstSeenAt,
        lastSeenAt: schema.events.lastSeenAt,
        mentionCount: schema.events.mentionCount,
        /** 聚合该事件的全部来源（供前端展示来源徽标） */
        sources: sql<string>`(
          SELECT string_agg(DISTINCT source, ',') FROM event_mentions WHERE event_id = "events"."id"
        )`,
      })
      .from(schema.events)
      .where(and(...conditions))
      .orderBy(desc(schema.events.heatScore), desc(schema.events.occurredAt))
      .limit(q.limit);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      category: r.category,
      severity: r.severity,
      heatScore: r.heatScore,
      lat: r.lat,
      lon: r.lon,
      countryCode: r.countryCode,
      occurredAt: r.occurredAt,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      mentionCount: r.mentionCount,
      sources: r.sources ?? "",
    }));
  });

  app.get("/api/events/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const row = await db.query.events.findFirst({ where: (t, { eq }) => eq(t.id, id) });
    if (!row) {
      return reply.code(404).send({ error: "事件不存在" });
    }
    return row;
  });
}
