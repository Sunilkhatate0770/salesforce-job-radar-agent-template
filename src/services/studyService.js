export function defaultTopicName(topicId) {
  return String(topicId || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function normalizeStudyTaskIndex(body = {}) {
  const taskIndex = Number(body.index ?? body.taskId);
  return Number.isFinite(taskIndex) ? taskIndex : null;
}

export function upsertRetentionTopic(existingTopics = [], topicId, stats = {}, topicName = defaultTopicName) {
  const id = String(topicId || '').trim();
  if (!id) {
    return { topics: Array.isArray(existingTopics) ? [...existingTopics] : [], retentionTopic: null };
  }

  const topics = Array.isArray(existingTopics) ? [...existingTopics] : [];
  const index = topics.findIndex(t => t?.topicId === id);
  const retentionTopic = {
    ...(index >= 0 ? topics[index] : {}),
    topicId: id,
    topic: typeof topicName === 'function' ? topicName(id) : defaultTopicName(id),
    confidence: Number(stats.confidence || 0),
    nextReview: stats.nextReview ? new Date(stats.nextReview) : undefined,
    interval: Number(stats.interval || 0),
    easeFactor: Number(stats.easeFactor || 2.5)
  };

  if (index >= 0) topics[index] = retentionTopic;
  else topics.push(retentionTopic);

  return { topics, retentionTopic };
}

export function mergeStudyHistory(tursoSessions = [], mongoSessions = [], limit = 100) {
  return [...(tursoSessions || []), ...(mongoSessions || [])]
    .filter(Boolean)
    .sort((a, b) => new Date(b.startTime || b.date || 0) - new Date(a.startTime || a.date || 0))
    .slice(0, limit);
}

export function buildStudyStats(sessions = []) {
  const topicCounts = {};
  const totalSeconds = (sessions || []).reduce((sum, session) => {
    const duration = Number(session?.duration || 0);
    const topicId = session?.topicId || session?.topic;
    if (topicId) topicCounts[topicId] = (topicCounts[topicId] || 0) + duration;
    return sum + duration;
  }, 0);

  return {
    totalSeconds,
    sessionsCount: (sessions || []).length,
    breakdown: topicCounts
  };
}

export function mergeCompletedTasks({ tursoProfile = null, mongoTasks = [] } = {}) {
  return Array.from(new Set([
    ...(tursoProfile?.completedTasks || []),
    ...(mongoTasks || []).map(t => t?.index)
  ].map(Number).filter(Number.isFinite)));
}

function toDayKey(value, fallbackDate = new Date()) {
  const date = value ? new Date(value) : fallbackDate;
  if (Number.isNaN(date.getTime())) return fallbackDate.toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
}

export function createEmptyDaySummary(date) {
  return {
    date,
    study: {
      totalSeconds: 0,
      topicList: [],
      breakdown: {},
      sessionsCount: 0
    },
    jobs: {
      newCount: 0,
      topMatches: []
    }
  };
}

export function buildStudySummaryHistory(sessions = [], jobs = [], options = {}) {
  const history = {};
  const fallbackDate = options.now ? new Date(options.now) : new Date();

  for (const session of sessions || []) {
    if (!session) continue;
    const date = session.date || toDayKey(session.startTime, fallbackDate);
    if (!history[date]) history[date] = createEmptyDaySummary(date);

    const duration = Number(session.duration || 0);
    const topicId = session.topicId || session.topic;
    history[date].study.totalSeconds += duration;
    history[date].study.sessionsCount += 1;

    if (topicId) {
      if (!history[date].study.breakdown[topicId]) {
        history[date].study.breakdown[topicId] = {
          id: topicId,
          name: session.topicName || defaultTopicName(topicId),
          totalSeconds: 0
        };
      }
      history[date].study.breakdown[topicId].totalSeconds += duration;
    }
  }

  for (const job of jobs || []) {
    if (!job) continue;
    const date = job.date_added || toDayKey(job.createdAt || job.updatedAt, fallbackDate);
    if (!history[date]) history[date] = createEmptyDaySummary(date);

    history[date].jobs.newCount += 1;
    if (Number(job.match_score || job.matchScore || 0) >= 80 && history[date].jobs.topMatches.length < 5) {
      history[date].jobs.topMatches.push({
        title: job.title || job.role || 'Salesforce role',
        company: job.company || 'Unknown company',
        score: Number(job.match_score || job.matchScore || 0)
      });
    }
  }

  Object.values(history).forEach(day => {
    day.study.topicList = Object.values(day.study.breakdown || {});
  });

  return history;
}

export function getDailySummary(history = {}, date = new Date().toISOString().split('T')[0]) {
  return history[date] || createEmptyDaySummary(date);
}
