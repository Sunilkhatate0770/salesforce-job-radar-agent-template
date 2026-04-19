import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');

export function generateDailySummary() {
  const dateStr = new Date().toISOString().split('T')[0];
  const summaryPath = path.join(CACHE_DIR, 'daily-summaries.json');
  
  let summaries = {};
  if (fs.existsSync(summaryPath)) {
    summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  }

  // Get Job Data
  let jobData = { records: [] };
  const jobPath = path.join(CACHE_DIR, 'application-tracker.json');
  if (fs.existsSync(jobPath)) {
    jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  }

  // Get Study Data
  let studyData = { sessions: [], topics: {}, completedTasks: [] };
  const studyPath = path.join(CACHE_DIR, 'study-tracker.json');
  if (fs.existsSync(studyPath)) {
    studyData = JSON.parse(fs.readFileSync(studyPath, 'utf8'));
  }

  const todaySessions = studyData.sessions.filter(s => s.date.startsWith(dateStr));
  const totalStudyTime = todaySessions.reduce((acc, s) => acc + s.duration, 0);
  
  const todayJobs = (jobData.records || []).filter(r => r.date_added && r.date_added.startsWith(dateStr));

  summaries[dateStr] = {
    date: dateStr,
    study: {
      totalSeconds: totalStudyTime,
      sessionsCount: todaySessions.length,
      topTopic: getTopTopic(todaySessions),
      allTopics: Array.from(new Set(todaySessions.map(s => s.topicName)))
    },
    jobs: {
      newCount: todayJobs.length,
      topMatches: todayJobs.sort((a,b) => b.match_score - a.match_score).slice(0, 3)
    },
    syncStatus: 'local'
  };

  try {
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
    console.log(`[SummaryService] Successfully updated history for ${dateStr}`);
  } catch (err) {
    console.error(`[SummaryService] Failed to write history file:`, err);
  }
  return summaries[dateStr];
}

function getTopTopic(sessions) {
  if (!sessions.length) return 'None';
  const counts = {};
  sessions.forEach(s => {
    counts[s.topicName] = (counts[s.topicName] || 0) + s.duration;
  });
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}
