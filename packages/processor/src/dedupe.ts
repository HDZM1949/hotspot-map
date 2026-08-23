import { and, between, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema } from "./db/client";
import type { NewEvent } from "./normalize";

/** 相似判定参数 */
const TIME_WINDOW_MS = 12 * 3_600_000; // ±12小时
const MAX_DISTANCE_KM = 100; // 100km 内
const LON_LAT_PAD = 1.0; // 初筛 bbox 外扩约111km

/** Haversine 距离（km） */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 标题归一化：小写、去标点符号 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Levenshtein 编辑距离（截断前 40 字符控制开销） */
function levenshtein(a: string, b: string): number {
  const sa = a.slice(0, 40);
  const sb = b.slice(0, 40);
  const m = sa.length;
  const n = sb.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + (sa[i - 1] === sb[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n]!;
}

/** 标题相似：完全相同 / 互相包含 / 编辑距离 ≤3 */
export function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return levenshtein(na, nb) <= 3;
}

interface SimilarCandidate {
  id: string;
  title: string;
  lat: number;
  lon: number;
}

/**
 * 跨源相似检测：在时间窗口 ±12h、bbox ±1° 内检索候选，
 * 命中条件：Haversine 距离 ≤100km 且标题相似。
 * 返回已存在的事件（用于合并），无则 null。
 */
export async function findSimilarEvent(
  db: NodePgDatabase<typeof schema>,
  event: NewEvent,
): Promise<SimilarCandidate | null> {
  const windowStart = new Date(event.occurredAt.getTime() - TIME_WINDOW_MS);
  const windowEnd = new Date(event.occurredAt.getTime() + TIME_WINDOW_MS);

  const candidates = await db
    .select({
      id: schema.events.id,
      title: schema.events.title,
      lat: schema.events.lat,
      lon: schema.events.lon,
    })
    .from(schema.events)
    .where(
      and(
        gte(schema.events.occurredAt, windowStart),
        lte(schema.events.occurredAt, windowEnd),
        between(schema.events.lat, event.lat - LON_LAT_PAD, event.lat + LON_LAT_PAD),
        between(schema.events.lon, event.lon - LON_LAT_PAD, event.lon + LON_LAT_PAD),
      ),
    )
    .limit(20);

  for (const c of candidates) {
    if (
      haversineKm(c.lat, c.lon, event.lat, event.lon) <= MAX_DISTANCE_KM &&
      titlesSimilar(c.title, event.title)
    ) {
      return c;
    }
  }
  return null;
}
