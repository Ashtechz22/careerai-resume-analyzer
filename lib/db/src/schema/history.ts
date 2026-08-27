import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const analysisHistoryTable = pgTable("career_analysis_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});