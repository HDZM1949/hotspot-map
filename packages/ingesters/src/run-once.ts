import { processRawEvents } from "@hotspot-map/processor";
import type { RawEvent } from "@hotspot-map/shared";

import { fetchEonetEvents } from "./sources/eonet";
import { fetchGdeltEvents } from "./sources/gdelt";
import { fetchUsgsEvents } from "./sources/usgs";

const FETCHERS: Record<string, () => Promise<RawEvent[]>> = {
  gdelt: fetchGdeltEvents,
  usgs: fetchUsgsEvents,
  eonet: fetchEonetEvents,
};

/**
 * 一次性采集入口：拉取指定数据源（默认全部）并执行处理管道。
 * 用法：SOURCES=usgs,eonet pnpm --filter @hotspot-map/ingesters ingest:once
 */
const enabled = (process.env.SOURCES ?? "gdelt,usgs,eonet")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

for (const name of enabled) {
  const fetcher = FETCHERS[name];
  if (!fetcher) {
    console.warn(`[ingest] 未知数据源: ${name}`);
    continue;
  }
  try {
    const events = await fetcher();
    console.info(`[ingest] ${name}: 原始事件 ${events.length} 条`);
    const result = await processRawEvents(events);
    console.info(
      `[ingest] ${name}: 入库 ${result.processed}, 合并 ${result.merged}, 丢弃 ${result.dropped}`,
    );
  } catch (e) {
    console.error(`[ingest] ${name} 失败:`, (e as Error).message);
  }
}

process.exit(0);
