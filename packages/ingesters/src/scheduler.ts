import cron from "node-cron";
import { processRawEvents } from "@hotspot-map/processor";
import type { RawEvent } from "@hotspot-map/shared";

import { fetchEonetEvents } from "./sources/eonet";
import { fetchGdeltEvents } from "./sources/gdelt";
import { fetchUsgsEvents } from "./sources/usgs";

/** 数据源调度表：cron 表达式 + 拉取函数 */
const SOURCES: Record<string, { cron: string; fetch: () => Promise<RawEvent[]> }> = {
  gdelt: { cron: "*/15 * * * *", fetch: fetchGdeltEvents },
  usgs: { cron: "*/5 * * * *", fetch: fetchUsgsEvents },
  eonet: { cron: "*/10 * * * *", fetch: fetchEonetEvents },
};

async function runSource(name: string): Promise<void> {
  const cfg = SOURCES[name];
  if (!cfg) {
    console.warn(`[scheduler] 未知数据源: ${name}`);
    return;
  }
  try {
    const events = await cfg.fetch();
    const result = await processRawEvents(events);
    console.info(
      `[ingest] ${name}: 原始 ${events.length}, 入库 ${result.processed}, 合并 ${result.merged}, 丢弃 ${result.dropped}`,
    );
  } catch (e) {
    console.error(`[ingest] ${name} 失败:`, (e as Error).message);
  }
}

// 启动时立即执行一轮，避免等待首个 cron 周期
for (const name of Object.keys(SOURCES)) {
  void runSource(name);
}

for (const [name, cfg] of Object.entries(SOURCES)) {
  cron.schedule(cfg.cron, () => void runSource(name));
  console.info(`[scheduler] ${name} 已注册: ${cfg.cron}`);
}

console.info("[scheduler] 采集调度器运行中");
