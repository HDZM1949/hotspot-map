import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Popup, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import "./App.css";
import { fetchEvents, fetchStats, type MapEvent, type StatsSummary } from "./services/api";
import { connectRealtime } from "./services/realtime";

/** 分类 → 颜色 / 中文标签 */
const DEFAULT_COLOR = "#6b7280";
const CATEGORY_COLORS: Record<string, string> = {
  disaster: "#ef4444",
  conflict: "#f97316",
  politics: "#3b82f6",
  economy: "#10b981",
  tech: "#8b5cf6",
  sports: "#22c55e",
  science: "#06b6d4",
  weather: "#eab308",
  other: "#6b7280",
};
const CATEGORY_LABELS: Record<string, string> = {
  disaster: "灾害",
  conflict: "冲突",
  politics: "政治",
  economy: "经济",
  tech: "科技",
  sports: "体育",
  science: "科学",
  weather: "天气",
  other: "其他",
};
const SOURCE_LABELS: Record<string, string> = {
  gdelt: "新闻",
  usgs: "地震",
  eonet: "灾害",
};

/** 底图瓦片：高德公开栅格（http 明文，兼容本机 HTTPS 被拦截的网络环境） */
const BASE_TILE_URL =
  "http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

/** 简易 GeoJSON 结构（避免引入 geojson 类型包） */
type EventFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: MapEvent & { color: string };
};
type EventFeatureCollection = { type: "FeatureCollection"; features: EventFeature[] };

