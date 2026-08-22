import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema } from "./db/client";
import { findSimilarEvent } from "./dedupe";
import type { NewEvent } from "./normalize";

export type UpsertOutcome = "inserted" | "merged";

export interface UpsertResult {
  outcome: UpsertOutcome;
  /** 插入/合并后的事件数据库 id（merged 时返回已存在事件的 id） */
  id: string;
}

/**
 * 单事件写入：
 * 1. 跨源相似检测（12h/100km/标题相似）→ 命中则合并到已有事件
 *    （mention_count+1、刷新 last_seen_at、热度取更大值、补记 mention）
 * 2. 未命中 → 按 fingerprint 幂等插入（同源重复采集仅刷新 last_seen_at）
 */
export async function upsertEvent(
  db: NodePgDatabase<typeof schema>,
  event: NewEvent & { heatScore: number },
): Promise<UpsertResult> {
  const similar = await findSimilarEvent(db, event);
  if (similar) {
    await db
      .update(schema.events)
      .set({
        mentionCount: sql`${schema.events.mentionCount} + 1`,
        lastSeenAt: new Date(),
        heatScore: sql`GREATEST(${schema.events.heatScore}, ${event.heatScore})`,
      })
      .where(eq(schema.events.id, similar.id));
    await insertMention(db, similar.id, event);
    return { outcome: "merged", id: similar.id };
  }

  const inserted = await db
    .insert(schema.events)
    .values({
      fingerprint: event.fingerprint,
      title: event.title,
      summary: event.summary,
      category: event.category,
      severity: event.severity,
      heatScore: event.heatScore,
      lat: event.lat,
      lon: event.lon,
      countryCode: event.countryCode,
      occurredAt: event.occurredAt,
      firstSeenAt: event.firstSeenAt,
      lastSeenAt: event.lastSeenAt,
      mentionCount: event.mentionCount,
    })
    .onConflictDoUpdate({
      target: schema.events.fingerprint,
      set: { lastSeenAt: new Date() },
    })
    .returning({ id: schema.events.id });

  const insertedRow = inserted[0];
  if (!insertedRow) {
    throw new Error(`事件写入失败: ${event.fingerprint}`);
  }
  await insertMention(db, insertedRow.id, event);
  return { outcome: "inserted", id: insertedRow.id };
}

async function insertMention(
  db: NodePgDatabase<typeof schema>,
  eventId: string,
  event: NewEvent,
): Promise<void> {
  await db
    .insert(schema.eventMentions)
    .values({
      eventId,
      source: event.source,
      sourceId: event.sourceId,
      url: event.url,
      title: event.title,
    })
    .onConflictDoNothing();
}
