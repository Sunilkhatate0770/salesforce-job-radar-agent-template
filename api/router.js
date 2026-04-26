import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { UserProfile, JobRecord, StudySession } from '../src/models/models.js';
import { TursoDB } from '../src/db/turso_driver.js';

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
    const MAX_MONGO_JOBS = 1500;
    const count = await JobRecord.countDocuments({ userId });
    
    if (count > MAX_MONGO_JOBS) {
      console.log(`[Vacuum] MongoDB reaching limit (${count}/1500). Moving 500 records to Turso Tier...`);
      
      const toMove = await JobRecord.find({ userId, status: 'ignored' })
        .sort({ createdAt: 1 })
        .limit(500)
        .lean();
        
      if (toMove.length > 0) {
        // Migration Loop
        for (const job of toMove) {
          await TursoDB.saveJob(userId, job);
        }
        
        const ids = toMove.map(j => j._id);
        await JobRecord.deleteMany({ _id: { $in: ids } });
        console.log(`[Vacuum] Successfully migrated 500 records. MongoDB space cleared.`);
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
      
      // Smart Merge: Use Turso as base, but fallback to Mongo for empty fields
      let profile = tursoProfile || mongoProfile;
      let source = tursoProfile ? 'Turso (Primary)' : 'MongoDB (Legacy)';

      if (tursoProfile && mongoProfile) {
        // Smart Merge Arrays: Deduplicate by content, not just reference
        const mergeUnique = (arr1, arr2, key) => {
          const map = new Map();
          [...(arr1 || []), ...(arr2 || [])].forEach(item => {
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
      }

      console.log(`[PROFILE] Fetch for ${userId} -> Source: ${source}, Found: ${!!profile}`);
      return res.status(200).json({ exists: !!profile, profile, storageSource: source });
    }

    if (path === 'profile/save' && req.method === 'POST') {
      console.log(`[PROFILE] Saving data for ${userId}`);
      await TursoDB.saveProfile(userId, req.body);
      return res.status(200).json({ success: true });
    }

    if (path === 'profile/toggle-bookmark' && req.method === 'POST') {
      console.log(`[BOOKMARK] Toggling for ${userId}`);
      const bookmarks = await TursoDB.toggleBookmark(userId, req.body);
      return res.status(200).json({ success: true, bookmarks });
    }

    if (path === 'profile/match') {
      const profile = await TursoDB.getProfile(userId);
      const jobs = await TursoDB.getJobAnalytics(userId);
      console.log(`[MATCH] Analyzing ${jobs.length} jobs for ${userId}`);
      const filtered = jobs.filter(j => (j.match_score || 0) >= 60);
      const topMatchedSkills = {};
      const topMissingSkills = {};
      filtered.forEach(j => {
        const matched = typeof j.matched_skills === 'string' ? JSON.parse(j.matched_skills) : (j.matched_skills || []);
        const missing = typeof j.missing_skills === 'string' ? JSON.parse(j.missing_skills) : (j.missing_skills || []);
        matched.forEach(s => topMatchedSkills[s] = (topMatchedSkills[s] || 0) + 1);
        missing.forEach(s => topMissingSkills[s] = (topMissingSkills[s] || 0) + 1);
      });
      const sortSkills = (obj) => Object.entries(obj).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([k,v]) => ({ _id: k, count: v }));
      return res.status(200).json({ exists: !!profile, profile, matched_skills: sortSkills(topMatchedSkills), missing_skills: sortSkills(topMissingSkills) });
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
      const jobs = await TursoDB.getJobAnalytics(userId);
      console.log(`[ANALYTICS] Returning ${jobs.length} records for ${userId}`);
      return res.status(200).json(jobs);
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
      console.log(`[STUDY] Saving new session for ${userId}`);
      await TursoDB.saveStudySession(userId, req.body);
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
      const tasks = await TursoDB.toggleTask(userId, taskId, completed);
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
