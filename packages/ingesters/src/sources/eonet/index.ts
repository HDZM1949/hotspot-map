import type { EventCategory, RawEvent } from "@hotspot-map/shared";

/**
 * NASA EONET 全球自然事件采集器（https://eonet.gsfc.nasa.gov）
 * 覆盖野火、风暴、洪水、火山、地震等，免费无 key，自带坐标。
 * 注：本机网络 HTTPS 被拦截时需 NODE_TLS_REJECT_UNAUTHORIZED=0。
 */

const EONET_URL = process.env.EONET_URL ?? "https://eonet.gsfc.nasa.gov/api/v3/events";

interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  categories: Array<{ id: number; title: string }>;
  geometry: Array<{
    date: string;
    type: string;
    coordinates: [number, number] | [number, number, number] | number[][];
  }>;
}

const CATEGORY_MAP: Record<string, EventCategory> = {
  Wildfires: "disaster",
  "Severe Storms": "weather",
  Floods: "disaster",
  Volcanoes: "disaster",
  Earthquakes: "disaster",
  "Sea and Lake Ice": "other",
  Drought: "weather",
  "Dust and Haze": "weather",
  Snow: "weather",
  "Temperature Extremes": "weather",
  "Water Color": "other",
  Landslides: "disaster",
};

/** 取 Point 坐标；Polygon 时取外环首点（事件近似位置） */
function extractPoint(
  geometry: EonetEvent["geometry"][number],
): { lat: number; lon: number } | null {
  const coords = geometry.coordinates;
  if (geometry.type === "Point" && Array.isArray(coords[0]) === false) {
    const [lon, lat] = coords as [number, number];
    return { lat, lon };
  }
  const ring = coords as number[][];
  if (ring.length > 0 && Array.isArray(ring[0])) {
    const [lon, lat] = ring[0] as [number, number];
    return { lat, lon };
  }
  return null;
}

export async function fetchEonetEvents(): Promise<RawEvent[]> {
  const res = await fetch(EONET_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`EONET HTTP ${res.status}`);
  const data = (await res.json()) as { events: EonetEvent[] };

  const events: RawEvent[] = [];
  for (const ev of data.events) {
    const geometry = ev.geometry[0];
    if (!geometry) continue;
    const point = extractPoint(geometry);
    if (!point) continue;

    const category = ev.categories.map((c) => CATEGORY_MAP[c.title]).find(Boolean) ?? "other";
    const categoryName = ev.categories[0]?.title ?? "未知事件";

    events.push({
      source: "eonet",
      sourceId: ev.id,
      title: `${categoryName}｜${ev.title}`,
      summary: ev.description ?? undefined,
      url: ev.link,
      lat: point.lat,
      lon: point.lon,
      occurredAt: new Date(geometry.date),
      category,
    });
  }
  return events;
}
