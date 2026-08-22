// 查找并清理占用 5173/5174 端口的进程
import { execSync } from "node:child_process";

function findPids(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`).toString();
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (line.includes("LISTENING")) {
        const m = line.trim().split(/\s+/);
        const pid = m[m.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

for (const port of [5173, 5174, 9222, 9223]) {
  const pids = findPids(port);
  console.log(`端口 ${port}:`, pids.length ? `PID ${pids.join(",")}` : "空闲");
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`);
      console.log(`  已终止 PID ${pid}`);
    } catch (e) {
      console.log(`  终止 PID ${pid} 失败: ${e.message.split("\n")[0]}`);
    }
  }
}
