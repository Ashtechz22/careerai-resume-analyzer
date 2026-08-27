import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const resumesTable = pgTable("career_resumes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  objectPath: text("object_path").notNull(),
  extractedText: text("extracted_text"),
  status: text("status").notNull().default("uploaded"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertResumeSchema = z.object({
  userId: z.number().int(),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  objectPath: z.string().min(1),
  extractedText: z.string().nullable().optional(),
  status: z.string().default("uploaded"),
});
export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Resume = typeof resumesTable.$inferSelect;

export type ResumeAnalysisJson = {
  contact: { name: string | null; email: string | null; phone: string | null; location: string | null };
  education: Array<{ title: string; organization: string; period: string; description: string }>;
  experience: Array<{ title: string; organization: string; period: string; description: string }>;
  projects: Array<{ name: string; description: string; technologies: string[] }>;
  certifications: string[];
  skills: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: Array<{ priority: number; title: string; detail: string }>;
  atsBreakdown: { skillsRelevance: number; keywords: number; experience: number; projects: number; education: number; completeness: number };
};

export const resumeAnalysesTable = pgTable("career_resume_analyses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  resumeId: integer("resume_id").notNull().references(() => resumesTable.id, { onDelete: "cascade" }),
  overallScore: integer("overall_score").notNull(),
  atsScore: integer("ats_score").notNull(),
  analysis: jsonb("analysis").$type<ResumeAnalysisJson>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResumeAnalysisSchema = z.object({
  resumeId: z.number().int(),
  overallScore: z.number().int(),
  atsScore: z.number().int(),
  analysis: z.unknown(),
});
export type ResumeAnalysis = typeof resumeAnalysesTable.$inferSelect;