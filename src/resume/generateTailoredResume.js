import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { mdToPdf } from "md-to-pdf";
import { createZipArchive } from "../utils/zip.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "../../.cache/tailored-resumes");
const APPLY_PACK_OUTPUT_DIR = path.resolve(__dirname, "../../.cache/apply-packs");
const DEFAULT_BASE_RESUME_PDF = path.resolve(
  __dirname,
  "../../assets/resume/base/base-resume.pdf"
);

function normalize(value) {
  return String(value || "").trim();
}

function sanitizeFilePart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function parseSkillList(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map(v => normalize(v))
      .filter(Boolean)
  )];
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeForMarkdown(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value, maxLength = 1200) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

async function convertMarkdownToPdf(inputPath, outputPath) {
  if (!isTruthy(process.env.RESUME_PDF_ENABLED || "true")) {
    return null;
  }

  try {
    await mdToPdf({ path: inputPath }, { dest: outputPath });
    return outputPath;
  } catch (error) {
    console.log(`⚠️ PDF conversion failed for ${inputPath}: ${error.message}`);
    return null;
  }
}

function getCandidateProfile() {
  return {
    name: normalize(process.env.RESUME_CANDIDATE_NAME || "Sunil Khatate"),
    email: normalize(process.env.RESUME_CANDIDATE_EMAIL || ""),
    phone: normalize(process.env.RESUME_CANDIDATE_PHONE || ""),
    years: toFiniteNumber(process.env.RESUME_EXPERIENCE_YEARS, 0),
    targetRole: normalize(process.env.RESUME_TARGET_ROLE || "Salesforce Developer"),
    profileSkills: parseSkillList(process.env.RESUME_SKILLS || ""),
    resumeText: normalize(process.env.RESUME_TEXT || "")
  };
}

function inferKeywordList(job) {
  const text = `${job.title || ""} ${job.skills || ""} ${job.description || ""}`.toLowerCase();
  const candidates = [
    "Salesforce",
    "Apex",
    "LWC",
    "SOQL",
    "SOSL",
    "Integration",
    "REST API",
    "Sales Cloud",
    "Service Cloud",
    "Experience Cloud",
    "CPQ",
    "Field Service",
    "Flows",
    "Triggers",
    "JavaScript"
  ];

  return candidates.filter(keyword => text.includes(keyword.toLowerCase()));
}

function getTopResumePackLimit() {
  return Math.max(
    0,
    toFiniteNumber(
      process.env.RESUME_TOP_OPPORTUNITY_LIMIT,
      process.env.RESUME_ATTACHMENT_MAX_FILES || 1
    )
  );
}

function shouldUseFullApplyPack(job) {
  return String(job?.opportunity_kind || "listing").trim().toLowerCase() !== "post";
}

