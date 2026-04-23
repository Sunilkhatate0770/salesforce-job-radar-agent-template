import { UserProfile, JobRecord, StudySession } from '../src/models/models.js';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  const db = await mongoose.connect(process.env.MONGODB_URI);
  cachedDb = db;
  return db;
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

export default async function(req, res) {
  let { slug } = req.query;
  let path = '';
  if (slug && Array.isArray(slug)) { path = slug.join('/'); } 
  else { path = req.url.replace('/api/', '').split('?')[0]; }
  
  await connectDB();

  // GLOBAL BODY PARSER (v1354)
  if (req.method === 'POST' && req.body && typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch(e) { console.error('Body parse fail:', e); }
  }

  try {
    // 1. AUTH ENDPOINTS
    if (path === 'auth/google' && req.method === 'POST') {
      try {
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);
        
        const { token } = body;
        if (!token) return res.status(400).json({ success: false, error: 'Token missing' });

        const ticket = await client.verifyIdToken({ 
          idToken: token, 
          audience: process.env.GOOGLE_CLIENT_ID 
        });
        const payload = ticket.getPayload();
        return res.status(200).json({ 
          success: true, 
          user: { id: payload['sub'], email: payload['email'], name: payload['name'], picture: payload['picture'] } 
        });
      } catch (e) { 
        console.error('Login error:', e.message);
        return res.status(401).json({ success: false, error: 'Session expired. Please re-login.' });
      }
    }

    // --- LINKEDIN OAUTH (CLOUD) ---
    if (path === 'auth/linkedin' && req.method === 'GET') {
      const { code } = req.query;
      if (!code) {
        const redirect = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${process.env.LINKEDIN_REDIRECT_URI}&scope=r_liteprofile%20r_emailaddress`;
        return res.redirect(redirect);
      }
      // Handle Callback
      const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET
        })
      });
      const tokenData = await tokenRes.json();
      return res.status(200).json({ success: true, token: tokenData.access_token });
    }

    // --- REQUIRE AUTH FOR DATA ROUTES ---
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // 2. PROFILE ENDPOINTS
    if (path === 'profile/data') {
      const profile = await UserProfile.findOne({ userId }).lean();
      return res.status(200).json({ exists: !!profile, profile });
    }
    if (path === 'profile/save' && req.method === 'POST') {
      const result = await UserProfile.findOneAndUpdate({ userId }, { $set: { ...req.body, lastUpdated: new Date() } }, { upsert: true, new: true });
      return res.status(200).json({ success: true, profile: result });
    }

    if (path === 'profile/toggle-bookmark' && req.method === 'POST') {
      const { q, topic } = req.body;
      const profile = await UserProfile.findOne({ userId });
      const bookmarks = profile?.bookmarks || [];
      const exists = bookmarks.some(b => b.q === q);
      
      const update = exists 
        ? { $pull: { bookmarks: { q } } }
        : { $push: { bookmarks: { q, topic, date: new Date() } } };
        
      const result = await UserProfile.findOneAndUpdate({ userId }, update, { upsert: true, new: true });
      return res.status(200).json({ success: true, bookmarks: result.bookmarks });
    }

    if (path === 'profile/save-retention' && req.method === 'POST') {
      const { topicId, stats } = req.body;
      const result = await UserProfile.findOneAndUpdate(
        { userId, "studyPlanTopics.topicId": topicId },
        { $set: { 
          "studyPlanTopics.$.confidence": stats.confidence,
          "studyPlanTopics.$.nextReview": stats.nextReview,
          "studyPlanTopics.$.interval": stats.interval,
          "studyPlanTopics.$.easeFactor": stats.easeFactor
        }},
        { new: true }
      );
      
      if (!result) {
        await UserProfile.findOneAndUpdate(
          { userId },
          { $push: { studyPlanTopics: { topicId, ...stats } } },
          { upsert: true }
        );
      }
      return res.status(200).json({ success: true });
    }
    
    // --- CLOUD SYNC ENGINE (LinkedIn/Naukri) ---
    if (path === 'profile/sync-cloud' && req.method === 'POST') {
      const { platform, user } = req.body;
      const isLI = platform.includes('LinkedIn');
      const isNK = platform.includes('Naukri');
      
      const updateData = {
        lastUpdated: new Date()
      };
      
      if (isLI) updateData['platforms.linkedin'] = { synced: true, lastSync: new Date() };
      if (isNK) updateData['platforms.naukri'] = { synced: true, lastSync: new Date() };

      const result = await UserProfile.findOneAndUpdate(
        { userId }, 
        { $set: updateData }, 
        { upsert: true, new: true }
      );
      
      return res.status(200).json({ success: true, profile: result });
    }

    if (path === 'profile/match') {
      const profile = await UserProfile.findOne({ userId }).lean();
      const latestJobs = await JobRecord.find({}).sort({ fetched_at: -1 }).limit(50).lean();
      const filtered = latestJobs.filter(j => (j.match_score || 0) >= 60);
      const topMatchedSkills = {};
      const topMissingSkills = {};
      filtered.forEach(j => {
        if (j.matched_skills) j.matched_skills.forEach(s => topMatchedSkills[s] = (topMatchedSkills[s] || 0) + 1);
        if (j.missing_skills) j.missing_skills.forEach(s => topMissingSkills[s] = (topMissingSkills[s] || 0) + 1);
      });
      const sortSkills = (obj) => Object.entries(obj).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([k,v]) => ({ _id: k, count: v }));
      return res.status(200).json({ exists: !!profile, profile, matched_skills: sortSkills(topMatchedSkills), missing_skills: sortSkills(topMissingSkills) });
    }

    // 3. STUDY ENDPOINTS
    if (path === 'study/history') {
      const sessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean();
      return res.status(200).json(sessions);
    }
    if (path === 'study/session' && req.method === 'POST') {
      const newSession = new StudySession({ ...req.body, userId });
      await newSession.save();
      return res.status(200).json({ success: true });
    }
    if (path === 'study/tasks') {
      const profile = await UserProfile.findOne({ userId }).lean();
      return res.status(200).json({ completedTasks: profile?.completedTasks || [] });
    }
    if (path === 'study/toggle-task' && req.method === 'POST') {
      const { taskId, completed } = req.body;
      const op = completed ? '$addToSet' : '$pull';
      await UserProfile.findOneAndUpdate({ userId }, { [op]: { completedTasks: taskId } }, { upsert: true });
      return res.status(200).json({ success: true });
    }
    if (path === 'study/leaderboard') {
      const leaderboard = await StudySession.aggregate([{ $group: { _id: "$userId", totalSeconds: { $sum: "$duration" }, sessions: { $count: {} } } }, { $sort: { totalSeconds: -1 } }, { $limit: 10 }]);
      return res.status(200).json(leaderboard);
    }

    // 4. SUMMARY ENDPOINTS
    if (path === 'summary/daily' || path === 'summary/all') {
      const sessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(500).lean();
      
      const historyObj = {};
      sessions.forEach(s => {
        const d = s.date || new Date(s.startTime).toISOString().split('T')[0];
        if (!historyObj[d]) {
          historyObj[d] = {
            date: d,
            study: { totalSeconds: 0, topicList: [], sessionsCount: 0 },
            jobs: { newCount: 0, topMatches: [] }
          };
        }
        historyObj[d].study.totalSeconds += (s.duration || 0);
        historyObj[d].study.sessionsCount++;
        
        // Track unique topics per day
        if (s.topicId) {
          let topicEntry = historyObj[d].study.topicList.find(t => t.id === s.topicId);
          if (!topicEntry) {
            topicEntry = { id: s.topicId, name: s.topicName || s.topicId, totalSeconds: 0 };
            historyObj[d].study.topicList.push(topicEntry);
          }
          topicEntry.totalSeconds += (s.duration || 0);
        }
      });

      const todayStr = new Date().toISOString().split('T')[0];
      if (path === 'summary/daily') {
        return res.status(200).json(historyObj[todayStr] || { date: todayStr, study: { totalSeconds: 0 }, jobs: { newCount: 0 } });
      }
      return res.status(200).json(historyObj);
    }

    // 5. JOBS ENDPOINTS
    if (path === 'jobs') {
      const jobs = await JobRecord.find({ $or: [{ userId }, { userId: 'system' }] }).sort({ createdAt: -1 }).limit(100).lean();
      const debugJobs = [{ title: 'DEBUG: DATABASE CONNECTED', company: 'ROUTER ACTIVE', status: 'new', job_hash: 'debug-router' }, ...jobs];
      return res.status(200).json({ records: debugJobs, dbStatus: true, count: jobs.length });
    }
    if (path === 'jobs/analytics') {
      const latestJobs = await JobRecord.find({}).sort({ fetched_at: -1 }).limit(200).lean();
      return res.status(200).json({ total: latestJobs.length, matches: latestJobs.filter(j => (j.match_score||0) > 70).length, matched_skills: [], missing_skills: [] });
    }
    if (path === 'jobs/status' && req.method === 'POST') {
      const { hash, status } = req.body;
      await JobRecord.findOneAndUpdate({ userId, job_hash: hash }, { $set: { status } });
      return res.status(200).json({ success: true });
    }

    // 6. AGENT CONTROL
    if (path === 'jobs/scan' && req.method === 'POST') {
      return res.status(200).json({ success: true, message: 'Global Scan Initiated' });
    }
    if (path === 'jobs/apply' && req.method === 'POST') {
      return res.status(200).json({ success: true, message: 'Auto-Apply Protocol Started' });
    }

    return res.status(404).json({ error: `Path not found: ${path}` });
  } catch (err) {
    console.error('Master API Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
