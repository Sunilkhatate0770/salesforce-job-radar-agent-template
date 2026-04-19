import { StudySession } from '../../src/models/models.js';
import mongoose from 'mongoose';

let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  const db = await mongoose.connect(process.env.MONGODB_URI);
  cachedDb = db;
  return db;
}

export default async function(req, res) {
  await connectDB();
  try {
    const sessions = await StudySession.find().sort({ startTime: -1 }).limit(1000).lean();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to fetch history' }));
  }
}
