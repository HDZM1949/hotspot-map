import {
  bigserial,
  char,
  doublePrecision,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** events 表（规范化事件/热点） */
export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  fingerprint: text("fingerprint").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  category: text("category").notNull(),
  severity: real("severity"),
  heatScore: real("heat_score").notNull().default(0),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  countryCode: char("country_code", { length: 2 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  mentionCount: integer("mention_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** event_mentions 表（来源提及，幂等去重） */
export const eventMentionsTable = pgTable("event_mentions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  url: text("url"),
  title: text("title"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
