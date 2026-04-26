import 'dotenv/config';
import mongoose from 'mongoose';
import { TursoDB } from './src/db/turso_driver.js';

async function verifyDualEngines() {
  console.log('--- DUAL-ENGINE CONNECTIVITY TEST ---');
  
  // 1. Test Turso (9GB Tier)
  try {
    const tursoStart = Date.now();
    const tursoRes = await TursoDB.execute("SELECT 1 as ok");
    const tursoTime = Date.now() - tursoStart;
    console.log(`[TURSO] Status: ✅ CONNECTED (${tursoTime}ms)`);
  } catch (e) {
    console.log(`[TURSO] Status: ❌ FAILED - ${e.message}`);
  }

  // 2. Test MongoDB (Legacy Tier)
  try {
    const mongoStart = Date.now();
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const mongoTime = Date.now() - mongoStart;
    console.log(`[MONGO] Status: ✅ CONNECTED (${mongoTime}ms)`);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`[MONGO] Status: ❌ FAILED - ${e.message}`);
  }

  console.log('--- TEST COMPLETE ---');
  process.exit(0);
}

verifyDualEngines();
