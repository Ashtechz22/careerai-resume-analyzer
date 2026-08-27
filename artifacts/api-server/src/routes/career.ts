import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AnalyzeResumeParams,
  AnalyzeResumeResponse,
  CreateResumeBody,
  CreateResumeResponse,
  GetDashboardResponse,
  GetResumeParams,
  GetResumeResponse,
  ImproveResumeBulletBody,
  ImproveResumeBulletResponse,
  ListAnalysisHistoryResponse,
  ListJobRecommendationsResponse,
  ListResumesResponse,
  MatchJobBody,
  MatchJobResponse,
} from "@workspace/api-zod";
import {
  analysisHistoryTable,
  db,
  jobDescriptionsTable,
  jobMatchesTable,
  resumeAnalysesTable,
  resumesTable,
  skillsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/require-auth";
import { getOrCreateUser } from "../lib/user";
import { ObjectStorageService } from "../lib/objectStorage";
import { extractResumeText } from "../lib/resume-parser";
import {
  analyzeResume,
  improveBullet,
  matchResumeToJob,
  recommendationsFromAnalysis,
} from "../lib/ai-service";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const protectedRoute = [requireAuth];
const error = (message: string) => ({ error: message });
const iso = (date: Date) => date.toISOString();

async function currentUser(req: AuthenticatedRequest) {
  return getOrCreateUser(req.clerkUserId);
}

async function ownedResume(id: number, userId: number) {
  return db.query.resumesTable.findFirst({
    where: and(eq(resumesTable.id, id), eq(resumesTable.userId, userId)),
  });
}

async function resumeText(resume: NonNullable<Awaited<ReturnType<typeof ownedResume>>>) {
  if (resume.extractedText) return resume.extractedText;
  try {
    const file = await storage.getObjectEntityFile(resume.objectPath);
    const [buffer] = await file.download();
    return await extractResumeText(buffer, resume.fileType);
  } catch {
    return "";
  }
}

function resumeOutput(
  resume: typeof resumesTable.$inferSelect,
  analysis?: typeof resumeAnalysesTable.$inferSelect | null,
) {
  return {
    id: resume.id,
    fileName: resume.fileName,
    fileType: resume.fileType,
    status: resume.status,
    overallScore: analysis?.overallScore ?? null,
    atsScore: analysis?.atsScore ?? null,
    createdAt: iso(resume.createdAt),
  };
}

function analysisOutput(analysis: typeof resumeAnalysesTable.$inferSelect) {
  const data = analysis.analysis;
  return {
    id: analysis.id,
    resumeId: analysis.resumeId,
    overallScore: analysis.overallScore,
    atsScore: analysis.atsScore,
    ...data,
    createdAt: iso(analysis.createdAt),
  };
}

router.get("/dashboard", ...protectedRoute, async (req, res) => {
  const user = await currentUser(req as AuthenticatedRequest);
  const resumes = await db.query.resumesTable.findMany({
    where: eq(resumesTable.userId, user.id),
    orderBy: desc(resumesTable.createdAt),
  });
  const analyses = await Promise.all(resumes.map((resume) => db.query.resumeAnalysesTable.findFirst({
    where: eq(resumeAnalysesTable.resumeId, resume.id),
    orderBy: desc(resumeAnalysesTable.createdAt),
  })));
  const latestAnalysis = analyses.find(Boolean);
  const latestMatch = await db.select({ match: jobMatchesTable }).from(jobMatchesTable)
    .innerJoin(jobDescriptionsTable, eq(jobMatchesTable.jobDescriptionId, jobDescriptionsTable.id))
    .where(eq(jobDescriptionsTable.userId, user.id))
    .orderBy(desc(jobMatchesTable.createdAt)).limit(1);
  const history = await db.query.analysisHistoryTable.findMany({
    where: eq(analysisHistoryTable.userId, user.id),
    orderBy: desc(analysisHistoryTable.createdAt),
    limit: 5,
  });
  const skills = new Set(analyses.flatMap((item) => item?.analysis.skills ?? []));
  const payload = {
    resumeScore: latestAnalysis?.overallScore ?? 0,
    atsScore: latestAnalysis?.atsScore ?? 0,
    latestJobMatch: latestMatch[0]?.match.score ?? null,
    skillsFound: skills.size,
    skillsMissing: latestAnalysis ? Math.max(0, 8 - latestAnalysis.analysis.skills.length) : 0,
    resumesAnalyzed: analyses.filter(Boolean).length,
    recentActivity: history.map((item) => ({ id: item.id, type: item.type as "resume" | "job", title: item.title, score: item.score, createdAt: iso(item.createdAt) })),
  };
  res.json(GetDashboardResponse.parse(payload));
});

router.get("/resumes", ...protectedRoute, async (req, res) => {
  const user = await currentUser(req as AuthenticatedRequest);
  const resumes = await db.query.resumesTable.findMany({
    where: eq(resumesTable.userId, user.id),
    orderBy: desc(resumesTable.createdAt),
  });
  const output = await Promise.all(resumes.map(async (resume) => {
    const analysis = await db.query.resumeAnalysesTable.findFirst({
      where: eq(resumeAnalysesTable.resumeId, resume.id),
      orderBy: desc(resumeAnalysesTable.createdAt),
    });
    return resumeOutput(resume, analysis);
  }));
  res.json(ListResumesResponse.parse(output));
});

router.post("/resumes", ...protectedRoute, async (req, res) => {
  const parsed = CreateResumeBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.objectPath.startsWith("/objects/")) {
    res.status(400).json(error("A valid private object path is required"));
    return;
  }
  const user = await currentUser(req as AuthenticatedRequest);
  let extractedText = parsed.data.extractedText ?? null;
  try {
    const file = await storage.getObjectEntityFile(parsed.data.objectPath);
    if (!extractedText) {
      const [buffer] = await file.download();
      extractedText = await extractResumeText(buffer, parsed.data.fileType);
    }
    await storage.trySetObjectEntityAclPolicy(parsed.data.objectPath, { owner: user.clerkId, visibility: "private" });
  } catch (err) {
    req.log.warn({ err }, "Resume object could not be read immediately");
  }
  const [resume] = await db.insert(resumesTable).values({
    userId: user.id,
    fileName: parsed.data.fileName,
    fileType: parsed.data.fileType,
    objectPath: parsed.data.objectPath,
    extractedText,
    status: "uploaded",
  }).returning();
  res.status(201).json(CreateResumeResponse.parse(resumeOutput(resume)));
});

