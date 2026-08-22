// 嵌入式 PostgreSQL 启动脚本（本地开发用，无需安装 Docker）
// 用法: pnpm db:start
// 环境变量: DB_DATA_DIR(数据目录, 默认 <repo>/.pgdata) PG_PORT PG_USER PG_PASSWORD PG_DATABASE
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const dataDir = process.env.DB_DATA_DIR ?? path.join(rootDir, ".pgdata");
const port = Number(process.env.PG_PORT ?? 5432);
const user = process.env.PG_USER ?? "hotspot";
const password = process.env.PG_PASSWORD ?? "hotspot";
const dbName = process.env.PG_DATABASE ?? "hotspot_map";
const schemaFile = process.env.PG_SCHEMA_FILE ?? path.join(rootDir, "infra", "postgres", "init.sql");

// 数据库名用于 CREATE DATABASE 语句（不能参数化），仅允许安全字符
if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
  console.error(`[db] 非法数据库名: ${dbName}`);
  process.exit(1);
}

const pgInstance = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
});

async function main() {
  // initialise 不幂等：仅当数据目录尚未初始化（无 PG_VERSION）时执行 initdb
  if (existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("[db] 数据目录已初始化，跳过 initdb");
  } else {
    await pgInstance.initialise();
  }
  await pgInstance.start();
  console.log(`[db] PostgreSQL 已启动: port=${port} dataDir=${dataDir}`);

  // 创建数据库（如不存在）
  const admin = new pg.Client({ host: "127.0.0.1", port, user, password, database: "postgres" });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[db] 数据库 "${dbName}" 已创建`);
  }
  await admin.end();

  // 应用 schema
  const db = new pg.Client({ host: "127.0.0.1", port, user, password, database: dbName });
  await db.connect();
  const sql = readFileSync(schemaFile, "utf8");
  await db.query(sql);
  await db.end();
  console.log(`[db] schema 已应用`);

  console.log(`[db] 就绪: postgres://${user}:${password}@localhost:${port}/${dbName}`);
  console.log("[db] Ctrl+C 停止");
}

main().catch((e) => {
  console.error("[db] 启动失败:", e);
  if (e?.stderr) console.error("[db] stderr:", e.stderr);
  if (e?.stdout) console.error("[db] stdout:", e.stdout);
  process.exit(1);
});

async function shutdown() {
  try {
    await pgInstance.stop();
  } catch {
    // 忽略停止异常
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  // 尽力停止 PostgreSQL 子进程（非交互场景，如计划任务/后台运行）
  pgInstance.stop().catch(() => {});
});
