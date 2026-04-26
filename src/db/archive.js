import { createClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let turso = null;
let supabase = null;

// Initialize Turso if credentials exist
if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
  turso = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// Initialize Supabase if credentials exist
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

export async function pushToArchive(records) {
  if (!records || !records.length) return { success: true, count: 0 };

  console.log(`[Archive] Attempting to archive ${records.length} records...`);

  // Try Turso First (9GB Capacity)
  if (turso) {
    try {
      // Ensure table exists
      await turso.execute(`
        CREATE TABLE IF NOT EXISTS job_archive (
          job_hash TEXT PRIMARY KEY,
          title TEXT,
          company TEXT,
          location TEXT,
          salary TEXT,
          experience TEXT,
          match_score INTEGER,
          status TEXT,
          why_apply TEXT,
          url TEXT,
          archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const queries = records.map(r => ({
        sql: "INSERT OR REPLACE INTO job_archive (job_hash, title, company, location, salary, experience, match_score, status, why_apply, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          r.job_hash, r.title, r.company, r.location, r.salary, r.experience, 
          r.match_score || 0, r.status || 'ignored', r.why_apply || '', r.url || ''
        ]
      }));

      await turso.batch(queries);
      console.log('✅ [Archive] Successfully moved to Turso');
      return { success: true, provider: 'turso', count: records.length };
    } catch (e) {
      console.error('❌ [Archive] Turso failed, falling back...', e.message);
    }
  }

  // Fallback to Supabase (500MB Capacity)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('job_archive')
        .upsert(records.map(r => ({
          job_hash: r.job_hash,
          title: r.title,
          company: r.company,
          location: r.location,
          salary: r.salary,
          experience: r.experience,
          match_score: r.match_score,
          status: r.status,
          why_apply: r.why_apply,
          url: r.url
        })));
      
      if (error) throw error;
      console.log('✅ [Archive] Successfully moved to Supabase');
      return { success: true, provider: 'supabase', count: records.length };
    } catch (e) {
      console.error('❌ [Archive] Supabase fallback failed:', e.message);
    }
  }

  console.warn('⚠️ [Archive] No cloud archive provider available. Data remains in primary DB.');
  return { success: false, error: 'No provider' };
}

export async function fetchFromArchive(query = {}, limit = 50) {
  let results = [];

  if (turso) {
    try {
      const res = await turso.execute({
        sql: "SELECT * FROM job_archive ORDER BY archived_at DESC LIMIT ?",
        args: [limit]
      });
      results = res.rows.map(row => ({ ...row, isArchived: true }));
    } catch (e) { console.error('Archive Fetch Turso Fail:', e.message); }
  }

  if (results.length === 0 && supabase) {
    try {
      const { data } = await supabase
        .from('job_archive')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      results = (data || []).map(r => ({ ...r, isArchived: true }));
    } catch (e) { console.error('Archive Fetch Supabase Fail:', e.message); }
  }

  return results;
}
