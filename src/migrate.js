import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const VERCEL_URL = 'https://salesforce-job-radar-agent-template.vercel.app';

async function migrate() {
  console.log('🚀 Starting Full Cloud Migration (Sessions + Tasks)...');
  
  const cacheFile = path.join(process.cwd(), '.cache', 'study-tracker.json');
  if (!fs.existsSync(cacheFile)) {
    console.log('ℹ️ No local data found.');
    process.exit(0);
  }

  try {
    const localData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const sessions = localData.sessions || [];
    const completedTasks = localData.completedTasks || [];

    console.log(`📊 Found ${sessions.length} sessions and ${completedTasks.length} tasks.`);

    // 1. Upload Sessions
    for (const s of sessions) {
      process.stdout.write('.');
      await fetch(`${VERCEL_URL}/api/study/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
    }
    console.log('\n✅ Sessions Synced.');

    // 2. Upload Tasks
    for (const index of completedTasks) {
      process.stdout.write('.');
      await fetch(`${VERCEL_URL}/api/study/toggle-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
      });
    }
    console.log('\n✅ Tasks Synced.');

    console.log('\n🏁 MIGRATION COMPLETE! Refresh your dashboard.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

migrate();
