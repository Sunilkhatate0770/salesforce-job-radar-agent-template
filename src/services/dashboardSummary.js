const DAY_MS = 24 * 60 * 60 * 1000;

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function jobTimestamp(job = {}) {
  const candidates = [
    job.updatedAt,
    job.updated_at,
    job.statusUpdatedAt,
    job.last_seen_at,
    job.lastSeenAt,
    job.first_seen_at,
    job.firstSeenAt,
    job.date_added,
    job.dateAdded,
    job.createdAt,
    job.created_at,
    job.posted_at,
    job.postedAt,
    job.appliedAt,
    job.dateApplied
  ];
  for (const value of candidates) {
    const date = parseDate(value);
    if (date) return date.getTime();
  }
  return 0;
}

export function sortJobsNewestFirst(jobs = []) {
  return asArray(jobs).slice().sort((a, b) => {
    const dateDelta = jobTimestamp(b) - jobTimestamp(a);
    if (dateDelta) return dateDelta;
    const scoreDelta = Number(b?.score || b?.match_score || 0) - Number(a?.score || a?.match_score || 0);
    if (scoreDelta) return scoreDelta;
    return asText(b?.id || b?.job_hash).localeCompare(asText(a?.id || a?.job_hash));
  });
}

export function getJobFreshness(job = {}, now = new Date()) {
  const updated = parseDate(job.updatedAt || job.updated_at || job.statusUpdatedAt || job.last_seen_at || job.lastSeenAt);
  const created = parseDate(job.first_seen_at || job.firstSeenAt || job.date_added || job.dateAdded || job.createdAt || job.created_at || job.posted_at || job.postedAt);
  const basis = updated || created;
  const daysOld = basis ? Math.max(0, Math.floor((now.getTime() - basis.getTime()) / DAY_MS)) : 999;
  const hasApplyUrl = Boolean(job.apply_link || job.url || job.applyUrl);
  if (!basis || !hasApplyUrl) return { label: 'Needs review', tone: 'review', daysOld };
  if (daysOld === 0 && created && now.toDateString() === created.toDateString()) return { label: 'New today', tone: 'new', daysOld };
  if (updated && created && updated.getTime() - created.getTime() > 60 * 60 * 1000 && daysOld <= 7) return { label: 'Updated', tone: 'updated', daysOld };
  if (daysOld > 14) return { label: 'Stale', tone: 'stale', daysOld };
  return { label: 'Active', tone: 'active', daysOld };
}

function normalizeStatus(value) {
  const raw = asText(value, 'todo').toLowerCase();
  if (raw === 'new' || raw === 'saved') return 'todo';
  if (raw === 'ignored' || raw === 'archived') return 'rejected';
  return ['todo', 'applied', 'interview', 'offer', 'rejected'].includes(raw) ? raw : 'todo';
}

