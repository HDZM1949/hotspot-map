// 依次启动服务并验证（db → api → web → ingest）
// 优先使用本机计划任务；未配置计划任务时通过 start-services.ps1 直接启动进程
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 启动服务（计划任务优先）
const r = spawnSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "start-services.ps1")],
  { encoding: "utf8" },
);
console.log(r.stdout);

// 若已配置采集调度任务，也一并启动
const task = spawnSync("schtasks", ["/query", "/tn", "hotspot-ingest"], { encoding: "utf8" });
if (task.status === 0) {
  console.log("启动 ingest:", spawnSync("schtasks", ["/run", "/tn", "hotspot-ingest"], { encoding: "utf8" }).stdout.trim().split("\n").pop());
}

// 等待就绪
console.log("等待服务就绪...");
await sleep(12000);

const t = async (u) => {
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(6000) });
    return res.status;
  } catch {
    return "ERR";
  }
};
const health = await t("http://localhost:3000/healthz");
const api = await t("http://localhost:3000/api/events?limit=1");
const web = await t("http://localhost:5173/");
const px = await t("http://localhost:5173/api/events?limit=1");
console.log("API:", api, "| Web:", web, "| 代理:", px, "| healthz:", health);

if (api === 200) {
  const ev = await (await fetch("http://localhost:3000/api/events?limit=2000")).json();
  const by = {};
  for (const e of ev) for (const s of (e.sources ?? "").split(",").filter(Boolean)) by[s] = (by[s] ?? 0) + 1;
  console.log("数据来源分布:", JSON.stringify(by), "总数:", ev.length);
}
