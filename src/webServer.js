import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import 'dotenv/config';
import { StudySession, TaskStatus, User, JobRecord, UserProfile } from './models/models.js';
import { spawn } from 'child_process';
import { attemptAutoApply } from './tools/autoApply.js';
import {
  filterDashboardFreshness,
  getDashboardFreshnessDays,
  mergeDashboardJobs,
  normalizeDashboardJob,
  parseMaybeArray,
  readSupabaseJobAlertRows,
  readSupabaseTrackerJobs
} from './jobs/dashboardJobs.js';
import {
  buildClientConfig,
  buildHealthPayload as buildRadarHealthPayload,
  buildJobsDegradedPayload,
  getRadarStatusStateKey,
  isPublicApiPath
} from './api/radarContract.js';
import { isSupabaseEnabled, supabase } from './db/supabase.js';
import {
  readReleaseCenterPayload,
  selectPersonalizedReleaseItems
} from './releases/releaseCenter.js';
import {
  buildDashboardSummary,
  buildReleaseStudyActions,
  createMockInterviewSession
} from './services/dashboardSummary.js';
import {
  buildStudySummaryHistory,
  getDailySummary,
  mergeCompletedTasks,
  mergeStudyHistory,
  normalizeStudyTaskIndex,
  upsertRetentionTopic
} from './services/studyService.js';
import {
  buildImportedProfile,
  buildPremiumRoadmap,
  normalizeProfileSavePayload,
  topicConfigName
} from './services/profileService.js';
import { parseJsonBody } from './api/requestSanitizer.js';
import { apiError, apiSuccess, sendNodeJson, unauthorizedResponse } from './api/apiResponse.js';
import { getAuthenticatedUserId, verifyGoogleCredential } from './auth/session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const WEB_DIR = process.cwd();
const DATA_DIR = path.join(process.cwd(), 'data');
const dataCache = new Map();

function buildHealthPayload(isMongoConnected = false) {
  return buildRadarHealthPayload({
    env: process.env,
    mongoConnected: isMongoConnected,
    runtime: process.env.VERCEL ? 'vercel' : 'local'
  });
}

function readDataJson(fileName, fallback = {}) {
  if (dataCache.has(fileName)) return dataCache.get(fileName);
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
    dataCache.set(fileName, parsed);
    return parsed;
  } catch (e) {
    return fallback;
  }
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
      source: 'local-web-server'
    });
  } catch (err) {
    console.warn('[STATUS] Supabase status write skipped:', err.message);
  }

  return {
    stored: wroteMongo || wroteState,
    mongo: wroteMongo,
    supabase: wroteState
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

function readBody(req) {
  return parseJsonBody(req.body);
}

async function readJsonRequest(req) {
  if (req.body) return readBody(req);
  let body = '';
  for await (const chunk of req) body += chunk;
  return parseJsonBody(body);
}

function safePracticeFileName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 80);
}

function getCodePracticeCatalog() {
  return readDataJson('code-practice-challenges.json', { version: 'local-fallback', challenges: [] });
}

function filterCodePracticeChallenges(searchParams = new URLSearchParams()) {
  const catalog = getCodePracticeCatalog();
  const requestedTrack = String(searchParams.get('track') || 'all').toLowerCase();
  const requestedYears = Number(searchParams.get('experienceYears') || 0);
  const requestedDesignation = String(searchParams.get('designation') || '').toLowerCase();
  const challenges = (catalog.challenges || []).filter(challenge => {
    const challengeTrack = String(challenge.track || '').toLowerCase();
    const trackMatch = requestedTrack === 'all' || !requestedTrack || challengeTrack === requestedTrack;
    const yearMatch = !requestedYears || (challenge.experienceLevels || []).includes(requestedYears);
    const designationMatch = !requestedDesignation || (challenge.designations || []).some(item => String(item).toLowerCase() === requestedDesignation);
    return trackMatch && yearMatch && designationMatch;
  });
  return { version: catalog.version, challenges };
}

function getCodePracticeChallenge(challengeId) {
  return (getCodePracticeCatalog().challenges || []).find(challenge => challenge.id === challengeId) || null;
}

function normalizeCodePracticeFiles(files = []) {
  if (Array.isArray(files)) {
    return Object.fromEntries(files.map(file => [
      safePracticeFileName(file.name),
      String(file.content || '').slice(0, 60000)
    ]).filter(([name]) => name));
  }
  return Object.fromEntries(Object.entries(files || {}).map(([name, content]) => [
    safePracticeFileName(name),
    String(content || '').slice(0, 60000)
  ]).filter(([name]) => name));
}

