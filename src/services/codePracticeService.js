export function getDefaultCodePracticeProgress() {
  return { attempts: [], bestScores: {}, lastWorkspace: null, completedChallengeIds: [] };
}

export function filterCodePracticeChallenges(catalog = {}, searchParams = new URLSearchParams()) {
  const requestedTrack = String(searchParams.get('track') || 'all').toLowerCase();
  const requestedYears = Number(searchParams.get('experienceYears') || 0);
  const requestedDesignation = String(searchParams.get('designation') || '').toLowerCase();
  const challenges = (catalog.challenges || []).filter(challenge => {
    const challengeTrack = String(challenge.track || '').toLowerCase();
    const trackMatch = requestedTrack === 'all' || !requestedTrack || challengeTrack === requestedTrack;
    const yearMatch = !requestedYears || (challenge.experienceLevels || []).includes(requestedYears);
    const designationMatch = !requestedDesignation ||
      (challenge.designations || []).some(item => String(item).toLowerCase() === requestedDesignation);
    return trackMatch && yearMatch && designationMatch;
  });
  return { version: catalog.version, challenges };
}

export function getCodePracticeChallenge(catalog = {}, challengeId) {
  return (catalog.challenges || []).find(challenge => challenge.id === challengeId) || null;
}

export function createCustomCodePracticeChallenge(body = {}, now = new Date()) {
  if (!body.custom) return null;
  return {
    id: String(body.challengeId || `custom_${now.getTime()}`).slice(0, 80),
    title: String(body.title || 'Custom single-file practice').slice(0, 120),
    track: body.languageTrack || 'custom'
  };
}

export function safePracticeFileName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 80);
}

export function normalizeCodePracticeFiles(files = []) {
  if (Array.isArray(files)) {
    return Object.fromEntries(files.map(file => [
      safePracticeFileName(file.name),
      String(file.content || '').slice(0, 60000)
    ]).filter(([name]) => name));
  }
  return Object.fromEntries(Object.entries(files || {}).map(([name, content]) => [
    safePracticeFileName(name),
    String(content || '').slice(0, 60000)
  ]).filter(([name]) => name));
}

export function runCodePracticeChecks(challenge = {}, files = {}, runResult = {}) {
  const fileMap = normalizeCodePracticeFiles(files);
  const passedChecks = [];
  const failedChecks = [];
  let passedWeight = 0;
  let totalWeight = 0;

  for (const check of challenge.staticChecks || []) {
    const weight = Number(check.weight || 10);
    totalWeight += weight;
    const source = check.file === '*' ? Object.values(fileMap).join('\n\n') : String(fileMap[check.file] || '');
    let passed = false;
    try {
      if (check.regex) passed = new RegExp(check.regex, 'i').test(source);
      if (check.negativeRegex) passed = !new RegExp(check.negativeRegex, 'i').test(source);
    } catch (err) {
      passed = false;
    }
    const item = { id: check.id, label: check.label, weight };
    if (passed) {
      passedWeight += weight;
      passedChecks.push(item);
    } else {
      failedChecks.push(item);
    }
  }

  const testWeights = new Map((challenge.tests || []).map(test => [test.id, Number(test.weight || 10)]));
  for (const test of runResult.tests || []) {
    const weight = testWeights.get(test.id) || Number(test.weight || 10);
    totalWeight += weight;
    const item = { id: test.id, label: test.label || test.id, weight };
    if (test.pass) {
      passedWeight += weight;
      passedChecks.push(item);
    } else {
      failedChecks.push({ ...item, message: test.message });
    }
  }

  const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
  return {
    score,
    correctnessPercent: score,
    passedChecks,
    failedChecks,
    improvements: failedChecks.slice(0, 6).map(check => `Improve: ${check.label}`),
    interviewFeedback: score >= 80
      ? 'Strong attempt. Explain the design tradeoffs, testing strategy, and Salesforce limits in an interview.'
      : 'Good start. Tighten the failed checks, then explain how you would test and bulk-proof the solution.',
    nextPracticeTopics: challenge.track === 'salesforce'
      ? ['Bulkification', 'Test coverage', 'Security review']
      : ['DOM events', 'Pure functions', 'Accessible UI']
  };
}

