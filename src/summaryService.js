import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');

export function generateDailySummary() {
  const summaryPath = path.join(CACHE_DIR, 'daily-summaries.json');
  
  // ALWAYS start from scratch to avoid stale data issues
  let summaries = {};

  // Get Data
  const jobPath = path.join(CACHE_DIR, 'application-tracker.json');
  const studyPath = path.join(CACHE_DIR, 'study-tracker.json');
  
  let jobData = { records: [] };
  if (fs.existsSync(jobPath)) jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  
  let studyData = { sessions: [], topics: {} };
  if (fs.existsSync(studyPath)) studyData = JSON.parse(fs.readFileSync(studyPath, 'utf8'));

  // Get ALL unique dates from sessions to rebuild everything correctly
  const allDates = [...new Set(studyData.sessions.map(s => s.date))];
  
  allDates.forEach(dateStr => {
    if (!dateStr) return;
    const trimmedDate = dateStr.trim();
    // Ensure we are working with a clean YYYY-MM-DD string
    const match = trimmedDate.match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return;
    const finalDate = match[0];

    const daySessions = studyData.sessions.filter(s => s.date && s.date.trim().startsWith(finalDate));
    const dayJobs = (jobData.records || []).filter(r => r.date_added && r.date_added.startsWith(trimmedDate));
    
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

    summaries[dateStr] = {
      date: dateStr,
      study: {
        totalSeconds: dayTotal,
        topTopic: Object.keys(dayBreakdown).sort((a,b) => dayBreakdown[b].totalSeconds - dayBreakdown[a].totalSeconds)[0] || 'None',
        sessionsCount: daySessions.length,
        breakdown: dayBreakdown 
      },
      jobs: {
        newCount: dayJobs.length,
        topMatches: dayJobs.sort((a,b) => b.match_score - a.match_score).slice(0, 3).map(j => ({ title: j.title, company: j.company }))
      },
      syncStatus: 'local'
    };
  });

  try {
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
  } catch (err) {
    console.error(`[SummaryService] Failed to write history file:`, err);
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
