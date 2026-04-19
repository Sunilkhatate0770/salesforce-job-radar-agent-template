import mongoose from 'mongoose';
import { JobRecord } from '../../src/models/models.js';
import { OAuth2Client } from 'google-auth-library';

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
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const userId = ticket.getPayload()['sub'];
    
    await connectDB();
    const { hash, status } = req.body;
    
    if (!hash || !status) return res.status(400).json({ error: 'Missing hash or status' });

    const job = await JobRecord.findOne({ job_hash: hash, userId });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    
    job.status = status;
    await job.save();
    
    res.status(200).json({ success: true, status: job.status });
  } catch (e) {
    console.error('Job Status Update Error:', e.message);
    res.status(500).json({ error: 'Failed to update job status', details: e.message });
  }
}
