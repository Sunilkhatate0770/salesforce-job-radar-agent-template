import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');

export function generateDailySummary(providedSessions = null) {
  const summaryPath = path.join(CACHE_DIR, 'daily-summaries.json');
  
  // ALWAYS start from scratch to avoid stale data issues
  let summaries = {};

  // Get Data
  const jobPath = path.join(CACHE_DIR, 'application-tracker.json');
  const studyPath = path.join(CACHE_DIR, 'study-tracker.json');
  
  let jobData = { records: [] };
  try {
    if (fs.existsSync(jobPath)) jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  } catch (e) { console.warn('[SummaryService] Skipping local job data'); }
  
  let studyData = { sessions: [], topics: {} };
  if (providedSessions) {
    studyData.sessions = providedSessions;
  } else {
    try {
      if (fs.existsSync(studyPath)) studyData = JSON.parse(fs.readFileSync(studyPath, 'utf8'));
    } catch (e) { console.warn('[SummaryService] Skipping local study data'); }
  }

  // Get ALL unique dates from sessions to rebuild everything correctly
  const allDates = [...new Set(studyData.sessions.map(s => s.date).filter(Boolean))];
  
  allDates.forEach(dateStr => {
    if (!dateStr) return;
    const trimmedDate = dateStr.trim();
    // Ensure we are working with a clean YYYY-MM-DD string
    const match = trimmedDate.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return;
    const finalDate = match[0];

    const daySessions = studyData.sessions.filter(s => {
      if (!s.date) return false;
      const sDate = String(s.date).trim();
      return sDate.includes(finalDate);
    });
    const dayJobs = (jobData.records || []).filter(r => {
      if (!r.date_added) return false;
      const rDate = String(r.date_added).trim();
      return rDate.startsWith(trimmedDate);
    });
    
    console.log(`[SummaryService] Date: ${finalDate}. Found ${daySessions.length} sessions.`);
    daySessions.forEach(s => console.log(`  - Session: ${s.topicName} (${s.duration}s)`));

    const dayBreakdown = {};
    let dayTotal = 0;
    
    daySessions.forEach(s => {
      dayTotal += s.duration;
      const tid = (s.topic || 'unknown').trim();
      if (!dayBreakdown[tid]) {
        dayBreakdown[tid] = { 
          totalSeconds: 0, 
          name: s.topicName || tid 
        };
      }
      dayBreakdown[tid].totalSeconds += s.duration;
    });

    summaries[finalDate] = {
      date: finalDate,
      study: {
        totalSeconds: dayTotal,
        topTopic: Object.keys(dayBreakdown).sort((a,b) => dayBreakdown[b].totalSeconds - dayBreakdown[a].totalSeconds)[0] || 'None',
        sessionsCount: daySessions.length,
        topics: Object.keys(dayBreakdown),
        breakdown: dayBreakdown 
      },
      jobs: {
        newCount: dayJobs.length,
        topMatches: dayJobs.sort((a,b) => b.match_score - a.match_score).slice(0, 3).map(j => ({ title: j.title, company: j.company }))
      },
      syncStatus: 'local'
    };
  });

  // Skip writing to disk if on Vercel (read-only filesystem)
  if (!process.env.VERCEL) {
    try {
      fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
    } catch (err) {
      console.error(`[SummaryService] Failed to write history file:`, err);
    }
  }
  return summaries;
}

function getTopTopic(sessions) {
  if (!sessions.length) return 'None';
  const counts = {};
  sessions.forEach(s => {
    counts[s.topicName] = (counts[s.topicName] || 0) + s.duration;
  });
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}
