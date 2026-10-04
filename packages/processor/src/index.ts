import type { RawEvent } from "@hotspot-map/shared";

import { publishEvents, type BusEvent } from "./bus";
import { classifyByRootCode } from "./classify";
import { getDb } from "./db/client";
import { normalizeEvent } from "./normalize";
import { computeHeatScore } from "./score";
import { upsertEvent } from "./writer";

export { classifyByRootCode } from "./classify";
export { publishEvents, EVENTS_CHANNEL, type BusEvent } from "./bus";
export { getDb, schema } from "./db/client";
export { haversineKm, findSimilarEvent, titlesSimilar } from "./dedupe";
export type { NewEvent } from "./normalize";
export { fingerprint, normalizeEvent } from "./normalize";
export { computeHeatScore } from "./score";
export { pruneOldEvents, RETENTION_DAYS } from "./retention";
export { upsertEvent } from "./writer";
export type { ProcessedEvent } from "./types";

export interface ProcessResult {
  /** 新插入的事件数 */
  processed: number;
  /** 合并到已有事件数（跨源相似命中） */
  merged: number;
  /** 丢弃数（无有效坐标等） */
  dropped: number;
}

/**
 * 数据处理管道：归一化 → 分类兜底 → 热度评分 → 跨源去重合并 → 入库 → 发布实时通知。
 */
export async function processRawEvents(rawEvents: RawEvent[]): Promise<ProcessResult> {
  const db = getDb();
  const result: ProcessResult = { processed: 0, merged: 0, dropped: 0 };
  const fresh: BusEvent[] = [];

  for (const raw of rawEvents) {
    // 分类兜底：采集器未给出分类时，按 GDELT 事件根编码推断
    const rootCode = raw.meta?.eventRootCode;
    if (!raw.category && rootCode) {
      raw.category = classifyByRootCode(rootCode).category;
    }

    const event = normalizeEvent(raw);
    if (!event) {
      result.dropped++;
      continue;
    }

    const heatScore = computeHeatScore({
      source: event.source,
      occurredAt: event.occurredAt,
      mentionCount: event.mentionCount,
      severity: event.severity,
    });

    const { outcome, id } = await upsertEvent(db, { ...event, heatScore });
    if (outcome === "inserted") {
      result.processed++;
      fresh.push({
        id,
        title: event.title,
        summary: event.summary,
        category: event.category,
        severity: event.severity,
        heatScore,
        lat: event.lat,
        lon: event.lon,
        countryCode: event.countryCode,
        occurredAt: event.occurredAt,
        firstSeenAt: event.firstSeenAt,
        lastSeenAt: event.lastSeenAt,
        mentionCount: event.mentionCount,
        sources: event.source,
      });
    } else {
      result.merged++;
    }
  }

  // 发布实时通知（等待完成，避免调用方进程提前退出导致丢失）
  if (fresh.length > 0) {
    await publishEvents(fresh);
  }

  return result;
}