function buildBasicTailoredResume(job) {
  const profile = getCandidateProfile();
  const matchScore = Number(job.match_score || 0);
  const matchLevel = normalize(job.match_level || "N/A");
  const matchedSkills = Array.isArray(job.matched_skills) ? job.matched_skills : [];
  const missingSkills = Array.isArray(job.missing_skills) ? job.missing_skills : [];
  const actions = Array.isArray(job.resume_actions) ? job.resume_actions : [];
  const atsKeywords = inferKeywordList(job);

  const coreSkills = [...new Set([...matchedSkills, ...profile.profileSkills])].slice(0, 16);
  const summarySkills = coreSkills.slice(0, 6).join(", ");
  const missingText = missingSkills.length > 0
    ? missingSkills.slice(0, 5).join(", ")
    : "No major gaps detected";

  const lines = [];
  lines.push(`# ${profile.name}`);
  if (profile.email || profile.phone) {
    lines.push(`${[profile.email, profile.phone].filter(Boolean).join(" | ")}`);
  }
  lines.push("");
  lines.push(`## Target Role`);
  lines.push(`${profile.targetRole}`);
  lines.push("");
  lines.push(`## Job Alignment Snapshot`);
  lines.push(`- Match Score: ${matchScore}% (${matchLevel})`);
  lines.push(`- Job: ${normalize(job.title)} at ${normalize(job.company)}`);
  lines.push(`- Location: ${normalize(job.location) || "N/A"}`);
  lines.push(`- Apply Link: ${normalize(job.apply_link) || "N/A"}`);
  lines.push(`- Missing Skills: ${missingText}`);
  lines.push("");
  lines.push(`## Professional Summary`);
  lines.push(
    `Salesforce-focused engineer targeting ${normalize(job.title) || "Salesforce Developer"} roles with strong experience in ${summarySkills || "Salesforce platform development"}.`
  );
  lines.push(
    `Hands-on in building scalable CRM solutions, automation, integrations, and business-critical enhancements with measurable delivery impact.`
  );
  lines.push("");
  lines.push(`## Core Skills`);
  if (coreSkills.length > 0) {
    for (const skill of coreSkills) {
      lines.push(`- ${skill}`);
    }
  } else {
    lines.push("- Salesforce Platform");
    lines.push("- Apex");
    lines.push("- LWC");
  }
  lines.push("");
  lines.push(`## ATS Keywords For This Job`);
  if (atsKeywords.length > 0) {
    lines.push(`- ${atsKeywords.join(", ")}`);
  } else {
    lines.push("- Salesforce, Apex, LWC, Integration, CRM");
  }
  lines.push("");
  lines.push(`## Resume Optimization Actions`);
  if (actions.length > 0) {
    for (const action of actions.slice(0, 3)) {
      lines.push(`- ${action}`);
    }
  } else {
    lines.push("- Add role-specific project bullets with measurable impact.");
    lines.push("- Keep keywords aligned with the target job description.");
  }
  lines.push("");
  lines.push(`## Experience Highlights`);
  lines.push(
    "- Add your strongest Salesforce project where you improved business process speed or accuracy."
  );
  lines.push(
    "- Add one integration project (REST/SOAP) and mention scale (records/users/systems)."
  );
  lines.push(
    "- Add one automation project (Flows/Triggers) and quantifiable outcome."
  );
  lines.push("");
  lines.push(
    "_Generated automatically by Naukri + LinkedIn Job Agent. Review and edit before final submission._"
  );

  return lines.join("\n");
}

async function buildAiTailoredResume(job, basicResumeText) {
  if (!isTruthy(process.env.RESUME_TAILOR_WITH_AI)) {
    return basicResumeText;
  }

  const apiKey = normalize(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return basicResumeText;
  }

  const profile = getCandidateProfile();
  const prompt = [
    "You are an expert ATS resume writer.",
    "Rewrite the resume in clean markdown.",
    "Keep facts realistic. Do not invent companies or years.",
    "Use sections: Summary, Skills, Experience Highlights, Keywords.",
    "Output only markdown.",
    "",
    `Target job title: ${normalize(job.title)}`,
    `Company: ${normalize(job.company)}`,
    `Location: ${normalize(job.location)}`,
    `Match score: ${normalize(job.match_score)}`,
    `Missing skills: ${Array.isArray(job.missing_skills) ? job.missing_skills.join(", ") : ""}`,
    `Resume actions: ${Array.isArray(job.resume_actions) ? job.resume_actions.join(" | ") : ""}`,
    "",
    "Candidate base resume text:",
    profile.resumeText || "Not provided",
    "",
    "Current draft:",
    basicResumeText
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.RESUME_AI_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        max_output_tokens: 1400,
        input: prompt
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`⚠️ Tailored resume AI failed: ${text.slice(0, 140)}`);
      return basicResumeText;
    }

    const data = await response.json();
    const output = normalize(data?.output_text || "");
    return output || basicResumeText;
  } catch (error) {
    console.log(`⚠️ Tailored resume AI error: ${error.message}`);
    return basicResumeText;
  }
}

