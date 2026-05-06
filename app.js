// Version: 2026-04-26-T1200 (Industrial Enrichment v1412)
// =============================================
const RADAR_DEBUG = (() => {
  try {
    return ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
      localStorage.getItem('sf_debug_logs') === '1';
  } catch (e) {
    return false;
  }
})();
if (!RADAR_DEBUG) {
  console.log = function() {};
  console.debug = function() {};
}
const DASHBOARD_VERSION = "2026-04-26-T1200 (app.v1412.js - Production Dashboard Logic)";
console.log('%c Dashboard Version: 2026-04-26-T1200 (EXTREME LOGGING v1412)', 'color: #3b82f6; font-weight: bold; font-size: 1.2rem;');
var TRACKER_KEY = 'sf_prep_study_tracker_v3';
var currentTrackedPage = null;
var trackingStartTime = null;
var trackingInterval = null;
var isPaused = false;
var pausedElapsed = 0;
let globalStudyData = { topics: {}, sessions: [], completedTasks: [] };
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 60000;
let currentUser = null;
let GSI_TOKEN = localStorage.getItem('google_auth_token') || null;
let recentTopicsPage = 0;
const RECENT_PAGE_SIZE = 5;
let premiumRoadmapCache = null;
let premiumReleaseCache = null;
let premiumStaticDataCache = null;
let premiumPreviewBound = false;
let premiumPreviewTimer = null;
let currentUiMode = localStorage.getItem('sf_premium_ui_mode') || 'modern';
let lastSidebarTrigger = null;
const JOB_RADAR_CSS = 'src/styles/job-radar.css?v=20260506-ui-layer';

const featureStylesheetPromises = new Map();

function loadFeatureStylesheet(href) {
  if (!href) return Promise.resolve();
  const existing = document.querySelector(`link[data-feature-style="${href}"], link[href="${href}"]`);
  if (existing) return Promise.resolve();
  if (featureStylesheetPromises.has(href)) return featureStylesheetPromises.get(href);

  const promise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.featureStyle = href;
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });
  featureStylesheetPromises.set(href, promise);
  return promise;
}
// --- CLOUD-NATIVE STATE (v1356) ---
let userBookmarks = []; 
let studyStreak = { current: 0, best: 0, lastDate: "" };
let userRetention = {};
let currentRetentionTopicId = null;
let sessionFeedbackProvided = new Set(); 

// --- JOB RADAR PIPELINE STATE (v1399) ---
window.pipelineJobs = [];
window.activityLog = [];
window.currentBoardFilter = 'all';
window.currentBoardSearch = '';
window.currentRadarSubTab = 'pipeline';
let currentPrepCompany = 'Cognizant';
let cachedHistories = {};
let clientStateLoadedFor = null;
window.JOB_BOARD_PAGE_SIZE = 6;
window.BOOKMARK_PAGE_SIZE = 8;
window.LOG_PAGE_SIZE = 12;
window.HISTORY_PAGE_SIZE = 8;
window.HISTORY_ANALYTICS_PAGE_SIZE = 6;
window.radarBoardPages = { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
window.bookmarksPage = 0;
window.activityLogPage = 0;
window.historyPage = 0;
window.modalTopicPage = 0;

// --- DYNAMIC DATA REGISTRY (MODULAR v1412) ---
let TOPIC_DATA = {};
let PREP_REGISTRY = {};
const DATA_DRIVEN_TOPIC_IDS = new Set([
  'deloitte',
  'accenture',
  'security_5_layers',
  'order_of_execution',
  'flow_master',
  'sales_cloud',
  'service_cloud',
  'experience_cloud'
]);

const STATIC_TOPIC_FALLBACKS = {
  accenture: {
    title: 'Accenture Salesforce Prep',
    subtitle: 'Global delivery, scalable frameworks, LWC, async Apex, and enterprise interview patterns.',
    blocks: [
      { type: 'section', title: 'Scalable Development' },
      { type: 'qa', question: 'Why is a Trigger Framework mandatory in Accenture projects?', answer: '<p class="ans-p">Large delivery teams need one trigger per object, predictable handler order, bulk-safe service classes, and shared logging/error patterns. A framework prevents duplicate logic, recursion bugs, and release conflicts across squads.</p>' },
      { type: 'qa', question: 'What should you revise before an Accenture Salesforce round?', answer: '<p class="ans-p">Prepare LWC communication, Apex bulkification, Queueable/Batch patterns, integration error handling, deployment discipline, and how you coordinate work in agile/global delivery teams.</p>' }
    ]
  },
  deloitte: {
    title: 'Deloitte Salesforce Interview (2026)',
    subtitle: 'Architecture, delivery governance, LDV, security, integration, and senior scenario drills.',
    blocks: [
      { type: 'section', title: 'Enterprise Architecture' },
      { type: 'qa', question: 'How do you handle Large Data Volumes (LDV) in a Deloitte global org?', answer: '<p class="ans-p">Use selective SOQL, indexed filters, skinny tables when justified, async processing, archival strategy, pagination, and careful sharing recalculation planning. Explain how you monitor query plans and avoid lock contention.</p>' },
      { type: 'qa', question: 'What senior topics should you study for Deloitte Salesforce roles?', answer: '<p class="ans-p">Revise integration design, security/sharing, order of execution, Flow vs Apex tradeoffs, release governance, test strategy, and architecture decision records with business impact.</p>' }
    ]
  },
  security_5_layers: {
    title: 'Salesforce 5 Layers of Security',
    subtitle: 'Complete breakdown of organization, object, field, record, and folder/app-level controls.',
    blocks: [
      { type: 'section', title: 'The Security Gates' },
      { type: 'qa', question: 'Layer 1: Organization Level Security?', answer: '<p class="ans-p">Login hours, IP ranges, MFA, password policies, session settings, trusted locations, and identity provider controls protect access before users reach records.</p>' },
      { type: 'qa', question: 'Layer 2: Object Level Security?', answer: '<p class="ans-p">Profiles and permission sets grant object CRUD. In interviews, always separate CRUD from field-level and record-level access.</p>' },
      { type: 'qa', question: 'Layer 3: Field Level Security?', answer: '<p class="ans-p">FLS controls field visibility/editability. In Apex, discuss stripInaccessible, WITH SECURITY_ENFORCED, and user-mode database operations where suitable.</p>' },
      { type: 'qa', question: 'Layer 4: Record Level Security?', answer: '<p class="ans-p">OWD, role hierarchy, sharing rules, teams, territories, manual sharing, and Apex-managed sharing decide which records a user can see.</p>' },
      { type: 'qa', question: 'Layer 5: Folder and App Access?', answer: '<p class="ans-p">Reports, dashboards, email templates, apps, tabs, and permission set groups complete the user access model.</p>' }
    ]
  },
  order_of_execution: {
    title: 'Order of Execution',
    subtitle: 'Master the Salesforce save cycle from validation through commit and post-commit automation.',
    blocks: [
      { type: 'section', title: 'Critical Sequence' },
      { type: 'qa', question: 'What happens before triggers run?', answer: '<p class="ans-p">Salesforce loads the original record, runs basic system validation, and prepares the record values. Before triggers then run before custom validation rules.</p>' },
      { type: 'qa', question: 'Explain the interview-safe order of execution.', answer: '<p class="ans-p">Mention system validation, before triggers, custom validation, duplicate rules, database save without commit, after triggers, assignment/auto-response/escalation/workflow, Flow/process automation, roll-up recalculation, sharing, commit, and post-commit async actions.</p>' }
    ]
  },
  flow_master: {
    title: 'Flow Master Class',
    subtitle: 'Industrial Flow patterns, fault paths, invocable Apex, orchestration, and automation decisions.',
    blocks: [
      { type: 'section', title: 'Logic and Automation' },
      { type: 'qa', question: 'When should you use Screen Flow vs Record-Triggered Flow?', answer: '<p class="ans-p">Use Screen Flow for guided user input and Record-Triggered Flow for background automation on DML events. Explain before-save for fast field updates and after-save for related records/actions.</p>' },
      { type: 'qa', question: 'What makes a Flow production-ready?', answer: '<p class="ans-p">Fault paths, subflows, naming standards, entry criteria, bulk-safe element usage, debug logs, error notifications, and clear handoff rules between Flow and Apex.</p>' }
    ]
  },
  sales_cloud: {
    title: 'Sales Cloud Architecture',
    subtitle: 'Lead-to-cash, pipeline management, forecasting, teams, territories, and revenue operations.',
    blocks: [
      { type: 'section', title: 'Revenue Operations' },
      { type: 'qa', question: 'What are Opportunity Splits?', answer: '<p class="ans-p">Opportunity Splits let multiple contributors receive credit for an opportunity. Explain revenue splits, overlay splits, forecasts, and how sales teams use them for attribution.</p>' },
      { type: 'qa', question: 'What Sales Cloud topics are common in interviews?', answer: '<p class="ans-p">Lead conversion, account/contact/opportunity model, products and price books, forecasting, territories, duplicate management, approval process, and reporting architecture.</p>' }
    ]
  },
  service_cloud: {
    title: 'Service Cloud Architecture',
    subtitle: 'Case lifecycle, entitlement management, Omni-Channel, console productivity, and support operations.',
    blocks: [
      { type: 'section', title: 'Service Intelligence' },
      { type: 'qa', question: 'What is the difference between Entitlements and Service Contracts?', answer: '<p class="ans-p">Service Contracts represent the commercial support agreement. Entitlements define the support rights and SLA milestones customers receive under that agreement.</p>' },
      { type: 'qa', question: 'How does Omni-Channel routing work?', answer: '<p class="ans-p">Omni-Channel pushes work items to agents based on service channels, routing configurations, capacity, skills, and presence status.</p>' }
    ]
  },
  experience_cloud: {
    title: 'Experience Cloud Architecture',
    subtitle: 'Secure portals, guest user access, sharing sets, branding, performance, and external identity.',
    blocks: [
      { type: 'section', title: 'Portal and Site Architecture' },
      { type: 'qa', question: 'Explain Guest User Security in Experience Cloud.', answer: '<p class="ans-p">Guest users cannot own records and should have minimum permissions. Use secure guest access, sharing rules/sharing sets, and avoid exposing sensitive Apex or unauthenticated data.</p>' },
      { type: 'qa', question: 'What should you revise for Experience Cloud interviews?', answer: '<p class="ans-p">External users, profiles/permission sets, sharing sets, login and SSO, CMS, LWR vs Aura sites, record access, site performance, and deployment strategy.</p>' }
    ]
  }
};

async function loadKnowledgeData(topicId) {
  if (TOPIC_DATA[topicId]) return TOPIC_DATA[topicId];
  const structuredContent = window.SFJR_SALESFORCE_CONTENT;
  const structuredSection = structuredContent?.getSection?.(topicId);
  if (structuredSection && typeof structuredContent.asKnowledgeTopic === 'function') {
    const topic = structuredContent.asKnowledgeTopic(structuredSection);
    TOPIC_DATA[topicId] = topic;
    return topic;
  }
  try {
    const res = await apiFetch(`/api/knowledge/${topicId}`);
    if (res.ok) {
      const data = await res.json();
      TOPIC_DATA[topicId] = data;
      return data;
    }
  } catch (err) {
    console.error(`[KNOWLEDGE] Failed to load ${topicId}:`, err);
  }

  const staticSources = [
    '/data/topics/master_knowledge.json',
    `/data/topics/${topicId}.json`
  ];

  for (const source of staticSources) {
    try {
      const res = await fetch(source, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const topicData = source.includes('master_knowledge') ? data?.[topicId] : data;
      if (topicData) {
        TOPIC_DATA[topicId] = topicData;
        return topicData;
      }
    } catch (fallbackErr) {
      console.warn(`[KNOWLEDGE] Static fallback failed for ${topicId} from ${source}:`, fallbackErr.message);
    }
  }

  if (STATIC_TOPIC_FALLBACKS[topicId]) {
    TOPIC_DATA[topicId] = STATIC_TOPIC_FALLBACKS[topicId];
    return STATIC_TOPIC_FALLBACKS[topicId];
  }

  return null;
}



window.handleCredentialResponse = function(response) {
  processGAuth(response);
};

window.processGAuth = async function(response) {
  const token = response.credential;
  const loginMode = getLoginUiModeIntent() || currentUiMode || 'modern';
  sessionStorage.setItem('sf_login_ui_mode_intent', loginMode);
  applyUiMode(loginMode);
  localStorage.setItem('google_auth_token', token);
  GSI_TOKEN = token;
  
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      loadUserScopedClientState();
      const overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.style.display = 'none';
      
      renderUserProfile(currentUser);
      syncDashboard();
      showPage(loginMode === 'classic' ? 'schedule' : 'profile_match');
    } else {
      showToast('Authentication failed: ' + (data.error || 'Check Google Client ID'), true);
    }
  } catch (e) {
    if (e.message && e.message.includes('BLOCKED_BY_CLIENT')) return;
    console.error('Auth Error:', e);
    showToast('Login Service Unavailable', true);
  }
};

// Check for pending auth from proxy
if (window._pendingGAuth) {
  window.processGAuth(window._pendingGAuth);
}

function generateInitialsAvatar(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 120, 120);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(60, 60, 60, 0, Math.PI * 2);
  ctx.fill();
  
  // Initials text
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2 
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, 60, 62);
  
  return canvas.toDataURL('image/png');
}

/* UI templates moved to components.js */

function toggleFloatingDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('floatDropdownMenu');
  if (!menu) return;
  const isVisible = menu.style.display === 'flex';
  menu.style.display = isVisible ? 'none' : 'flex';
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
  const menu = document.getElementById('floatDropdownMenu');
  if (menu) menu.style.display = 'none';
});