router.get("/resumes/:id", ...protectedRoute, async (req, res) => {
  const parsed = GetResumeParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(404).json(error("Resume not found"));
    return;
  }
  const user = await currentUser(req as AuthenticatedRequest);
  const resume = await ownedResume(parsed.data.id, user.id);
  if (!resume) {
    res.status(404).json(error("Resume not found"));
    return;
  }
  const analysis = await db.query.resumeAnalysesTable.findFirst({
    where: eq(resumeAnalysesTable.resumeId, resume.id),
    orderBy: desc(resumeAnalysesTable.createdAt),
  });
  res.json(GetResumeResponse.parse({ ...resumeOutput(resume, analysis), analysis: analysis ? analysisOutput(analysis) : null }));
});

router.post("/resumes/:id/analyze", ...protectedRoute, async (req, res) => {
  const parsed = AnalyzeResumeParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(404).json(error("Resume not found"));
    return;
  }
  const user = await currentUser(req as AuthenticatedRequest);
  const resume = await ownedResume(parsed.data.id, user.id);
  if (!resume) {
    res.status(404).json(error("Resume not found"));
    return;
  }
  await db.update(resumesTable).set({ status: "analyzing" }).where(eq(resumesTable.id, resume.id));
  try {
    const result = await analyzeResume(await resumeText(resume));
    const [analysis] = await db.insert(resumeAnalysesTable).values({
      resumeId: resume.id,
      overallScore: Math.round((result.atsBreakdown.completeness + result.atsBreakdown.skillsRelevance + result.atsBreakdown.keywords + result.atsBreakdown.experience + result.atsBreakdown.projects + result.atsBreakdown.education) / 6),
      atsScore: Math.round((result.atsBreakdown.keywords + result.atsBreakdown.completeness) / 2),
      analysis: result,
    }).returning();
    await db.update(resumesTable).set({ status: "analyzed", extractedText: resume.extractedText || (await resumeText(resume)) }).where(eq(resumesTable.id, resume.id));
    await db.insert(skillsTable).values(result.skills.map((name) => ({ userId: user.id, resumeId: resume.id, name })));
    await db.insert(analysisHistoryTable).values({ userId: user.id, type: "resume", title: resume.fileName, score: analysis.overallScore });
    res.json(AnalyzeResumeResponse.parse(analysisOutput(analysis)));
  } catch (err) {
    await db.update(resumesTable).set({ status: "failed" }).where(eq(resumesTable.id, resume.id));
    req.log.error({ err, resumeId: resume.id }, "Resume analysis failed");
    res.status(503).json(error("Analysis is temporarily unavailable"));
  }
});

