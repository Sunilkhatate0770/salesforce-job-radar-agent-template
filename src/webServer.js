import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDailySummary } from './summaryService.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { StudySession, TaskStatus, User, JobRecord, UserProfile } from './models/models.js';
import { OAuth2Client } from 'google-auth-library';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const WEB_DIR = process.cwd();
const DATA_DIR = path.join(process.cwd(), 'data');
const dataCache = new Map();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

function clampExperienceYears(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
  return [];
}

function sanitizeImportText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(password|passwd|pwd|otp|one[-\s]?time password)\b\s*[:=]\s*\S+/gi, '$1: [removed]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function scoreDesignationLabel(normalized, label) {
  const normalizedLabel = String(label || '').toLowerCase().trim();
  if (!normalizedLabel) return 0;
  if (normalized === normalizedLabel) return 10000 + normalizedLabel.length;
  if (normalized.includes(normalizedLabel)) return 1000 + normalizedLabel.length;
  if (normalizedLabel.includes(normalized)) return 500 + normalized.length;
  return 0;
}

function inferDesignation(rawDesignation, designationsData) {
  const value = String(rawDesignation || '').trim();
  if (!value) return designationsData.designations?.[0] || null;
  const normalized = value.toLowerCase();
  const ranked = (designationsData.designations || []).map(item => {
    const labels = [item.label, ...(item.aliases || [])].map(v => String(v || '').toLowerCase());
    return { item, score: Math.max(...labels.map(label => scoreDesignationLabel(normalized, label))) };
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
  return ranked[0]?.item || { id: normalized.replace(/[^a-z0-9]+/g, '_'), label: value, track: 'Custom', primaryTopicIds: [] };
}

function topicConfigName(topicId) {
  return String(topicId || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch (e) { return {}; }
  }
  return typeof req.body === 'object' ? req.body : {};
}

async function readJsonRequest(req) {
  if (req.body) return readBody(req);
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (err) {
    return {};
  }
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

function buildPremiumRoadmap(profile = {}) {
  const roadmaps = readDataJson('career-roadmaps.json', { years: {} });
  const designations = readDataJson('designation-map.json', { designations: [] });
  const releases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
  const trailhead = readDataJson('trailhead-resources.json', { resources: [] });
  const experienceYears = clampExperienceYears(profile.experienceYears || 1);
  const designation = inferDesignation(profile.targetDesignation || profile.targetRole || profile.currentDesignation || profile.currentRole, designations);
  const baseRoadmap = roadmaps.years?.[String(experienceYears)] || roadmaps.years?.['1'] || {};
  const roadmapTopicIds = new Set(baseRoadmap.topicIds || []);
  const topics = [...(baseRoadmap.topics || [])];
  for (const topicId of designation?.primaryTopicIds || []) {
    if (!roadmapTopicIds.has(topicId)) {
      topics.push({ topicId, topic: topicConfigName(topicId), category: designation.track || 'Designation', priority: 'medium', estimatedHours: 6, reason: `Added for ${designation.label}.` });
      roadmapTopicIds.add(topicId);
    }
  }
  const releaseCategories = new Set(baseRoadmap.releaseFocus || []);
  const releaseItems = (releases.items || []).filter(item => {
    const levelMatch = (item.experienceLevels || []).includes(experienceYears);
    const categoryMatch = releaseCategories.has(item.category);
    const designationMatch = (item.designations || []).some(d => String(d).toLowerCase() === String(designation?.label || '').toLowerCase());
    return levelMatch && (categoryMatch || designationMatch);
  });
  const topicSet = new Set(topics.map(t => t.topicId));
  const resources = (trailhead.resources || []).filter(r => (r.recommendedYears || []).includes(experienceYears) && (r.topicIds || []).some(id => topicSet.has(id))).slice(0, 8);
  return {
    experienceYears,
    designation,
    roadmap: { ...baseRoadmap, topics, topicIds: Array.from(roadmapTopicIds) },
    releaseFocus: { activeRelease: releases.activeRelease || {}, items: releaseItems.length ? releaseItems : (releases.items || []).filter(item => (item.experienceLevels || []).includes(experienceYears)).slice(0, 6) },
    trailheadResources: resources,
    generatedAt: new Date().toISOString()
  };
}

function extractProfileImportFields(text) {
  const rawText = sanitizeImportText(text);
  const skillBank = ['Salesforce', 'Apex', 'SOQL', 'LWC', 'Aura', 'Flow', 'REST API', 'SOAP API', 'Integration', 'Batch Apex', 'Queueable Apex', 'Platform Events', 'Sales Cloud', 'Service Cloud', 'Experience Cloud', 'Data Cloud', 'Agentforce', 'CPQ', 'Git', 'Copado', 'DevOps', 'Reports', 'Dashboards', 'Security'];
  const skills = skillBank.filter(skill => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rawText));
  const yearsMatch = rawText.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i);
  const certMatches = rawText.match(/Salesforce Certified [A-Za-z0-9 &-]+/gi) || [];
  const roleMatch = rawText.match(/\b(?:Senior |Lead |Junior |Associate )?Salesforce [A-Za-z ]{3,40}\b/i);
  return { rawText, skills, experienceYears: yearsMatch ? clampExperienceYears(yearsMatch[1]) : undefined, currentDesignation: roleMatch ? roleMatch[0].trim() : undefined, certifications: Array.from(new Set(certMatches.map(v => v.trim()))) };
}

async function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return payload['sub']; 
  } catch (e) {
    return null;
  }
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
    const userId = await getUserId(req);
    
    // Auth Endpoint - Does NOT require userId
    if (url === '/api/auth/google' && method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { token } = JSON.parse(body);
        
        const ticket = await client.verifyIdToken({
          idToken: token, audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const googleId = payload['sub'];
        
        let user = {
          googleId,
          email: payload['email'],
          name: payload['name'],
          picture: payload['picture'],
          lastLogin: new Date()
        };

        if (isMongoConnected) {
          user = await User.findOneAndUpdate(
            { googleId },
            user,
            { upsert: true, new: true }
          );
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user }));
      } catch (e) {
        console.error('Google Auth Error:', e);
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid token or DB error' }));
      }
      return;
    }

    const isPublicFile = url === '/manifest.json' || url.endsWith('.png') || url.endsWith('.ico');
    const isPublicApi = isPublicApiPath(url, method);
    
    if (!userId && !isPublicFile && !isPublicApi) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
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
        const sessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessions));
      } 
      else if (url === '/api/study/session' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const sessionData = JSON.parse(body);
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
        res.end(JSON.stringify({ completedTasks: tasks.map(t => t.index) }));
      }
      else if (url === '/api/study/toggle-task' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || '{}');
        const taskIndex = Number(payload.index ?? payload.taskId);
        if (!Number.isFinite(taskIndex)) {
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
          const completedTasks = (await TaskStatus.find({ userId, completed: true }).lean()).map(t => t.index);
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
        let body = '';
        for await (const chunk of req) body += chunk;
        let payload = {};
        try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }

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
        if (!isMongoConnected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
          return;
        }
        const result = await generateDailySummary(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
      else if (url.includes('summary/daily')) {
        let sessions = null;
        if (isMongoConnected) {
          sessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(1000).lean();
        }
        const summaries = generateDailySummary(sessions);
        const todayStr = new Date().toISOString().split('T')[0];
        const summary = summaries[todayStr] || { date: todayStr, study: { totalSeconds: 0, topTopic: 'None', sessionsCount: 0, allTopics: [], topicBreakdown: {} }, jobs: { newCount: 0, topMatches: [] } };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(summary));
      }
      else if (url === '/api/profile/sync' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { platform } = JSON.parse(body);

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
        let body = '';
        for await (const chunk of req) body += chunk;
        const { topicId, stats } = JSON.parse(body || '{}');
        if (!topicId || !stats) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'topicId and stats are required' }));
          return;
        }
        if (isMongoConnected) {
          const profile = await UserProfile.findOne({ userId }).lean();
          const topics = Array.isArray(profile?.studyPlanTopics) ? [...profile.studyPlanTopics] : [];
          const index = topics.findIndex(t => t.topicId === topicId);
          const retentionTopic = {
            ...(index >= 0 ? topics[index] : {}),
            topicId,
            topic: String(topicId).replace(/[_-]+/g, ' '),
            confidence: Number(stats.confidence || 0),
            nextReview: stats.nextReview ? new Date(stats.nextReview) : undefined,
            interval: Number(stats.interval || 0),
            easeFactor: Number(stats.easeFactor || 2.5)
          };
          if (index >= 0) topics[index] = retentionTopic;
          else topics.push(retentionTopic);
          await UserProfile.findOneAndUpdate({ userId }, { userId, studyPlanTopics: topics, updatedAt: new Date() }, { upsert: true });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, studyPlanTopics: topics }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, studyPlanTopics: [] }));
        }
      }
      else if (url.includes('profile/save') && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { _id, __v, createdAt, ...profileData } = JSON.parse(body || '{}');

        // Fetch existing for merging
        let existing = null;
        if (isMongoConnected) {
          existing = await UserProfile.findOne({ userId }).lean();
        }

        let mergedSkills = existing ? [...new Set([...(existing.skills || []), ...normalizeList(profileData.skills)])] : normalizeList(profileData.skills);
        let mergedCerts = existing ? [...new Set([...(existing.certifications || []), ...normalizeList(profileData.certifications)])] : normalizeList(profileData.certifications);
        let mergedMissing = existing ? [...new Set([...(existing.missingSkills || []), ...normalizeList(profileData.missingSkills)])] : normalizeList(profileData.missingSkills);

        let platforms = existing?.platforms || {};
        if (profileData.platform === 'LinkedIn') platforms.linkedin = { synced: true, lastSync: new Date() };
        if (profileData.platform === 'Naukri') platforms.naukri = { synced: true, lastSync: new Date() };

        let rawExtraction = existing?.rawExtraction || {};
        if (profileData.platform === 'LinkedIn') { rawExtraction.linkedinSkills = profileData.skills; rawExtraction.linkedinCerts = profileData.certifications; }
        if (profileData.platform === 'Naukri') { rawExtraction.naukriSkills = profileData.skills; rawExtraction.naukriCerts = profileData.certifications; }

        if (isMongoConnected) {
          const normalizedProfile = {
            ...profileData,
            userId,
            platforms,
            skills: mergedSkills,
            experienceYears: clampExperienceYears(profileData.experienceYears || existing?.experienceYears || 1),
            currentDesignation: profileData.currentDesignation || existing?.currentDesignation,
            targetDesignation: profileData.targetDesignation || existing?.targetDesignation,
            currentRole: profileData.currentRole || profileData.currentDesignation || existing?.currentRole,
            targetRole: profileData.targetRole || profileData.targetDesignation || existing?.targetRole,
            uiMode: profileData.uiMode === 'classic' ? 'classic' : 'modern',
            certifications: mergedCerts,
            clouds: normalizeList(profileData.clouds || existing?.clouds),
            tools: normalizeList(profileData.tools || existing?.tools),
            domains: normalizeList(profileData.domains || existing?.domains),
            jobPreferences: profileData.jobPreferences || existing?.jobPreferences,
            profileImports: profileData.profileImports || existing?.profileImports || [],
            missingSkills: mergedMissing,
            studyPlan: profileData.studyPlan || existing?.studyPlan,
            studyPlanTopics: (profileData.studyPlanTopics && profileData.studyPlanTopics.length > 0) ? profileData.studyPlanTopics : (existing?.studyPlanTopics || []),
            rawExtraction,
            updatedAt: new Date()
          };
          const intelligence = buildPremiumRoadmap(normalizedProfile);
          normalizedProfile.roadmapSnapshot = intelligence.roadmap;
          normalizedProfile.releaseFocus = intelligence.releaseFocus;
          const profile = await UserProfile.findOneAndUpdate(
            { userId },
            normalizedProfile,
            { upsert: true, new: true }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile }));
        } else {
          // Fallback: save to local cache
          const intelligence = buildPremiumRoadmap(profileData);
          const cachePath = path.join(CACHE_DIR, 'profile-sync.json');
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(cachePath, JSON.stringify({ ...profileData, skills: mergedSkills, certifications: mergedCerts, missingSkills: mergedMissing, platforms, rawExtraction, roadmapSnapshot: intelligence.roadmap, releaseFocus: intelligence.releaseFocus }, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile: profileData }));
        }
      }
      else if (url === '/api/profile/import' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || '{}');
        const extracted = extractProfileImportFields(payload.text || payload.profileText || '');
        if (!extracted.rawText) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Profile text is required' }));
          return;
        }
        const existing = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const { _id, __v, createdAt, ...existingBase } = existing || {};
        const nextProfile = {
          ...existingBase,
          userId,
          skills: [...new Set([...(existing?.skills || []), ...extracted.skills])],
          certifications: [...new Set([...(existing?.certifications || []), ...extracted.certifications])],
          experienceYears: extracted.experienceYears || existing?.experienceYears || 1,
          currentDesignation: extracted.currentDesignation || existing?.currentDesignation || existing?.currentRole,
          targetDesignation: payload.targetDesignation || existing?.targetDesignation || existing?.targetRole || extracted.currentDesignation,
          currentRole: extracted.currentDesignation || existing?.currentRole || existing?.currentDesignation,
          targetRole: payload.targetDesignation || existing?.targetRole || existing?.targetDesignation || extracted.currentDesignation,
          uiMode: existing?.uiMode || 'modern',
          profileImports: [...(existing?.profileImports || []).slice(-4), { source: String(payload.source || 'manual').slice(0, 40), text: extracted.rawText, importedAt: new Date() }],
          updatedAt: new Date()
        };
        const intelligence = buildPremiumRoadmap(nextProfile);
        nextProfile.roadmapSnapshot = intelligence.roadmap;
        nextProfile.releaseFocus = intelligence.releaseFocus;
        if (isMongoConnected) await UserProfile.findOneAndUpdate({ userId }, nextProfile, { upsert: true, new: true });
        else {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(path.join(CACHE_DIR, 'profile-sync.json'), JSON.stringify(nextProfile, null, 2));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, extractedData: extracted, intelligence }));
      }
      else if (url === '/api/roadmap' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const fallbackPath = path.join(CACHE_DIR, 'profile-sync.json');
        const fallbackProfile = !profile && fs.existsSync(fallbackPath) ? JSON.parse(fs.readFileSync(fallbackPath, 'utf8')) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...buildPremiumRoadmap(profile || fallbackProfile) }));
      }
      else if (url === '/api/releases/current' && method === 'GET') {
        const profile = isMongoConnected ? await UserProfile.findOne({ userId }).lean() : null;
        const fallbackReleases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
        const allReleases = await readReleaseCenterPayload(fallbackReleases);
        const intelligence = buildPremiumRoadmap(profile || {});
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
        const challenge = getCodePracticeChallenge(body.challengeId);
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
        if (isMongoConnected) {
          const profile = await UserProfile.findOne({ userId }).lean();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ exists: !!profile, profile }));
        } else {
          // Fallback: read from local cache
          const cachePath = path.join(CACHE_DIR, 'profile-sync.json');
          if (fs.existsSync(cachePath)) {
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ exists: true, profile: data }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ exists: false, profile: null }));
          }
        }
      }
      else if (url.includes('profile/match') && method === 'GET') {
        let profile = null;
        if (isMongoConnected) {
          profile = await UserProfile.findOne({ userId }).lean();
        } else {
          const cachePath = path.join(CACHE_DIR, 'profile-sync.json');
          if (fs.existsSync(cachePath)) profile = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        }
        if (!profile) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasProfile: false, match: null }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasProfile: true, match: { strengths: [], gaps: (profile.missingSkills || []).map(s => ({ skill: s, demandCount: 0 })), topCompanies: [], totalJobsAnalyzed: 0, profileSkillCount: (profile.skills || []).length, certCount: (profile.certifications || []).length } }));
        }
      }
      else if (url === '/api/jobs/apply' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { hash } = JSON.parse(body);
        
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
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || '{}');
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

  if (url.includes('summary/all') && method === 'GET') {
    try {
      let sessions = null;
      if (isMongoConnected) {
        sessions = await StudySession.find().sort({ startTime: -1 }).limit(1000).lean();
      }
      const summaries = generateDailySummary(sessions);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summaries));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to fetch history' }));
    }
    return;
  }

  if (url.includes('ai/interview') && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { prompt, topic, difficulty } = JSON.parse(body);
        
        // Construct a specialized system prompt for the interview
        const systemPrompt = `You are a Senior Salesforce Technical Interviewer. 
        Topic: ${topic}. Difficulty: ${difficulty}.
        Conduct a realistic interview. Ask one technical question at a time. 
        When the user answers, provide brief feedback (Score 1-10) and then ask the next follow-up question.
        Be professional and challenging. 
        User Input: ${prompt}`;

        const ollamaRes = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          body: JSON.stringify({
            model: 'gemma:2b', // or gemma:7b based on user's setup
            prompt: systemPrompt,
            stream: false
          })
        });

        if (!ollamaRes.ok) throw new Error('Ollama not responding');
        const aiData = await ollamaRes.json();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: aiData.response }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'AI engine unavailable. Make sure Ollama is running with Gemma.' }));
      }
    });
    return;
  }

  if (url === '/api/profile/sync' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { platform } = JSON.parse(body);
        const { exec } = await import('child_process');
        
        exec(`node src/tools/syncProfile.js ${platform || 'LinkedIn'}`, (error, stdout, stderr) => {
           if (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
           } else {
              let studyPlan = 'No plan generated.';
              try {
                const planPath = path.resolve(process.cwd(), 'TAILORED_STUDY_PLAN.md');
                if (fs.existsSync(planPath)) {
                   studyPlan = fs.readFileSync(planPath, 'utf8');
                }
              } catch (e) {
                console.error("Error reading study plan", e);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, studyPlan, logs: stdout }));
           }
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url === '/api/study/reset' && method === 'POST') {
    try {
      const emptyTracker = { sessions: [], completedTasks: [], topics: {} };
      fs.writeFileSync(path.join(CACHE_DIR, 'study-tracker.json'), JSON.stringify(emptyTracker, null, 2));
      fs.writeFileSync(path.join(CACHE_DIR, 'daily-summaries.json'), JSON.stringify({}, null, 2));
      
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to reset' }));
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
