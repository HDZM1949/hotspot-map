import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import type { RawEvent } from "@hotspot-map/shared";
import { classifyByRootCode } from "@hotspot-map/processor";

/** GDELT 2.0 EVENT 导出 CSV 的字段索引（0-based，实测共 61 列）。
 * 注意：每个 Geo 块实际为 8 列（Type, FullName, CountryCode, ADM1Code, 空, Lat, Long, FeatureID），
 *       与官方文档的 7 列描述存在一个空列的偏移，以实测为准。
 */
const COL = {
  GLOBAL_EVENT_ID: 0,
  DAY: 1, // YYYYMMDD
  ACTOR1_NAME: 6,
  ACTOR2_NAME: 16,
  EVENT_CODE: 26, // 如 "173"
  QUAD_CLASS: 29,
  NUM_MENTIONS: 31,
  NUM_SOURCES: 32,
  NUM_ARTICLES: 33,
  ACTION_GEO_TYPE: 51,
  ACTION_GEO_FULLNAME: 52,
  ACTION_GEO_COUNTRY: 53,
  ACTION_GEO_LAT: 56,
  ACTION_GEO_LONG: 57,
  ACTOR1_GEO_LAT: 40,
  ACTOR1_GEO_LONG: 41,
  SOURCE_URL: 60,
} as const;

const GDELT_BASE_URL = process.env.GDELT_BASE_URL ?? "https://data.gdeltproject.org/gdeltv2";

/** lastupdate.txt 首行格式: <count> <md5> <export.csv.zip url> */
async function fetchLatestExportUrl(): Promise<string> {
  const res = await fetch(`${GDELT_BASE_URL}/lastupdate.txt`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GDELT lastupdate.txt 请求失败: ${res.status}`);
  }
  const firstLine = (await res.text()).split("\n")[0]?.trim() ?? "";
  const url = firstLine.split(/\s+/)[2];
  if (!url) {
    throw new Error(`GDELT lastupdate.txt 格式异常: ${firstLine}`);
  }
  return url;
}

/** 下载增量 export.zip 并解压出 CSV 文本 */
async function downloadExportCsv(zipUrl: string): Promise<string> {
  const res = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`GDELT export 下载失败: ${res.status} ${zipUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".csv"));
  if (!entry) {
    throw new Error(`GDELT export.zip 中未找到 CSV: ${zipUrl}`);
  }
  return entry.getData().toString("utf8");
}

function toDate(dayStr: string): Date | null {
  // YYYYMMDD → UTC
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(dayStr);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: string | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) ? n : undefined;
}

/** 解析 GDELT export CSV 行 → RawEvent（仅保留带有效坐标的事件） */
export function parseGdeltRow(row: string[]): RawEvent | null {
  const id = row[COL.GLOBAL_EVENT_ID] ?? "";
  const day = row[COL.DAY] ?? "";
  const eventCode = row[COL.EVENT_CODE] ?? "";
  const rootCode = eventCode.slice(0, 2);
  const { label, category } = classifyByRootCode(rootCode);

  // 优先事件发生地（ActionGeo），其次参与者一（Actor1Geo）
  const lat = num(row[COL.ACTION_GEO_LAT]) ?? num(row[COL.ACTOR1_GEO_LAT]);
  const lon = num(row[COL.ACTION_GEO_LONG]) ?? num(row[COL.ACTOR1_GEO_LONG]);
  if (lat === undefined || lon === undefined) return null;

  const actor1 = row[COL.ACTOR1_NAME]?.trim();
  const actor2 = row[COL.ACTOR2_NAME]?.trim();
  const title = [actor1, label, actor2].filter(Boolean).join(" ") || `GDELT 事件 #${id}`;
  const location = row[COL.ACTION_GEO_FULLNAME]?.trim();
  const articles = num(row[COL.NUM_ARTICLES]);

  return {
    source: "gdelt",
    sourceId: id,
    title,
    summary: [`地点: ${location ?? "未知"}`, articles ? `相关报道: ${articles}` : null]
      .filter(Boolean)
      .join(" | "),
    url: row[COL.SOURCE_URL] ?? undefined,
    lat,
    lon,
    occurredAt: toDate(day) ?? new Date(),
    category,
    meta: { eventRootCode: rootCode },
  };
}

/** 解析 export URL 中的时间戳（YYYYMMDDHHMMSS），不存在返回 null */
function extractTimestamp(url: string): string | null {
  const m = /(\d{14})\.export\.CSV\.zip$/i.exec(url);
  return m?.[1] ?? null;
}

/** 生成回退 URL：时间戳减 15 分钟（GDELT 发布延迟时向前找可用文件） */
function previousFileUrl(url: string): string | null {
  const tsStr = extractTimestamp(url);
  if (!tsStr) return null;
  const ts = new Date(
    Date.UTC(
      Number(tsStr.slice(0, 4)),
      Number(tsStr.slice(4, 6)) - 1,
      Number(tsStr.slice(6, 8)),
      Number(tsStr.slice(8, 10)),
      Number(tsStr.slice(10, 12)),
      Number(tsStr.slice(12, 14)),
    ),
  );
  ts.setUTCMinutes(ts.getUTCMinutes() - 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  const newTs =
    `${ts.getUTCFullYear()}${pad(ts.getUTCMonth() + 1)}${pad(ts.getUTCDate())}` +
    `${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}00`;
  return url.replace(/\d{14}\.export\.CSV\.zip$/i, `${newTs}.export.CSV.zip`);
}

/**
 * GDELT 2.0 采集器（核心数据源，15 分钟增量更新，事件自带经纬度）。
 * 文档: https://www.gdeltproject.org/
 */
export async function fetchGdeltEvents(): Promise<RawEvent[]> {
  let zipUrl = await fetchLatestExportUrl();
  console.info(`[gdelt] 增量文件: ${zipUrl}`);

  // 最新文件可能尚未同步（GDELT 偶发发布延迟），最多回退 8 个时段（2 小时）
  let csv: string | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      csv = await downloadExportCsv(zipUrl);
      break;
    } catch (e) {
      console.warn(`[gdelt] 下载失败，回退上一时段: ${(e as Error).message}`);
      const prev = previousFileUrl(zipUrl);
      if (!prev) throw e;
      zipUrl = prev;
    }
  }
  if (!csv) {
    throw new Error("GDELT export 下载失败（已回退 8 个时段）");
  }

  const records = parse(csv, {
    bom: true,
    delimiter: "\t", // GDELT export 为 TAB 分隔
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  const events: RawEvent[] = [];
  for (const row of records) {
    const ev = parseGdeltRow(row);
    if (ev) events.push(ev);
  }
  console.info(`[gdelt] CSV 行数: ${records.length}, 有效事件: ${events.length}`);
  return events;
}
