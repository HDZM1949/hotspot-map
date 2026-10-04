-- HotspotMap 初始化脚本（PostgreSQL）
-- 说明：MVP 阶段用普通 btree 索引实现 bbox 查询（lat/lon 范围扫描），
--       不依赖 PostGIS 扩展，便于本地嵌入式 PostgreSQL 直接运行。
--       后续需要复杂空间分析时，可平滑迁移到 PostGIS（docker-compose 提供 postgis 镜像）。

-- 核心表：规范化事件（一个「热点」）
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint   TEXT UNIQUE NOT NULL,      -- 去重指纹（source:sourceId 哈希，M2 支持跨源合并）
  title         TEXT NOT NULL,
  summary       TEXT,
  category      TEXT NOT NULL,             -- disaster|conflict|politics|economy|tech|sports|science|weather|other
  severity      REAL,                      -- 严重度 0~1
  heat_score    REAL NOT NULL DEFAULT 0,   -- 热度分（排序/渲染依据）
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  country_code  CHAR(2),
  occurred_at   TIMESTAMPTZ NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL,
  mention_count INT NOT NULL DEFAULT 1,    -- 被多少个来源提及
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 区域查询索引：(lat, lon) 复合索引覆盖 bbox 范围扫描
CREATE INDEX IF NOT EXISTS idx_events_geo ON events (lat, lon);
CREATE INDEX IF NOT EXISTS idx_events_heat ON events (heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_events_time ON events (occurred_at DESC);

-- 来源提及表（一个事件可被多个源报道，合并热度）
CREATE TABLE IF NOT EXISTS event_mentions (
  id         BIGSERIAL PRIMARY KEY,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,                -- gdelt | usgs | openmeteo | ...
  source_id  TEXT NOT NULL,                -- 源内唯一 ID
  url        TEXT,
  title      TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)               -- 幂等写入，天然防重复采集
);

-- 外键索引：加速按 event_id 的查询与「删除旧事件」时的级联清理
CREATE INDEX IF NOT EXISTS idx_mentions_event ON event_mentions (event_id);
