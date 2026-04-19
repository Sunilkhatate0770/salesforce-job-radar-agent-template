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
    const totalJobs = await JobRecord.countDocuments();
    const appliedJobs = 0; // We can add status to JobRecord later

    const summary = {
      dedupeCount: totalJobs,
      trackedCount: totalJobs,
      appliedCount: appliedJobs
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Failed to fetch cloud summary' }));
  }
}
