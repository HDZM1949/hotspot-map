// 读取项目 logs 目录下全部日志（尾部 1500 字节）
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "logs");
for (const f of readdirSync(dir)) {
  const p = path.join(dir, f);
  try {
    const size = statSync(p).size;
    const buf = Buffer.alloc(Math.min(size, 1500));
    const m = await import("node:fs/promises");
    const fd = await m.open(p, "r");
    await fd.read(buf, 0, buf.length, Math.max(0, size - buf.length));
    await fd.close();
    console.log(`=== ${f} (${size}B) ===`);
    console.log(buf.toString("utf8").replaceAll("\r", "").slice(-1100));
    console.log();
  } catch (e) {
    console.log(f, "读取失败:", e.message);
  }
}
