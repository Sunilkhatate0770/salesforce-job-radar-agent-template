(function(root) {
  'use strict';

  const GROUP_GRADIENTS = {
    Technical: 'linear-gradient(90deg,#4f8ef7,#22d3ee)',
    Communication: 'linear-gradient(90deg,#f472b6,#a78bfa)',
    Domain: 'linear-gradient(90deg,#f4c542,#3dd68c)',
    'FDE Prep': 'linear-gradient(90deg,#6366f1,#a78bfa)',
    General: 'linear-gradient(90deg,#3dd68c,#22d3ee)',
    Scenarios: 'linear-gradient(90deg,#fb923c,#f472b6)',
    Reference: 'linear-gradient(90deg,#a78bfa,#818cf8)',
    Strategy: 'linear-gradient(90deg,#f4c542,#fb923c)',
    Company: 'linear-gradient(90deg,#34d399,#3dd68c)',
    Core: 'linear-gradient(90deg,#4f8ef7,#22d3ee)',
    Scenario: 'linear-gradient(90deg,#fb923c,#f472b6)'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getTopicIds(topicConfig) {
    return Object.keys(topicConfig || {});
  }

  function getTopicData(data, topicId) {
    return (data && data.topics && data.topics[topicId]) ? data.topics[topicId] : null;
  }

  function getTopicSeconds(data, topicId, liveContext) {
    const topicData = getTopicData(data, topicId);
    const baseSeconds = topicData ? toNumber(topicData.totalSeconds) : 0;
    const liveSeconds = liveContext && liveContext.topicId === topicId ? toNumber(liveContext.seconds) : 0;
    return baseSeconds + liveSeconds;
  }

  function getTopicStatus(topicId, data, topicConfig, liveContext) {
    const config = (topicConfig || {})[topicId] || {};
    const recommended = Math.max(1, toNumber(config.recommended, 45));
    const seconds = getTopicSeconds(data, topicId, liveContext);
    if (seconds <= 0) return { label: 'NOT STARTED', cls: 'status-needs-work' };
    const pct = (seconds / 60) / recommended * 100;
    if (pct < 30) return { label: 'NEEDS WORK', cls: 'status-needs-work' };
    if (pct < 70) return { label: 'IN PROGRESS', cls: 'status-in-progress' };
    if (pct < 100) return { label: 'GOOD', cls: 'status-good' };
    return { label: 'EXCELLENT', cls: 'status-excellent' };
  }

  function calculateStudyTotals(data, topicConfig, liveContext, todayString) {
    const ids = getTopicIds(topicConfig);
    let totalSeconds = 0;
    let totalSessionCount = 0;
    let topicsStudied = 0;
    let todaySeconds = 0;

    ids.forEach((id) => {
      const td = getTopicData(data, id);
      if (!td) return;
      const seconds = toNumber(td.totalSeconds);
      totalSeconds += seconds;
      totalSessionCount += toNumber(td.sessions);
      if (seconds > 0) topicsStudied += 1;
    });

    const liveSeconds = liveContext ? toNumber(liveContext.seconds) : 0;
    if (liveContext && liveContext.topicId) totalSeconds += liveSeconds;

    const sessions = Array.isArray(data && data.sessions) ? data.sessions : [];
    sessions.forEach((session) => {
      if (session && session.date === todayString) {
        todaySeconds += toNumber(session.duration);
      }
    });
    if (liveContext && liveContext.topicId) todaySeconds += liveSeconds;

    return {
      allTopics: ids,
      totalSeconds,
      totalSessionCount,
      topicsStudied,
      todaySeconds,
      liveSeconds
    };
  }

  function calculateCourseTargets(data, topicConfig, liveContext, deadlineDays) {
    const ids = getTopicIds(topicConfig);
    const totalRecommendedMin = ids.reduce((sum, id) => {
      return sum + Math.max(0, toNumber(topicConfig[id] && topicConfig[id].recommended));
    }, 0);
    const totalSpentSec = ids.reduce((sum, id) => sum + getTopicSeconds(data, id, liveContext), 0);
    const totalReqSec = Math.max(0, totalRecommendedMin * 60);
    const remainingSec = Math.max(0, totalReqSec - totalSpentSec);
    const safeDeadlineDays = Math.max(1, toNumber(deadlineDays, 30));
    const requiredDailySec = remainingSec / safeDeadlineDays;
    const progressPct = totalReqSec > 0 ? Math.min(100, Math.round((totalSpentSec / totalReqSec) * 100)) : 0;

    return {
      totalRecommendedMin,
      totalSpentSec,
      totalReqSec,
      remainingSec,
      requiredDailySec,
      progressPct
    };
  }

  function buildSuggestionModels(data, topicConfig) {
    const suggestions = [];
    const untouched = [];
    const needsWork = [];
    const inProgress = [];

    getTopicIds(topicConfig).forEach((id) => {
      const cfg = topicConfig[id] || {};
      const topicData = getTopicData(data, id);
      const recommended = Math.max(1, toNumber(cfg.recommended, 45));
      const spent = topicData ? toNumber(topicData.totalSeconds) / 60 : 0;
      const pct = spent / recommended * 100;
      const item = {
        id,
        name: cfg.name || id,
        group: cfg.group || 'General',
        spent,
        recommended,
        pct
      };
      if (spent === 0) untouched.push(item);
      else if (pct < 30) needsWork.push(item);
      else if (pct < 70) inProgress.push(item);
    });

    const fdeTopic = untouched.filter((t) => t.group === 'FDE Prep' || /fde|forward deployed/i.test(t.group + ' ' + t.name));
    if (fdeTopic.length > 0) {
      suggestions.push({
        icon: 'alert',
        text: `<b>Start FDE topics immediately!</b> <b>${fdeTopic.length} FDE topics</b> not started: ${fdeTopic.slice(0, 3).map((t) => escapeHtml(t.name)).join(', ')}${fdeTopic.length > 3 ? '...' : ''}. Critical for your interview.`,
        priority: 'HIGH',
        cls: 'priority-high'
      });
    }

    const nonFde = untouched.filter((t) => !fdeTopic.includes(t));
    if (nonFde.length > 0) {
      suggestions.push({
        icon: 'warning',
        text: `<b>${nonFde.length} topics not started:</b> ${nonFde.slice(0, 4).map((t) => escapeHtml(t.name)).join(', ')}${nonFde.length > 4 ? '...' : ''}.`,
        priority: 'MEDIUM',
        cls: 'priority-medium'
      });
    }

    if (needsWork.length > 0) {
      const low = needsWork.sort((a, b) => a.pct - b.pct).slice(0, 3);
      suggestions.push({
        icon: 'book',
        text: `<b>Revisit these:</b> ${low.map((t) => `${escapeHtml(t.name)} (${Math.round(t.spent)}/${t.recommended}m)`).join(', ')}`,
        priority: 'MEDIUM',
        cls: 'priority-medium'
      });
    }

    if (inProgress.length > 0) {
      suggestions.push({
        icon: 'check',
        text: `<b>Almost there!</b> ${inProgress.map((t) => `${escapeHtml(t.name)} (${Math.round(t.pct)}%)`).join(', ')}. Few more sessions needed.`,
        priority: 'LOW',
        cls: 'priority-low'
      });
    }

    const totalSeconds = Object.values((data && data.topics) || {}).reduce((sum, td) => sum + toNumber(td && td.totalSeconds), 0);
    const totalHours = totalSeconds / 3600;
    if (totalHours < 5) {
      suggestions.push({
        icon: 'clock',
        text: `<b>${Math.round(totalHours * 10) / 10} hours total.</b> Aim for 30+ hours.`,
        priority: 'HIGH',
        cls: 'priority-high'
      });
    } else if (totalHours < 20) {
      suggestions.push({
        icon: 'chart',
        text: `<b>Great!</b> ${Math.round(totalHours * 10) / 10} hours. Keep going!`,
        priority: 'LOW',
        cls: 'priority-low'
      });
    } else {
      suggestions.push({
        icon: 'trophy',
        text: `<b>Outstanding! ${Math.round(totalHours * 10) / 10}h logged.</b> Focus on weakest areas now.`,
        priority: 'LOW',
        cls: 'priority-low'
      });
    }

    if (!suggestions.length) {
      suggestions.push({
        icon: 'target',
        text: '<b>Start studying!</b> Open any topic to begin.',
        priority: 'MEDIUM',
        cls: 'priority-medium'
      });
    }
    return suggestions;
  }

  function buildTopicChartRows(data, topicConfig, liveContext) {
    const ids = getTopicIds(topicConfig);
    const maxSeconds = Math.max(1, ids.reduce((max, id) => Math.max(max, getTopicSeconds(data, id, liveContext)), 1));
    return ids.map((id) => {
      const cfg = topicConfig[id] || {};
      const seconds = getTopicSeconds(data, id, liveContext);
      const pct = seconds === 0 && maxSeconds > 1 ? 0 : Math.min((seconds / maxSeconds) * 100, 100);
      return {
        id,
        name: cfg.name || id,
        group: cfg.group || 'General',
        seconds,
        pct,
        color: GROUP_GRADIENTS[cfg.group] || GROUP_GRADIENTS.General,
        active: Boolean(liveContext && liveContext.topicId === id)
      };
    });
  }

  function buildTrackerRows(data, topicConfig, liveContext) {
    return getTopicIds(topicConfig).map((id) => {
      const cfg = topicConfig[id] || {};
      const td = getTopicData(data, id);
      const recommended = Math.max(1, toNumber(cfg.recommended, 45));
      const seconds = getTopicSeconds(data, id, liveContext);
      const pct = Math.min((seconds / 60) / recommended * 100, 100);
      return {
        id,
        name: cfg.name || id,
        recommended,
        seconds,
        pct,
        status: getTopicStatus(id, data, topicConfig, liveContext),
        lastStudied: td && td.lastStudied ? td.lastStudied : null,
        sessions: td ? toNumber(td.sessions) : 0,
        active: Boolean(liveContext && liveContext.topicId === id)
      };
    });
  }

  function buildHistoryTopicAnalytics(dates, histories, topicConfig) {
    const topicStats = {};
    const topicDetails = {};
    const safeDates = Array.isArray(dates) ? dates : [];

    safeDates.forEach((date) => {
      const history = histories && histories[date] ? histories[date] : {};
      const study = history.study || {};
      const breakdown = study.topicBreakdown || study.breakdown || {};

      if (Object.keys(breakdown).length > 0) {
        Object.keys(breakdown).forEach((topic) => {
          if (topic === 'None') return;
          const item = breakdown[topic] || {};
          topicStats[topic] = (topicStats[topic] || 0) + toNumber(item.totalSeconds);
          if (!topicDetails[topic]) topicDetails[topic] = { sessions: 0, lastDate: date };
          topicDetails[topic].sessions += toNumber(study.sessionsCount, 1);
          if (date > topicDetails[topic].lastDate) topicDetails[topic].lastDate = date;
        });
      } else if (toNumber(study.totalSeconds) > 0) {
        const topTopic = study.topTopic || (Array.isArray(study.allTopics) && study.allTopics[0]) || 'General';
        topicStats[topTopic] = (topicStats[topTopic] || 0) + toNumber(study.totalSeconds);
        if (!topicDetails[topTopic]) topicDetails[topTopic] = { sessions: 0, lastDate: date };
        topicDetails[topTopic].sessions += toNumber(study.sessionsCount, 1);
        if (date > topicDetails[topTopic].lastDate) topicDetails[topTopic].lastDate = date;
      }
    });

    const sortedTopics = Object.keys(topicStats).sort((a, b) => topicStats[b] - topicStats[a]);
    const totalTime = sortedTopics.reduce((sum, topic) => sum + topicStats[topic], 0);
    const cards = sortedTopics.map((topic, index) => {
      let config = null;
      Object.keys(topicConfig || {}).some((id) => {
        const cfg = topicConfig[id];
        if (cfg && (cfg.name === topic || topic.startsWith(cfg.name))) {
          config = cfg;
          return true;
        }
        return false;
      });
      const spent = topicStats[topic];
      const target = config ? Math.max(1, toNumber(config.recommended, 60) * 60) : 3600;
      return {
        topic,
        spent,
        target,
        pct: Math.min((spent / target) * 100, 100),
        details: topicDetails[topic] || { sessions: 0, lastDate: '' },
        accent: ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][index % 5]
      };
    });

    return { topicStats, topicDetails, sortedTopics, totalTime, cards };
  }

  root.SFJR_STUDY_ANALYTICS = {
    calculateCourseTargets,
    calculateStudyTotals,
    getTopicStatus,
    buildSuggestionModels,
    buildTopicChartRows,
    buildTrackerRows,
    buildHistoryTopicAnalytics
  };
})(typeof window !== 'undefined' ? window : globalThis);
