import cron from "node-cron";
import { processRawEvents, pruneOldEvents, RETENTION_DAYS } from "@hotspot-map/processor";
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

/** 清理超过保留期的旧事件（启动时执行一次，此后每小时执行一次） */
async function runPrune(): Promise<void> {
  try {
    const removed = await pruneOldEvents();
    if (removed > 0) {
      console.info(`[retention] 已清理 ${removed} 条超过 ${RETENTION_DAYS} 天的旧事件`);
    }
  } catch (e) {
    console.error("[retention] 清理失败:", (e as Error).message);
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

// 数据保留：超过 RETENTION_DAYS 天的旧事件将被删除
void runPrune();
cron.schedule("0 * * * *", () => void runPrune());
console.info(`[scheduler] 数据保留策略已启用: 清理超过 ${RETENTION_DAYS} 天的事件`);

console.info("[scheduler] 采集调度器运行中");
