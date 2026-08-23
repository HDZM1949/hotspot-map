import { z } from "zod";

/** 事件分类（多语言关键词规则库的顶层枚举） */
export const EventCategorySchema = z.enum([
  "disaster",
  "conflict",
  "politics",
  "economy",
  "tech",
  "sports",
  "science",
  "weather",
  "other",
]);

export type EventCategory = z.infer<typeof EventCategorySchema>;

/** 采集器产出的统一原始事件（处理管道入口） */
export interface RawEvent {
  /** 数据源标识：gdelt | usgs | openmeteo | reddit | rss ... */
  source: string;
  /** 源内唯一 ID，用于幂等去重 */
  sourceId: string;
  title: string;
  summary?: string;
  url?: string;
  /** 缺失坐标的事件将交给地理编码模块兜底 */
  lat?: number;
  lon?: number;
  occurredAt: Date;
  category?: EventCategory;
  /** 严重度 0~1（可选） */
  severity?: number;
  /** 数据源特有元数据（如 GDELT 的 eventRootCode），处理器按需消费 */
  meta?: Record<string, string>;
}

/** 规范化后的事件（对应数据库 events 表，API 返回结构） */
export interface NormalizedEvent {
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
}

/** 事件查询参数（GET /api/events） */
export interface EventQuery {
  /** 视野范围 [west, south, east, north] */
  bbox: [number, number, number, number];
  from?: Date;
  to?: Date;
  category?: EventCategory;
  limit: number;
}

/** WebSocket 消息（M3 实现） */
export interface WSMessage {
  type: "events:new" | "events:update" | "events:expire";
  payload: NormalizedEvent[];
}