function toFeatureCollection(events: MapEvent[]): EventFeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lon, e.lat] },
      properties: { ...e, color: CATEGORY_COLORS[e.category] ?? DEFAULT_COLOR },
    })),
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ViewMode = "cluster" | "heat";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const sourceRef = useRef<GeoJSONSource | null>(null);
  const loadTimerRef = useRef<number | null>(null);

  const [category, setCategory] = useState("全部");
  const [source, setSource] = useState("全部");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cluster");
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [status, setStatus] = useState("加载中…");
  /** 最新事件列表引用（供实时合并与地图增量更新） */
  const eventsRef = useRef<MapEvent[]>([]);

  // 搜索词防抖 400ms
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 400);
    return () => window.clearTimeout(timer);
  }, [q]);

  /** 实时事件到达：按 id 去重合并 → 按热度重排 → 更新地图与列表 */
  const handleRealtime = useCallback((newEvents: MapEvent[]) => {
    const map = new Map(eventsRef.current.map((e) => [e.id, e]));
    let added = 0;
    for (const e of newEvents) {
      if (!map.has(e.id)) {
        map.set(e.id, e);
        added++;
      }
    }
    if (added === 0) return;
    const merged = [...map.values()].sort((a, b) => b.heatScore - a.heatScore);
    eventsRef.current = merged;
    setEvents(merged);
    sourceRef.current?.setData(toFeatureCollection(merged));
    setStatus(`实时更新 +${added} 条`);
  }, []);

  // 实时连接（断线自动重连）
  useEffect(() => {
    const handle = connectRealtime(handleRealtime, setStatus);
    return () => handle.close();
  }, [handleRealtime]);

  /** 弹窗详情（地图点点击 / 列表项点击共用） */
  const showPopup = useCallback((map: MapLibreMap, ev: MapEvent) => {
    const color = CATEGORY_COLORS[ev.category] ?? DEFAULT_COLOR;
    const sources = (ev.sources ?? "")
      .split(",")
      .filter(Boolean)
      .map((s) => SOURCE_LABELS[s] ?? s)
      .join(" · ");
    const html = `
      <div style="font-size:12px;line-height:1.6;max-width:260px">
        <div style="font-weight:600;font-size:13px;margin-bottom:4px">${escapeHtml(ev.title)}</div>
        <div>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>
          ${escapeHtml(CATEGORY_LABELS[ev.category] ?? ev.category)}
          <span style="color:#999;margin-left:6px">热度 ${ev.heatScore}</span>
        </div>
        ${ev.summary ? `<div style="color:#666">${escapeHtml(ev.summary)}</div>` : ""}
        <div style="color:#666">${formatTime(ev.occurredAt)}</div>
        <div style="color:#999">来源: ${escapeHtml(sources || "未知")}${ev.mentionCount > 1 ? `（${ev.mentionCount} 次提及）` : ""}</div>
      </div>`;
    popupRef.current?.remove();
    popupRef.current = new Popup({ offset: 12, closeButton: true })
      .setLngLat([ev.lon, ev.lat])
      .setHTML(html)
      .addTo(map);
  }, []);

  /** 拉取当前视野事件并渲染 */
  const loadEvents = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    // MapLibre 横向可无限滚动，bbox 可能越界（如 west=-261），钳制到合法范围
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const bbox: [number, number, number, number] = [
      clamp(bounds.getWest(), -180, 180),
      clamp(bounds.getSouth(), -90, 90),
      clamp(bounds.getEast(), -180, 180),
      clamp(bounds.getNorth(), -90, 90),
    ];
    try {
      const list = await fetchEvents(
        bbox,
        800,
        category === "全部" ? undefined : category,
        source === "全部" ? undefined : source,
        debouncedQ.trim() || undefined,
      );
      eventsRef.current = list;
      setEvents(list);
      setStatus(`${list.length} 条事件`);
      sourceRef.current?.setData(toFeatureCollection(list));
    } catch (e) {
      setStatus(`加载失败: ${(e as Error).message}`);
    }
  }, [category, source, debouncedQ]);

  // 始终引用最新的 loadEvents（地图生命周期只初始化一次）
  const loadRef = useRef(loadEvents);
  loadRef.current = loadEvents;

  /** 切换视图模式：聚合点 ↔ 热力图 */
  const applyViewMode = useCallback((map: MapLibreMap, mode: ViewMode) => {
    const heatVisible = mode === "heat";
    for (const id of ["clusters", "cluster-count", "event-point"]) {
      map.setLayoutProperty(id, "visibility", heatVisible ? "none" : "visible");
    }
    map.setLayoutProperty("heat", "visibility", heatVisible ? "visible" : "none");
  }, []);

  // 地图初始化（仅一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: [BASE_TILE_URL],
            tileSize: 256,
            attribution: "© 高德地图",
            maxzoom: 18,
          },
        },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [20, 20],
      zoom: 1.5,
      minZoom: 1,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 50,
      });

      // 热力图（默认隐藏，切换视图时显示）
      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "events",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "heatScore"],
            0,
            0,
            60,
            0.6,
            100,
            1,
          ],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 2.5],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 14, 8, 28],
          "heatmap-opacity": 0.85,
        },
      });

      // 聚合圈（按数量分级）
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#3b82f6", 10, "#8b5cf6", 100, "#ef4444"],
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 26, 100, 36],
          "circle-opacity": 0.7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // 聚合数量文本
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      // 单事件点（按分类着色）
      map.addLayer({
        id: "event-point",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      sourceRef.current = map.getSource("events") as GeoJSONSource | null;
      void loadRef.current();
    });

    // 视野变化后重新查询（防抖 300ms）
    map.on("moveend", () => {
      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current);
      }
      loadTimerRef.current = window.setTimeout(() => void loadRef.current(), 300);
    });

    // 点击聚合圈 → 放大一级
    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      const cluster = features[0];
      if (!cluster || cluster.properties === null) return;
      const { cluster_id: clusterId } = cluster.properties;
      const source = map.getSource("events") as GeoJSONSource | undefined;
      if (source) {
        source.getClusterExpansionZoom(clusterId as number).then((zoom: number) => {
          map.easeTo({
            center: (cluster.geometry as { coordinates: [number, number] }).coordinates,
            zoom: Math.min(zoom + 1, map.getMaxZoom()),
          });
        });
      }
    });

    // 点击单事件 → 弹窗详情
    map.on("click", "event-point", (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.properties === null) return;
      const ev = feature.properties as unknown as MapEvent;
      showPopup(map, ev);
    });

    map.on("mouseenter", "event-point", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "event-point", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current);
      }
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      sourceRef.current = null;
    };
  }, [showPopup]);

  // 视图模式切换
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyViewMode(map, viewMode);
  }, [viewMode, applyViewMode]);

  // 筛选/搜索变化 → 重新加载
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // 统计面板数据
  useEffect(() => {
    if (!statsOpen) return;
    let alive = true;
    fetchStats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {
        if (alive) setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [statsOpen]);

  /** 列表项点击 → 飞行定位 + 弹窗 */
  const flyToEvent = (ev: MapEvent) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [ev.lon, ev.lat], zoom: Math.max(map.getZoom(), 5) });
    showPopup(map, ev);
  };

  /** 统计 TOP 项点击 → 仅定位 */
  const flyToPoint = (lat: number, lon: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 4) });
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      <aside className="panel">
        <div className="panel-title">
          🌍 世界热点 <span className="status">{status}</span>
        </div>

        <div className="search-box">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 搜索事件关键词…"
          />
        </div>

        <div className="view-toggle">
          <button
            className={viewMode === "cluster" ? "active" : ""}
            onClick={() => setViewMode("cluster")}
          >
            聚合视图
          </button>
          <button
            className={viewMode === "heat" ? "active" : ""}
            onClick={() => setViewMode("heat")}
          >
            热力图
          </button>
          <button className={statsOpen ? "active" : ""} onClick={() => setStatsOpen((v) => !v)}>
            统计
          </button>
        </div>

        <div className="filters">
          <div className="filter-group">
            {["全部", ...Object.keys(CATEGORY_LABELS)].map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c === "全部" ? "全部" : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="filter-group">
            {["全部", "gdelt", "usgs", "eonet"].map((s) => (
              <button
                key={s}
                className={`chip ${source === s ? "active" : ""}`}
                onClick={() => setSource(s)}
              >
                {s === "全部" ? "全部来源" : SOURCE_LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>

        {statsOpen && (
          <div className="stats">
            {stats ? (
              <>
                <div className="stats-row">
                  总事件 <b>{stats.total}</b> · 24h 新增 <b>{stats.last24h}</b>
                </div>
                <div className="stats-bars">
                  {stats.byCategory.slice(0, 8).map((c) => (
                    <div key={c.category} className="stats-bar">
                      <span className="stats-bar-label">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </span>
                      <div className="stats-bar-track">
                        <div
                          className="stats-bar-fill"
                          style={{
                            width: `${Math.max(4, (c.count / Math.max(1, stats.total)) * 100)}%`,
                            background: CATEGORY_COLORS[c.category] ?? DEFAULT_COLOR,
                          }}
                        />
                      </div>
                      <span className="stats-bar-count">{c.count}</span>
                    </div>
                  ))}
                </div>
                <div className="stats-top">🔥 热度 TOP5</div>
                {stats.top.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="stats-top-item"
                    onClick={() => flyToPoint(t.lat, t.lon)}
                  >
                    <span
                      className="dot"
                      style={{ background: CATEGORY_COLORS[t.category] ?? DEFAULT_COLOR }}
                    />
                    <span className="event-title">{t.title}</span>
                    <span className="stats-heat">{t.heatScore}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="empty">统计加载中…</div>
            )}
          </div>
        )}

        <div className="event-list">
          {events.length === 0 && <div className="empty">当前视野暂无事件</div>}
          {events.slice(0, 50).map((ev) => (
            <div key={ev.id} className="event-item" onClick={() => flyToEvent(ev)}>
              <span
                className="dot"
                style={{ background: CATEGORY_COLORS[ev.category] ?? DEFAULT_COLOR }}
              />
              <div className="event-main">
                <div className="event-title">{ev.title}</div>
                <div className="event-meta">
                  {(ev.sources ?? "")
                    .split(",")
                    .filter(Boolean)
                    .map((s) => SOURCE_LABELS[s] ?? s)
                    .join(" · ")}{" "}
                  | {formatTime(ev.occurredAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
