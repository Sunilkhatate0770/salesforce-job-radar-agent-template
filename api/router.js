import fetch from 'node-fetch';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { User, UserProfile, JobRecord, StudySession, TaskStatus } from '../src/models/models.js';
import { TursoDB } from '../src/db/turso_driver.js';
import {
  filterDashboardFreshness,
  getDashboardFreshnessDays,
  mergeArrayValues,
  mergeDashboardJobs,
  normalizeDashboardJob,
  parseMaybeArray,
  readSupabaseJobAlertRows,
  readSupabaseTrackerJobs
} from '../src/jobs/dashboardJobs.js';
import {
  buildClientConfig,
  buildHealthPayload as buildRadarHealthPayload,
  buildJobsDegradedPayload,
  getRadarStatusStateKey
} from '../src/api/radarContract.js';
import { isSupabaseEnabled, supabase } from '../src/db/supabase.js';
import {
  readReleaseCenterPayload,
  selectPersonalizedReleaseItems
} from '../src/releases/releaseCenter.js';
import {
  buildDashboardSummary,
  buildReleaseStudyActions,
  createMockInterviewSession
} from '../src/services/dashboardSummary.js';
import {
  buildStudyStats,
  buildStudySummaryHistory,
  getDailySummary,
  mergeCompletedTasks,
  mergeStudyHistory,
  normalizeStudyTaskIndex,
  upsertRetentionTopic
} from '../src/services/studyService.js';
import {
  buildHybridProfile,
  buildImportedProfile,
  buildPremiumRoadmap,
  normalizeProfileSavePayload,
  topicConfigName
} from '../src/services/profileService.js';
import {
  buildCodePracticeAttempt,
  buildCodePracticeEvaluationResponse,
  buildCodePracticeFilesText,
  createCustomCodePracticeChallenge,
  filterCodePracticeChallenges,
  getCodePracticeChallenge,
  getDefaultCodePracticeProgress,
  parseCodePracticeAiReview,
  runCodePracticeChecks
} from '../src/services/codePracticeService.js';
import { applyRateLimit } from '../src/api/rateLimit.js';
import { parseJsonBody, sanitizeApiBody } from '../src/api/requestSanitizer.js';
import { apiError, apiSuccess, unauthorizedResponse } from '../src/api/apiResponse.js';
import { getAuthenticatedUserId, verifyGoogleCredential } from '../src/auth/session.js';

