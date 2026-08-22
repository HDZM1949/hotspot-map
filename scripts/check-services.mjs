// 诊断：服务状态 + API + 瓦片加载
import http from "node:http";
import net from "node:net";

function get(url, timeout = 8000, headers = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data.slice(0, 150) }));
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

const [db, api, web] = await Promise.all([checkPort(5432), checkPort(3000), checkPort(5173)]);
console.log("ports -> DB 5432:", db, "| API 3000:", api, "| Web 5173:", web);

console.log("API /healthz:", JSON.stringify(await get("http://localhost:3000/healthz")));
console.log("API events(limit1):", JSON.stringify(await get("http://localhost:3000/api/events?limit=1")));
console.log("Web index:", JSON.stringify(await get("http://localhost:5173/")));
console.log("Web proxy events:", JSON.stringify(await get("http://localhost:5173/api/events?limit=1")));

const tileUrl =
  "http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=0&y=0&z=1";
console.log("tile no-referer:", JSON.stringify(await get(tileUrl, 10000)));
console.log("tile with-referer:", JSON.stringify(await get(tileUrl, 10000, { Referer: "http://localhost:5173/" })));