function signOut() {
  // Clear all user state before reload (v1413)
  localStorage.removeItem('google_auth_token');
  sessionStorage.removeItem('sf_login_ui_mode_intent');
  currentUser = null;
  cachedUserProfile = null;
  GSI_TOKEN = null;
  clientStateLoadedFor = null;

  // Clear floating profile container immediately
  const container = document.getElementById('floatingProfileContainer');
  if (container) container.style.display = 'none';
  const sidebarWrap = document.getElementById('userProfile');
  if (sidebarWrap) sidebarWrap.style.display = 'none';

  location.reload();
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('google_auth_token');
  const method = String(options.method || 'GET').toUpperCase();
  const path = (() => {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (e) {
      return String(url || '').split('?')[0];
    }
  })();
  const isPublicApi = window.RadarCloud?.isPublicApi
    ? window.RadarCloud.isPublicApi(url, method)
    : (path === '/api/auth/google' || path === '/api/health' || (method === 'GET' && path === '/api/code-practice/challenges'));
  const hasToken = token && token !== 'null' && token !== 'undefined';
  if (!hasToken && path.startsWith('/api/') && !isPublicApi) {
    return new Response(JSON.stringify({ success: false, error: 'login_required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'X-Local-Auth-State': 'login_required' }
    });
  }
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  if (method !== 'GET' && options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

function normalizeCsvInput(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function topicConfigName(topicId) {
  const cfg = typeof topicConfig !== 'undefined' ? topicConfig[topicId] : null;
  if (cfg?.name) return cfg.name;
  return String(topicId || 'Study Topic')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function clampPremiumExperience(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function normalizeUiMode(mode) {
  return mode === 'classic' ? 'classic' : 'modern';
}

function getLoginUiModeIntent() {
  const mode = sessionStorage.getItem('sf_login_ui_mode_intent');
  return mode === 'classic' || mode === 'modern' ? mode : null;
}

function syncLoginUiModeControls(mode = currentUiMode) {
  const normalized = normalizeUiMode(mode);
  const checkbox = document.getElementById('loginPremiumMode');
  const title = document.getElementById('loginModeTitle');
  const desc = document.getElementById('loginModeDescription');
  if (checkbox) checkbox.checked = normalized !== 'classic';
  if (title) title.textContent = normalized === 'classic' ? 'Legacy / Classic UI' : '✅ New Premium UI';
  if (desc) {
    desc.textContent = normalized === 'classic'
      ? 'Use the familiar study sections and old navigation rhythm.'
      : 'Personalized roadmap & market intelligence.';
  }
}

function applyUiMode(mode) {
  currentUiMode = normalizeUiMode(mode);
  if (document.body) {
    document.body.classList.toggle('ui-classic', currentUiMode === 'classic');
    document.body.classList.toggle('ui-modern', currentUiMode !== 'classic');
  }
  localStorage.setItem('sf_premium_ui_mode', currentUiMode);
  const label = document.getElementById('uiModeToggleLabel');
  const btn = document.getElementById('uiModeToggle');
  if (label) label.textContent = currentUiMode === 'classic' ? 'Classic' : 'Modern';
  if (btn) btn.setAttribute('aria-pressed', currentUiMode === 'classic' ? 'true' : 'false');
  syncLoginUiModeControls(currentUiMode);
}

window.setLoginUiMode = function(mode) {
  const normalized = normalizeUiMode(mode);
  sessionStorage.setItem('sf_login_ui_mode_intent', normalized);
  applyUiMode(normalized);
};

window.setLoginUiModeFromCheckbox = function(input) {
  window.setLoginUiMode(input?.checked ? 'modern' : 'classic');
};

async function persistUiMode(mode) {
  const normalized = normalizeUiMode(mode);
  sessionStorage.setItem('sf_login_ui_mode_intent', normalized);
  applyUiMode(normalized);
  if (!cachedUserProfile) return;
  cachedUserProfile.uiMode = currentUiMode;
  try {
    await apiFetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cachedUserProfile)
    });
    if (getLoginUiModeIntent() === normalized) {
      sessionStorage.removeItem('sf_login_ui_mode_intent');
    }
  } catch (e) {
    console.warn('[UI MODE] Could not persist preference yet:', e.message);
  }
}

window.toggleUiMode = function() {
  persistUiMode(currentUiMode === 'classic' ? 'modern' : 'classic');
};

function hydratePremiumSetupForm(profile = {}) {
  const expEl = document.getElementById('premiumExperienceYears');
  const targetEl = document.getElementById('premiumTargetDesignation');
  const currentEl = document.getElementById('premiumCurrentDesignation');
  const skillsEl = document.getElementById('premiumSkills');
  
  // Use both experienceYears and yearsOfExperience for maximum compatibility
  const expValue = profile.experienceYears ?? profile.yearsOfExperience ?? 1;
  if (expEl) expEl.value = String(clampPremiumExperience(expValue));
  
  if (targetEl && (profile.targetDesignation || profile.targetRole)) {
    targetEl.value = profile.targetDesignation || profile.targetRole;
  }
  if (currentEl) currentEl.value = profile.currentDesignation || profile.currentRole || '';
  if (skillsEl) skillsEl.value = Array.isArray(profile.skills) ? profile.skills.join(', ') : '';
}

function readPremiumFormProfile(base = {}) {
  const expEl = document.getElementById('premiumExperienceYears');
  const targetEl = document.getElementById('premiumTargetDesignation');
  const currentEl = document.getElementById('premiumCurrentDesignation');
  const skillsEl = document.getElementById('premiumSkills');
  const targetDesignation = targetEl?.value || base.targetDesignation || base.targetRole || 'Salesforce Developer';
  const currentDesignation = currentEl?.value?.trim() || base.currentDesignation || base.currentRole || '';
  return {
    ...(base || {}),
    experienceYears: clampPremiumExperience(expEl?.value || base.experienceYears || base.yearsOfExperience || 1),
    targetDesignation,
    targetRole: targetDesignation,
    currentDesignation,
    currentRole: currentDesignation,
    skills: skillsEl ? normalizeCsvInput(skillsEl.value) : normalizeCsvInput(Array.isArray(base.skills) ? base.skills.join(', ') : ''),
    uiMode: currentUiMode
  };
}

function scoreDesignationLabel(normalized, label) {
  const normalizedLabel = String(label || '').toLowerCase().trim();
  if (!normalizedLabel) return 0;
  if (normalized === normalizedLabel) return 10000 + normalizedLabel.length;
  if (normalized.includes(normalizedLabel)) return 1000 + normalizedLabel.length;
  if (normalizedLabel.includes(normalized)) return 500 + normalized.length;
  return 0;
}

function inferStaticDesignation(rawDesignation, designationsData = {}) {
  const value = String(rawDesignation || '').trim();
  const designations = designationsData.designations || [];
  if (!value) return designations[0] || null;
  const normalized = value.toLowerCase();
  const ranked = designations.map(item => {
    const labels = [item.label, ...(item.aliases || [])].map(label => String(label || '').toLowerCase());
    return { item, score: Math.max(...labels.map(label => scoreDesignationLabel(normalized, label))) };
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
  return ranked[0]?.item || {
    id: normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_designation',
    label: value,
    track: 'Custom',
    primaryTopicIds: []
  };
}

async function loadStaticPremiumData() {
  if (premiumStaticDataCache) return premiumStaticDataCache;
  const [roadmaps, designations, releases, trailhead] = await Promise.all([
    fetch('/data/career-roadmaps.json').then(res => {
      if (!res.ok) throw new Error('career roadmaps unavailable');
      return res.json();
    }),
    fetch('/data/designation-map.json').then(res => {
      if (!res.ok) throw new Error('designation map unavailable');
      return res.json();
    }),
    fetch('/data/salesforce-releases.json').then(res => {
      if (!res.ok) throw new Error('release data unavailable');
      return res.json();
    }),
    fetch('/data/trailhead-resources.json').then(res => {
      if (!res.ok) throw new Error('Trailhead resources unavailable');
      return res.json();
    })
  ]);
  premiumStaticDataCache = { roadmaps, designations, releases, trailhead };
  return premiumStaticDataCache;
}

async function buildStaticPremiumRoadmap(profile = {}) {
  const { roadmaps, designations, releases, trailhead } = await loadStaticPremiumData();
  const experienceYears = clampPremiumExperience(profile.experienceYears || profile.yearsOfExperience || 1);
  const designation = inferStaticDesignation(
    profile.targetDesignation || profile.targetRole || profile.currentDesignation || profile.currentRole,
    designations
  );
  const baseRoadmap = roadmaps.years?.[String(experienceYears)] || roadmaps.years?.['1'] || {};
  const roadmapTopicIds = new Set(baseRoadmap.topicIds || []);
  const mergedTopics = [...(baseRoadmap.topics || [])];

  for (const topicId of designation?.primaryTopicIds || []) {
    if (!roadmapTopicIds.has(topicId)) {
      mergedTopics.push({
        topicId,
        topic: topicConfigName(topicId),
        category: designation?.track || 'Designation',
        priority: 'medium',
        estimatedHours: 6,
        reason: `Added because it is important for ${designation?.label || 'the selected designation'}.`
      });
      roadmapTopicIds.add(topicId);
    }
  }

  const releaseCategories = new Set(baseRoadmap.releaseFocus || []);
  const releaseItems = (releases.items || []).filter(item => {
    const levelMatch = (item.experienceLevels || []).includes(experienceYears);
    const categoryMatch = releaseCategories.has(item.category);
    const designationMatch = (item.designations || []).some(d =>
      String(d).toLowerCase() === String(designation?.label || '').toLowerCase()
    );
    return levelMatch && (categoryMatch || designationMatch);
  });
  const topicSet = new Set(mergedTopics.map(topic => topic.topicId));
  const resources = (trailhead.resources || []).filter(resource => {
    const yearMatch = (resource.recommendedYears || []).includes(experienceYears);
    const topicMatch = (resource.topicIds || []).some(topicId => topicSet.has(topicId));
    return yearMatch && topicMatch;
  });

  return {
    success: true,
    previewMode: true,
    experienceYears,
    designation,
    roadmap: {
      ...baseRoadmap,
      topics: mergedTopics,
      topicIds: Array.from(roadmapTopicIds)
    },
    releaseFocus: {
      activeRelease: releases.activeRelease || {},
      items: releaseItems.length ? releaseItems : (releases.items || []).filter(item =>
        (item.experienceLevels || []).includes(experienceYears)
      ).slice(0, 6)
    },
    trailheadResources: resources.slice(0, 8),
    generatedAt: new Date().toISOString()
  };
}

async function refreshPremiumRoadmapMount() {
  const mount = document.getElementById('premiumRoadmapMount');
  if (mount) mount.innerHTML = '<div class="premium-loading">Refreshing roadmap preview...</div>';
  premiumRoadmapCache = null;
  premiumReleaseCache = null;
  try {
    const data = await buildStaticPremiumRoadmap(readPremiumFormProfile(cachedUserProfile || {}));
    premiumRoadmapCache = data;
    if (mount) mount.innerHTML = renderPremiumRoadmapSection(data) + renderPremiumReleaseFocusSection(data);
  } catch (err) {
    console.warn('[PREMIUM] Preview refresh failed:', err.message);
    if (mount) mount.innerHTML = '<div class="premium-empty">Roadmap preview is unavailable right now.</div>';
  }
}

function bindPremiumPreviewControls() {
  if (premiumPreviewBound) return;
  premiumPreviewBound = true;
  ['premiumExperienceYears', 'premiumTargetDesignation', 'premiumCurrentDesignation', 'premiumSkills'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = el.tagName === 'INPUT' ? 'input' : 'change';
    el.addEventListener(eventName, () => {
      clearTimeout(premiumPreviewTimer);
      premiumPreviewTimer = setTimeout(refreshPremiumRoadmapMount, 180);
    });
  });
}

window.savePremiumProfileSetup = async function() {
  const expEl = document.getElementById('premiumExperienceYears');
  const targetEl = document.getElementById('premiumTargetDesignation');
  const currentEl = document.getElementById('premiumCurrentDesignation');
  const skillsEl = document.getElementById('premiumSkills');
  const payload = {
    ...(cachedUserProfile || {}),
    experienceYears: clampPremiumExperience(expEl ? expEl.value : 1),
    targetDesignation: targetEl ? targetEl.value : 'Salesforce Developer',
    targetRole: targetEl ? targetEl.value : 'Salesforce Developer',
    currentDesignation: currentEl ? currentEl.value.trim() : '',
    currentRole: currentEl ? currentEl.value.trim() : '',
    skills: normalizeCsvInput(skillsEl ? skillsEl.value : ''),
    uiMode: currentUiMode
  };

  try {
    const res = await apiFetch('/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Profile save failed');
    cachedUserProfile = payload;
    premiumRoadmapCache = null;
    premiumReleaseCache = null;
    showToast('Premium roadmap generated for your experience level.', 'green');
    await loadUserProfile();
    await loadPremiumRoadmap(true);
    await loadReleaseCenter(true);
    showPage('profile_match');
  } catch (e) {
    console.error('[PREMIUM] Setup save failed:', e);
    cachedUserProfile = { ...payload, isPreviewProfile: true };
    premiumRoadmapCache = null;
    premiumReleaseCache = null;
    renderProfileMatchPage(cachedUserProfile);
    await loadReleaseCenter(true).catch(() => {});
    showToast('Roadmap preview generated. Sign in with Google to save it.', 'green');
  }
};

function ensureProfileImportModal() {
  if (document.getElementById('profileImportModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="profileImportModal" class="premium-modal" style="display:none;">
      <div class="premium-modal-box">
        <button class="premium-modal-close" onclick="closeProfileImport()" aria-label="Close">&times;</button>
        <div class="premium-eyebrow">Safe Profile Import</div>
        <h2 id="profileImportTitle">Import Profile Text</h2>
        <p class="premium-note">Paste resume, LinkedIn profile text, or Naukri profile text. Do not paste passwords, OTPs, or private account secrets.</p>
        <textarea id="profileImportText" rows="10" placeholder="Paste profile or resume text here..."></textarea>
        <input type="hidden" id="profileImportSource" value="manual">
        <div class="premium-modal-actions">
          <button class="premium-primary-btn" onclick="submitProfileImport()">Analyze & Save</button>
          <button class="premium-secondary-btn" onclick="closeProfileImport()">Cancel</button>
        </div>
      </div>
    </div>
  `);
}

window.openProfileImport = function(source = 'manual') {
  ensureProfileImportModal();
  const modal = document.getElementById('profileImportModal');
  const title = document.getElementById('profileImportTitle');
  const sourceEl = document.getElementById('profileImportSource');
  const textEl = document.getElementById('profileImportText');
  const label = source === 'linkedin' ? 'LinkedIn Profile Import' : source === 'naukri' ? 'Naukri Profile Import' : 'Manual Profile Import';
  if (title) title.textContent = label;
  if (sourceEl) sourceEl.value = source;
  if (textEl) textEl.value = '';
  if (modal) modal.style.display = 'flex';
};

window.closeProfileImport = function() {
  const modal = document.getElementById('profileImportModal');
  if (modal) modal.style.display = 'none';
};

window.submitProfileImport = async function() {
  const textEl = document.getElementById('profileImportText');
  const sourceEl = document.getElementById('profileImportSource');
  const profileText = textEl ? textEl.value.trim() : '';
  if (!profileText) {
    showToast('Paste profile or resume text first.', 'red');
    return;
  }
  try {
    const res = await apiFetch('/api/profile/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: sourceEl ? sourceEl.value : 'manual',
        text: profileText,
        targetDesignation: document.getElementById('premiumTargetDesignation')?.value || cachedUserProfile?.targetDesignation
      })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || 'Import failed');
    closeProfileImport();
    premiumRoadmapCache = null;
    premiumReleaseCache = null;
    showToast('Profile import analyzed safely.', 'green');
    await loadUserProfile();
    await loadPremiumRoadmap(true);
    await loadReleaseCenter(true);
  } catch (e) {
    console.error('[PREMIUM] Import failed:', e);
    showToast('Profile import failed. Try a smaller text sample.', 'red');
  }
};

async function loadPremiumRoadmap(force = false) {
  if (premiumRoadmapCache && !force) return premiumRoadmapCache;
  const profileForPreview = readPremiumFormProfile(cachedUserProfile || {});
  try {
    const res = await apiFetch('/api/roadmap?cb=' + Date.now());
    if (!res.ok) throw new Error('Roadmap API unavailable');
    premiumRoadmapCache = await res.json();
  } catch (err) {
    console.warn('[PREMIUM] Using local curated roadmap preview:', err.message);
    premiumRoadmapCache = await buildStaticPremiumRoadmap(profileForPreview);
  }
  return premiumRoadmapCache;
}

async function loadReleaseCenter(force = false) {
  if (premiumReleaseCache && !force) return premiumReleaseCache;
  try {
    const res = await apiFetch('/api/releases/current?cb=' + Date.now());
    if (!res.ok) throw new Error('Release API unavailable');
    premiumReleaseCache = await res.json();
  } catch (err) {
    console.warn('[RELEASES] Using local curated release preview:', err.message);
    const [{ releases }, intelligence] = await Promise.all([
      loadStaticPremiumData(),
      buildStaticPremiumRoadmap(readPremiumFormProfile(cachedUserProfile || {}))
    ]);
    premiumReleaseCache = {
      success: true,
      previewMode: true,
      activeRelease: releases.activeRelease || {},
      items: releases.items || [],
      personalizedItems: intelligence.releaseFocus?.items || [],
      experienceYears: intelligence.experienceYears,
      designation: intelligence.designation
    };
  }
  renderReleaseCenterPage(premiumReleaseCache);
  renderRecentTopicsPanel();
  return premiumReleaseCache;
}

function getCurrentUserId() {
  const raw = currentUser?.id || currentUser?.googleId || currentUser?.email || 'guest';
  return String(raw).toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
}

function scopedStorageKey(key) {
  return `sfjr:${getCurrentUserId()}:${key}`;
}

function migrateLegacyUserStorage() {
  const userId = getCurrentUserId();
  const sentinel = scopedStorageKey('migration:v2');
  if (localStorage.getItem(sentinel) === 'done') return;
  const mappings = [
    ['pipelineJobs', 'sfpipe2026v3', true],
    ['activityLog', 'sfActivityLog', true],
    ['bookmarks', 'sf_bookmarks', true],
    ['recentTopics', 'sf_recent_topics', true],
    ['last_active_tab', 'last_active_tab', false],
    ['premium_ui_mode', 'sf_premium_ui_mode', false]
  ];
  mappings.forEach(([scopedKey, legacyKey, isJson]) => {
    const target = scopedStorageKey(scopedKey);
    if (localStorage.getItem(target) !== null) return;
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue === null) return;
    if (isJson) {
      try {
        JSON.parse(legacyValue);
        localStorage.setItem(target, legacyValue);
      } catch (err) {
        localStorage.setItem(target, JSON.stringify([]));
      }
      return;
    }
    localStorage.setItem(target, legacyValue);
  });
  localStorage.setItem(sentinel, 'done');
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function readScopedJson(key, fallback, legacyKey) {
  const scopedValue = readJsonStorage(scopedStorageKey(key), undefined);
  if (typeof scopedValue !== 'undefined') return scopedValue;
  if (legacyKey) return readJsonStorage(legacyKey, fallback);
  return fallback;
}

function writeScopedJson(key, value) {
  localStorage.setItem(scopedStorageKey(key), JSON.stringify(value));
}

function getScopedItem(key, fallback = null, legacyKey) {
  const scopedValue = localStorage.getItem(scopedStorageKey(key));
  if (scopedValue !== null) return scopedValue;
  if (legacyKey) {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) return legacyValue;
  }
  return fallback;
}

function setScopedItem(key, value) {
  localStorage.setItem(scopedStorageKey(key), String(value));
}

const RECENT_TOPIC_LIMIT = 14;

function getRecentTopicItems() {
  const recentIds = readScopedJson('recentTopics', [], 'sf_recent_topics');
  if (!Array.isArray(recentIds)) return [];
  return recentIds
    .filter(id => topicConfig[id] && !topicConfig[id].noTimer)
    .slice(0, RECENT_TOPIC_LIMIT)
    .map(id => ({
      id,
      name: topicConfig[id].name || topicConfigName(id),
      group: topicConfig[id].group || 'Topic'
    }));
}

function getSidebarBadge(item) {
  if (!item || !item.badgeSource) return '';
  if (item.badgeSource === 'bookmarks') {
    const count = Array.isArray(userBookmarks) ? userBookmarks.length : 0;
    return count > 0 ? String(count) : '';
  }
  if (item.badgeSource === 'release') {
    return premiumReleaseCache?.activeRelease?.releaseName || '';
  }
  return '';
}

function getNavigationQuestionCount(item) {
  const section = window.SFJR_SALESFORCE_CONTENT?.getSection?.(item.id);
  return section?.questionCount ? `${section.questionCount} Q` : '';
}

function renderSidebarNavigation(options = {}) {
  const host = document.getElementById('sidebarNavContent');
  if (!host) return;
  const shouldScrollActive = options.scrollActive === true;
  const groups = Array.isArray(window.SFJR_NAVIGATION) ? window.SFJR_NAVIGATION : [];
  const recentItems = getRecentTopicItems();
  const recentHtml = recentItems.length ? `
    <section class="nav-recent-panel" aria-label="Recently used study topics">
      <div class="nav-recent-header">
        <div class="nav-recent-title">Recently Used</div>
        ${recentItems.length > RECENT_PAGE_SIZE ? `
          <div class="nav-recent-pager">
            <button type="button" class="nav-recent-btn" data-recent-delta="-1" onclick="changeRecentPage(-1, event)" aria-label="Previous recently used topic">&larr;</button>
            <button type="button" class="nav-recent-btn" data-recent-delta="1" onclick="changeRecentPage(1, event)" aria-label="Next recently used topic">&rarr;</button>
          </div>
        ` : ''}
      </div>
      <div class="nav-recent-list" tabindex="0">
        ${recentItems
          .slice(recentTopicsPage * RECENT_PAGE_SIZE, recentTopicsPage * RECENT_PAGE_SIZE + RECENT_PAGE_SIZE)
          .map(item => `
            <button type="button" class="nav-recent-chip" onclick="showPage(decodeURIComponent('${encodeInlineArg(item.id)}'))" title="${escapeHtml(item.name)}">
              <span>${escapeHtml(item.name)}</span>
              <b>${escapeHtml(item.group)}</b>
            </button>
          `).join('')}
      </div>
    </section>
  ` : '';

  host.innerHTML = `
    ${recentHtml}
    ${groups.map((group, groupIndex) => {
      const sectionId = `nav-group-${group.id}`;
      const isOpen = groupIndex < 2 || group.items.some(item => item.id === getScopedItem('last_active_tab', 'profile_match'));
      return `
        <section class="nav-parent-section nav-config-section" data-nav-group="${escapeHtml(group.id)}">
          <button type="button" class="nav-parent-title nav-group-toggle" aria-expanded="${String(isOpen)}" aria-controls="${sectionId}" onclick="toggleNavGroup('${escapeHtml(group.id)}')">
            <span>${escapeHtml(group.label)}</span>
            <span class="nav-group-chevron" aria-hidden="true">⌄</span>
          </button>
          <div id="${sectionId}" class="nav-group-items" ${isOpen ? '' : 'hidden'}>
            ${group.items.map(item => {
              const badge = getSidebarBadge(item) || getNavigationQuestionCount(item);
              return `
                <button type="button" class="nav-item" data-page-id="${escapeHtml(item.id)}" data-nav-search="${escapeHtml([item.label, item.description || '', ...(item.tags || [])].join(' '))}" onclick="${item.id === 'bookmarks_page' ? 'showBookmarks()' : `showPage('${escapeHtml(item.id)}')`}">
                  <span class="nav-item-label">${escapeHtml(item.label)}</span>
                  ${badge ? `<span class="count">${escapeHtml(badge)}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('')}
  `;
  updateSidebarActiveState(getScopedItem('last_active_tab', 'profile_match'), { scrollIntoView: shouldScrollActive });
}

function renderRecentTopicsPanel() {
  const allItems = getRecentTopicItems();
  const totalPages = Math.max(1, Math.ceil(allItems.length / RECENT_PAGE_SIZE));
  if (recentTopicsPage >= totalPages) recentTopicsPage = 0;
  if (recentTopicsPage < 0) recentTopicsPage = totalPages - 1;
  renderSidebarNavigation();
}

window.changeRecentPage = function(delta, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const sidebar = document.getElementById('sidebar');
  const previousScrollTop = sidebar ? sidebar.scrollTop : 0;
  recentTopicsPage += delta;
  renderRecentTopicsPanel();
  if (!sidebar) return;

  const restoreSidebarPosition = () => {
    sidebar.scrollTop = previousScrollTop;
    const recentPanel = sidebar.querySelector('.nav-recent-panel');
    const searchWrap = sidebar.querySelector('.search-wrap');
    if (recentPanel && searchWrap) {
      const panelTop = recentPanel.getBoundingClientRect().top;
      const safeTop = searchWrap.getBoundingClientRect().bottom + 8;
      if (panelTop < safeTop) {
        sidebar.scrollTop = Math.max(0, sidebar.scrollTop - Math.ceil(safeTop - panelTop));
      }
    }
    const pagerButton = sidebar.querySelector(`.nav-recent-btn[data-recent-delta="${delta}"]`);
    if (pagerButton && typeof pagerButton.focus === 'function') {
      pagerButton.focus({ preventScroll: true });
    }
  };

  restoreSidebarPosition();
  requestAnimationFrame(restoreSidebarPosition);
};

window.toggleNavGroup = function(groupId) {
  const section = document.querySelector(`[data-nav-group="${CSS.escape(String(groupId))}"]`);
  if (!section) return;
  const button = section.querySelector('.nav-group-toggle');
  const panel = section.querySelector('.nav-group-items');
  const isOpen = button?.getAttribute('aria-expanded') === 'true';
  if (button) button.setAttribute('aria-expanded', String(!isOpen));
  if (panel) panel.hidden = isOpen;
};

function updateSidebarActiveState(id, options = {}) {
  const shouldScrollIntoView = options.scrollIntoView !== false;
  document.querySelectorAll('#sidebar .nav-item').forEach(function(n) {
    const isActive = n.getAttribute('data-page-id') === id;
    n.classList.toggle('active', isActive);
    if (isActive) {
      const panel = n.closest('.nav-group-items');
      const section = n.closest('.nav-parent-section');
      if (panel) panel.hidden = false;
      const toggle = section?.querySelector('.nav-group-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      if (shouldScrollIntoView) {
        setTimeout(() => n.scrollIntoView({ block: 'nearest' }), 0);
      }
    }
  });
}

function ensureNavigationTopicConfig() {
  const groups = Array.isArray(window.SFJR_NAVIGATION) ? window.SFJR_NAVIGATION : [];
  groups.flatMap(group => group.items || []).forEach(item => {
    if (!topicConfig[item.id]) {
      topicConfig[item.id] = {
        name: item.label,
        recommended: item.requiresAuth ? 0 : 45,
        group: groups.find(group => (group.items || []).some(navItem => navItem.id === item.id))?.label || 'Salesforce',
        noTimer: item.requiresAuth || item.id === 'bookmarks_page'
      };
    } else if (item.label && topicConfig[item.id].name !== item.label) {
      topicConfig[item.id].name = item.label;
    }
    if (window.SFJR_SALESFORCE_CONTENT?.getSection?.(item.id)) {
      DATA_DRIVEN_TOPIC_IDS.add(item.id);
    }
  });
}

function trackRecentTopic(id) {
  if (!topicConfig[id] || topicConfig[id].noTimer) {
    renderRecentTopicsPanel();
    return;
  }

  const recentIds = readScopedJson('recentTopics', [], 'sf_recent_topics');
  const next = [
    id,
    ...(Array.isArray(recentIds) ? recentIds.filter(existingId => existingId !== id) : [])
  ].slice(0, RECENT_TOPIC_LIMIT);

  writeScopedJson('recentTopics', next);
  renderRecentTopicsPanel();
}

window.markContentProgress = function(sectionId, status) {
  const progress = readScopedJson('progress', {}, 'sf_progress');
  progress[sectionId] = {
    ...(progress[sectionId] || {}),
    sectionId,
    status,
    updatedAt: new Date().toISOString()
  };
  writeScopedJson('progress', progress);
  showToast(status === 'mastered' ? 'Marked as mastered for your profile.' : 'Marked as revised for your profile.');
};

function removeScopedStorage(key, legacyKey) {
  localStorage.removeItem(scopedStorageKey(key));
  if (legacyKey) localStorage.removeItem(legacyKey);
}

function removeScopedPrefix(prefix, legacyPrefix) {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith(scopedStorageKey(prefix)) || (legacyPrefix && k.startsWith(legacyPrefix))) {
      localStorage.removeItem(k);
    }
  });
}

function loadUserScopedClientState() {
  const userId = getCurrentUserId();
  if (clientStateLoadedFor === userId) return;
  migrateLegacyUserStorage();
  pipelineJobs = readScopedJson('pipelineJobs', [], 'sfpipe2026v3');
  activityLog = readScopedJson('activityLog', [], 'sfActivityLog');
  userBookmarks = readScopedJson('bookmarks', userBookmarks || [], 'sf_bookmarks');
  radarBoardPages = { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
  bookmarksPage = 0;
  activityLogPage = 0;
  historyPage = 0;
  clientStateLoadedFor = userId;
  renderRecentTopicsPanel();
}

function renderPager(total, page, pageSize, prevAction, nextAction, force = false) {
  const safeSize = Math.max(1, Number(pageSize || 1));
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / safeSize));
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  if (!force && totalPages <= 1) return '';
  const start = total > 0 ? safePage * safeSize + 1 : 0;
  const end = Math.min(Number(total || 0), (safePage + 1) * safeSize);
  return `
    <div class="industrial-pager ${force ? 'kanban-board-pager' : ''}">
      <button onclick="${prevAction}" ${safePage <= 0 ? 'disabled' : ''} class="pager-btn" aria-label="Previous page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span class="pager-btn-text">Prev</span>
      </button>
      <span class="pager-info">
        <span class="pager-page">${safePage + 1} / ${totalPages}</span>
        <span class="pager-total">${start}-${end} of ${total}</span>
      </span>
      <button onclick="${nextAction}" ${safePage >= totalPages - 1 ? 'disabled' : ''} class="pager-btn" aria-label="Next page">
        <span class="pager-btn-text">Next</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>`;
}

function getCurrentUserName(fallback = 'there') {
  return currentUser?.name || cachedUserProfile?.name || fallback;
}

async function callAi(kind, payload = {}) {
  const res = await apiFetch(`/api/ai/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      userName: getCurrentUserName('Candidate')
    })
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.error || 'AI request failed');
  return data.response || data.text || '';
}

window.syncProfile = async function(platform) {
  const isCloud = window.location.hostname !== 'localhost';
  
  if (isCloud) {
    openProfileImport(String(platform).toLowerCase().includes('naukri') ? 'naukri' : 'linkedin');
    showToast(`${platform} uses safe official/import flow. No platform password is collected.`, 'blue');
    return;
  }

  // --- LOCAL FALLBACK (Legacy) ---
  const btnL = document.getElementById('btnSyncLinkedIn');
  const btnN = document.getElementById('btnSyncNaukri');
  const statusEl = document.getElementById('profileSyncStatus');
  
  const originalHtmlL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> Sync & Analyze';
  const originalHtmlN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> Sync & Analyze';

  if (platform === 'LinkedIn' && btnL) { 
    btnL.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> Analyzing Profile...'; 
    btnL.style.background = 'var(--blue)';
    btnL.style.opacity = '0.9'; 
  }
  if (platform === 'Naukri' && btnN) { 
    btnN.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> Scanning Resume...'; 
    btnN.style.background = '#ff7555';
    btnN.style.opacity = '0.9'; 
  }

  try {
    const localBase = 'http://localhost:3000';
    const syncRes = await fetch(localBase + '/api/profile/sync', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GSI_TOKEN
      },
      body: JSON.stringify({ platform })
    });
    const syncData = await syncRes.json();
    
    if (syncData.success) {
      let profilePayload = null;
      try {
        const cacheRes = await fetch('/.cache/profile-sync.json?cb=' + Date.now());
        if (cacheRes.ok) profilePayload = await cacheRes.json();
      } catch(e) {}

      if (profilePayload) {
        await apiFetch('/api/profile/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profilePayload)
        });
      }

      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = 'OK ' + platform + ' profile synced & saved to cloud';
        setTimeout(function() { statusEl.style.display = 'none'; }, 8000);
      }
      await loadUserProfile();
      await loadJobIntelligence();
      showPage('profile_match');
    } else {
      showToast('Sync failed: ' + (syncData.error || 'Unknown error'));
    }
  } catch (e) {
    console.error('Local sync failed or timed out', e);
  }
  
  // Restore button states
  if (btnL) { 
    btnL.innerHTML = originalHtmlL;
    btnL.style.opacity = '1'; 
    btnL.style.background = ''; // Use CSS default
  }
  if (btnN) { 
    btnN.innerHTML = originalHtmlN;
    btnN.style.opacity = '1'; 
    btnN.style.background = ''; // Use CSS default
  }
};

window.handleResumeUpload = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const btn = document.getElementById('btnUploadResume');
  const originalHtml = btn.innerHTML;
  
  // Show UI Scanning State
  btn.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> AI Parsing PDF...';
  btn.disabled = true;
  btn.style.opacity = '0.8';

  try {
    // We send a request to our backend parser endpoint
    const res = await apiFetch('/api/profile/parse-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name }) // Passing filename just for mock context
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        showToast('Resume parsed successfully! Skills extracted.', 'green');
        
        // Force refresh UI
        cachedUserProfile = null;
        await loadUserProfile();
        await loadJobIntelligence();
        
        const profilePage = document.getElementById('profile_match');
        if (profilePage && profilePage.classList.contains('active')) {
          if (cachedUserProfile) renderProfileMatchPage(cachedUserProfile);
        }
      }
    } else {
      showToast('Failed to parse resume.', 'red');
    }
  } catch (e) {
    console.error('Resume upload failed', e);
    showToast('Error uploading resume.', 'red');
  } finally {
    btn.innerHTML = '✅ Parsed Successfully';
    btn.style.background = 'rgba(16,185,129,0.2)';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.background = 'rgba(16,185,129,0.1)';
    }, 3000);
  }
};

// =============================================
// PROFILE DATA MANAGEMENT
// =============================================
let cachedUserProfile = null;

async function loadUserProfile() {
  try {
    // CACHE-BUST: Ensure we get fresh synced flags from the cloud
    const res = await apiFetch('/api/profile/data?cb=' + Date.now());
    if (!res.ok) {
      console.log('❌ [Profile] Cloud fetch failed (Status: ' + res.status + '). User might be logged out.');
      return;
    }
    const data = await res.json();
	    console.log('[Profile] Cloud Data Received:', data);
	    
	    if (data.exists && data.profile) {
	      const loginModeIntent = getLoginUiModeIntent();
	      const resolvedUiMode = loginModeIntent || data.profile.uiMode || currentUiMode || 'modern';
	      cachedUserProfile = { ...data.profile, uiMode: resolvedUiMode };
	      applyUiMode(resolvedUiMode);
	      hydratePremiumSetupForm(cachedUserProfile);
	      if (loginModeIntent) {
	        const saveLoginModeChoice = data.profile.uiMode !== resolvedUiMode
	          ? apiFetch('/api/profile/save', {
	          method: 'POST',
	          headers: { 'Content-Type': 'application/json' },
	          body: JSON.stringify(cachedUserProfile)
	            })
	          : Promise.resolve();
	        saveLoginModeChoice
	          .catch(err => console.warn('[UI MODE] Could not save login UI choice:', err.message))
	          .finally(() => {
	            if (getLoginUiModeIntent() === resolvedUiMode) {
	              sessionStorage.removeItem('sf_login_ui_mode_intent');
	            }
	          });
	      }
	      
	      // Update All UI Components
	      const matchBtn = document.getElementById('btnViewProfileMatch');
	      if (matchBtn) matchBtn.style.display = 'block';
	      
	      renderProfileMatchPage(cachedUserProfile);
	      updateSidebarProfileStatus(cachedUserProfile);
	      updateSyncModalUI(cachedUserProfile);

	      // Re-render user avatar/name with latest cloud data (v1413)
	      if (currentUser) {
	        // Merge cloud picture into currentUser if it was updated via profile import
	        if (data.profile.picture && data.profile.picture !== currentUser.picture) {
	          currentUser.picture = data.profile.picture;
	        }
	        renderUserProfile(currentUser);
	      }

      // Cloud Sync Streaks & Bookmarks (v1356 - Master MongoDB)
      if (data.profile.studyStreak) {
        studyStreak = data.profile.studyStreak;
        renderStreakBadge();
      }
      if (data.profile.bookmarks) {
        userBookmarks = data.profile.bookmarks;
        writeScopedJson('bookmarks', userBookmarks);
        console.log('* [BOOKMARKS] Total Loaded:', userBookmarks.length);
        if (userBookmarks.length > 0) {
          console.table(userBookmarks.map(b => ({ Question: b.q, Topic: b.topic })));
        }
        renderBookmarkButtons();
        const countEl = document.getElementById('bookmarkCount');
        if (countEl) countEl.textContent = userBookmarks.length;

        // If user is on bookmarks page, force a redraw now that data is here
        const activeTab = getScopedItem('last_active_tab', null, 'last_active_tab');
        if (activeTab === 'bookmarks_page' || (document.getElementById('bookmarks_page') && document.getElementById('bookmarks_page').classList.contains('active'))) {
          showBookmarks();
        }
      }
      // Cloud Sync Retention (v1356 - Master MongoDB)
      if (data.profile.studyPlanTopics) {
        userRetention = {}; // Reset local to match Cloud Truth
        data.profile.studyPlanTopics.forEach(t => {
          if (t.nextReview) {
            userRetention[t.topicId] = {
              confidence: t.confidence,
              nextReview: t.nextReview,
              interval: t.interval,
              easeFactor: t.easeFactor
            };
          }
        });
        renderRevisionAlerts();
      }
    }
  } catch (e) { console.error('[Profile] Cloud profile fetch failed:', e.message || e); }
}

/* UI templates moved to components.js */

// Global function to handle AI Regeneration
window.regenerateAIStudyPlan = async function() {
  const btn = document.getElementById('btnRegenerateRoadmap');
  const input = document.getElementById('aiRoadmapTarget');
  const targetRole = input ? input.value : '';
  
  if (btn) {
    btn.innerHTML = '<span style="animation:spin 1s linear infinite;display:inline-block;">...</span> Thinking...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }

  try {
    // We send a request to /api/ai/skill (which generates a study plan)
    const promptStr = targetRole 
      ? `Create a focused 7-day Salesforce study plan specifically for a "${targetRole}" role, based on closing advanced technical gaps.`
      : `Create a 7-day Salesforce study plan focusing on advanced LWC, Apex, and Integration to close market gaps.`;

    const res = await apiFetch('/api/ai/skill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptStr, topic: targetRole || 'Salesforce Developer' })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.response) {
        // Save back to profile
        cachedUserProfile.studyPlan = data.response;
        await apiFetch('/api/profile/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cachedUserProfile)
        });
        // Re-render
        renderProfileMatchPage(cachedUserProfile);
        showToast('AI Roadmap Regenerated!', 'green');
        return;
      }
    }
    showToast('Failed to generate AI roadmap. Try again.', 'red');
  } catch (e) {
    console.error('Roadmap generation failed', e);
    showToast('Error generating roadmap.', 'red');
  } finally {
    if (btn) {
      btn.innerHTML = 'Generate New Plan';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
}

function updateProfileStrengthMeter(skillCount, gapCount, profile) {
  if (skillCount === 0 && gapCount === 0) return 0;
  
  // Multi-dimensional strength scoring (v1412 enhancement)
  const skillCoverage = skillCount + gapCount > 0 ? skillCount / (skillCount + gapCount) : 0;
  const certs = (profile?.certifications || []).length;
  const certScore = Math.min(certs / 5, 1); // 5 certs = 100%
  const expYears = profile?.experienceYears || 0;
  const expScore = Math.min(expYears / 8, 1); // 8 years = 100%
  const platforms = profile?.platforms || {};
  const platformCount = Object.values(platforms).filter(p => p.synced).length;
  const platformScore = Math.min(platformCount / 2, 1); // 2 platforms = 100%
  
  // Weighted average:
  // Skills coverage: 35%, Certifications: 25%, Experience: 25%, Platform sync: 15%
  const weighted = (skillCoverage * 0.35) + (certScore * 0.25) + (expScore * 0.25) + (platformScore * 0.15);
  return Math.round(weighted * 100);
}

function priorityClass(priority) {
  const value = String(priority || 'medium').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  return 'medium';
}

/* UI templates moved to components.js */

/* UI templates moved to components.js */

// =============================================
// JOB INTELLIGENCE (v1412 - Profile Match Integration)
// Calls /api/profile/match to aggregate skill analysis from real job data
// =============================================
async function loadJobIntelligence() {
  const section = document.getElementById('jobIntelligenceSection');
  const content = document.getElementById('jobIntelligenceContent');
  if (!section || !content) return;

  try {
    const res = await apiFetch('/api/profile/match?cb=' + Date.now());
    if (!res.ok) {
      console.log('[JOB-INTEL] API responded with:', res.status);
      return;
    }
    const data = await res.json();
    console.log('[JOB-INTEL] Job Market Intelligence:', data);

    const matchedSkills = data.matched_skills || [];
    const missingSkills = data.missing_skills || [];

    if (matchedSkills.length === 0 && missingSkills.length === 0) {
      // No job data available yet
    }
    content.innerHTML = renderJobIntelligence(data);
    section.style.display = 'block';
  } catch (e) {
    console.warn('[JOB-INTEL] Failed to load job intelligence:', e.message);
  }
}

async function generateDynamicQA(topicId) {
  const btn = document.getElementById('btnGenerateTopicQA');
  const content = document.getElementById('topicViewerContent');
  const qaContainer = document.getElementById('topicQAContainer');
  const topicName = topicConfig[topicId] ? topicConfig[topicId].name : topicId;

  btn.disabled = true;
  btn.textContent = 'AI is generating Q&A...';
  
  try {
    const prompt = `You are a Senior Salesforce Interviewer. Generate 5 highly technical and scenario-based interview questions for the topic: "${topicName}". 
For each question, provide a detailed "Master Answer" that would impress a hiring manager. 
Format your response as a valid JSON array of objects: [{"question": "...", "answer": "..."}]. 
Do not include any conversational text before or after the JSON.`;

    const responseText = await callAi('qa', { topic: topicId, topicName, prompt });
    
    // Parse JSON from response
    let qa = [];
    try {
      const jsonStr = responseText.substring(responseText.indexOf('['), responseText.lastIndexOf(']') + 1);
      qa = JSON.parse(jsonStr);
    } catch(e) {
      // Fallback if not JSON
      qa = [{ question: "Topic: " + topicName, answer: responseText }];
    }

    content.style.display = 'none';
    qaContainer.style.display = 'block';
    qaContainer.innerHTML = qa.map((item, idx) => `
      <div class="qa-block" style="margin-bottom:15px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;">
        <div class="qa-question" onclick="toggleQA(this)" style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
          <span class="qa-q-text" style="font-weight:700; font-size:0.9rem; color:var(--text);">${idx + 1}. ${item.question}</span>
          <span class="qa-chevron">v</span>
        </div>
        <div class="qa-answer" style="padding:0 15px 15px; font-size:0.85rem; color:rgba(255,255,255,0.8); line-height:1.6;">
          ${item.answer.replace(/\n/g, '<br>')}
        </div>
      </div>
    `).join('');
    
  } catch (e) {
    showToast('Failed to generate AI Q&A. Please try again after the server connection recovers.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate AI Interview Q&A';
  }
}
// =============================================
// DYNAMIC TOPIC RENDERING (v1412+)
// =============================================
async function renderTopicContent(topicId) {
  const viewer = document.getElementById('topic_viewer');
  if (!viewer) return false;
  
  const data = await loadKnowledgeData(topicId);
  if (!data) return false;

  viewer.innerHTML = `
    <h1 class="page-title">${data.title || topicConfigName(topicId)}</h1>
    <p class="page-sub">${data.subtitle || 'Technical deep-dive'}</p>
    <div class="topic-content-body">
      ${(data.blocks || []).map(block => {
        if (block.type === 'section') return `<div class="topic-section-divider">${block.title}</div>`;
        if (block.type === 'qa') {
          return `
            <div class="qa-block open">
              <div class="qa-question" onclick="this.parentElement.classList.toggle('open')">
                <span class="qa-q-text">${block.question}</span>
                <span class="qa-chevron">▼</span>
              </div>
              <div class="qa-answer">${block.answer}</div>
            </div>
          `;
        }
        return '';
      }).join('')}
    </div>
  `;
  return true;
}


async function checkAuth() {
  const token = localStorage.getItem('google_auth_token');
  if (!token) {
    syncLoginUiModeControls(currentUiMode);
    document.getElementById('loginOverlay').style.display = 'flex';
    return false;
  }
  
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    
    if (res.status === 401) {
      // Token expired or invalid — clear and show login
      localStorage.removeItem('google_auth_token');
      GSI_TOKEN = null;
      syncLoginUiModeControls(currentUiMode);
      document.getElementById('loginOverlay').style.display = 'flex';
      return false;
    }

    if (!res.ok) throw new Error('Auth failed');

    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      loadUserScopedClientState();
      renderUserProfile(currentUser);
      document.getElementById('loginOverlay').style.display = 'none';
      return true;
    }
  } catch (e) {
    console.warn('Auth check failed (network error):', e.message);
    // On network failure, show login overlay so user can re-authenticate
    syncLoginUiModeControls(currentUiMode);
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
  }
  
  return false;
}
var floatingTimerInterval = null;

// ALL topic IDs mapped - no duplicates
var topicConfig = {
  // Daily Plan (No timers needed here)
  'schedule': { name: 'Daily Schedule', recommended: 15, group: 'General', noTimer: true },
  'job_radar': { name: 'Job Radar Dashboard', recommended: 30, group: 'General', noTimer: true },
  'study_tracker': { name: 'Progress Tracker', recommended: 30, group: 'General', noTimer: true },
  'study_history': { name: 'Study History', recommended: 0, group: 'General', noTimer: true },
  'profile_match': { name: 'Profile Matching', recommended: 10, group: 'General', noTimer: true },
  'salesforce_releases': { name: 'Salesforce Releases', recommended: 0, group: 'General', noTimer: true },
  'code_practice': { name: 'Code Practice', recommended: 45, group: 'Technical', noTimer: true },
  // Technical Interview Q&A
  'apex': { name: 'Apex Core', recommended: 120, group: 'Technical' },
  'soql': { name: 'SOQL Deep Dive', recommended: 90, group: 'Technical' },
  'async': { name: 'Async Apex', recommended: 90, group: 'Technical' },
  'triggers': { name: 'Triggers & Patterns', recommended: 90, group: 'Technical' },
  'lwc': { name: 'LWC Components', recommended: 120, group: 'Technical' },
  'aura': { name: 'Aura Components', recommended: 60, group: 'Technical' },
  'integration': { name: 'Integration & APIs', recommended: 90, group: 'Technical' },
  'security': { name: 'Security & Sharing', recommended: 90, group: 'Technical' },
  'platform': { name: 'Platform Events & CDC', recommended: 60, group: 'Technical' },
  'design': { name: 'Design Patterns', recommended: 60, group: 'Technical' },
  // Domain
  'domain': { name: 'US Mortgage Domain', recommended: 60, group: 'Domain' },
  // Advanced Technical
  'adv_apex': { name: 'Advanced Apex', recommended: 90, group: 'Technical' },
  'adv_lwc': { name: 'Advanced LWC', recommended: 90, group: 'Technical' },
  'adv_intg': { name: 'Advanced Integration', recommended: 60, group: 'Technical' },
  'admin': { name: 'Admin & Config', recommended: 60, group: 'Technical' },
  'scenario': { name: 'Scenario Questions', recommended: 90, group: 'Technical' },
  // Communication & Behavioral
  'comm30': { name: '30-Day Comm Plan', recommended: 30, group: 'Communication' },
  'speaking': { name: 'Speaking Drills', recommended: 45, group: 'Communication' },
  'mistakes': { name: 'Common Mistakes', recommended: 30, group: 'Communication' },
  'behavioral': { name: 'Behavioral Q&A', recommended: 60, group: 'Communication' },
  'comm': { name: 'Communication Scripts', recommended: 45, group: 'Communication' },
  'vocab': { name: 'Vocabulary & Phrases', recommended: 30, group: 'Communication' },
  'intro': { name: 'Self-Introduction', recommended: 45, group: 'Communication' },
  'mock': { name: 'Mock Interviews', recommended: 90, group: 'Communication' },
  // Interview Strategy
  'salary': { name: 'Salary & Negotiation', recommended: 30, group: 'Strategy' },
  'questions': { name: 'Questions to Ask', recommended: 20, group: 'Strategy' },
  // 100 Scenario Questions
  'sc_objects': { name: 'Objects & Fields Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_recordpage': { name: 'Record Page + LWC', recommended: 45, group: 'Scenarios' },
  'sc_navmixin': { name: 'NavigationMixin', recommended: 45, group: 'Scenarios' },
  'sc_validation': { name: 'Validation Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_async': { name: 'Credit Pull Flow', recommended: 45, group: 'Scenarios' },
  'sc_fileupload': { name: 'File Upload + GDrive', recommended: 45, group: 'Scenarios' },
  'sc_flow': { name: 'Flow Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_reports': { name: 'Reports & Dashboards', recommended: 45, group: 'Scenarios' },
  'sc_agentforce': { name: 'Agentforce Scenarios', recommended: 45, group: 'Scenarios' },
  'sc_arch': { name: 'Architecture Mix', recommended: 45, group: 'Scenarios' },
  // Reference Guides
  'soql_full': { name: 'SOQL+SOSL Master', recommended: 60, group: 'Reference' },
  'security_full': { name: 'Security Full Guide', recommended: 60, group: 'Reference' },
  'agentforce_guide': { name: 'Agentforce Reference', recommended: 60, group: 'Reference' },
  'flows_guide': { name: 'Flow Complete Guide', recommended: 60, group: 'Reference' },
  'reports_guide': { name: 'Reports Full Guide', recommended: 45, group: 'Reference' },
  // English Speaking
  'eng30': { name: '30-Day Speaking Plan', recommended: 30, group: 'Communication' },
  'eng_starters': { name: '50 Sentence Starters', recommended: 20, group: 'Communication' },
  'eng_phrases': { name: 'Difficult Situations', recommended: 30, group: 'Communication' },
  // Company-Specific
  'deloitte': { name: 'Deloitte (Recent) 2026', recommended: 60, group: 'Company' },
  'accenture': { name: 'Accenture Prep (LWC+Async)', recommended: 60, group: 'Company' },
  'company_iq': { name: 'Arago & Morgan Stanley', recommended: 60, group: 'Company' },
  'company_interviews': { name: 'Company Interviews', recommended: 60, group: 'Company' },
  'mobigic_pwc': { name: 'Mobigic / PWC', recommended: 45, group: 'Company' },
  'thenken_globus': { name: 'Thenken Globus', recommended: 45, group: 'Company' },
  'sf_official': { name: 'Salesforce (Official)', recommended: 90, group: 'Company' },
  'sf_onsite': { name: 'Salesforce (Onsite)', recommended: 120, group: 'Company' },
  // FDE Interview Prep
  'fde_ag_concept': { name: 'FDE Agentforce Core', recommended: 90, group: 'FDE Prep' },
  'fde_ag_scenario': { name: 'FDE Agentforce Scenarios', recommended: 60, group: 'FDE Prep' },
  'fde_atlas': { name: 'FDE Atlas Deep Dive', recommended: 60, group: 'FDE Prep' },
  'fde_trust': { name: 'FDE Trust Layer', recommended: 60, group: 'FDE Prep' },
  'fde_dc_concept': { name: 'FDE Data Cloud Core', recommended: 90, group: 'FDE Prep' },
  'fde_dc_adv': { name: 'FDE Data Cloud Advanced', recommended: 60, group: 'FDE Prep' },
  'fde_integration': { name: 'FDE Integration', recommended: 60, group: 'FDE Prep' },
  'fde_apex': { name: 'FDE Apex in Agents', recommended: 60, group: 'FDE Prep' },
  'fde_behavioral': { name: 'FDE Behavioral', recommended: 60, group: 'FDE Prep' },
  'fde_cheat': { name: 'FDE Cheat Sheet', recommended: 30, group: 'FDE Prep' },
  // New Industrial Modules
  'security_5_layers': { name: '5 Layers Security', recommended: 90, group: 'Technical' },
  'order_of_execution': { name: 'Order of Execution', recommended: 60, group: 'Technical' },
  'flow_master': { name: 'Flow Master Class', recommended: 90, group: 'Technical' },
  'sales_cloud': { name: 'Sales Cloud Arch', recommended: 60, group: 'Technical' },
  'service_cloud': { name: 'Service Cloud Arch', recommended: 60, group: 'Technical' },
  'experience_cloud': { name: 'Experience Cloud', recommended: 60, group: 'Technical' }
};

// =============================================
// UTILS
// =============================================
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 10000 } = options;
  const token = localStorage.getItem('google_auth_token');
  const path = (() => {
    try {
      return new URL(resource, window.location.origin).pathname;
    } catch (e) {
      return String(resource || '').split('?')[0];
    }
  })();
  if ((!token || token === 'null' || token === 'undefined') && path.startsWith('/api/')) {
    return new Response(JSON.stringify({ success: false, error: 'login_required', completedTasks: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'X-Local-Auth-State': 'login_required' }
    });
  }
  
  const headers = {
    ...options.headers,
    'Authorization': token ? `Bearer ${token}` : ''
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, headers, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// =============================================
// DATA LAYER (Server-side API)
// =============================================
async function getStudyData(force = false) {
  const now = Date.now();
  if (!force && globalStudyData && (now - lastFetchTime < MIN_FETCH_INTERVAL)) {
    return globalStudyData;
  }
  
  try {
    lastFetchTime = now;
    const [historyRes, tasksRes] = await Promise.all([
      fetchWithTimeout('/api/study/history?cb=' + Date.now()),
      fetchWithTimeout('/api/study/tasks?cb=' + Date.now())
    ]);
    if (!historyRes.ok || !tasksRes.ok) {
      return globalStudyData || { topics: {}, sessions: [], completedTasks: [] };
    }
    const sessions = await historyRes.json();
    const { completedTasks } = await tasksRes.json();
    
    const topics = {};
    (sessions || []).forEach(s => {
      const tid = s.topic || s.topicId;
      if (!tid) return;
      const duration = Number(s.duration || 0);
      if (!topics[tid]) topics[tid] = { totalSeconds: 0, sessions: 0, lastStudied: null };
      topics[tid].totalSeconds += duration;
      topics[tid].sessions += 1;
    });
    
    globalStudyData = { topics, sessions, completedTasks };
    return globalStudyData;
  } catch(e) { 
    return globalStudyData || { topics: {}, sessions: [], completedTasks: [] }; 
  }
}

async function saveSession(session) {
  try {
    await fetchWithTimeout('/api/study/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
  } catch(e) { console.error('Failed to save session', e); }
}

async function toggleTask(index) {
  try {
    const res = await apiFetch('/api/study/toggle-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index })
    });
    if (res.ok) await renderTimetable();
  } catch(e) { console.error('[Cloud] Toggle Error:', e); }
}

// =============================================
// TIMER with PAUSE / PLAY
// =============================================
var baseSeconds = 0;

async function startTracking(pageId) {
  const cfg = topicConfig[pageId];
  if (!cfg || cfg.noTimer) {
    var timerEl = document.getElementById('floatingTimer');
    if (timerEl) timerEl.style.display = 'none';
    return;
  }
  
  if (currentTrackedPage === pageId && !isPaused) return;
  if (currentTrackedPage && currentTrackedPage !== pageId) await stopTracking();
  
  // Show timer
  var timerEl = document.getElementById('floatingTimer');
  if (timerEl) timerEl.style.display = 'flex';

  // DUAL-SYNC RESUME: Use localStorage for instant feel + Server for persistence
  const localBase = parseInt(getScopedItem('timer_' + pageId, '0', 'timer_' + pageId) || '0');
  baseSeconds = localBase;
  
  // Update from server in background
  getStudyData().then(data => {
    if (data.topics[pageId]) {
      const serverSeconds = data.topics[pageId].totalSeconds;
      if (serverSeconds > baseSeconds) {
        baseSeconds = serverSeconds;
        updateFloatingTimer();
      }
    }
  });
  
  currentTrackedPage = pageId;
  trackingStartTime = Date.now();
  isPaused = false;
  pausedElapsed = 0;
  
  updateFloatingTimer();
  startFloatingTimerInterval();
  
  // Update button UI to "Playing" state (User requested Play icon for 'started' status)
  var btn = document.getElementById('ftPlayPause');
  var iconPause = document.getElementById('ftIconPause');
  var iconPlay = document.getElementById('ftIconPlay');
  var dot = document.getElementById('ftDot');
  if (btn) { btn.className = 'ft-btn playing'; btn.title = 'Click to Pause'; }
  if (iconPause) iconPause.style.display = 'none';
  if (iconPlay) iconPlay.style.display = 'block';
  if (dot) dot.className = 'ft-dot';
  
  // AUTO-OPEN LAST QUESTION
  restoreLastQuestion(pageId);
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  if (activeEl) activeEl.textContent = topicConfig[pageId].name;
  if (lightEl) lightEl.style.display = 'inline-block';
}

function restoreLastQuestion(pageId) {
  const lastQ = getScopedItem('last_q_' + pageId, null, 'last_q_' + pageId);
  if (!lastQ) return;
  
  const page = document.getElementById(pageId);
  if (!page) return;
  
  const questions = page.querySelectorAll('.qa-q-text');
  questions.forEach(q => {
    if (q.textContent === lastQ) {
      q.parentElement.parentElement.classList.add('open');
      setTimeout(() => q.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  });
}

async function stopTracking() {
  if (!currentTrackedPage) return;
  
  var elapsed = getCurrentElapsed();
  if (elapsed < 5) {
    currentTrackedPage = null;
    trackingStartTime = null;
    isPaused = false;
    pausedElapsed = 0;
    return;
  }
  
  // Persist locally for instant resume
  const total = baseSeconds + elapsed;
  setScopedItem('timer_' + currentTrackedPage, total);

  // Use a consistent local date string for "Today"
  const now = new Date();
  const localDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  const session = {
    topic: currentTrackedPage,
    topicName: topicConfig[currentTrackedPage] ? topicConfig[currentTrackedPage].name : currentTrackedPage,
    duration: elapsed,
    startTime: new Date(trackingStartTime).toISOString(),
    endTime: now.toISOString(),
    date: localDate // YYYY-MM-DD in local time
  };
  
  await saveSession(session);
  
  // OPTIMISTIC UI UPDATE: Inject directly into global cache to prevent tracker display lag
  if (typeof globalStudyData !== 'undefined' && globalStudyData) {
    globalStudyData.sessions.push(session);
    if (!globalStudyData.topics[session.topic]) {
      globalStudyData.topics[session.topic] = { totalSeconds: 0, sessions: 0, lastStudied: null };
    }
    globalStudyData.topics[session.topic].totalSeconds += session.duration;
    globalStudyData.topics[session.topic].sessions += 1;
    globalStudyData.topics[session.topic].lastStudied = session.date;
  }
  
  // Refresh the history timeline in the background
  setTimeout(() => { if (typeof renderHistory === 'function') renderHistory(); }, 500);
  
  currentTrackedPage = null;
  trackingStartTime = null;
  isPaused = false;
  pausedElapsed = 0;
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  var timerEl = document.getElementById('floatingTimer');
  if (activeEl) activeEl.textContent = '-';
  if (lightEl) lightEl.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
  if (floatingTimerInterval) {
    clearInterval(floatingTimerInterval);
    floatingTimerInterval = null;
  }
}

function getCurrentElapsed() {
  if (!currentTrackedPage) return 0;
  if (isPaused) return pausedElapsed;
  return pausedElapsed + Math.floor((Date.now() - trackingStartTime) / 1000);
}

function togglePause() {
  if (!currentTrackedPage) return;
  
  var btn = document.getElementById('ftPlayPause');
  var dot = document.getElementById('ftDot');
  var iconPause = document.getElementById('ftIconPause');
  var iconPlay = document.getElementById('ftIconPlay');
  
  if (isPaused) {
    // Resume
    isPaused = false;
    trackingStartTime = Date.now();
    if (btn) { btn.className = 'ft-btn playing'; btn.title = 'Click to Pause'; }
    if (iconPause) iconPause.style.display = 'none';
    if (iconPlay) iconPlay.style.display = 'block';
    if (dot) dot.className = 'ft-dot';
    startFloatingTimerInterval();
  } else {
    // Pause
    pausedElapsed += Math.floor((Date.now() - trackingStartTime) / 1000);
    isPaused = true;
    if (btn) { btn.className = 'ft-btn paused'; btn.title = 'Click to Resume'; }
    if (iconPause) iconPause.style.display = 'block';
    if (iconPlay) iconPlay.style.display = 'none';
    if (dot) dot.className = 'ft-dot paused';
    if (floatingTimerInterval) { clearInterval(floatingTimerInterval); floatingTimerInterval = null; }
  }
}

// =============================================
// FLOATING TIMER DISPLAY (top-right corner)
// =============================================
function updateFloatingTimer() {
  var ftTopic = document.getElementById('ftTopic');
  var ftTime = document.getElementById('ftTime');
  var ftDot = document.getElementById('ftDot');
  var ftBtn = document.getElementById('ftPlayPause');
  
  if (!currentTrackedPage) {
    if (ftTopic) ftTopic.textContent = 'No topic';
    if (ftTime) ftTime.textContent = '00:00';
    if (ftDot) ftDot.style.display = 'none';
    if (ftBtn) ftBtn.style.display = 'none';
    return;
  }
  
  if (ftDot) ftDot.style.display = 'inline-block';
  if (ftBtn) ftBtn.style.display = 'flex';
  
  var cfg = topicConfig[currentTrackedPage];
  if (ftTopic) ftTopic.textContent = cfg ? cfg.name : currentTrackedPage;
  
  var elapsed = getCurrentElapsed();
  var totalSeconds = baseSeconds + elapsed;
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  if (h > 0) {
    if (ftTime) ftTime.textContent = h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  } else {
    if (ftTime) ftTime.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
}

function startFloatingTimerInterval() {
  if (floatingTimerInterval) clearInterval(floatingTimerInterval);
  floatingTimerInterval = setInterval(function() {
    updateFloatingTimer();
    
    // SMOOTH LIVE UPDATES: Update UI every second without hitting server
    const isTrackerVisible = document.getElementById('study_tracker').style.display !== 'none';
    if (isTrackerVisible) updateTrackerUI(true); // 'true' means use cache
  }, 1000);
}

window.updateCourseTargets = function() {
  try {
    const data = globalStudyData;
    if (!data || !data.topics) return;
    
    let totalRecommendedMin = 0;
    for (let id in topicConfig) {
      totalRecommendedMin += topicConfig[id].recommended;
    }
    
    let totalSpentSec = 0;
    for (let id in data.topics) {
      totalSpentSec += data.topics[id].totalSeconds;
    }
    
    // Add active session if any
    if (currentTrackedPage) totalSpentSec += getCurrentElapsed();
    
    const totalReqSec = totalRecommendedMin * 60;
    const remainingSec = Math.max(0, totalReqSec - totalSpentSec);
    const deadlineDays = parseInt(document.getElementById('studyDeadlineDays').value) || 30;
    
    const requiredDailySec = remainingSec / deadlineDays;
    const progressPct = Math.min(100, Math.round((totalSpentSec / totalReqSec) * 100));
    
    const progressEl = document.getElementById('courseTotalProgress');
    const dailyEl = document.getElementById('courseRequiredDaily');
    const remainEl = document.getElementById('courseRemainingTime');
    
    if (progressEl) progressEl.textContent = progressPct + '%';
    if (dailyEl) dailyEl.textContent = (requiredDailySec / 3600).toFixed(1) + ' hrs';
    if (remainEl) remainEl.textContent = formatTime(remainingSec);
    
  } catch (e) { console.error('Goal update error', e); }
}

// Hook into the main refresh loop
const oldUpdateTrackerUI = updateTrackerUI;
updateTrackerUI = async function() {
  await oldUpdateTrackerUI();
  updateCourseTargets();
};

// =============================================
// FORMAT HELPERS
// =============================================
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '00s';
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const VERSION = '2026-04-22-T1830 (v1410)';

function formatTimeFull(totalSeconds) {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = Math.floor(totalSeconds % 60);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function getTopicStatus(topicId, data) {
  var topicData = data.topics[topicId];
  var config = topicConfig[topicId];
  if (!topicData || topicData.totalSeconds === 0) return { label: 'NOT STARTED', cls: 'status-needs-work' };
  var pct = (topicData.totalSeconds / 60) / config.recommended * 100;
  if (pct < 30) return { label: 'NEEDS WORK', cls: 'status-needs-work' };
  if (pct < 70) return { label: 'IN PROGRESS', cls: 'status-in-progress' };
  if (pct < 100) return { label: 'GOOD', cls: 'status-good' };
  return { label: 'EXCELLENT', cls: 'status-excellent' };
}

// =============================================
// SUGGESTIONS ENGINE
// =============================================
function generateSuggestions(data) {
  var suggestions = [];
  var allTopics = Object.keys(topicConfig);
  var untouched = [], needsWork = [], inProgress = [];
  
  allTopics.forEach(function(id) {
    var topicData = data.topics[id];
    var cfg = topicConfig[id];
    var spent = topicData ? topicData.totalSeconds / 60 : 0;
    var pct = spent / cfg.recommended * 100;
    if (spent === 0) untouched.push({ id:id, name:cfg.name, group:cfg.group, recommended:cfg.recommended });
    else if (pct < 30) needsWork.push({ id:id, name:cfg.name, group:cfg.group, spent:spent, recommended:cfg.recommended, pct:pct });
    else if (pct < 70) inProgress.push({ id:id, name:cfg.name, group:cfg.group, spent:spent, recommended:cfg.recommended, pct:pct });
  });
  
  var fdeTopic = untouched.filter(function(t){ return t.group === 'FDE Prep'; });
  if (fdeTopic.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;color:var(--red);"><circle cx="12" cy="12" r="10"></circle></svg>', text:'<b>Start FDE topics immediately!</b> <b>'+fdeTopic.length+' FDE topics</b> not started: '+fdeTopic.slice(0,3).map(function(t){return t.name}).join(', ')+(fdeTopic.length>3?'...':'')+'. Critical for your interview.', priority:'HIGH', cls:'priority-high' });
  }
  var nonFde = untouched.filter(function(t){ return t.group !== 'FDE Prep'; });
  if (nonFde.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;color:var(--amber);"><circle cx="12" cy="12" r="10"></circle></svg>', text:'<b>'+nonFde.length+' topics not started:</b> '+nonFde.slice(0,4).map(function(t){return t.name}).join(', ')+(nonFde.length>4?'...':'')+'.', priority:'MEDIUM', cls:'priority-medium' });
  }
  if (needsWork.length > 0) {
    var low = needsWork.sort(function(a,b){return a.pct-b.pct}).slice(0,3);
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>', text:'<b>Revisit these:</b> '+low.map(function(t){return t.name+' ('+Math.round(t.spent)+'/'+t.recommended+'m)'}).join(', '), priority:'MEDIUM', cls:'priority-medium' });
  }
  if (inProgress.length > 0) {
    suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;color:var(--green);"><polyline points="20 6 9 17 4 12"></polyline></svg>', text:'<b>Almost there!</b> '+inProgress.map(function(t){return t.name+' ('+Math.round(t.pct)+'%)'}).join(', ')+'. Few more sessions needed.', priority:'LOW', cls:'priority-low' });
  }
  var ts = 0;
  Object.keys(data.topics).forEach(function(k){ 
    const td = data.topics[k];
    if (td && typeof td.totalSeconds !== 'undefined') ts += td.totalSeconds;
  });
  var th = ts / 3600;
  if (th < 5) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>', text:'<b>'+Math.round(th*10)/10+' hours total.</b> Aim for 30+ hours.', priority:'HIGH', cls:'priority-high' });
  else if (th < 20) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M18 20V10M12 20V4M6 20v-6"></path></svg>', text:'<b>Great!</b> '+Math.round(th*10)/10+' hours. Keep going!', priority:'LOW', cls:'priority-low' });
  else suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--amber);"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.34M15 22v-4H9v4M18 5V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v1c0 3.87 3.13 7 7 7s7-3.13 7-7z"></path></svg>', text:'<b>Outstanding! '+Math.round(th*10)/10+'h logged.</b> Focus on weakest areas now.', priority:'LOW', cls:'priority-low' });
  if (!suggestions.length) suggestions.push({ icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:var(--blue);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>', text:'<b>Start studying!</b> Open any topic to begin.', priority:'MEDIUM', cls:'priority-medium' });
  return suggestions;
}

async function fetchDailySummary() {
  const card = document.getElementById('dailyInsightCard');
  const content = document.getElementById('summaryContent');
  const dateEl = document.getElementById('summaryDate');
  if (!card || !content) return;

  try {
    const response = await apiFetch('/api/summary/daily');
    if (!response.ok) throw new Error('Unauthorized or missing');
    const summary = await response.json();
    
    if (summary) {
      card.style.display = 'block';
      if (dateEl) dateEl.textContent = summary.date || new Date().toISOString().split('T')[0];
      
      const study = summary.study || {};
      const jobs = summary.jobs || {};
      const totalSec = (study && typeof study.totalSeconds !== 'undefined') ? study.totalSeconds : 0;
      const studyHrs = (totalSec / 3600).toFixed(1);
      const topTopic = (study && study.topTopic) ? study.topTopic : 'None';
      const jobsCount = jobs.newCount || 0;
      const topMatches = jobs.topMatches || [];
      const topJob = topMatches.length > 0 && topMatches[0].title ? topMatches[0].title : 'Searching...';
      
      content.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--blue);"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
          <span>You've studied for <b>${studyHrs} hours</b> today, focusing primarily on <b>${topTopic}</b>.</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--muted);"><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07M4.93 4.93a10 10 0 0 0 0 14.14"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span>The Job Radar discovered <b>${jobsCount} new opportunities</b> today.</span>
        </div>
        ${topMatches.length > 0 ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; color:var(--text); font-size:0.75rem;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#f59e0b;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Top Match: <b>${topJob}</b></div>` : ''}
        <div style="color:var(--green); font-size:0.7rem; margin-top:8px; display:flex; align-items:center; gap:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:10px;height:10px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Daily state synced to cloud database
        </div>
      `;
    }
  } catch (e) { console.error('Failed to fetch summary', e); }
}

let currentHistoryTab = 'timeline';

function switchHistoryTab(mode) {
  currentHistoryTab = mode;
  historyPage = 0;
  document.querySelectorAll('.history-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(mode)) btn.classList.add('active');
  });
  renderHistory();
}

async function syncDashboard() {
  try {
    console.log('🔍„ Initiating resilient dashboard sync...');
    // Execute individually so one crash doesn't block others
    await updateTrackerUI().catch(e => console.error('UI Tracker fail', e));
    await renderTimetable().catch(e => console.error('Timetable fail', e)); // FIXED: Added to sync
    await fetchDailySummary().catch(e => console.error('Daily Summary fail', e));
    await fetchJobs().catch(e => console.error('Jobs fail', e));
    await renderHistory().catch(e => console.error('History fail', e));
    await loadUserProfile().catch(e => console.error('Profile fail', e));
  } catch(e) { console.error('Dashboard sync failed', e); }
}

async function syncHistoryWithFeedback() {
  const btn = document.getElementById('syncHistoryBtn');
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  
  if (!btn) { renderHistory(); return; }

  // Start Feedback
  icon.classList.add('spin');
  text.textContent = 'Syncing...';
  btn.style.opacity = '0.8';
  btn.style.pointerEvents = 'none';

  try {
    console.log('[Sync] Triggering history rebuild...');
    await renderHistory();
    console.log('[Sync] Success.');
    
    // Success State
    text.textContent = 'Data Synced!';
    icon.classList.remove('spin');
    btn.style.background = 'var(--green)';
    btn.style.boxShadow = '0 4px 15px rgba(16,185,129,0.3)';
    
    setTimeout(() => {
      text.textContent = 'Sync Dashboard';
      btn.style.background = 'var(--blue)';
      btn.style.boxShadow = '0 4px 15px rgba(79,142,247,0.3)';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  } catch (e) {
    console.error('[Sync] Failed:', e);
    icon.classList.remove('spin');
    text.textContent = 'Sync Failed';
    btn.style.background = 'var(--red)';
    setTimeout(() => {
      text.textContent = 'Sync Dashboard';
      btn.style.background = 'var(--blue)';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }
}

async function renderHistory() {
  const container = document.getElementById('historyTimeline');
  if (!container) return;

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  const yestStr = yest.getFullYear() + '-' + String(yest.getMonth()+1).padStart(2,'0') + '-' + String(yest.getDate()).padStart(2,'0');

  // STEP 1: INSTANT LOAD (If we have cache, show it immediately to avoid glitch)
  if (Object.keys(cachedHistories).length > 0) {
    renderHistoryUI(container, cachedHistories, todayStr, yestStr);
  }

  const token = localStorage.getItem('google_auth_token');
  if (!token || token === 'null' || token === 'undefined') {
    if (Object.keys(cachedHistories).length === 0) {
      renderHistoryUI(container, {}, todayStr, yestStr);
    }
    return;
  }

  try {
    const viewMode = currentHistoryTab;
    // STEP 2: SILENT BACKGROUND SYNC
    const response = await apiFetch('/api/summary/all?cache_bust=' + Date.now());
    if (!response.ok) throw new Error('Unauthorized');
    const histories = await response.json();
    
    // Virtual Today entry for real-time tracking
    if (currentTrackedPage) {
      const liveSecs = getCurrentElapsed();
      const tid = currentTrackedPage;
      const tName = topicConfig[tid] ? topicConfig[tid].name : tid;
      
      if (!histories[todayStr]) {
        histories[todayStr] = { 
          study: { totalSeconds: 0, sessionsCount: 1, topicList: [] }, 
          jobs: { newCount: 0, topMatches: [] } 
        };
      }

      const h = histories[todayStr];
      h.study.totalSeconds += liveSecs;
      
      if (!h.study.topicList) h.study.topicList = [];
      let entry = h.study.topicList.find(x => x.id === tid);
      if (!entry) {
        entry = { id: tid, name: tName, totalSeconds: 0 };
        h.study.topicList.push(entry);
      }
      entry.totalSeconds += liveSecs;
    }
    
    // FINAL SAFETY: Ensure topicList exists for all history entries
    Object.keys(histories).forEach(date => {
      const h = histories[date];
      if (h.study && !h.study.topicList) {
        const breakdown = h.study.breakdown || h.study.topicBreakdown || {};
        h.study.topicList = Object.keys(breakdown).map(k => {
          const item = breakdown[k] || {};
          return { id: k, name: item.name || k, totalSeconds: item.totalSeconds || 0 };
        });
      }
    });

    // STEP 3: UPDATE CACHE & RE-RENDER SILENTLY
    cachedHistories = histories;
    renderHistoryUI(container, histories, todayStr, yestStr);

  } catch (e) { 
    console.error('History Render Error:', e); 
    if (Object.keys(cachedHistories).length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--muted);">Cloud history currently unavailable. Check connection.</div>';
    }
  }
}

function renderHistoryUI(container, histories, todayStr, yestStr) {
  const viewMode = currentHistoryTab;
  const filter = document.getElementById('historyPeriodFilter') ? document.getElementById('historyPeriodFilter').value : 'current_month';
  let dates = Object.keys(histories).sort().reverse();

  if (filter === 'today') dates = dates.filter(d => d === todayStr);
  else if (filter === 'yesterday') dates = dates.filter(d => d === yestStr);
  else if (filter === 'current_month') {
    const now = new Date();
    const prefix = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    dates = dates.filter(d => d.startsWith(prefix));
  }

  let totalSecs = 0, dayCount = 0;
  dates.forEach(date => { 
    if (histories[date] && histories[date].study && histories[date].study.totalSeconds > 0) {
      totalSecs += histories[date].study.totalSeconds;
      dayCount++;
    }
  });

  const pageSize = viewMode === 'analytics' ? HISTORY_ANALYTICS_PAGE_SIZE : HISTORY_PAGE_SIZE;
  const maxPage = Math.max(0, Math.ceil(dates.length / pageSize) - 1);
  historyPage = Math.min(historyPage, maxPage);
  const pageStart = historyPage * pageSize;
  const pagedDates = dates.slice(pageStart, pageStart + pageSize);

  if (viewMode === 'timeline') {
    renderTimelineView(container, pagedDates, histories, todayStr, yestStr);
  } else if (viewMode === 'table') {
    renderTableView(container, pagedDates, histories);
  } else if (viewMode === 'analytics') {
    renderAnalyticsView(container, pagedDates, histories);
  }

  if (dates.length > pageSize) {
    container.insertAdjacentHTML('beforeend', renderPager(
      dates.length,
      historyPage,
      pageSize,
      'setHistoryPage(-1)',
      'setHistoryPage(1)'
    ));
  }

  // Update Stats
  const totalEl = document.getElementById('historyTotalTime');
  const countEl = document.getElementById('historyDayCount');
  const avgEl = document.getElementById('historyAvgTime');
  if (totalEl) totalEl.textContent = formatTimeFull(totalSecs);
  if (countEl) countEl.textContent = dayCount;
  if (avgEl) avgEl.textContent = formatTimeFull(dayCount > 0 ? totalSecs/dayCount : 0);
}

function setHistoryPage(delta) {
  historyPage = Math.max(0, historyPage + delta);
  const container = document.getElementById('historyTimeline');
  if (container) renderHistoryUI(container, cachedHistories, getLocalDateString(0), getLocalDateString(-1));
}

function hydrateHistoryFilter() {
  const filterEl = document.getElementById('historyPeriodFilter');
  if (filterEl) {
    filterEl.value = getScopedItem('last_history_filter', 'current_month');
  }
}

function resetHistoryPageAndRender() {
  const filterEl = document.getElementById('historyPeriodFilter');
  if (filterEl) {
    setScopedItem('last_history_filter', filterEl.value);
  }
  historyPage = 0;
  renderHistory();
}

function getLocalDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function renderTimelineView(container, dates, histories, todayStr, yestStr) {
  let html = '<div style="display:flex; flex-direction:column; gap:15px; margin-top:1rem;">';
  dates.forEach((date, idx) => {
    const h = histories[date];
    const isToday = (date === todayStr);
    const isYesterday = (date === yestStr);
    const jobsCount = h.jobs ? h.jobs.newCount : 0;
    const topicList = h.study.topicList || [];
    const previewTopics = topicList.slice(0, 3);
    
    const colors = ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const accent = isToday ? '#10b981' : colors[idx % colors.length];

    html += `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; height:100%; width:4px; background:${accent};"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${isToday ? 'Today' : (isYesterday ? 'Yesterday' : date)}</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime((h.study && h.study.totalSeconds) ? h.study.totalSeconds : 0)}</div>
          </div>
          <button onclick="showHistoryModal('${date}')" style="background:${accent}22; color:${accent}; border:1px solid ${accent}44; padding:8px 15px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:0.2s;">🔍  View Deep Info</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${previewTopics.length > 0 ? previewTopics.map(t => {
            const name = t.name || t.id;
            return `<span style="font-size:0.65rem; background:rgba(255,255,255,0.05); color:var(--muted); padding:3px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              ${name}
            </span>`;
          }).join('') : `<span style="font-size:0.65rem; color:var(--muted); opacity:0.5;">No specific topics logged</span>`}
          ${topicList.length > 3 ? `<span style="font-size:0.65rem; color:var(--blue); padding:3px 0;">+${topicList.length - 3} more</span>` : ''}
        </div>
        
        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
           <div style="display:flex; gap:10px; align-items:center;">
             <span style="font-size:0.7rem; background:rgba(79,142,247,0.1); color:var(--blue); padding:3px 10px; border-radius:20px;">Radar Active</span>
             <span style="font-size:0.75rem; color:var(--text);">${jobsCount} Jobs Found</span>
           </div>
           <div style="font-size:0.7rem; color:var(--muted); font-family:'IBM Plex Mono';">#${date.replace(/-/g,'')}</div>
        </div>
      </div>`;
  });
  if (!dates.length) html = '<div style="text-align:center; padding:3rem; color:var(--muted);">No session history found.</div>';
  html += '</div>';
  container.innerHTML = html;
}

function renderTableView(container, dates, histories) {
  let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px; margin-top:1rem;">';
  dates.forEach((date, idx) => {
    const h = histories[date];
    const accent = '#4f8ef7';

    html += `
      <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:1.2rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--text);">${date}</span>
          <span style="font-size:0.85rem; color:var(--blue); font-family:'IBM Plex Mono'; font-weight:700;">${formatTime(h.study.totalSeconds)}</span>
        </div>
        <button onclick="showHistoryModal('${date}')" style="width:100%; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); color:var(--text); padding:8px; border-radius:8px; font-size:0.75rem; font-weight:600; cursor:pointer;">Analyze Topics</button>
        <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; font-size:0.65rem; color:var(--green); display:flex; justify-content:space-between;">
           <span>Radar Matches</span>
           <span>+${h.jobs ? h.jobs.newCount : 0} Hits</span>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderAnalyticsView(container, dates, histories) {
  const topicStats = {};
  const topicDetails = {};
  
  dates.forEach(date => {
    const h = histories[date];
    const breakdown = h.study.topicBreakdown || {};
    
    if (Object.keys(breakdown).length > 0) {
      Object.keys(breakdown).forEach(t => {
        if (t === 'None') return;
        topicStats[t] = (topicStats[t] || 0) + (breakdown[t].totalSeconds || 0);
        if (!topicDetails[t]) topicDetails[t] = { sessions: 0, lastDate: date };
        topicDetails[t].sessions += (h.study.sessionsCount || 1);
        if (date > topicDetails[t].lastDate) topicDetails[t].lastDate = date;
      });
    } else if (h.study.totalSeconds > 0) {
      // Fallback for old data: assume topTopic or distribute among allTopics
      const topT = h.study.topTopic || (h.study.allTopics && h.study.allTopics[0]) || 'General';
      topicStats[topT] = (topicStats[topT] || 0) + h.study.totalSeconds;
      if (!topicDetails[topT]) topicDetails[topT] = { sessions: 0, lastDate: date };
      topicDetails[topT].sessions += (h.study.sessionsCount || 1);
    }
  });

  const sortedTopics = Object.keys(topicStats).sort((a,b) => topicStats[b] - topicStats[a]);
  let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:15px; margin-top:1rem;">';
  
  sortedTopics.forEach((t, idx) => {
    let cfg = null;
    for (let id in topicConfig) { if (topicConfig[id].name === t || t.startsWith(topicConfig[id].name)) { cfg = topicConfig[id]; break; } }
    const spent = topicStats[t];
    const target = cfg ? (cfg.recommended * 60) : 3600;
    const pct = Math.min((spent / target) * 100, 100);
    const details = topicDetails[t];
    
    const colors = ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const accent = colors[idx % colors.length];

    html += `
      <div style="background:rgba(255,255,255,0.02); padding:1.2rem; border-radius:12px; border:1px solid rgba(255,255,255,0.05); position:relative; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
        <div style="position:absolute; top:0; left:0; height:100%; width:4px; background:${accent};"></div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
          <div style="font-size:1rem; font-weight:700; color:var(--text); line-height:1.2;">${t}</div>
          <div style="font-size:0.7rem; font-weight:700; color:${accent}; background:rgba(255,255,255,0.05); padding:3px 10px; border-radius:10px;">${Math.round(pct)}% Done</div>
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:1.5rem;">
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:8px;">
            <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Total Time</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime(spent)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:8px;">
            <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Sessions</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${details.sessions}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--muted); margin-bottom:10px;">
           <span>Target: ${formatTime(target)}</span>
           <span>Last: ${details.lastDate}</span>
        </div>

        <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${accent}; box-shadow:0 0 10px ${accent}44;"></div>
        </div>
      </div>`;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// =============================================
// TRACKER UI RENDERER
// =============================================
async function updateTrackerUI(useCache = false) {
  const data = useCache && globalStudyData ? globalStudyData : await getStudyData();
  var allTopics = Object.keys(topicConfig);
  var liveSeconds = getCurrentElapsed();
  
  var totalSeconds = 0, totalSessionCount = 0, topicsStudied = 0, todaySeconds = 0;
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  
  allTopics.forEach(function(id) {
    var td = data.topics[id];
    if (td) {
      totalSeconds += td.totalSeconds;
      totalSessionCount += td.sessions;
      if (td.totalSeconds > 0) topicsStudied++;
    }
  });
  if (currentTrackedPage) totalSeconds += liveSeconds;
  
  data.sessions.forEach(function(s) {
    if (s.date === today) todaySeconds += s.duration;
  });
  if (currentTrackedPage) todaySeconds += liveSeconds;

  // Real-time Summary Card Update
  const card = document.getElementById('dailyInsightCard');
  const content = document.getElementById('summaryContent');
  if (card && content) {
    card.style.display = 'block';
    const studyHrs = (todaySeconds / 3600).toFixed(2);
    const activeTopic = currentTrackedPage ? topicConfig[currentTrackedPage].name : 'None';
    
    content.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--blue);"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
        <span><b>Real-time Update:</b> You've studied for <b>${studyHrs} hours</b> today.</span>
      </div>
      ${currentTrackedPage ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--green);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Currently focusing on: <b style="color:var(--green);">${activeTopic}</b></div>` : ''}
      <div style="color:var(--blue); font-size:0.7rem; margin-top:8px; display:flex; align-items:center; gap:4px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07M4.93 4.93a10 10 0 0 0 0 14.14"></path><circle cx="12" cy="12" r="3"></circle></svg>
        Live cloud-syncing active...
      </div>
    `;
  }
  
  var el;
  el = document.getElementById('totalStudyTime'); if(el) el.textContent = formatTimeFull(totalSeconds);
  el = document.getElementById('totalSessions'); if(el) el.textContent = totalSessionCount + (currentTrackedPage ? '+1' : '');
  el = document.getElementById('totalTopics'); if(el) el.textContent = topicsStudied + ' / ' + allTopics.length;
  el = document.getElementById('todayTime'); if(el) el.textContent = formatTimeFull(todaySeconds);
  
  var chartEl = document.getElementById('timeChart');
  if (chartEl) {
    var maxSeconds = 1;
    var colors = {'Technical':'linear-gradient(90deg,#4f8ef7,#22d3ee)','Communication':'linear-gradient(90deg,#f472b6,#a78bfa)','Domain':'linear-gradient(90deg,#f4c542,#3dd68c)','FDE Prep':'linear-gradient(90deg,#6366f1,#a78bfa)','General':'linear-gradient(90deg,#3dd68c,#22d3ee)','Scenarios':'linear-gradient(90deg,#fb923c,#f472b6)','Reference':'linear-gradient(90deg,#a78bfa,#818cf8)','Strategy':'linear-gradient(90deg,#f4c542,#fb923c)','Company':'linear-gradient(90deg,#34d399,#3dd68c)'};
    allTopics.forEach(function(id) {
      var s = (data.topics[id]?data.topics[id].totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      if (s > maxSeconds) maxSeconds = s;
    });
    var chartHtml = '';
    allTopics.forEach(function(id) {
      var cfg = topicConfig[id];
      var s = (data.topics[id]?data.topics[id].totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      var pct = Math.min((s/maxSeconds)*100, 100);
      if (s===0 && maxSeconds>1) pct = 0;
      var color = colors[cfg.group] || colors['General'];
      var active = currentTrackedPage===id ? ' <span style="color:var(--green);font-size:0.6rem;"> LIVE</span>' : '';
      chartHtml += '<div class="chart-bar-container"><div class="chart-bar-label">'+cfg.name+active+'</div><div class="chart-bar-wrap"><div class="chart-bar-value" style="width:'+pct+'%;background:'+color+';"></div></div><div class="chart-bar-time">'+formatTime(s)+'</div></div>';
    });
    chartEl.innerHTML = chartHtml;
  }
  
  var sugEl = document.getElementById('suggestions');
  if (sugEl) {
    var sug = generateSuggestions(data);
    sugEl.innerHTML = sug.map(function(s){ return '<div class="suggestion-card"><span class="suggestion-icon">'+s.icon+'</span><span class="suggestion-text">'+s.text+'</span> <span class="suggestion-priority '+s.cls+'">'+s.priority+'</span></div>'; }).join('');
  }
  
  var gridEl = document.getElementById('trackerGrid');
  if (gridEl) {
    var gridHtml = '';
    allTopics.forEach(function(id) {
      var cfg = topicConfig[id], td = data.topics[id];
      var s = (td?td.totalSeconds:0) + (currentTrackedPage===id?liveSeconds:0);
      var pct = Math.min((s/60)/cfg.recommended*100, 100);
      var status = getTopicStatus(id, data);
      var last = td&&td.lastStudied ? new Date(td.lastStudied).toLocaleDateString() : 'Never';
      var isActive = currentTrackedPage===id;
      gridHtml += '<div class="tracker-card" style="--progress:'+pct+'%;'+(isActive?'border-color:var(--green);':'')+'">';
      gridHtml += '<div class="tracker-status '+status.cls+'">'+(isActive?(isPaused?' PAUSED':' LIVE'):status.label)+'</div>';
      gridHtml += '<div class="tracker-topic">'+cfg.name+'</div>';
      gridHtml += '<div class="tracker-time">'+formatTime(s)+' <span style="font-size:0.7rem;color:var(--muted);font-weight:400;">/ '+cfg.recommended+'m</span></div>';
      gridHtml += '<div class="tracker-bar"><div class="tracker-bar-fill" style="width:'+pct+'%;"></div></div>';
      gridHtml += '<div class="tracker-sessions">'+(td?td.sessions:0)+' sessions  -  Last: '+last+'</div></div>';
    });
    gridEl.innerHTML = gridHtml;
  }
  
  var histEl = document.getElementById('sessionHistory');
  if (histEl) {
    var sess = (data.sessions || []).slice(-10).reverse();
    if (!sess.length) {
      histEl.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">No sessions yet. Open any topic to start.</p>';
    } else {
      var hh = '<table class="comparison-table" style="margin:0;"><tr><th>Topic</th><th>Duration</th><th>Date</th></tr>';
      sess.forEach(function(s) {
        var d = new Date(s.date);
        hh += '<tr><td>'+s.topicName+'</td><td>'+formatTime(s.duration)+'</td><td>'+d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</td></tr>';
      });
      histEl.innerHTML = hh + '</table>';
    }
  }
}

async function resetTracker() {
  if (confirm('Reset ALL study data? This will wipe your local and cloud database. This cannot be undone.')) {
    try {
      await apiFetch('/api/study/reset', { method: 'POST' });
      
      // Clear current user's local tracker cache, plus legacy unscoped keys.
      removeScopedPrefix('timer_', 'timer_');
      removeScopedPrefix('last_q_', 'last_q_');
      removeScopedStorage('tracker', TRACKER_KEY);
      
      currentTrackedPage = null; 
      trackingStartTime = null; 
      isPaused = false; 
      pausedElapsed = 0;
      baseSeconds = 0;
      
      await updateTrackerUI(); 
      updateFloatingTimer();
      showToast('Cloud and local data reset. Fresh start enabled.');
    } catch (e) {
      showToast('Failed to reset cloud data. Please check your server connection.');
    }
  }
}

// =============================================
// JOB RADAR INTEGRATION
// =============================================
function updateJobRadarSummary() {
  try {
    const dbJobs = window.allJobRecords || [];
    const submittedCount = pipelineJobs.filter(job => job.status !== 'todo').length;
    const elDedupe = document.getElementById('dedupeCount');
    const elTracked = document.getElementById('trackedCount');
    const elApplied = document.getElementById('appliedCount');

    if (elDedupe) elDedupe.textContent = String(dbJobs.length);
    if (elTracked) elTracked.textContent = String(pipelineJobs.length);
    if (elApplied) elApplied.textContent = String(submittedCount);
  } catch (e) {
    console.error('Failed to update job summary', e);
  }
}

window.allJobRecords = [];
window.jobRadarCloudState = window.jobRadarCloudState || { status: 'idle', message: '', detail: '' };
window.jobRadarEmptyMessage = '';

function setJobRadarNotice(status, message, detail) {
  window.jobRadarCloudState = { status, message: message || '', detail: detail || '' };
  if (window.RadarCloud) {
    window.RadarCloud.setNotice(status, message, detail);
  }
}

function setJobRadarBadge(text, variant, title) {
  if (window.RadarCloud) {
    window.RadarCloud.setBadge('dbStatusBadge', text, variant, title);
    return;
  }
  const dbBadge = document.getElementById('dbStatusBadge');
  if (dbBadge) dbBadge.textContent = text;
}

function getApiErrorPayload(response) {
  return response.json().catch(() => ({}));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeInlineArg(value) {
  return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}

function safeUrl(value) {
  if (!value) return '#';
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return parsed.href;
  } catch (e) {
    return '#';
  }
}

function normalizeProbability(probability, score) {
  const value = String(probability || '').toLowerCase();
  if (value === 'high' || value === 'medium' || value === 'stretch') return value;
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'stretch';
}

function mapRecordStatusToBoardStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'applied') return 'applied';
  if (normalized === 'ignored' || normalized === 'rejected') return 'rejected';
  if (normalized === 'interview' || normalized === 'offer' || normalized === 'todo') return normalized;
  return 'todo';
}

function buildPipelineJobFromRecord(record, existingJob) {
  const existing = existingJob || {};
  const score = Number(record.match_score || existing.score || 75);
  const jobHash = record.job_hash || existing.job_hash || btoa([
    record.company || existing.company || '',
    record.role || record.title || existing.role || '',
    record.location || existing.loc || ''
  ].join('|'));
  const rawRecordStatus = record.board_status || record.status;
  const normalizedRawStatus = String(rawRecordStatus || '').toLowerCase();
  const hasCloudStatusOverride = Boolean(record.board_status || record.statusUpdatedAt || record.status_updated_at);
  const hasMeaningfulRecordStatus = ['applied', 'ignored', 'rejected', 'interview', 'offer', 'todo'].includes(normalizedRawStatus);
  const mappedStatus = (hasCloudStatusOverride || hasMeaningfulRecordStatus)
    ? mapRecordStatusToBoardStatus(rawRecordStatus)
    : (existing.status || mapRecordStatusToBoardStatus(rawRecordStatus));
  const statusUpdatedAt = record.statusUpdatedAt || record.status_updated_at || existing.statusUpdatedAt || existing.updatedAt || '';

  return {
    ...existing,
    id: String(existing.id || record.id || record._id || jobHash || ('job_' + Math.random().toString(36).slice(2, 11))),
    job_hash: jobHash,
    company: record.company || existing.company || 'Confidential',
    role: record.role || record.title || existing.role || 'Salesforce Role',
    loc: record.location || existing.loc || 'India',
    sal: record.salary || existing.sal || 'Competitive',
    experience: record.experience || existing.experience || '3-5 Yrs',
    company_type: record.company_type || existing.company_type || 'MNC',
    why_apply: record.why_apply || existing.why_apply || 'Matches your current Salesforce profile and target path.',
    skills: Array.isArray(record.matched_skills) && record.matched_skills.length
      ? record.matched_skills
      : (existing.skills || ['Apex', 'LWC']),
    matched_skills: Array.isArray(record.matched_skills) ? record.matched_skills : (existing.matched_skills || []),
    missing_skills: Array.isArray(record.missing_skills) ? record.missing_skills : (existing.missing_skills || []),
    resume_actions: Array.isArray(record.resume_actions) ? record.resume_actions : (existing.resume_actions || []),
    score,
    prob: normalizeProbability(record.probability, score),
    status: mappedStatus,
    statusUpdatedAt,
    url: safeUrl(record.apply_link || record.url || existing.url || '#'),
    createdAt: record.first_seen_at || record.firstSeenAt || record.createdAt || record.created_at || existing.createdAt || existing.created_at || '',
    created_at: record.first_seen_at || record.firstSeenAt || record.created_at || record.createdAt || record.date_added || existing.created_at || existing.createdAt || new Date().toISOString(),
    date_added: record.date_added || record.first_seen_at || record.created_at || record.createdAt || existing.date_added || '',
    first_seen_at: record.first_seen_at || record.firstSeenAt || existing.first_seen_at || '',
    updatedAt: record.last_seen_at || record.lastSeenAt || record.updated_at || record.updatedAt || existing.updatedAt || existing.last_seen_at || '',
    updated_at: record.updated_at || record.updatedAt || record.last_seen_at || existing.updated_at || '',
    last_seen_at: record.last_seen_at || record.lastSeenAt || existing.last_seen_at || '',
    posted_at: record.posted_at || record.postedAt || record.posted_date || existing.posted_at || '',
    source_platform: record.source_platform || record.source || existing.source_platform || '',
    match_level: record.match_level || existing.match_level || '',
    dateApplied: record.appliedAt || existing.dateApplied || (mappedStatus === 'applied' ? new Date().toISOString() : ''),
    outreach: existing.outreach || null,
    icon: existing.icon || record.icon || 'SF'
  };
}

function getBoardSearchTerm() {
  return currentBoardSearch.trim().toLowerCase();
}

function jobMatchesBoardSearch(job, term) {
  if (!term) return true;
  const haystack = [
    job.company,
    job.role,
    job.loc,
    job.company_type,
    job.why_apply,
    ...(job.skills || []),
    ...(job.missing_skills || [])
  ].join(' ').toLowerCase();
  return haystack.includes(term);
}

function getProbabilityMeta(probability) {
  if (probability === 'high') return { label: 'High fit', cls: 'high' };
  if (probability === 'stretch') return { label: 'Stretch', cls: 'stretch' };
  return { label: 'Medium fit', cls: 'medium' };
}

function sortBoardJobs(a, b) {
  const followA = getFollowUpStatus(a);
  const followB = getFollowUpStatus(b);
  const followWeight = { ghost: 3, urgent: 2, warn: 1 };
  const followDelta = (followWeight[followB?.class] || 0) - (followWeight[followA?.class] || 0);
  if (followDelta !== 0) return followDelta;

  const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDelta !== 0) return scoreDelta;

  const dateA = new Date(a.first_seen_at || a.createdAt || a.created_at || a.date_added || a.posted_at || a.last_seen_at || a.updatedAt || a.updated_at || 0);
  const dateB = new Date(b.first_seen_at || b.createdAt || b.created_at || b.date_added || b.posted_at || b.last_seen_at || b.updatedAt || b.updated_at || 0);
  return dateB - dateA;
}

function getBoardColumnJobs(col) {
  const searchTerm = (document.getElementById("boardSearch")?.value || currentBoardSearch || '').trim().toLowerCase();
  const filter = window.currentBoardFilter || 'all';
  return (window.pipelineJobs || [])
    .filter(j => mapRecordStatusToBoardStatus(j.status) === col)
    .filter(j => filter === 'all' || normalizeProbability(j.prob || j.probability, j.score) === filter)
    .filter(j => jobMatchesBoardSearch(j, searchTerm))
    .sort(sortBoardJobs);
}

window.getBoardColumnJobs = getBoardColumnJobs;
window.getRadarColumnEmptyMessage = function() {
  const cloudState = window.jobRadarCloudState || {};
  if (cloudState.status === 'locked') return 'Sign in to sync private job data.';
  if (cloudState.status === 'loading') return 'Syncing cloud job sources...';
  if (cloudState.status === 'error') return 'Cloud sync failed. Existing local cards remain available.';
  return window.jobRadarEmptyMessage || 'No matching roles in this stage.';
};

function clampBoardPages() {
  const cols = ['todo', 'applied', 'interview', 'offer', 'rejected'];
  const pageSize = Math.max(1, Number(window.JOB_BOARD_PAGE_SIZE || 6));
  window.radarBoardPages = window.radarBoardPages || { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
  cols.forEach(col => {
    const max = Math.max(0, Math.ceil(getBoardColumnJobs(col).length / pageSize) - 1);
    window.radarBoardPages[col] = Math.max(0, Math.min(max, window.radarBoardPages[col] || 0));
  });
}

function resetBoardPages() {
  window.radarBoardPages = { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
}

async function fetchJobsList() {
  console.log('[RADAR] Fetching jobs from database...');
  const isSignedIn = window.RadarCloud ? window.RadarCloud.hasAuth() : Boolean(localStorage.getItem('google_auth_token'));
  if (!isSignedIn) {
    window.allJobRecords = [];
    window.jobRadarEmptyMessage = 'Sign in with Google to sync private job data.';
    setJobRadarNotice('locked', 'Sign in to sync Job Radar', 'Your job pipeline and status changes stay private behind Google sign-in.');
    setJobRadarBadge('Sign-in Required', 'locked', 'Job Radar data is protected.');
    const archiveBadge = document.getElementById('archiveStatusBadge');
    if (archiveBadge) archiveBadge.hidden = true;
    clampBoardPages();
    renderBoard();
    updateJobRadarSummary();
    return { locked: true };
  }

  window.jobRadarEmptyMessage = 'Syncing cloud job sources...';
  setJobRadarNotice('loading', 'Syncing Job Radar', 'Reading private pipeline data from the configured cloud stores.');
  setJobRadarBadge('Syncing', 'neutral', 'Job Radar is loading.');
  if (typeof renderBoard === 'function') renderBoard();

  try {
    const response = await apiFetch('/api/jobs');
    const data = await getApiErrorPayload(response);
    const classification = window.RadarCloud?.classifyApiResponse(response, data);
    if (classification && classification.status !== 'ready' && classification.status !== 'degraded') {
      window.jobRadarEmptyMessage = classification.detail || classification.message;
      setJobRadarNotice(classification.status, classification.message, classification.detail);
      setJobRadarBadge(classification.status === 'locked' ? 'Sign-in Required' : 'Sync Failed', classification.status === 'locked' ? 'locked' : 'error', classification.detail);
      clampBoardPages();
      renderBoard();
      updateJobRadarSummary();
      return data;
    }
    if (!response.ok) throw new Error(data.error || 'Job Radar server unavailable');
    console.log('[RADAR] Raw Server Response:', data);
    const rawRecords = data.records || [];
    window.allJobRecords = rawRecords.filter(rec => {
      // Defensive filter: Exclude metadata/system records that might leak into the jobs array
      const title = (rec.role || rec.title || '').toLowerCase();
      if (title.includes('storage') || title.includes('capacity') || title.includes('unified')) return false;
      return true;
    });
    console.log(`✅ [RADAR] Received ${window.allJobRecords.length} professional jobs. DB Status: ${data.dbStatus}`);
    window.jobRadarEmptyMessage = rawRecords.length
      ? ''
      : 'No fresh cloud roles returned yet. Run a scan or add a custom role.';

    let addedCount = 0;
    let updatedCount = 0;

    window.allJobRecords.forEach(rec => {
      let rawStr = [
        rec.company || '',
        rec.role || rec.title || '',
        rec.location || ''
      ].join('|');
      let fallbackHash = rec.job_hash;
      if (!fallbackHash) {
          try {
              fallbackHash = btoa(unescape(encodeURIComponent(rawStr)));
          } catch(e) {
              fallbackHash = rawStr; // Safe fallback
          }
      }

      const existingIndex = pipelineJobs.findIndex(job =>
        job.id === rec.id ||
        job.job_hash === fallbackHash ||
        (job.company === rec.company && job.role === (rec.role || rec.title))
      );

      if (existingIndex >= 0) {
        pipelineJobs[existingIndex] = buildPipelineJobFromRecord(rec, pipelineJobs[existingIndex]);
        updatedCount += 1;
      } else {
        pipelineJobs.unshift(buildPipelineJobFromRecord(rec));
        addedCount += 1;
      }
    });

    clampBoardPages();
    savePipeline();
    renderBoard();
    updateJobRadarSummary();
    fetchJobAnalytics();
    renderLog();
    switchRadarSubTab(currentRadarSubTab);

    if (window.RadarCloud) window.RadarCloud.applyJobsPayload(data);
    else setJobRadarBadge(data.degraded?.active ? 'Degraded' : 'Cloud Active', data.degraded?.active ? 'warn' : 'ready');

    if (addedCount > 0) {
      logActivity(`Synced ${addedCount} new jobs into the board and refreshed ${updatedCount} existing cards.`, 'success');
    }
    return data;
  } catch (e) {
    console.error('❌ [RADAR] Error fetching jobs:', e);
    window.jobRadarEmptyMessage = 'Could not reach the Job Radar API. Existing local cards are still available.';
    setJobRadarNotice('error', 'Job Radar sync failed', e.message || 'Could not reach the cloud API.');
    setJobRadarBadge('Sync Failed', 'error', e.message || 'Job Radar sync failed.');
    if (typeof renderBoard === 'function') renderBoard();
    showToast('Job Radar sync failed. Existing local cards are still available.');
    return { success: false, error: e.message };
  }
}

// --- BOARD INTERACTION HANDLERS (Restored v1412) ---
window.moveTo = async function(id, status) {
  console.log(`🚚 [RADAR] Moving job ${id} to ${status}`);
  const job = window.pipelineJobs.find(j => j.id === id);
  if (!job) return;
  
  const normalizedStatus = mapRecordStatusToBoardStatus(status);
  const updatedAt = new Date().toISOString();
  job.status = normalizedStatus;
  job.updatedAt = updatedAt;
  job.statusUpdatedAt = updatedAt;
  if (normalizedStatus === 'applied') {
    if (!job.appliedAt) job.appliedAt = updatedAt;
    if (!job.dateApplied) job.dateApplied = job.appliedAt;
  }
  
  clampBoardPages();
  savePipeline();
  renderBoard();
  updateJobRadarSummary();
  
  try {
    const routeId = encodeURIComponent(job.job_hash || id);
    const response = await apiFetch(`/api/jobs/${routeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: normalizedStatus,
        job_hash: job.job_hash || '',
        jobId: id,
        updatedAt,
        appliedAt: job.appliedAt || ''
      })
    });
    if (!response.ok) {
      const data = await getApiErrorPayload(response);
      throw new Error(data.error || 'Cloud status sync failed');
    }
    logActivity(`Moved ${job.company} to ${normalizedStatus.toUpperCase()}`, 'success');
  } catch (e) {
    console.error('❌ [RADAR] Server sync failed:', e);
    logActivity(`Saved ${job.company} locally. Cloud status sync will retry on next sign-in.`, 'info');
  }
};

window.setBoardPage = function(col, dir) {
  const filtered = getBoardColumnJobs(col);
  const pageSize = Math.max(1, Number(window.JOB_BOARD_PAGE_SIZE || 6));
  const max = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  window.radarBoardPages[col] = Math.max(0, Math.min(max, (window.radarBoardPages[col] || 0) + dir));
  renderBoard();
};

window.setBoardFilter = function(filter, btn) {
  window.currentBoardFilter = filter;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  resetBoardPages();
  renderBoard();
};

window.doBoardSearch = function() {
  resetBoardPages();
  renderBoard();
};

window.switchRadarSubTab = function(tabId) {
  window.currentRadarSubTab = tabId;
  document.querySelectorAll('.radar-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  
  document.querySelectorAll('.radar-view').forEach(v => v.style.display = 'none');
  document.getElementById(`radar-${tabId}-view`).style.display = 'block';
  
  if (tabId === 'pipeline') renderBoard();
  if (tabId === 'insights') {
    renderInsights();
    renderLog();
  }
  if (tabId === 'development') renderDevelopment();
};

window.handleDragStart = function(e, id) {
  e.dataTransfer.setData('text/plain', id);
  e.currentTarget.style.opacity = '0.4';
};

window.handleDragEnd = function(e) {
  if (e.currentTarget) e.currentTarget.style.opacity = '1';
  document.querySelectorAll('#job_radar .kanban-body.drag-over').forEach(el => el.classList.remove('drag-over'));
};

window.handleDragOver = function(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = function(e) {
  e.currentTarget.classList.remove('drag-over');
};

window.handleDrop = function(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const id = e.dataTransfer.getData('text/plain');
  const card = document.getElementById(`card-${id}`);
  if (card) card.style.opacity = '1';
  window.moveTo(id, status);
};

function clearAndSyncJobs() {
    console.log('🧹 Resetting Job Radar cache only...');
    removeScopedStorage('pipelineJobs', 'sfpipe2026v3');
    removeScopedStorage('activityLog', 'sfActivityLog');
    pipelineJobs = [];
    activityLog = [];
    currentBoardSearch = '';
    currentBoardFilter = 'all';
    radarBoardPages = { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    activityLogPage = 0;
    showToast('Job Radar cache cleared. Rebuilding from the latest scan...');
    setTimeout(() => {
        window.location.reload();
    }, 1200);
}

async function fetchJobAnalytics() {
  try {
    const response = await apiFetch('/api/jobs/analytics');
    if (!response.ok) return;
    const data = await response.json();
    const matchedSkills = data.matched_skills || data.topMatched || [];
    const missingSkills = data.missing_skills || data.topMissing || [];
    const topCompanies = data.top_companies || data.topCompanies || [];
    
    const matchedEl = document.getElementById('matchedSkillsTrends');
    const missingEl = document.getElementById('missingSkillsTrends');
    const companiesEl = document.getElementById('topCompaniesTrends');
    
    if (matchedEl) {
      matchedEl.innerHTML = matchedSkills.length ? matchedSkills.map(s => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px; transition:all 0.2s;"><span style="color:var(--text);">${escapeHtml(s._id)}</span> <span style="font-weight:700; color:var(--green);">${Number(s.count || 0)}</span></div>`).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
    if (missingEl) {
      missingEl.innerHTML = missingSkills.length ? missingSkills.map(s => `
        <div onclick="openSkillCoach('${encodeInlineArg(s._id)}')"
             style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px; cursor:pointer; transition:all 0.2s;"
             onmouseover="this.style.background='rgba(59,130,246,0.1)'; this.style.paddingLeft='5px';"
             onmouseout="this.style.background='transparent'; this.style.paddingLeft='0';">
          <span style="color:var(--amber); display:flex; align-items:center; gap:5px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            ${escapeHtml(s._id)}
          </span>
          <span style="font-weight:700; color:var(--text);">${Number(s.count || 0)}</span>
        </div>
      `).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
    if (companiesEl) {
      companiesEl.innerHTML = topCompanies.length ? topCompanies.map(c => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;"><span style="color:var(--text);">${escapeHtml(c._id)}</span> <span style="font-weight:700; color:var(--blue);">${Number(c.count || 0)}</span></div>`).join('') : '<span style="color:var(--muted);">No data yet.</span>';
    }
    
  } catch (e) {
    console.error('Failed to fetch analytics', e);
  }
}

window.openSkillCoach = async function(skill) {
  try { skill = decodeURIComponent(skill); } catch (e) {}
  const modal = document.getElementById('coachModal');
  const chat = document.getElementById('coachChat');
  if (!modal || !chat) return;
  
  modal.style.display = 'flex';
  chat.innerHTML = `<div style="background: linear-gradient(135deg, var(--blue), var(--cyan)); color: white; padding: 15px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.9rem; box-shadow: 0 4px 15px rgba(59,130,246,0.3);">
    <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px; opacity:0.8;">Industrial AI Coach</div>
    Generating a specialized 3-day study plan to master <strong>${skill}</strong>...
  </div>`;
  
  try {
    const prompt = `Create a concise, highly actionable 3-day study plan for a Salesforce Developer to master ${skill}. Focus on real-world scenarios and specific concepts needed to pass a technical interview. Formatting: use short paragraphs and bullet points.`;
    const responseText = await callAi('skill', { skill, prompt });
    chat.innerHTML += `<div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--text); padding: 15px; border-radius: 12px 12px 0 12px; margin-top: 15px; max-width: 90%; font-size: 0.85rem; align-self: flex-end; backdrop-filter: blur(10px); line-height: 1.6;">
      ${responseText.replace(/\n/g, '<br>')}
    </div>`;
  } catch (e) {
    chat.innerHTML += `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: var(--red); padding: 12px; border-radius: 12px; margin-top: 10px;">
      AI coaching is unavailable right now. Please try again after the server connection recovers.
    </div>`;
  }
}

async function fetchJobs() {
  return fetchJobsList();
}

function filterJobsList() {
  renderBoard();
}

function renderJobsList(jobs) {
  const container = document.getElementById('jobsListContainer');
  if (!container) return;
  
  if (!jobs || !jobs.length) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center;">No jobs tracked yet.</p>';
    return;
  }
  
  container.innerHTML = jobs.map(job => `
    <div class="job-card">
      <div class="job-info">
        <div class="job-title">${escapeHtml(job.title || job.role || 'Salesforce role')}</div>
        <div class="job-company">${escapeHtml(job.company || 'Confidential')} · ${escapeHtml(job.location || job.loc || 'India')}</div>
      </div>
      <div class="job-actions">
        <a class="btn-action" href="${safeUrl(job.apply_link || job.url)}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
    </div>
  `).join('');
}

async function triggerJobScan() {
  const btn = document.getElementById('btnScanJobs');
  const statusText = document.getElementById('scanStatusText');
  const originalHtml = btn ? (btn.dataset.originalHtml || btn.innerHTML) : '';
  const isSignedIn = window.RadarCloud ? window.RadarCloud.hasAuth() : Boolean(localStorage.getItem('google_auth_token'));

  if (!isSignedIn) {
    setJobRadarNotice('locked', 'Sign in to run a cloud scan', 'The scan can only attach results to your private Google profile after sign-in.');
    setJobRadarBadge('Sign-in Required', 'locked', 'Sign in before starting a scan.');
    if (statusText) statusText.textContent = 'Sign in to run a private cloud scan.';
    showToast('Sign in with Google before running Job Radar scan.');
    return;
  }

  if (btn) {
    btn.dataset.originalHtml = originalHtml;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = 'SCANNING JOB SOURCES...';
  }
  if (statusText) statusText.textContent = 'Running fresh job scan and profile match analysis...';
  setJobRadarNotice('loading', 'Starting Job Radar scan', 'Queuing the cloud workflow and keeping your current board available.');

  showToast('Scan started. Fetching the latest Salesforce roles.');

  try {
    const res = await apiFetch('/api/jobs/scan', { method: 'POST' });
    const data = await getApiErrorPayload(res);
    if (!res.ok) throw new Error(data.error || 'Scan request failed');
    
    if (data.success) {
      const scanMessage = data.message || (data.queued ? 'Cloud job radar workflow queued successfully.' : 'Showing cached jobs while scan credentials are configured.');
      if (statusText) statusText.textContent = scanMessage;
      setJobRadarNotice(data.queued ? 'loading' : 'degraded', data.queued ? 'Cloud scan queued' : 'Cached scan mode', scanMessage);
      showToast(data.queued ? 'Cloud scan queued. The board will refresh shortly.' : 'Cloud scan is in cached mode. Check Vercel GitHub envs.');
      setTimeout(async () => {
        await fetchJobsList(); 
        showToast(data.queued ? 'Dashboard refreshed after scan request.' : 'Dashboard refreshed from cached cloud data.');
        if (statusText) statusText.textContent = data.queued ? 'Last scan request completed.' : 'Cached data refresh completed.';
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.innerHTML = btn.dataset.originalHtml || originalHtml;
        }
      }, 5000); 
    } else {
      throw new Error(data.error || 'Scan failed');
    }
  } catch (e) {
    console.error('Scan Error:', e);
    showToast('Scan request failed. Existing board data is still available.');
    setJobRadarNotice('error', 'Scan request failed', e.message || 'Check cloud scan configuration and try again.');
    if (statusText) statusText.textContent = 'Scan request failed. Check cloud scan configuration and try again.';
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = btn.dataset.originalHtml || originalHtml;
    }
  }
}

async function smartApply(hash) {
  if (!confirm('This will launch a local browser to attempt automated "Easy Apply" using your active Chrome session. Continue?')) return;
  
  try {
    const res = await apiFetch('/api/jobs/apply', {
      method: 'POST',
      body: JSON.stringify({ hash })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Automation launched. Look at your taskbar for a new Chrome window.');
    } else {
      showToast('Failed to launch automation: ' + data.error);
    }
  } catch (e) {
    showToast('Error connecting to local automation agent.');
  }
}

async function generateCoverLetter(hash) {
  const job = window.allJobRecords.find(j => j.job_hash === hash);
  if (!job) return;

  const btnIcon = document.getElementById(`cl_icon_${hash}`);
  const outputEl = document.getElementById(`cl_output_${hash}`);
  
  if (btnIcon) btnIcon.textContent = '...';
  if (!outputEl) return;
  outputEl.style.display = 'block';
  outputEl.innerHTML = '<span style="color:var(--muted);">AI is analyzing the job requirements and your matched skills to write a tailored cover letter...</span>';

  try {
    const prompt = `You are an expert career coach. Write a short, punchy, and highly professional 3-paragraph cover letter for a Salesforce Developer applying to ${job.company} for the "${job.title}" role. 
The candidate has the following skills that perfectly match the job: ${(job.matched_skills || []).join(', ')}. 
Do not include placeholders like [Your Name] or [Date], just write the core body of the letter. Focus on impact and value.`;

    const responseText = await callAi('cover-letter', { job, prompt });
    
    outputEl.innerHTML = responseText.replace(/\n/g, '<br>');
    if (btnIcon) btnIcon.textContent = 'OK';
    
  } catch(e) {
    outputEl.innerHTML = '<span style="color:var(--red);">AI cover letter generation is unavailable right now. Please try again shortly.</span>';
    if (btnIcon) btnIcon.textContent = 'Error';
  }
}


async function updateJobStatus(hash, status) {
  const boardStatus = mapRecordStatusToBoardStatus(status);
  const target = pipelineJobs.find(job => job.job_hash === hash);
  if (!target) return;
  moveTo(target.id, boardStatus);
}

function getActionSetForJob(job) {
  if (job.status === 'todo') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Mark Applied', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'applied')` },
      { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` },
      { label: 'Coach', cls: 'secondary', onClick: `openCoach(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'applied') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Interview', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'interview')` },
      { label: 'Outreach', cls: 'secondary', onClick: `openOutreach(decodeURIComponent('${encodeInlineArg(job.id)}'))` },
      { label: 'Email', cls: 'secondary', onClick: `openEmailModal(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'interview') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Offer', cls: 'success', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'offer')` },
      { label: 'Reject', cls: 'danger', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'rejected')` },
      { label: 'Coach', cls: 'secondary', onClick: `openCoach(decodeURIComponent('${encodeInlineArg(job.id)}'))` }
    ];
  }

  if (job.status === 'offer') {
    return [
      { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
      { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` },
      { label: 'Reject', cls: 'danger', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'rejected')` }
    ];
  }

  return [
    { label: 'Open Job', cls: 'primary', href: safeUrl(job.url) },
    { label: 'Reopen', cls: 'secondary', onClick: `moveTo(decodeURIComponent('${encodeInlineArg(job.id)}'), 'todo')` },
    { label: 'Prep', cls: 'secondary', onClick: `openPrepPanel(decodeURIComponent('${encodeInlineArg(job.company)}'))` }
  ];
}

const SCHEDULE_DATA = [
  { 
    time: '05:00', end: '05:40', title: 'Wake up naturally  -  no alarm panic', 
    desc: 'You already wake between 5 and 6 AM naturally  -  this is a powerful advantage. Your cortisol is highest in the early morning which means peak alertness and energy. Drink one large glass of water the moment you wake. Do NOT open your phone, WhatsApp, or social media before your workout. Start the body first, screens later.', 
    tag: 'Fitness' 
  },
  { 
    time: '05:40', end: '06:10', title: 'Morning Workout  -  strength, bodyweight, or gym', 
    desc: 'Whatever your current workout routine is  -  keep doing it exactly as you are. Exercise before study has been shown to boost memory retention, focus, and mood for 2 - 4 hours afterward. This is not time away from preparation  -  the workout IS preparation. It makes every study session more effective.', 
    tag: 'Fitness' 
  },
  { 
    time: '06:10', end: '08:00', title: '10,000 Steps Walk  -  outdoor walk', 
    desc: 'Outdoor walk. Rehearse STAR stories or listen to podcasts. Subconscious processing happens here. Choose tech blogs or speaking practice.', 
    tag: 'Fitness' 
  },
  { 
    time: '08:00', end: '08:30', title: 'Communication Block 1  -  Read aloud + Vocab', 
    desc: 'Read one tech article aloud slowly. Trains pronunciation, fluency, and confidence. Pick 3 new words and use them in a Salesforce context.', 
    tag: 'Comm' 
  },
  { 
    time: '08:30', end: '10:30', title: 'Core Technical Study Block 1  -  Deep Focus', 
    desc: 'Post-workout, post-walk, your brain is at absolute peak performance. Focus on today topic. No phone, no music, no interruptions. Explain it aloud to yourself from memory.', 
    tag: 'Technical' 
  },
  { 
    time: '10:30', end: '12:00', title: 'Hands-on Coding  -  Trailhead / Dev Org', 
    desc: 'Build what you just studied. Write every line from scratch in your Dev Org. Do not copy-paste. Coding errors you solve now are your best teachers.', 
    tag: 'Coding' 
  },
  { 
    time: '12:00', end: '13:00', title: 'Spoken Interview Q&A Practice', 
    desc: 'Answer 3-4 questions out loud. Record yourself and watch honestly. Note filler words, speed, and structure (Point -> Explain -> Example).', 
    tag: 'Comm' 
  },
  { 
    time: '13:00', end: '14:30', title: 'Lunch + Power Nap  -  Brain Reset', 
    desc: 'Eat a proper lunch. Move completely away from the desk. No studying, no screens. Quality rest leads to a quality afternoon session.', 
    tag: 'Rest' 
  },
  { 
    time: '14:30', end: '16:00', title: 'Core Technical Study Block 2  -  Deep Dive', 
    desc: 'Go deeper into this morning topic or related sub-topics. Depth beats breadth. Write code for every concept. Study aggregate functions, bind variables, etc.', 
    tag: 'Technical' 
  },
  { 
    time: '16:00', end: '16:30', title: 'Job Radar Application  -  Radar Dashboard', 
    desc: 'Apply to 3-5 roles via Radar Dashboard. Send 2 personalized recruiter messages. Consistency here is everything  -  zero applications = zero chances.', 
    tag: 'Radar' 
  },
  { 
    time: '16:30', end: '17:00', title: 'Chai + Micro-break  -  Disconnect', 
    desc: 'Step away from screen. Rest your eyes. Let your brain move short-term memory to long-term storage. No phone during this window.', 
    tag: 'Rest' 
  },
  { 
    time: '17:00', end: '18:00', title: 'Communication Block 2  -  STAR Stories', 
    desc: 'Master 2 STAR stories today. Practice out loud. Each story should be 2-2.5 minutes. Lead with the result: "I reduced pull time from 25m to 30s."', 
    tag: 'Comm' 
  },
  { 
    time: '18:00', end: '19:00', title: 'Project/Portfolio Build  -  Developer Org', 
    desc: 'Extend your mortgage platform or campaign feature. Gives you fresh real-world examples to discuss in interviews. build something new every week.', 
    tag: 'Coding' 
  },
  { 
    time: '19:00', end: '19:30', title: 'Evening Walk  -  Mental Decompression', 
    desc: 'Short outdoor break to separate study from evening. Important for mental health and mood regulation. Fully disconnect.', 
    tag: 'Rest' 
  },
  { 
    time: '19:30', end: '20:30', title: 'Revision + Flashcard Writing (Handwritten)', 
    desc: 'Handwrite the 5 most important things learned today. Quiz yourself out loud. Handwriting + speaking aloud creates the strongest memory encoding.', 
    tag: 'Technical' 
  },
  { 
    time: '20:30', end: '22:00', title: 'Dinner + Family  -  Fully Disconnected', 
    desc: 'Consolidate learning by resting. No phone, no LinkedIn. Protect this window to allow neurological processing of the day learning.', 
    tag: 'Rest' 
  },
  { 
    time: '22:00', end: '22:30', title: 'Night Review  -  20 Min Preview', 
    desc: 'Read only your notebook notes. Preview tomorrow topic title. Prime your brain for sleep. Dim lights and no screens after this.', 
    tag: 'Review' 
  }
];

async function renderTimetable() {
  console.log(' [SCHEDULE] renderTimetable() triggered');
  const container = document.getElementById('timetableContainer');
  if (!container) {
    console.error('ERROR [SCHEDULE] timetableContainer NOT FOUND in DOM!');
    return;
  }
  
  console.log('WAIT [SCHEDULE] Population started...');
  container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--muted);">Loading daily schedule...</div>';

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Calculate Progress
  const startDay = 5 * 60; // 5 AM
  const endDay = 22.5 * 60; // 10:30 PM
  let progress = ((currentMinutes - startDay) / (endDay - startDay)) * 100;
  progress = Math.max(0, Math.min(100, Math.round(progress)));
  
  const progressBar = document.getElementById('dailyProgressBar');
  const progressText = document.getElementById('dailyProgressText');
  if (progressBar) progressBar.style.width = progress + '%';
  if (progressText) progressText.textContent = progress + '%';

  try {
    const data = await getStudyData();
    console.log(' [SCHEDULE] Data received:', data);
    const completedTasks = data.completedTasks || [];

    const html = `
      <div class="timetable-container">
        ${SCHEDULE_DATA.map((item, index) => {
          const [h, m] = item.time.split(':').map(Number);
          const [eh, em] = item.end.split(':').map(Number);
          const startMin = h * 60 + m;
          const endMin = eh * 60 + em;
          
          let status = 'upcoming';
          if (currentMinutes >= startMin && currentMinutes < endMin) status = 'active';
          else if (currentMinutes >= endMin) status = 'past';

          const isDone = completedTasks.includes(index);

          return `
            <div class="timetable-item ${status} ${isDone ? 'done' : ''}" style="${isDone ? 'opacity:0.5; border-color:var(--green);' : ''}">
              ${status === 'active' ? '<div class="current-indicator"><span style="width:5px; height:5px; background:white; border-radius:50%; display:inline-block; animation: blink 1s infinite;"></span> LIVE NOW</div>' : ''}
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span class="timetable-time">${item.time} - ${item.end}</span>
                <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleTask(${index})" style="width:18px; height:18px; cursor:pointer;">
              </div>
              <div class="timetable-title" style="${isDone ? 'text-decoration:line-through; color:var(--muted);' : ''}">${item.title}</div>
              <div class="timetable-desc">${item.desc}</div>
              <span class="timetable-tag">${item.tag}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.innerHTML = html;
    console.log(`✅ [SCHEDULE] Population COMPLETE. HTML Length: ${html.length}`);
  } catch (e) {
    console.error('ERROR [SCHEDULE] Failed to render:', e);
    container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--red);">Failed to load schedule. Ensure the agent server is running.</div>';
  }
}

function switchTrackerTab(tabId) {
  console.log(`%c  [TRACKER] Switching Tab: ${tabId}`, 'color: #3b82f6; font-weight: bold;');
  // Update Buttons
  document.querySelectorAll('.tracker-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
  });
  
  // Update Content
  document.querySelectorAll('.tracker-content').forEach(content => {
    content.style.display = 'none';
  });
  const target = document.getElementById(tabId);
  if (target) {
    console.log(` [TRACKER] Showing: #${tabId}`);
    target.style.display = 'block';
  }

  // Save preference
  setScopedItem('last_tracker_tab', tabId);
  
  if (tabId === 'tab_leaderboard') {
    fetchLeaderboard();
  }
}

async function fetchLeaderboard() {
  const container = document.getElementById('leaderboardList');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">Loading your study summary...</span>';
  
  try {
    const response = await apiFetch('/api/study/leaderboard');
    if (!response.ok) throw new Error('Unauthorized');
    const data = await response.json();
    
    if (!data.leaderboard || data.leaderboard.length === 0) {
      container.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">No scholars found yet. Be the first!</span>';
      return;
    }
    
    container.innerHTML = data.leaderboard.map((user, index) => {
      let medal = '';
      if (index === 0) medal = 'Gold';
      else if (index === 1) medal = 'Silver';
      else if (index === 2) medal = 'Bronze';
      else medal = `<span style="opacity:0.5;">#${index + 1}</span>`;
      
      const pic = user.picture ? `<img src="${user.picture}" style="width:32px; height:32px; border-radius:50%; border:2px solid var(--blue);">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--blue); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${user.name ? user.name.charAt(0) : '?'}</div>`;
      
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px 15px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; align-items:center; gap:15px;">
          <div style="font-size:1.2rem; min-width:30px; text-align:center;">${medal}</div>
          ${pic}
          <div style="font-weight:700; color:var(--text);">${user.name || 'Anonymous'}</div>
        </div>
        <div style="font-family:'IBM Plex Mono'; font-weight:700; color:var(--green);">${user.totalHours} hrs</div>
      </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<span style="color:var(--red); font-size:0.8rem;">Failed to load leaderboard.</span>';
    console.error(e);
  }
}

// --- DYNAMIC PAGE LOADING ENGINE (v1411 Modular) ---
async function ensurePageLoaded(pageId) {
    // List of pages that should be loaded dynamically
    const modularPages = [
        'job_radar', 'schedule', 'study_tracker', 'profile_match', 'study_history',
        'intro', 'speaking', 'comm', 'vocab', 'salary', 'mock',
        'behavioral', 'apex', 'soql', 'async', 'triggers', 'lwc', 'aura', 'integration', 'security',
        'domain', 'scenario', 'design', 'adv_apex', 'admin',
        'sc_objects', 'sc_recordpage', 'sc_flow', 'sc_arch', 'sc_async', 'sc_fileupload', 
        'sc_reports', 'sc_agentforce', 'sc_navmixin', 'sc_validation',
        'fde_ag_concept', 'fde_ag_scenario', 'fde_atlas', 'fde_trust',
        'fde_dc_concept', 'fde_dc_adv', 'fde_integration', 'fde_apex', 'fde_behavioral',
        'fde_cheat', 'ai_interview', 'topic_viewer', 'company_iq', 'company_interviews', 'mobigic_pwc', 'thenken_globus', 'sf_official', 'sf_onsite'
    ];

    if (!modularPages.includes(pageId)) {
        console.log(`INFO [LOADER] ${pageId} is a dynamic topic. Skipping modular load.`);
        return true;
    }

    if (pageId === 'job_radar') {
        await loadFeatureStylesheet(JOB_RADAR_CSS);
    }

    console.log(`%c 🔍 [LOADER] Checking if modular page is loaded: ${pageId}`, 'color: #a855f7; font-weight: bold;');
    const pageEl = document.getElementById(pageId);
    if (!pageEl) {
        console.error(`%c ERROR [LOADER] CRITICAL: Element not found in DOM for modular page: #${pageId}`, 'color: #ef4444; font-weight: bold;');
        return false;
    }
    
    // Audit current state
    const display = getComputedStyle(pageEl).display;
    const contentLen = pageEl.innerHTML.trim().length;
    
    console.log(`%c 📊 [LOADER] Page ${pageId} Status -> Display: ${display}, ContentLen: ${contentLen}`, 'color: #6366f1;');
    
    if (contentLen > 100) {
        console.log(`%c ✅ [LOADER] Page ${pageId} already has content. Skipping fetch.`, 'color: #10b981;');
        return true;
    }

    console.log(` [LOADER] Fetching modular page: /pages/${pageId}.html ...`);
    try {
        const response = await fetch(`/pages/${pageId}.html?v=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const html = await response.text();
        pageEl.innerHTML = html;
        console.log(`%c ✅ [LOADER] Page ${pageId} injected successfully.`, 'color: #10b981; font-weight: bold;');
        if (typeof refreshSearchIndex === 'function') refreshSearchIndex();
        
        return true;
    } catch (err) {
        console.error(`%c ❌ [LOADER] Failed to load page ${pageId}: ${err.message}`, 'color: #ef4444; font-weight: bold;');
        pageEl.innerHTML = `<div style="padding:2rem; color:var(--red); text-align:center;">
          <h3>Modular Load Failed</h3>
          <p>The page "${pageId}" could not be retrieved from the server. [Error: ${err.message}]</p>
          <button onclick="location.reload()" style="margin-top:1rem; padding:8px 16px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:8px; cursor:pointer;">Retry Dashboard</button>
        </div>`;
        return false;
    }
}


// Update showPage to include extreme telemetry
let isNavigating = false;
async function showPage(id) {
  if (isNavigating) return;
  isNavigating = true;
  console.log(`%c [TAB SWITCH] -> ${id}`, 'background: #3b82f6; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;');
  try {
  
  // Ensure the page content is loaded before showing
  await ensurePageLoaded(id);
  if (id === 'job_radar') {
    await loadFeatureStylesheet(JOB_RADAR_CSS);
  }

  setScopedItem('last_active_tab', id);
  await stopTracking();
  if (id !== 'job_radar') {
    closeLogPanel();
  }
  
  console.log(`🧹 [NAV] Hiding all .page elements...`);
  document.querySelectorAll('.page').forEach(function(p) { 
    p.classList.remove('active'); 
    p.style.display = 'none';
  });
  
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  
  let page = document.getElementById(id);
  let isIndustrial = false;
  if (DATA_DRIVEN_TOPIC_IDS.has(id)) {
    isIndustrial = await renderTopicContent(id);
    if (isIndustrial) {
      console.log(`🏰 [NAV] Data-driven topic rendered for: ${id}`);
      page = document.getElementById('topic_viewer');
    }
  }

  if (!page || id === 'topic_viewer') {
    isIndustrial = await renderTopicContent(id);
    if (isIndustrial) {
        console.log(`🏰 [NAV] Detected Industrial Content for: ${id}`);
        page = document.getElementById('topic_viewer');
    }
  }

  if (!page && topicConfig[id]) {
      console.log(`📚 [NAV] Routing to topic_viewer for: ${id}`);
      page = document.getElementById('topic_viewer');
  }

  if (page) { 
    if (topicConfig[id] && page.id === id && page.innerHTML.trim().length < 40) {
      const renderedTopic = await renderTopicContent(id);
      if (renderedTopic) {
        page = document.getElementById('topic_viewer');
      }
    }

    console.log(` [NAV] ENABLING PAGE: #${page.id}`);
    page.classList.add('active');
    page.style.display = '';

    
    const finalStyle = getComputedStyle(page);
    console.log(`📊 [NAV] #${page.id} COMPUTED STATE:
    - Display: ${finalStyle.display}
    - Visibility: ${finalStyle.visibility}
    - Height: ${finalStyle.height}
    - Opacity: ${finalStyle.opacity}`);
    
    // Init Logic
    if (id === 'schedule') {
        console.log(' [NAV] Rendering Timetable...');
        await renderTimetable(); 
    }
    if (id === 'study_history') {
        console.log('📜 [NAV] Rendering History...');
        await renderHistory();
    }
    if (id === 'study_tracker') {
        console.log('📈 [NAV] Initiating Study Tracker...');
        const lastTab = getScopedItem('last_tracker_tab', 'tab_suggestions', 'last_tracker_tab');
        switchTrackerTab(lastTab);
        await updateTrackerUI(); 
    }
    if (id === 'job_radar') {
        console.log('[NAV] Activating Job Radar Dashboard...');
        fetchJobsList();
        // Auto-refresh: poll every 5 minutes while tab is active
        if (window._jobRadarInterval) clearInterval(window._jobRadarInterval);
        window._jobRadarInterval = setInterval(() => {
          const radarPage = document.getElementById('job_radar');
          if (radarPage && radarPage.classList.contains('active')) {
            console.log('[RADAR] Auto-refresh triggered...');
            fetchJobsList();
          } else {
            clearInterval(window._jobRadarInterval);
            window._jobRadarInterval = null;
          }
        }, 5 * 60 * 1000);
    }
	    if (id === 'profile_match') { 
	        console.log('👤 [NAV] Analyzing Profile Match...');
	        const loadingEl = document.getElementById('profileMatchLoading');
	        if (cachedUserProfile) {
	          hydratePremiumSetupForm(cachedUserProfile);
	          renderProfileMatchPage(cachedUserProfile);
	          loadJobIntelligence();
	        } else {
	          if (loadingEl) loadingEl.style.display = 'block';
	          loadUserProfile().then(() => {
	            if (cachedUserProfile) {
	              hydratePremiumSetupForm(cachedUserProfile);
	              loadJobIntelligence();
	              return;
	            }
	            renderProfileMatchPage(readPremiumFormProfile());
	          }).catch(err => {
	            console.warn('[PROFILE] Rendering local profile preview:', err.message);
	            renderProfileMatchPage(readPremiumFormProfile());
	          }).finally(() => {
	            if (loadingEl) loadingEl.style.display = 'none';
	          });
	        }
	    }
	    if (id === 'interview_room') {
	        console.log('🎙️ [NAV] Hydrating Interview Room...');
	        hydrateInterviewRoom();
	    }
	    if (id === 'study_history') {
	        console.log('📜 [NAV] Hydrating History Filter...');
	        hydrateHistoryFilter();
	    }
	    if (id === 'salesforce_releases') {
	        console.log('[NAV] Loading Salesforce release intelligence...');
	        loadReleaseCenter(true).catch(e => {
	          console.warn('[RELEASES] Failed to load release center:', e.message);
	          const container = document.getElementById('releaseCenterContent');
	          if (container) container.innerHTML = '<div class="content-card">Release data is unavailable right now. The curated data files could not be loaded.</div>';
	        });
	    }
	    if (id === 'code_practice') {
	        console.log('[NAV] Loading Code Practice workspace...');
	        if (window.CodePractice && typeof window.CodePractice.mount === 'function') {
	          window.CodePractice.mount();
	        }
	    }
    if (id === 'bookmarks_page') {
        console.log('⭐ [NAV] Activating Bookmarks View...');
        if (typeof showBookmarks === 'function') showBookmarks();
    }
  }

  // UI Updates
  const headerTitle = document.getElementById('headerTitle');
  if (headerTitle) headerTitle.textContent = topicConfig[id] ? topicConfig[id].name : 'SF Prep Guide';
  trackRecentTopic(id);
  updateSidebarActiveState(id);
  const mainEl = document.getElementById('main');
  if (mainEl) mainEl.scrollTop = 0;
  
  // Mobile Sidebar Close (guard against double-toggle)
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('mobile-open')) toggleMobileSidebar(false);

  const cfg = topicConfig[id];
  if (cfg && !cfg.noTimer) startTracking(id);
  renderBookmarkButtons();

  } catch (err) {
    console.error('[NAV] showPage() error:', err);
  } finally {
    isNavigating = false;
  }
}
function toggleQA(el) { 
  const isOpen = el.parentElement.classList.toggle('open'); 
  if (isOpen && currentTrackedPage) {
    setScopedItem('last_q_' + currentTrackedPage, el.querySelector('.qa-q-text').textContent);
  }
}
function toggleStar(el) { el.parentElement.classList.toggle('open'); }

function refreshSearchIndex() {
  searchData = [];
  document.querySelectorAll('.page').forEach(function(page) {
    page.querySelectorAll('.qa-block').forEach(function(block) {
       var q = block.querySelector('.qa-q-text');
       if (q && q.textContent.trim()) {
          searchData.push({ 
            question: q.textContent.trim(), 
            answerEl: block, 
            pageId: page.id, 
            pageName: page.querySelector('.page-title') ? page.querySelector('.page-title').textContent : 'Topic' 
          });
       }
    });
  });
  console.log('🔍 [SEARCH] Index refreshed. Total items:', searchData.length);
}

// Initial index build
window.addEventListener('DOMContentLoaded', () => {
  ensureNavigationTopicConfig();
  refreshSearchIndex();
  renderRecentTopicsPanel();
  syncSidebarStickyOffset();
  window.addEventListener('resize', syncSidebarStickyOffset);
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.addEventListener('click', () => toggleMobileSidebar(false));
  
  // Initialize Page Visibility
  document.querySelectorAll('.page').forEach(function(p) {
    if (!p.classList.contains('active')) p.style.display = 'none';
  });
  
  const searchPage = document.getElementById('searchPage');
  if (searchPage) searchPage.style.display = 'none';
});

function filterSidebar(val) {
  const query = val.toLowerCase().trim();
  const items = document.querySelectorAll('#sidebar .nav-item');
  const sections = document.querySelectorAll('#sidebar .nav-parent-section');
  
  if (!query) {
    items.forEach(el => el.style.display = 'flex');
    sections.forEach(el => el.style.display = 'block');
    const recentPanel = document.querySelector('.nav-recent-panel');
    if (recentPanel) recentPanel.style.display = 'grid';
    return;
  }

  const recentPanel = document.querySelector('.nav-recent-panel');
  if (recentPanel) recentPanel.style.display = 'none';

  sections.forEach(section => {
    const navItems = section.querySelectorAll('.nav-item');
    let hasMatch = false;
    
    navItems.forEach(item => {
      const text = `${item.textContent} ${item.getAttribute('data-nav-search') || ''}`.toLowerCase();
      if (text.includes(query)) {
        item.style.display = 'flex';
        hasMatch = true;
      } else {
        item.style.display = 'none';
      }
    });

    if (hasMatch) {
      section.style.display = 'block';
      const panel = section.querySelector('.nav-group-items');
      const toggle = section.querySelector('.nav-group-toggle');
      if (panel) panel.hidden = false;
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    } else {
      section.style.display = 'none';
    }
  });

  // Handle revision alerts visibility
  const revAlerts = document.getElementById('revisionAlerts');
  if (revAlerts) {
    if (query) revAlerts.style.display = 'none';
    else revAlerts.style.display = 'block';
  }

  // Trigger Global Content Search if query > 2 chars
  if (query.length > 2) {
    searchContent(val);
  } else {
    const sp = document.getElementById('searchPage');
    if (sp && sp.classList.contains('active')) {
       // If we were in search results but cleared it, go back to last active tab
       const lastTab = getScopedItem('last_active_tab', 'schedule');
       showPage(lastTab);
    }
  }
}

function searchContent(val) {
  if (!val || val.length < 2) { document.getElementById('searchPage').style.display = 'none'; return; }
  var lower = val.toLowerCase();
  var contentResults = (window.SFJR_SALESFORCE_CONTENT?.getAllQuestions?.() || [])
    .filter(function(q) {
      return [
        q.question,
        q.shortAnswer,
        q.detailedAnswer,
        q.scenario,
        q.difficulty,
        q.sectionTitle,
        ...(q.tags || []),
        ...(q.relatedTopics || [])
      ].join(' ').toLowerCase().indexOf(lower) !== -1;
    })
    .slice(0, 24);
  var results = searchData.filter(function(d) { return d.question.toLowerCase().indexOf(lower) !== -1 || (d.answerEl.textContent||'').toLowerCase().indexOf(lower) !== -1; });
  var container = document.getElementById('searchResults');
  var sp = document.getElementById('searchPage');
  closeLogPanel();
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
  sp.style.display = 'block'; sp.classList.add('active');
  if (!results.length && !contentResults.length) { container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No interview content found for "'+escapeHtml(val)+'". Try Apex, Agentforce, Data Cloud, Integration, or FDE.</p>'; return; }
  const contentHtml = contentResults.map(function(q) {
    return `<div class="search-result-item rich-search-result">
      <div class="sr-q">${escapeHtml(q.question)}</div>
      <div class="sr-section">${escapeHtml(q.sectionTitle)} • ${escapeHtml(q.difficulty)} • ${(q.tags || []).slice(0, 3).map(escapeHtml).join(', ')}</div>
      <p>${escapeHtml(q.shortAnswer)}</p>
      <div class="search-actions">
        <button type="button" onclick="showPage('${escapeHtml(q.sectionId)}')">Open Q&A</button>
        <button type="button" onclick="markContentProgress('${escapeHtml(q.sectionId)}','revised')">Mark revised</button>
        <button type="button" onclick="markContentProgress('${escapeHtml(q.sectionId)}','mastered')">Mark mastered</button>
      </div>
    </div>`;
  }).join('');
  const pageHtml = results.map(function(r) {
    var idx = searchData.indexOf(r);
    return '<div class="search-result-item" onclick="goToResult(\''+r.pageId+'\','+idx+')"><div class="sr-q">'+r.question+'</div><div class="sr-section">'+r.pageName+'</div></div>';
  }).join('');
  container.innerHTML = contentHtml + pageHtml;
}

function goToResult(pageId, idx) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchPage').style.display = 'none';
  showPage(pageId);
  setTimeout(function() { 
    if (searchData[idx] && searchData[idx].answerEl) { 
      searchData[idx].answerEl.scrollIntoView({behavior:'smooth',block:'center'}); 
      searchData[idx].answerEl.classList.add('open'); 
      renderBookmarkButtons(); // Ensure bookmark star is visible (v1340)
    } 
  }, 200);
}

// cachedHistories declared at top with other globals

async function showHistoryModal(date, page = 0) {
  const h = cachedHistories[date];
  if (!h) {
    showToast('No data found for this date. Please click Sync Dashboard first.');
    return;
  }

  const modal = document.getElementById('historyModal');
  const dateEl = document.getElementById('modalDate');
  const body = document.getElementById('modalBody');
  
  dateEl.textContent = date;
  modal.classList.add('active');
  modal.style.display = 'flex';

  const sData = h.study || {};
  const b = sData.breakdown || sData.topicBreakdown || {};
  const topicList = sData.topicList || Object.keys(b).map(tid => ({
    id: tid,
    name: b[tid].name || tid,
    totalSeconds: b[tid].totalSeconds || 0
  }));

  const TOPIC_PAGE_SIZE = 10;
  const totalTopicPages = Math.ceil(topicList.length / TOPIC_PAGE_SIZE);
  const slicedTopics = topicList.slice(page * TOPIC_PAGE_SIZE, (page + 1) * TOPIC_PAGE_SIZE);

  let topicHtml = '';
  
  if (slicedTopics.length > 0) {
    slicedTopics.forEach(t => {
      const id = t.id;
      const name = t.name;
      const spent = t.totalSeconds || 0;
      const cfg = topicConfig[id] || { recommended: 60 };
      const target = cfg.recommended * 60;
      const pct = Math.min((spent / target) * 100, 100);

      topicHtml += `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:32px; height:32px; background:rgba(79,142,247,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--blue); font-size:1rem;">📚</div>
              <div>
                <div style="font-size:0.9rem; font-weight:700; color:var(--text);">${name}</div>
                <div style="font-size:0.7rem; color:var(--muted); font-family:'IBM Plex Mono';">SPENT: ${formatTime(spent)}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.85rem; font-weight:700; color:var(--blue);">${Math.round(pct)}%</div>
              <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">Goal: ${Math.round(target/60)}m</div>
            </div>
          </div>
          <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
            <div style="height:100%; width:${Math.max(pct, 2)}%; background:linear-gradient(90deg, var(--blue), #60a5fa);"></div>
          </div>
        </div>`;
    });

    // Pagination Controls for Topics
    if (totalTopicPages > 1) {
      topicHtml += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px; padding:10px 0;">
          <button onclick="showHistoryModal('${date}', ${page - 1})" ${page === 0 ? 'disabled' : ''} style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text); padding:5px 15px; border-radius:6px; cursor:pointer; opacity:${page === 0 ? '0.3' : '1'}; font-size:0.75rem;">← Prev</button>
          <span style="font-size:0.75rem; color:var(--muted);">Page ${page + 1} of ${totalTopicPages}</span>
          <button onclick="showHistoryModal('${date}', ${page + 1})" ${page >= totalTopicPages - 1 ? 'disabled' : ''} style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text); padding:5px 15px; border-radius:6px; cursor:pointer; opacity:${page >= totalTopicPages - 1 ? '0.3' : '1'}; font-size:0.75rem;">Next →</button>
        </div>
      `;
    }
  } else {
    topicHtml = `<div style="text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed var(--border);">
      <div style="font-size:1.1rem; font-weight:700; color:var(--text); margin-bottom:5px;">Study Session</div>
      <div style="font-size:0.8rem; color:var(--muted);">No specific topics were logged for this date.</div>
    </div>`;
  }
  
  const jobsHtml = h.jobs && h.jobs.topMatches && h.jobs.topMatches.length > 0 ? 
    h.jobs.topMatches.map(j => `<div style="padding:10px; background:rgba(255,255,255,0.02); border-radius:8px; margin-bottom:8px; font-size:0.8rem; border-left:3px solid var(--green);"><b>${j.title}</b> at ${j.company}</div>`).join('') :
    '<div style="color:var(--muted); font-size:0.8rem;">No high-score matches found in this period.</div>';

  body.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:2rem;">
      <div style="background:rgba(79,142,247,0.1); padding:1rem; border-radius:12px; text-align:center;">
        <div style="font-size:0.65rem; color:var(--blue); text-transform:uppercase; margin-bottom:5px;">Total Duration</div>
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime(h.study.totalSeconds)}</div>
      </div>
      <div style="background:rgba(61,214,140,0.1); padding:1rem; border-radius:12px; text-align:center;">
        <div style="font-size:0.65rem; color:var(--green); text-transform:uppercase; margin-bottom:5px;">Radar Hits</div>
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">+${h.jobs ? h.jobs.newCount : 0}</div>
      </div>
    </div>

    <h4 style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:1.2rem;">Detailed Subject Breakdown</h4>
    ${topicHtml}

    <h4 style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin:2rem 0 1rem;">Radar Insights (Top Matches)</h4>
    ${jobsHtml}
  `;

  modal.style.display = 'flex';
}

function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

// BROADCAST HANDSHAKE: Auto-refresh dashboard when sync tab closes
window.addEventListener('storage', (e) => {
  if (e.key === 'profile_sync_success') {
    console.log('🔄 Profile sync detected from external tab. Refreshing...');
    syncDashboard();
  }
});

function openSyncModal() {
  const modal = document.getElementById('syncModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => modal.querySelector('button, [tabindex], input')?.focus(), 0);
  }
  if (cachedUserProfile) updateSyncModalUI(cachedUserProfile);
}

function updateSyncModalUI(profile) {
  const p = profile.platforms || {};
  const liCard = document.getElementById('modalSyncLinkedIn');
  const nkCard = document.getElementById('modalSyncNaukri');

  if (p.linkedin && p.linkedin.synced) {
      document.getElementById('liSyncLabel').textContent = 'Synced — click to refresh';
      document.getElementById('liSyncStatus').innerHTML = '<span style="color:#10b981;">✓ Linked</span>';
      if (liCard) {
        liCard.style.borderColor = '#10b981';
        liCard.style.background = 'rgba(16,185,129,0.05)';
        // v1412 fix: Allow re-syncing (removed pointerEvents:none)
        liCard.style.pointerEvents = 'auto';
        liCard.style.opacity = '0.95';
      }
  } else {
      document.getElementById('liSyncLabel').textContent = 'Not Linked';
      document.getElementById('liSyncStatus').textContent = 'Sync Now →';
      if (liCard) {
        liCard.style.borderColor = 'rgba(0,119,181,0.2)';
        liCard.style.background = 'rgba(0,119,181,0.05)';
        liCard.style.pointerEvents = 'auto';
        liCard.style.opacity = '1';
      }
  }

  if (p.naukri && p.naukri.synced) {
      document.getElementById('nkSyncLabel').textContent = 'Synced — click to refresh';
      document.getElementById('nkSyncStatus').innerHTML = '<span style="color:#10b981;">✓ Linked</span>';
      if (nkCard) {
        nkCard.style.borderColor = '#10b981';
        nkCard.style.background = 'rgba(16,185,129,0.05)';
        // v1412 fix: Allow re-syncing (removed pointerEvents:none)
        nkCard.style.pointerEvents = 'auto';
        nkCard.style.opacity = '0.95';
      }
  } else {
      document.getElementById('nkSyncLabel').textContent = 'Not Linked';
      document.getElementById('nkSyncStatus').textContent = 'Sync Now →';
      if (nkCard) {
        nkCard.style.borderColor = 'rgba(255,117,85,0.2)';
        nkCard.style.background = 'rgba(255,117,85,0.05)';
        nkCard.style.pointerEvents = 'auto';
        nkCard.style.opacity = '1';
      }
  }
}

function closeSyncModal() {
  const modal = document.getElementById('syncModal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function updateSidebarProfileStatus(profile) {
  const platforms = profile.platforms || {};
  const linkedPlatforms = ['linkedin', 'naukri'].filter(key => platforms[key]?.synced);
  const count = linkedPlatforms.length;
  const countEl = document.getElementById('syncPlatformCount');
  const statusEl = document.getElementById('sidebarSyncStatus');
  
  if (countEl) countEl.textContent = count ? `${count} private import${count === 1 ? '' : 's'}` : 'Private';
  
  if (statusEl) {
    if (count === 0) {
        statusEl.innerHTML = '<div style="font-size:0.72rem; color:var(--muted); font-style:italic; text-align:center; padding:10px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed rgba(255,255,255,0.1);">Profile imports are private to your signed-in account.</div>';
    } else {
        let badges = '';
        if (platforms.linkedin && platforms.linkedin.synced) {
            badges += '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(0,119,181,0.08); border:1px solid rgba(0,119,181,0.2); border-radius:10px; font-size:0.72rem; color:#60a5fa;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg> LinkedIn Linked</div>';
        }
        if (platforms.naukri && platforms.naukri.synced) {
            badges += '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(255,117,85,0.08); border:1px solid rgba(255,117,85,0.2); border-radius:10px; font-size:0.72rem; color:#fb923c;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 9H8v-1h4v1zm6-3H8v-1h10v1zm0-3H8V8h10v1z"/></svg> Naukri Linked</div>';
        }
        statusEl.innerHTML = badges;
    }
  }
}

// Lifecycle
window.addEventListener('beforeunload', function() { stopTracking(); });
document.addEventListener('visibilitychange', function() {
  if (document.hidden && currentTrackedPage && !isPaused) {
    // Auto-pause when tab is hidden
    togglePause();
  }
});

// Boot
(async () => {
  applyUiMode(currentUiMode);
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  const lastTab = getScopedItem('last_active_tab', 'schedule', 'last_active_tab');
  showPage(lastTab);
  
  // Full dashboard sync on page reload — ensures timetable, daily summary,
  // jobs, history, and profile are all loaded (same as fresh login flow)
  try {
    await syncDashboard();
  } catch(e) { console.warn('Background dashboard sync partially failed', e); }

  // Re-render user profile with latest data from cloud (streak, avatar, etc.)
  if (currentUser) renderUserProfile(currentUser);
})();

/**
 * 🛰️ INTERACTION HANDLERS (v1412)
 * ------------------------------
 * These functions bridge the UI with the modular page logic.
 */

window.scrollToCol = function(colId) {
  console.log(`[NAV] Scrolling to column: ${colId}`);
  const list = document.getElementById(`list-${colId}`);
  if (!list) return;
  
  const column = list.closest('.kanban-col-v3') || list.parentElement;
  if (column) {
    column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    
    // Industrial Highlight Effect
    column.classList.add('column-focus-pulse');
    setTimeout(() => column.classList.remove('column-focus-pulse'), 1500);
  }
};

window.switchRadarSubTab = function(tabId) {
  console.log(`[TAB] Radar Sub-Tab -> ${tabId}`);

  const modernView = document.getElementById(`radar-${tabId}-view`);
  if (modernView || document.querySelector('#job_radar .radar-tab-btn')) {
    window.currentRadarSubTab = tabId;
    document.querySelectorAll('#job_radar .radar-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('active');

    document.querySelectorAll('#job_radar .radar-view').forEach(view => {
      view.style.display = 'none';
    });
    if (modernView) modernView.style.display = 'block';

    if (tabId === 'pipeline') renderBoard();
    if (tabId === 'insights') {
      renderInsights();
      renderLog();
    }
    if (tabId === 'development' || tabId === 'agentforce') renderDevelopment();
    return;
  }

  document.querySelectorAll('.radar-sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.radar-sub-page').forEach(p => p.classList.remove('active'));
  
  const btn = document.querySelector(`[onclick="switchRadarSubTab('${tabId}')"]`);
  const page = document.getElementById(tabId);
  
  if (btn) btn.classList.add('active');
  if (page) page.classList.add('active');
  
  if (tabId === 'tab-board') renderBoard();
  if (tabId === 'tab-insights') renderInsights();
  if (tabId === 'tab-dev') renderDevelopment();
};
// AI INTERVIEW SYSTEM
let interviewMessages = [];

function hydrateInterviewRoom() {
  const topicEl = document.getElementById('interviewTopic');
  const diffEl = document.getElementById('interviewDifficulty');
  if (topicEl) topicEl.value = getScopedItem('last_interview_topic', 'Apex & Technical');
  if (diffEl) diffEl.value = getScopedItem('last_interview_difficulty', 'Senior');
}

async function startAIInterview() {
  const topic = document.getElementById('interviewTopic').value;
  const difficulty = document.getElementById('interviewDifficulty').value;
  
  // Persist selections so they don't reset on tab switch
  setScopedItem('last_interview_topic', topic);
  setScopedItem('last_interview_difficulty', difficulty);
  
  const chatContainer = document.getElementById('interviewChat');
  chatContainer.innerHTML = '';
  document.getElementById('interviewInputArea').style.display = 'block';
  document.getElementById('interviewSetup').style.opacity = '0.5';
  document.getElementById('interviewSetup').style.pointerEvents = 'none';

  addChatMessage('ai', `Hello! I am your AI Interviewer. We will be discussing ${topic} at a ${difficulty} level today. Let's begin. <br><br><b>First Question:</b> Can you tell me about your experience with ${topic} and how you handle complex requirements in this area?`);
}

async function submitAnswer() {
  const input = document.getElementById('userAnswerInput');
  const answer = input.value.trim();
  if (!answer) return;

  addChatMessage('user', answer);
  input.value = '';
  
  const statusEl = document.getElementById('aiThinkingStatus');
  statusEl.style.display = 'inline';

  try {
    const topic = document.getElementById('interviewTopic').value;
    const difficulty = document.getElementById('interviewDifficulty').value;
    
    const systemPrompt = `You are a Senior Salesforce Technical Interviewer. 
Topic: ${topic}. Difficulty: ${difficulty}.
Conduct a realistic interview. Ask one technical question at a time. 
When the user answers, provide brief feedback (Score 1-10) and then ask the next follow-up question.
Be professional and challenging. 
User Input: ${answer}`;

    const responseText = await callAi('interview', { topic, difficulty, answer, prompt: systemPrompt });
    statusEl.style.display = 'none';
    addChatMessage('ai', responseText);
    
  } catch (e) {
    statusEl.style.display = 'none';
    addChatMessage('ai', 'AI interview feedback is unavailable right now. Please try again after the server connection recovers.');
    console.error('AI Interview Error:', e);
  }
}

function addChatMessage(role, text) {
  const container = document.getElementById('interviewChat');
  const msg = document.createElement('div');
  msg.style.padding = '1rem';
  msg.style.borderRadius = '12px';
  msg.style.maxWidth = '85%';
  msg.style.lineHeight = '1.6';
  
  if (role === 'ai') {
    msg.style.alignSelf = 'flex-start';
    msg.style.background = 'rgba(79,142,247,0.1)';
    msg.style.borderLeft = '4px solid var(--blue)';
    msg.style.color = 'var(--text)';
  } else {
    msg.style.alignSelf = 'flex-end';
    msg.style.background = 'var(--blue)';
    msg.style.color = 'white';
  }
  
  msg.innerHTML = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  
  if (role === 'ai') {
    speakText(text);
  }
}

let speechRec = null;
let isRecording = false;

function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Voice recognition is not supported in this browser. Please use Chrome or Edge.");
    return;
  }

  const micBtn = document.getElementById('micBtn');
  const input = document.getElementById('userAnswerInput');

  if (isRecording) {
    if (speechRec) speechRec.stop();
    return;
  }

  speechRec = new SpeechRecognition();
  speechRec.continuous = true;
  speechRec.interimResults = true;
  speechRec.lang = 'en-US';

  speechRec.onstart = function() {
    isRecording = true;
    if (micBtn) {
      micBtn.style.background = 'var(--red)';
      micBtn.style.color = 'white';
      micBtn.style.boxShadow = '0 0 15px rgba(255, 59, 48, 0.5)';
      micBtn.textContent = 'Stop';
    }
    if (input) input.placeholder = "Listening... Speak your answer now.";
  };

  speechRec.onresult = function(event) {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript) {
      input.value += (input.value ? ' ' : '') + finalTranscript;
    }
  };

  speechRec.onerror = function(e) {
    console.error('Speech recognition error', e);
    stopRecordingUI();
  };

  speechRec.onend = function() {
    stopRecordingUI();
  };

  speechRec.start();
}

function stopRecordingUI() {
  isRecording = false;
  const micBtn = document.getElementById('micBtn');
  const input = document.getElementById('userAnswerInput');
  if (micBtn) {
    micBtn.style.background = 'var(--card)';
    micBtn.style.color = 'var(--text)';
    micBtn.style.boxShadow = 'none';
    micBtn.textContent = 'Mic';
  }
  if (input) {
    input.placeholder = "Type or speak your answer here...";
  }
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop current speech if any
  
  // Strip HTML and Markdown for cleaner speech
  const cleanText = text.replace(/<[^>]*>?/gm, '').replace(/\*/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  // Try to pick a professional voice
  const voices = window.speechSynthesis.getVoices();
  const proVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
  if (proVoice) utterance.voice = proVoice;
  
  utterance.rate = 1.05;
  utterance.pitch = 0.95;
  window.speechSynthesis.speak(utterance);
}

// Support Ctrl+Enter to submit
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'userAnswerInput') {
    submitAnswer();
  }
  if (e.key === 'Escape') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) toggleMobileSidebar(false);
    closeLogPanel();
    const syncModal = document.getElementById('syncModal');
    if (syncModal && syncModal.style.display !== 'none' && typeof closeSyncModal === 'function') closeSyncModal();
  }
});

// =============================================
// STUDY STREAKS ENGINE (v1340)
// =============================================
function updateStudyStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (studyStreak.lastDate === today) return; // Already updated today
  
  if (studyStreak.lastDate === yesterday) {
    studyStreak.current += 1;
  } else if (studyStreak.lastDate !== today) {
    studyStreak.current = 1; // Reset streak
  }
  
  if (studyStreak.current > studyStreak.best) {
    studyStreak.best = studyStreak.current;
  }
  
  studyStreak.lastDate = today;
  renderStreakBadge();
  
  // Cloud Sync (v1356 - Pure MongoDB)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/save', {
      method: 'POST',
      body: JSON.stringify({ studyStreak })
    }).catch(e => console.error('Streak cloud sync failed', e));
  }
}

function renderStreakBadge() {
  const sidebarBadge = document.getElementById('streakBadge');
  const floatBadge = document.getElementById('floatStreakBadge');
  const floatVal = document.getElementById('floatStreakVal');
  
  const current = studyStreak.current || 0;
  const flameSvg = `<svg viewBox="0 0 24 24" fill="var(--orange)" stroke="var(--orange)" stroke-width="2" style="width:14px;height:14px; vertical-align:middle; filter:drop-shadow(0 0 5px rgba(249,115,22,0.4));"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
  
  // Update Sidebar
  if (sidebarBadge) {
    sidebarBadge.innerHTML = `<span>${flameSvg}</span> ${current} day${current !== 1 ? 's' : ''}`;
    sidebarBadge.style.display = current > 0 ? 'inline-flex' : 'none';
  }
  
  // Update Header Pill
  if (floatBadge) {
    floatBadge.style.display = current > 0 ? 'flex' : 'none';
    if (floatVal) floatVal.textContent = current;
  }
}

// Hook into stopTracking to update streaks and retention (v1354)
const _originalStopTracking = stopTracking;
stopTracking = async function() {
  const tid = currentTrackedPage;
  const startTime = trackingStartTime;
  const pausedTime = pausedElapsed;
  
  await _originalStopTracking();
  updateStudyStreak();
  
  // Calculate spent time for feedback logic
  if (startTime) {
    const spentSeconds = Math.floor((Date.now() - startTime - pausedTime) / 1000);
    const stats = userRetention[tid];
    const isDue = !stats || new Date(stats.nextReview) <= new Date();
    
    // ONLY ask for feedback if topic is due AND studied > 30s AND not already asked in this session (v1354)
    if (topicConfig[tid] && !topicConfig[tid].noTimer && isDue && spentSeconds > 30 && !sessionFeedbackProvided.has(tid)) {
      currentRetentionTopicId = tid;
      const confidenceModal = document.getElementById('confidenceModal');
      if (confidenceModal) {
        confidenceModal.style.display = 'flex';
        confidenceModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => confidenceModal.querySelector('button')?.focus(), 0);
      }
    }
  }
};

// =============================================
// BOOKMARK SYSTEM (v1340)
// =============================================
function toggleBookmark(questionText, topicId) {
  const idx = userBookmarks.findIndex(b => b.q === questionText);
  if (idx >= 0) {
    userBookmarks.splice(idx, 1);
  } else {
    userBookmarks.push({ q: questionText, topic: topicId, date: new Date().toISOString() });
  }
  writeScopedJson('bookmarks', userBookmarks);
  renderBookmarkButtons();
  
  // Update bookmark count in sidebar
  const countEl = document.getElementById('bookmarkCount');
  if (countEl) countEl.textContent = userBookmarks.length;

  // Cloud Sync (v1340)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/toggle-bookmark', {
      method: 'POST',
      body: JSON.stringify({ q: questionText, topic: topicId })
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        userBookmarks = data.bookmarks;
        writeScopedJson('bookmarks', userBookmarks);
        renderBookmarkButtons();
        if (countEl) countEl.textContent = userBookmarks.length;
      }
    }).catch(e => console.error('Bookmark cloud sync failed', e));
  }
}

function isBookmarked(questionText) {
  return userBookmarks.some(b => b.q === questionText);
}

function renderBookmarkButtons() {
  document.querySelectorAll('.qa-question').forEach(qEl => {
    const qText = qEl.querySelector('.qa-q-text')?.textContent;
    if (!qText) return;
    
    let btn = qEl.querySelector('.bookmark-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.className = 'bookmark-btn';
      btn.style.cssText = 'cursor:pointer; display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; flex-shrink:0; margin-left:4px; transition:all 0.2s;';
      btn.onclick = function(e) {
        e.stopPropagation();
        const page = qEl.closest('.page');
        const topicId = page ? page.id : 'unknown';
        toggleBookmark(qText, topicId);
      };
      qEl.insertBefore(btn, qEl.querySelector('.qa-chevron'));
    }
    
    const active = isBookmarked(qText);
    btn.innerHTML = active ? 
      `<svg viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="2" style="width:14px;height:14px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` :
      `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="width:14px;height:14px;opacity:0.5;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    
    btn.style.background = active ? 'rgba(244,197,66,0.1)' : 'transparent';
    btn.title = active ? 'Remove bookmark' : 'Bookmark this question';
  });
}

function showBookmarks() {
  console.log('📖 [UI] Rendering Bookmarks Page. Current Count:', userBookmarks.length);
  const page = document.getElementById('bookmarks_page');
  if (!page || !page.classList.contains('active')) showPage('bookmarks_page');
  const container = document.getElementById('bookmarksContent');
  if (!container) {
    console.error('❌ [UI] #bookmarksContent element missing!');
    return;
  }

  // If we haven't loaded profile yet, show loading state
  if (!cachedUserProfile && userBookmarks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--muted);">
        <div class="spin" style="width:32px; height:32px; border:2px solid var(--blue); border-top-color:transparent; border-radius:50%; margin:0 auto 16px;"></div>
        <div>Loading your cloud bookmarks...</div>
      </div>`;
    return;
  }
  
  if (userBookmarks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <div style="width:64px; height:64px; margin:0 auto 20px; opacity:0.1; color:var(--text);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <div style="font-weight:700; color:var(--text); margin-bottom:8px;">No Bookmarks Yet</div>
        <p style="font-size:0.82rem; color:var(--muted); max-width:400px; margin:0 auto;">Click the star icon on any question to bookmark it for quick revision. Your bookmarks are saved in the cloud.</p>
      </div>`;
    return;
  }
  
  const maxPage = Math.max(0, Math.ceil(userBookmarks.length / BOOKMARK_PAGE_SIZE) - 1);
  bookmarksPage = Math.min(bookmarksPage, maxPage);
  const start = bookmarksPage * BOOKMARK_PAGE_SIZE;
  const pageItems = userBookmarks.slice(start, start + BOOKMARK_PAGE_SIZE);

  let html = `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px;">
    <div style="font-size:0.75rem; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:1px;">${userBookmarks.length} SAVED QUESTIONS</div>
    <div style="font-size:0.68rem; color:var(--muted); font-family:'IBM Plex Mono',monospace;">Showing ${start + 1}-${Math.min(start + BOOKMARK_PAGE_SIZE, userBookmarks.length)}</div>
  </div>`;
  pageItems.forEach((b, i) => {
    const topicName = topicConfig[b.topic] ? topicConfig[b.topic].name : b.topic;
    html += `
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:12px; display:flex; align-items:flex-start; gap:16px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden;" onclick="showPage('${b.topic}')" onmouseenter="this.style.borderColor='var(--blue)'; this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.borderColor='var(--border)'; this.style.background='rgba(255,255,255,0.02)'">
        <div style="color:var(--amber); flex-shrink:0; margin-top:2px;">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:0.95rem; color:var(--text); line-height:1.5; margin-bottom:6px;">${escapeHtml(b.q)}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.65rem; background:rgba(79,142,247,0.1); color:var(--blue); padding:3px 10px; border-radius:10px; font-weight:700; text-transform:uppercase;">${escapeHtml(topicName)}</span>
            <span style="font-size:0.65rem; color:var(--muted); font-family:'IBM Plex Mono',monospace;">Saved: ${new Date(b.date).toLocaleDateString()}</span>
          </div>
        </div>
        <button onclick="event.stopPropagation(); toggleBookmark(decodeURIComponent('${encodeInlineArg(b.q)}'), decodeURIComponent('${encodeInlineArg(b.topic)}')); showBookmarks();" style="cursor:pointer; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:6px; color:#ef4444; display:flex; align-items:center; justify-content:center; transition:0.2s;" onmouseenter="this.style.background='var(--red)'; this.style.color='white'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>`;
  });
  html += renderPager(userBookmarks.length, bookmarksPage, BOOKMARK_PAGE_SIZE, 'setBookmarksPage(-1)', 'setBookmarksPage(1)');
  container.innerHTML = html;
}

function setBookmarksPage(delta) {
  bookmarksPage = Math.max(0, bookmarksPage + delta);
  showBookmarks();
}

// =============================================
// MOBILE SIDEBAR TOGGLE (v1340)
// =============================================
function syncSidebarStickyOffset() {
  const sidebar = document.getElementById('sidebar');
  const header = sidebar?.querySelector('.sidebar-header');
  if (!sidebar || !header) return;
  const headerHeight = Math.ceil(header.getBoundingClientRect().height);
  if (headerHeight > 0) {
    sidebar.style.setProperty('--sidebar-sticky-header-h', `${headerHeight}px`);
  }
}

function toggleMobileSidebar(forceOpen) {
  syncSidebarStickyOffset();
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('mobileToggle');
  if (!sidebar) return;
  
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !sidebar.classList.contains('mobile-open');
  const syncA11y = open => {
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    }
    if (overlay) overlay.setAttribute('aria-hidden', String(!open));
    sidebar.setAttribute('aria-hidden', String(!open && window.innerWidth <= 900));
  };

  if (!shouldOpen) {
    sidebar.classList.remove('mobile-open');
    syncA11y(false);
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }
    document.body.style.overflow = '';
    if (lastSidebarTrigger && typeof lastSidebarTrigger.focus === 'function') {
      lastSidebarTrigger.focus();
      lastSidebarTrigger = null;
    }
  } else {
    lastSidebarTrigger = document.activeElement;
    sidebar.classList.add('mobile-open');
    syncA11y(true);
    if (overlay) {
      overlay.style.display = 'block';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    }
    document.body.style.overflow = 'hidden';
    const focusTarget = sidebar.querySelector('#sidebarCloseBtn, #searchInput, .nav-item, button');
    setTimeout(() => focusTarget?.focus(), 0);
  }
}