function runCodePracticeChecks(challenge, files, runResult = {}) {
  const fileMap = normalizeCodePracticeFiles(files);
  const passedChecks = [];
  const failedChecks = [];
  let passedWeight = 0;
  let totalWeight = 0;

  for (const check of challenge.staticChecks || []) {
    const weight = Number(check.weight || 10);
    totalWeight += weight;
    const source = check.file === '*' ? Object.values(fileMap).join('\n\n') : String(fileMap[check.file] || '');
    let passed = false;
    try {
      if (check.regex) passed = new RegExp(check.regex, 'i').test(source);
      if (check.negativeRegex) passed = !new RegExp(check.negativeRegex, 'i').test(source);
    } catch (err) {
      passed = false;
    }
    const item = { id: check.id, label: check.label, weight };
    if (passed) {
      passedWeight += weight;
      passedChecks.push(item);
    } else {
      failedChecks.push(item);
    }
  }

  const testWeights = new Map((challenge.tests || []).map(test => [test.id, Number(test.weight || 10)]));
  for (const test of runResult.tests || []) {
    const weight = testWeights.get(test.id) || Number(test.weight || 10);
    totalWeight += weight;
    const item = { id: test.id, label: test.label || test.id, weight };
    if (test.pass) {
      passedWeight += weight;
      passedChecks.push(item);
    } else {
      failedChecks.push({ ...item, message: test.message });
    }
  }

  const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
  return {
    score,
    correctnessPercent: score,
    passedChecks,
    failedChecks,
    improvements: failedChecks.slice(0, 6).map(check => `Improve: ${check.label}`),
    interviewFeedback: score >= 80
      ? 'Strong attempt. Explain the design tradeoffs, testing strategy, and Salesforce limits in an interview.'
      : 'Good start. Tighten the failed checks, then explain how you would test and bulk-proof the solution.',
    nextPracticeTopics: challenge.track === 'salesforce'
      ? ['Bulkification', 'Test coverage', 'Security review']
      : ['DOM events', 'Pure functions', 'Accessible UI']
  };
}

function parseCodePracticeAiReview(rawText, fallback) {
  try {
    const jsonText = String(rawText || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonText);
    return {
      score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : fallback.score,
      correctnessPercent: Number.isFinite(Number(parsed.correctnessPercent)) ? Number(parsed.correctnessPercent) : fallback.correctnessPercent,
      passedChecks: Array.isArray(parsed.passedChecks) ? parsed.passedChecks : fallback.passedChecks,
      failedChecks: Array.isArray(parsed.failedChecks) ? parsed.failedChecks : fallback.failedChecks,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : fallback.improvements,
      interviewFeedback: parsed.interviewFeedback || fallback.interviewFeedback,
      nextPracticeTopics: Array.isArray(parsed.nextPracticeTopics) ? parsed.nextPracticeTopics : fallback.nextPracticeTopics
    };
  } catch (err) {
    return fallback;
  }
}

async function generateLocalCodePracticeReview(payload, fallback) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'gemma4:e4b',
        stream: false,
        prompt: [
          'Review this Salesforce coding practice attempt.',
          'Return valid JSON only with keys score, correctnessPercent, passedChecks, failedChecks, improvements, interviewFeedback, nextPracticeTopics.',
          `Deterministic score: ${payload.score}`,
          `Challenge: ${payload.challengeTitle}`,
          `Instructions: ${payload.instructions}`,
          `Rubric: ${payload.aiRubric}`,
          `Files:\n${payload.filesText}`
        ].join('\n\n')
      })
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    const data = await response.json();
    return parseCodePracticeAiReview(data.response, fallback);
  } catch (err) {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

function getDefaultCodePracticeProgress() {
  return { attempts: [], bestScores: {}, lastWorkspace: null, completedChallengeIds: [] };
}

function readLocalCodePracticeProgress(userId) {
  const cachePath = path.join(CACHE_DIR, 'code-practice-progress.json');
  if (!fs.existsSync(cachePath)) return getDefaultCodePracticeProgress();
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return cache[userId] || getDefaultCodePracticeProgress();
  } catch (err) {
    return getDefaultCodePracticeProgress();
  }
}

