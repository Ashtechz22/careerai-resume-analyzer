import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { resumesTable } from "./resumes";
import { usersTable } from "./users";

export const jobDescriptionsTable = pgTable(
  "career_job_descriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id").notNull().references(() => resumesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("career_job_descriptions_user_id_idx").on(table.userId),
    index("career_job_descriptions_resume_id_idx").on(table.resumeId),
  ],
);

export const jobMatchJsonSchema = z.object({
  dimensions: z.object({
    skillMatch: z.number().int(),
    experienceMatch: z.number().int(),
    educationMatch: z.number().int(),
    keywordMatch: z.number().int(),
    projectRelevance: z.number().int(),
  }),
  skills: z.array(z.object({ name: z.string(), status: z.enum(["matched", "partial", "missing"]), reason: z.string() })),
  missingKeywords: z.array(z.string()),
  recommendations: z.array(z.object({ priority: z.number().int(), title: z.string(), detail: z.string() })),
});

export type JobMatchJson = z.infer<typeof jobMatchJsonSchema>;

export const jobMatchesTable = pgTable(
  "career_job_matches",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    jobDescriptionId: integer("job_description_id").notNull().references(() => jobDescriptionsTable.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id").notNull().references(() => resumesTable.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    result: jsonb("result").$type<JobMatchJson>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("career_job_matches_job_description_id_idx").on(table.jobDescriptionId),
    index("career_job_matches_resume_id_idx").on(table.resumeId),
  ],
);

export const insertJobDescriptionSchema = z.object({
  userId: z.number().int(),
  resumeId: z.number().int(),
  title: z.string().min(1),
  company: z.string().nullable().optional(),
  description: z.string().min(1),
});
export type InsertJobDescription = z.infer<typeof insertJobDescriptionSchema>;
export type JobDescription = typeof jobDescriptionsTable.$inferSelect;
export type JobMatch = typeof jobMatchesTable.$inferSelect;

export const skillsTable = pgTable(
  "career_skills",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id").notNull().references(() => resumesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("career_skills_user_id_idx").on(table.userId),
    index("career_skills_resume_id_idx").on(table.resumeId),
  ],
);