// =============================================
// RETENTION INTELLIGENCE (v1342)
// =============================================
async function saveRetention(q) {
  const topicId = currentRetentionTopicId;
  if (!topicId) return;
  
  const confidenceModal = document.getElementById('confidenceModal');
  if (confidenceModal) {
    confidenceModal.style.display = 'none';
    confidenceModal.setAttribute('aria-hidden', 'true');
  }
  sessionFeedbackProvided.add(topicId);
  
  // SM-2 Algorithm (Simplified for Industrial Study)
  let stats = userRetention[topicId] || { interval: 0, easeFactor: 2.5 };
  
  if (q >= 3) {
    if (stats.interval === 0) stats.interval = 1;
    else if (stats.interval === 1) stats.interval = 6;
    else stats.interval = Math.round(stats.interval * stats.easeFactor);
    
    stats.easeFactor = stats.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (stats.easeFactor < 1.3) stats.easeFactor = 1.3;
  } else {
    stats.interval = 1;
    stats.easeFactor = 2.5;
  }
  
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + stats.interval);
  
  stats.confidence = q;
  stats.nextReview = nextReview.toISOString();
  
  userRetention[topicId] = stats;
  // Cloud Sync (v1356 - Pure MongoDB)
  if (GSI_TOKEN) {
    apiFetch('/api/profile/save-retention', {
      method: 'POST',
      body: JSON.stringify({ topicId, stats })
    }).catch(e => console.error('Retention cloud sync failed', e));
  }
  
  console.log(`👤 Spaced Repetition: Topic [${topicId}] scheduled for ${stats.interval} days.`);
  renderRevisionAlerts();
}

