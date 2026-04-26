import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { UserProfile, JobRecord, StudySession } from '../src/models/models.js';
import { TursoDB } from '../src/db/turso_driver.js';

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

  // GLOBAL BODY PARSER
  if (req.method === 'POST' && req.body && typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch(e) { console.error('Body parse fail:', e); }
  }

  try {
    // 1. AUTH ENDPOINTS
    if (path === 'auth/google' && req.method === 'POST') {
      const { token } = req.body;
      const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const userData = { id: payload['sub'], email: payload['email'], name: payload['name'], picture: payload['picture'] };
      
      // Save to NEW Turso Tier
      await TursoDB.saveUser(userData);
      
      return res.status(200).json({ success: true, user: userData });
    }

    // --- REQUIRE AUTH FOR DATA ROUTES ---
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // 2. PROFILE ENDPOINTS (Hybrid Search)
    if (path === 'profile/data') {
      // Try Turso First
      let profile = await TursoDB.getProfile(userId);
      let source = 'Turso (Primary)';

      // If not in Turso, check Legacy MongoDB
      if (!profile) {
        profile = await UserProfile.findOne({ userId }).lean();
        source = 'MongoDB (Legacy)';
      }

      return res.status(200).json({ exists: !!profile, profile, storageSource: source });
    }

    if (path === 'profile/save' && req.method === 'POST') {
      // Save to Turso (Promote to Primary)
      await TursoDB.saveProfile(userId, req.body);
      return res.status(200).json({ success: true });
    }

    // 3. JOBS ENDPOINTS (Hybrid Merge)
    if (path === 'jobs') {
      // Fetch from BOTH databases
      const tursoJobs = await TursoDB.getJobs(userId);
      const mongoJobs = await JobRecord.find({ $or: [{ userId }, { userId: 'system' }] }).sort({ createdAt: -1 }).limit(100).lean();
      
      // Deduplicate by job_hash (Turso wins)
      const unifiedMap = new Map();
      mongoJobs.forEach(j => unifiedMap.set(j.job_hash, { ...j, source: 'Legacy (Mongo)' }));
      tursoJobs.forEach(j => unifiedMap.set(j.job_hash, { ...j, source: 'Primary (Turso)' }));

      const finalJobs = Array.from(unifiedMap.values()).sort((a,b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));

      const debugHeader = { 
        title: 'HYBRID STORAGE ACTIVE', 
        company: 'MONGO + TURSO UNIFIED', 
        status: 'new', 
        job_hash: 'debug-hybrid',
        salary: 'Tiered 9.5GB Capacity',
        company_type: 'Dual-Engine DB',
        experience: `${tursoJobs.length} Turso / ${mongoJobs.length} Mongo`,
        probability: 'high',
        match_score: 100,
        why_apply: `<strong>Hybrid Mode Active:</strong> We are serving data from both MongoDB and Turso. All new jobs will be stored in your high-capacity Turso tier.`
      };

      return res.status(200).json({ 
        records: [debugHeader, ...finalJobs], 
        dbStatus: true, 
        count: finalJobs.length,
        storageStats: { turso: tursoJobs.length, mongo: mongoJobs.length }
      });
    }

    // 4. STUDY ENDPOINTS
    if (path === 'study/history') {
      const tursoSessions = await TursoDB.getStudyHistory(userId);
      const mongoSessions = await StudySession.find({ userId }).sort({ startTime: -1 }).limit(100).lean();
      const combined = [...tursoSessions, ...mongoSessions].sort((a,b) => new Date(b.startTime) - new Date(a.startTime));
      return res.status(200).json(combined);
    }

    if (path === 'study/session' && req.method === 'POST') {
      // Always save NEW sessions to Turso
      await TursoDB.saveStudySession(userId, req.body);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Route not found' });

  } catch (e) {
    console.error('Hybrid API Error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
