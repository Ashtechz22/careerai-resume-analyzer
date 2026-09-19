import { relations } from "drizzle-orm";
import { analysisHistoryTable } from "./history";
import {
  jobDescriptionsTable,
  jobMatchesTable,
  skillsTable,
} from "./jobs";
import { resumeAnalysesTable, resumesTable } from "./resumes";
import { usersTable } from "./users";

export const usersRelations = relations(usersTable, ({ many }) => ({
  resumes: many(resumesTable),
  jobDescriptions: many(jobDescriptionsTable),
  skills: many(skillsTable),
  analysisHistory: many(analysisHistoryTable),
}));

export const resumesRelations = relations(resumesTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [resumesTable.userId],
    references: [usersTable.id],
  }),
  analyses: many(resumeAnalysesTable),
  skills: many(skillsTable),
  jobDescriptions: many(jobDescriptionsTable),
  jobMatches: many(jobMatchesTable),
}));

export const resumeAnalysesRelations = relations(
  resumeAnalysesTable,
  ({ one }) => ({
    resume: one(resumesTable, {
      fields: [resumeAnalysesTable.resumeId],
      references: [resumesTable.id],
    }),
  }),
);

export const jobDescriptionsRelations = relations(
  jobDescriptionsTable,
  ({ one, many }) => ({
    user: one(usersTable, {
      fields: [jobDescriptionsTable.userId],
      references: [usersTable.id],
    }),
    resume: one(resumesTable, {
      fields: [jobDescriptionsTable.resumeId],
      references: [resumesTable.id],
    }),
    matches: many(jobMatchesTable),
  }),
);

export const jobMatchesRelations = relations(jobMatchesTable, ({ one }) => ({
  jobDescription: one(jobDescriptionsTable, {
    fields: [jobMatchesTable.jobDescriptionId],
    references: [jobDescriptionsTable.id],
  }),
  resume: one(resumesTable, {
    fields: [jobMatchesTable.resumeId],
    references: [resumesTable.id],
  }),
}));

export const skillsRelations = relations(skillsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [skillsTable.userId],
    references: [usersTable.id],
  }),
  resume: one(resumesTable, {
    fields: [skillsTable.resumeId],
    references: [resumesTable.id],
  }),
}));

export const analysisHistoryRelations = relations(
  analysisHistoryTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [analysisHistoryTable.userId],
      references: [usersTable.id],
    }),
  }),
);
