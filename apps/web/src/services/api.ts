export interface MapEvent {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  severity: number | null;
  heatScore: number;
  lat: number;
  lon: number;
  countryCode: string | null;
  occurredAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  mentionCount: number;
  /** 逗号分隔的来源列表（gdelt,usgs,eonet） */
  sources: string;
}

export interface CategoryStat {
  category: string;
  count: number;
}

export interface StatsSummary {
  total: number;
  byCategory: CategoryStat[];
  last24h: number;
  top: Array<{
    id: string;
    title: string;
    category: string;
    heatScore: number;
    lat: number;
    lon: number;
  }>;
}

export async function fetchEvents(
  bbox: [number, number, number, number],
  limit = 800,
  category?: string,
  source?: string,
  q?: string,
): Promise<MapEvent[]> {
  const [west, south, east, north] = bbox;
  const params = new URLSearchParams({
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
    limit: String(limit),
  });
  if (category) params.set("category", category);
  if (source) params.set("source", source);
  if (q) params.set("q", q);
  const res = await fetch(`/api/events?${params}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<MapEvent[]>;
}

export async function fetchStats(): Promise<StatsSummary> {
  const res = await fetch("/api/stats/summary");
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<StatsSummary>;
}