/* UI templates moved to components.js */

// =============================================
// JOB RADAR PHASE 2-5 FUNCTIONS (v1399)
// =============================================
function savePipeline() {
  writeScopedJson('pipelineJobs', pipelineJobs);
  updateAnalytics();
  checkOfferComparison();
  if (currentRadarSubTab === 'insights') renderInsights();
}

function logActivity(text, type = 'info') {
  const entry = {
    id: 'log_' + Date.now(),
    text,
    type,
    timestamp: new Date().toISOString()
  };
  activityLog.unshift(entry);
  if (activityLog.length > 100) activityLog.pop();
  writeScopedJson('activityLog', activityLog);
  renderLog();
}

/* UI templates moved to components.js */

function setLogPage(delta) {
  activityLogPage = Math.max(0, activityLogPage + delta);
  renderLog();
}

function isJobRadarActive() {
  const radarPage = document.getElementById('job_radar');
  return Boolean(radarPage && radarPage.classList.contains('active'));
}

function openLogPanel() {
  const panel = document.getElementById('logPanel');
  if (!panel) return;
  if (!isJobRadarActive()) {
    closeLogPanel();
    showToast('Activity Log is available inside Job Radar Dashboard.');
    return;
  }
  renderLog();
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => panel.classList.add('open'));
  const closeButton = panel.querySelector('.close-panel-btn');
  if (closeButton) closeButton.focus({ preventScroll: true });
}