function buildBasicApplyPack(job) {
  const profile = getCandidateProfile();
  const matchedSkills = Array.isArray(job.matched_skills)
    ? job.matched_skills
    : [];
  const missingSkills = Array.isArray(job.missing_skills)
    ? job.missing_skills
    : [];
  const resumeActions = Array.isArray(job.resume_actions)
    ? job.resume_actions
    : [];
  const keywordList = inferKeywordList(job);
  const jobTitle = normalize(job.title) || "Salesforce Developer";
  const company = normalize(job.company) || "Hiring Team";
  const location = normalize(job.location) || "N/A";
  const applyLink = normalize(job.apply_link) || "N/A";
  const score = toFiniteNumber(job.match_score, 0);
  const level = normalize(job.match_level || "N/A");

  const lines = [];
  lines.push(`# Apply Pack - ${jobTitle} @ ${company}`);
  lines.push("");
  lines.push("## Job Snapshot");
  lines.push(`- Job: ${jobTitle}`);
  lines.push(`- Company: ${company}`);
  lines.push(`- Location: ${location}`);
  lines.push(`- Match Score: ${score}% (${level})`);
  lines.push(`- Apply Link: ${applyLink}`);
  lines.push(
    `- Missing Skills: ${missingSkills.length > 0 ? missingSkills.slice(0, 5).join(", ") : "No major gaps"}`
  );
  lines.push("");
  lines.push("## Tailored Cover Letter");
  lines.push(`Dear Hiring Manager at ${company},`);
  lines.push("");
  lines.push(
    `I am applying for the ${jobTitle} role. I have hands-on Salesforce experience in ${matchedSkills.slice(0, 5).join(", ") || "Apex, LWC, SOQL and integrations"}, and I focus on delivering reliable CRM solutions with measurable business impact.`
  );
  lines.push(
    `I have worked on automation, integrations, and production support to improve process speed, quality, and user adoption. My target role is ${profile.targetRole}, and this opportunity matches my core strengths and long-term direction.`
  );
  if (missingSkills.length > 0) {
    lines.push(
      `I am actively upskilling in ${missingSkills.slice(0, 3).join(", ")} to align fully with this role's requirements.`
    );
  }
  lines.push(
    "I would value the opportunity to discuss how I can contribute to your Salesforce roadmap."
  );
  lines.push("");
  lines.push("Sincerely,");
  lines.push(profile.name || "Candidate");
  if (profile.email || profile.phone) {
    lines.push([profile.email, profile.phone].filter(Boolean).join(" | "));
  }
  lines.push("");
  lines.push("## Interview Q&A Prep");
  lines.push("1. **Q:** How would you design a scalable Salesforce data model for this role?");
  lines.push(
    `   **A:** I start with clear object relationships, field governance, and indexing for query-heavy objects. I then align automations and sharing with business processes to keep performance stable at scale.`
  );
  lines.push("2. **Q:** How do you decide between Flow and Apex?");
  lines.push(
    "   **A:** I use Flow for declarative and maintainable automation. I choose Apex when logic is complex, needs transaction control, or requires reusable service layers and testing depth."
  );
  lines.push("3. **Q:** How do you approach integrations?");
  lines.push(
    "   **A:** I design for retries, idempotency, monitoring, and clear error handling. I prefer asynchronous patterns for reliability and use platform events/queueables when needed."
  );
  lines.push("4. **Q:** How do you maintain code quality?");
  lines.push(
    "   **A:** I enforce naming standards, test coverage with meaningful assertions, small deployable changes, and peer review. I also track logs and failures after release."
  );
  lines.push("5. **Q:** Why are you a fit for this role?");
  lines.push(
    `   **A:** My experience aligns with ${keywordList.slice(0, 6).join(", ") || "Salesforce platform engineering"}, and I can contribute quickly to feature delivery and production reliability.`
  );
  lines.push("6. **Q:** How do you handle production incidents and post-release monitoring?");
  lines.push(
    "   **A:** I triage by business impact, analyze logs and failed transactions, apply targeted hotfixes, and document root cause with preventive actions for future releases."
  );
  lines.push("");
  lines.push("## Apply Checklist");
  lines.push("- [ ] Verify resume title matches the job title.");
  lines.push("- [ ] Add 2 role-specific project bullets with metrics.");
  lines.push("- [ ] Add/confirm keywords from this job description.");
  lines.push("- [ ] Review resume and cover letter for concise language.");
  lines.push("- [ ] Submit application and record it with tracker command.");
  lines.push("- [ ] Add follow-up note and follow-up date.");
  lines.push("- [ ] Prepare 3 role-specific interview stories (impact, approach, outcome).");
  lines.push("- [ ] Save this opportunity in your application tracker with final status.");
  lines.push("");
  lines.push("## Tracker Commands");
  lines.push("- `npm run tracker -- summary`");
  lines.push("- `npm run tracker -- list new 20`");
  lines.push("- `npm run tracker -- set <job_hash> applied \"Applied via portal\"`");
  lines.push("- `npm run tracker -- note <job_hash> \"Follow up in 2 days\"`");
  lines.push("");
  lines.push("## Resume Action Hints");
  if (resumeActions.length > 0) {
    for (const action of resumeActions.slice(0, 5)) {
      lines.push(`- ${action}`);
    }
  } else {
    lines.push("- Add quantifiable impact bullets relevant to this role.");
  }
  lines.push("");
  lines.push(
    "_Generated by Salesforce Job Radar Agent. Review and edit before final submission._"
  );

  return lines.join("\n");
}

