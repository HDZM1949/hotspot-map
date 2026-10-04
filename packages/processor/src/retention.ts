import { lt } from "drizzle-orm";

import { getDb, schema } from "./db/client";

/** 事件保留天数：超过该期限的旧事件会被永久删除 */
export const RETENTION_DAYS = 7;

/**
 * 清理超过保留期的旧事件。
 * event_mentions 通过外键 ON DELETE CASCADE 一并删除。
 * @param days 保留天数（默认 RETENTION_DAYS）
 * @returns 被删除的事件数
 */
export async function pruneOldEvents(days: number = RETENTION_DAYS): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const deleted = await db
    .delete(schema.events)
    .where(lt(schema.events.occurredAt, cutoff))
    .returning({ id: schema.events.id });
  return deleted.length;
}
