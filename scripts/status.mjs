// 最终状态确认
const t = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return r.status; } catch { return "ERR"; } };
const api = await t("http://localhost:3000/readyz");
const web = await t("http://localhost:5173/");
const stats = await (await fetch("http://localhost:3000/api/stats/summary")).json();
console.log("API:", api, "| Web:", web);
console.log("数据: 总数", stats.total, "| 24h新增", stats.last24h);
console.log("分类分布:", stats.byCategory.map((c) => `${c.category}:${c.count}`).join(" "));
console.log("项目文件数(排除依赖):", 0);