async function buildApplyEmailDraft(job) {
  const profile = getCandidateProfile();
  const subject = `Application for ${normalize(job.title) || "Salesforce Developer"}`;
  const intro = `Hello Hiring Team,\n\nI am applying for the ${normalize(job.title)} role at ${normalize(job.company)}. I have strong experience with Salesforce platform development, and I believe my background aligns well with the role requirements. Please find my resume and apply bundle attached.`;
  const body = `${intro}\n\nBest regards,\n${profile.name || "Candidate"}\n${profile.email || ""}${profile.phone ? ` | ${profile.phone}` : ""}`;

  return { subject, body };
}

export function selectTopResumePackJobs(jobs) {
  const limit = getTopResumePackLimit();
  if (limit === 0) return [];

  return [...(Array.isArray(jobs) ? jobs : [])]
    .filter(job => shouldUseFullApplyPack(job))
    .sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0))
    .slice(0, limit);
}

export async function buildResumePreview(job) {
  const profile = getCandidateProfile();
  const keywords = inferKeywordList(job).slice(0, 8);
  const resumeActions = Array.isArray(job?.resume_actions)
    ? job.resume_actions.slice(0, 3)
    : [];
  const bulletSuggestions = Array.isArray(job?.resume_bullet_suggestions)
    ? job.resume_bullet_suggestions.slice(0, 3)
    : [];
  const draft = await buildApplyEmailDraft(job);

  return {
    candidateName: profile.name,
    atsKeywords: keywords,
    resumeActions,
    bulletSuggestions,
    draftSubject: draft.subject,
    draftBody: draft.body
  };
}

function getPreviewJobKey(job) {
  return String(
    job?.job_hash ||
      job?.source_job_id ||
      job?.canonical_apply_url ||
      job?.apply_link ||
      `${job?.title || ""}|${job?.company || ""}|${job?.location || ""}`
  ).trim();
}

export async function annotateJobsWithResumeSupport(
  jobs,
  {
    previewLimit = getTopResumePackLimit(),
    fullPackJobs = [],
    attachmentsEnabled = false
  } = {}
) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (list.length === 0 || previewLimit <= 0) {
    return list;
  }

  const previewCandidates = [...list]
    .sort((a, b) => Number(b?.match_score || 0) - Number(a?.match_score || 0))
    .slice(0, previewLimit);
  const previewMap = new Map();
  for (const job of previewCandidates) {
    previewMap.set(getPreviewJobKey(job), await buildResumePreview(job));
  }

  const fullPackKeys = new Set(
    (Array.isArray(fullPackJobs) ? fullPackJobs : []).map(getPreviewJobKey)
  );

  return list.map(job => {
    const key = getPreviewJobKey(job);
    const preview = previewMap.get(key);
    if (!preview) {
      return job;
    }

    const defaultMode = shouldUseFullApplyPack(job)
      ? attachmentsEnabled
        ? "full_pack_attached"
        : "full_pack_ready"
      : "preview_only";

    return {
      ...job,
      resume_support: {
        mode: fullPackKeys.has(key) ? defaultMode : "preview_only",
        preview
      }
    };
  });
}

async function writeApplyEmailDraft(job, index) {
  const draft = await buildApplyEmailDraft(job);
  const slug = sanitizeFilePart(job.title || `job-${index + 1}`) || `job-${index + 1}`;
  const score = Number.isFinite(Number(job.match_score))
    ? `${Number(job.match_score)}`
    : "na";
  const filename = `apply-email-${index + 1}-${slug}-score-${score}.txt`;
  const dir = path.resolve(__dirname, "../../.cache/apply-bundles");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);

  const content = `Subject: ${draft.subject}\n\n${draft.body}`;
  await fs.writeFile(filePath, content, "utf8");

  return {
    filename,
    path: filePath,
    contentType: "text/plain",
    caption: `Email draft: ${job.title || "Salesforce role"}`
  };
}

