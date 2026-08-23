import { createHash } from "node:crypto";

import type { EventCategory, RawEvent } from "@hotspot-map/shared";

/** 待写入数据库的规范化事件（source/sourceId/url 仅用于提及表，不进 events 表） */
export interface NewEvent {
  fingerprint: string;
  title: string;
  summary: string | null;
  category: EventCategory;
  severity: number | null;
  heatScore: number;
  lat: number;
  lon: number;
  countryCode: string | null;
  occurredAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  mentionCount: number;
  source: string;
  sourceId: string;
  url: string | null;
}

const FALLBACK_CATEGORY: EventCategory = "other";

function isValidCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** 生成去重指纹：M1 用 source:sourceId 哈希（M2 引入跨源相似合并） */
export function fingerprint(source: string, sourceId: string): string {
  return createHash("sha256").update(`${source}:${sourceId}`).digest("hex");
}

/** 清洗标题（去空白/控制字符，截断超长标题） */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

/**
 * 归一化：RawEvent → NewEvent。
 * 校验坐标合法性，补齐分类/时间等字段，生成指纹。
 * 返回 null 表示该事件不可用（无坐标等），应被丢弃。
 */
export function normalizeEvent(raw: RawEvent): NewEvent | null {
  if (!raw.lat || !raw.lon || !isValidCoord(raw.lat, raw.lon)) {
    return null;
  }
  const occurredAt =
    raw.occurredAt instanceof Date && !Number.isNaN(raw.occurredAt.getTime())
      ? raw.occurredAt
      : new Date();
  const now = new Date();
  return {
    fingerprint: fingerprint(raw.source, raw.sourceId),
    title: cleanText(raw.title) || `[${raw.source}] 未命名事件`,
    summary: raw.summary ? cleanText(raw.summary) : null,
    category: raw.category ?? FALLBACK_CATEGORY,
    severity:
      raw.severity !== undefined && raw.severity >= 0 && raw.severity <= 1 ? raw.severity : null,
    // M1 简化热度分：0（M2 实现源权重×时效衰减×提及数）
    heatScore: 0,
    lat: raw.lat,
    lon: raw.lon,
    countryCode: null,
    occurredAt,
    firstSeenAt: now,
    lastSeenAt: now,
    mentionCount: 1,
    source: raw.source,
    sourceId: raw.sourceId,
    url: raw.url ?? null,
  };
}
