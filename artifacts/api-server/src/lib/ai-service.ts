import type { ResumeAnalysisJson } from "@workspace/db";

type MatchResult = {
  dimensions: {
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
    keywordMatch: number;
    projectRelevance: number;
  };
  skills: Array<{ name: string; status: "matched" | "partial" | "missing"; reason: string }>;
  missingKeywords: string[];
  recommendations: Array<{ priority: number; title: string; detail: string }>;
};

const skillCatalog = [
  "JavaScript", "TypeScript", "React", "Python", "SQL", "Figma", "User research",
  "Product strategy", "Data analysis", "Project management", "HTML", "CSS",
  "Node.js", "Git", "Prototyping", "Wireframing", "Communication",
];
const stopWords = new Set("the and for with from that this your have are our you will into about their they not but using work role team".split(" "));

function topTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word]) => word);
}

function section(text: string, names: string[]): string {
  const lower = text.toLowerCase();
  const start = names.map((name) => lower.indexOf(name)).find((index) => index >= 0);
  if (start === undefined) return "";
  return text.slice(start, start + 700);
}

export function localResumeAnalysis(text: string): ResumeAnalysisJson {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();
  const skills = skillCatalog.filter((skill) => lower.includes(skill.toLowerCase()));
  const email = normalized.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? null;
  const phone = normalized.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? null;
  const lines = normalized.split(/\s{2,}|(?<=\.)\s+(?=[A-Z])/).map((line) => line.trim()).filter(Boolean);
  const experienceText = section(normalized, ["experience", "work history", "employment"]);
  const educationText = section(normalized, ["education", "academic"]);
  const projectText = section(normalized, ["projects", "selected work"]);
  const keywords = topTerms(normalized);
  const completeness = Math.min(100, 38 + (email ? 12 : 0) + (phone ? 8 : 0) + (experienceText ? 18 : 0) + (educationText ? 12 : 0) + (skills.length ? 12 : 0));
  const atsBreakdown = {
    skillsRelevance: Math.min(100, 38 + skills.length * 4),
    keywords: Math.min(100, 42 + keywords.length * 6),
    experience: experienceText ? 78 : 34,
    projects: projectText ? 74 : 35,
    education: educationText ? 78 : 30,
    completeness,
  };
  const atsScore = Math.round(Object.values(atsBreakdown).reduce((sum, value) => sum + value, 0) / 6);
  const overallScore = Math.round(atsScore * 0.65 + Math.min(100, 35 + skills.length * 5) * 0.35);

  return {
    contact: {
      name: lines[0]?.slice(0, 120) ?? null,
      email,
      phone,
      location: null,
    },
    education: educationText ? [{ title: "Education", organization: "Detected from resume", period: "", description: educationText.slice(0, 240) }] : [],
    experience: experienceText ? [{ title: "Professional experience", organization: "Detected from resume", period: "", description: experienceText.slice(0, 300) }] : [],
    projects: projectText ? [{ name: "Selected project", description: projectText.slice(0, 260), technologies: skills.slice(0, 6) }] : [],
    certifications: [],
    skills,
    strengths: [
      skills.length ? `Clear evidence of ${skills.slice(0, 3).join(", ")}.` : "Your resume gives us a starting point to strengthen.",
      experienceText ? "Experience is represented in a recognizable section." : "The document is ready for a clearer experience story.",
    ],
    weaknesses: [
      !email ? "Add a professional email address so recruiters can reach you." : "Consider linking your portfolio or LinkedIn beside your contact details.",
      !projectText ? "Add one or two projects with outcomes and the tools you used." : "Make project outcomes more measurable where you can.",
    ],
    suggestions: [
      { priority: 1, title: "Lead with outcomes", detail: "Where possible, connect each bullet to a measurable result, change, or decision." },
      { priority: 2, title: "Make keywords specific", detail: `Use the language of the roles you want, especially around ${keywords.slice(0, 3).join(", ") || "your core skills"}.` },
      { priority: 3, title: "Keep the scan path simple", detail: "Use consistent headings, dates, and bullet structure so automated screeners can parse the story." },
    ],
    atsBreakdown,
  };
}

