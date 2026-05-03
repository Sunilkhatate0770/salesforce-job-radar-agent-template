/**
 * 🧱 INDUSTRIAL COMPONENT REGISTRY (v1412)
 * ---------------------------------------
 * This file contains all UI template logic. 
 * Decoupling presentation from logic allows for better performance 
 * and a modular "Generic Solution" architecture.
 */

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

function renderProfileMatchPage(profile) {
  const contentDiv = document.getElementById('profileMatchContent');
  const syncCta = document.getElementById('syncCtaCards');
  const sourceHeading = document.getElementById('profileSourceHeading');
  const loadingEl = document.getElementById('profileMatchLoading');
  if (!contentDiv) return;

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
  const strength = updateProfileStrengthMeter(skills.length, missing.length, profile);

  let syncBadges = '';
  if (platforms.linkedin && platforms.linkedin.synced) {
    syncBadges += '<span class="badge badge-linkedin">LinkedIn Synced</span> ';
  }
  if (platforms.naukri && platforms.naukri.synced) {
    syncBadges += '<span class="badge badge-naukri">Naukri Synced</span>';
  }

  let html = `<div class="content-card unified-career-intelligence">
    <div class="career-summary-card">
      <div class="card-icon-bg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"></path><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"></path></svg>
      </div>
      <div class="card-header-row">
        <div>
          <div class="eyebrow">CAREER PROFILE SUMMARY</div>
          <div class="headline-sm">Career Readiness: ${strength > 80 ? 'Exceptional' : strength > 50 ? 'Strong' : 'Developing'}</div>
        </div>
        <button onclick="document.getElementById('syncCtaCards').style.display='grid';document.getElementById('profileSourceHeading').style.display='flex'" class="btn-ghost-sm">Update Profile</button>
      </div>
      <p class="card-desc">
        Your profile successfully aggregates data from <b>${Object.values(platforms || {}).filter(p => p.synced).length}</b> platforms. 
        We have identified <b>${skills.length} core competencies</b> and <b>${missing.length} strategic gaps</b>. 
      </p>
    </div>

    <div class="profile-grid profile-metrics-grid">
      <div class="metric-card">
        <div class="progress-ring">
          <svg viewBox="0 0 36 36"><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="3" /><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--blue)" stroke-width="3" stroke-dasharray="${strength}, 100" /></svg>
          <div class="progress-val">${strength}%</div>
        </div>
        <div>
          <div class="card-title-sm">Ready for ${profile.targetRole || 'Salesforce Developer'}</div>
          <div class="card-sub-xs">Target Achievement</div>
        </div>
      </div>
      
      <div class="metric-card jc-sb">
        <div class="min-w-0">
          <div class="card-title-lg truncate">${profile.currentRole || 'Salesforce Professional'}</div>
          <div class="card-sub-sm">${profile.experienceYears || 0} Years Exp &bull; ${certs.length} Certs</div>
        </div>
        <div class="badge-stack">
          ${syncBadges}
        </div>
      </div>
    </div>`;

  if (certs && certs.length > 0) {
    html += `<div class="section-block">
      <div class="section-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#facc15;"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg> Achievements & Certifications</div>
      <div class="tag-cloud">${certs.map(c => `<span class="tag tag-gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> ${c}</span>`).join('')}</div>
    </div>`;
  }

  html += `<div class="section-block">
    <div class="section-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--pink);"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.04-2.44V7.5A2.5 2.5 0 0 1 7.5 5h2z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.04-2.44V7.5A2.5 2.5 0 0 0 16.5 5h-2z"></path></svg> Your Skills (${skills.length})</div>
    <div class="tag-cloud">${skills.map(s => `<span class="tag tag-blue">${s}</span>`).join('')}</div>
  </div>`;

  if (missing.length > 0) {
    html += `<div class="section-block">
      <div class="section-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--amber);"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg> Identified Skill Gaps (${missing.length})</div>
      <div class="tag-cloud">${missing.map(s => `<span class="tag tag-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"></polyline></svg> ${s}</span>`).join('')}</div>
    </div>`;
  }

  if (topics.length > 0) {
    html += `<div class="section-block">
      <div class="section-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--blue);"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 20H20v2H6.5A2.5 2.5 0 0 1 4 17.5v-15A2.5 2.5 0 0 1 6.5 0z"></path></svg> AI Recommended Study Topics</div>
      <div class="universal-grid">`;
    topics.forEach(t => {
      const topicName = extractIndustrialTopicName(t) || 'Career Specialization';
      const rawPriority = (t.priority || 'medium').toLowerCase();
      const topicId = t.topicId || topicName.toLowerCase().replace(/\s+/g, '_');
      html += `<div onclick="showPage('${topicId}')" class="roadmap-topic-card" data-priority="${rawPriority}">
        <div class="topic-card-head">
          <span class="topic-name">${topicName}</span>
          <span class="priority-badge">${rawPriority}</span>
        </div>
        <div class="topic-reason">${t.reason || t.desc || ''}</div>
        <div class="topic-meta">
          <span class="est-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${t.estimatedHours || 0}h est</span>
          <span class="start-prep">Start Prep <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }

  if (profile.studyPlan) {
    html += `<div class="study-plan-block">
      <div class="plan-header">
        <div class="plan-title-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          <span class="plan-title">Dynamic AI Study Roadmap</span>
          <span class="ai-pill">AI</span>
        </div>
      </div>
      <div class="plan-content">${window.marked ? marked.parse(profile.studyPlan) : profile.studyPlan}</div>
      <div class="plan-refinement">
        <div class="refine-title">🎯 Refine Your Roadmap</div>
        <div class="refine-row">
          <input type="text" id="aiRoadmapTarget" placeholder="e.g. Senior LWC Developer with Data Cloud">
          <button id="btnRegenerateRoadmap" onclick="regenerateAIStudyPlan()" class="btn-primary-sm">Generate New Plan</button>
        </div>
      </div>
    </div>`;
  }

  html += '<div id="premiumRoadmapMount" class="premium-roadmap-mount"><div class="premium-loading">Loading premium roadmap and release focus...</div></div>';
  html += '</div>';
  contentDiv.innerHTML = html;
  hydratePremiumSetupForm(profile);
  bindPremiumPreviewControls();
  applyUiMode(profile.uiMode || currentUiMode || 'modern');
  
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

  container.innerHTML = `
    <div class="premium-release-hero">
      <div>
        <div class="premium-eyebrow">Always-On Release Intelligence</div>
        <h2>${active.releaseName || 'Current Release'}</h2>
        <p>Personalized for ${exp} year experience and ${designation}. Last checked: ${active.lastChecked || 'Not available'}.</p>
      </div>
      <div class="premium-release-source-list">
        ${data?.previewMode ? '<span class="premium-badge">Curated Preview</span>' : ''}
        ${(active.sources || []).map(url => `<a href="${url}" target="_blank" rel="noopener noreferrer">Official source</a>`).join('')}
      </div>
    </div>
    <div class="premium-mini-panel" style="margin-bottom:16px;">
      <div class="premium-eyebrow">Your Priority Updates</div>
      <div class="premium-release-grid">
        ${personalized.map(item => renderReleaseCard(item, true)).join('') || '<p class="premium-empty">Complete profile setup to personalize release focus.</p>'}
      </div>
    </div>
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
  const matchedSkills = data.matched_skills || [];
  const missingSkills = data.missing_skills || [];

  if (matchedSkills.length === 0 && missingSkills.length === 0) {
    return `
      <div style="text-align:center; padding:20px; color:var(--muted); font-size:0.82rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;margin-bottom:10px;opacity:0.4;">
          <circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <div>No job scan data available yet. Run a Global Job Scan to see market intelligence.</div>
      </div>`;
  }

  let html = '<div style="margin-bottom:20px;">';
  html += '<div style="font-size:0.75rem; color:var(--muted); margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Market Alignment Heatmap</div>';
  
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
          <span style="color:${textColor}; display:flex; align-items:center; gap:6px;">${icon} ${name}</span>
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
    <strong style="color:var(--text);">AI Insight:</strong> Your strongest market match is <strong style="color:#10b981;">${topMatch}</strong>.
    The highest-impact skill to develop is <strong style="color:#fbbf24;">${topGap}</strong> — it appears in ${missingSkills[0]?.count || 'multiple'} job listings you're being matched against.
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
        <div><span>Status</span><b>${componentEscapeHtml(status)}</b></div>
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
  const current = cols.includes(window.currentMobileBoardStage) ? window.currentMobileBoardStage : 'todo';
  window.currentMobileBoardStage = current;

  const rows = cols.map(col => {
    const count = typeof window.getBoardColumnJobs === 'function'
      ? window.getBoardColumnJobs(col).length
      : (document.getElementById(`count-${col}`)?.textContent || '0');
    return { col, label: labels[col] || col, count };
  });
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
      <span class="mobile-stage-selected-count">${componentEscapeHtml(selected?.count || 0)}</span>
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
  window.currentMobileBoardStage = col || 'todo';
  syncMobileBoardStageNav(['todo', 'applied', 'interview', 'offer', 'rejected']);
  document.querySelector('#job_radar .kanban-board-v3')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

function renderBoard() {
  const cols = ['todo', 'applied', 'interview', 'offer', 'rejected'];
  const searchTerm = (document.getElementById("boardSearch")?.value || '').toLowerCase();
  const filter = window.currentBoardFilter || 'all';
  const pageSize = Math.max(1, Number(window.JOB_BOARD_PAGE_SIZE || 6));

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

    list.innerHTML = displayJobs.length === 0 ? 
      `<div class="radar-empty-state">${componentEscapeHtml(emptyMessage)}</div>` :
      displayJobs.map(job => renderJobCard(job)).join('');
      
    const pager = document.getElementById(`pager-${col}`);
    if (pager) {
      pager.innerHTML = renderPager(filtered.length, page, pageSize, `setBoardPage('${col}', -1)`, `setBoardPage('${col}', 1)`, true);
    }
  });

  syncMobileBoardStageNav(cols);
  renderJobRadarCockpit();
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
  const value = job.last_seen_at || job.posted_at || job.postedAt || job.updatedAt || job.updated_at || job.createdAt || job.dateAdded || job.created_at || job.date_added || job.appliedAt || job.dateApplied;
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
      <div class="log-entry-text">${item.text}</div>
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
      <button onclick="${prevCmd}" ${safeCurrent === 0 ? 'disabled' : ''} class="pager-btn" aria-label="Previous page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span class="pager-btn-text">Prev</span>
      </button>
      <span class="pager-info">
        <span class="pager-page">${safeCurrent + 1} / ${totalPages}</span>
        <span class="pager-total">${start}-${end} of ${total}</span>
      </span>
      <button onclick="${nextCmd}" ${safeCurrent >= max ? 'disabled' : ''} class="pager-btn" aria-label="Next page">
        <span class="pager-btn-text">Next</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  `;
}
