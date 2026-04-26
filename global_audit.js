import 'dotenv/config';
import { TursoDB } from './src/db/turso_driver.js';

async function audit() {
  console.log('--- GLOBAL TURSO AUDIT ---');
  try {
    const res = await TursoDB.execute("SELECT userId, length(bookmarks) as b_len, bookmarks FROM user_profiles");
    console.log(`Found ${res.rows.length} profiles in Turso.`);
    res.rows.forEach(r => {
      console.log(`User: ${r.userId} | Bookmark Raw Length: ${r.b_len}`);
      console.log(`Content: ${r.bookmarks}`);
    });
  } catch (e) {
    console.error('Audit failed:', e.message);
  }
  process.exit(0);
}

audit();
