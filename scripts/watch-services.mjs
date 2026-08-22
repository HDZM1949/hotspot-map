// 服务存活监测：连续 5 次，每次间隔 15 秒
import net from "node:net";
import http from "node:http";

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.setTimeout(3000, () => { s.destroy(); resolve(false); });
  });
}

function get(url, timeout = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve("ERR"));
    req.setTimeout(timeout, () => { req.destroy(); resolve("TIMEOUT"); });
  });
}

for (let i = 1; i <= 5; i++) {
  const db = await checkPort(5432);
  const api = await checkPort(3000);
  const web = await checkPort(5173);
  const apiHealth = api ? await get("http://localhost:3000/healthz") : "-";
  const webEvents = web ? await get("http://localhost:5173/api/events?limit=1") : "-";
  console.log(
    `[${i}] DB:${db ? "up" : "DOWN"} | API:${api ? "up" : "DOWN"} (health:${apiHealth}) | Web:${web ? "up" : "DOWN"} (proxy:${webEvents})`,
  );
  if (i < 5) await new Promise((r) => setTimeout(r, 15000));
}