router.post("/jobs/match", ...protectedRoute, async (req, res) => {
  const parsed = MatchJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(error("Choose a resume and provide a job description of at least 30 characters"));
    return;
  }
  const user = await currentUser(req as AuthenticatedRequest);
  const resume = await ownedResume(parsed.data.resumeId, user.id);
  if (!resume) {
    res.status(404).json(error("Resume not found"));
    return;
  }
  const result = await matchResumeToJob(await resumeText(resume), parsed.data.description);
  const score = Math.round(Object.values(result.dimensions).reduce((sum, value) => sum + value, 0) / 5);
  const [job] = await db.insert(jobDescriptionsTable).values({
    userId: user.id,
    resumeId: resume.id,
    title: parsed.data.title,
    company: parsed.data.company ?? null,
    description: parsed.data.description,
  }).returning();
  const [match] = await db.insert(jobMatchesTable).values({
    jobDescriptionId: job.id,
    resumeId: resume.id,
    score,
    result,
  }).returning();
  await db.insert(analysisHistoryTable).values({ userId: user.id, type: "job", title: parsed.data.title, score });
  res.status(201).json(MatchJobResponse.parse({
    id: match.id,
    title: job.title,
    company: job.company,
    score,
    ...result.dimensions,
    ...result,
    createdAt: iso(match.createdAt),
  }));
});

router.get("/analysis/history", ...protectedRoute, async (req, res) => {
  const user = await currentUser(req as AuthenticatedRequest);
  const history = await db.query.analysisHistoryTable.findMany({
    where: eq(analysisHistoryTable.userId, user.id),
    orderBy: desc(analysisHistoryTable.createdAt),
  });
  res.json(ListAnalysisHistoryResponse.parse(history.map((item) => ({
    id: item.id,
    type: item.type as "resume" | "job",
    title: item.title,
    score: item.score,
    createdAt: iso(item.createdAt),
  }))));
});

router.post("/resume/improve-bullet", ...protectedRoute, async (req, res) => {
  const parsed = ImproveResumeBulletBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(error("Provide a resume bullet of at least 5 characters"));
    return;
  }
  const result = await improveBullet(parsed.data.bullet, parsed.data.context ?? null);
  res.json(ImproveResumeBulletResponse.parse(result));
});

router.get("/job-recommendations", ...protectedRoute, async (req, res) => {
  const user = await currentUser(req as AuthenticatedRequest);
  const resumes = await db.query.resumesTable.findMany({
    where: eq(resumesTable.userId, user.id),
    orderBy: desc(resumesTable.createdAt),
  });
  const latest = resumes[0] ? await db.query.resumeAnalysesTable.findFirst({
    where: eq(resumeAnalysesTable.resumeId, resumes[0].id),
    orderBy: desc(resumeAnalysesTable.createdAt),
  }) : null;
  res.json(ListJobRecommendationsResponse.parse(latest ? recommendationsFromAnalysis(latest.analysis) : []));
});

export default router;