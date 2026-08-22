import type { RawEvent } from "@hotspot-map/shared";

/**
 * USGS 全球地震采集器（https://earthquake.usgs.gov）
 * all_hour 增量 GeoJSON，缺失时回退 all_day（最多回退 7 天）。
 * 注：本机网络 HTTPS 被拦截时需 NODE_TLS_REJECT_UNAUTHORIZED=0。
 */

const BASE_URL = process.env.USGS_URL ?? "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";

interface UsgsFeed {
  features: Array<{
    id: string;
    geometry: { type: "Point"; coordinates: [number, number, number] };
    properties: {
      mag: number | null;
      place: string | null;
      time: number;
      url: string | null;
      type: string;
    };
  }>;
}

const FALLBACK_WINDOWS = [
  "all_hour",
  "all_day",
  "all_week",
  "all_month",
] as const;

export async function fetchUsgsEvents(): Promise<RawEvent[]> {
  let lastError: Error | null = null;
  for (const window of FALLBACK_WINDOWS) {
    try {
      const res = await fetch(`${BASE_URL}/${window}.geojson`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as UsgsFeed;
      return data.features
        .filter((f) => f.properties.type === "earthquake" && f.properties.mag != null)
        .map((f) => {
          const [lon, lat, depth] = f.geometry.coordinates;
          const p = f.properties;
          return {
            source: "usgs",
            sourceId: f.id,
            title: `地震 ${p.mag?.toFixed(1)}级 ${p.place ?? ""}`.trim(),
            summary: `震源深度 ${Math.round(depth)} km，美国地质调查局监测`,
            url: p.url ?? undefined,
            lat,
            lon,
            occurredAt: new Date(p.time),
            category: "disaster" as const,
            meta: { magnitude: String(p.mag) },
          };
        });
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError ?? new Error("USGS 所有时段均获取失败");
}
