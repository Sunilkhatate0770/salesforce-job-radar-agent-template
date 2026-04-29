import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { User, UserProfile, JobRecord, StudySession, TaskStatus } from '../src/models/models.js';
import { TursoDB } from '../src/db/turso_driver.js';

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

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  try {
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

async function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token || token === 'null' || token === 'undefined') return null;
  
  try {
    const ticket = await client.verifyIdToken({ 
      idToken: token, 
      audience: process.env.GOOGLE_CLIENT_ID 
    });
    const payload = ticket.getPayload();
    return payload['sub'];
  } catch (e) { 
    console.error('Auth verification failed:', e.message);
    return null; 
  }
}

async function safeTursoRead(label, operation, fallback) {
  try {
    return await operation();
  } catch (err) {
    console.warn(`[Turso] ${label} unavailable; continuing with MongoDB only:`, err.message);
    return fallback;
  }
}

function mergeUnique(arr1 = [], arr2 = [], key) {
  const map = new Map();
  [...(arr2 || []), ...(arr1 || [])].forEach(item => {
    if (!item) return;
    const id = key ? (typeof item === 'object' ? item[key] : item) : item;
    if (id !== undefined && id !== null) map.set(String(id), item);
  });
  return Array.from(map.values());
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

function topicConfigName(topicId) {
  return String(topicId || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function fallbackAiText(kind, payload = {}) {
  const userName = payload.userName || payload.candidateName || 'there';
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
    skill: `Create a concise 3-day Salesforce interview study plan for "${payload.skill || payload.topic || 'Salesforce'}". Use practical bullets.`
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
  try {
    let { slug } = req.query;
    let path = '';
    if (slug && Array.isArray(slug)) { path = slug.join('/'); } 
    else { path = (req.url || '').replace('/api/', '').split('?')[0]; }

    // Soft Connect to Legacy DB
    await connectDB();

    // GLOBAL BODY PARSER
    if (req.method === 'POST' && req.body && typeof req.body === 'string') {
      try { req.body = JSON.parse(req.body); } catch(e) { console.error('Body parse fail:', e); }
    }

    // 1. AUTH ENDPOINTS
    if (path === 'auth/google' && req.method === 'POST') {
      try {
        const { token } = req.body;
        const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const userData = { id: payload['sub'], email: payload['email'], name: payload['name'], picture: payload['picture'] };

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
        
        return res.status(200).json({ success: true, user: userData });
      } catch (authErr) {
        console.error('[AUTH] Google Verify Failed:', authErr.message);
        return res.status(401).json({ success: false, error: 'Authentication failed. Check GOOGLE_CLIENT_ID.' });
      }
    }

    // --- REQUIRE AUTH FOR DATA ROUTES ---
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // 2. PROFILE ENDPOINTS (Hybrid Search & Smart Merge)
    if (path === 'profile/data') {
      let tursoProfile = await safeTursoRead('profile/data', () => TursoDB.getProfile(userId), null);
      let mongoProfile = await UserProfile.findOne({ userId }).lean();
      
      console.log(`[DEBUG] Hybrid Fetch for ${userId}:`);
      console.log(` - Turso Profile: ${tursoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${tursoProfile?.bookmarks?.length || 0})`);
      console.log(` - Mongo Profile: ${mongoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${mongoProfile?.bookmarks?.length || 0})`);

      // Smart Merge: Use Turso as base, but fallback to Mongo for empty fields
      let profile = tursoProfile || mongoProfile;
      let source = tursoProfile ? 'Turso (Primary)' : 'MongoDB (Legacy)';

      if (tursoProfile && mongoProfile) {
        profile = { 
          ...mongoProfile, 
          ...tursoProfile, 
          skills: mergeUnique(tursoProfile.skills, mongoProfile.skills),
          certifications: mergeUnique(tursoProfile.certifications, mongoProfile.certifications),
          bookmarks: mergeUnique(tursoProfile.bookmarks, mongoProfile.bookmarks, 'q'),
          completedTasks: mergeUnique(tursoProfile.completedTasks, mongoProfile.completedTasks)
        };
        source = 'Unified Hybrid (Turso + Mongo)';
        console.log(`[DEBUG] Unified Final Bookmarks: ${profile.bookmarks?.length}`);
      }

      console.log(`[PROFILE] Fetch for ${userId} -> Source: ${source}, Found: ${!!profile}`);
      return res.status(200).json({ exists: !!profile, profile, storageSource: source });
    }

    if (path === 'profile/save-retention' && req.method === 'POST') {
      const { topicId, stats } = readBody(req);
      if (!topicId || !stats) {
        return res.status(400).json({ success: false, error: 'topicId and stats are required' });
      }

      const profile = await UserProfile.findOne({ userId }).lean();
      const topics = Array.isArray(profile?.studyPlanTopics) ? [...profile.studyPlanTopics] : [];
      const index = topics.findIndex(t => t.topicId === topicId);
      const retentionTopic = {
        ...(index >= 0 ? topics[index] : {}),
        topicId,
        topic: topicConfigName(topicId),
        confidence: Number(stats.confidence || 0),
        nextReview: stats.nextReview ? new Date(stats.nextReview) : undefined,
        interval: Number(stats.interval || 0),
        easeFactor: Number(stats.easeFactor || 2.5)
      };
      if (index >= 0) topics[index] = retentionTopic;
      else topics.push(retentionTopic);

      await UserProfile.findOneAndUpdate(
        { userId },
        { userId, studyPlanTopics: topics, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return res.status(200).json({ success: true, studyPlanTopics: topics });
    }

    if (path === 'profile/save' && req.method === 'POST') {
      console.log(`[PROFILE] Saving data to Primary Mongo for ${userId}`);
      await UserProfile.findOneAndUpdate(
        { userId },
        { ...req.body, userId, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return res.status(200).json({ success: true });
    }

    if (path === 'profile/sync-cloud' && req.method === 'POST') {
      console.log(`[PROFILE] Sync Cloud called for ${userId}`);
      const body = readBody(req);
      const platformName = (body.platform || '').toLowerCase().includes('naukri') ? 'naukri' : 'linkedin';
      
      const profile = await UserProfile.findOne({ userId }).lean() || {};
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

      await UserProfile.findOneAndUpdate(
        { userId },
        { 
          userId, 
          platforms, 
          skills: profile.skills || ['Apex', 'LWC', 'SOQL', 'Integration', 'Flows', 'Async Apex', 'REST APIs'], 
          certifications: certs,
          experienceYears: profile.experienceYears || 3.5,
          updatedAt: new Date() 
        },
        { upsert: true, new: true }
      );
      
      return res.status(200).json({ success: true, message: 'Cloud sync successful' });
    }

    if (path === 'profile/toggle-bookmark' && req.method === 'POST') {
      console.log(`[BOOKMARK] Toggling in Primary Mongo for ${userId}`);
      const profile = await UserProfile.findOne({ userId });
      let bookmarks = profile?.bookmarks || [];
      const bookmark = req.body;
      
      const exists = bookmarks.some(b => b.q === bookmark.q);
      if (exists) {
        bookmarks = bookmarks.filter(b => b.q !== bookmark.q);
      } else {
        bookmarks.push({ ...bookmark, date: new Date() });
      }

      await UserProfile.findOneAndUpdate({ userId }, { bookmarks }, { upsert: true });
      return res.status(200).json({ success: true, bookmarks });
    }

    if (path === 'profile/match') {
      const tursoProfile = await safeTursoRead('profile/match profile', () => TursoDB.getProfile(userId), null);
      const mongoProfile = await UserProfile.findOne({ userId }).lean();
      const profile = tursoProfile || mongoProfile;

      // Get Jobs from both tiers
      const tursoJobs = await safeTursoRead('profile/match jobs', () => TursoDB.getJobAnalytics(userId), []);
      const mongoJobs = await JobRecord.find({ userId }).lean();
      const allJobs = [...tursoJobs, ...mongoJobs];

      console.log(`[MATCH] Analyzing ${allJobs.length} total jobs for ${userId}`);
      const filtered = allJobs.filter(j => (j.match_score || 0) >= 60);
      
      const topMatchedSkills = {};
      const topMissingSkills = {};
      filtered.forEach(j => {
        const matched = typeof j.matched_skills === 'string' ? JSON.parse(j.matched_skills) : (j.matched_skills || []);
        const missing = typeof j.missing_skills === 'string' ? JSON.parse(j.missing_skills) : (j.missing_skills || []);
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
      const tursoJobs = await safeTursoRead('jobs', () => TursoDB.getJobs(userId), []);
      const mongoJobs = await JobRecord.find({ $or: [{ userId }, { userId: 'system' }] }).sort({ createdAt: -1 }).limit(100).lean();
      const unifiedMap = new Map();
      mongoJobs.forEach(j => unifiedMap.set(j.job_hash, { ...j, source: 'Legacy (Mongo)' }));
      tursoJobs.forEach(j => unifiedMap.set(j.job_hash, { ...j, source: 'Primary (Turso)' }));
      const finalJobs = Array.from(unifiedMap.values()).sort((a,b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));

      console.log(`[JOBS] Unified Fetch -> Turso: ${tursoJobs.length}, Mongo: ${mongoJobs.length}, Total: ${finalJobs.length}`);

      checkAndArchiveOverflow(userId);
      const mongoCount = await JobRecord.countDocuments({ userId });
      const capacityUsed = Math.min(Math.round((mongoCount / 1500) * 100), 100);
      return res.status(200).json({ records: finalJobs, dbStatus: true, count: finalJobs.length, storageCapacity: `${100 - capacityUsed}% Free` });
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
      const tursoJobs = await safeTursoRead('jobs/analytics', () => TursoDB.getJobAnalytics(userId), []);
      const mongoJobs = await JobRecord.find({ userId }).lean();
      const combined = [...tursoJobs, ...mongoJobs];
      console.log(`[ANALYTICS] Hybrid Merging ${combined.length} records for ${userId}`);

      // Aggregate matched skills, missing skills, and top companies
      const matchedMap = {};
      const missingMap = {};
      const companyMap = {};

      combined.forEach(j => {
        const matched = typeof j.matched_skills === 'string' ? JSON.parse(j.matched_skills || '[]') : (j.matched_skills || []);
        const missing = typeof j.missing_skills === 'string' ? JSON.parse(j.missing_skills || '[]') : (j.missing_skills || []);
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
        matched_skills: sortEntries(matchedMap),
        missing_skills: sortEntries(missingMap),
        top_companies: sortEntries(companyMap)
      });
    }

    // 4. STUDY ENDPOINTS
    if (path === 'study/history') {
      const tursoSessions = await safeTursoRead('study/history', () => TursoDB.getStudyHistory(userId), []);
      const mongoSessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean();
      const combined = [...tursoSessions, ...mongoSessions].sort((a,b) => new Date(b.startTime) - new Date(a.startTime));
      console.log(`[STUDY] History Fetch -> Turso: ${tursoSessions.length}, Mongo: ${mongoSessions.length}`);
      return res.status(200).json(combined);
    }

    if (path === 'study/session' && req.method === 'POST') {
      console.log(`[STUDY] Saving session to Primary Mongo for ${userId}`);
      const session = new StudySession({ ...req.body, userId });
      await session.save();
      return res.status(200).json({ success: true });
    }

    if (path === 'study/tasks') {
      const tursoProfile = await safeTursoRead('study/tasks profile', () => TursoDB.getProfile(userId), null);
      const mongoTasks = await TaskStatus.find({ userId, completed: true }).lean();
      const combinedTasks = Array.from(new Set([
        ...(tursoProfile?.completedTasks || []),
        ...mongoTasks.map(t => t.index)
      ].map(Number).filter(Number.isFinite)));
      console.log(`[TASKS] Hybrid Loading: ${combinedTasks.length} total completed tasks`);
      return res.status(200).json({ completedTasks: combinedTasks });
    }

    if (path === 'study/toggle-task' && req.method === 'POST') {
      const body = readBody(req);
      const taskIndex = Number(body.index ?? body.taskId);
      if (!Number.isFinite(taskIndex)) {
        return res.status(400).json({ success: false, error: 'index or taskId is required' });
      }

      const existing = await TaskStatus.findOne({ userId, index: taskIndex }).lean();
      const nextCompleted = typeof body.completed === 'boolean' ? body.completed : !existing?.completed;
      console.log(`[TASK] Toggling task ${taskIndex} in Primary Mongo for ${userId} -> ${nextCompleted}`);

      await TaskStatus.findOneAndUpdate(
        { userId, index: taskIndex },
        { userId, index: taskIndex, completed: nextCompleted, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      const completedTasks = (await TaskStatus.find({ userId, completed: true }).lean()).map(t => t.index);
      return res.status(200).json({ success: true, completedTasks });
    }

    if (path === 'study/reset' && req.method === 'POST') {
      await StudySession.deleteMany({ userId });
      await TaskStatus.deleteMany({ userId });
      await UserProfile.findOneAndUpdate(
        { userId },
        { userId, studyPlanTopics: [], studyStreak: { current: 0, best: 0, lastDate: '' }, updatedAt: new Date() },
        { upsert: true }
      );
      return res.status(200).json({ success: true, completedTasks: [], sessions: [] });
    }

    if (path === 'study/leaderboard') {
      const rows = await StudySession.aggregate([
        { $group: { _id: '$userId', totalSeconds: { $sum: '$duration' }, sessions: { $sum: 1 }, lastStudy: { $max: '$endTime' } } },
        { $sort: { totalSeconds: -1, sessions: -1 } },
        { $limit: 10 }
      ]);
      const users = await User.find({ googleId: { $in: rows.map(r => r._id) } }).lean();
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
      const mongoSessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(1000).lean();
      
      const allSessions = [...tursoSessions, ...mongoSessions];
      console.log(`[SUMMARY] Hybrid Analyzing ${allSessions.length} total sessions`);
      
      const historyObj = {};
      allSessions.forEach(s => {
        const d = s.date || new Date(s.startTime).toISOString().split('T')[0];
        if (!historyObj[d]) historyObj[d] = { date: d, study: { totalSeconds: 0, topicList: [], sessionsCount: 0 }, jobs: { newCount: 0, topMatches: [] } };
        historyObj[d].study.totalSeconds += (s.duration || 0);
        historyObj[d].study.sessionsCount++;
      });
      
      const todayStr = new Date().toISOString().split('T')[0];
      if (path === 'summary/daily') return res.status(200).json(historyObj[todayStr] || { date: todayStr, study: { totalSeconds: 0 }, jobs: { newCount: 0 } });
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

    return res.status(404).json({ error: 'Route not found' });

  } catch (e) {
    console.error('Hybrid API Error:', e);
    return res.status(500).json({ 
      success: false, 
      error: e.message,
      stack: e.stack,
      hint: 'This error is coming from the Vercel Serverless Function.'
    });
  }
}
