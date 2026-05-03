import 'dotenv/config';
import mongoose from 'mongoose';
import { JobRecord, StudySession, TaskStatus, User, UserProfile } from '../src/models/models.js';
import { TursoDB } from '../src/db/turso_driver.js';

const writeMode = process.argv.includes('--write');

function cleanDoc(doc = {}) {
  const { _id, __v, ...rest } = doc;
  return rest;
}

function mask(value) {
  const text = String(value || '');
  if (!text) return '(blank)';
  if (text === 'system') return 'system';
  return `${text.slice(0, 5)}...${text.slice(-4)}`;
}

async function connectMongo() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
}

async function backfillJobs() {
  const jobs = await JobRecord.find({}).sort({ createdAt: 1 }).lean();
  let written = 0;
  for (const job of jobs) {
    const userId = job.userId || 'system';
    if (writeMode) {
      await TursoDB.saveJob(userId, cleanDoc(job));
      written++;
    }
  }
  return {
    scanned: jobs.length,
    written,
    byUser: Object.entries(jobs.reduce((acc, job) => {
      const key = job.userId || 'system';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([userId, count]) => ({ user: mask(userId), count }))
  };
}

async function ensureTursoUsers() {
  const [users, jobs, sessions, profiles] = await Promise.all([
    User.find({}).lean(),
    JobRecord.find({}).select('userId').lean(),
    StudySession.find({ userId: { $nin: [null, ''] } }).select('userId').lean(),
    UserProfile.find({}).select('userId').lean()
  ]);
  const referencedIds = new Set([
    'system',
    ...users.map(user => user.googleId).filter(Boolean),
    ...jobs.map(job => job.userId || 'system'),
    ...sessions.map(session => session.userId).filter(Boolean),
    ...profiles.map(profile => profile.userId).filter(Boolean)
  ]);
  const usersById = new Map(users.map(user => [user.googleId, user]));
  let written = 0;

  for (const userId of referencedIds) {
    if (!writeMode) continue;
    const user = usersById.get(userId) || {};
    await TursoDB.saveUser({
      id: userId,
      email: user.email || `${userId}@legacy.local`,
      name: user.name || (userId === 'system' ? 'System Job Radar' : 'Legacy User'),
      picture: user.picture || ''
    });
    written++;
  }

  return {
    scanned: referencedIds.size,
    written,
    users: Array.from(referencedIds).map(mask)
  };
}

async function backfillStudySessions() {
  const sessions = await StudySession.find({ userId: { $nin: [null, ''] } }).sort({ startTime: 1 }).lean();
  let written = 0;
  let skippedDuplicates = 0;
  for (const session of sessions) {
    if (writeMode) {
      const inserted = await TursoDB.saveStudySession(session.userId, cleanDoc(session));
      if (inserted) written++;
      else skippedDuplicates++;
    }
  }
  return {
    scanned: sessions.length,
    written,
    skippedDuplicates,
    byUser: Object.entries(sessions.reduce((acc, session) => {
      acc[session.userId] = (acc[session.userId] || 0) + 1;
      return acc;
    }, {})).map(([userId, count]) => ({ user: mask(userId), count }))
  };
}

async function backfillProfiles() {
  const [profiles, completedTaskRows] = await Promise.all([
    UserProfile.find({}).lean(),
    TaskStatus.find({ completed: true }).lean()
  ]);
  const completedByUser = completedTaskRows.reduce((acc, row) => {
    if (!row.userId) return acc;
    if (!acc[row.userId]) acc[row.userId] = [];
    acc[row.userId].push(row.index);
    return acc;
  }, {});

  let written = 0;
  for (const profile of profiles) {
    if (!profile.userId) continue;
    const payload = {
      ...cleanDoc(profile),
      completedTasks: Array.from(new Set([
        ...(profile.completedTasks || []),
        ...(completedByUser[profile.userId] || [])
      ])),
      updatedAt: profile.updatedAt || new Date()
    };
    if (writeMode) {
      await TursoDB.saveProfile(profile.userId, payload);
      written++;
    }
  }

  return {
    scanned: profiles.length,
    written,
    users: profiles.map(profile => mask(profile.userId))
  };
}

async function main() {
  await connectMongo();
  const result = {
    mode: writeMode ? 'write' : 'dry-run',
    users: await ensureTursoUsers(),
    jobs: await backfillJobs(),
    studySessions: await backfillStudySessions(),
    profiles: await backfillProfiles()
  };
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(`[backfill] ${error.message}`);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
