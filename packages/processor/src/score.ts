/**
 * 热度评分：源权重 × 时效衰减（12h半衰期）× 提及量因子 × 严重度因子
 * 归一化到 0-100，作为地图渲染与排序的核心指标。
 */
export interface ScoreInput {
  source: string;
  occurredAt: Date;
  mentionCount: number;
  severity?: number | null;
}

/** 各数据源权威度权重（新闻1.0、官方灾害监测更高） */
const SOURCE_WEIGHTS: Record<string, number> = {
  gdelt: 1.0,
  usgs: 1.6,
  eonet: 1.4,
};

/** 时效半衰期（小时）：超过该时长热度衰减一半 */
const HALF_LIFE_HOURS = 12;

export function computeHeatScore(input: ScoreInput): number {
  const sourceWeight = SOURCE_WEIGHTS[input.source] ?? 1.0;

  const ageHours = Math.max(0, (Date.now() - input.occurredAt.getTime()) / 3_600_000);
  const decay = Math.exp(-(Math.LN2 * ageHours) / HALF_LIFE_HOURS);

  const mentionFactor = 1 + Math.log1p(Math.max(1, input.mentionCount)) / 4;
  const severityFactor = input.severity != null ? 0.8 + input.severity * 0.4 : 1.0;

  const raw = sourceWeight * decay * mentionFactor * severityFactor;
  return Math.round(Math.min(100, raw * 50));
}
