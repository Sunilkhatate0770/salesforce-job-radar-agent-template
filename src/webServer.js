import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDailySummary } from './summaryService.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { StudySession } from './models/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const WEB_DIR = path.join(process.cwd(), 'web');

// MongoDB Connection
let isMongoConnected = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('[DB] Connected to MongoDB Atlas');
      isMongoConnected = true;
    })
    .catch(err => console.error('[DB] MongoDB Connection Error:', err));
}

// THE HANDLER (Exported for Vercel)
export default async function handler(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const url = parsedUrl.pathname;
  const method = req.method;

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

  // API Endpoints
  if (url === '/api/summary' && method === 'GET') {
    try {
      const hashes = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'job-hashes.json'), 'utf8'));
      const tracker = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'application-tracker.json'), 'utf8'));
      
      const summary = {
        dedupeCount: hashes.length || 0,
        trackedCount: tracker.length || 0,
        appliedCount: tracker.filter(j => j.status === 'applied').length
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to read data' }));
    }
    return;
  }

  if (url === '/api/jobs' && method === 'GET') {
    try {
      const tracker = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'application-tracker.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tracker));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to read tracker' }));
    }
    return;
  }

  if (url.startsWith('/api/jobs/') && url.endsWith('/status') && method === 'POST') {
    const hash = url.split('/')[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body);
        const trackerPath = path.join(CACHE_DIR, 'application-tracker.json');
        const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        
        const jobIndex = tracker.findIndex(j => j.job_hash === hash);
        if (jobIndex !== -1) {
          tracker[jobIndex].status = status;
          tracker[jobIndex].updated_at = new Date().toISOString();
          fs.writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Job not found' }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  if (url === '/api/study/data' && method === 'GET') {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'study-tracker.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to read study data' }));
    }
    return;
  }

  if (url === '/api/study/session' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const session = JSON.parse(body);
        
        // 1. Save to MongoDB if connected
        if (isMongoConnected) {
          try {
            const cloudSession = new StudySession(session);
            await cloudSession.save();
            console.log('[DB] Session saved to Cloud');
          } catch (dbErr) {
            console.error('[DB] Failed to save session to cloud:', dbErr);
          }
        }

        // 2. Fallback: Save to Local JSON
        const trackerPath = path.join(CACHE_DIR, 'study-tracker.json');
        let data = { sessions: [], topics: {}, completedTasks: [] };
        if (fs.existsSync(trackerPath)) {
           data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        }
        
        data.sessions.push(session);
        if (data.sessions.length > 500) data.sessions = data.sessions.slice(-500);
        
        // Update topic stats
        const topicId = session.topic;
        if (!data.topics[topicId]) {
          data.topics[topicId] = { totalSeconds: 0, sessions: 0, lastStudied: null };
        }
        data.topics[topicId].totalSeconds += session.duration;
        data.topics[topicId].sessions += 1;
        data.topics[topicId].lastStudied = session.endTime;
        
        fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, cloud: isMongoConnected }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  if (url === '/api/study/toggle-task' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { index } = JSON.parse(body);
        const trackerPath = path.join(CACHE_DIR, 'study-tracker.json');
        const data = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        
        const idx = data.completedTasks.indexOf(index);
        if (idx === -1) data.completedTasks.push(index);
        else data.completedTasks.splice(idx, 1);
        
        fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  if (url === '/api/summary/daily' && method === 'GET') {
    try {
      const summaries = generateDailySummary();
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

  if (url === '/api/summary/all' && method === 'GET') {
    try {
      let sessions = null;
      if (isMongoConnected) {
        try {
          // Fetch last 30 days from cloud
          sessions = await StudySession.find().sort({ startTime: -1 }).limit(1000).lean();
          console.log(`[DB] Fetched ${sessions.length} sessions from Cloud`);
        } catch (dbErr) {
          console.error('[DB] Cloud fetch failed, falling back to local:', dbErr);
        }
      }

      // Rebuild and return directly to avoid file-read race conditions
      const summaries = generateDailySummary(sessions);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summaries));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to fetch history' }));
    }
    return;
  }

  if (url === '/api/ai/interview' && method === 'POST') {
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
