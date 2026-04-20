import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDailySummary } from './summaryService.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { StudySession, TaskStatus, User, JobRecord } from './models/models.js';
import { OAuth2Client } from 'google-auth-library';

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
        
        const user = await User.findOneAndUpdate(
          { googleId },
          { 
            googleId,
            email: payload['email'],
            name: payload['name'],
            picture: payload['picture'],
            lastLogin: new Date()
          },
          { upsert: true, new: true }
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user }));
      } catch (e) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid token' }));
      }
      return;
    }

    if (!userId) {
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
        const tasks = await TaskStatus.find({ userId }).lean();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ completedTasks: tasks }));
      }
      else if (url === '/api/jobs' && method === 'GET') {
        const records = await JobRecord.find({ userId }).sort({ createdAt: -1 }).lean();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ records }));
      }
      else if (url.includes('summary/all')) {
        const result = await generateDailySummary(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
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

  if (url.includes('summary/daily') && method === 'GET') {
    try {
      let sessions = null;
      if (isMongoConnected) {
        sessions = await StudySession.find().sort({ startTime: -1 }).limit(1000).lean();
      }
      const summaries = generateDailySummary(sessions);
      const todayStr = new Date().toISOString().split('T')[0];
      const summary = summaries[todayStr] || { date: todayStr, study: { totalSeconds: 0, topTopic: 'None', sessionsCount: 0, allTopics: [], topicBreakdown: {} }, jobs: { newCount: 0, topMatches: [] } };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to generate summary' }));
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
  server.listen(PORT, () => {
    console.log(`\n🚀 Dashboard server running at http://localhost:${PORT}`);
    console.log(`📡 Job Radar API integrated with local dedupe storage\n`);
  });
}
