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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const WEB_DIR = process.cwd();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    const isPublicApi = url === '/api/jobs' || url === '/api/jobs/analytics' || url === '/api/auth/google';
    
    if (!userId && !isPublicFile && !isPublicApi) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    try {
      if (url === '/api/study/history' && method === 'GET') {
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
      else if (url === '/api/jobs' && method === 'GET') {
        if (isMongoConnected) {
          const records = await JobRecord.find({}).sort({ createdAt: -1 }).lean();
          console.log(`[DB] Brute Force | Found: ${records.length} jobs | Status: ${isMongoConnected}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            records,
            dbStatus: true,
            source: 'mongodb',
            count: records.length
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            records: [],
            dbStatus: false,
            source: 'cache',
            error: process.env.MONGODB_URI ? 'mongodb_connection_failed' : 'missing_mongodb_uri'
          }));
        }
      }
      else if (url === '/api/jobs/analytics' && method === 'GET') {
        if (!isMongoConnected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ matched_skills: [], missing_skills: [], top_companies: [] }));
          return;
        }
        
        // Basic analytics aggregation
        const records = await JobRecord.find({ userId }).lean();
        
        // This is a simplified version of analytics. Real implementation would use MongoDB aggregation.
        // But for now, we'll return structured data that the frontend expects.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          matched_skills: [
            { _id: 'Apex', count: records.filter(r => (r.skills || []).includes('Apex')).length },
            { _id: 'LWC', count: records.filter(r => (r.skills || []).includes('LWC')).length },
            { _id: 'Integration', count: records.filter(r => (r.skills || []).includes('REST')).length }
          ],
          missing_skills: [
            { _id: 'Data Cloud', count: 5 },
            { _id: 'Agentforce', count: 3 }
          ],
          top_companies: [
            { _id: 'Salesforce', count: records.filter(r => r.company === 'Salesforce').length },
            { _id: 'Deloitte', count: records.filter(r => r.company === 'Deloitte').length }
          ]
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
        res.end(JSON.stringify({ success: true, message: 'Scan started in background' }));
      }
      else if (url === '/api/study/leaderboard' && method === 'GET') {
        if (!isMongoConnected) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, leaderboard: [] }));
          return;
        }
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
        const profileData = JSON.parse(body);

        // Fetch existing for merging
        let existing = null;
        if (isMongoConnected) {
          existing = await UserProfile.findOne({ userId }).lean();
        }

        let mergedSkills = existing ? [...new Set([...existing.skills, ...(profileData.skills || [])])] : (profileData.skills || []);
        let mergedCerts = existing ? [...new Set([...existing.certifications, ...(profileData.certifications || [])])] : (profileData.certifications || []);
        let mergedMissing = existing ? [...new Set([...existing.missingSkills, ...(profileData.missingSkills || [])])] : (profileData.missingSkills || []);

        let platforms = existing?.platforms || {};
        if (profileData.platform === 'LinkedIn') platforms.linkedin = { synced: true, lastSync: new Date() };
        if (profileData.platform === 'Naukri') platforms.naukri = { synced: true, lastSync: new Date() };

        let rawExtraction = existing?.rawExtraction || {};
        if (profileData.platform === 'LinkedIn') { rawExtraction.linkedinSkills = profileData.skills; rawExtraction.linkedinCerts = profileData.certifications; }
        if (profileData.platform === 'Naukri') { rawExtraction.naukriSkills = profileData.skills; rawExtraction.naukriCerts = profileData.certifications; }

        if (isMongoConnected) {
          const profile = await UserProfile.findOneAndUpdate(
            { userId },
            { userId, platforms, skills: mergedSkills, experienceYears: Math.max(profileData.experienceYears || 0, existing?.experienceYears || 0), currentRole: profileData.currentRole || existing?.currentRole, targetRole: profileData.targetRole || existing?.targetRole, certifications: mergedCerts, missingSkills: mergedMissing, studyPlan: profileData.studyPlan || existing?.studyPlan, studyPlanTopics: (profileData.studyPlanTopics && profileData.studyPlanTopics.length > 0) ? profileData.studyPlanTopics : (existing?.studyPlanTopics || []), rawExtraction },
            { upsert: true, new: true }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile }));
        } else {
          // Fallback: save to local cache
          const cachePath = path.join(CACHE_DIR, 'profile-sync.json');
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(cachePath, JSON.stringify({ ...profileData, skills: mergedSkills, certifications: mergedCerts, missingSkills: mergedMissing, platforms, rawExtraction }, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, profile: profileData }));
        }
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