function localMatch(resumeText: string, jobText: string): MatchResult {
  const resumeLower = resumeText.toLowerCase();
  const jobLower = jobText.toLowerCase();
  const requested = [...new Set(skillCatalog.filter((skill) => jobLower.includes(skill.toLowerCase())))];
  const terms = topTerms(jobText);
  const skills = (requested.length ? requested : terms.slice(0, 6)).map((name) => {
    const present = resumeLower.includes(name.toLowerCase());
    return {
      name,
      status: present ? "matched" as const : "missing" as const,
      reason: present ? "This signal appears in your resume." : "This requirement is not clearly evidenced in the current resume.",
    };
  });
  const matched = skills.filter((skill) => skill.status === "matched").length;
  const skillMatch = skills.length ? Math.round((matched / skills.length) * 100) : 52;
  const keywordMatch = Math.min(100, 40 + terms.filter((term) => resumeLower.includes(term)).length * 10);
  const experienceMatch = /experience|intern|worked|led|built|managed/i.test(resumeText) ? 76 : 40;
  const educationMatch = /education|degree|university|college/i.test(resumeText) ? 74 : 38;
  const projectRelevance = /project|portfolio|prototype|research/i.test(resumeText) ? 78 : 40;
  return {
    dimensions: { skillMatch, keywordMatch, experienceMatch, educationMatch, projectRelevance },
    skills,
    missingKeywords: terms.filter((term) => !resumeLower.includes(term)).slice(0, 6),
    recommendations: [
      { priority: 1, title: "Mirror the role's language", detail: "Use accurate keywords from the job description in the bullets where your experience supports them." },
      { priority: 2, title: "Show the proof", detail: "Pair the most relevant responsibility with a result, scope, or decision you owned." },
    ],
  };
}

async function askModel(prompt: string): Promise<unknown | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful resume analyst. Return valid JSON only. Never invent a person's achievements, employers, metrics, or skills." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}


async function askGroqModel(prompt: string): Promise<unknown | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.warn("[AI] GROQ_API_KEY is not set");
    return null;
  }

  const model =
    process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a careful resume writer. Return valid JSON only. Never invent achievements, metrics, employers, skills, or responsibilities.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn(
      `[AI] Groq request failed (${response.status}): ${errorBody.slice(0, 500)}`
    );
    return null;
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}


export async function analyzeResume(text: string): Promise<ResumeAnalysisJson> {
  const fallback = localResumeAnalysis(text);

  const model = await askModel(
    `Analyze this resume and return an object with contact, education, experience, projects, certifications, skills, strengths, weaknesses, suggestions, and atsBreakdown. Every suggestion needs priority, title, and detail. Keep atsBreakdown values 0-100. Resume:\n${text.slice(0, 100000)}`
  );

  if (!model || typeof model !== "object") {
    return fallback;
  }

  const candidate = model as Partial<ResumeAnalysisJson>;

  return {
    ...fallback,

    contact:
      candidate.contact &&
      typeof candidate.contact === "object"
        ? {
            name: typeof candidate.contact.name === "string" ? candidate.contact.name : fallback.contact.name,
            email: typeof candidate.contact.email === "string" ? candidate.contact.email : fallback.contact.email,
            phone: typeof candidate.contact.phone === "string" ? candidate.contact.phone : fallback.contact.phone,
            location:
              typeof candidate.contact.location === "string"
                ? candidate.contact.location
                : fallback.contact.location,
          }
        : fallback.contact,

    education: Array.isArray(candidate.education)
      ? candidate.education
      : fallback.education,

    experience: Array.isArray(candidate.experience)
      ? candidate.experience
      : fallback.experience,

    projects: Array.isArray(candidate.projects)
      ? candidate.projects
      : fallback.projects,

    certifications: Array.isArray(candidate.certifications)
      ? candidate.certifications
      : fallback.certifications,

    skills: Array.isArray(candidate.skills)
      ? candidate.skills
      : fallback.skills,

    strengths: Array.isArray(candidate.strengths)
      ? candidate.strengths
      : fallback.strengths,

    weaknesses: Array.isArray(candidate.weaknesses)
      ? candidate.weaknesses
      : fallback.weaknesses,

    suggestions: Array.isArray(candidate.suggestions)
      ? candidate.suggestions
      : fallback.suggestions,

    atsBreakdown:
      candidate.atsBreakdown &&
      typeof candidate.atsBreakdown === "object"
        ? {
            skillsRelevance:
              typeof candidate.atsBreakdown.skillsRelevance === "number"
                ? candidate.atsBreakdown.skillsRelevance
                : fallback.atsBreakdown.skillsRelevance,

            keywords:
              typeof candidate.atsBreakdown.keywords === "number"
                ? candidate.atsBreakdown.keywords
                : fallback.atsBreakdown.keywords,

            experience:
              typeof candidate.atsBreakdown.experience === "number"
                ? candidate.atsBreakdown.experience
                : fallback.atsBreakdown.experience,

            projects:
              typeof candidate.atsBreakdown.projects === "number"
                ? candidate.atsBreakdown.projects
                : fallback.atsBreakdown.projects,

            education:
              typeof candidate.atsBreakdown.education === "number"
                ? candidate.atsBreakdown.education
                : fallback.atsBreakdown.education,

            completeness:
              typeof candidate.atsBreakdown.completeness === "number"
                ? candidate.atsBreakdown.completeness
                : fallback.atsBreakdown.completeness,
          }
        : fallback.atsBreakdown,
  };
}

