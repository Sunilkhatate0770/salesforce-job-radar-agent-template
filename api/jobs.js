import { JobRecord } from '../src/models/models.js';
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
    const jobs = await JobRecord.find().sort({ createdAt: -1 }).limit(100).lean();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jobs));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to fetch cloud jobs' }));
  }
}
