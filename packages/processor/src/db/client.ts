import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { eventMentionsTable, eventsTable } from "./schema";

export const schema = { events: eventsTable, eventMentions: eventMentionsTable };

let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://hotspot:hotspot@localhost:5432/hotspot_map",
    max: 10,
  });
  return drizzle(pool, { schema });
}

/** 获取全局唯一的 drizzle 实例（懒加载单例） */
export function getDb() {
  cached ??= createDb();
  return cached;
}