function closeLogPanel() {
  const panel = document.getElementById('logPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  panel.hidden = true;
}

function toggleLog() {
  const panel = document.getElementById('logPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) {
    closeLogPanel();
  } else {
    openLogPanel();
  }
}

/* UI templates moved to components.js */

function renderDevelopment() {
  const container = document.getElementById('radar-development-view');
  if (!container) return;
  container.innerHTML = renderDevelopmentUI();
  if (typeof renderVercelHealthPanel === 'function') renderVercelHealthPanel();
}

// Phase 3D: Interview Coach Logic
let selectedJobForCoach = null;
function openCoach(jobId) {
  selectedJobForCoach = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForCoach) {
    showToast('That card is no longer available in the pipeline.');
    return;
  }
  document.getElementById('coachModal').style.display = 'flex';
  const chat = document.getElementById('coachChat');
  const firstName = getCurrentUserName('there').split(' ')[0] || 'there';
  chat.innerHTML = `<div style="background: var(--blue); color: white; padding: 12px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.85rem;">
    Hello ${escapeHtml(firstName)}! Ready for your interview with <strong>${escapeHtml(selectedJobForCoach.company)}</strong> for the <strong>${escapeHtml(selectedJobForCoach.role || selectedJobForCoach.title || 'Salesforce role')}</strong> position? Let's start with: "Tell me about your experience with Data Cloud and how you've handled identity resolution."
  </div>`;
}