/**
 * 🔒 ARCHITECTURAL GUARDIAN: HYBRID HOT-COLD STORAGE PATTERN
 * ---------------------------------------------------------
 * PRIMARY WRITE (HOT): MongoDB Atlas (process.env.MONGODB_URI)
 * ARCHIVAL TIER (COLD): Turso Tier (TursoDB)
 * 
 * RULE: All new data must hit MongoDB first. Data is migrated to Turso
 * automatically via the checkAndArchiveOverflow() engine to maintain 
 * the 512MB MongoDB limit. READS must merge both tiers.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const dataCache = new Map();

let cachedDb = null;
let dbConnectionAttempted = false;
async function connectDB() {
  if (cachedDb) return cachedDb;
  if (!process.env.MONGODB_URI) {
    if (!dbConnectionAttempted) console.warn('[DB] MONGODB_URI missing; MongoDB routes will use fallback data only.');
    dbConnectionAttempted = true;
    return null;
  }
  try {
    dbConnectionAttempted = true;
    const db = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // 5 second timeout
    });
    cachedDb = db;
    console.log('[DB] MongoDB Connected');
    return db;
  } catch (err) {
    console.error('[DB] MongoDB Connection Failed (Skipping):', err.message);
    return null; 
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function buildHealthPayload() {
  return buildRadarHealthPayload({
    env: process.env,
    mongoConnected: isMongoConnected(),
    runtime: process.env.VERCEL ? 'vercel' : 'local'
  });
}

async function buildConnectivityDetails() {
  const details = {
    mongo: { connected: isMongoConnected() },
    turso: { connected: false, checked: false },
    supabase: { connected: false, checked: false }
  };

  if (process.env.TURSO_URL || process.env.TURSO_DATABASE_URL) {
    details.turso.checked = true;
    try {
      await TursoDB.execute('SELECT 1 AS ok');
      details.turso.connected = true;
    } catch (err) {
      details.turso.error = err.message;
    }
  }

  if (isSupabaseEnabled()) {
    details.supabase.checked = true;
    try {
      const { error } = await supabase
        .from(process.env.STATE_BACKEND_TABLE || 'agent_state')
        .select('state_key')
        .limit(1);
      if (error) throw error;
      details.supabase.connected = true;
    } catch (err) {
      details.supabase.error = err.message;
    }
  }

  return details;
}

async function safeTursoRead(label, operation, fallback) {
  try {
    return await operation();
  } catch (err) {
    console.warn(`[Turso] ${label} unavailable; continuing with MongoDB only:`, err.message);
    return fallback;
  }
}

async function safeMongoRead(label, operation, fallback) {
  if (!isMongoConnected()) return fallback;
  try {
    return await operation();
  } catch (err) {
    console.warn(`[Mongo] ${label} unavailable; continuing with fallback data:`, err.message);
    return fallback;
  }
}

async function safeMongoWrite(label, operation) {
  if (!isMongoConnected()) {
    console.warn(`[Mongo] ${label} skipped; MongoDB is not connected.`);
    return false;
  }
  try {
    await operation();
    return true;
  } catch (err) {
    console.warn(`[Mongo] ${label} write unavailable; continuing with fallback storage:`, err.message);
    return false;
  }
}

async function safeTursoWrite(label, operation) {
  try {
    await operation();
    return true;
  } catch (err) {
    console.warn(`[Turso] ${label} write unavailable; continuing with other storage:`, err.message);
    return false;
  }
}

async function loadHybridProfile(userId, label = 'profile') {
  const [tursoProfile, mongoProfile] = await Promise.all([
    safeTursoRead(`${label} turso profile`, () => TursoDB.getProfile(userId), null),
    safeMongoRead(`${label} mongo profile`, () => UserProfile.findOne({ userId }).lean(), null)
  ]);

  const hybrid = buildHybridProfile({ tursoProfile, mongoProfile });
  return { ...hybrid, tursoProfile, mongoProfile };
}

function mongoJobQuery(userId) {
  return { $or: [{ userId }, { userId: 'system' }] };
}

function readBody(req) {
  return parseJsonBody(req.body);
}

function normalizeBoardStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'new') return 'todo';
  if (normalized === 'shortlisted' || normalized === 'follow_up') return 'todo';
  if (normalized === 'ignored') return 'rejected';
  if (['todo', 'applied', 'interview', 'offer', 'rejected'].includes(normalized)) return normalized;
  return 'todo';
}

function encodeStatusKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function jobStatusCandidates(job = {}) {
  return [job.job_hash, job.jobHash, job.id, job._id]
    .map(value => value === undefined || value === null ? '' : String(value))
    .filter(Boolean);
}

async function getJobStatusOverrides(userId) {
  if (!userId) return {};
  let supabaseStatuses = {};
  try {
    const payload = await readJobStatusState(userId);
    supabaseStatuses = payload?.statuses || payload || {};
  } catch (err) {
    console.warn('[STATUS] Supabase status read skipped:', err.message);
  }

  let mongoStatuses = {};
  if (mongoose.connection.readyState === 1) {
    const profile = await UserProfile.findOne({ userId }).select('jobRadarStatuses').lean();
    mongoStatuses = profile?.jobRadarStatuses || {};
  }

  return {
    ...supabaseStatuses,
    ...mongoStatuses
  };
}

function getStateTableName() {
  return String(process.env.STATE_BACKEND_TABLE || 'agent_state').trim() || 'agent_state';
}

async function readJobStatusState(userId) {
  if (!isSupabaseEnabled()) return null;
  const { data, error } = await supabase
    .from(getStateTableName())
    .select('payload')
    .eq('state_key', getRadarStatusStateKey(userId))
    .maybeSingle();
  if (error) throw error;
  return data?.payload || null;
}

async function writeJobStatusState(userId, payload) {
  if (!isSupabaseEnabled()) return false;
  const { error } = await supabase
    .from(getStateTableName())
    .upsert(
      {
        state_key: getRadarStatusStateKey(userId),
        payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'state_key' }
    );
  if (error) throw error;
  return true;
}

async function saveJobStatusOverride(userId, statusKey, statusPayload) {
  let wroteMongo = false;
  let wroteState = false;

  if (mongoose.connection.readyState === 1) {
    await UserProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          [`jobRadarStatuses.${statusKey}`]: statusPayload
        }
      },
      { upsert: true, new: true }
    );
    wroteMongo = true;
  }

  try {
    const payload = await readJobStatusState(userId);
    const statuses = payload?.statuses && typeof payload.statuses === 'object'
      ? payload.statuses
      : {};
    statuses[statusKey] = statusPayload;
    wroteState = await writeJobStatusState(userId, {
      statuses,
      updatedAt: statusPayload.updatedAt,
      source: 'vercel-api'
    });
  } catch (err) {
    console.warn('[STATUS] Supabase status write skipped:', err.message);
  }

  return {
    wroteMongo,
    wroteState,
    stored: wroteMongo || wroteState
  };
}

function findJobStatusOverride(overrides = {}, job = {}) {
  for (const candidate of jobStatusCandidates(job)) {
    const encoded = encodeStatusKey(candidate);
    if (encoded && overrides[encoded]) return overrides[encoded];
    if (overrides[candidate]) return overrides[candidate];
  }
  return null;
}

function applyJobStatusOverrides(jobs = [], overrides = {}) {
  return jobs.map(job => {
    const override = findJobStatusOverride(overrides, job);
    if (!override) return job;
    const status = normalizeBoardStatus(override.status);
    return {
      ...job,
      status,
      board_status: status,
      statusUpdatedAt: override.updatedAt || override.statusUpdatedAt || job.statusUpdatedAt,
      appliedAt: override.appliedAt || job.appliedAt
    };
  });
}

function readDataJson(fileName, fallback = {}) {
  if (dataCache.has(fileName)) return dataCache.get(fileName);
  try {
    const fullPath = path.join(DATA_DIR, fileName);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    dataCache.set(fileName, parsed);
    return parsed;
  } catch (err) {
    console.warn(`[DATA] Failed to read ${fileName}:`, err.message);
    return fallback;
  }
}

function normalizeJobForPrompt(job = {}) {
  return {
    title: job.title || job.role || 'Salesforce role',
    company: job.company || 'the company',
    location: job.location || job.loc || '',
    matchedSkills: Array.isArray(job.matched_skills) ? job.matched_skills : [],
    missingSkills: Array.isArray(job.missing_skills) ? job.missing_skills : [],
    url: job.apply_link || job.url || ''
  };
}

function getCodePracticeCatalog() {
  return readDataJson('code-practice-challenges.json', { challenges: [] });
}

function fallbackAiText(kind, payload = {}) {
  const userName = payload.userName || payload.candidateName || 'there';
  if (kind === 'code-review') {
    return JSON.stringify({
      score: payload.score || 0,
      correctnessPercent: payload.correctnessPercent || payload.score || 0,
      passedChecks: payload.passedChecks || [],
      failedChecks: payload.failedChecks || [],
      improvements: payload.improvements || ['Review the failed checks and add a concrete test case.'],
      interviewFeedback: payload.interviewFeedback || 'Explain the approach, tradeoffs, and how you would validate this in a Salesforce org.',
      nextPracticeTopics: payload.nextPracticeTopics || ['Apex testing', 'Bulkification', 'Security']
    });
  }
  if (kind === 'email') {
    const job = payload.job || {};
    const company = job.company || payload.company || 'the team';
    const role = job.title || job.role || payload.role || 'Salesforce Developer';
    if (payload.emailType === 'withdraw') {
      return `Subject: Withdrawing my application for ${role}\n\nHi ${company} team,\n\nThank you for considering me for the ${role} opportunity. After careful thought, I would like to withdraw my application at this time.\n\nI appreciate the time and consideration, and I hope we can stay connected for future Salesforce opportunities that may be a stronger fit.\n\nBest regards,\n${userName}`;
    }
    return `Subject: Thank you for the ${role} conversation\n\nHi ${company} team,\n\nThank you for taking the time to speak with me about the ${role} opportunity. I enjoyed learning more about the team, the Salesforce roadmap, and the problems you are solving.\n\nOur conversation strengthened my interest in contributing through Apex, LWC, integrations, and scalable Salesforce delivery. I appreciate your time and look forward to the next steps.\n\nBest regards,\n${userName}`;
  }
  if (kind === 'cover-letter') {
    const job = normalizeJobForPrompt(payload.job);
    const skills = job.matchedSkills.length ? job.matchedSkills.join(', ') : 'Apex, LWC, integrations, and Salesforce delivery';
    return `I am excited to apply for the ${job.title} role at ${job.company}. My Salesforce experience aligns strongly with the needs of this position, especially around ${skills}.\n\nI focus on building reliable, maintainable solutions that balance business outcomes with technical quality. I can contribute across Apex, Lightning Web Components, integrations, data quality, and production support while communicating clearly with business and engineering teams.\n\nI would welcome the opportunity to discuss how my Salesforce background can help ${job.company} deliver high-impact platform work.`;
  }
  if (kind === 'qa') {
    return JSON.stringify([
      {
        question: `What are the most important implementation risks for ${payload.topicName || 'this Salesforce topic'}?`,
        answer: 'Focus on governor limits, security enforcement, bulk-safe design, testing strategy, and operational monitoring. A strong answer explains the tradeoffs and how you would validate the solution in a real org.'
      },
      {
        question: `How would you explain ${payload.topicName || 'this concept'} to a business stakeholder?`,
        answer: 'Start with the business outcome, then describe the Salesforce mechanism in plain language. Avoid platform jargon unless the stakeholder needs it for a decision.'
      }
    ]);
  }
  const topic = payload.topic || payload.skill || 'Salesforce';
  return `Good answer. For a stronger interview response, connect your point to a real implementation decision, mention limits or security implications, and close with how you would test it. Next question: how would you design a scalable ${topic} solution when requirements change late in delivery?`;
}

async function generateAiText(kind, payload = {}) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) return fallbackAiText(kind, payload);

  const prompts = {
    interview: `You are a senior Salesforce technical interviewer. Topic: ${payload.topic || 'Salesforce'}. Difficulty: ${payload.difficulty || 'Senior'}. Give brief feedback on the candidate answer and ask one follow-up question.\n\nCandidate answer:\n${payload.answer || payload.prompt || ''}`,
    coach: `You are a Salesforce interview coach. Job/company context: ${JSON.stringify(payload.job || {})}. Reply to the candidate and ask one useful follow-up question.\n\nCandidate message:\n${payload.message || payload.prompt || ''}`,
    email: `Write a concise professional ${payload.emailType || 'thank you'} email for a Salesforce job process. Candidate: ${payload.userName || 'Candidate'}. Job/company: ${JSON.stringify(payload.job || {})}. Return subject and body.`,
    'cover-letter': `Write a short, professional 3-paragraph cover letter body for this Salesforce role. Candidate: ${payload.userName || 'Candidate'}. Job: ${JSON.stringify(normalizeJobForPrompt(payload.job || {}))}.`,
    qa: `Generate 5 Salesforce interview Q&A items for topic "${payload.topicName || payload.topic || 'Salesforce'}". Return valid JSON array only with question and answer fields.`,
    skill: `Create a concise 3-day Salesforce interview study plan for "${payload.skill || payload.topic || 'Salesforce'}". Use practical bullets.`,
    'code-review': `Review this Salesforce coding practice attempt. Return valid JSON only with keys score, correctnessPercent, passedChecks, failedChecks, improvements, interviewFeedback, nextPracticeTopics. Deterministic score is ${payload.score}. Challenge: ${payload.challengeTitle}. Instructions: ${payload.instructions}. Rubric: ${payload.aiRubric}. Files: ${payload.filesText}`
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You are a precise Salesforce career and interview assistant. Keep responses useful, specific, and concise.' },
          { role: 'user', content: prompts[kind] || prompts.interview }
        ],
        temperature: 0.35
      })
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || fallbackAiText(kind, payload);
  } catch (err) {
    console.warn('[AI] Falling back to deterministic response:', err.message);
    return fallbackAiText(kind, payload);
  }
}

async function triggerCloudJobScan(userId) {
  const repo = process.env.GITHUB_REPOSITORY || process.env.JOB_RADAR_GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.JOB_RADAR_GITHUB_TOKEN;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || 'salesforce-job-radar-agent.yml';
  const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_BRANCH || 'main';

  if (!repo || !token) {
    return {
      queued: false,
      mode: 'cached',
      message: 'Cloud scan credentials are not configured; showing latest cached MongoDB/Turso jobs.'
    };
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'salesforce-job-radar-agent'
    },
    body: JSON.stringify({ ref })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub dispatch failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return {
    queued: true,
    mode: 'github-actions',
    message: 'Cloud job radar workflow queued successfully.'
  };
}

async function checkAndArchiveOverflow(userId) {
  if (!isMongoConnected()) return;
  try {
    // 1. ARCHIVE JOBS
    const MAX_MONGO_JOBS = 1500;
    const jobCount = await JobRecord.countDocuments({ userId });
    if (jobCount > MAX_MONGO_JOBS) {
      console.log(`[Vacuum] Jobs limit reached (${jobCount}/1500). Archiving 500...`);
      const toMove = await JobRecord.find({ userId, status: 'ignored' }).sort({ createdAt: 1 }).limit(500).lean();
      if (toMove.length > 0) {
        for (const job of toMove) {
          await safeTursoRead('archive job', () => TursoDB.saveJob(userId, job), null);
        }
        await JobRecord.deleteMany({ _id: { $in: toMove.map(j => j._id) } });
      }
    }

    // 2. ARCHIVE STUDY SESSIONS
    const MAX_MONGO_SESSIONS = 500;
    const sessionCount = await StudySession.countDocuments({ userId });
    if (sessionCount > MAX_MONGO_SESSIONS) {
      console.log(`[Vacuum] Sessions limit reached (${sessionCount}/500). Archiving 200...`);
      const sessionsToMove = await StudySession.find({ userId }).sort({ startTime: 1 }).limit(200).lean();
      if (sessionsToMove.length > 0) {
        for (const s of sessionsToMove) {
          await safeTursoRead('archive study session', () => TursoDB.saveStudySession(userId, s), null);
        }
        await StudySession.deleteMany({ _id: { $in: sessionsToMove.map(s => s._id) } });
      }
    }
  } catch (e) {
    console.error('[Vacuum] Error during automatic archival:', e.message);
  }
}

export default async function(req, res) {
  // CORS preflight handling for cross-origin requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  try {
    let { slug } = req.query;
    let path = '';
    if (slug && Array.isArray(slug)) { path = slug.join('/'); } 
    else { path = (req.url || '').replace('/api/', '').split('?')[0]; }

    if (!applyRateLimit(req, res, path)) return;

    // Soft Connect to Legacy DB
    await connectDB();

    // GLOBAL BODY PARSER + SANITIZER
    if ((req.method === 'POST' || req.method === 'PATCH') && req.body) {
      req.body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? parseJsonBody(req.body)
        : sanitizeApiBody(req.body);
    }

    // 1. AUTH ENDPOINTS
    if (path === 'auth/google' && req.method === 'POST') {
      try {
        const { token } = readBody(req);
        const { user } = await verifyGoogleCredential(token);
        const userData = { id: user.id, googleId: user.googleId, email: user.email, name: user.name, picture: user.picture };

        try {
          if (mongoose.connection.readyState !== 1) throw new Error('MongoDB not connected');
          await User.findOneAndUpdate(
            { googleId: userData.id },
            {
              googleId: userData.id,
              email: userData.email,
              name: userData.name,
              picture: userData.picture,
              lastLogin: new Date()
            },
            { upsert: true, new: true }
          );
        } catch (mongoErr) {
          console.error('[AUTH] Mongo user sync failed but continuing:', mongoErr.message);
        }
        
        // Save to NEW Turso Tier (Safe attempt)
        try {
          await TursoDB.saveUser(userData);
          console.log(`[AUTH] User ${userData.id} synced to Turso tier.`);
        } catch (dbErr) {
          console.error('[AUTH] Turso sync failed but continuing:', dbErr.message);
        }
        
        return res.status(200).json(apiSuccess({ user: userData }));
      } catch (authErr) {
        console.error('[AUTH] Google Verify Failed:', authErr.message);
        return res.status(401).json(apiError('Authentication failed. Check GOOGLE_CLIENT_ID.', {
          status: 401,
          code: 'auth_failed'
        }));
      }
    }

    if (path === 'code-practice/challenges' && req.method === 'GET') {
      const requestUrl = new URL(req.url || '', 'http://localhost');
      return res.status(200).json({
        success: true,
        ...filterCodePracticeChallenges(getCodePracticeCatalog(), requestUrl.searchParams)
      });
    }

    if (path === 'health' && req.method === 'GET') {
      return res.status(200).json({
        ...buildHealthPayload(),
        connectivity: await buildConnectivityDetails()
      });
    }

    if (path === 'client-config' && req.method === 'GET') {
      return res.status(200).json(buildClientConfig(process.env));
    }

    // --- REQUIRE AUTH FOR DATA ROUTES ---
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json(unauthorizedResponse());

    const jobStatusRoute = path.match(/^jobs\/([^/]+)\/status$/);
    if (jobStatusRoute && req.method === 'PATCH') {
      const payload = readBody(req);
      const routeId = decodeURIComponent(jobStatusRoute[1] || '');
      const rawKey = payload.job_hash || payload.jobHash || payload.jobId || routeId;
      if (!rawKey) return res.status(400).json({ success: false, error: 'Missing job identifier' });

      const status = normalizeBoardStatus(payload.status);
      const updatedAt = payload.updatedAt || new Date().toISOString();
      const appliedAt = status === 'applied'
        ? (payload.appliedAt || updatedAt)
        : (payload.appliedAt || '');
      const statusKey = encodeStatusKey(rawKey);

      const storage = await saveJobStatusOverride(userId, statusKey, {
        status,
        updatedAt,
        appliedAt,
        rawKey: String(rawKey),
        jobId: routeId
      });
      if (!storage.stored) {
        return res.status(503).json({
          success: false,
          error: 'Job status sync is temporarily unavailable. Configure MongoDB or Supabase state storage for cloud status updates.'
        });
      }

      return res.status(200).json({ success: true, status, updatedAt, appliedAt, key: statusKey, storage });
    }

    // 2. PROFILE ENDPOINTS (Hybrid Search & Smart Merge)
    if (path === 'profile/data') {
      const { profile, tursoProfile, mongoProfile, source } = await loadHybridProfile(userId, 'profile/data');
      
      console.log(`[DEBUG] Hybrid Fetch for ${userId}:`);
      console.log(` - Turso Profile: ${tursoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${tursoProfile?.bookmarks?.length || 0})`);
      console.log(` - Mongo Profile: ${mongoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${mongoProfile?.bookmarks?.length || 0})`);

      console.log(`[PROFILE] Fetch for ${userId} -> Source: ${source}, Found: ${!!profile}`);
      return res.status(200).json({ exists: !!profile, profile, storageSource: source });
    }

    if (path === 'profile/save-retention' && req.method === 'POST') {
      const { topicId, stats } = readBody(req);
      if (!topicId || !stats) {
        return res.status(400).json({ success: false, error: 'topicId and stats are required' });
      }

      const { profile } = await loadHybridProfile(userId, 'profile/save-retention');
      const { topics } = upsertRetentionTopic(profile?.studyPlanTopics, topicId, stats, topicConfigName);

      const nextProfile = { ...(profile || {}), userId, studyPlanTopics: topics, updatedAt: new Date() };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/save-retention', () => UserProfile.findOneAndUpdate(
          { userId },
          { userId, studyPlanTopics: topics, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('profile/save-retention', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, studyPlanTopics: topics, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/save' && req.method === 'POST') {
      console.log(`[PROFILE] Saving data to Primary Mongo for ${userId}`);
      const body = readBody(req);
      const { profile: existingProfile } = await loadHybridProfile(userId, 'profile/save-existing');
      const { profile: normalizedProfile } = normalizeProfileSavePayload({
        body,
        existingProfile,
        userId,
        readDataJson
      });
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/save', () => UserProfile.findOneAndUpdate(
          { userId },
          normalizedProfile,
          { upsert: true, new: true }
        )),
        safeTursoWrite('profile/save', () => TursoDB.saveProfile(userId, normalizedProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, profile: normalizedProfile, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/import' && req.method === 'POST') {
      const body = readBody(req);
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'profile/import');
      const imported = buildImportedProfile({
        body,
        existingProfile: loadedProfile,
        userId,
        readDataJson
      });
      if (imported.error) {
        return res.status(400).json({ success: false, error: imported.error });
      }
      const { profile: nextProfile, extracted, intelligence } = imported;

      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/import', () => UserProfile.findOneAndUpdate({ userId }, nextProfile, { upsert: true, new: true })),
        safeTursoWrite('profile/import', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, extractedData: extracted, intelligence, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'roadmap') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'roadmap');
      const profile = loadedProfile || {};
      const intelligence = buildPremiumRoadmap(profile, readDataJson);
      return res.status(200).json({ success: true, ...intelligence });
    }

    if (path === 'dashboard/summary' && req.method === 'GET') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'dashboard/summary');
      const profile = loadedProfile || { userId };
      const [tursoJobs, mongoJobs, studySessions, fallbackReleases] = await Promise.all([
        safeTursoRead('dashboard/summary jobs', () => TursoDB.getJobs(userId, 160), []),
        safeMongoRead('dashboard/summary jobs', () => JobRecord.find(mongoJobQuery(userId)).sort({ updatedAt: -1, createdAt: -1 }).limit(220).lean(), []),
        safeMongoRead('dashboard/summary study', () => StudySession.find({ userId }).sort({ startTime: -1 }).limit(120).lean(), []),
        Promise.resolve(readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] }))
      ]);
      const allReleases = await readReleaseCenterPayload(fallbackReleases);
      const summary = buildDashboardSummary({
        profile,
        jobs: mergeDashboardJobs(tursoJobs, mongoJobs),
        studySessions,
        releases: allReleases,
        activityLog: []
      });
      return res.status(200).json(summary);
    }

    // ALIAS for releases/current used by UI
    if (path === 'releases/latest' || path === 'releases/current') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'releases/current');
      const profile = loadedProfile || {};
      const intelligence = buildPremiumRoadmap(profile, readDataJson);
      const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
      const allReleases = await readReleaseCenterPayload(fallbackReleases);
      return res.status(200).json({
        success: true,
        sourceMode: allReleases.sourceMode || 'bundled-fallback',
        generatedAt: allReleases.generatedAt || null,
        activeRelease: allReleases.activeRelease || {},
        items: allReleases.items || [],
        personalizedItems: selectPersonalizedReleaseItems(allReleases.items || [], intelligence),
        experienceYears: intelligence.experienceYears,
        designation: intelligence.designation
      });
    }

    if (path === 'releases/study-actions' && req.method === 'GET') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'releases/study-actions');
      const intelligence = buildPremiumRoadmap(loadedProfile || {}, readDataJson);
      const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
      const allReleases = await readReleaseCenterPayload(fallbackReleases);
      const payload = {
        ...allReleases,
        personalizedItems: selectPersonalizedReleaseItems(allReleases.items || [], intelligence)
      };
      const studyActions = buildReleaseStudyActions(payload);
      await Promise.all([
        safeMongoWrite('releases/study-actions', () => UserProfile.findOneAndUpdate(
          { userId },
          { userId, releaseStudyActions: studyActions, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('releases/study-actions', async () => {
          const { profile } = await loadHybridProfile(userId, 'releases/study-actions-write');
          return TursoDB.saveProfile(userId, { ...(profile || {}), userId, releaseStudyActions: studyActions, updatedAt: new Date() });
        })
      ]);
      return res.status(200).json({ success: true, generatedAt: new Date().toISOString(), studyActions });
    }

    if (path === 'mock-interview/session' && req.method === 'GET') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'mock-interview/session');
      const sessions = Array.isArray(loadedProfile?.mockInterviewSessions) ? loadedProfile.mockInterviewSessions : [];
      return res.status(200).json({ success: true, sessions: sessions.slice(0, 50) });
    }

    if (path === 'mock-interview/session' && req.method === 'POST') {
      const body = readBody(req);
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'mock-interview/session');
      const profile = loadedProfile || {};
      const session = createMockInterviewSession(body, userId);
      const mockInterviewSessions = [session, ...(profile.mockInterviewSessions || [])].slice(0, 50);
      const nextProfile = { ...profile, userId, mockInterviewSessions, updatedAt: new Date() };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('mock-interview/session', () => UserProfile.findOneAndUpdate(
          { userId },
          { userId, mockInterviewSessions, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('mock-interview/session', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, session, sessions: mockInterviewSessions, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'code-practice/evaluate' && req.method === 'POST') {
      const body = readBody(req);
      const challenge = getCodePracticeChallenge(getCodePracticeCatalog(), body.challengeId);
      if (!challenge) return res.status(404).json({ success: false, error: 'Challenge not found' });
      const deterministic = runCodePracticeChecks(challenge, body.files || {}, body.runResult || {});
      const filesText = buildCodePracticeFilesText(body.files || {});
      const aiRaw = await generateAiText('code-review', {
        ...deterministic,
        challengeTitle: challenge.title,
        instructions: challenge.instructions,
        aiRubric: challenge.aiRubric,
        filesText
      });
      const aiReview = parseCodePracticeAiReview(aiRaw, deterministic);
      return res.status(200).json(buildCodePracticeEvaluationResponse({ challenge, body, deterministic, aiReview }));
    }

    if (path === 'code-practice/progress' && req.method === 'GET') {
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'code-practice/progress');
      const profile = loadedProfile || {};
      const codingPractice = profile.codingPractice || getDefaultCodePracticeProgress();
      return res.status(200).json({ success: true, codingPractice });
    }

    if (path === 'code-practice/attempt' && req.method === 'POST') {
      const body = readBody(req);
      const challenge = getCodePracticeChallenge(getCodePracticeCatalog(), body.challengeId) ||
        createCustomCodePracticeChallenge(body);
      if (!challenge) return res.status(404).json({ success: false, error: 'Challenge not found' });
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'code-practice/attempt');
      const profile = loadedProfile || {};
      const current = profile.codingPractice || {};
      const { codingPractice } = buildCodePracticeAttempt({ body, challenge, current });
      const nextProfile = { ...profile, userId, codingPractice, updatedAt: new Date() };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('code-practice/attempt', () => UserProfile.findOneAndUpdate(
          { userId },
          { userId, codingPractice, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('code-practice/attempt', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, codingPractice, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/sync-cloud' && req.method === 'POST') {
      console.log(`[PROFILE] Sync Cloud called for ${userId}`);
      const body = readBody(req);
      const platformName = (body.platform || '').toLowerCase().includes('naukri') ? 'naukri' : 'linkedin';
      
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'profile/sync-cloud');
      const profile = loadedProfile || {};
      const platforms = profile.platforms || {};
      platforms[platformName] = { synced: true, lastSync: new Date() };

      // Simulate parsing of Certifications from LinkedIn/Naukri
      let certs = profile.certifications || [];
      if (certs.length === 0) {
        certs = [
          'Salesforce Certified Platform Developer I',
          'Salesforce Certified Administrator',
          'Salesforce Certified Platform App Builder'
        ];
      }

      const nextProfile = {
        ...profile,
        userId,
        platforms,
        skills: profile.skills || ['Apex', 'LWC', 'SOQL', 'Integration', 'Flows', 'Async Apex', 'REST APIs'],
        certifications: certs,
        experienceYears: profile.experienceYears || 3.5,
        updatedAt: new Date()
      };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/sync-cloud', () => UserProfile.findOneAndUpdate(
          { userId },
          nextProfile,
          { upsert: true, new: true }
        )),
        safeTursoWrite('profile/sync-cloud', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      
      return res.status(200).json({ success: true, message: 'Cloud sync successful', storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/parse-resume' && req.method === 'POST') {
      console.log(`[PROFILE] Parsing Resume for ${userId}`);
      // In a full production system, we would use pdf-parse here.
      // For this industrial template, we simulate the AI extraction.
      
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'profile/parse-resume');
      const profile = loadedProfile || {};
      
      // Merge new extracted skills with existing
      const currentSkills = new Set(profile.skills || []);
      ['Salesforce CPQ', 'Lightning Web Components', 'REST/SOAP API', 'Data Cloud', 'Copado', 'Service Cloud'].forEach(s => currentSkills.add(s));
      
      const extractedData = {
        skills: Array.from(currentSkills),
        experienceYears: 4.5,
        currentRole: 'Senior Salesforce Developer'
      };

      const nextProfile = { ...profile, ...extractedData, userId, updatedAt: new Date() };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/parse-resume', () => UserProfile.findOneAndUpdate(
          { userId },
          { ...extractedData, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('profile/parse-resume', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      
      return res.status(200).json({ success: true, extractedData, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/toggle-bookmark' && req.method === 'POST') {
      console.log(`[BOOKMARK] Toggling in hybrid stores for ${userId}`);
      const { profile: loadedProfile } = await loadHybridProfile(userId, 'profile/toggle-bookmark');
      const profile = loadedProfile || {};
      let bookmarks = profile?.bookmarks || [];
      const bookmark = readBody(req);
      
      const exists = bookmarks.some(b => b.q === bookmark.q);
      if (exists) {
        bookmarks = bookmarks.filter(b => b.q !== bookmark.q);
      } else {
        bookmarks.push({ ...bookmark, date: new Date() });
      }

      const nextProfile = { ...profile, userId, bookmarks, updatedAt: new Date() };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('profile/toggle-bookmark', () => UserProfile.findOneAndUpdate({ userId }, { bookmarks, updatedAt: new Date() }, { upsert: true })),
        safeTursoWrite('profile/toggle-bookmark', () => TursoDB.saveProfile(userId, nextProfile))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No profile storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, bookmarks, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'profile/match') {
      const { profile } = await loadHybridProfile(userId, 'profile/match');

      // Get Jobs from both tiers
      const [tursoJobs, mongoJobs, trackerJobs, alertJobs] = await Promise.all([
        safeTursoRead('profile/match jobs', () => TursoDB.getJobAnalytics(userId), []),
        safeMongoRead('profile/match jobs', () => JobRecord.find(mongoJobQuery(userId)).lean(), []),
        readSupabaseTrackerJobs(),
        readSupabaseJobAlertRows(180)
      ]);
      const allJobs = mergeDashboardJobs(tursoJobs, mongoJobs, trackerJobs, alertJobs);

      console.log(`[MATCH] Analyzing ${allJobs.length} total jobs for ${userId}`);
      const filtered = allJobs.filter(j => (j.match_score || 0) >= 60);
      
      const topMatchedSkills = {};
      const topMissingSkills = {};
      filtered.forEach(j => {
        const matched = typeof j.matched_skills === 'string' ? JSON.parse(j.matched_skills || '[]') : (j.matched_skills || []);
        const missing = typeof j.missing_skills === 'string' ? JSON.parse(j.missing_skills || '[]') : (j.missing_skills || []);
        matched.forEach(s => topMatchedSkills[s] = (topMatchedSkills[s] || 0) + 1);
        missing.forEach(s => topMissingSkills[s] = (topMissingSkills[s] || 0) + 1);
      });
      const sortSkills = (obj) => Object.entries(obj).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([k,v]) => ({ _id: k, count: v }));
      return res.status(200).json({ 
        exists: !!profile, 
        profile, 
        matched_skills: sortSkills(topMatchedSkills), 
        missing_skills: sortSkills(topMissingSkills),
        storageSource: 'Unified Hybrid'
      });
    }

    // 3. JOBS ENDPOINTS
    if (path === 'jobs') {
      const [tursoJobs, mongoJobs, trackerJobs, alertJobs] = await Promise.all([
        safeTursoRead('jobs', () => TursoDB.getJobs(userId, 160), []),
        safeMongoRead(
          'jobs',
          () => JobRecord.find(mongoJobQuery(userId)).sort({ updatedAt: -1, createdAt: -1 }).limit(220).lean(),
          []
        ),
        readSupabaseTrackerJobs(),
        readSupabaseJobAlertRows(180)
      ]);
      const statusOverrides = await getJobStatusOverrides(userId);
      const mergedJobs = mergeDashboardJobs(
        mongoJobs.map(job => normalizeDashboardJob(job, 'Legacy (Mongo)')),
        tursoJobs.map(job => normalizeDashboardJob(job, 'Primary (Turso)')),
        trackerJobs,
        alertJobs
      );
      const finalJobs = filterDashboardFreshness(
        applyJobStatusOverrides(mergedJobs, statusOverrides)
      ).slice(0, 180);

      console.log(`[JOBS] Unified Fetch -> Supabase alerts: ${alertJobs.length}, Tracker: ${trackerJobs.length}, Turso: ${tursoJobs.length}, Mongo: ${mongoJobs.length}, Total: ${finalJobs.length}`);

      checkAndArchiveOverflow(userId);
      const mongoCount = await safeMongoRead('jobs count', () => JobRecord.countDocuments({ userId }), 0);
      const capacityUsed = Math.min(Math.round((mongoCount / 1500) * 100), 100);
      const sourceCounts = {
        supabaseAlerts: alertJobs.length,
        applicationTracker: trackerJobs.length,
        turso: tursoJobs.length,
        mongo: mongoJobs.length
      };
      const degraded = buildJobsDegradedPayload({
        env: process.env,
        mongoConnected: isMongoConnected(),
        sourceCounts
      });
      return res.status(200).json({
        records: finalJobs,
        dbStatus: isMongoConnected(),
        count: finalJobs.length,
        freshnessDays: getDashboardFreshnessDays(),
        sourceCounts,
        degraded,
        storageCapacity: isMongoConnected()
          ? `${100 - capacityUsed}% Free`
          : (degraded.liveSources.length ? 'Archive Reads Active' : 'MongoDB Offline')
      });
    }

    if (path === 'jobs/scan' && req.method === 'POST') {
      let result;
      try {
        result = await triggerCloudJobScan(userId);
      } catch (scanErr) {
        console.error('[SCAN] Cloud trigger failed; falling back to cached mode:', scanErr.message);
        result = {
          queued: false,
          mode: 'cached',
          message: 'Cloud scan trigger failed; showing latest cached jobs while the agent configuration is checked.'
        };
      }
      return res.status(200).json({
        success: true,
        ...result
      });
    }

    if (path === 'jobs/analytics') {
      const [tursoJobs, mongoJobs, trackerJobs, alertJobs] = await Promise.all([
        safeTursoRead('jobs/analytics', () => TursoDB.getJobAnalytics(userId), []),
        safeMongoRead('jobs/analytics', () => JobRecord.find(mongoJobQuery(userId)).lean(), []),
        readSupabaseTrackerJobs(),
        readSupabaseJobAlertRows(180)
      ]);
      const combined = applyJobStatusOverrides(
        mergeDashboardJobs([...tursoJobs, ...mongoJobs, ...trackerJobs, ...alertJobs]),
        await getJobStatusOverrides(userId)
      );
      console.log(`[ANALYTICS] Hybrid Merging ${combined.length} records for ${userId}`);

      // Aggregate matched skills, missing skills, and top companies
      const matchedMap = {};
      const missingMap = {};
      const companyMap = {};

      combined.forEach(j => {
        const matched = mergeArrayValues(j.skills, j.matched_skills);
        const missing = parseMaybeArray(j.missing_skills);
        const company = j.company || 'Unknown';
        
        matched.forEach(s => { if (s) matchedMap[s] = (matchedMap[s] || 0) + 1; });
        missing.forEach(s => { if (s) missingMap[s] = (missingMap[s] || 0) + 1; });
        if (company) companyMap[company] = (companyMap[company] || 0) + 1;
      });

      const sortEntries = (obj) => Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, v]) => ({ _id: k, count: v }));

      return res.status(200).json({
        totalJobs: combined.length,
        topMatched: sortEntries(matchedMap),
        topMissing: sortEntries(missingMap),
        topCompanies: sortEntries(companyMap),
        matched_skills: sortEntries(matchedMap),
        missing_skills: sortEntries(missingMap),
        top_companies: sortEntries(companyMap),
        jobs: combined // UI EXPECTS THIS IN jobs/list
      });
    }

    if (path === 'jobs/list') {
      const [mongoJobs, tursoJobs, trackerJobs, alertJobs] = await Promise.all([
        safeMongoRead(
          'jobs/list',
          () => JobRecord.find(mongoJobQuery(userId)).sort({ date_added: -1, createdAt: -1 }).limit(220).lean(),
          []
        ),
        safeTursoRead('jobs/list', () => TursoDB.getJobAnalytics(userId), []),
        readSupabaseTrackerJobs(),
        readSupabaseJobAlertRows(180)
      ]);
      const jobs = filterDashboardFreshness(
        applyJobStatusOverrides(
          mergeDashboardJobs(mongoJobs, tursoJobs, trackerJobs, alertJobs),
          await getJobStatusOverrides(userId)
        )
      );
      return res.status(200).json({ success: true, jobs });
    }

    // 4. STUDY ENDPOINTS
    if (path === 'study/history') {
      const tursoSessions = await safeTursoRead('study/history', () => TursoDB.getStudyHistory(userId), []);
      const mongoSessions = await safeMongoRead(
        'study/history',
        () => StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean(),
        []
      );
      const combined = mergeStudyHistory(tursoSessions, mongoSessions, 100);
      console.log(`[STUDY] History Fetch -> Turso: ${tursoSessions.length}, Mongo: ${mongoSessions.length}`);
      return res.status(200).json(combined);
    }

    if (path === 'study/session' && req.method === 'POST') {
      console.log(`[STUDY] Saving session to hybrid stores for ${userId}`);
      const sessionPayload = { ...readBody(req), userId };
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('study/session', async () => {
          const session = new StudySession(sessionPayload);
          await session.save();
        }),
        safeTursoWrite('study/session', () => TursoDB.saveStudySession(userId, sessionPayload))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No study storage backend is currently writable.' });
      }
      return res.status(200).json({ success: true, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'study/stats') {
      const [tursoSessions, mongoSessions] = await Promise.all([
        safeTursoRead('study/stats turso', () => TursoDB.getFullHistory(userId), []),
        safeMongoRead('study/stats mongo', () => StudySession.find({ userId }).lean(), [])
      ]);
      return res.status(200).json(buildStudyStats([...tursoSessions, ...mongoSessions]));
    }

    if (path === 'study/tasks') {
      const tursoProfile = await safeTursoRead('study/tasks profile', () => TursoDB.getProfile(userId), null);
      const mongoTasks = await safeMongoRead('study/tasks mongo', () => TaskStatus.find({ userId, completed: true }).lean(), []);
      const combinedTasks = mergeCompletedTasks({ tursoProfile, mongoTasks });
      console.log(`[TASKS] Hybrid Loading: ${combinedTasks.length} total completed tasks`);
      return res.status(200).json({ completedTasks: combinedTasks });
    }

    if (path === 'study/toggle-task' && req.method === 'POST') {
      const body = readBody(req);
      const taskIndex = normalizeStudyTaskIndex(body);
      if (taskIndex === null) {
        return res.status(400).json({ success: false, error: 'index or taskId is required' });
      }

      const existing = await safeMongoRead('study/toggle-task existing', () => TaskStatus.findOne({ userId, index: taskIndex }).lean(), null);
      const nextCompleted = typeof body.completed === 'boolean' ? body.completed : !existing?.completed;
      console.log(`[TASK] Toggling task ${taskIndex} in hybrid stores for ${userId} -> ${nextCompleted}`);

      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('study/toggle-task', () => TaskStatus.findOneAndUpdate(
          { userId, index: taskIndex },
          { userId, index: taskIndex, completed: nextCompleted, updatedAt: new Date() },
          { upsert: true, new: true }
        )),
        safeTursoWrite('study/toggle-task', () => TursoDB.toggleTask(userId, taskIndex, nextCompleted))
      ]);
      if (!mongoStored && !tursoStored) {
        return res.status(503).json({ success: false, error: 'No task storage backend is currently writable.' });
      }

      const tursoProfile = await safeTursoRead('study/toggle-task profile', () => TursoDB.getProfile(userId), null);
      const mongoTasks = await safeMongoRead('study/toggle-task tasks', () => TaskStatus.find({ userId, completed: true }).lean(), []);
      const completedTasks = mergeCompletedTasks({ tursoProfile, mongoTasks });
      return res.status(200).json({ success: true, completedTasks, storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'study/reset' && req.method === 'POST') {
      const [mongoStored, tursoStored] = await Promise.all([
        safeMongoWrite('study/reset', async () => {
          await StudySession.deleteMany({ userId });
          await TaskStatus.deleteMany({ userId });
          await UserProfile.findOneAndUpdate(
            { userId },
            { userId, studyPlanTopics: [], studyStreak: { current: 0, best: 0, lastDate: '' }, updatedAt: new Date() },
            { upsert: true }
          );
        }),
        safeTursoWrite('study/reset', () => TursoDB.resetStudyData(userId))
      ]);
      return res.status(200).json({ success: true, completedTasks: [], sessions: [], storage: { mongo: mongoStored, turso: tursoStored } });
    }

    if (path === 'study/leaderboard') {
      const rows = await safeMongoRead('study/leaderboard rows', () => StudySession.aggregate([
        { $match: { userId } },
        { $group: { _id: '$userId', totalSeconds: { $sum: '$duration' }, sessions: { $sum: 1 }, lastStudy: { $max: '$endTime' } } }
      ]), []);
      const users = await safeMongoRead('study/leaderboard users', () => User.find({ googleId: userId }).lean(), []);
      const userMap = new Map(users.map(u => [u.googleId, u]));
      const leaderboard = rows.map(row => {
        const user = userMap.get(row._id) || {};
        return {
          userId: row._id,
          name: user.name || 'Anonymous Scholar',
          picture: user.picture || '',
          totalHours: Math.round((row.totalSeconds || 0) / 36) / 100,
          sessions: row.sessions || 0,
          lastStudy: row.lastStudy
        };
      });
      return res.status(200).json({ success: true, leaderboard });
    }

    // 5. SUMMARY ENDPOINTS (Hybrid History)
    if (path === 'summary/daily' || path === 'summary/all') {
      const tursoSessions = await safeTursoRead('summary/history', () => TursoDB.getFullHistory(userId), []);
      const mongoSessions = await safeMongoRead(
        'summary/history',
        () => StudySession.find({ userId }).sort({ startTime: -1 }).limit(1000).lean(),
        []
      );
      const allSessions = mergeStudyHistory(tursoSessions, mongoSessions, 1000);
      
      const [mongoJobs, tursoJobs, trackerJobs, alertJobs] = await Promise.all([
        safeMongoRead(
          'summary/jobs mongo',
          () => JobRecord.find(mongoJobQuery(userId)).sort({ createdAt: -1 }).limit(1000).lean(),
          []
        ),
        safeTursoRead('summary/jobs turso', () => TursoDB.getJobAnalytics(userId), []),
        readSupabaseTrackerJobs(),
        readSupabaseJobAlertRows(180)
      ]);
      const allJobs = mergeDashboardJobs(mongoJobs, tursoJobs, trackerJobs, alertJobs);
      
      console.log(`[SUMMARY] Hybrid Analyzing ${allSessions.length} sessions and ${allJobs.length} jobs`);
      
      const historyObj = buildStudySummaryHistory(allSessions, allJobs);
      const todayStr = new Date().toISOString().split('T')[0];
      if (path === 'summary/daily') return res.status(200).json(getDailySummary(historyObj, todayStr));
      return res.status(200).json(historyObj);
    }

    if (path === 'jobs/apply' && req.method === 'POST') {
      return res.status(409).json({
        success: false,
        error: 'Auto Apply is only available from the local desktop server because it needs a browser session on this machine.'
      });
    }

    if (path.startsWith('ai/') && req.method === 'POST') {
      const kind = path.replace('ai/', '');
      const body = readBody(req);
      const response = await generateAiText(kind, body);
      return res.status(200).json({ success: true, response });
    }

    // 6. KNOWLEDGE & TOPICS (MODULAR v1412)
    if (path.startsWith('knowledge/')) {
      const topicId = path.split('/')[1];
      if (!topicId) return res.status(400).json({ error: 'Missing topic ID' });
      
      // Try specific file first
      let knowledge = readDataJson(`topics/${topicId}.json`, null);
      
      // Fallback to master knowledge map
      if (!knowledge) {
        const master = readDataJson('topics/master_knowledge.json', {});
        knowledge = master[topicId];
      }

      if (knowledge) return res.status(200).json(knowledge);
      return res.status(404).json({ error: 'Topic not found' });
    }

    return res.status(404).json({ error: 'Route not found' });

  } catch (e) {
    console.error('Hybrid API Error:', e);
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    const payload = {
      success: false, 
      error: isProduction ? 'An internal error occurred. Please try again later.' : e.message,
      hint: isProduction ? undefined : 'This error is coming from the Vercel Serverless Function.'
    };
    if (!isProduction) payload.stack = e.stack;
    return res.status(500).json(payload);
  }
}