function writeLocalCodePracticeProgress(userId, codingPractice) {
  const cachePath = path.join(CACHE_DIR, 'code-practice-progress.json');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let cache = {};
  try {
    if (fs.existsSync(cachePath)) cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (err) {
    cache = {};
  }
  cache[userId] = codingPractice;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function readLocalProfile(userId) {
  const cachePath = path.join(CACHE_DIR, 'profile-cache.json');
  const cache = readJsonFileSafe(cachePath, {});
  if (cache[userId]) return cache[userId];

  const legacyPath = path.join(CACHE_DIR, 'profile-sync.json');
  const legacy = readJsonFileSafe(legacyPath, null);
  if (!legacy) return null;
  if (legacy.userId && legacy.userId !== userId) return null;

  const migrated = { ...legacy, userId, migratedFromLegacyProfileSyncAt: new Date().toISOString() };
  writeLocalProfile(userId, migrated);
  return migrated;
}

function writeLocalProfile(userId, profile) {
  const cachePath = path.join(CACHE_DIR, 'profile-cache.json');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cache = readJsonFileSafe(cachePath, {});
  cache[userId] = { ...(profile || {}), userId };
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

// MongoDB Connection
let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  if (!process.env.MONGODB_URI) {
    console.error('[DB] MONGODB_URI missing');
    return null;
  }
  try {
    const db = await mongoose.connect(process.env.MONGODB_URI);
    console.log('[DB] Connected to MongoDB Atlas');
    cachedDb = db;
    return db;
  } catch (err) {
    console.error('[DB] MongoDB Connection Error:', err);
    return null;
  }
}

// THE HANDLER (Exported for Vercel)
export default async function handler(req, res) {
  const db = await connectDB();
  const isMongoConnected = !!db;

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const url = parsedUrl.pathname;
  const method = req.method;

  // SILENT FAVICON (Prevents 404 errors in console)
  if (url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static files
  if (method === 'GET' && !url.startsWith('/api')) {
    let filePath = path.join(WEB_DIR, url === '/' ? 'index.html' : url);
    
    // Safety check - prevent directory traversal
    if (!filePath.startsWith(WEB_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.json': 'application/json'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch (e) {
      if (url === '/' || url === '/index.html') {
         res.writeHead(500);
         res.end('Error loading dashboard');
      } else {
         res.writeHead(404);
         res.end('Not Found');
      }
    }
    return;
  }

  // API ENDPOINTS (Scoped by User)
  if (url.startsWith('/api/')) {
    const userId = await getAuthenticatedUserId(req, { log: false });
    
    // Auth Endpoint - Does NOT require userId
    if (url === '/api/auth/google' && method === 'POST') {
      try {
        const { token } = await readJsonRequest(req);
        const { user: authUser } = await verifyGoogleCredential(token);
        const googleId = authUser.id;
        
        let user = {
          id: googleId,
          googleId,
          email: authUser.email,
          name: authUser.name,
          picture: authUser.picture,
          lastLogin: new Date()
        };

        if (isMongoConnected) {
          user = await User.findOneAndUpdate(
            { googleId },
            user,
            { upsert: true, new: true }
          );
        }
        
        sendNodeJson(res, 200, apiSuccess({ user }));
      } catch (e) {
        console.error('Google Auth Error:', e);
        sendNodeJson(res, 401, apiError('Invalid token or DB error', {
          status: 401,
          code: 'auth_failed'
        }));
      }
      return;
    }

    const isPublicFile = url === '/manifest.json' || url.endsWith('.png') || url.endsWith('.ico');
    const isPublicApi = isPublicApiPath(url, method);
    
    if (!userId && !isPublicFile && !isPublicApi) {
      sendNodeJson(res, 401, unauthorizedResponse());
      return;
    }

    try {
      if (url === '/api/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildHealthPayload(isMongoConnected)));
      }
      else if (url === '/api/client-config' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(buildClientConfig(process.env)));
      }
      else if (url === '/api/code-practice/challenges' && method === 'GET') {
        const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...filterCodePracticeChallenges(requestUrl.searchParams) }));
      }
      else if (url === '/api/study/history' && method === 'GET') {
        const sessions = mergeStudyHistory([], await StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean(), 100);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessions));
      } 
      else if (url === '/api/study/session' && method === 'POST') {
        const sessionData = await readJsonRequest(req);
        const session = new StudySession({ ...sessionData, userId });
        await session.save();
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
      else if (url === '/api/study/tasks' && method === 'GET') {
        if (!isMongoConnected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ completedTasks: [] }));
          return;
        }
        const tasks = await TaskStatus.find({ userId, completed: true }).lean();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ completedTasks: mergeCompletedTasks({ mongoTasks: tasks }) }));
      }
      else if (url === '/api/study/toggle-task' && method === 'POST') {
        const payload = await readJsonRequest(req);
        const taskIndex = normalizeStudyTaskIndex(payload);
        if (taskIndex === null) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'index or taskId is required' }));
          return;
        }
        const existing = isMongoConnected ? await TaskStatus.findOne({ userId, index: taskIndex }).lean() : null;
        const nextCompleted = typeof payload.completed === 'boolean' ? payload.completed : !existing?.completed;
        if (isMongoConnected) {
          await TaskStatus.findOneAndUpdate(
            { userId, index: taskIndex },
            { userId, index: taskIndex, completed: nextCompleted, updatedAt: new Date() },
            { upsert: true, new: true }
          );
          const completedTasks = mergeCompletedTasks({ mongoTasks: await TaskStatus.find({ userId, completed: true }).lean() });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, completedTasks }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, completedTasks: [] }));
        }
      }
      else if (url === '/api/study/reset' && method === 'POST') {
        if (isMongoConnected) {
          await StudySession.deleteMany({ userId });
          await TaskStatus.deleteMany({ userId });
          await UserProfile.findOneAndUpdate(
            { userId },
            { userId, studyPlanTopics: [], studyStreak: { current: 0, best: 0, lastDate: '' }, updatedAt: new Date() },
            { upsert: true }
          );
        }
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(path.join(CACHE_DIR, `study-tracker-${encodeURIComponent(userId)}.json`), JSON.stringify({ sessions: [], completedTasks: [], topics: {} }, null, 2));
        fs.writeFileSync(path.join(CACHE_DIR, `daily-summaries-${encodeURIComponent(userId)}.json`), JSON.stringify({}, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, completedTasks: [], sessions: [] }));
      }
      else if (url.match(/^\/api\/jobs\/[^/]+\/status$/) && method === 'PATCH') {
        const payload = await readJsonRequest(req);

        const routeId = decodeURIComponent(url.split('/')[3] || '');
        const rawKey = payload.job_hash || payload.jobHash || payload.jobId || routeId;
        if (!rawKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing job identifier' }));
          return;
        }

        const status = normalizeBoardStatus(payload.status);
        const updatedAt = payload.updatedAt || new Date().toISOString();
        const appliedAt = status === 'applied' ? (payload.appliedAt || updatedAt) : (payload.appliedAt || '');
        const statusKey = encodeStatusKey(rawKey);

        const storage = await saveJobStatusOverride(userId, statusKey, {
          status,
          updatedAt,
          appliedAt,
          rawKey: String(rawKey),
          jobId: routeId
        });
        if (!storage.stored) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Job status sync is temporarily unavailable. Configure MongoDB or Supabase state storage for cloud status updates.'
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status, updatedAt, appliedAt, key: statusKey, storage }));
      }
      else if (url === '/api/jobs' && method === 'GET') {
        const [trackerJobs, alertJobs] = await Promise.all([
          readSupabaseTrackerJobs(),
          readSupabaseJobAlertRows(180)
        ]);
        const sourceCounts = {
          supabaseAlerts: alertJobs.length,
          applicationTracker: trackerJobs.length,
          mongo: 0
        };
        if (isMongoConnected) {
          const mongoJobs = await JobRecord.find({ $or: [{ userId }, { userId: 'system' }] }).sort({ updatedAt: -1, createdAt: -1 }).limit(180).lean();
          sourceCounts.mongo = mongoJobs.length;
          const mergedJobs = mergeDashboardJobs(
            mongoJobs.map(job => normalizeDashboardJob(job, 'Legacy (Mongo)')),
            trackerJobs,
            alertJobs
          );
          const records = filterDashboardFreshness(
            applyJobStatusOverrides(mergedJobs, await getJobStatusOverrides(userId))
          ).slice(0, 180);
          console.log(
            `[DB] Unified | Mongo: ${mongoJobs.length} | Supabase alerts: ${alertJobs.length} | Tracker: ${trackerJobs.length} | Total: ${records.length}`
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            records,
            dbStatus: true,
            source: 'mongodb',
            count: records.length,
            freshnessDays: getDashboardFreshnessDays(),
            storageCapacity: 'Hot + Archive Reads Active',
            sourceCounts,
            degraded: buildJobsDegradedPayload({ env: process.env, mongoConnected: true, sourceCounts })
          }));
        } else {
          const records = filterDashboardFreshness(
            applyJobStatusOverrides(mergeDashboardJobs(trackerJobs, alertJobs), await getJobStatusOverrides(userId))
          ).slice(0, 180);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            records,
            dbStatus: false,
            source: records.length ? 'supabase' : 'cache',
            count: records.length,
            freshnessDays: getDashboardFreshnessDays(),
            storageCapacity: records.length ? 'Archive Reads Active' : 'Cloud sources unavailable',
            sourceCounts,
            degraded: buildJobsDegradedPayload({ env: process.env, mongoConnected: false, sourceCounts }),
            error: records.length ? undefined : (process.env.MONGODB_URI ? 'mongodb_connection_failed' : 'missing_mongodb_uri')
          }));
        }
      }
      else if (url === '/api/jobs/analytics' && method === 'GET') {
        const [mongoJobs, trackerJobs, alertJobs] = await Promise.all([
          isMongoConnected ? JobRecord.find({ userId }).lean() : [],
          readSupabaseTrackerJobs(),
          readSupabaseJobAlertRows(180)
        ]);
        const records = applyJobStatusOverrides(
          mergeDashboardJobs(mongoJobs, trackerJobs, alertJobs),
          await getJobStatusOverrides(userId)
        );
        const hasSkill = (record, skill) => {
          const skills = [
            ...parseMaybeArray(record.skills),
            ...parseMaybeArray(record.matched_skills)
          ].map(item => item.toLowerCase());
          return skills.some(item => item.includes(skill.toLowerCase()));
        };
        
        const matchedSkills = [
          { _id: 'Apex', count: records.filter(r => hasSkill(r, 'Apex')).length },
          { _id: 'LWC', count: records.filter(r => hasSkill(r, 'LWC')).length },
          { _id: 'Integration', count: records.filter(r => hasSkill(r, 'REST')).length }
        ];
        const missingSkills = [
          { _id: 'Data Cloud', count: 5 },
          { _id: 'Agentforce', count: 3 }
        ];
        const topCompanies = [
          { _id: 'Salesforce', count: records.filter(r => r.company === 'Salesforce').length },
          { _id: 'Deloitte', count: records.filter(r => r.company === 'Deloitte').length }
        ];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          matched_skills: matchedSkills,
          missing_skills: missingSkills,
          top_companies: topCompanies,
          matchedSkills,
          missingSkills,
          topCompanies
        }));
      }
      else if (url.includes('summary/all')) {
        const [sessions, jobs] = isMongoConnected
          ? await Promise.all([
              StudySession.find({ userId }).sort({ startTime: -1 }).limit(1000).lean(),
              JobRecord.find({ userId }).sort({ createdAt: -1 }).limit(1000).lean()
            ])
          : [[], []];
        const result = buildStudySummaryHistory(
          mergeStudyHistory([], sessions, 1000),
          jobs
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
      else if (url.includes('summary/daily')) {
        let sessions = [];
        let jobs = [];
        if (isMongoConnected) {
          [sessions, jobs] = await Promise.all([
            StudySession.find({ userId }).sort({ startTime: -1 }).limit(1000).lean(),
            JobRecord.find({ userId }).sort({ createdAt: -1 }).limit(1000).lean()
          ]);
        }
        const summaries = buildStudySummaryHistory(mergeStudyHistory([], sessions, 1000), jobs);
        const todayStr = new Date().toISOString().split('T')[0];
        const summary = getDailySummary(summaries, todayStr);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(summary));
      }
      else if (url === '/api/dashboard/summary' && method === 'GET') {
        const [profile, mongoJobs, trackerJobs, alertJobs, studySessions] = await Promise.all([
          isMongoConnected ? UserProfile.findOne({ userId }).lean() : null,
          isMongoConnected ? JobRecord.find({ userId }).sort({ updatedAt: -1, createdAt: -1 }).limit(220).lean() : [],
          readSupabaseTrackerJobs(),
          readSupabaseJobAlertRows(180),
          isMongoConnected ? StudySession.find({ userId }).sort({ startTime: -1 }).limit(120).lean() : []
        ]);
        const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
        const allReleases = await readReleaseCenterPayload(fallbackReleases);
        const jobs = applyJobStatusOverrides(
          mergeDashboardJobs(mongoJobs, trackerJobs, alertJobs),
          await getJobStatusOverrides(userId)
        );
        const summary = buildDashboardSummary({
          profile: profile || { userId },
          jobs,
          studySessions,
          releases: allReleases,
          activityLog: []
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(summary));
      }
      else if (url === '/api/profile/sync' && method === 'POST') {
        const { platform } = await readJsonRequest(req);

        console.log(`[Sync] Triggering local AI sync for ${platform}...`);
        
        // Spawn the sync script
        const scriptPath = path.join(process.cwd(), 'src', 'tools', 'syncProfile.js');
        const child = spawn('node', [scriptPath, platform], {
          env: { ...process.env, GOOGLE_AUTH_TOKEN: token }
        });

        let output = '';
        child.stdout.on('data', (data) => { output += data; console.log(`[Sync Script] ${data}`); });
        child.stderr.on('data', (data) => { console.error(`[Sync Error] ${data}`); });

        child.on('close', (code) => {
          if (code === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Sync completed successfully' }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sync script failed' }));
          }
        });
      }
      else if (url === '/api/jobs/scan' && method === 'POST') {
        console.log('[Radar] Triggering global job scan...');
        
        const scriptPath = path.join(process.cwd(), 'src', 'run.js');
        const child = spawn('node', [scriptPath], {
          env: { ...process.env, GOOGLE_AUTH_TOKEN: token }
        });

        child.stdout.on('data', (data) => console.log(`[Radar Script] ${data}`));
        child.stderr.on('data', (data) => console.error(`[Radar Error] ${data}`));

        child.on('close', (code) => {
          console.log(`[Radar] Scan finished with code ${code}`);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          queued: true,
          mode: 'local_background',
          message: 'Local job scan started in the background.'
        }));
      }
      else if (url === '/api/study/leaderboard' && method === 'GET') {
        if (!isMongoConnected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, leaderboard: [] }));
          return;
        }
        const rows = await StudySession.aggregate([
          { $match: { userId } },
          { $group: { _id: '$userId', totalSeconds: { $sum: '$duration' }, sessions: { $sum: 1 }, lastStudy: { $max: '$endTime' } } }
        ]);
        const users = await User.find({ googleId: userId }).lean();
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, leaderboard }));
      }
      else if (url === '/api/profile/save-retention' && method === 'POST') {
        const { topicId, stats } = await readJsonRequest(req);
        if (!topicId || !stats) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'topicId and stats are required' }));
          return;
        }
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        const { topics } = upsertRetentionTopic(profile?.studyPlanTopics, topicId, stats, topicConfigName);
        if (isMongoConnected) {
          await UserProfile.findOneAndUpdate({ userId }, { userId, studyPlanTopics: topics, updatedAt: new Date() }, { upsert: true });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, studyPlanTopics: topics }));
        } else {
          writeLocalProfile(userId, { ...(profile || {}), userId, studyPlanTopics: topics, updatedAt: new Date() });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, studyPlanTopics: topics }));
        }
      }
      else if (url.includes('profile/save') && method === 'POST') {
        const profileData = await readJsonRequest(req);
        const existing = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        const { profile: normalizedProfile } = normalizeProfileSavePayload({
          body: profileData,
          existingProfile: existing,
          userId,
          readDataJson
        });

        if (isMongoConnected) {
          const profile = await UserProfile.findOneAndUpdate(
            { userId },
            normalizedProfile,
            { upsert: true, new: true }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile }));
        } else {
          writeLocalProfile(userId, normalizedProfile);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile: normalizedProfile }));
        }
      }
      else if (url === '/api/profile/import' && method === 'POST') {
        const payload = await readJsonRequest(req);
        const existing = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        const imported = buildImportedProfile({
          body: payload,
          existingProfile: existing,
          userId,
          readDataJson
        });
        if (imported.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: imported.error }));
          return;
        }
        const { profile: nextProfile, extracted, intelligence } = imported;
        if (isMongoConnected) await UserProfile.findOneAndUpdate({ userId }, nextProfile, { upsert: true, new: true });
        else writeLocalProfile(userId, nextProfile);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, extractedData: extracted, intelligence }));
      }
      else if (url === '/api/roadmap' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...buildPremiumRoadmap(profile || {}, readDataJson) }));
      }
      else if (url === '/api/releases/current' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
        const allReleases = await readReleaseCenterPayload(fallbackReleases);
        const intelligence = buildPremiumRoadmap(profile || {}, readDataJson);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          sourceMode: allReleases.sourceMode || 'bundled-fallback',
          generatedAt: allReleases.generatedAt || null,
          activeRelease: allReleases.activeRelease || {},
          items: allReleases.items || [],
          personalizedItems: selectPersonalizedReleaseItems(allReleases.items || [], intelligence),
          experienceYears: intelligence.experienceYears,
          designation: intelligence.designation
        }));
      }
      else if (url === '/api/releases/study-actions' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
        const allReleases = await readReleaseCenterPayload(fallbackReleases);
        const intelligence = buildPremiumRoadmap(profile || {}, readDataJson);
        const studyActions = buildReleaseStudyActions({
          ...allReleases,
          personalizedItems: selectPersonalizedReleaseItems(allReleases.items || [], intelligence)
        });
        if (isMongoConnected) {
          await UserProfile.findOneAndUpdate(
            { userId },
            { userId, releaseStudyActions: studyActions, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        } else {
          writeLocalProfile(userId, { ...(profile || {}), userId, releaseStudyActions: studyActions, updatedAt: new Date() });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, generatedAt: new Date().toISOString(), studyActions }));
      }
      else if (url === '/api/mock-interview/session' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const fallbackPath = path.join(CACHE_DIR, `mock-interviews-${userId}.json`);
        const fallbackSessions = !profile && fs.existsSync(fallbackPath)
          ? JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
          : [];
        const sessions = Array.isArray(profile?.mockInterviewSessions) ? profile.mockInterviewSessions : fallbackSessions;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessions: sessions.slice(0, 50) }));
      }
      else if (url === '/api/mock-interview/session' && method === 'POST') {
        const body = await readJsonRequest(req);
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const session = createMockInterviewSession(body, userId);
        const mockInterviewSessions = [session, ...(profile?.mockInterviewSessions || [])].slice(0, 50);
        if (isMongoConnected) {
          await UserProfile.findOneAndUpdate(
            { userId },
            { userId, mockInterviewSessions, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        } else {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(path.join(CACHE_DIR, `mock-interviews-${userId}.json`), JSON.stringify(mockInterviewSessions, null, 2));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, session, sessions: mockInterviewSessions }));
      }
      else if (url === '/api/code-practice/evaluate' && method === 'POST') {
        const body = await readJsonRequest(req);
        const challenge = getCodePracticeChallenge(body.challengeId);
        if (!challenge) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Challenge not found' }));
          return;
        }
        const deterministic = runCodePracticeChecks(challenge, body.files || {}, body.runResult || {});
        const filesMap = normalizeCodePracticeFiles(body.files || {});
        const filesText = Object.entries(filesMap)
          .map(([name, content]) => `--- ${name} ---\n${String(content).slice(0, 5000)}`)
          .join('\n\n')
          .slice(0, 14000);
        const aiReview = await generateLocalCodePracticeReview({
          ...deterministic,
          challengeTitle: challenge.title,
          instructions: challenge.instructions,
          aiRubric: challenge.aiRubric,
          filesText
        }, deterministic);
        const finalScore = Math.round((deterministic.score * 0.8) + (aiReview.score * 0.2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          challengeId: challenge.id,
          languageTrack: body.languageTrack || challenge.track,
          score: finalScore,
          correctnessPercent: finalScore,
          deterministicScore: deterministic.score,
          aiScore: aiReview.score,
          passedChecks: deterministic.passedChecks,
          failedChecks: deterministic.failedChecks,
          improvements: aiReview.improvements,
          interviewFeedback: aiReview.interviewFeedback,
          nextPracticeTopics: aiReview.nextPracticeTopics,
          evaluatedAt: new Date().toISOString()
        }));
      }
      else if (url === '/api/code-practice/progress' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const codingPractice = profile?.codingPractice || readLocalCodePracticeProgress(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, codingPractice }));
      }
      else if (url === '/api/code-practice/attempt' && method === 'POST') {
        const body = await readJsonRequest(req);
        const challenge = getCodePracticeChallenge(body.challengeId) || (body.custom ? {
          id: String(body.challengeId || `custom_${Date.now()}`).slice(0, 80),
          title: String(body.title || 'Custom single-file practice').slice(0, 120),
          track: body.languageTrack || 'custom'
        } : null);
        if (!challenge) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Challenge not found' }));
          return;
        }
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const current = profile?.codingPractice || readLocalCodePracticeProgress(userId);
        const score = Math.max(0, Math.min(100, Math.round(Number(body.score || body.correctnessPercent || 0))));
        const attempt = {
          challengeId: challenge.id,
          title: challenge.title,
          track: body.languageTrack || challenge.track,
          score,
          correctnessPercent: Math.max(0, Math.min(100, Math.round(Number(body.correctnessPercent || score)))),
          passedChecks: Array.isArray(body.passedChecks) ? body.passedChecks : [],
          failedChecks: Array.isArray(body.failedChecks) ? body.failedChecks : [],
          improvements: Array.isArray(body.improvements) ? body.improvements : [],
          createdAt: new Date()
        };
        const bestScores = { ...(current.bestScores || {}) };
        bestScores[challenge.id] = Math.max(Number(bestScores[challenge.id] || 0), score);
        const completed = new Set(current.completedChallengeIds || []);
        if (score >= 80) completed.add(challenge.id);
        const codingPractice = {
          attempts: [attempt, ...(current.attempts || [])].slice(0, 50),
          bestScores,
          completedChallengeIds: Array.from(completed),
          lastWorkspace: {
            challengeId: challenge.id,
            languageTrack: body.languageTrack || challenge.track,
            files: normalizeCodePracticeFiles(body.files || {}),
            updatedAt: new Date()
          }
        };
        if (isMongoConnected) {
          await UserProfile.findOneAndUpdate(
            { userId },
            { userId, codingPractice, updatedAt: new Date() },
            { upsert: true, new: true }
          );
        } else {
          writeLocalCodePracticeProgress(userId, codingPractice);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, codingPractice }));
      }
      else if (url.includes('profile/data') && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists: !!profile, profile }));
      }
      else if (url.includes('profile/match') && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : readLocalProfile(userId);
        if (!profile) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasProfile: false, match: null }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasProfile: true, match: { strengths: [], gaps: (profile.missingSkills || []).map(s => ({ skill: s, demandCount: 0 })), topCompanies: [], totalJobsAnalyzed: 0, profileSkillCount: (profile.skills || []).length, certCount: (profile.certifications || []).length } }));
        }
      }
      else if (url === '/api/jobs/apply' && method === 'POST') {
        const { hash } = await readJsonRequest(req);
        
        const job = await JobRecord.findOne({ job_hash: hash, userId });
        if (!job) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Job not found' }));
          return;
        }

        console.log(`[AutoApply] Triggering automation for ${job.title} at ${job.company}`);
        
        // Run in background
        attemptAutoApply(job).catch(e => console.error('[AutoApply Error]', e));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Automation launched' }));
      }
      else if (url.startsWith('/api/ai/') && method === 'POST') {
        const payload = await readJsonRequest(req);
        const kind = url.split('/').pop();
        const prompt = payload.prompt || payload.answer || payload.message || JSON.stringify(payload);
        let responseText = '';
        try {
          const ollamaRes = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            body: JSON.stringify({
              model: process.env.OLLAMA_MODEL || 'gemma4:e4b',
              prompt,
              stream: false
            })
          });
          if (!ollamaRes.ok) throw new Error('Ollama not responding');
          const aiData = await ollamaRes.json();
          responseText = aiData.response;
        } catch (e) {
          if (kind === 'email') {
            responseText = `Subject: Follow up\n\nHi team,\n\nThank you for considering me for this Salesforce opportunity. I appreciate your time and look forward to staying connected.\n\nBest regards,\n${payload.userName || 'Candidate'}`;
          } else if (kind === 'cover-letter') {
            responseText = 'I am excited to apply for this Salesforce role. My experience with Apex, LWC, integrations, and platform delivery aligns well with the opportunity.\n\nI focus on building maintainable solutions that solve real business problems and remain reliable in production.\n\nI would welcome the chance to discuss how I can contribute to your Salesforce roadmap.';
          } else {
            responseText = 'Good answer. Strengthen it by adding a concrete Salesforce example, mentioning limits or security, and explaining how you would test the solution. Next question: how would you handle this at enterprise scale?';
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, response: responseText }));
      }
      else {
        res.writeHead(404);
        res.end('Not Found');
      }
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

// Support local running
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const server = http.createServer(handler);
  server.listen(PORT, async () => {
    console.log(`\n🚀 Dashboard server running at http://localhost:${PORT}`);
    console.log(`📡 Job Radar API integrated with local dedupe storage`);
    
    // Auto-connect to MongoDB on startup
    const db = await connectDB();
    if (db) {
      console.log(`✅ MongoDB Atlas: Synchronizing cloud state...\n`);
    } else {
      console.log(`⚠️  MongoDB Atlas: Offline mode (local data only)\n`);
    }
  });
}