async function sendToCoach() {
  const input = document.getElementById('coachInput');
  const text = input.value.trim();
  if (!text) return;
  
  const chat = document.getElementById('coachChat');
  chat.innerHTML += `<div style="align-self: flex-end; background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 12px; border-radius: 12px 12px 0 12px; max-width: 85%; font-size: 0.85rem; color: var(--text);">${text}</div>`;
  input.value = '';
  chat.scrollTop = chat.scrollHeight;

  try {
    const responseText = await callAi('coach', { message: text, job: selectedJobForCoach });
    chat.innerHTML += `<div style="background: var(--blue); color: white; padding: 12px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.85rem;">
      ${responseText.replace(/\n/g, '<br>')}
    </div>`;
    chat.scrollTop = chat.scrollHeight;
  } catch (e) {
    chat.innerHTML += `<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: var(--red); padding: 12px; border-radius: 12px; max-width: 85%; font-size: 0.85rem;">
      AI coach is unavailable right now. Please try again shortly.
    </div>`;
    chat.scrollTop = chat.scrollHeight;
  }
}

// Phase 3F: Outreach Tracker
let selectedJobForOutreach = null;
function openOutreach(jobId) {
  selectedJobForOutreach = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForOutreach) {
    showToast('Open outreach from a valid card.');
    return;
  }
  document.getElementById('out-name').value = selectedJobForOutreach.outreach?.name || '';
  document.getElementById('out-status').value = selectedJobForOutreach.outreach?.status || 'sent';
  document.getElementById('outreachModal').style.display = 'flex';
}

