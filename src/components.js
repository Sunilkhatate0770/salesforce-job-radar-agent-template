/**
 * 🧱 INDUSTRIAL COMPONENT REGISTRY (v1414)
 * ---------------------------------------
 * This file contains all UI template logic. 
 * Decoupling presentation from logic allows for better performance 
 * and a modular "Generic Solution" architecture.
 */

// --- SKELETON LOADER GENERATORS (v1414) ---
function renderSkeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card skeleton" style="min-height:120px;border-radius:16px;margin-bottom:12px;"></div>
  `).join('');
}

function renderSkeletonList(rows = 4) {
  return `<div class="skeleton-row" style="gap:12px;">
    ${Array.from({ length: rows }, (_, i) => `
      <div class="skeleton-text skeleton ${i === 0 ? 'short' : i === rows-1 ? 'medium' : 'long'}" style="height:14px;border-radius:6px;"></div>
    `).join('')}
  </div>`;
}

function renderSkeletonProfile() {
  return `<div style="display:flex;align-items:center;gap:16px;padding:20px;">
    <div class="skeleton-avatar skeleton" style="width:56px;height:56px;border-radius:50%;flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
      <div class="skeleton-heading skeleton" style="height:18px;width:60%;border-radius:6px;"></div>
      <div class="skeleton-text skeleton medium" style="height:12px;border-radius:6px;"></div>
      <div class="skeleton-badge skeleton" style="height:24px;width:90px;border-radius:12px;"></div>
    </div>
  </div>`;
}

function renderSkeletonDashboard() {
  return `<div class="career-os-shell dashboard-skeleton-state" aria-busy="true" aria-label="Loading dashboard">
    <section class="career-os-panel card-featured">
      <div class="skeleton-heading skeleton"></div>
      <div class="skeleton-text skeleton long"></div>
      <div class="skeleton-grid">
        ${Array.from({ length: 3 }, () => `<div class="skeleton-card skeleton" style="height:72px;"></div>`).join('')}
      </div>
    </section>
    <div class="career-os-grid">
      ${Array.from({ length: 3 }, () => `
        <section class="career-os-panel card-standard">
          <div class="skeleton-heading skeleton"></div>
          <div class="skeleton-text skeleton long"></div>
          <div class="skeleton-text skeleton medium"></div>
          <div class="skeleton-card skeleton" style="height:96px;"></div>
        </section>
      `).join('')}
    </div>
  </div>`;
}

// --- EMPTY STATE COMPONENT (v1414) ---
function renderEmptyState(options = {}) {
  const {
    icon = 'inbox',
    title = 'Nothing here yet',
    description = '',
    actionLabel = '',
    actionFn = ''
  } = options;

  const icons = {
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--muted);opacity:0.5;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>'
  };

  const actionHtml = actionLabel && actionFn
    ? `<button type="button" class="empty-state-action" onclick="${actionFn}">${componentEscapeHtml(actionLabel)}</button>`
    : '';

  return `<div class="empty-state">
    <div class="empty-state-icon">${icons[icon] || icons.inbox}</div>
    <h3>${componentEscapeHtml(title)}</h3>
    ${description ? `<p>${componentEscapeHtml(description)}</p>` : ''}
    ${actionHtml}
  </div>`;
}

function renderInlineErrorState(message, retryAction = '') {
  return `
    <div class="inline-error-state" role="status">
      <span>${componentEscapeHtml(message || 'Something needs another try.')}</span>
      ${retryAction ? `<button type="button" class="career-os-link-btn" onclick="${retryAction}">Retry</button>` : ''}
    </div>
  `;
}

// --- PRESENTATION HELPERS ---
function timeAgo(date) {
  if (!date) return 'Just now';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return "Just now";
}

function stringToColor(str) {
  let hash = 0;
  const s = String(str || 'User');
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    let value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color + '44'; // Add transparency
}

function generateInitialsAvatar(name) {
  const parts = (name || 'User').split(' ');
  const initials = parts.length > 1 
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : parts[0].substring(0, 2).toUpperCase();
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="rgba(59,130,246,0.1)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="#3b82f6">${initials}</text></svg>`)}`;
}

function renderUserProfile(user) {
  if (!user) return;
  const container = document.getElementById('floatingProfileContainer');
  const avatarImg = document.getElementById('floatAvatarImg');
  const dropName = document.getElementById('floatFullTitle');
  const dropEmail = document.getElementById('floatEmailTitle');
  const sidebarPic = document.getElementById('userPicture');
  const sidebarName = document.getElementById('userName');
  const sidebarEmail = document.getElementById('userEmail');
  const sidebarWrap = document.getElementById('userProfile');

  let profilePic = user.picture;
  if (profilePic && profilePic.includes('googleusercontent.com')) {
    profilePic = profilePic.replace(/=s\d+-c/, '=s120-c');
  }

  if (container) container.style.display = 'block';
  if (avatarImg) {
    avatarImg.src = profilePic || generateInitialsAvatar(user.name);
    avatarImg.onerror = function() { this.src = generateInitialsAvatar(user.name); };
  }
  if (dropName) dropName.textContent = user.name;
  if (dropEmail) dropEmail.textContent = user.email;
  if (sidebarWrap) sidebarWrap.style.display = 'flex';
  if (sidebarPic) sidebarPic.src = profilePic || generateInitialsAvatar(user.name);
  if (sidebarName) sidebarName.textContent = user.name;
  if (sidebarEmail) sidebarEmail.textContent = user.email;
}

function getCareerOsTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function careerOsFormatDate() {
  return new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function careerOsFormatHours(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = value / 3600;
  if (hours >= 10) return `${Math.round(hours)}h`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(value / 60)}m`;
}

function careerOsFormatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(number) : '0';
}

function getCareerOsTopicName(topic) {
  return componentEscapeHtml(extractIndustrialTopicName(topic));
}

function getCareerOsTopicId(topic, fallback = 'study_tracker') {
  if (!topic) return fallback;
  if (typeof topic === 'string') return topic.toLowerCase().replace(/\s+/g, '_');
  return topic.topicId || topic.id || topic.sectionId || fallback;
}

function getCareerOsStudySnapshot(profile, liveContext = true) {
  let data = {};
  try {
    data = typeof globalStudyData !== 'undefined' && globalStudyData ? globalStudyData : {};
  } catch (err) {
    data = {};
  }

  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const topics = data.topics || {};
  const todayKey = getCareerOsTodayKey();
  const todaySeconds = sessions
    .filter(session => session && session.date === todayKey)
    .reduce((sum, session) => sum + Number(session.duration || 0), 0);
  const liveSeconds = liveContext && typeof getCurrentElapsed === 'function' ? getCurrentElapsed() : 0;
  const totalSeconds = Object.values(topics)
    .reduce((sum, topic) => sum + Number(topic?.totalSeconds || 0), 0) + liveSeconds;
  const recentSessions = sessions
    .slice()
    .sort((a, b) => new Date(b.endTime || b.startTime || b.date || 0) - new Date(a.endTime || a.startTime || a.date || 0));
  const lastTopic = recentSessions[0]?.topicName || recentSessions[0]?.topic || '';

  return {
    todaySeconds: todaySeconds + liveSeconds,
    totalSeconds,
    sessionCount: sessions.length,
    lastTopic,
    activeTopic: typeof currentTrackedPage !== 'undefined' && currentTrackedPage
      ? (topicConfig?.[currentTrackedPage]?.name || currentTrackedPage)
      : '',
    roadmapCount: Array.isArray(profile.studyPlanTopics) ? profile.studyPlanTopics.length : 0
  };
}

function getCareerOsJobSnapshot() {
  const jobs = Array.isArray(window.pipelineJobs) ? window.pipelineJobs : [];
  const byStatus = status => jobs.filter(job => componentText(job.status, 'todo') === status);
  const todo = byStatus('todo');
  const applied = byStatus('applied');
  const interview = byStatus('interview');
  const offer = byStatus('offer');
  const rejected = byStatus('rejected');
  const highFit = todo.filter(job => Number(job.score || job.match_score || 0) >= 80);
  const followUps = typeof getFollowUpStatus === 'function'
    ? jobs.filter(job => getFollowUpStatus(job))
    : [];
  const fresh = typeof jobRadarDaysOld === 'function'
    ? todo.filter(job => jobRadarDaysOld(job) <= 1)
    : todo.slice(0, 3);
  const newest = jobs.slice().sort((a, b) => {
    const dateA = typeof jobRadarDate === 'function' ? jobRadarDate(a) : new Date(a.createdAt || a.first_seen_at || 0);
    const dateB = typeof jobRadarDate === 'function' ? jobRadarDate(b) : new Date(b.createdAt || b.first_seen_at || 0);
    return dateB - dateA;
  })[0];

  return {
    jobs,
    todo,
    applied,
    interview,
    offer,
    rejected,
    highFit,
    followUps,
    fresh,
    newest,
    submitted: applied.length + interview.length + offer.length + rejected.length
  };
}

function getCareerIntelligence() {
  return window.SFJR_CAREER_INTELLIGENCE || {};
}

