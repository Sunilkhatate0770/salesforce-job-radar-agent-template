function hasEnvValue(env, name) {
  return Boolean(String(env?.[name] || '').trim());
}

export function buildEnvFlags(env = process.env) {
  return {
    MONGODB_URI: hasEnvValue(env, 'MONGODB_URI'),
    GOOGLE_CLIENT_ID: hasEnvValue(env, 'GOOGLE_CLIENT_ID'),
    OPENAI_API_KEY: hasEnvValue(env, 'OPENAI_API_KEY'),
    GITHUB_REPOSITORY: hasEnvValue(env, 'GITHUB_REPOSITORY') || hasEnvValue(env, 'JOB_RADAR_GITHUB_REPO'),
    GITHUB_TOKEN: hasEnvValue(env, 'GITHUB_TOKEN') || hasEnvValue(env, 'GH_TOKEN') || hasEnvValue(env, 'JOB_RADAR_GITHUB_TOKEN'),
    TELEGRAM_BOT_TOKEN: hasEnvValue(env, 'TELEGRAM_BOT_TOKEN'),
    SUPABASE_URL: hasEnvValue(env, 'SUPABASE_URL'),
    SUPABASE_SERVICE_KEY: hasEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY') || hasEnvValue(env, 'SUPABASE_SERVICE_KEY'),
    TURSO_URL: hasEnvValue(env, 'TURSO_URL') || hasEnvValue(env, 'TURSO_DATABASE_URL'),
    TURSO_AUTH_TOKEN: hasEnvValue(env, 'TURSO_AUTH_TOKEN')
  };
}

export function buildDependencyStatus(env = process.env, mongoConnected = false) {
  const flags = buildEnvFlags(env);
  const githubConfigured = flags.GITHUB_REPOSITORY && flags.GITHUB_TOKEN;
  const supabaseConfigured = flags.SUPABASE_URL && flags.SUPABASE_SERVICE_KEY;
  const tursoConfigured = flags.TURSO_URL && flags.TURSO_AUTH_TOKEN;

  return {
    auth: {
      configured: flags.GOOGLE_CLIENT_ID,
      status: flags.GOOGLE_CLIENT_ID ? 'ready' : 'missing'
    },
    mongo: {
      configured: flags.MONGODB_URI,
      connected: Boolean(mongoConnected),
      required: false,
      status: flags.MONGODB_URI
        ? (mongoConnected ? 'connected' : 'offline')
        : 'not_configured'
    },
    turso: {
      configured: tursoConfigured,
      status: tursoConfigured ? 'configured' : 'missing'
    },
    supabase: {
      configured: supabaseConfigured,
      status: supabaseConfigured ? 'configured' : 'missing'
    },
    githubDispatch: {
      configured: githubConfigured,
      status: githubConfigured ? 'configured' : 'missing'
    },
    openai: {
      configured: flags.OPENAI_API_KEY,
      status: flags.OPENAI_API_KEY ? 'configured' : 'fallback'
    },
    notifications: {
      configured: flags.TELEGRAM_BOT_TOKEN,
      status: flags.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing'
    }
  };
}

export function buildHealthPayload({
  env = process.env,
  mongoConnected = false,
  runtime = env.VERCEL ? 'vercel' : 'local',
  generatedAt = new Date().toISOString()
} = {}) {
  const flags = buildEnvFlags(env);
  const dependencies = buildDependencyStatus(env, mongoConnected);
  const missingCore = ['GOOGLE_CLIENT_ID'].filter(name => !flags[name]);
  const missingRecommendedCloud = [];

  if (!dependencies.supabase.configured) missingRecommendedCloud.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  if (!dependencies.githubDispatch.configured) missingRecommendedCloud.push('JOB_RADAR_GITHUB_REPO/JOB_RADAR_GITHUB_TOKEN');
  if (!dependencies.openai.configured) missingRecommendedCloud.push('OPENAI_API_KEY');
  if (!dependencies.notifications.configured) missingRecommendedCloud.push('TELEGRAM_BOT_TOKEN');

  const dataBackendReady =
    dependencies.mongo.connected ||
    dependencies.turso.configured ||
    dependencies.supabase.configured;

  return {
    success: true,
    service: 'salesforce-job-radar-agent',
    runtime,
    generatedAt,
    mongoConnected: Boolean(mongoConnected),
    env: flags,
    dependencies,
    ready: missingCore.length === 0 && dataBackendReady,
    degraded: missingRecommendedCloud.length > 0 || dependencies.mongo.status === 'offline',
    missingCore,
    missingRecommendedCloud
  };
}

export function buildJobsDegradedPayload({
  env = process.env,
  mongoConnected = false,
  sourceCounts = {}
} = {}) {
  const dependencies = buildDependencyStatus(env, mongoConnected);
  const reasons = [];
  if (dependencies.mongo.configured && !dependencies.mongo.connected) reasons.push('mongo_offline');
  if (!dependencies.supabase.configured) reasons.push('supabase_missing');
  if (!dependencies.githubDispatch.configured) reasons.push('github_dispatch_missing');
  if (!dependencies.openai.configured) reasons.push('openai_fallback');

  const liveSources = Object.entries(sourceCounts)
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([name]) => name);

  return {
    active: reasons.length > 0,
    reasons,
    liveSources,
    statusStore: dependencies.mongo.connected || dependencies.supabase.configured ? 'cloud' : 'local_only',
    scanMode: dependencies.githubDispatch.configured ? 'github_actions' : 'cached',
    aiMode: dependencies.openai.configured ? 'openai' : 'deterministic_fallback'
  };
}

export function getRadarStatusStateKey(userId) {
  return `job_radar_statuses:${String(userId || '').trim()}`;
}

export function isPublicApiPath(path, method = 'GET') {
  const normalizedPath = String(path || '').startsWith('/api/')
    ? String(path || '')
    : `/api/${String(path || '').replace(/^\/+/, '')}`;
  const verb = String(method || 'GET').toUpperCase();
  return normalizedPath === '/api/auth/google' ||
    normalizedPath === '/api/health' ||
    (verb === 'GET' && normalizedPath === '/api/code-practice/challenges');
}
