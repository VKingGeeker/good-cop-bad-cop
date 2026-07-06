import { pgTable, serial, timestamp, varchar, integer, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const gameRooms = pgTable(
  "game_rooms",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    room_code: varchar("room_code", { length: 6 }).notNull().unique(),
    status: varchar("status", { length: 10 }).notNull().default('waiting'),
    host_player_id: varchar("host_player_id", { length: 36 }).notNull(),
    max_players: integer("max_players").notNull(),
    players: jsonb("players").notNull().default([]),
    game_state: jsonb("game_state"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("game_rooms_room_code_idx").on(table.room_code),
    index("game_rooms_status_idx").on(table.status),
    index("game_rooms_updated_at_idx").on(table.updated_at),
  ]
);