function saveOutreach() {
  if (!selectedJobForOutreach) return;
  selectedJobForOutreach.outreach = {
    name: document.getElementById('out-name').value,
    status: document.getElementById('out-status').value,
    date: new Date().toISOString()
  };
  savePipeline();
  renderBoard();
  closeModal('outreachModal');
  showToast('Outreach recorded for ' + selectedJobForOutreach.company);
  logActivity(`Log outreach to <strong>${selectedJobForOutreach.outreach.name}</strong> (${selectedJobForOutreach.company})`, 'info');
}

// Phase 2H: Browser Notification System
async function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("This browser does not support notifications");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    showToast("Reminders enabled.");
    scheduleReminders();
  }
}

let reminderInterval = null;
function scheduleReminders() {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(() => {
    pipelineJobs.forEach(j => {
      if (j.status === 'applied') {
        const status = getFollowUpStatus(j);
        if (status && (status.class === 'warn' || status.class === 'urgent')) {
          new Notification(`Action Needed: ${j.company}`, {
            body: `Follow-up due for ${j.role}.`,
            icon: 'https://cdn-icons-png.flaticon.com/512/561/561127.png'
          });
        }
      }
    });
  }, 3600000 * 4); // Every 4 hours
}

// Phase 3 Stubs
async function openAIAssistant(jobId) {
  const job = pipelineJobs.find(j => j.id === jobId);
  showToast(`Analyzing JD for ${job.company}...`);
  setTimeout(() => {
     alert(`AI Suggestions for ${job.company}:\n1. Highlight your ${job.score > 90 ? 'PD2 Certification' : 'LWC experience'}.\n2. Emphasize Mortgage domain expertise.\n3. Mention Agentforce Specialist role.`);
  }, 1000);
}