export async function matchResumeToJob(resumeText: string, jobText: string): Promise<MatchResult> {
  const fallback = localMatch(resumeText, jobText);
  const model = await askModel(`Compare this resume to this job description. Return JSON with dimensions (skillMatch, experienceMatch, educationMatch, keywordMatch, projectRelevance), skills (name, status matched|partial|missing, reason), missingKeywords, recommendations (priority, title, detail). Keep scores 0-100 and only use evidence in the resume. Resume:\\n${resumeText.slice(0, 70000)}\\nJob:\\n${jobText.slice(0, 30000)}`);
  if (!model || typeof model !== "object") return fallback;
  return { ...fallback, ...(model as Partial<MatchResult>) };
}

export async function improveBullet(bullet: string, context: string | null) {
  const cleanBullet = bullet.replace(/^[-•]\s*/, "").trim();
  const cleanContext = context?.trim() || "";

  const fallback = {
    original: bullet,
    improved: cleanBullet,
    notes: [
      "Rewrite the bullet with a stronger action verb while preserving the original facts.",
      "Add measurable results or scope only when they are explicitly provided.",
    ],
  };

  const prompt = `You are an expert technical resume writer.

Rewrite the resume bullet below so it is concise, specific, professional, and ATS-friendly.

IMPORTANT RULES:
1. Preserve every factual claim from the original bullet.
2. You MAY use factual details from the provided context.
3. NEVER invent metrics, percentages, users, revenue, performance improvements, responsibilities, technologies, or achievements.
4. Rewrite the bullet substantially when the available facts allow it. The result should sound like a professional software-engineering resume bullet, not a simple paraphrase.
5. Start with the strongest accurate action verb for the work, such as Engineered, Developed, Implemented, Built, Designed, Automated, Optimized, Analyzed, or Integrated.
6. Structure the bullet around: strong action + what was built/done + relevant technical implementation + scope, purpose, or result when supported by the input.
7. Replace vague wording such as "worked on", "helped", "various", or "responsible for" with precise language that describes the actual contribution.
8. Keep the improved bullet to one strong resume bullet, preferably 20-35 words.
9. Use concrete technologies, responsibilities, implementation details, project scope, and outcomes from the context whenever they are relevant. Do not omit useful factual details merely to keep the wording generic.
10. Never invent numbers, percentages, users, revenue, performance improvements, scale, responsibilities, technologies, or outcomes. If an important result is not provided, describe the work itself rather than inventing an impact.
11. Return ONLY valid JSON with exactly these fields:
{
  "original": "original bullet",
  "improved": "rewritten bullet",
  "notes": ["short explanation of improvement 1", "short explanation of improvement 2"]
}

Original bullet:
${cleanBullet}

Helpful context:
${cleanContext || "No additional context was provided."}`;

  const model =
    (await askGroqModel(prompt)) ??
    (await askModel(prompt));

  if (!model || typeof model !== "object") return fallback;

  const result = model as Partial<typeof fallback>;

  return {
    original: bullet,
    improved:
      typeof result.improved === "string" && result.improved.trim()
        ? result.improved.trim()
        : fallback.improved,
    notes:
      Array.isArray(result.notes) && result.notes.length
        ? result.notes
        : fallback.notes,
  };
}

export function recommendationsFromAnalysis(analysis: ResumeAnalysisJson) {
  const skills = analysis.skills.map((skill) => skill.toLowerCase());
  const roles = [
    ["Product design intern", ["figma", "user research", "prototyping"]],
    ["Frontend engineering intern", ["javascript", "typescript", "react", "css"]],
    ["UX research intern", ["user research", "communication", "data analysis"]],
    ["Product analyst intern", ["sql", "data analysis", "python"]],
  ];
  return roles.map(([role, required]) => {
    const matches = (required as string[]).filter((skill) => skills.includes(skill));
    return { role: role as string, score: Math.min(98, 42 + matches.length * 16), reason: matches.length ? `Your resume shows ${matches.join(", ")}, which are useful signals for this path.` : "Your current resume does not yet show many direct signals for this path, but the gap is actionable." };
  }).sort((a, b) => b.score - a.score);
}