function scoreJob(job = {}) {
  const score = Number(job.score || job.match_score || 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

export function buildJobSourceHealth({ jobs = [], activityLog = [], now = new Date() } = {}) {
  const sortedJobs = sortJobsNewestFirst(jobs);
  const sortedLog = asArray(activityLog).slice().sort((a, b) => {
    const aDate = parseDate(a?.timestamp || a?.createdAt)?.getTime() || 0;
    const bDate = parseDate(b?.timestamp || b?.createdAt)?.getTime() || 0;
    return bDate - aDate;
  });
  let jobsAdded = 0;
  let jobsRefreshed = 0;
  let failedProviderCount = 0;
  sortedLog.slice(0, 24).forEach(entry => {
    const text = asText(entry?.text).toLowerCase();
    const added = text.match(/synced\s+(\d+)\s+new jobs?/i) || text.match(/(\d+)\s+new jobs?/i);
    const refreshed = text.match(/refreshed\s+(\d+)/i);
    if (added) jobsAdded += Number(added[1] || 0);
    if (refreshed) jobsRefreshed += Number(refreshed[1] || 0);
    if (entry?.type === 'error' || /\b(error|failed|failure|timeout|provider)\b/i.test(text)) failedProviderCount += 1;
  });
  const lastLogDate = parseDate(sortedLog[0]?.timestamp || sortedLog[0]?.createdAt);
  const lastJobDate = sortedJobs[0] ? parseDate(sortedJobs[0].updatedAt || sortedJobs[0].createdAt || sortedJobs[0].date_added) : null;
  const lastScanDate = lastLogDate || lastJobDate;
  const daysOld = lastScanDate ? Math.max(0, Math.floor((now.getTime() - lastScanDate.getTime()) / DAY_MS)) : 999;
  return {
    lastScanAt: lastScanDate ? lastScanDate.toISOString() : null,
    jobsAdded,
    jobsRefreshed,
    failedProviderCount,
    totalTracked: sortedJobs.length,
    nextScanExpectation: daysOld === 999 ? 'Run a scan to start daily updates.' : daysOld >= 1 ? 'Next scan should refresh today.' : 'Next scan expected in the daily automation window.',
    status: failedProviderCount ? 'degraded' : (daysOld > 2 ? 'stale' : 'healthy')
  };
}

export function buildDashboardSummary({ profile = {}, jobs = [], studySessions = [], releases = {}, activityLog = [], now = new Date() } = {}) {
  const sortedJobs = sortJobsNewestFirst(jobs);
  const todo = sortedJobs.filter(job => normalizeStatus(job.status) === 'todo');
  const applied = sortedJobs.filter(job => normalizeStatus(job.status) === 'applied');
  const interview = sortedJobs.filter(job => normalizeStatus(job.status) === 'interview');
  const highFit = todo.filter(job => scoreJob(job) >= 80);
  const fresh = todo.filter(job => getJobFreshness(job, now).daysOld <= 2);
  const missingSkills = asArray(profile.missingSkills).slice(0, 6);
  const todayKey = now.toISOString().slice(0, 10);
  const todaySeconds = asArray(studySessions)
    .filter(session => asText(session.date) === todayKey)
    .reduce((sum, session) => sum + Number(session.duration || 0), 0);
  const releaseItems = asArray(releases.personalizedItems || releases.items).slice(0, 6);
  const recommendedTopic = missingSkills[0] || asText(profile.studyPlanTopics?.[0]?.topic || profile.studyPlanTopics?.[0]?.name, 'Apex/LWC interview fundamentals');
  return {
    success: true,
    generatedAt: now.toISOString(),
    userId: profile.userId || null,
    targetRole: asText(profile.targetRole || profile.targetDesignation, 'Salesforce Developer'),
    todayCommandCenter: {
      studyFocus: recommendedTopic,
      weakTopics: missingSkills,
      recommendedNextTopic: recommendedTopic,
      jobRadarActions: {
        totalTracked: sortedJobs.length,
        highFit: highFit.length,
        fresh: fresh.length,
        applied: applied.length,
        interview: interview.length
      },
      resumeActions: todo.filter(job => asArray(job.resume_actions).length > 0).length,
      releaseActions: releaseItems.length,
      todayStudySeconds: todaySeconds
    },
    nextSevenDaysPlan: [0, 1, 2, 3, 4, 5, 6].map(dayOffset => ({
      dayOffset,
      label: dayOffset === 0 ? 'Today' : `Day ${dayOffset + 1}`,
      topic: [
        recommendedTopic,
        missingSkills[1] || 'LWC communication',
        highFit[0] ? 'Resume tailoring for top role' : 'Job radar scan review',
        missingSkills[2] || 'Integration retry design',
        'Bookmarked Q&A revision',
        releaseItems[0]?.title || 'Release intelligence prompt',
        'Mock interview and STAR story'
      ][dayOffset],
      focus: dayOffset % 3 === 0 ? 'Core' : dayOffset % 3 === 1 ? 'Scenario' : 'Application'
    })),
    jobSourceHealth: buildJobSourceHealth({ jobs: sortedJobs, activityLog, now })
  };
}

export function buildReleaseStudyActions(releasePayload = {}) {
  const items = asArray(releasePayload.personalizedItems || releasePayload.items);
  return ['Admin', 'Developer', 'Agentforce', 'Data Cloud', 'Security', 'Flow'].map(category => {
    const normalizedCategory = category.toLowerCase().replace(/\s+/g, '');
    const relevant = items.filter(item => {
      const haystack = `${item.category || ''} ${item.title || ''} ${item.summary || ''} ${item.whyMatters || ''}`.toLowerCase();
      return haystack.includes(category.toLowerCase()) || haystack.replace(/\s+/g, '').includes(normalizedCategory);
    }).slice(0, 4);
    return {
      category,
      count: relevant.length,
      items: relevant,
      studyTopic: relevant[0]?.topicId || (category === 'Developer' ? 'Apex/LWC' : category),
      prompts: [
        `How would you explain this ${category} feature?`,
        `Where would you use it in a Salesforce implementation?`,
        `What are the risks, limits, or tradeoffs?`
      ]
    };
  });
}

export function createMockInterviewSession(input = {}, userId = 'guest') {
  const questions = asArray(input.questions).slice(0, 12);
  const answers = asArray(input.answers).slice(0, 12);
  const answered = answers.filter(answer => asText(answer.answerText || answer.text).length > 20).length;
  const score = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  return {
    id: input.id || `mock_${Date.now()}`,
    userId,
    role: asText(input.role, 'Salesforce Developer').slice(0, 80),
    company: asText(input.company, 'General').slice(0, 80),
    topic: asText(input.topic, 'Apex/LWC').slice(0, 80),
    questions,
    answers,
    score,
    strengths: answered ? ['Specific examples', 'Clear structure'] : [],
    improvements: score >= 80 ? ['Add tradeoffs and measurable impact'] : ['Answer every question with a concrete project example'],
    createdAt: new Date().toISOString()
  };
}
