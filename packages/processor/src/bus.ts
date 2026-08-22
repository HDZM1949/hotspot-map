import type pg from "pg";

import { getDb } from "./db/client";

/**
 * 事件总线（M3 用 PostgreSQL LISTEN/NOTIFY 实现）。
 * 采集进程写库后发布事件，API 进程 LISTEN 同一频道并转发给 WebSocket 客户端。
 * 后续如需多实例水平扩展，可将 publishEvents 替换为 Redis Pub/Sub 实现，接口不变。
 */

export interface BusEvent {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  severity: number | null;
  heatScore: number;
  lat: number;
  lon: number;
  countryCode: string | null;
  occurredAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  mentionCount: number;
  sources: string;
}

export const EVENTS_CHANNEL = "events_new";

/** PG NOTIFY payload 硬上限 8000 字节，留 10% 余量按块发送 */
const MAX_PAYLOAD_BYTES = 7000;

/**
 * 发布新事件（分块，避免超过 NOTIFY payload 上限）。
 * 失败仅告警不阻断主流程（实时链路是增强，不是数据正确性依赖）。
 */
export async function publishEvents(events: BusEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const pool = getDb().$client as pg.Pool;
    const blocks: string[] = [];
    let block: BusEvent[] = [];
    let size = 0;
    for (const ev of events) {
      const item = JSON.stringify(ev);
      if (size + item.length > MAX_PAYLOAD_BYTES && block.length > 0) {
        blocks.push(JSON.stringify(block));
        block = [];
        size = 0;
      }
      block.push(ev);
      size += item.length + 1;
    }
    if (block.length > 0) blocks.push(JSON.stringify(block));

    for (const payload of blocks) {
      await pool.query("SELECT pg_notify($1, $2)", [EVENTS_CHANNEL, payload]);
    }
  } catch (e) {
    console.warn("[bus] 发布事件通知失败:", (e as Error).message);
  }
}