export function parseCodePracticeAiReview(rawText, fallback = {}) {
  try {
    const jsonText = String(rawText || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(jsonText);
    return {
      score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : fallback.score,
      correctnessPercent: Number.isFinite(Number(parsed.correctnessPercent))
        ? Number(parsed.correctnessPercent)
        : fallback.correctnessPercent,
      passedChecks: Array.isArray(parsed.passedChecks) ? parsed.passedChecks : fallback.passedChecks,
      failedChecks: Array.isArray(parsed.failedChecks) ? parsed.failedChecks : fallback.failedChecks,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : fallback.improvements,
      interviewFeedback: parsed.interviewFeedback || fallback.interviewFeedback,
      nextPracticeTopics: Array.isArray(parsed.nextPracticeTopics) ? parsed.nextPracticeTopics : fallback.nextPracticeTopics
    };
  } catch (err) {
    return fallback;
  }
}

export function buildCodePracticeFilesText(files = {}, perFileLimit = 5000, totalLimit = 14000) {
  const filesMap = normalizeCodePracticeFiles(files);
  return Object.entries(filesMap)
    .map(([name, content]) => `--- ${name} ---\n${String(content).slice(0, perFileLimit)}`)
    .join('\n\n')
    .slice(0, totalLimit);
}

export function buildCodePracticeEvaluationResponse({ challenge = {}, body = {}, deterministic = {}, aiReview = {}, now = new Date() } = {}) {
  const finalScore = Math.round((Number(deterministic.score || 0) * 0.8) + (Number(aiReview.score || 0) * 0.2));
  return {
    success: true,
    challengeId: challenge.id,
    languageTrack: body.languageTrack || challenge.track,
    score: finalScore,
    correctnessPercent: finalScore,
    deterministicScore: deterministic.score,
    aiScore: aiReview.score,
    passedChecks: deterministic.passedChecks,
    failedChecks: deterministic.failedChecks,
    improvements: aiReview.improvements,
    interviewFeedback: aiReview.interviewFeedback,
    nextPracticeTopics: aiReview.nextPracticeTopics,
    evaluatedAt: now.toISOString()
  };
}

export function buildCodePracticeAttempt({ body = {}, challenge = {}, current = getDefaultCodePracticeProgress(), now = new Date() } = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(body.score || body.correctnessPercent || 0))));
  const attempt = {
    challengeId: challenge.id,
    title: challenge.title,
    track: body.languageTrack || challenge.track,
    score,
    correctnessPercent: Math.max(0, Math.min(100, Math.round(Number(body.correctnessPercent || score)))),
    passedChecks: Array.isArray(body.passedChecks) ? body.passedChecks : [],
    failedChecks: Array.isArray(body.failedChecks) ? body.failedChecks : [],
    improvements: Array.isArray(body.improvements) ? body.improvements : [],
    createdAt: now
  };
  const bestScores = { ...(current.bestScores || {}) };
  const previousBest = Number(bestScores[challenge.id] || 0);
  bestScores[challenge.id] = Math.max(previousBest, score);
  const completed = new Set(current.completedChallengeIds || []);
  if (score >= 80) completed.add(challenge.id);
  const codingPractice = {
    attempts: [attempt, ...(current.attempts || [])].slice(0, 50),
    bestScores,
    completedChallengeIds: Array.from(completed),
    lastWorkspace: {
      challengeId: challenge.id,
      languageTrack: body.languageTrack || challenge.track,
      files: normalizeCodePracticeFiles(body.files || {}),
      updatedAt: now
    }
  };
  return { attempt, codingPractice, score };
}
