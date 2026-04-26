import { createClient } from '@libsql/client';

let client = null;

if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
  client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const safeParse = (str) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return []; }
};

export const TursoDB = {
  async execute(sql, args = []) {
    if (!client) throw new Error('Turso Client not initialized');
    return await client.execute({ sql, args });
  },

  // 1. USER METHODS
  async saveUser(user) {
    const sql = `
      INSERT OR REPLACE INTO users (userId, email, name, picture, lastLogin)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [user.id, user.email, user.name, user.picture]);
  },

  // 2. PROFILE METHODS
  async getProfile(userId) {
    const res = await this.execute("SELECT * FROM user_profiles WHERE userId = ?", [userId]);
    if (res.rows.length === 0) return null;
    const p = res.rows[0];
    return {
      ...p,
      skills: safeParse(p.skills),
      certifications: safeParse(p.certifications),
      missingSkills: safeParse(p.missingSkills),
      platforms: {
        linkedin: { synced: !!p.platforms_linkedin_synced, lastSync: p.platforms_linkedin_lastSync },
        naukri: { synced: !!p.platforms_naukri_synced, lastSync: p.platforms_naukri_lastSync }
      }
    };
  },

  async saveProfile(userId, data) {
    const sql = `
      INSERT OR REPLACE INTO user_profiles (
        userId, skills, experienceYears, currentRole, targetRole, certifications, 
        missingSkills, studyPlan, studyStreak_current, studyStreak_best, 
        platforms_linkedin_synced, platforms_naukri_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      userId,
      JSON.stringify(data.skills || []),
      data.experienceYears || 0,
      data.currentRole || '',
      data.targetRole || '',
      JSON.stringify(data.certifications || []),
      JSON.stringify(data.missingSkills || []),
      data.studyPlan || '',
      data.studyStreak?.current || 0,
      data.studyStreak?.best || 0,
      data.platforms?.linkedin?.synced ? 1 : 0,
      data.platforms?.naukri?.synced ? 1 : 0
    ]);
  },

  // 3. JOB METHODS
  async saveJob(userId, job) {
    const sql = `
      INSERT OR REPLACE INTO job_records (
        job_hash, userId, title, company, location, salary, company_type, 
        experience, probability, why_apply, match_score, status, url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      job.job_hash, userId, job.title, job.company, job.location, job.salary,
      job.company_type, job.experience, job.probability, job.why_apply,
      job.match_score, job.status, job.url
    ]);
  },

  async getJobs(userId, limit = 100) {
    const res = await this.execute(
      "SELECT * FROM job_records WHERE userId = ? OR userId = 'system' ORDER BY created_at DESC LIMIT ?", 
      [userId, limit]
    );
    return res.rows;
  },

  // 4. STUDY SESSION METHODS
  async saveStudySession(userId, session) {
    const sql = `
      INSERT INTO study_sessions (userId, topic, topicName, duration, startTime, endTime, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      userId, session.topic, session.topicName, session.duration,
      session.startTime, session.endTime, session.date
    ]);
  },

  async getStudyHistory(userId, limit = 50) {
    const res = await this.execute(
      "SELECT * FROM study_sessions WHERE userId = ? ORDER BY startTime DESC LIMIT ?",
      [userId, limit]
    );
    return res.rows;
  }
};
