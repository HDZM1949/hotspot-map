import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import pg from "pg";

import type { BusEvent } from "@hotspot-map/processor";

/** 服务端 → 客户端推送消息 */
export interface WsMessage {
  type: "hello" | "events" | "pong";
  message?: string;
  events?: BusEvent[];
}

const connected = new Set<WebSocket>();

/** 向所有已连接客户端广播 */
export function broadcast(message: WsMessage): void {
  const data = JSON.stringify(message);
  for (const socket of connected) {
    if (socket.readyState === 1 /* OPEN */) {
      socket.send(data);
    }
  }
}

const RETRY_MS = 10_000;

/**
 * 注册实时端点：
 * - GET /ws/events —— WebSocket，前端订阅实时事件推送
 * - 启动 PostgreSQL LISTEN（events:new 频道），采集进程写库后由本网关转发。
 * LISTEN 连接独立于查询连接池，失败自动重试，不影响 API 存活。
 */
export async function registerRealtime(app: FastifyInstance): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://hotspot:hotspot@localhost:5432/hotspot_map";

  /** 建立（或重建）LISTEN 连接：连接 → LISTEN → 监听通知 */
  function startListener(): void {
    const client = new pg.Client({ connectionString: databaseUrl });

    client.on("notification", (msg) => {
      if (msg.channel !== "events_new" || !msg.payload) return;
      try {
        const events = JSON.parse(msg.payload) as BusEvent[];
        if (Array.isArray(events) && events.length > 0) {
          broadcast({ type: "events", events });
        }
      } catch (e) {
        app.log.warn({ err: e }, "[realtime] 通知解析失败");
      }
    });

    client.on("error", (e) => {
      app.log.error(e, "[realtime] LISTEN 连接异常，即将重建");
      setTimeout(startListener, RETRY_MS);
    });

    client
      .connect()
      .then(async () => {
        await client.query("LISTEN events_new");
        app.log.info("[realtime] 已监听 PostgreSQL 频道 events_new");
      })
      .catch((e: unknown) => {
        app.log.error({ err: e }, `[realtime] LISTEN 连接失败，${RETRY_MS / 1000}s 后重试`);
        setTimeout(startListener, RETRY_MS);
      });
  }
  startListener();

  app.get(
    "/ws/events",
    { websocket: true },
    (connection: WebSocket) => {
      connected.add(connection);
      connection.send(JSON.stringify({ type: "hello", message: "connected" } satisfies WsMessage));

      connection.on("message", (raw) => {
        // M3 简化：客户端暂不发送订阅指令（全量推送），保留协议扩展点
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string };
          if (msg.type === "ping") {
            connection.send(JSON.stringify({ type: "pong" } satisfies WsMessage));
          }
        } catch {
          // 忽略无法解析的消息
        }
      });

      connection.on("close", () => {
        connected.delete(connection);
      });
      connection.on("error", () => {
        connected.delete(connection);
      });
    },
  );
}
