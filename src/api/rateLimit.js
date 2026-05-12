const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const MAX_BUCKETS = 2000;

const buckets = new Map();

function getHeader(req, name) {
  const headers = req?.headers || {};
  return headers[name] || headers[name.toLowerCase()];
}

function getClientIp(req) {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (Array.isArray(forwardedFor)) return forwardedFor[0]?.split(',')[0]?.trim() || 'unknown';
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown';
}

function getPolicy(path = '', method = 'GET') {
  const normalizedPath = String(path || '').replace(/^\/?api\/?/, '').replace(/^\/+/, '');
  const verb = String(method || 'GET').toUpperCase();
  if (normalizedPath === 'auth/google') return { max: 30, windowMs: DEFAULT_WINDOW_MS };
  if (normalizedPath === 'health') return { max: 90, windowMs: DEFAULT_WINDOW_MS };
  if (normalizedPath === 'client-config') return { max: 90, windowMs: DEFAULT_WINDOW_MS };
  if (normalizedPath === 'code-practice/challenges') return { max: 90, windowMs: DEFAULT_WINDOW_MS };
  if (verb === 'POST' || verb === 'PATCH' || verb === 'DELETE') return { max: 60, windowMs: DEFAULT_WINDOW_MS };
  return { max: DEFAULT_MAX_REQUESTS, windowMs: DEFAULT_WINDOW_MS };
}

function pruneBuckets(now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) return;
  }
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) return;
  }
}

export function checkRateLimit({ req, path = '', method = 'GET', now = Date.now() } = {}) {
  const policy = getPolicy(path, method);
  const ip = getClientIp(req);
  const key = `${ip}:${String(method || 'GET').toUpperCase()}:${String(path || '')}`;
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + policy.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);
  pruneBuckets(now);

  const remaining = Math.max(0, policy.max - bucket.count);
  return {
    allowed: bucket.count <= policy.max,
    limit: policy.max,
    remaining,
    resetAt: bucket.resetAt,
    resetSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

export function applyRateLimit(req, res, path) {
  const result = checkRateLimit({ req, path, method: req?.method });
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetSeconds));
  if (result.allowed) return true;

  res.setHeader('Retry-After', String(result.resetSeconds));
  res.status(429).json({
    success: false,
    error: 'Too many requests. Please wait and try again.',
    retryAfterSeconds: result.resetSeconds
  });
  return false;
}

export function resetRateLimitBuckets() {
  buckets.clear();
}
