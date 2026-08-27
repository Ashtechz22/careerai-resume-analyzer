import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable("career_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = z.object({
  clerkId: z.string().min(1),
  email: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;