let selectedJobForEmail = null;
let currentEmailType = 'followup';

function openEmailModal(jobId) {
  selectedJobForEmail = pipelineJobs.find(j => j.id === jobId);
  if (!selectedJobForEmail) {
    showToast('Open email generation from a valid card.');
    return;
  }
  document.getElementById('emailModal').style.display = 'flex';
  const subject = document.getElementById('emailSubject');
  if (subject) {
    subject.style.display = 'none';
    subject.textContent = '';
  }
  document.getElementById('emailBody').textContent = `Ready to compose for ${selectedJobForEmail.company}...`;
}

function selectEmailType(type, btn) {
  currentEmailType = type;
  document.querySelectorAll('.email-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function triggerEmailGeneration() {
  if (!selectedJobForEmail) return;
  const loading = document.getElementById('emailLoading');
  const body = document.getElementById('emailBody');
  const subject = document.getElementById('emailSubject');
  loading.style.display = 'flex';
  
  try {
    const role = selectedJobForEmail.role || selectedJobForEmail.title || 'Salesforce Developer';
    const prompt = `Write a professional ${currentEmailType} email for a Salesforce role at ${selectedJobForEmail.company}. Role: ${role}. Candidate: ${getCurrentUserName('Candidate')}.`;
    const responseText = await callAi('email', {
      emailType: currentEmailType,
      job: { ...selectedJobForEmail, role },
      prompt
    });
    const subjectMatch = responseText.match(/^Subject:\s*(.+)$/im);
    if (subjectMatch && subject) {
      subject.textContent = subjectMatch[1].trim();
      subject.style.display = 'block';
      body.textContent = responseText.replace(/^Subject:\s*.+\n*/im, '').trim();
    } else {
      if (subject) {
        subject.style.display = 'none';
        subject.textContent = '';
      }
      body.textContent = responseText;
    }
    logActivity(`Generated ${currentEmailType} email for <strong>${selectedJobForEmail.company}</strong>`, 'ai');
  } catch (e) {
    if (subject) {
      subject.style.display = 'none';
      subject.textContent = '';
    }
    body.textContent = "AI email generation is unavailable right now. Please try again shortly.";
  } finally {
    loading.style.display = 'none';
  }
}

function copyGeneratedEmail() {
  const subject = document.getElementById('emailSubject');
  const body = document.getElementById('emailBody');
  const subjectText = subject && subject.style.display !== 'none' && subject.textContent ? `Subject: ${subject.textContent}\n\n` : '';
  const text = subjectText + (body ? body.textContent : '');
  navigator.clipboard.writeText(text).then(() => showToast('Copied.'));
}

function openPrepPanel(company) {
  currentPrepCompany = company || 'Cognizant';
  const prep = PREP_REGISTRY[company] || PREP_REGISTRY["Cognizant"]; 
  const content = document.getElementById('prepContent');
  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <h4 style="color:var(--blue); font-size:0.9rem; margin-bottom:10px;">Focus Areas</h4>
      <div style="font-size:0.8rem; color:var(--muted);">${prep.focus}</div>
    </div>
    <div style="margin-bottom:20px;">
      <h4 style="color:var(--green); font-size:0.9rem; margin-bottom:10px;">High-Frequency Questions</h4>
      <ul style="padding-left:20px; font-size:0.8rem; color:rgba(255,255,255,0.8); line-height:1.8;">
        ${prep.questions.map(q => `<li>${q}</li>`).join('')}
      </ul>
    </div>
  `;
  document.getElementById('prepPanel').style.display = 'flex';
}

function generateMoreQuestions() {
  const prep = PREP_REGISTRY[currentPrepCompany] || PREP_REGISTRY["Cognizant"];
  const content = document.getElementById('prepContent');
  if (!content) return;

  const existing = document.getElementById('prepExtraQuestions');
  if (existing) {
    existing.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Extra interview prompts are already loaded below.');
    return;
  }

  const extraQuestions = [
    `How would you tailor your strongest project story for ${currentPrepCompany}?`,
    `Which trade-off would you call out first if ${currentPrepCompany} asked for faster delivery and lower risk?`,
    `What architecture guardrails would you put in place before the first production release?`,
    `How would you explain your testing strategy to a delivery manager in one minute?`,
    `Which failure scenario would you proactively mention to show seniority in the interview?`,
    `How would you prioritize technical debt if the implementation timeline shrank by 30 percent?`,
    `What metrics would you use to prove your solution is healthy after go-live?`,
    `How would you adapt your mortgage domain examples for this company's business model?`,
    `Which of your certifications adds the most credibility here, and why?`,
    `What question should you ask the panel to expose the real complexity of the role?`
  ];

  content.innerHTML += `
    <div id="prepExtraQuestions" style="margin-top:20px; border-top:1px solid var(--border); padding-top:18px;">
      <h4 style="color:var(--amber); font-size:0.9rem; margin-bottom:10px;">Expansion Pack</h4>
      <ul style="padding-left:20px; font-size:0.8rem; color:rgba(255,255,255,0.82); line-height:1.8;">
        ${extraQuestions.map(question => `<li>${escapeHtml(question)}</li>`).join('')}
      </ul>
      <div style="margin-top:12px; font-size:0.72rem; color:var(--muted);">
        Focus prompts: ${escapeHtml((prep.tips || []).join(' | '))}
      </div>
    </div>
  `;
  showToast('Added 10 extra interview prompts for this company.');
}

function openAddJobModal() {
  document.getElementById('addJobModal').style.display = 'flex';
}

function submitCustomJob() {
  const company = document.getElementById('aj-company').value;
  const role = document.getElementById('aj-role').value;
  if (!company || !role) return showToast('Fill required fields');
  const newJob = {
    id: 'custom_' + Date.now(), company, role,
    loc: document.getElementById('aj-loc').value || 'Remote',
    sal: document.getElementById('aj-sal').value || ' - ',
    prob: document.getElementById('aj-prob').value,
    score: document.getElementById('aj-score').value || 75,
    status: 'todo'
  };
  pipelineJobs.unshift(newJob);
  savePipeline(); renderBoard();
  closeModal('addJobModal');
  showToast('Job added.');
}

function updateAnalytics() {
  const submittedCount = pipelineJobs.filter(j => ['applied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
  const responseCount = pipelineJobs.filter(j => ['interview', 'offer', 'rejected'].includes(j.status)).length;
  const rate = submittedCount > 0 ? Math.round((responseCount / submittedCount) * 100) : 0;

  const interviewCount = pipelineJobs.filter(j => j.status === 'interview' || j.status === 'offer').length;
  const offerCount = pipelineJobs.filter(j => j.status === 'offer').length;
  const conv = interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : 0;

  const elRate = document.getElementById('met-rate');
  const elConv = document.getElementById('met-conversion');
  const elStreak = document.getElementById('met-streak');
  const elFollowup = document.getElementById('met-followup');
  const elWeekly = document.getElementById('met-weekly');
  const elGoalArc = document.getElementById('goal-arc');
  const elGoalPct = document.getElementById('goal-pct');

  if (elRate) elRate.textContent = rate + '%';
  if (elConv) elConv.textContent = conv + '%';
  if (elStreak) elStreak.textContent = computeApplyStreak() + 'd';
  if (elFollowup) elFollowup.textContent = pipelineJobs.filter(j => getFollowUpStatus(j)).length;

  const startOfWeek = new Date();
  startOfWeek.setHours(0,0,0,0);
  startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() || 7) + 1);
  const weeklyCount = pipelineJobs.filter(j => {
    const appliedDate = j.dateApplied || j.appliedAt;
    return appliedDate && new Date(appliedDate) >= startOfWeek;
  }).length;
  
  if (elWeekly) elWeekly.textContent = `${weeklyCount}/5`;
  const pct = Math.min(Math.round((weeklyCount / 5) * 100), 100);
  if (elGoalArc) elGoalArc.style.strokeDasharray = `${pct} 100`;
  if (elGoalPct) elGoalPct.textContent = pct + '%';
}

function computeApplyStreak() {
  const appliedDates = [...new Set(
    pipelineJobs
      .filter(job => job.dateApplied || job.appliedAt)
      .map(job => {
        const d = new Date(job.dateApplied || job.appliedAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
      .filter(Boolean)
  )].sort((a, b) => b - a);

  if (!appliedDates.length) return 0;

  let streak = 1;
  let previous = new Date(appliedDates[0]);
  for (let index = 1; index < appliedDates.length; index += 1) {
    const next = new Date(appliedDates[index]);
    const gap = Math.round((previous - next) / 86400000);
    if (gap !== 1) break;
    streak += 1;
    previous = next;
  }
  return streak;
}

function checkOfferComparison() {
  const offers = pipelineJobs.filter(j => j.status === 'offer');
  const panel = document.getElementById('offer-comparison');
  if (!panel) return;

  if (offers.length >= 2) {
    panel.style.display = 'block';
    const container = document.getElementById('offer-matrix-container');
    if (container) {
      container.innerHTML = `
        <table style="width:100%; border-collapse:collapse; min-width:600px;">
          <thead><tr style="border-bottom:2px solid var(--border); color:var(--muted); font-size:0.7rem; text-transform:uppercase;"><th style="padding:12px; text-align:left;">Company</th><th style="padding:12px; text-align:left;">Salary</th><th style="padding:12px; text-align:left;">Fit</th></tr></thead>
          <tbody>${offers.map(o => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:12px; font-weight:700;">${o.company}</td><td style="padding:12px; color:var(--green);">${o.sal}</td><td style="padding:12px;"> ${o.score}%</td></tr>`).join('')}</tbody>
        </table>`;
    }
  } else {
    panel.style.display = 'none';
  }
}

function showToast(msg, typeHint) {
  // Enhanced toast queue system (v1413)
  // Backward compatible: accepts boolean, string ('red','error','green','blue'), or undefined
  const container = document.getElementById('toastContainer') || (() => {
    const c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  })();

  // Normalize type from legacy callers
  let type = 'success';
  if (typeHint === true || typeHint === 'red' || typeHint === 'error') type = 'error';
  else if (typeHint === 'warning' || typeHint === 'amber') type = 'warning';
  else if (typeHint === 'blue' || typeHint === 'info') type = 'info';
  else if (typeHint === 'green' || typeHint === 'success') type = 'success';
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${String(msg || '')}</span>
    <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Dismiss">&times;</button>
  `;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast-show'));

  // Auto-dismiss
  const duration = type === 'error' ? 6000 : type === 'warning' ? 5000 : 3500;
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 400);
  }, duration);

  // Keep max 4 toasts visible
  const items = container.querySelectorAll('.toast-item');
  if (items.length > 4) items[0].remove();

  // Legacy fallback for the old toast element
  const legacyToast = document.getElementById('toast');
  if (legacyToast) {
    legacyToast.textContent = String(msg || '');
    legacyToast.classList.add('show');
    setTimeout(() => legacyToast.classList.remove('show'), 3500);
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function exportLog() {
  if (!activityLog.length) {
    showToast('No activity log entries to export yet.');
    return;
  }

  const rows = [
    ['timestamp', 'type', 'text'],
    ...activityLog.map(entry => [
      entry.timestamp,
      entry.type,
      String(entry.text || '').replace(/<[^>]+>/g, '')
    ])
  ];

  const csv = rows
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `job-radar-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Activity log exported.');
}

function clearLog() {
  activityLog = [];
  writeScopedJson('activityLog', activityLog);
  renderLog();
  showToast('Activity log cleared.');
}

// Close sidebar when clicking a nav item or overlay on mobile (v1343)
document.addEventListener('click', function(e) {
  const isNavItem = e.target.closest('.nav-item');
  const isOverlay = e.target.id === 'sidebarOverlay';
  
  if ((isNavItem || isOverlay) && window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      toggleMobileSidebar(false);
    }
  }
});

// =============================================
// SAFETY STUBS: Functions that may be defined in inline HTML scripts
// These no-ops prevent ReferenceError if called before HTML scripts load
// =============================================
if (typeof renderStreakBadge !== 'function') { window.renderStreakBadge = function() {}; }
if (typeof renderBookmarkButtons !== 'function') { window.renderBookmarkButtons = function() {}; }
if (typeof renderRevisionAlerts !== 'function') { window.renderRevisionAlerts = function() {}; }
if (typeof showBookmarks !== 'function') { window.showBookmarks = function() {}; }
if (typeof updateSyncModalUI !== 'function') { window.updateSyncModalUI = function() {}; }
if (typeof updateSidebarProfileStatus !== 'function') { window.updateSidebarProfileStatus = function() {}; }

// =============================================
// INIT: Render streaks + bookmarks on load
// =============================================
window.addEventListener('DOMContentLoaded', function() {
  renderStreakBadge();
  setTimeout(renderBookmarkButtons, 500);
  renderRevisionAlerts(); // v1342
});

// =============================================
// CLEANUP: Prevent memory leaks on page unload
// =============================================
window.addEventListener('beforeunload', function() {
  if (floatingTimerInterval) { clearInterval(floatingTimerInterval); floatingTimerInterval = null; }
  if (window._jobRadarInterval) { clearInterval(window._jobRadarInterval); window._jobRadarInterval = null; }
});

// =============================================
// AGENTFORCE: Prompt Simulation Logic
// =============================================
window.runAgentforceSimulation = async function() {
  const sysEl = document.getElementById('agentforceSystemPrompt');
  const usrEl = document.getElementById('agentforceUserPrompt');
  const outBox = document.getElementById('agentforceOutput');
  const outText = document.getElementById('agentforceOutputText');
  
  if (!usrEl.value.trim()) {
    showToast('Please enter a user prompt.');
    return;
  }
  
  outBox.style.display = 'block';
  outText.innerHTML = '<span style="color:var(--muted);">Executing AI simulation...</span>';
  
  try {
    let finalPrompt = usrEl.value;
    if (sysEl.value.trim()) {
      finalPrompt = "SYSTEM: " + sysEl.value + "\n\nUSER: " + usrEl.value;
    }
    
    const responseText = await callAi('interview', { topic: 'Agentforce simulation', prompt: finalPrompt, answer: usrEl.value });
    outText.innerHTML = escapeHtml(responseText).replace(/\n/g, '<br>');
  } catch (err) {
    outText.innerHTML = '<span style="color:var(--red);">Error: AI simulation is unavailable right now. Please try again shortly.</span>';
  }
};
