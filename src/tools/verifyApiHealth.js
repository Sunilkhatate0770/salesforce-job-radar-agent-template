import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 8000;

export const publicRouteProbes = [
  {
    name: 'health',
    method: 'GET',
    path: '/api/health',
    validate(result) {
      return result.status === 200
        && result.json?.success === true
        && typeof result.json?.ready === 'boolean'
        && result.json?.env
        && typeof result.json.env === 'object';
    }
  },
  {
    name: 'code-practice-challenges',
    method: 'GET',
    path: '/api/code-practice/challenges',
    validate(result) {
      return result.status === 200
        && result.json?.success === true
        && Array.isArray(result.json?.challenges)
        && result.json.challenges.length > 0;
    }
  }
];

export const privateRouteProbes = [
  { name: 'jobs-board', method: 'GET', path: '/api/jobs' },
  { name: 'jobs-analytics', method: 'GET', path: '/api/jobs/analytics' },
  { name: 'jobs-list', method: 'GET', path: '/api/jobs/list' },
  { name: 'profile-data', method: 'GET', path: '/api/profile/data' },
  { name: 'study-history', method: 'GET', path: '/api/study/history' },
  { name: 'study-stats', method: 'GET', path: '/api/study/stats' },
  { name: 'study-tasks', method: 'GET', path: '/api/study/tasks' },
  { name: 'jobs-scan', method: 'POST', path: '/api/jobs/scan', body: {} },
  { name: 'profile-save', method: 'POST', path: '/api/profile/save', body: { targetRole: 'Salesforce Developer' } },
  { name: 'job-status-update', method: 'PATCH', path: '/api/jobs/api-health-probe/status', body: { status: 'applied' } }
];

function getBaseUrl() {
  return (process.env.API_VERIFY_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function requestProbe(baseUrl, probe) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.API_VERIFY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  try {
    const hasBody = probe.body !== undefined;
    const response = await fetch(`${baseUrl}${probe.path}`, {
      method: probe.method,
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(probe.body) : undefined,
      signal: controller.signal
    });
    const { json, text } = await readJsonSafely(response);
    return {
      name: probe.name,
      method: probe.method,
      path: probe.path,
      status: response.status,
      ok: response.ok,
      json,
      textPreview: json ? undefined : text.slice(0, 240)
    };
  } catch (error) {
    return {
      name: probe.name,
      method: probe.method,
      path: probe.path,
      status: 0,
      ok: false,
      error: error.name === 'AbortError' ? 'Request timed out' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizePublicProbe(probe, result) {
  const passed = probe.validate(result);
  const details = probe.name === 'health'
    ? {
        ready: result.json?.ready,
        degraded: result.json?.degraded,
        missingCore: result.json?.missingCore || [],
        missingRecommendedCloud: result.json?.missingRecommendedCloud || []
      }
    : {
        version: result.json?.version,
        challengeCount: Array.isArray(result.json?.challenges) ? result.json.challenges.length : 0
      };
  return {
    name: result.name,
    method: result.method,
    path: result.path,
    status: result.status,
    ok: result.ok,
    passed,
    expected: '200 with valid public JSON payload',
    details,
    error: result.error,
    textPreview: result.textPreview
  };
}

function summarizePrivateProbe(result) {
  return {
    name: result.name,
    method: result.method,
    path: result.path,
    status: result.status,
    ok: result.ok,
    passed: result.status === 401,
    expected: '401 without Google auth token',
    error: result.error,
    textPreview: result.textPreview
  };
}

export async function verifyApiHealth() {
  const baseUrl = getBaseUrl();
  const publicResults = [];
  const privateResults = [];

  for (const probe of publicRouteProbes) {
    publicResults.push(summarizePublicProbe(probe, await requestProbe(baseUrl, probe)));
  }

  for (const probe of privateRouteProbes) {
    privateResults.push(summarizePrivateProbe(await requestProbe(baseUrl, probe)));
  }

  const failures = [...publicResults, ...privateResults].filter(result => !result.passed);
  return {
    success: failures.length === 0,
    baseUrl,
    checkedAt: new Date().toISOString(),
    public: publicResults,
    private: privateResults,
    failures: failures.map(({ name, method, path, status, expected, error, textPreview }) => ({
      name,
      method,
      path,
      status,
      expected,
      error,
      textPreview
    }))
  };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  verifyApiHealth()
    .then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      if (!summary.success) process.exitCode = 1;
    })
    .catch(error => {
      console.error(JSON.stringify({
        success: false,
        error: error.message
      }, null, 2));
      process.exitCode = 1;
    });
}
