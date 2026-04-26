import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { UserProfile, JobRecord, StudySession } from '../src/models/models.js';
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

async function checkAndArchiveOverflow(userId) {
  try {
    // 1. ARCHIVE JOBS
    const MAX_MONGO_JOBS = 1500;
    const jobCount = await JobRecord.countDocuments({ userId });
    if (jobCount > MAX_MONGO_JOBS) {
      console.log(`[Vacuum] Jobs limit reached (${jobCount}/1500). Archiving 500...`);
      const toMove = await JobRecord.find({ userId, status: 'ignored' }).sort({ createdAt: 1 }).limit(500).lean();
      if (toMove.length > 0) {
        for (const job of toMove) await TursoDB.saveJob(userId, job);
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
        for (const s of sessionsToMove) await TursoDB.saveStudySession(userId, s);
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
      let tursoProfile = await TursoDB.getProfile(userId);
      let mongoProfile = await UserProfile.findOne({ userId }).lean();
      
      console.log(`[DEBUG] Hybrid Fetch for ${userId}:`);
      console.log(` - Turso Profile: ${tursoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${tursoProfile?.bookmarks?.length || 0})`);
      console.log(` - Mongo Profile: ${mongoProfile ? 'FOUND' : 'NOT FOUND'} (Bookmarks: ${mongoProfile?.bookmarks?.length || 0})`);

      // Smart Merge: Use Turso as base, but fallback to Mongo for empty fields
      let profile = tursoProfile || mongoProfile;
      let source = tursoProfile ? 'Turso (Primary)' : 'MongoDB (Legacy)';

      if (tursoProfile && mongoProfile) {
        // Smart Merge Arrays: Deduplicate by content
        const mergeUnique = (arr1, arr2, key) => {
          const map = new Map();
          // Process Mongo first, then Turso (Turso overwrites if duplicate)
          [...(arr2 || []), ...(arr1 || [])].forEach(item => {
            if (!item) return;
            const id = key ? (typeof item === 'object' ? item[key] : item) : item;
            if (id) map.set(id, item);
          });
          return Array.from(map.values());
        };
        
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

    if (path === 'profile/save' && req.method === 'POST') {
      console.log(`[PROFILE] Saving data to Primary Mongo for ${userId}`);
      await UserProfile.findOneAndUpdate(
        { userId },
        { ...req.body, userId, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return res.status(200).json({ success: true });
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
      const tursoProfile = await TursoDB.getProfile(userId);
      const mongoProfile = await UserProfile.findOne({ userId }).lean();
      const profile = tursoProfile || mongoProfile;

      // Get Jobs from both tiers
      const tursoJobs = await TursoDB.getJobAnalytics(userId);
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
      const tursoJobs = await TursoDB.getJobs(userId);
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

    if (path === 'jobs/analytics') {
      const tursoJobs = await TursoDB.getJobAnalytics(userId);
      const mongoJobs = await JobRecord.find({ userId }).lean();
      const combined = [...tursoJobs, ...mongoJobs];
      console.log(`[ANALYTICS] Hybrid Merging ${combined.length} records for ${userId}`);
      return res.status(200).json(combined);
    }

    // 4. STUDY ENDPOINTS
    if (path === 'study/history') {
      const tursoSessions = await TursoDB.getStudyHistory(userId);
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
      const tursoProfile = await TursoDB.getProfile(userId);
      const mongoProfile = await UserProfile.findOne({ userId }).lean();
      const combinedTasks = Array.from(new Set([
        ...(tursoProfile?.completedTasks || []),
        ...(mongoProfile?.completedTasks || [])
      ]));
      console.log(`[TASKS] Hybrid Loading: ${combinedTasks.length} total completed tasks`);
      return res.status(200).json({ completedTasks: combinedTasks });
    }

    if (path === 'study/toggle-task' && req.method === 'POST') {
      const { taskId, completed } = req.body;
      console.log(`[TASK] Toggling task ${taskId} in Primary Mongo for ${userId}`);
      
      const profile = await UserProfile.findOne({ userId });
      let tasks = profile?.completedTasks || [];
      if (completed) {
        if (!tasks.includes(taskId)) tasks.push(taskId);
      } else {
        tasks = tasks.filter(id => id !== taskId);
      }
      
      await UserProfile.findOneAndUpdate({ userId }, { completedTasks: tasks }, { upsert: true });
      return res.status(200).json({ success: true, completedTasks: tasks });
    }

    // 5. SUMMARY ENDPOINTS (Hybrid History)
    if (path === 'summary/daily' || path === 'summary/all') {
      const tursoSessions = await TursoDB.getFullHistory(userId);
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