async function buildAiApplyPack(job, basicApplyPackText) {
  if (!isTruthy(process.env.APPLY_PACK_AI_ENABLED || "true")) {
    return basicApplyPackText;
  }

  const apiKey = normalize(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return basicApplyPackText;
  }

  const profile = getCandidateProfile();
  const prompt = [
    "You are an expert job-application coach for Salesforce developers.",
    "Generate a markdown apply pack with exactly these sections and headings:",
    "1) ## Tailored Cover Letter",
    "2) ## Interview Q&A Prep",
    "3) ## Apply Checklist",
    "4) ## Resume Action Hints",
    "Use concise and realistic wording. Do not invent fake companies or years.",
    "Interview Q&A Prep must contain exactly 6 Q&A pairs.",
    "Apply Checklist must contain exactly 8 checkbox items.",
    "Output valid markdown only.",
    "",
    `Candidate name: ${profile.name || "Candidate"}`,
    `Candidate target role: ${profile.targetRole || "Salesforce Developer"}`,
    `Candidate years experience: ${profile.years > 0 ? profile.years : "unknown"}`,
    `Candidate skills: ${profile.profileSkills.join(", ") || "not provided"}`,
    "",
    `Job title: ${normalize(job.title)}`,
    `Company: ${normalize(job.company)}`,
    `Location: ${normalize(job.location)}`,
    `Apply link: ${normalize(job.apply_link)}`,
    `Match score: ${normalize(job.match_score)}`,
    `Match level: ${normalize(job.match_level)}`,
    `Missing skills: ${Array.isArray(job.missing_skills) ? job.missing_skills.join(", ") : ""}`,
    `Resume actions: ${Array.isArray(job.resume_actions) ? job.resume_actions.join(" | ") : ""}`,
    `Job skills text: ${truncate(job.skills, 900)}`,
    `Job description text: ${truncate(job.description, 2200)}`,
    "",
    "Fallback draft:",
    basicApplyPackText
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.APPLY_PACK_AI_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        max_output_tokens: 1800,
        input: prompt
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`⚠️ Apply pack AI failed: ${text.slice(0, 140)}`);
      return basicApplyPackText;
    }

    const data = await response.json();
    const output = escapeForMarkdown(data?.output_text || "");
    if (!output) return basicApplyPackText;

    const requiredHeadings = [
      "## Tailored Cover Letter",
      "## Interview Q&A Prep",
      "## Apply Checklist",
      "## Resume Action Hints"
    ];
    const hasAllHeadings = requiredHeadings.every(heading => output.includes(heading));
    if (!hasAllHeadings) {
      return basicApplyPackText;
    }

    return output;
  } catch (error) {
    console.log(`⚠️ Apply pack AI error: ${error.message}`);
    return basicApplyPackText;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeTailoredResume(job, index) {
  await ensureDir(OUTPUT_DIR);
  const slug = sanitizeFilePart(job.title || `job-${index + 1}`) || `job-${index + 1}`;
  const score = Number.isFinite(Number(job.match_score))
    ? `${Number(job.match_score)}`
    : "na";
  const filename = `tailored-resume-${index + 1}-${slug}-score-${score}.md`;
  const filePath = path.join(OUTPUT_DIR, filename);
  const basicContent = buildBasicTailoredResume(job);
  const content = await buildAiTailoredResume(job, basicContent);
  await fs.writeFile(filePath, content, "utf8");

  const attachments = [
    {
      filename,
      path: filePath,
      contentType: "text/markdown",
      caption: `Tailored resume: ${job.title || "Salesforce role"}`
    }
  ];

  const pdfPath = filePath.replace(/\.md$/i, ".pdf");
  const generatedPdf = await convertMarkdownToPdf(filePath, pdfPath);
  if (generatedPdf) {
    attachments.push({
      filename: filename.replace(/\.md$/i, ".pdf"),
      path: pdfPath,
      contentType: "application/pdf",
      caption: `Tailored resume: ${job.title || "Salesforce role"}`
    });
  }

  return attachments;
}

async function writeApplyPack(job, index) {
  await ensureDir(APPLY_PACK_OUTPUT_DIR);
  const slug = sanitizeFilePart(job.title || `job-${index + 1}`) || `job-${index + 1}`;
  const score = Number.isFinite(Number(job.match_score))
    ? `${Number(job.match_score)}`
    : "na";
  const filename = `apply-pack-${index + 1}-${slug}-score-${score}.md`;
  const filePath = path.join(APPLY_PACK_OUTPUT_DIR, filename);
  const basicContent = buildBasicApplyPack(job);
  const aiContent = await buildAiApplyPack(job, basicContent);
  const header = `# Apply Pack - ${normalize(job.title) || "Salesforce role"} @ ${normalize(job.company) || "N/A"}\n\n`;
  const finalContent = aiContent.startsWith("# ")
    ? aiContent
    : `${header}${aiContent}`;

  await fs.writeFile(filePath, finalContent, "utf8");

  const attachments = [
    {
      filename,
      path: filePath,
      contentType: "text/markdown",
      caption: `Apply pack: ${job.title || "Salesforce role"}`
    }
  ];

  const pdfPath = filePath.replace(/\.md$/i, ".pdf");
  const generatedPdf = await convertMarkdownToPdf(filePath, pdfPath);
  if (generatedPdf) {
    attachments.push({
      filename: filename.replace(/\.md$/i, ".pdf"),
      path: pdfPath,
      contentType: "application/pdf",
      caption: `Apply pack: ${job.title || "Salesforce role"}`
    });
  }

  return attachments;
}

async function getBaseResumeAttachment() {
  if (!isTruthy(process.env.RESUME_ATTACH_BASE_PDF || "true")) {
    return null;
  }

  const configuredPath = normalize(process.env.RESUME_BASE_PDF_PATH);
  const basePath = configuredPath
    ? path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(__dirname, "../../", configuredPath)
    : DEFAULT_BASE_RESUME_PDF;

  try {
    await fs.access(basePath);
    return {
      filename: path.basename(basePath),
      path: basePath,
      contentType: "application/pdf",
      caption: "Base resume PDF"
    };
  } catch {
    return null;
  }
}

async function createApplyBundle(job, index, fileAttachments = []) {
  if (!isTruthy(process.env.APPLY_BUNDLE_ENABLED || "true")) {
    return null;
  }

  const bundleDir = path.resolve(__dirname, "../../.cache/apply-bundles");
  await fs.mkdir(bundleDir, { recursive: true });

  const slug = sanitizeFilePart(job.title || `job-${index + 1}`) || `job-${index + 1}`;
  const score = Number.isFinite(Number(job.match_score))
    ? `${Number(job.match_score)}`
    : "na";
  const filename = `apply-bundle-${index + 1}-${slug}-score-${score}.zip`;
  const bundlePath = path.join(bundleDir, filename);

  const filePaths = (Array.isArray(fileAttachments) ? fileAttachments : [])
    .map(att => String(att.path || "").trim())
    .filter(Boolean);

  if (filePaths.length === 0) {
    return null;
  }

  try {
    await createZipArchive(bundlePath, filePaths);
    return {
      filename,
      path: bundlePath,
      contentType: "application/zip",
      caption: `Apply bundle (resume + apply pack) for ${job.title || "Salesforce role"}`
    };
  } catch (error) {
    console.log(`⚠️ Apply bundle zip failed: ${error.message}`);
    return null;
  }
}

export async function createResumeAttachments(jobs) {
  const list = selectTopResumePackJobs(jobs);
  if (list.length === 0) return [];

  const maxTailoredFiles = Math.max(
    0,
    toFiniteNumber(process.env.RESUME_ATTACHMENT_MAX_FILES, 1)
  );
  const applyPackEnabled = isTruthy(process.env.APPLY_PACK_ENABLED || "true");
  const maxApplyPackFiles = Math.max(
    0,
    toFiniteNumber(
      process.env.APPLY_PACK_MAX_FILES,
      Math.min(3, Math.max(1, maxTailoredFiles))
    )
  );
  const ordered = [...list];

  const attachments = [];
  for (let i = 0; i < ordered.length && i < maxTailoredFiles; i += 1) {
    const result = await writeTailoredResume(ordered[i], i);
    if (Array.isArray(result)) {
      attachments.push(...result);
    } else if (result) {
      attachments.push(result);
    }
  }

  if (applyPackEnabled && maxApplyPackFiles > 0) {
    for (let i = 0; i < ordered.length && i < maxApplyPackFiles; i += 1) {
      if (!shouldUseFullApplyPack(ordered[i])) continue;
      const result = await writeApplyPack(ordered[i], i);
      if (Array.isArray(result)) {
        attachments.push(...result);
      } else if (result) {
        attachments.push(result);
      }

      // also create an email draft for the job
      const draft = await writeApplyEmailDraft(ordered[i], i);
      if (draft) attachments.push(draft);

      // create a bundle zip containing resume/apply pack/email draft for this job
      const bundle = await createApplyBundle(ordered[i], i, [
        ...(Array.isArray(result) ? result : [result]).map(r => ({ path: r.path })),
        draft
      ]);
      if (bundle) attachments.push(bundle);
    }
  }

  const baseResume = await getBaseResumeAttachment();
  if (baseResume) {
    attachments.push(baseResume);
  }

  return attachments;
}

