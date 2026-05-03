import { createClient } from '@libsql/client';

let client = null;
const tableColumnCache = new Map();

const tursoUrl = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;

if (tursoUrl && process.env.TURSO_AUTH_TOKEN) {
  client = createClient({
    url: tursoUrl,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const safeParse = (str) => {
  try { return JSON.parse(str || '[]'); } catch (e) { return []; }
};

const jsonText = (value, fallback = []) => JSON.stringify(value ?? fallback);

function isoDate(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function stableJobHash(job = {}) {
  const explicit = job.job_hash || job.jobHash || job.id || job._id;
  if (explicit) return String(explicit);
  return [
    job.apply_link || job.url || '',
    job.company || '',
    job.title || job.role || '',
    job.location || ''
  ].map(value => String(value || '').trim().toLowerCase()).join('|');
}

export const TursoDB = {
  async execute(sql, args = []) {
    if (!client) throw new Error('Turso Client not initialized');
    const sanitizedArgs = args.map(arg => arg === undefined ? null : arg);
    return await client.execute({ sql, args: sanitizedArgs });
  },

  async getTableColumns(tableName) {
    if (tableColumnCache.has(tableName)) return tableColumnCache.get(tableName);
    const res = await this.execute(`PRAGMA table_info(${tableName})`);
    const columns = new Set(res.rows.map(row => String(row.name)));
    tableColumnCache.set(tableName, columns);
    return columns;
  },

  async insertOrReplaceExistingColumns(tableName, values, conflictKey = null) {
    const existingColumns = await this.getTableColumns(tableName);
    const entries = Object.entries(values).filter(([key]) => existingColumns.has(key));
    if (!entries.length) throw new Error(`No matching Turso columns found for ${tableName}`);
    const columns = entries.map(([key]) => key);
    const placeholders = columns.map(() => '?').join(', ');
    const args = entries.map(([, value]) => value);
    const updateSql = conflictKey
      ? ` ON CONFLICT(${conflictKey}) DO UPDATE SET ${columns
          .filter(column => column !== conflictKey)
          .map(column => `${column}=excluded.${column}`)
          .join(', ')}`
      : '';
    const verb = conflictKey ? 'INSERT' : 'INSERT OR REPLACE';
    await this.execute(
      `${verb} INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})${updateSql}`,
      args
    );
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
      bookmarks: safeParse(p.bookmarks || '[]'),
      completedTasks: safeParse(p.completedTasks || '[]'),
      studyPlanTopics: safeParse(p.studyPlanTopics || '[]'),
      platforms: {
        linkedin: { synced: !!p.platforms_linkedin_synced, lastSync: p.platforms_linkedin_lastSync },
        naukri: { synced: !!p.platforms_naukri_synced, lastSync: p.platforms_naukri_lastSync }
      }
    };
  },

  async saveProfile(userId, data) {
    const values = {
      userId,
      updated_at: isoDate(data.updatedAt)
    };

    if ('skills' in data) values.skills = jsonText(data.skills, []);
    if ('experienceYears' in data) values.experienceYears = data.experienceYears || 0;
    if ('currentRole' in data || 'currentDesignation' in data) values.currentRole = data.currentRole || data.currentDesignation || '';
    if ('targetRole' in data || 'targetDesignation' in data) values.targetRole = data.targetRole || data.targetDesignation || '';
    if ('certifications' in data) values.certifications = jsonText(data.certifications, []);
    if ('missingSkills' in data) values.missingSkills = jsonText(data.missingSkills, []);
    if ('studyPlan' in data) values.studyPlan = data.studyPlan || '';
    if ('studyStreak' in data) {
      values.studyStreak_current = data.studyStreak?.current || 0;
      values.studyStreak_best = data.studyStreak?.best || 0;
      values.studyStreak_lastDate = data.studyStreak?.lastDate || '';
    }
    if ('platforms' in data) {
      values.platforms_linkedin_synced = data.platforms?.linkedin?.synced ? 1 : 0;
      values.platforms_linkedin_lastSync = data.platforms?.linkedin?.lastSync ? isoDate(data.platforms.linkedin.lastSync) : null;
      values.platforms_naukri_synced = data.platforms?.naukri?.synced ? 1 : 0;
      values.platforms_naukri_lastSync = data.platforms?.naukri?.lastSync ? isoDate(data.platforms.naukri.lastSync) : null;
    }
    if ('bookmarks' in data) values.bookmarks = jsonText(data.bookmarks, []);
    if ('completedTasks' in data) values.completedTasks = jsonText(data.completedTasks, []);
    if ('studyPlanTopics' in data) values.studyPlanTopics = jsonText(data.studyPlanTopics, []);

    await this.insertOrReplaceExistingColumns('user_profiles', values, 'userId');
  },

  async toggleBookmark(userId, bookmark) {
    let profile = await this.getProfile(userId);
    let bookmarks = profile?.bookmarks || [];
    
    const exists = bookmarks.some(b => b.q === bookmark.q);
    if (exists) {
      bookmarks = bookmarks.filter(b => b.q !== bookmark.q);
    } else {
      bookmarks.push({ ...bookmark, date: new Date().toISOString() });
    }
    
    // Surgical Update: If record doesn't exist, create a skeleton one. If it does, update ONLY bookmarks.
    const sql = `
      INSERT INTO user_profiles (userId, bookmarks) 
      VALUES (?, ?)
      ON CONFLICT(userId) DO UPDATE SET bookmarks = excluded.bookmarks
    `;
    await this.execute(sql, [userId, JSON.stringify(bookmarks)]);
    return bookmarks;
  },

  async toggleTask(userId, taskId, completed) {
    let profile = await this.getProfile(userId);
    let tasks = profile?.completedTasks || [];
    
    if (completed) {
      if (!tasks.includes(taskId)) tasks.push(taskId);
    } else {
      tasks = tasks.filter(id => id !== taskId);
    }

    const sql = `
      INSERT INTO user_profiles (userId, completedTasks) 
      VALUES (?, ?)
      ON CONFLICT(userId) DO UPDATE SET completedTasks = excluded.completedTasks
    `;
    await this.execute(sql, [userId, JSON.stringify(tasks)]);
    return tasks;
  },

  // 3. JOB METHODS
  async saveJob(userId, job) {
    await this.insertOrReplaceExistingColumns('job_records', {
      job_hash: stableJobHash(job),
      userId,
      title: job.title || job.role || '',
      company: job.company || '',
      location: job.location || job.loc || '',
      salary: job.salary || '',
      company_type: job.company_type || job.companyType || '',
      experience: job.experience || '',
      probability: job.probability || job.prob || 'medium',
      why_apply: job.why_apply || job.whyApply || '',
      date_added: job.date_added || job.dateAdded || job.first_seen_at || job.created_at || isoDate(job.createdAt),
      match_score: Number(job.match_score ?? job.score ?? 0),
      match_level: job.match_level || job.matchLevel || 'medium',
      matched_skills: jsonText(job.matched_skills || job.skills, []),
      missing_skills: jsonText(job.missing_skills, []),
      resume_actions: jsonText(job.resume_actions, []),
      status: job.status || job.board_status || 'new',
      url: job.url || job.apply_link || job.canonical_apply_url || '',
      created_at: isoDate(job.createdAt || job.created_at || job.date_added)
    }, 'job_hash');
  },

  async getJobAnalytics(userId) {
    const res = await this.execute(
      "SELECT * FROM job_records WHERE userId = ? OR userId = 'system' ORDER BY created_at DESC LIMIT 200", 
      [userId]
    );
    return res.rows;
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
    const startTime = isoDate(session.startTime);
    const duration = Number(session.duration || 0);
    const existing = await this.execute(
      "SELECT id FROM study_sessions WHERE userId = ? AND topic = ? AND startTime = ? AND duration = ? LIMIT 1",
      [userId, session.topic, startTime, duration]
    );
    if (existing.rows.length) return false;

    await this.insertOrReplaceExistingColumns('study_sessions', {
      userId,
      topic: session.topic || session.topicId || 'unknown',
      topicName: session.topicName || session.topic || 'Study Topic',
      duration,
      startTime,
      endTime: isoDate(session.endTime),
      date: session.date || startTime.slice(0, 10),
      created_at: isoDate(session.createdAt)
    });
    return true;
  },

  async getStudyHistory(userId, limit = 50) {
    const res = await this.execute(
      "SELECT * FROM study_sessions WHERE userId = ? ORDER BY startTime DESC LIMIT ?",
      [userId, limit]
    );
    return res.rows;
  },

  async getFullHistory(userId) {
    const sessions = await this.execute(
      "SELECT * FROM study_sessions WHERE userId = ? ORDER BY startTime DESC LIMIT 1000",
      [userId]
    );
    return sessions.rows;
  },

  async resetStudyData(userId) {
    await this.execute("DELETE FROM study_sessions WHERE userId = ?", [userId]);
    await this.saveProfile(userId, {
      completedTasks: [],
      studyPlanTopics: [],
      studyStreak: { current: 0, best: 0, lastDate: "" },
      updatedAt: new Date()
    });
  }
};
