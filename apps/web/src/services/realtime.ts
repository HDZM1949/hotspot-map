import type { MapEvent } from "./api";

interface WsMessage {
  type: "hello" | "events" | "pong";
  message?: string;
  events?: MapEvent[];
}

export interface RealtimeHandle {
  close: () => void;
}

/**
 * 连接实时事件通道（/ws/events），断线自动重连（指数退避，最长 30s）。
 * 返回句柄，调用 close() 停止。
 */
export function connectRealtime(
  onEvents: (events: MapEvent[]) => void,
  onStatus?: (status: string) => void,
): RealtimeHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let retryCount = 0;
  let retryTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/events`);

    ws.onopen = () => {
      retryCount = 0;
      onStatus?.("实时连接已建立");
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        if (msg.type === "events" && Array.isArray(msg.events) && msg.events.length > 0) {
          onEvents(msg.events);
        }
      } catch {
        // 忽略无法解析的消息
      }
    };

    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retryCount, 30_000);
      retryCount++;
      onStatus?.(`实时连接断开，${Math.round(delay / 1000)}s 后重连…`);
      retryTimer = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      ws?.close();
    },
  };
}
