// 验证数据库数据
import pg from "pg";

const client = new pg.Client({
  connectionString: "postgres://hotspot:hotspot@localhost:5432/hotspot_map",
});
await client.connect();

const total = await client.query("SELECT count(*) FROM events");
const byCategory = await client.query(
  "SELECT category, count(*) FROM events GROUP BY category ORDER BY count(*) DESC",
);
const sample = await client.query(
  "SELECT title, category, lat, lon, occurred_at FROM events ORDER BY occurred_at DESC LIMIT 3",
);
const mentions = await client.query("SELECT count(*) FROM event_mentions");

console.log("events 总数:", total.rows[0].count);
console.log("mentions 总数:", mentions.rows[0].count);
console.log("分类分布:", JSON.stringify(byCategory.rows));
console.log("样例:");
for (const r of sample.rows) {
  console.log(" -", r.title, "|", r.category, "|", r.lat, r.lon, "|", r.occurred_at.toISOString());
}
await client.end();