function renderCareerUpgradeCommandCenter(profile, jobs, study) {
  const intelligence = getCareerIntelligence();
  if (typeof intelligence.buildTodayCommandCenter !== 'function') return '';
  const command = intelligence.buildTodayCommandCenter({
    profile,
    jobs: jobs?.jobs || [],
    progress: (typeof globalStudyData !== 'undefined' ? globalStudyData : window.globalStudyData) || {},
    bookmarks: (typeof userBookmarks !== 'undefined' ? userBookmarks : window.userBookmarks) || [],
    releases: (typeof premiumReleaseCache !== 'undefined' ? premiumReleaseCache : window.premiumReleaseCache) || {},
    content: window.SFJR_SALESFORCE_CONTENT || {}
  });
  const roadmapTracks = typeof intelligence.buildStudyRoadmap === 'function'
    ? intelligence.buildStudyRoadmap({
      content: window.SFJR_SALESFORCE_CONTENT || {},
      progress: (typeof globalStudyData !== 'undefined' ? globalStudyData : window.globalStudyData) || {},
      bookmarks: (typeof userBookmarks !== 'undefined' ? userBookmarks : window.userBookmarks) || []
    })
    : [];
  const metrics = command.metrics || {};
  return `
    <section class="career-upgrade-panel today-command-center card-standard animate-reveal" style="--reveal-index:1">
      <div class="career-upgrade-head">
        <div>
          <span class="career-os-kicker">Today Command Center</span>
          <h3>One balanced plan for study, jobs, profile, and releases</h3>
        </div>
        <div class="career-upgrade-metrics" aria-label="Today command center metrics">
          <span><b>${componentEscapeHtml(metrics.highFitJobs || 0)}</b> high fit</span>
          <span><b>${componentEscapeHtml(metrics.freshJobs || 0)}</b> fresh</span>
          <span><b>${componentEscapeHtml(metrics.bookmarks || 0)}</b> saved Q&A</span>
        </div>
      </div>
      <div class="career-command-grid">
        ${(command.actions || []).map(action => {
          const target = action.type === 'jobs' ? 'job_radar'
            : action.type === 'release' ? 'salesforce_releases'
            : action.type === 'profile' ? 'profile_match'
            : 'study_tracker';
          return `
            <article class="career-command-card ${componentEscapeAttr(action.type || 'study')}">
              <span>${componentEscapeHtml(action.type || 'focus')}</span>
              <h4>${componentEscapeHtml(action.title)}</h4>
              <p>${componentEscapeHtml(action.detail)}</p>
              <button type="button" class="career-os-link-btn" onclick="showPage('${componentEscapeJsArg(target)}')">${componentEscapeHtml(action.cta || 'Open')}</button>
            </article>
          `;
        }).join('')}
      </div>
      <div class="career-seven-day-plan" aria-label="Next seven days study plan">
        <div class="career-seven-day-title">
          <span class="career-os-kicker">Next 7 Days Plan</span>
          <strong>${componentEscapeHtml(command.targetRole || 'Salesforce Developer')}</strong>
        </div>
        <div class="career-seven-day-grid">
          ${(command.nextSevenDays || []).map(day => `
            <button type="button" class="career-day-card" onclick="showPage('study_tracker')">
              <span>${componentEscapeHtml(day.label)}</span>
              <strong>${componentEscapeHtml(day.topic)}</strong>
              <em>${componentEscapeHtml(day.focus)}</em>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="career-roadmap-tracks" aria-label="Study roadmap by track">
        <div class="career-seven-day-title">
          <span class="career-os-kicker">Study Roadmap</span>
          <strong>Core and scenario readiness</strong>
        </div>
        <div class="career-track-grid">
          ${roadmapTracks.map(track => `
            <button type="button" class="career-track-card${track.weak ? ' needs-work' : ''}" onclick="showPage('study_tracker')">
              <span>${componentEscapeHtml(track.label)}</span>
              <strong>${componentEscapeHtml(track.nextTopic)}</strong>
              <em>${componentEscapeHtml(track.coreSections)} core · ${componentEscapeHtml(track.scenarioSections)} scenario · ${componentEscapeHtml(track.mastered)} mastered</em>
            </button>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function getCareerOsFocus(profile, jobs) {
  const topics = Array.isArray(profile.studyPlanTopics) ? profile.studyPlanTopics : [];
  const missing = Array.isArray(profile.missingSkills) ? profile.missingSkills : [];
  const firstHighFit = jobs.highFit[0] || jobs.fresh[0] || jobs.todo[0];
  const firstTopic = topics[0];

  if (typeof currentTrackedPage !== 'undefined' && currentTrackedPage) {
    return {
      label: 'Live study block',
      title: topicConfig?.[currentTrackedPage]?.name || currentTrackedPage,
      detail: 'Keep the timer running and finish one clean explanation before switching topics.',
      actionLabel: 'Continue',
      action: `showPage('${componentEscapeJsArg(currentTrackedPage)}')`
    };
  }

  if (firstHighFit) {
    return {
      label: 'Best career move',
      title: `${componentText(firstHighFit.company, 'Target company')} - ${componentText(firstHighFit.role || firstHighFit.title, 'Salesforce role')}`,
      detail: 'Review the role, tailor the resume actions, and move it through the pipeline today.',
      actionLabel: 'Open Radar',
      action: "showPage('job_radar')"
    };
  }

  if (firstTopic) {
    return {
      label: 'Study focus',
      title: extractIndustrialTopicName(firstTopic),
      detail: firstTopic.reason || 'This topic has the strongest signal for your current target role.',
      actionLabel: 'Start Prep',
      action: `showPage('${componentEscapeJsArg(getCareerOsTopicId(firstTopic))}')`
    };
  }

  return {
    label: 'Setup focus',
    title: missing[0] ? `Close ${missing[0]}` : 'Build today\'s Salesforce plan',
    detail: missing[0]
      ? 'Turn the top skill gap into one interview-ready story and one code example.'
      : 'Import your profile or generate the roadmap to personalize the command center.',
    actionLabel: missing[0] ? 'Open Tracker' : 'Update Profile',
    action: missing[0] ? "showPage('study_tracker')" : "document.getElementById('syncCtaCards')?.style.setProperty('display','grid')"
  };
}

function renderCareerOsMetric(label, value, suffix = '', tone = 'blue') {
  const numeric = Number(value || 0);
  return `
    <div class="career-os-metric ${tone}">
      <span>${componentEscapeHtml(label)}</span>
      <strong data-countup="true" data-count-up="${numeric}" data-count-target="${numeric}" data-count-suffix="${componentEscapeAttr(suffix)}">${careerOsFormatCount(numeric)}${componentEscapeHtml(suffix)}</strong>
    </div>
  `;
}

function renderCareerOsInfoMetric(label, value, tone = 'blue') {
  return `
    <div class="career-os-metric ${tone}">
      <span>${componentEscapeHtml(label)}</span>
      <strong>${componentEscapeHtml(value)}</strong>
    </div>
  `;
}

function renderCareerOsEmptyState(title, detail, actionLabel, action) {
  return `
    <div class="career-os-empty">
      <strong>${componentEscapeHtml(title)}</strong>
      <span>${componentEscapeHtml(detail)}</span>
      ${actionLabel && action ? `<button type="button" class="career-os-link-btn" onclick="${action}">${componentEscapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
}

function getCareerOsScore(job) {
  const value = Number(job?.score || job?.match_score || job?.probability || 0);
  return Number.isFinite(value) ? value : 0;
}

function getCareerOsJobDate(job) {
  if (!job) return null;
  const value = job.last_seen_at || job.first_seen_at || job.posted_at || job.updatedAt || job.updated_at || job.createdAt || job.created_at || job.dateAdded;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCareerOsMatchQuality(jobs) {
  const scored = (jobs.todo.length ? jobs.todo : jobs.jobs)
    .map(getCareerOsScore)
    .filter(score => score > 0);
  if (!scored.length) return 0;
  return Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length);
}

function getCareerOsLastScanLabel(jobs) {
  const date = getCareerOsJobDate(jobs.newest);
  if (!date) return 'Not run yet';
  return typeof timeAgo === 'function' ? timeAgo(date) : date.toLocaleDateString();
}

function getCareerOsDisplayName(profile) {
  const name = profile.name || profile.fullName || profile.displayName || (typeof currentUser !== 'undefined' && currentUser?.name) || 'Salesforce pro';
  return String(name).trim().split(/\s+/)[0] || 'Salesforce pro';
}

function getCareerOsPrepCategories(profile, strength) {
  const skills = (profile.skills || []).map(skill => String(skill).toLowerCase());
  const missing = (profile.missingSkills || []).map(skill => String(skill).toLowerCase());
  const studyTopics = (() => {
    try {
      return typeof globalStudyData !== 'undefined' && globalStudyData?.topics ? globalStudyData.topics : {};
    } catch (err) {
      return {};
    }
  })();
  const categories = [
    { label: 'Apex', keys: ['apex', 'soql', 'async'] },
    { label: 'LWC', keys: ['lwc', 'lightning web component', 'javascript'] },
    { label: 'Integration', keys: ['integration', 'rest', 'soap', 'api'] },
    { label: 'Triggers', keys: ['trigger', 'bulkification', 'order of execution'] },
    { label: 'Security', keys: ['security', 'sharing', 'permission'] }
  ];

  return categories.map(category => {
    const imported = category.keys.some(key => skills.some(skill => skill.includes(key)));
    const gap = category.keys.some(key => missing.some(skill => skill.includes(key)));
    const studiedSeconds = Object.entries(studyTopics).reduce((sum, [id, topic]) => {
      const haystack = `${id} ${topic?.name || ''} ${topic?.topic || ''}`.toLowerCase();
      return category.keys.some(key => haystack.includes(key)) ? sum + Number(topic?.totalSeconds || 0) : sum;
    }, 0);
    const base = Math.round(Number(strength || 0) * 0.45);
    const value = Math.max(12, Math.min(96, base + (imported ? 28 : 12) + Math.min(24, Math.round(studiedSeconds / 1800)) - (gap ? 16 : 0)));
    return { ...category, value, status: gap ? 'Needs reps' : imported ? 'Ready' : 'Queued' };
  });
}

function renderCareerOsPrepBars(categories) {
  return categories.map(category => `
    <div class="career-os-prep-row">
      <div class="career-os-prep-row-head">
        <span>${componentEscapeHtml(category.label)}</span>
        <b>${componentEscapeHtml(category.status)}</b>
      </div>
      <div class="career-os-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${category.value}">
        <span style="--prep-value:${category.value}%"></span>
      </div>
    </div>
  `).join('');
}

function careerOsSaveTopRoles() {
  const jobs = Array.isArray(window.pipelineJobs) ? window.pipelineJobs : [];
  const candidates = jobs
    .filter(job => componentText(job.status, 'todo') === 'todo')
    .sort((a, b) => getCareerOsScore(b) - getCareerOsScore(a))
    .slice(0, 3);

  if (!candidates.length) {
    if (typeof showToast === 'function') showToast('Start a scan to create top roles to save.');
    if (typeof triggerJobScan === 'function') triggerJobScan();
    return;
  }

  candidates.forEach(job => {
    job.saved = true;
    job.pinned = true;
    job.updatedAt = new Date().toISOString();
  });
  if (typeof savePipeline === 'function') savePipeline();
  if (typeof renderBoard === 'function') renderBoard();
  if (typeof showToast === 'function') showToast(`${candidates.length} top roles saved to your radar queue.`);
  const button = document.activeElement;
  if (button && button.matches('button')) {
    button.classList.add('btn-success-flash');
    setTimeout(() => button.classList.remove('btn-success-flash'), 650);
  }
}

function buildCareerOsActions(profile, jobs, study, strength) {
  const topics = Array.isArray(profile.studyPlanTopics) ? profile.studyPlanTopics : [];
  const missing = Array.isArray(profile.missingSkills) ? profile.missingSkills : [];
  const applyCount = Math.max(1, Math.min(3, jobs.highFit.length || jobs.fresh.length || jobs.todo.length || 1));
  const reviewCount = Math.max(5, Math.min(12, (missing.length || topics.length || 3) * 2));
  const companyName = componentText((jobs.highFit[0] || jobs.fresh[0] || jobs.todo[0])?.company, 'target company');
  const actions = [];

  actions.push({
    type: 'Apply',
    title: `Apply to ${applyCount} high-fit role${applyCount === 1 ? '' : 's'}`,
    detail: jobs.todo.length ? 'Use the radar board to move the best matches from review to applied.' : 'Run a scan first so your queue starts from fresh opportunities.',
    actionLabel: jobs.todo.length ? 'View roles' : 'Scan',
    action: jobs.todo.length ? "showPage('job_radar')" : 'triggerJobScan()',
    priority: jobs.highFit.length ? 'high' : 'medium',
    complete: jobs.submitted >= applyCount
  });

  actions.push({
    type: 'Review',
    title: `Review ${reviewCount} interview questions`,
    detail: missing[0] ? `Lead with ${missing[0]} and turn it into a crisp answer.` : 'Refresh core Salesforce patterns before starting deep work.',
    actionLabel: 'Review',
    action: "showPage('questions')",
    priority: missing.length ? 'high' : 'medium',
    complete: study.todaySeconds >= 1800
  });

  actions.push({
    type: 'Practice',
    title: 'Practice 1 coding task',
    detail: 'Keep one Apex, LWC, or JavaScript rep close to interview conditions.',
    actionLabel: 'Code',
    action: "showPage('code_practice')",
    priority: strength >= 70 ? 'medium' : 'high',
    complete: false
  });

  actions.push({
    type: 'Brief',
    title: 'Read 1 company brief',
    detail: `Use ${companyName} as today\'s context for role fit and interview talking points.`,
    actionLabel: 'Briefs',
    action: "showPage('company_iq')",
    priority: 'low',
    complete: false
  });

  return actions;
}

function renderCareerOsActionQueue(actions) {
  return actions.map((item, index) => `
    <article class="career-os-action-item card-compact animate-reveal ${componentEscapeAttr(item.priority || 'medium')}" style="--reveal-index:${index + 4}">
      <span class="career-os-check ${item.complete ? 'complete' : ''}" aria-hidden="true"></span>
      <div class="career-os-action-meta">
        <span>${componentEscapeHtml(item.type)}</span>
        <b>${componentEscapeHtml(item.priority || 'medium')}</b>
      </div>
      <div class="career-os-action-copy">
        <h4>${componentEscapeHtml(item.title)}</h4>
        <p>${componentEscapeHtml(item.detail)}</p>
      </div>
      <button type="button" class="career-os-link-btn" onclick="${item.action}">${componentEscapeHtml(item.actionLabel)}</button>
    </article>
  `).join('');
}

function animateCountUpMetrics(root = document) {
  const motionReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodes = Array.from(root.querySelectorAll('[data-countup="true"], [data-count-up]'));
  nodes.forEach(node => {
    if (node.dataset.countupStarted === 'true') return;
    node.dataset.countupStarted = 'true';
    const target = Number(node.dataset.countTarget || node.dataset.countUp || 0);
    const suffix = node.dataset.countSuffix || '';
    if (!Number.isFinite(target)) return;
    if (motionReduced || target <= 0) {
      node.textContent = `${Math.round(target)}${suffix}`;
      return;
    }
    const duration = 1000;
    const start = performance.now();
    const step = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = `${Math.round(target * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function initCountUp(root = document) {
  animateCountUpMetrics(root);
}

function initDashboardReveal(root = document) {
  const nodes = Array.from(root.querySelectorAll('.animate-reveal'));
  if (!nodes.length) return;
  const motionReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (motionReduced || typeof IntersectionObserver === 'undefined') {
    nodes.forEach(node => node.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

  nodes.forEach((node, index) => {
    if (!node.style.getPropertyValue('--reveal-index')) {
      node.style.setProperty('--reveal-index', index);
    }
    observer.observe(node);
  });
}

function renderProfileMatchPage(profile) {
  const contentDiv = document.getElementById('profileMatchContent');
  const syncCta = document.getElementById('syncCtaCards');
  const sourceHeading = document.getElementById('profileSourceHeading');
  const loadingEl = document.getElementById('profileMatchLoading');
  if (!contentDiv) return;

  profile = typeof mergePremiumDraftProfile === 'function'
    ? mergePremiumDraftProfile(profile || {})
    : (profile || {});

  if (loadingEl) loadingEl.style.display = 'none';
  updateSidebarProfileStatus(profile);
  updateSyncModalUI(profile);

  const showProfileSources = !(profile.skills && profile.skills.length > 0);
  if (syncCta) syncCta.style.display = showProfileSources ? 'grid' : 'none';
  if (sourceHeading) sourceHeading.style.display = showProfileSources ? 'flex' : 'none';

  const skills = profile.skills || [];
  const certs = profile.certifications || [];
  const missing = profile.missingSkills || [];
  const topics = profile.studyPlanTopics || [];
  const platforms = profile.platforms || {};
  const activityReadiness = Math.min(100, Math.round(
    (skills.length * 6) +
    ((window.userBookmarks || []).length * 3) +
    ((window.globalStudyData?.sessions || []).length * 2) +
    ((window.pipelineJobs || []).length ? 12 : 0)
  ));
  const strength = Math.max(updateProfileStrengthMeter(skills.length, missing.length, profile), activityReadiness);

  let syncBadges = '';
  if (platforms.linkedin && platforms.linkedin.synced) {
    syncBadges += '<span class="badge badge-linkedin">LinkedIn Synced</span> ';
  }
  if (platforms.naukri && platforms.naukri.synced) {
    syncBadges += '<span class="badge badge-naukri">Naukri Synced</span>';
  }

  const study = getCareerOsStudySnapshot(profile);
  const jobs = getCareerOsJobSnapshot();
  const focus = getCareerOsFocus(profile, jobs);
  const actions = buildCareerOsActions(profile, jobs, study, strength);
  const readinessLabel = strength > 80 ? 'Exceptional' : strength > 50 ? 'Strong' : 'Developing';
  const targetRole = profile.targetRole || profile.targetDesignation || 'Salesforce Developer';
  const currentRole = profile.currentRole || profile.currentDesignation || 'Salesforce Professional';
  const platformCount = Object.values(platforms || {}).filter(p => p.synced).length;
  const radarState = window.jobRadarCloudState || { status: 'idle', message: 'Ready', detail: '' };
  const radarStatusClass = componentEscapeAttr(radarState.status || 'idle');
  const firstMissing = missing.slice(0, 5);
  const firstSkills = skills.slice(0, 8);
  const displayName = getCareerOsDisplayName(profile);
  const matchQuality = getCareerOsMatchQuality(jobs);
  const lastScanLabel = getCareerOsLastScanLabel(jobs);
  const prepCategories = getCareerOsPrepCategories(profile, strength);
  const streakCount = Math.max(0, Number((typeof studyStreak !== 'undefined' && studyStreak?.current) || 0));
  const primaryCta = jobs.jobs.length > 0
    ? { label: 'Resume Interview Prep', action: "showPage('ai_interview')" }
    : { label: 'Initiate Global Job Scan', action: 'triggerJobScan()' };
  const pendingActions = actions.filter(action => !action.complete).length;

  let html = `<div class="career-os-shell" data-state="${radarStatusClass}">
    <section class="career-os-hero today-focus career-os-panel card-featured animate-reveal" style="--reveal-index:0">
      <div class="career-os-hero-copy">
        <div class="career-os-kicker">Today's Focus</div>
        <h2>Welcome back, ${componentEscapeHtml(displayName)}. ${componentEscapeHtml(focus.title)}</h2>
        <p>${componentEscapeHtml(focus.detail)} ${componentEscapeHtml(careerOsFormatDate())} plan for applications, interview readiness, and Salesforce skill momentum.</p>
        <div class="career-os-focus-strip career-os-summary-chips">
          ${renderCareerOsMetric('Roles scanned', jobs.jobs.length, '', 'blue')}
          ${renderCareerOsMetric('Readiness score', strength, '%', 'green')}
          ${renderCareerOsMetric('Tasks pending', pendingActions, '', 'amber')}
        </div>
      </div>
      <div class="career-os-identity">
        <span>${componentEscapeHtml(focus.label)}</span>
        <strong>${componentEscapeHtml(readinessLabel)}</strong>
        <em>${componentEscapeHtml(currentRole)} · ${componentEscapeHtml(profile.experienceYears || 0)} yrs exp · ${certs.length} certs · ${platformCount} sources</em>
        <button type="button" class="career-os-primary-btn" onclick="${primaryCta.action}">${componentEscapeHtml(primaryCta.label)}</button>
        <button type="button" class="career-os-link-btn" onclick="document.getElementById('syncCtaCards')?.style.setProperty('display','grid');document.getElementById('profileSourceHeading')?.style.setProperty('display','flex')">Update Profile</button>
      </div>
    </section>

    ${renderCareerUpgradeCommandCenter(profile, jobs, study)}

    <div class="career-os-grid">
      <section id="careerOsJobRadarSummary" class="career-os-panel job-radar-summary card-standard animate-reveal ${radarStatusClass}" style="--reveal-index:1">
        <div class="career-os-section-head">
          <div>
            <span class="career-os-kicker">Job Radar Summary</span>
            <h3>Pipeline and market signal</h3>
          </div>
          <span class="career-os-scan-state">${componentEscapeHtml(radarState.message || radarState.status || 'Ready')}</span>
        </div>
        <div class="career-os-metric-grid">
          ${renderCareerOsMetric('New matches', jobs.fresh.length || jobs.todo.length, '', 'blue')}
          ${renderCareerOsMetric('Match quality', matchQuality, '%', matchQuality >= 75 ? 'green' : 'amber')}
          ${renderCareerOsInfoMetric('Last scan', lastScanLabel, 'violet')}
          ${renderCareerOsMetric('High fit', jobs.highFit.length, '', 'green')}
        </div>
        <div id="careerOsJobIntelContent" class="career-os-job-intel" aria-live="polite">
          <div class="career-os-skeleton">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="career-os-panel-actions">
          <button type="button" class="career-os-link-btn" onclick="triggerJobScan()">Scan Now</button>
          <button type="button" class="career-os-primary-btn" onclick="showPage('job_radar')">View Matches</button>
          <button type="button" class="career-os-link-btn" onclick="careerOsSaveTopRoles()">Save Top Roles</button>
        </div>
      </section>

      <section class="career-os-panel interview-prep-progress card-standard animate-reveal" style="--reveal-index:2">
        <div class="career-os-section-head">
          <div>
            <span class="career-os-kicker">Interview Prep Progress</span>
            <h3>Topic readiness and streak</h3>
          </div>
          <div class="career-os-ring" style="--ring-value:${strength}">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
              <path class="career-os-ring-value" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"></path>
            </svg>
            <strong data-countup="true" data-count-up="${strength}" data-count-target="${strength}" data-count-suffix="%">${strength}%</strong>
          </div>
        </div>
        <div class="career-os-prep-bars">
          ${renderCareerOsPrepBars(prepCategories)}
        </div>
        <div class="career-os-prep-footer">
          <span class="career-os-streak" aria-label="${streakCount} day practice streak">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c-3.2 0-6-2.4-6-6.2 0-2.6 1.5-4.6 3.2-6.5.4 1.5 1.3 2.4 2.5 3.1-.2-3.3 1.1-6.6 3.8-9.4.5 3.1 2.5 4.8 4 7.1.9 1.4 1.5 3 1.5 4.8 0 4.1-3 7.1-9 7.1Z" fill="currentColor"></path></svg>
            <strong data-countup="true" data-count-up="${streakCount}" data-count-target="${streakCount}" data-count-suffix="">${streakCount}</strong>
            <span>day streak</span>
          </span>
          <button type="button" class="career-os-primary-btn" onclick="showPage('ai_interview')">Continue Prep</button>
        </div>
        <div class="career-os-skill-columns">
          <div>
            <span class="career-os-mini-label">Core strengths</span>
            ${firstSkills.length
              ? `<div class="tag-cloud">${firstSkills.map(s => `<span class="tag tag-blue">${componentEscapeHtml(s)}</span>`).join('')}</div>`
              : renderCareerOsEmptyState('No skills imported yet', 'Import your profile to build a real prep map.', 'Import Profile', "document.getElementById('syncCtaCards')?.style.setProperty('display','grid')")}
          </div>
          <div>
            <span class="career-os-mini-label">Skill gaps</span>
            ${firstMissing.length
              ? `<div class="tag-cloud">${firstMissing.map(s => `<span class="tag tag-amber">${componentEscapeHtml(s)}</span>`).join('')}</div>`
              : renderCareerOsEmptyState('No major gaps detected', 'Keep validating this against fresh job scans.', 'Open Tracker', "showPage('study_tracker')")}
          </div>
        </div>`;

  if (certs && certs.length > 0) {
    html += `<div class="career-os-cert-strip">${certs.slice(0, 5).map(c => `<span class="tag tag-gold">${componentEscapeHtml(c)}</span>`).join('')}</div>`;
  }

  html += `</section>

      <section class="career-os-panel action-queue card-standard animate-reveal" style="--reveal-index:3">
        <div class="career-os-section-head">
          <div>
            <span class="career-os-kicker">Action Queue</span>
            <h3>Daily missions</h3>
          </div>
          <span class="career-os-status-pill">${pendingActions} pending</span>
        </div>
        <div class="career-os-action-list">
          ${renderCareerOsActionQueue(actions)}
        </div>
      </section>
    </div>`;

  if (topics.length > 0) {
    html += `<section class="career-os-panel roadmap-queue card-standard animate-reveal" style="--reveal-index:5">
      <div class="career-os-section-head">
        <div>
          <span class="career-os-kicker">Roadmap Queue</span>
          <h3>Recommended next study blocks</h3>
        </div>
      </div>
      <div class="premium-roadmap-grid">`;
    topics.forEach((t, index) => {
      const topicName = extractIndustrialTopicName(t) || 'Career Specialization';
      const rawPriority = (t.priority || 'medium').toLowerCase();
      const topicId = t.topicId || topicName.toLowerCase().replace(/\s+/g, '_');
      html += `<div onclick="showPage('${topicId}')" class="roadmap-topic-card card-compact animate-reveal" style="--reveal-index:${index + 6}" data-priority="${rawPriority}">
        <div class="topic-card-head">
          <span class="topic-name">${componentEscapeHtml(topicName)}</span>
          <span class="priority-badge">${componentEscapeHtml(rawPriority)}</span>
        </div>
        <div class="topic-reason">${componentEscapeHtml(t.reason || t.desc || '')}</div>
        <div class="topic-meta">
          <span class="est-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${t.estimatedHours || 0}h est</span>
          <span class="start-prep">Start Prep <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
        </div>
      </div>`;
    });
    html += `</div></section>`;
  }

  if (profile.studyPlan) {
    html += `<section class="study-plan-block career-os-panel card-standard animate-reveal" style="--reveal-index:6">
      <div class="plan-header">
        <div class="plan-title-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          <span class="plan-title">Dynamic AI Study Roadmap</span>
          <span class="ai-pill">AI</span>
        </div>
      </div>
      <div class="plan-content">${window.marked ? marked.parse(profile.studyPlan) : componentEscapeHtml(profile.studyPlan)}</div>
      <div class="plan-refinement">
        <div class="refine-title">Refine Your Roadmap</div>
        <div class="refine-row">
          <input type="text" id="aiRoadmapTarget" placeholder="e.g. Senior LWC Developer with Data Cloud">
          <button id="btnRegenerateRoadmap" onclick="regenerateAIStudyPlan()" class="btn-primary-sm">Generate New Plan</button>
        </div>
      </div>
    </section>`;
  }

  html += '<div id="premiumRoadmapMount" class="premium-roadmap-mount"><div class="premium-loading">Loading premium roadmap and release focus...</div></div>';
  html += '</div>';
  contentDiv.innerHTML = html;
  hydratePremiumSetupForm(profile);
  bindPremiumPreviewControls();
  applyUiMode(profile.uiMode || currentUiMode || 'modern');
  initDashboardReveal(contentDiv);
  initCountUp(contentDiv);
  
  loadPremiumRoadmap(true).then(data => {
    const mount = document.getElementById('premiumRoadmapMount');
    if (mount && data) {
        mount.innerHTML = renderPremiumRoadmapSection(data) + renderPremiumReleaseFocusSection(data);
    }
  }).catch(err => {
    console.error('[ROADMAP] Mount failure:', err);
    const mount = document.getElementById('premiumRoadmapMount');
    if (mount) mount.innerHTML = '<div class="premium-empty">Roadmap preview is unavailable right now.</div>';
  });
}

function extractIndustrialTopicName(topic) {
  if (typeof topic === 'string') return topic;
  if (topic.name) return topic.name;
  if (topic.topic) return topic.topic;
  if (topic.topicId) {
     return topic.topicId.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Study Topic';
}

function renderPremiumRoadmapSection(data) {
  const roadmap = data.roadmap || {};
  const topics = roadmap.topics || [];
  const designation = data.designation?.label || 'Salesforce Developer';
  const exp = data.experienceYears || 1;

  return `
    <div class="premium-roadmap-shell">
      <div class="premium-roadmap-hero">
        <div>
          <div class="premium-eyebrow">Curated Career Roadmap</div>
          <h3>${roadmap.roadmapName || 'Industry Standard'}</h3>
          <p>Optimized for ${exp} year experience in ${designation}.</p>
        </div>
        ${data.previewMode ? '<span class="premium-badge">Curated Preview</span>' : ''}
      </div>
      <div class="premium-roadmap-grid">
        ${topics.map((t, idx) => `
          <div onclick="showPage('${t.topicId || 'admin'}')" class="roadmap-topic-card" data-priority="${t.priority || 'medium'}">
            <div class="topic-card-head">
              <span class="topic-name">${t.topic || t.name || 'Core Concept'}</span>
              <span class="priority-badge">${t.priority || 'medium'}</span>
            </div>
            <div class="topic-reason">${t.reason || t.desc || 'Essential knowledge for your career path.'}</div>
            <div class="topic-meta">
              <span class="est-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${t.estimatedHours || 6}h est</span>
              <span class="start-prep">Start Prep <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPremiumReleaseFocusSection(data) {
  const focus = data.releaseFocus || {};
  const items = focus.items || [];
  
  if (items.length === 0) return '';

  return `
    <div class="premium-release-focus">
      <div class="premium-eyebrow">Strategic Release Focus</div>
      <h3>${focus.focusTitle || 'Current Market Impact'}</h3>
      <div class="premium-release-grid">
        ${items.map(item => `
          <article class="premium-release-card personalized">
            <span class="premium-release-cat">${item.category}</span>
            <h4>${item.title}</h4>
            <p>${item.whyMatters}</p>
            <div class="premium-release-meta">
              <button onclick="showPage('${item.topicId || 'salesforce_releases'}')" class="btn-ghost-xs">Study Details</button>
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function renderReleaseCenterPage(data) {
  const container = document.getElementById('releaseCenterContent');
  if (!container) return;
  const active = data?.activeRelease || {};
  const personalized = data?.personalizedItems || [];
  const allItems = data?.items || [];
  const exp = data?.experienceYears || 1;
  const designation = data?.designation?.label || 'Salesforce Developer';
  const categories = Array.from(new Set(allItems.map(item => item.category))).filter(Boolean);
  const releaseStudyActions = getCareerIntelligence().buildReleaseStudyActions
    ? getCareerIntelligence().buildReleaseStudyActions(data || {})
    : [];

  container.innerHTML = `
    <div class="premium-release-hero">
      <div>
        <div class="premium-eyebrow">Always-On Release Intelligence</div>
        <h2>${active.releaseName || 'Current Release'}</h2>
        <p>Personalized for ${exp} year experience and ${designation}. Last checked: ${active.lastChecked || 'Not available'}.</p>
      </div>
      <div class="premium-release-source-list">
        ${data?.previewMode ? '<span class="premium-badge">Curated Preview</span>' : ''}
        ${Array.from(new Set(active.sources || [])).slice(0, 1).map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer">Official source</a>`).join('')}
      </div>
    </div>
    <div class="premium-mini-panel" style="margin-bottom:16px;">
      <div class="premium-eyebrow">Your Priority Updates</div>
      <div class="premium-release-grid">
        ${personalized.map(item => renderReleaseCard(item, true)).join('') || '<p class="premium-empty">Complete profile setup to personalize release focus.</p>'}
      </div>
    </div>
    ${renderReleaseStudyActionSection(releaseStudyActions)}
    ${categories.map(category => `
      <section class="premium-release-category">
        <h3>${category}</h3>
        <div class="premium-release-grid">
          ${allItems.filter(item => item.category === category).map(item => renderReleaseCard(item, false)).join('')}
        </div>
      </section>
    `).join('')}
  `;
}

function renderReleaseStudyActionSection(actions) {
  if (!actions || !actions.length) return '';
  return `
    <section class="release-study-actions premium-mini-panel">
      <div class="premium-eyebrow">What To Study From This Release</div>
      <div class="release-study-grid">
        ${actions.map(action => `
          <article class="release-study-card">
            <div class="release-study-card-head">
              <span>${componentEscapeHtml(action.category)}</span>
              <strong>${componentEscapeHtml(action.count || 0)} update${Number(action.count || 0) === 1 ? '' : 's'}</strong>
            </div>
            <h4>${componentEscapeHtml(action.studyTopic || action.category)}</h4>
            <ul>
              ${(action.prompts || []).slice(0, 3).map(prompt => `<li>${componentEscapeHtml(prompt)}</li>`).join('')}
            </ul>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderReleaseCard(item, personalized) {
  const levels = (item.experienceLevels || []).join(', ') || 'all';
  const relevance = personalized
    ? 'High for your selected experience/designation'
    : `Relevant for ${levels} year profiles`;
  return `
    <article class="premium-release-card ${personalized ? 'personalized' : ''}">
      <span class="premium-release-cat">${item.category} · ${item.releaseName}</span>
      <h4>${item.title}</h4>
      <p>${item.whatChanged}</p>
      <div class="premium-release-detail"><strong>Why it matters:</strong> ${item.whyMatters}</div>
      <div class="premium-release-detail"><strong>Interview angle:</strong> ${item.interviewAngle}</div>
      <div class="premium-release-detail"><strong>Relevance:</strong> ${relevance}</div>
      <div class="premium-release-meta">
        <span>Last checked: ${item.lastChecked || 'Not available'}</span>
        <a href="${item.source}" target="_blank" rel="noopener noreferrer">Source</a>
      </div>
      <button onclick="showPage('${item.topicId || 'salesforce_releases'}')">Study topic</button>
    </article>
  `;
}

function renderJobIntelligence(data) {
  const normalizeSkill = item => {
    if (!item) return null;
    if (typeof item === 'string') return { _id: item, count: 1 };
    const name = item._id || item.skill || item.name || item.label;
    if (!name) return null;
    return { _id: String(name), count: Number(item.count || item.total || 1) || 1 };
  };
  const matchedSkills = (data.matched_skills || data.topMatched || []).map(normalizeSkill).filter(Boolean);
  const missingSkills = (data.missing_skills || data.topMissing || []).map(normalizeSkill).filter(Boolean);
  const totalJobs = Number(data.totalJobs || data.total_jobs || data.jobs?.length || 0);
  const sourceLabel = data.source === 'cloud'
    ? 'Cloud job radar'
    : data.source === 'job-radar'
      ? 'Job Radar pipeline'
    : data.source === 'local-cache'
      ? 'Local job radar cache'
      : 'Curated job radar';

  if (matchedSkills.length === 0 && missingSkills.length === 0) {
    return `
      <div style="text-align:center; padding:20px; color:var(--muted); font-size:0.82rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;margin-bottom:10px;opacity:0.4;">
          <circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <div>No job scan data available yet. Run a Global Job Scan to see market intelligence.</div>
        <button type="button" class="premium-secondary-btn" style="margin-top:14px;" onclick="showPage('job_radar')">Open Job Radar</button>
      </div>`;
  }

  let html = '<div style="margin-bottom:20px;">';
  html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;">
    <div style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; font-weight:700;">Market Alignment Heatmap</div>
    <span class="premium-badge">${componentEscapeHtml(sourceLabel)}${totalJobs ? ` · ${totalJobs} jobs` : ''}</span>
  </div>`;
  
  const topSkills = [...matchedSkills.slice(0,4).map(s => ({...s, type: 'match'})), ...missingSkills.slice(0,4).map(s => ({...s, type: 'gap'}))]
    .sort((a, b) => b.count - a.count);
    
  topSkills.forEach(s => {
    const name = s._id || s;
    const count = s.count || 1;
    const isMatch = s.type === 'match';
    const maxCount = topSkills[0]?.count || 10;
    const widthPercent = Math.max(15, Math.min(100, (count / maxCount) * 100));
    
    const barColor = isMatch ? 'linear-gradient(90deg, rgba(16,185,129,0.2), rgba(16,185,129,0.8))' : 'linear-gradient(90deg, rgba(245,158,11,0.2), rgba(245,158,11,0.8))';
    const textColor = isMatch ? '#34d399' : '#fbbf24';
    const icon = isMatch 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>';

    html += `
      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; font-weight:600;">
          <span style="color:${textColor}; display:flex; align-items:center; gap:6px;">${icon} ${componentEscapeHtml(name)}</span>
          <span style="color:var(--muted); font-family:'IBM Plex Mono'; font-size:0.7rem;">${count} Jobs</span>
        </div>
        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
          <div style="height:100%; width:${widthPercent}%; background:${barColor}; border-radius:10px; transition:width 1s ease-in-out;"></div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';

  const topGap = missingSkills[0]?._id || 'specialized skills';
  const topMatch = matchedSkills[0]?._id || 'core competencies';
  html += `<div style="margin-top:16px; padding:12px 16px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.12); border-radius:10px; font-size:0.78rem; color:rgba(255,255,255,0.7); line-height:1.6;">
    <strong style="color:var(--text);">AI Insight:</strong> Your strongest market match is <strong style="color:#10b981;">${componentEscapeHtml(topMatch)}</strong>.
    The highest-impact skill to develop is <strong style="color:#fbbf24;">${componentEscapeHtml(topGap)}</strong> — it appears in ${missingSkills[0]?.count || 'multiple'} job listings you're being matched against.
  </div>`;

  return html;
}

function componentText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function componentEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function componentEscapeAttr(value) {
  return componentEscapeHtml(value).replace(/`/g, '&#96;');
}

function componentEscapeJsArg(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function componentSafeUrl(value) {
  if (!value) return '#';
  try {
    const parsed = new URL(String(value), window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return parsed.href;
  } catch (err) {
    return '#';
  }
}

function componentFormatDate(value) {
  if (!value) return 'Not tracked';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not tracked';
  return date.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function componentList(value) {
  if (Array.isArray(value)) return value.map(item => componentText(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
  return [];
}

function componentProbability(value, score) {
  const prob = String(value || '').toLowerCase();
  if (prob === 'high' || prob === 'medium' || prob === 'stretch') return prob;
  const numericScore = Number(score || 0);
  if (numericScore >= 85) return 'high';
  if (numericScore >= 70) return 'medium';
  return 'stretch';
}

function componentProbLabel(prob) {
  if (prob === 'high') return 'High fit';
  if (prob === 'stretch') return 'Stretch';
  return 'Medium fit';
}

function componentInitials(value) {
  return componentText(value, 'SF')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'SF';
}

function componentScore(value) {
  const score = Math.round(Number(value || 0));
  return Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
}

function componentStatusLabel(status) {
  return {
    todo: 'To Apply',
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected'
  }[componentText(status, 'todo')] || componentText(status, 'To Apply');
}

function componentFindJob(jobId) {
  const target = String(jobId || '');
  return (window.pipelineJobs || []).find(job => String(job.id) === target || String(job.job_hash) === target);
}

function renderJobFlyoutActions(job, idJs, applyUrl) {
  const status = componentText(job.status, 'todo');
  const actions = [];
  if (applyUrl !== '#') actions.push(`<a class="job-flyout-action primary" href="${componentEscapeAttr(applyUrl)}" target="_blank" rel="noopener noreferrer">Open Apply Link</a>`);
  if (status === 'todo') {
    actions.push(`<button type="button" class="job-flyout-action success" onclick="moveTo('${idJs}', 'applied'); closeJobDetailsFlyout();">Mark Applied</button>`);
    actions.push(`<button type="button" class="job-flyout-action danger" onclick="moveTo('${idJs}', 'rejected'); closeJobDetailsFlyout();">Reject</button>`);
  } else if (status === 'applied') {
    actions.push(`<button type="button" class="job-flyout-action primary" onclick="moveTo('${idJs}', 'interview'); closeJobDetailsFlyout();">Move to Interview</button>`);
    actions.push(`<button type="button" class="job-flyout-action secondary" onclick="moveTo('${idJs}', 'todo'); closeJobDetailsFlyout();">Back to Backlog</button>`);
  } else if (status === 'interview') {
    actions.push(`<button type="button" class="job-flyout-action success" onclick="moveTo('${idJs}', 'offer'); closeJobDetailsFlyout();">Offer Received</button>`);
    actions.push(`<button type="button" class="job-flyout-action secondary" onclick="moveTo('${idJs}', 'applied'); closeJobDetailsFlyout();">Back to Applied</button>`);
  } else if (status === 'offer') {
    actions.push(`<button type="button" class="job-flyout-action secondary" onclick="moveTo('${idJs}', 'interview'); closeJobDetailsFlyout();">Back to Interview</button>`);
  } else {
    actions.push(`<button type="button" class="job-flyout-action secondary" onclick="moveTo('${idJs}', 'todo'); closeJobDetailsFlyout();">Reopen</button>`);
  }
  return actions.join('');
}

function renderJobDetailsFlyout(job) {
  const id = componentText(job.id, '');
  const idJs = componentEscapeJsArg(id);
  const company = componentText(job.company, 'Confidential');
  const role = componentText(job.role || job.title, 'Salesforce Role');
  const location = componentText(job.loc || job.location, 'India');
  const experience = componentText(job.experience, '3-5 Yrs');
  const companyType = componentText(job.company_type, 'Company');
  const status = componentText(job.status, 'todo');
  const score = componentScore(job.score || job.match_score || 75);
  const prob = componentProbability(job.prob || job.probability, score);
  const salary = componentText(job.sal || job.salary, 'Not specified');
  const applyUrl = componentSafeUrl(job.url || job.apply_link);
  const matchedSkills = componentList(job.matched_skills?.length ? job.matched_skills : job.skills);
  const gapSkills = componentList(job.missing_skills);
  const resumeActions = componentList(job.resume_actions);
  const notes = componentText(job.notes || job.internal_notes || '');
  const source = componentText(job.source || job.provider || job.origin || 'Job Radar');
  const created = componentFormatDate(job.posted_at || job.postedAt || job.createdAt || job.dateAdded || job.created_at || job.date_added);
  const updated = componentFormatDate(job.last_seen_at || job.updatedAt || job.statusUpdatedAt || job.updated_at);
  const whyApply = componentText(job.why_apply, 'This role is available in your Job Radar pipeline. Add notes or profile data to improve AI fit guidance.');

  const pillList = (items, cls) => items.length
    ? items.map(item => `<span class="${cls}">${componentEscapeHtml(item)}</span>`).join('')
    : '<span class="job-flyout-muted">No data captured yet.</span>';

  return `
    <div class="job-flyout-backdrop" onclick="closeJobDetailsFlyout()"></div>
    <aside class="job-flyout-panel" role="dialog" aria-modal="true" aria-labelledby="jobFlyoutTitle" onclick="event.stopPropagation()">
      <div class="job-flyout-head">
        <div class="job-flyout-company-mark" style="background:${componentEscapeAttr(stringToColor(company))}">${componentEscapeHtml(componentInitials(company))}</div>
        <div class="job-flyout-title-wrap">
          <div class="job-flyout-kicker">${componentEscapeHtml(companyType)} · ${componentEscapeHtml(source)}</div>
          <h2 id="jobFlyoutTitle">${componentEscapeHtml(role)}</h2>
          <div class="job-flyout-company">${componentEscapeHtml(company)}</div>
        </div>
        <button type="button" class="job-flyout-close" onclick="closeJobDetailsFlyout()" aria-label="Close job details">×</button>
      </div>

      <div class="job-flyout-score-row">
        <div class="job-flyout-score" style="--score:${score};"><span>${score}%</span></div>
        <div class="job-flyout-score-copy">
          <span class="prob-badge ${componentEscapeAttr(prob)}">${componentEscapeHtml(componentProbLabel(prob))}</span>
          <span>${componentEscapeHtml(status.toUpperCase())} · Updated ${componentEscapeHtml(timeAgo(job.last_seen_at || job.updatedAt || job.updated_at || job.createdAt || job.dateAdded || job.created_at))}</span>
        </div>
      </div>

      <div class="job-flyout-meta-grid">
        <div><span>Location</span><b>${componentEscapeHtml(location)}</b></div>
        <div><span>Experience</span><b>${componentEscapeHtml(experience)}</b></div>
        <div><span>Salary</span><b>${componentEscapeHtml(salary)}</b></div>
        <div><span>Status</span><b>${componentEscapeHtml(componentStatusLabel(status))}</b></div>
      </div>

      <section class="job-flyout-section">
        <h3>AI Fit Summary</h3>
        <p>${componentEscapeHtml(whyApply)}</p>
      </section>

      <section class="job-flyout-section">
        <h3>Matched Skills</h3>
        <div class="job-flyout-tags">${pillList(matchedSkills, 'skill-tag')}</div>
      </section>

      <section class="job-flyout-section">
        <h3>Skill Gaps</h3>
        <div class="job-flyout-tags">${pillList(gapSkills, 'skill-gap-tag')}</div>
      </section>

      <section class="job-flyout-section">
        <h3>Resume Focus</h3>
        ${resumeActions.length
          ? `<ul class="job-flyout-list">${resumeActions.map(action => `<li>${componentEscapeHtml(action)}</li>`).join('')}</ul>`
          : '<p class="job-flyout-muted">No resume actions captured yet.</p>'}
      </section>

      <section class="job-flyout-section compact">
        <h3>Tracking</h3>
        <div class="job-flyout-timeline">
          <div><span>Created</span><b>${componentEscapeHtml(created)}</b></div>
          <div><span>Updated</span><b>${componentEscapeHtml(updated)}</b></div>
          ${notes ? `<div><span>Notes</span><b>${componentEscapeHtml(notes)}</b></div>` : ''}
        </div>
      </section>

      <div class="job-flyout-actions">
        ${renderJobFlyoutActions(job, idJs, applyUrl)}
      </div>
    </aside>
  `;
}

window.openJobDetailsFlyout = function(jobId) {
  const job = componentFindJob(jobId);
  if (!job) return;
  let flyout = document.getElementById('jobDetailsFlyout');
  if (!flyout) {
    flyout = document.createElement('div');
    flyout.id = 'jobDetailsFlyout';
    flyout.className = 'job-details-flyout';
    document.body.appendChild(flyout);
  }
  flyout.innerHTML = renderJobDetailsFlyout(job);
  flyout.classList.add('open');
  flyout.setAttribute('aria-hidden', 'false');
  document.body.classList.add('job-flyout-open');
  setTimeout(() => flyout.querySelector('.job-flyout-close')?.focus(), 30);
};

window.closeJobDetailsFlyout = function() {
  const flyout = document.getElementById('jobDetailsFlyout');
  if (!flyout) return;
  flyout.classList.remove('open');
  flyout.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('job-flyout-open');
};

window.handleJobCardKey = function(event, jobId) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  window.openJobDetailsFlyout(jobId);
};

if (!window.__jobDetailsFlyoutEscBound) {
  window.__jobDetailsFlyoutEscBound = true;
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.closeJobDetailsFlyout();
  });
}

if (!window.__jobCardDetailsClickBound) {
  window.__jobCardDetailsClickBound = true;
  let pointerStart = null;
  const getDetailsCardFromEvent = event => {
    if (event.target.closest('#job_radar .jcard-actions, #job_radar .jcard-btn, #job_radar a, #job_radar button')) return null;
    return event.target.closest('#job_radar .jcard-v3[data-job-id]');
  };
  document.addEventListener('pointerdown', event => {
    const card = getDetailsCardFromEvent(event);
    pointerStart = card ? { id: card.dataset.jobId, x: event.clientX, y: event.clientY } : null;
  });
  document.addEventListener('pointerup', event => {
    const card = getDetailsCardFromEvent(event);
    if (!card || !pointerStart || pointerStart.id !== card.dataset.jobId) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved <= 8) window.openJobDetailsFlyout(card.dataset.jobId);
  });
  document.addEventListener('click', event => {
    const card = getDetailsCardFromEvent(event);
    if (!card) return;
    window.openJobDetailsFlyout(card.dataset.jobId);
  });
}

function getStoredMobileBoardStage(cols, rows = []) {
  const inMemory = cols.includes(window.currentMobileBoardStage) ? window.currentMobileBoardStage : '';
  const stored = typeof window.getScopedItem === 'function'
    ? window.getScopedItem('jobRadarMobileStage', '')
    : '';
  if (inMemory) return inMemory;
  if (cols.includes(stored)) return stored;
  return rows.find(row => Number(row.count) > 0)?.col || 'todo';
}

function setStoredMobileBoardStage(col) {
  window.currentMobileBoardStage = col;
  if (typeof window.setScopedItem === 'function') {
    window.setScopedItem('jobRadarMobileStage', col);
  }
}

function syncMobileBoardStageNav(cols) {
  const board = document.querySelector('#job_radar .kanban-board-v3');
  if (!board) return;

  renderMobileRadarActionBar(board);

  let nav = document.getElementById('mobileBoardStageNav');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'mobileBoardStageNav';
    nav.className = 'mobile-board-stage-nav';
    board.parentElement?.insertBefore(nav, board);
  }

  const labels = {
    todo: 'Backlog',
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected'
  };
  const rows = cols.map(col => {
    const count = typeof window.getBoardColumnJobs === 'function'
      ? window.getBoardColumnJobs(col).length
      : (document.getElementById(`count-${col}`)?.textContent || '0');
    return { col, label: labels[col] || col, count };
  });
  const current = getStoredMobileBoardStage(cols, rows);
  setStoredMobileBoardStage(current);
  const selected = rows.find(row => row.col === current) || rows[0];

  nav.innerHTML = `
    <label class="mobile-stage-label" for="mobileBoardStageSelect">Status</label>
    <div class="mobile-stage-select-wrap">
      <select id="mobileBoardStageSelect" class="mobile-stage-select" onchange="setMobileBoardStage(this.value)" aria-label="Choose job status">
        ${rows.map(row => `
          <option value="${componentEscapeAttr(row.col)}" ${row.col === current ? 'selected' : ''}>
            ${componentEscapeHtml(row.label)} (${componentEscapeHtml(row.count)})
          </option>
        `).join('')}
      </select>
      <span class="mobile-stage-selected-count" aria-live="polite">${componentEscapeHtml(selected?.count || 0)}</span>
    </div>
  `;

  cols.forEach(col => {
    document.getElementById(`col-${col}`)?.classList.toggle('mobile-stage-active', col === current);
  });
  board.classList.add('mobile-stage-mode');
}

function renderMobileRadarActionBar(board) {
  let bar = document.getElementById('mobileRadarActionBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mobileRadarActionBar';
    bar.className = 'mobile-radar-actionbar';
    board.parentElement?.insertBefore(bar, board);
  }

  const data = buildDailyCockpitData();
  bar.innerHTML = `
    <button type="button" onclick="runMobileRadarAction('apply')"><span>Apply</span><b>${componentEscapeHtml(data.highFit.length || data.fresh.length)}</b></button>
    <button type="button" onclick="runMobileRadarAction('resume')"><span>Resume</span><b>${componentEscapeHtml(data.resumeReady.length)}</b></button>
    <button type="button" onclick="runMobileRadarAction('follow')"><span>Follow</span><b>${componentEscapeHtml(data.followUps.length)}</b></button>
    <button type="button" onclick="runMobileRadarAction('add')"><span>Add</span><b>+</b></button>
  `;
}

window.runMobileRadarAction = function(action) {
  const pickFilterButton = filter => Array.from(document.querySelectorAll('#job_radar .fb'))
    .find(btn => (btn.getAttribute('onclick') || '').includes(`'${filter}'`));

  if (action === 'apply') {
    if (typeof window.setBoardFilter === 'function') window.setBoardFilter('high', pickFilterButton('high'));
    window.setMobileBoardStage?.('todo');
  } else if (action === 'resume') {
    if (typeof window.setBoardFilter === 'function') window.setBoardFilter('all', pickFilterButton('all'));
    window.setMobileBoardStage?.('todo');
    window.showToast?.('Resume-ready roles are highlighted in the cockpit.');
  } else if (action === 'follow') {
    if (typeof window.setBoardFilter === 'function') window.setBoardFilter('all', pickFilterButton('all'));
    window.setMobileBoardStage?.('applied');
  } else if (action === 'add') {
    window.openAddJobModal?.();
  }
};

window.setMobileBoardStage = function(col) {
  const cols = ['todo', 'applied', 'interview', 'offer', 'rejected'];
  setStoredMobileBoardStage(cols.includes(col) ? col : 'todo');
  syncMobileBoardStageNav(['todo', 'applied', 'interview', 'offer', 'rejected']);
  document.querySelector('#job_radar .kanban-board-v3')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

function renderRadarEmptyState(col, message) {
  if (col === 'todo') {
    return renderEmptyState({
      icon: 'briefcase',
      title: 'No saved jobs yet',
      description: 'Start your first scan to find matching Salesforce roles.',
      actionLabel: 'Start Scan',
      actionFn: 'triggerJobScan()'
    });
  }
  const labels = {
    applied: 'No applied roles yet',
    interview: 'No interviews scheduled yet',
    offer: 'No offers tracked yet',
    rejected: 'No archived roles yet'
  };
  return renderEmptyState({
    icon: 'briefcase',
    title: labels[col] || 'No roles here yet',
    description: message || 'Move matching roles here as your pipeline progresses.',
    actionLabel: 'View Radar',
    actionFn: "showPage('job_radar')"
  });
}

function renderBoard() {
  const cols = ['todo', 'applied', 'interview', 'offer', 'rejected'];
  const searchTerm = (document.getElementById("boardSearch")?.value || '').toLowerCase();
  const filter = window.currentBoardFilter || 'all';
  const pageSize = Math.max(1, Number(window.JOB_BOARD_PAGE_SIZE || 6));
  const loadingAge = window.jobRadarLoadingStartedAt
    ? Date.now() - Number(window.jobRadarLoadingStartedAt || 0)
    : 0;

  if (window.jobRadarLoading && loadingAge > 22000) {
    window.jobRadarLoading = false;
    window.jobRadarEmptyMessage = window.jobRadarEmptyMessage || 'Cloud sync is taking longer than expected. Showing cached roles while it recovers.';
    if (window.RadarCloud?.setNotice) {
      window.RadarCloud.setNotice('degraded', 'Showing cached Job Radar data', window.jobRadarEmptyMessage);
    }
  }

  cols.forEach(col => {
    const list = document.getElementById(`list-${col}`);
    const count = document.getElementById(`count-${col}`);
    if (!list) return;

    const filtered = typeof window.getBoardColumnJobs === 'function' ? window.getBoardColumnJobs(col) : (window.pipelineJobs || [])
      .filter(j => componentText(j.status, 'todo') === col)
      .filter(j => filter === 'all' || componentProbability(j.prob || j.probability, j.score) === filter)
      .filter(j => {
        if (!searchTerm) return true;
        const haystack = [
          j.company,
          j.role || j.title,
          j.loc || j.location,
          j.company_type,
          j.why_apply,
          ...componentList(j.matched_skills || j.skills),
          ...componentList(j.missing_skills)
        ].join(' ').toLowerCase();
        return haystack.includes(searchTerm);
      })
      .sort((a, b) => jobRadarDate(b) - jobRadarDate(a));

    if (count) count.textContent = filtered.length;

    const pages = window.radarBoardPages || { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    const page = Math.max(0, Math.min(maxPage, pages[col] || 0));
    window.radarBoardPages = pages;
    window.radarBoardPages[col] = page;
    const start = page * pageSize;
    const displayJobs = filtered.slice(start, start + pageSize);

    const emptyMessage = typeof window.getRadarColumnEmptyMessage === 'function'
      ? window.getRadarColumnEmptyMessage(col)
      : (window.jobRadarEmptyMessage || 'No matching roles in this stage.');

    if (window.jobRadarLoading) {
      list.innerHTML = renderSkeletonCards(Math.floor(Math.random() * 2) + 2); // 2-3 skeleton cards per column
    } else {
      list.innerHTML = displayJobs.length === 0 ? 
        `<div class="radar-empty-state">${renderRadarEmptyState(col, emptyMessage)}</div>` :
        displayJobs.map(job => renderJobCard(job)).join('');
    }
      
    const pager = document.getElementById(`pager-${col}`);
    if (pager) {
      pager.innerHTML = renderPager(filtered.length, page, pageSize, `setBoardPage('${col}', -1)`, `setBoardPage('${col}', 1)`, true);
    }
  });

  // Handle List View (v1415)
  const viewPref = localStorage.getItem('job_radar_view') || 'kanban';
  const listViewContainer = document.getElementById('radar-list-view');
  const kanbanContainer = document.querySelector('.kanban-board-v3');
  
  if (listViewContainer && kanbanContainer) {
    if (viewPref === 'list') {
      kanbanContainer.style.display = 'none';
      listViewContainer.style.display = 'block';
      renderBoardListView(searchTerm, filter);
    } else {
      kanbanContainer.style.display = 'flex';
      listViewContainer.style.display = 'none';
    }
  }

  syncMobileBoardStageNav(cols);
  renderJobRadarCockpit();
}

function renderBoardListView(searchTerm, filter) {
  const tableBody = document.getElementById('list-table-body');
  const pagerTable = document.getElementById('pager-table');
  if (!tableBody) return;

  const pageSize = Math.max(1, Number(window.JOB_BOARD_PAGE_SIZE || 6)) * 2; // Double density for list
  
  const allFiltered = (window.pipelineJobs || [])
    .filter(j => typeof window.jobMatchesBoardFilter === 'function'
      ? window.jobMatchesBoardFilter(j, filter)
      : (filter === 'all' || componentProbability(j.prob || j.probability, j.score) === filter))
    .filter(j => {
      if (!searchTerm) return true;
      const haystack = [
        j.company,
        j.role || j.title,
        j.loc || j.location,
        j.company_type,
        j.why_apply,
        ...componentList(j.matched_skills || j.skills),
        ...componentList(j.missing_skills)
      ].join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((a, b) => jobRadarDate(b) - jobRadarDate(a));

  const pages = window.radarBoardPages || {};
  const maxPage = Math.max(0, Math.ceil(allFiltered.length / pageSize) - 1);
  const page = Math.max(0, Math.min(maxPage, pages['list'] || 0));
  pages['list'] = page;
  window.radarBoardPages = pages;
  
  const start = page * pageSize;
  const displayJobs = allFiltered.slice(start, start + pageSize);

  if (window.jobRadarLoading) {
    tableBody.innerHTML = renderSkeletonList(5);
  } else if (displayJobs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--muted);">${window.jobRadarEmptyMessage || 'No matching roles found.'}</td></tr>`;
  } else {
    tableBody.innerHTML = displayJobs.map(job => renderJobTableRow(job)).join('');
  }

  if (pagerTable) {
    pagerTable.innerHTML = renderPager(allFiltered.length, page, pageSize, `setBoardPage('list', -1)`, `setBoardPage('list', 1)`, true);
  }
}

function renderJobTableRow(job) {
  const status = componentText(job.status, 'todo');
  const statusLabels = {
    todo: '<span style="color:var(--muted)">Backlog</span>',
    applied: '<span style="color:var(--blue)">Applied</span>',
    interview: '<span style="color:var(--amber)">Interview</span>',
    offer: '<span style="color:var(--green)">Offer</span>',
    rejected: '<span style="color:var(--red)">Rejected</span>'
  };
  
  return `
    <tr class="radar-tr" onclick="openJobDetails('${job.id}')" style="cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); transition: background 0.2s;">
      <td style="padding:12px 16px; font-weight:600; color:var(--text);">${componentEscapeHtml(job.company)}</td>
      <td style="padding:12px 16px; color:var(--text);">${componentEscapeHtml(job.role || job.title || 'Role Unspecified')}</td>
      <td style="padding:12px 16px; color:var(--muted); font-size:0.85rem;">${componentEscapeHtml(job.loc || job.location || '--')}</td>
      <td style="padding:12px 16px; color:var(--muted); font-size:0.85rem; font-family:'IBM Plex Mono', monospace;">${componentEscapeHtml(job.sal || job.salary || '--')}</td>
      <td style="padding:12px 16px; font-weight:600; font-size:0.85rem;">${statusLabels[status] || status}</td>
      <td style="padding:12px 16px; color:var(--muted); font-size:0.8rem; font-family:'IBM Plex Mono', monospace;">${timeAgo(new Date(jobRadarDate(job)))}</td>
      <td style="padding:12px 16px; text-align:right;">
        <button class="radar-quiet-btn" onclick="event.stopPropagation(); openJobDetails('${job.id}')" style="padding:4px 8px; font-size:0.75rem;">View</button>
      </td>
    </tr>
  `;
}

function getFollowUpStatus(job) {
  if (componentText(job.status, 'todo') !== 'applied') return null;
  const lastContact = job.lastContact
    ? new Date(job.lastContact)
    : new Date(job.appliedAt || job.dateApplied || job.statusUpdatedAt || job.created_at || job.dateAdded);
  const diffDays = Math.floor((new Date() - lastContact) / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 7) return { label: '7d+ No Response', class: 'ghost' };
  if (diffDays >= 3) return { label: '3d+ Since Contact', class: 'warn' };
  return null;
}

function jobRadarDate(job) {
  const value = job.first_seen_at || job.firstSeenAt || job.date_added || job.dateAdded || job.createdAt || job.created_at || job.posted_at || job.postedAt || job.statusUpdatedAt || job.last_seen_at || job.lastSeenAt || job.updatedAt || job.updated_at || job.appliedAt || job.dateApplied;
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function jobRadarDaysOld(job) {
  const date = jobRadarDate(job);
  if (!date.getTime()) return 999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function isResumeReadyJob(job) {
  return componentText(job.status, 'todo') === 'todo' && componentList(job.resume_actions).length > 0;
}

function isHighFitTodo(job) {
  const status = componentText(job.status, 'todo');
  const score = componentScore(job.score || job.match_score || 75);
  const prob = componentProbability(job.prob || job.probability, score);
  return status === 'todo' && (prob === 'high' || score >= 82);
}

function getJobNextAction(job, followUp) {
  const status = componentText(job.status, 'todo');
  const score = componentScore(job.score || job.match_score || 75);
  const prob = componentProbability(job.prob || job.probability, score);
  const gapCount = componentList(job.missing_skills).length;
  const resumeCount = componentList(job.resume_actions).length;

  if (followUp) {
    return { label: 'Follow up', detail: followUp.label, className: 'due' };
  }
  if (status === 'todo' && (prob === 'high' || score >= 82) && resumeCount === 0) {
    return { label: 'Apply today', detail: 'High fit and ready', className: 'apply' };
  }
  if (status === 'todo' && resumeCount > 0) {
    return { label: 'Tune resume', detail: `${resumeCount} edit${resumeCount === 1 ? '' : 's'}`, className: 'resume' };
  }
  if (status === 'todo' && gapCount > 0) {
    return { label: 'Close gap', detail: `${gapCount} skill${gapCount === 1 ? '' : 's'}`, className: 'review' };
  }
  if (status === 'interview') {
    return { label: 'Prep story', detail: 'Interview active', className: 'interview' };
  }
  if (status === 'offer') {
    return { label: 'Compare offer', detail: 'Decision stage', className: 'offer' };
  }
  if (status === 'rejected') {
    return { label: 'Archived', detail: 'Noise removed', className: 'quiet' };
  }
  return { label: 'Review fit', detail: `${score}% match`, className: 'review' };
}

function getJobSignalNotes(job, matchedSkills, gapSkills, resumeActions) {
  const notes = [];
  if (matchedSkills.length) notes.push(`Strength: ${matchedSkills[0]}`);
  if (gapSkills.length) notes.push(`Gap: ${gapSkills[0]}`);
  if (resumeActions.length) notes.push(`Resume: ${resumeActions[0]}`);
  if (!notes.length && job.why_apply) notes.push(componentText(job.why_apply, '').slice(0, 70));
  return notes.slice(0, 2);
}

function buildProfileFocus(todoJobs) {
  const gapCounts = new Map();
  const resumeCounts = new Map();

  todoJobs.forEach(job => {
    componentList(job.missing_skills).forEach(skill => {
      const key = componentText(skill, '').trim();
      if (key) gapCounts.set(key, (gapCounts.get(key) || 0) + 1);
    });
    componentList(job.resume_actions).forEach(action => {
      const key = componentText(action, '').trim();
      if (key) resumeCounts.set(key, (resumeCounts.get(key) || 0) + 1);
    });
  });

  const topGap = Array.from(gapCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topResume = Array.from(resumeCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  return {
    gap: topGap ? `${topGap[0]} (${topGap[1]})` : 'No repeated gap yet',
    resume: topResume ? topResume[0] : 'Resume actions are clear'
  };
}

function buildDailyCockpitData() {
  const jobs = window.pipelineJobs || [];
  const todoJobs = jobs.filter(job => componentText(job.status, 'todo') === 'todo');
  const highFit = todoJobs.filter(isHighFitTodo).sort((a, b) => componentScore(b.score || b.match_score || 75) - componentScore(a.score || a.match_score || 75));
  const resumeReady = todoJobs.filter(isResumeReadyJob).sort((a, b) => componentList(b.resume_actions).length - componentList(a.resume_actions).length);
  const followUps = jobs.filter(job => getFollowUpStatus(job)).sort((a, b) => jobRadarDate(a) - jobRadarDate(b));
  const needsReview = todoJobs
    .filter(job => !isHighFitTodo(job) || componentList(job.missing_skills).length > 0)
    .sort((a, b) => componentList(b.missing_skills).length - componentList(a.missing_skills).length || componentScore(b.score || b.match_score) - componentScore(a.score || a.match_score));
  const fresh = todoJobs.filter(job => jobRadarDaysOld(job) <= 1).sort((a, b) => jobRadarDate(b) - jobRadarDate(a));
  const suppressed = jobs.filter(job => componentText(job.status, 'todo') === 'rejected').length;

  return {
    highFit,
    resumeReady,
    followUps,
    needsReview,
    fresh,
    suppressed,
    profileFocus: buildProfileFocus(todoJobs),
    totalTodo: todoJobs.length
  };
}

function renderCockpitList(items, emptyText) {
  if (!items.length) return `<div class="cockpit-empty">${componentEscapeHtml(emptyText)}</div>`;
  return items.slice(0, 3).map(job => {
    const id = componentText(job.id, '');
    const idJs = componentEscapeJsArg(id);
    const score = componentScore(job.score || job.match_score || 75);
    const company = componentText(job.company, 'Confidential');
    const role = componentText(job.role || job.title, 'Salesforce Role');
    return `
      <button type="button" class="cockpit-job-row" onclick="openJobDetailsFlyout('${idJs}')">
        <span>
          <b>${componentEscapeHtml(company)}</b>
          <small>${componentEscapeHtml(role)}</small>
        </span>
        <em>${score}%</em>
      </button>
    `;
  }).join('');
}

function getJobFreshnessMeta(job) {
  const intelligence = getCareerIntelligence();
  if (typeof intelligence.getJobFreshness === 'function') return intelligence.getJobFreshness(job);
  const days = typeof jobRadarDaysOld === 'function' ? jobRadarDaysOld(job) : 999;
  if (days === 0) return { label: 'New today', tone: 'new', daysOld: days };
  if (days > 14) return { label: 'Stale', tone: 'stale', daysOld: days };
  return { label: 'Active', tone: 'active', daysOld: days };
}

function renderJobFreshnessBadge(job) {
  const fresh = getJobFreshnessMeta(job);
  return `<span class="freshness-badge ${componentEscapeAttr(fresh.tone || 'active')}" title="${componentEscapeAttr(fresh.reason || '')}">${componentEscapeHtml(fresh.label)}</span>`;
}

function renderJobSourceHealthPanel() {
  const intelligence = getCareerIntelligence();
  if (typeof intelligence.buildJobSourceHealth !== 'function') return '';
  const health = intelligence.buildJobSourceHealth(window.pipelineJobs || [], window.activityLog || []);
  return `
    <div class="job-source-health ${componentEscapeAttr(health.status || 'healthy')}">
      <div class="job-source-health-item">
        <span>Last scan</span>
        <strong>${componentEscapeHtml(health.lastScanLabel || 'Not run yet')}</strong>
      </div>
      <div class="job-source-health-item">
        <span>Added</span>
        <strong>${componentEscapeHtml(health.jobsAdded || 0)}</strong>
      </div>
      <div class="job-source-health-item">
        <span>Refreshed</span>
        <strong>${componentEscapeHtml(health.jobsRefreshed || 0)}</strong>
      </div>
      <div class="job-source-health-item">
        <span>Provider issues</span>
        <strong>${componentEscapeHtml(health.failedProviderCount || 0)}</strong>
      </div>
      <div class="job-source-health-note">${componentEscapeHtml(health.nextScanExpectation || 'Daily scan is ready.')}</div>
    </div>
  `;
}

function renderJobRadarCockpit() {
  const mount = document.getElementById('jobRadarCockpit');
  if (!mount) return;
  const cloudState = window.jobRadarCloudState || {};

  if (!(window.pipelineJobs || []).length && cloudState.status === 'locked') {
    mount.innerHTML = `
      <div class="cockpit-head">
        <div>
          <span class="cockpit-kicker">Private Radar</span>
          <h2>Sign in to load your job command center</h2>
        </div>
        <div class="cockpit-primary-action">
          <span>Status</span>
          <strong>Google sign-in required</strong>
        </div>
      </div>
      <div class="cockpit-empty">${componentEscapeHtml(cloudState.detail || 'Your pipeline is protected and will sync after sign-in.')}</div>
    `;
    return;
  }

  const data = buildDailyCockpitData();
  const firstAction = data.highFit[0] || data.resumeReady[0] || data.followUps[0] || data.fresh[0] || null;
  const firstActionText = firstAction
    ? `${componentText(firstAction.company, 'Confidential')} - ${componentText(firstAction.role || firstAction.title, 'Salesforce Role')}`
    : 'Run a scan or add a custom role to start today.';

  mount.innerHTML = `
    <div class="cockpit-head">
      <div>
        <span class="cockpit-kicker">Daily Cockpit</span>
        <h2>What should you act on today?</h2>
      </div>
      <div class="cockpit-primary-action">
        <span>Next best action</span>
        <strong>${componentEscapeHtml(firstActionText)}</strong>
      </div>
    </div>
    <div class="cockpit-metrics">
      <div class="cockpit-metric high"><b>${data.highFit.length}</b><span>High-fit jobs</span></div>
      <div class="cockpit-metric ready"><b>${data.resumeReady.length}</b><span>Resume ready</span></div>
      <div class="cockpit-metric due"><b>${data.followUps.length}</b><span>Follow-ups due</span></div>
      <div class="cockpit-metric review"><b>${data.needsReview.length}</b><span>Needs review</span></div>
      <div class="cockpit-metric quiet"><b>${data.suppressed}</b><span>Suppressed</span></div>
    </div>
    ${renderJobSourceHealthPanel()}
    <div class="cockpit-profile-note">
      <span>Profile focus</span>
      <strong>${componentEscapeHtml(data.profileFocus.gap)}</strong>
      <em>${componentEscapeHtml(data.profileFocus.resume)}</em>
    </div>
    <div class="cockpit-lanes">
      <section>
        <h3>Apply First</h3>
        ${renderCockpitList(data.highFit.length ? data.highFit : data.fresh, 'No fresh high-fit jobs yet.')}
      </section>
      <section>
        <h3>Resume Pack Ready</h3>
        ${renderCockpitList(data.resumeReady, 'No resume actions captured yet.')}
      </section>
      <section>
        <h3>Follow Up</h3>
        ${renderCockpitList(data.followUps, 'No follow-ups due today.')}
      </section>
    </div>
  `;
}

function renderJobCard(job) {
  const id = componentText(job.id, 'job_' + Math.random().toString(36).slice(2, 10));
  const idAttr = componentEscapeAttr(id);
  const idJs = componentEscapeJsArg(id);
  const company = componentText(job.company, 'Confidential');
  const role = componentText(job.role || job.title, 'Salesforce Role');
  const location = componentText(job.loc || job.location, 'India');
  const experience = componentText(job.experience, '3-5 Yrs');
  const companyType = componentText(job.company_type, 'MNC');
  const status = componentText(job.status, 'todo');
  const score = componentScore(job.score || job.match_score || 75);
  const followUp = getFollowUpStatus(job);
  const matchedSkills = componentList(job.matched_skills?.length ? job.matched_skills : job.skills).slice(0, 3);
  const gapSkills = componentList(job.missing_skills).slice(0, 2);
  const resumeActions = componentList(job.resume_actions).slice(0, 2);
  const prob = componentProbability(job.prob || job.probability, score);
  const applyUrl = componentSafeUrl(job.url || job.apply_link);
  const nextAction = getJobNextAction(job, followUp);
  const signalNotes = getJobSignalNotes(job, matchedSkills, gapSkills, resumeActions);
  
  const actions = [];
  if (status === 'todo') {
    if (applyUrl !== '#') actions.push({ label: 'Apply Now', href: applyUrl, cls: 'primary' });
    actions.push({ label: 'Mark Applied', onClick: `moveTo('${idJs}', 'applied')`, cls: 'success' });
  } else if (status === 'applied') {
    actions.push({ label: 'Schedule Interview', onClick: `moveTo('${idJs}', 'interview')`, cls: 'primary' });
    actions.push({ label: 'No Response', onClick: `moveTo('${idJs}', 'todo')`, cls: 'secondary' });
  } else if (status === 'interview') {
    actions.push({ label: 'Offer Received', onClick: `moveTo('${idJs}', 'offer')`, cls: 'success' });
    actions.push({ label: 'Back to Pipeline', onClick: `moveTo('${idJs}', 'applied')`, cls: 'secondary' });
  } else {
    actions.push({ label: 'Reopen', onClick: `moveTo('${idJs}', 'todo')`, cls: 'secondary' });
  }

  return `
    <div class="jcard-v3" data-job-id="${idAttr}" data-prob="${componentEscapeAttr(prob)}" id="card-${idAttr}" role="button" tabindex="0" aria-label="Open details for ${componentEscapeAttr(role)} at ${componentEscapeAttr(company)}" draggable="true" onclick="openJobDetailsFlyout('${idJs}')" onkeydown="handleJobCardKey(event, '${idJs}')" ondragstart="handleDragStart(event, '${idJs}')" ondragend="handleDragEnd(event)">
      <div class="jcard-top">
        <div class="jcard-company-block">
          <div class="jcard-icon" style="background:${componentEscapeAttr(stringToColor(company))}">${componentEscapeHtml(componentInitials(company))}</div>
          <div class="jcard-company-copy">
             <div class="jcard-company" title="${componentEscapeAttr(company)}">${componentEscapeHtml(company)}</div>
             <div class="jcard-company-type">${componentEscapeHtml(companyType)}</div>
          </div>
        </div>
        <div class="score-chip" style="--score:${score};"><span class="score-chip-value">${score}%</span></div>
      </div>
      
      <div class="jcard-stage-row">
        <span class="prob-badge ${componentEscapeAttr(prob)}">${componentEscapeHtml(componentProbLabel(prob))}</span>
        ${renderJobFreshnessBadge(job)}
        <span class="jcard-age">${componentEscapeHtml(timeAgo(job.last_seen_at || job.posted_at || job.updatedAt || job.updated_at || job.createdAt || job.dateAdded || job.created_at))}</span>
      </div>

      <div class="jcard-intel-row ${componentEscapeAttr(nextAction.className)}">
        <span>${componentEscapeHtml(nextAction.label)}</span>
        <b>${componentEscapeHtml(nextAction.detail)}</b>
      </div>
      
      <div class="jcard-role">${componentEscapeHtml(role)}</div>
      
      <div class="jcard-meta-grid">
         <span class="meta-pill"><b>Loc</b> ${componentEscapeHtml(location)}</span>
         <span class="meta-pill"><b>Exp</b> ${componentEscapeHtml(experience)}</span>
      </div>

      ${followUp && status === 'applied' ? `<div class="followup-inline ${componentEscapeAttr(followUp.class)}">${componentEscapeHtml(followUp.label)}</div>` : ''}

      <div class="jcard-skill-row">
        ${matchedSkills.map(s => `<span class="skill-tag">${componentEscapeHtml(s)}</span>`).join('')}
        ${gapSkills.map(s => `<span class="skill-gap-tag">${componentEscapeHtml(s)}</span>`).join('')}
      </div>

      ${signalNotes.length ? `
      <div class="jcard-signal-row">
        ${signalNotes.map(note => `<span>${componentEscapeHtml(note)}</span>`).join('')}
      </div>` : ''}

      ${job.why_apply ? `
      <div class="jcard-why">
        <strong>AI Fit:</strong> ${componentEscapeHtml(job.why_apply)}
      </div>` : ''}

      ${resumeActions.length ? `
      <div class="jcard-resume">
        <div class="jcard-resume-title">Resume focus</div>
        <ul class="jcard-resume-list">
          ${resumeActions.map(action => `<li>${componentEscapeHtml(action)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <div class="jcard-actions" onclick="event.stopPropagation()">
        ${actions.map(a => a.href 
          ? `<a href="${componentEscapeAttr(a.href)}" target="_blank" rel="noopener noreferrer" class="jcard-btn ${componentEscapeAttr(a.cls)}">${componentEscapeHtml(a.label)}</a>`
          : `<button type="button" class="jcard-btn ${componentEscapeAttr(a.cls)}" onclick="${componentEscapeAttr(a.onClick)}">${componentEscapeHtml(a.label)}</button>`
        ).join('')}
      </div>
    </div>
  `;
}

function renderInsights() {
  const funnel = document.getElementById('funnel-container');
  if (!funnel) return;
  const stages = [
    { label: 'TO APPLY', count: window.pipelineJobs.filter(j => j.status === 'todo').length, color: 'var(--blue)' },
    { label: 'APPLIED', count: window.pipelineJobs.filter(j => j.status === 'applied').length, color: 'var(--green)' },
    { label: 'INTERVIEW', count: window.pipelineJobs.filter(j => j.status === 'interview').length, color: 'var(--amber)' },
    { label: 'OFFER', count: window.pipelineJobs.filter(j => j.status === 'offer').length, color: 'var(--pink)' }
  ];
  const max = Math.max(...stages.map(s => s.count), 1);
  funnel.innerHTML = stages.map(s => `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
      <div style="width:70px; font-size:0.6rem; color:var(--muted); font-weight:800;">${s.label}</div>
      <div style="flex:1; background:rgba(255,255,255,0.03); height:10px; border-radius:5px; overflow:hidden;">
        <div style="background:${s.color}; height:100%; width:${(s.count/max)*100}%; transition:width 1s ease;"></div>
      </div>
      <div style="width:20px; font-size:0.75rem; font-weight:800;">${s.count}</div>
    </div>
  `).join('');
}

function renderDevelopmentUI() {
  const phases = [
    { name: 'Phase 1: Foundation', status: 'completed', desc: 'Core agent logic and environment setup.' },
    { name: 'Phase 2: Job Fetching', status: 'completed', desc: 'LinkedIn & Naukri integration with deduplication.' },
    { name: 'Phase 3: AI Matching', status: 'in-progress', desc: 'Resume tailoring and skill gap analysis.' },
    { name: 'Phase 4: Auto-Apply', status: 'pending', desc: 'One-click application and tracking.' },
    { name: 'Phase 5: Smart Analytics', status: 'pending', desc: 'Market trend reporting and ROI tracking.' }
  ];

  const skillProficiency = [
    { skill: 'Apex & SOQL', value: 92 },
    { skill: 'LWC & Frontend', value: 85 },
    { skill: 'Integration & APIs', value: 78 },
    { skill: 'Data Cloud', value: 65 },
    { skill: 'Agentforce', value: 58 }
  ];

  return `
    <div class="development-view">
      <div class="dev-header">
        <div class="dev-eyebrow">Project Evolution</div>
        <h2>Agent Capabilities & Roadmap</h2>
      </div>
      
      <div class="dev-grid">
        <div class="dev-panel">
          <h3>Skill Proficiency</h3>
          <div class="proficiency-list">
            ${skillProficiency.map(s => `
              <div class="proficiency-item">
                <div class="item-info">
                  <span>${s.skill}</span>
                  <span class="item-val">${s.value}%</span>
                </div>
                <div class="item-bar">
                  <div class="bar-fill" style="width:${s.value}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="dev-panel">
          <h3>Deployment Readiness</h3>
          <div class="readiness-list">
            ${phases.map(p => `
              <div class="readiness-item ${p.status}">
                <div class="item-dot">
                  ${p.status === 'completed' ? '✓' : p.status === 'in-progress' ? '▶' : '○'}
                </div>
                <div class="item-content">
                  <div class="item-name">${p.name}</div>
                  <div class="item-desc">${p.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="dev-panel vercel-health-panel">
          <div class="vercel-health-head">
            <h3>Vercel Health</h3>
            <button type="button" class="radar-inline-btn" onclick="renderVercelHealthPanel()">Refresh</button>
          </div>
          <div id="vercelHealthPanel" class="vercel-health-body">
            <div class="cockpit-empty">Checking deployment configuration...</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDevelopment() {
  const container = document.getElementById('radar-development-view');
  if (!container) return;
  container.innerHTML = renderDevelopmentUI();
  renderVercelHealthPanel();
}

async function renderVercelHealthPanel() {
  const mount = document.getElementById('vercelHealthPanel');
  if (!mount) return;
  mount.innerHTML = '<div class="cockpit-empty">Checking deployment configuration...</div>';
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`health ${response.status}`);
    const data = await response.json();
    const entries = data.dependencies
      ? Object.entries(data.dependencies).map(([name, detail]) => [
          name,
          detail.status === 'ready' || detail.status === 'connected' || detail.status === 'configured'
        ])
      : Object.entries(data.env || {});
    mount.innerHTML = `
      <div class="vercel-health-status ${data.ready && !data.degraded ? 'ready' : 'warn'}">
        <span>${data.ready ? (data.degraded ? 'Degraded' : 'Ready') : 'Needs attention'}</span>
        <b>${componentEscapeHtml(data.runtime || 'runtime')}</b>
      </div>
      <div class="vercel-health-grid">
        ${entries.map(([name, ok]) => `
          <span class="${ok ? 'ok' : 'missing'}">
            <b>${componentEscapeHtml(name)}</b>
            <em>${ok ? 'set' : 'missing'}</em>
          </span>
        `).join('')}
      </div>
      <div class="cp-subtle" style="margin-top:10px;">Mongo connection: ${data.mongoConnected ? 'connected' : 'not connected here'}</div>
      ${Array.isArray(data.missingRecommendedCloud) && data.missingRecommendedCloud.length
        ? `<div class="cp-subtle" style="margin-top:6px;">Recommended cloud envs: ${componentEscapeHtml(data.missingRecommendedCloud.join(', '))}</div>`
        : ''}
    `;
  } catch (err) {
    mount.innerHTML = '<div class="cockpit-empty">Health check is unavailable on this server.</div>';
  }
}

function renderRevisionAlerts() {
  const container = document.getElementById('revisionAlerts');
  if (!container) return;
  const today = new Date();
  const due = Object.entries(window.userRetention || {}).filter(([id, s]) => new Date(s.nextReview) <= today);
  if (due.length === 0) {
    container.innerHTML = '';
    return;
  }
  let html = `<div class="premium-eyebrow" style="color:var(--purple); margin-bottom:10px;">RECOMMENDED REVISIONS</div>`;
  due.forEach(([id, s]) => {
    const name = (window.topicConfig && window.topicConfig[id]) ? window.topicConfig[id].name : id;
    html += `
      <div onclick="showPage('${id}')" style="background:rgba(167,139,250,0.08); border:1px solid rgba(167,139,250,0.2); border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; transition:all 0.2s;">
        <div style="font-size:0.8rem; font-weight:600; color:var(--text);">${name}</div>
        <div style="font-size:0.65rem; color:var(--purple); font-family:'IBM Plex Mono',monospace;">Due Now</div>
      </div>`;
  });
  container.innerHTML = html;
}

function renderLog() {
  const body = document.getElementById('logBody');
  if (!body) return;
  if (typeof isJobRadarActive === 'function' && !isJobRadarActive()) {
    const panel = document.getElementById('logPanel');
    if (panel) {
      panel.classList.remove('open');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
    return;
  }
  const log = window.activityLog || [];
  const pageSize = window.LOG_PAGE_SIZE || 10;
  const page = window.activityLogPage || 0;
  const start = page * pageSize;
  const pageItems = log.slice(start, start + pageSize);

  if (!pageItems.length) {
    body.innerHTML = '<div style="color:var(--muted); font-size:0.78rem; padding:10px 0;">No activity yet.</div>';
    return;
  }

  body.innerHTML = pageItems.map(item => `
    <div class="log-entry">
      <div class="log-entry-meta">
        <span>${new Date(item.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        <span style="color:${item.type==='success'?'var(--green)':item.type==='ai'?'var(--blue)':'var(--muted)'}">${(item.type || 'info').toUpperCase()}</span>
      </div>
      <div class="log-entry-text">${componentEscapeHtml(item.text || '')}</div>
    </div>
  `).join('') + renderPager(log.length, page, pageSize, 'setLogPage(-1)', 'setLogPage(1)');
}

function renderPager(total, current, size, prevCmd, nextCmd, forceOrMini = false) {
  const safeSize = Math.max(1, Number(size || 1));
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / safeSize));
  const max = totalPages - 1;
  const safeCurrent = Math.max(0, Math.min(max, Number(current || 0)));
  if (!forceOrMini && max <= 0) return '';
  const start = total > 0 ? safeCurrent * safeSize + 1 : 0;
  const end = Math.min(Number(total || 0), (safeCurrent + 1) * safeSize);
  return `
    <div class="industrial-pager ${forceOrMini ? 'mini kanban-board-pager' : ''}">
      <button type="button" onclick="${prevCmd}" ${safeCurrent === 0 ? 'disabled' : ''} class="pager-btn" aria-label="Previous page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span class="pager-btn-text">Prev</span>
      </button>
      <span class="pager-info">
        <span class="pager-page">${safeCurrent + 1} / ${totalPages}</span>
        <span class="pager-total">${start}-${end} of ${total}</span>
      </span>
      <button type="button" onclick="${nextCmd}" ${safeCurrent >= max ? 'disabled' : ''} class="pager-btn" aria-label="Next page">
        <span class="pager-btn-text">Next</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  `;
}
