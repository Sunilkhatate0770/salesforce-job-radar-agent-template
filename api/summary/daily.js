import mongoose from 'mongoose';
import { StudySession } from '../../src/models/models.js';
import { OAuth2Client } from 'google-auth-library';
import { generateDailySummary } from '../../src/summaryService.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  return mongoose.connect(process.env.MONGODB_URI).then(db => {
    cachedDb = db;
    return db;
  });
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const userId = ticket.getPayload()['sub'];
    
    await connectDB();
    
    // Fetch the user's sessions from MongoDB to generate their personalized summary
    const userSessions = await StudySession.find({ userId }).lean();
    
    // Pass the actual array of sessions, NOT the string userId
    const result = await generateDailySummary(userSessions);
    res.status(200).json(result);
  } catch (e) {
    console.error('Error in Daily Summary:', e.message);
    res.status(500).json({ error: 'Failed to generate summary', details: e.message });
  }
}
