// =============================================
// STUDY TIME TRACKER - with Pause/Play
// =============================================
var TRACKER_KEY = 'sf_prep_study_tracker_v3';
var currentTrackedPage = null;
var trackingStartTime = null;
var trackingInterval = null;
var isPaused = false;
var pausedElapsed = 0;
var floatingTimerInterval = null;

// ALL topic IDs mapped - no duplicates
var topicConfig = {
  // Daily Plan (No timers needed here)
  'schedule': { name: 'Daily Schedule', recommended: 15, group: 'General', noTimer: true },
  'job_radar': { name: 'Job Radar Dashboard', recommended: 30, group: 'General', noTimer: true },
  'study_tracker': { name: 'Progress Tracker', recommended: 30, group: 'General', noTimer: true },
  'study_history': { name: 'Study History', recommended: 0, group: 'General', noTimer: true },
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
  'company_interviews': { name: 'Arago & Morgan Stanley', recommended: 60, group: 'Company' },
  'company_iq': { name: 'Company Model Answers', recommended: 60, group: 'Company' },
  'mobigic_pwc': { name: 'Mobigic / PWC', recommended: 45, group: 'Company' },
  'thenken_globus': { name: 'Thenken Globus', recommended: 45, group: 'Company' },
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
  'fde_cheat': { name: 'FDE Cheat Sheet', recommended: 30, group: 'FDE Prep' }
};

// =============================================
// DATA LAYER (Server-side API)
// =============================================
async function getStudyData() {
  try {
    const [historyRes, tasksRes] = await Promise.all([
      fetch('/api/summary/all'),
      fetch('/api/study/tasks')
    ]);
    const histories = await historyRes.json();
    const { completedTasks } = await tasksRes.json();
    
    const topics = {};
    const sessions = [];
    Object.values(histories).forEach(h => {
      if (h.study && h.study.topicBreakdown) {
         Object.keys(h.study.topicBreakdown).forEach(tid => {
           if (!topics[tid]) topics[tid] = { totalSeconds: 0, sessions: 0, lastStudied: null };
           topics[tid].totalSeconds += h.study.topicBreakdown[tid].totalSeconds;
           topics[tid].sessions += h.study.topicBreakdown[tid].sessions || 1;
         });
      }
    });
    
    return { topics, sessions, completedTasks };
  } catch(e) { 
    console.error('[Cloud] Sync Error:', e);
    return { topics: {}, sessions: [], completedTasks: [] }; 
  }
}

async function saveSession(session) {
  try {
    await fetch('/api/study/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
  } catch(e) { console.error('Failed to save session', e); }
}

async function toggleTask(index) {
  try {
    const res = await fetch('/api/study/toggle-task', {
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
  const localBase = parseInt(localStorage.getItem('timer_' + pageId) || '0');
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
  
  // AUTO-OPEN LAST QUESTION
  restoreLastQuestion(pageId);
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  if (activeEl) activeEl.textContent = topicConfig[pageId].name;
  if (lightEl) lightEl.style.display = 'inline-block';
}

function restoreLastQuestion(pageId) {
  const lastQ = localStorage.getItem('last_q_' + pageId);
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
  localStorage.setItem('timer_' + currentTrackedPage, total);

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
  
  currentTrackedPage = null;
  trackingStartTime = null;
  isPaused = false;
  pausedElapsed = 0;
  
  var activeEl = document.getElementById('currentlyStudying');
  var lightEl = document.getElementById('activeLight');
  var timerEl = document.getElementById('floatingTimer');
  if (activeEl) activeEl.textContent = '—';
  if (lightEl) lightEl.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
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
  
  if (isPaused) {
    // Resume
    isPaused = false;
    trackingStartTime = Date.now();
    if (btn) { btn.textContent = '⏸'; btn.className = 'ft-btn playing'; btn.title = 'Pause study timer'; }
    if (dot) dot.className = 'ft-dot';
    startFloatingTimerInterval();
  } else {
    // Pause
    pausedElapsed += Math.floor((Date.now() - trackingStartTime) / 1000);
    isPaused = true;
    if (btn) { btn.textContent = '▶'; btn.className = 'ft-btn paused'; btn.title = 'Resume study timer'; }
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
    // Real-time UI refresh every 5 seconds if on tracker or history page
    const isTrackerVisible = document.getElementById('study_tracker').style.display !== 'none';
    const isHistoryVisible = document.getElementById('study_history').style.display !== 'none';
    
    if ((isTrackerVisible || isHistoryVisible) && Math.floor(Date.now()/1000) % 5 === 0) {
      if (isTrackerVisible) updateTrackerUI();
      if (isHistoryVisible) renderHistory();
    }
  }, 1000);
}

async function updateCourseTargets() {
  try {
    const res = await fetch('/api/study/data');
    const data = await res.json();
    
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

function formatTimeFull(totalSeconds) {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
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
    suggestions.push({ icon:'🔴', text:'<b>Start FDE topics immediately!</b> <b>'+fdeTopic.length+' FDE topics</b> not started: '+fdeTopic.slice(0,3).map(function(t){return t.name}).join(', ')+(fdeTopic.length>3?'...':'')+'. Critical for your interview.', priority:'HIGH', cls:'priority-high' });
  }
  var nonFde = untouched.filter(function(t){ return t.group !== 'FDE Prep'; });
  if (nonFde.length > 0) {
    suggestions.push({ icon:'🟠', text:'<b>'+nonFde.length+' topics not started:</b> '+nonFde.slice(0,4).map(function(t){return t.name}).join(', ')+(nonFde.length>4?'...':'')+'.', priority:'MEDIUM', cls:'priority-medium' });
  }
  if (needsWork.length > 0) {
    var low = needsWork.sort(function(a,b){return a.pct-b.pct}).slice(0,3);
    suggestions.push({ icon:'📖', text:'<b>Revisit these:</b> '+low.map(function(t){return t.name+' ('+Math.round(t.spent)+'/'+t.recommended+'m)'}).join(', '), priority:'MEDIUM', cls:'priority-medium' });
  }
  if (inProgress.length > 0) {
    suggestions.push({ icon:'✅', text:'<b>Almost there!</b> '+inProgress.map(function(t){return t.name+' ('+Math.round(t.pct)+'%)'}).join(', ')+'. Few more sessions needed.', priority:'LOW', cls:'priority-low' });
  }
  var ts = 0;
  Object.keys(data.topics).forEach(function(k){ ts += data.topics[k].totalSeconds || 0; });
  var th = ts / 3600;
  if (th < 5) suggestions.push({ icon:'⏰', text:'<b>'+Math.round(th*10)/10+' hours total.</b> Aim for 30+ hours.', priority:'HIGH', cls:'priority-high' });
  else if (th < 20) suggestions.push({ icon:'📊', text:'<b>Great!</b> '+Math.round(th*10)/10+' hours. Keep going!', priority:'LOW', cls:'priority-low' });
  else suggestions.push({ icon:'🏆', text:'<b>Outstanding! '+Math.round(th*10)/10+'h logged.</b> Focus on weakest areas now.', priority:'LOW', cls:'priority-low' });
  if (!suggestions.length) suggestions.push({ icon:'🎯', text:'<b>Start studying!</b> Open any topic to begin.', priority:'MEDIUM', cls:'priority-medium' });
  return suggestions;
}

async function fetchDailySummary() {
  const card = document.getElementById('dailyInsightCard');
  const content = document.getElementById('summaryContent');
  const dateEl = document.getElementById('summaryDate');
  if (!card || !content) return;

  try {
    const response = await fetch('/api/summary/daily');
    const summary = await response.json();
    
    if (summary) {
      card.style.display = 'block';
      dateEl.textContent = summary.date;
      
      const studyHrs = (summary.study.totalSeconds / 3600).toFixed(1);
      const jobsCount = summary.jobs.newCount;
      const topJob = summary.jobs.topMatches[0] ? summary.jobs.topMatches[0].title : 'Searching...';
      
      content.innerHTML = `
        🚀 You've studied for <b>${studyHrs} hours</b> today, focusing primarily on <b>${summary.study.topTopic}</b>.
        <br>📡 The Job Radar discovered <b>${jobsCount} new opportunities</b> today. 
        ${summary.jobs.topMatches.length > 0 ? `<br>⭐ Top Match: <b>${topJob}</b>` : ''}
        <br><span style="color:var(--green); font-size:0.7rem; margin-top:5px; display:inline-block;">✓ Daily state synced to cloud database</span>
      `;
    }
  } catch (e) { console.error('Failed to fetch summary', e); }
}

let currentHistoryTab = 'timeline';

function switchHistoryTab(mode) {
  currentHistoryTab = mode;
  document.querySelectorAll('.history-tab').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(mode)) btn.classList.add('active');
  });
  renderHistory();
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

  try {
    const viewMode = currentHistoryTab;
    const response = await fetch('/api/summary/all?cache_bust=' + Date.now());
    const histories = await response.json();
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const yest = new Date(); yest.setDate(now.getDate() - 1);
    const yestStr = yest.getFullYear() + '-' + String(yest.getMonth()+1).padStart(2,'0') + '-' + String(yest.getDate()).padStart(2,'0');

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
        console.log('[Sync] Repairing topicList for:', date);
        const breakdown = h.study.breakdown || h.study.topicBreakdown || {};
        h.study.topicList = Object.keys(breakdown).map(k => ({
          id: k,
          name: breakdown[k].name || k,
          totalSeconds: breakdown[k].totalSeconds || 0
        }));
      }
    });

    // CRITICAL: Update global cache
    cachedHistories = histories;

    const filter = document.getElementById('historyPeriodFilter') ? document.getElementById('historyPeriodFilter').value : 'current_month';
    let dates = Object.keys(histories).sort().reverse();

    if (filter === 'today') dates = dates.filter(d => d === todayStr);
    else if (filter === 'yesterday') dates = dates.filter(d => d === yestStr);
    else if (filter === 'current_month') {
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

    if (viewMode === 'timeline') {
      renderTimelineView(container, dates, histories, todayStr, yestStr);
    } else if (viewMode === 'table') {
      renderTableView(container, dates, histories);
    } else if (viewMode === 'analytics') {
      renderAnalyticsView(container, dates, histories);
    }

    // Update Stats
    const totalEl = document.getElementById('historyTotalTime');
    const countEl = document.getElementById('historyDayCount');
    const avgEl = document.getElementById('historyAvgTime');
    if (totalEl) totalEl.textContent = formatTimeFull(totalSecs);
    if (countEl) countEl.textContent = dayCount;
    if (avgEl) avgEl.textContent = formatTimeFull(dayCount > 0 ? totalSecs/dayCount : 0);

  } catch (e) { console.error('History Render Error:', e); }
}

function renderTimelineView(container, dates, histories, todayStr, yestStr) {
  let html = '<div style="display:flex; flex-direction:column; gap:15px; margin-top:1rem;">';
  dates.forEach((date, idx) => {
    const h = histories[date];
    const isToday = (date === todayStr);
    const isYesterday = (date === yestStr);
    const jobsCount = h.jobs ? h.jobs.newCount : 0;
    const breakdown = h.study.breakdown || {};
    const topicIds = h.study.topics || [];
    const previewIds = topicIds.slice(0, 3);
    
    const colors = ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const accent = isToday ? '#10b981' : colors[idx % colors.length];

    html += `
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:1.2rem; position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; height:100%; width:4px; background:${accent};"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="font-size:0.75rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${isToday ? 'Today' : (isYesterday ? 'Yesterday' : date)}</div>
            <div style="font-size:1.3rem; font-weight:700; color:var(--text); font-family:'IBM Plex Mono';">${formatTime(h.study.totalSeconds)}</div>
          </div>
          <button onclick="showHistoryModal('${date}')" style="background:${accent}22; color:${accent}; border:1px solid ${accent}44; padding:8px 15px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; transition:0.2s;">🔍 View Deep Info</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${previewIds.length > 0 ? previewIds.map(tid => {
            const name = (breakdown[tid] ? breakdown[tid].name : (topicConfig[tid] ? topicConfig[tid].name : tid));
            return `<span style="font-size:0.65rem; background:rgba(255,255,255,0.05); color:var(--muted); padding:3px 10px; border-radius:12px;">📚 ${name}</span>`;
          }).join('') : '<span style="font-size:0.65rem; color:var(--muted); font-style:italic;">No topics logged</span>'}
          ${topicIds.length > 3 ? `<span style="font-size:0.65rem; color:var(--blue); padding:3px 0;">+${topicIds.length - 3} more</span>` : ''}
        </div>
        
        <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
           <div style="display:flex; gap:10px; align-items:center;">
             <span style="font-size:0.7rem; background:rgba(79,142,247,0.1); color:var(--blue); padding:3px 10px; border-radius:20px;">📡 Radar Active</span>
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
async function updateTrackerUI() {
  const data = await getStudyData();
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
      🚀 <b>Real-time Update:</b> You've studied for <b>${studyHrs} hours</b> today.
      ${currentTrackedPage ? `<br>⏱ Currently focusing on: <b style="color:var(--green);">${activeTopic}</b>` : ''}
      <br><span style="color:var(--blue); font-size:0.7rem; margin-top:5px; display:inline-block;">📡 Live cloud-syncing active...</span>
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
      var active = currentTrackedPage===id ? ' <span style="color:var(--green);font-size:0.6rem;">● LIVE</span>' : '';
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
      gridHtml += '<div class="tracker-status '+status.cls+'">'+(isActive?(isPaused?'⏸ PAUSED':'● LIVE'):status.label)+'</div>';
      gridHtml += '<div class="tracker-topic">'+cfg.name+'</div>';
      gridHtml += '<div class="tracker-time">'+formatTime(s)+' <span style="font-size:0.7rem;color:var(--muted);font-weight:400;">/ '+cfg.recommended+'m</span></div>';
      gridHtml += '<div class="tracker-bar"><div class="tracker-bar-fill" style="width:'+pct+'%;"></div></div>';
      gridHtml += '<div class="tracker-sessions">'+(td?td.sessions:0)+' sessions · Last: '+last+'</div></div>';
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
      await fetch('/api/study/reset', { method: 'POST' });
      
      // Clear localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith('timer_') || k.startsWith('last_q_') || k === TRACKER_KEY) {
          localStorage.removeItem(k);
        }
      });
      
      currentTrackedPage = null; 
      trackingStartTime = null; 
      isPaused = false; 
      pausedElapsed = 0;
      baseSeconds = 0;
      
      await updateTrackerUI(); 
      updateFloatingTimer();
      alert('Cloud and local data has been successfully reset. Fresh start enabled!');
    } catch (e) {
      alert('Failed to reset cloud data. Please check your server connection.');
    }
  }
}

// =============================================
// JOB RADAR INTEGRATION
// =============================================
async function fetchJobRadarSummary() {
  try {
    const response = await fetch('/api/summary');
    const data = await response.json();
    document.getElementById('dedupeCount').textContent = data.dedupeCount;
    document.getElementById('trackedCount').textContent = data.trackedCount;
    document.getElementById('appliedCount').textContent = data.appliedCount;
  } catch (e) {
    console.error('Failed to fetch job summary', e);
  }
}

async function fetchJobsList() {
  try {
    const response = await fetch('/api/jobs');
    const data = await response.json();
    renderJobsList(data.records);
  } catch (e) {
    console.error('Failed to fetch jobs', e);
  }
}

function renderJobsList(jobs) {
  const container = document.getElementById('jobsListContainer');
  if (!container) return;
  
  if (!jobs.length) {
    container.innerHTML = '<p style="color:var(--muted);padding:2rem;text-align:center;">No jobs tracked yet.</p>';
    return;
  }
  
  container.innerHTML = jobs.map(job => `
    <div class="job-card">
      <div class="job-info">
        <div class="job-title">${job.title}</div>
        <div class="job-company">${job.company} · ${job.location}</div>
        <div style="margin-top:0.5rem;">
          <span class="job-status-badge job-status-${job.status}">${job.status}</span>
          <span style="font-size:0.7rem;color:var(--muted);margin-left:0.5rem;">Match: ${job.match_score}%</span>
        </div>
      </div>
      <div class="job-actions">
        <button class="btn-action" onclick="window.open('${job.apply_link}', '_blank')">Apply</button>
        <button class="btn-action" onclick="updateJobStatus('${job.job_hash}', 'applied')">Mark Applied</button>
      </div>
    </div>
  `).join('');
}

async function updateJobStatus(hash, status) {
  try {
    const response = await fetch(`/api/jobs/${hash}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (response.ok) {
      fetchJobsList();
      fetchJobRadarSummary();
    }
  } catch (e) {
    console.error('Failed to update status', e);
  }
}

const SCHEDULE_DATA = [
  { 
    time: '05:00', end: '05:40', title: 'Wake up naturally — no alarm panic', 
    desc: 'You already wake between 5 and 6 AM naturally — this is a powerful advantage. Your cortisol is highest in the early morning which means peak alertness and energy. Drink one large glass of water the moment you wake. Do NOT open your phone, WhatsApp, or social media before your workout. Start the body first, screens later.', 
    tag: 'Fitness' 
  },
  { 
    time: '05:40', end: '06:10', title: 'Morning Workout — strength, bodyweight, or gym', 
    desc: 'Whatever your current workout routine is — keep doing it exactly as you are. Exercise before study has been shown to boost memory retention, focus, and mood for 2–4 hours afterward. This is not time away from preparation — the workout IS preparation. It makes every study session more effective.', 
    tag: 'Fitness' 
  },
  { 
    time: '06:10', end: '08:00', title: '10,000 Steps Walk — outdoor walk', 
    desc: 'Outdoor walk. Rehearse STAR stories or listen to podcasts. Subconscious processing happens here. Choose tech blogs or speaking practice.', 
    tag: 'Fitness' 
  },
  { 
    time: '08:00', end: '08:30', title: 'Communication Block 1 — Read aloud + Vocab', 
    desc: 'Read one tech article aloud slowly. Trains pronunciation, fluency, and confidence. Pick 3 new words and use them in a Salesforce context.', 
    tag: 'Comm' 
  },
  { 
    time: '08:30', end: '10:30', title: 'Core Technical Study Block 1 — Deep Focus', 
    desc: 'Post-workout, post-walk, your brain is at absolute peak performance. Focus on today topic. No phone, no music, no interruptions. Explain it aloud to yourself from memory.', 
    tag: 'Technical' 
  },
  { 
    time: '10:30', end: '12:00', title: 'Hands-on Coding — Trailhead / Dev Org', 
    desc: 'Build what you just studied. Write every line from scratch in your Dev Org. Do not copy-paste. Coding errors you solve now are your best teachers.', 
    tag: 'Coding' 
  },
  { 
    time: '12:00', end: '13:00', title: 'Spoken Interview Q&A Practice', 
    desc: 'Answer 3-4 questions out loud. Record yourself and watch honestly. Note filler words, speed, and structure (Point -> Explain -> Example).', 
    tag: 'Comm' 
  },
  { 
    time: '13:00', end: '14:30', title: 'Lunch + Power Nap — Brain Reset', 
    desc: 'Eat a proper lunch. Move completely away from the desk. No studying, no screens. Quality rest leads to a quality afternoon session.', 
    tag: 'Rest' 
  },
  { 
    time: '14:30', end: '16:00', title: 'Core Technical Study Block 2 — Deep Dive', 
    desc: 'Go deeper into this morning topic or related sub-topics. Depth beats breadth. Write code for every concept. Study aggregate functions, bind variables, etc.', 
    tag: 'Technical' 
  },
  { 
    time: '16:00', end: '16:30', title: 'Job Radar Application — Radar Dashboard', 
    desc: 'Apply to 3-5 roles via Radar Dashboard. Send 2 personalized recruiter messages. Consistency here is everything — zero applications = zero chances.', 
    tag: 'Radar' 
  },
  { 
    time: '16:30', end: '17:00', title: 'Chai + Micro-break — Disconnect', 
    desc: 'Step away from screen. Rest your eyes. Let your brain move short-term memory to long-term storage. No phone during this window.', 
    tag: 'Rest' 
  },
  { 
    time: '17:00', end: '18:00', title: 'Communication Block 2 — STAR Stories', 
    desc: 'Master 2 STAR stories today. Practice out loud. Each story should be 2-2.5 minutes. Lead with the result: "I reduced pull time from 25m to 30s."', 
    tag: 'Comm' 
  },
  { 
    time: '18:00', end: '19:00', title: 'Project/Portfolio Build — Developer Org', 
    desc: 'Extend your mortgage platform or campaign feature. Gives you fresh real-world examples to discuss in interviews. build something new every week.', 
    tag: 'Coding' 
  },
  { 
    time: '19:00', end: '19:30', title: 'Evening Walk — Mental Decompression', 
    desc: 'Short outdoor break to separate study from evening. Important for mental health and mood regulation. Fully disconnect.', 
    tag: 'Rest' 
  },
  { 
    time: '19:30', end: '20:30', title: 'Revision + Flashcard Writing (Handwritten)', 
    desc: 'Handwrite the 5 most important things learned today. Quiz yourself out loud. Handwriting + speaking aloud creates the strongest memory encoding.', 
    tag: 'Technical' 
  },
  { 
    time: '20:30', end: '22:00', title: 'Dinner + Family — Fully Disconnected', 
    desc: 'Consolidate learning by resting. No phone, no LinkedIn. Protect this window to allow neurological processing of the day learning.', 
    tag: 'Rest' 
  },
  { 
    time: '22:00', end: '22:30', title: 'Night Review — 20 Min Preview', 
    desc: 'Read only your notebook notes. Preview tomorrow topic title. Prime your brain for sleep. Dim lights and no screens after this.', 
    tag: 'Review' 
  }
];

async function renderTimetable() {
  const container = document.getElementById('timetableContainer');
  if (!container) return;
  
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
    const completedTasks = data.completedTasks || [];

    container.innerHTML = `
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
              ${status === 'active' ? '<div class="current-indicator">● LIVE NOW</div>' : ''}
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
  } catch (e) {
    container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--red);">Failed to load schedule. Ensure the agent server is running.</div>';
  }
}

function switchTrackerTab(tabId) {
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
  if (target) target.style.display = 'block';

  // Save preference
  localStorage.setItem('last_tracker_tab', tabId);
}

// Update showPage to include timetable rendering
async function showPage(id) {
  localStorage.setItem('last_active_tab', id);
  await stopTracking();
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var page = document.getElementById(id);
  if (page) { page.classList.add('active'); page.style.display = 'block'; }
  document.querySelectorAll('.nav-item').forEach(function(n) {
    var oc = n.getAttribute('onclick');
    if (oc && (oc.indexOf("'"+id+"'") !== -1 || oc.indexOf("\""+id+"\"") !== -1)) n.classList.add('active');
  });
  const searchPage = document.getElementById('searchPage');
  if (searchPage) searchPage.style.display = 'none';
  const mainEl = document.getElementById('main');
  if (mainEl) mainEl.scrollTop = 0;
  
  if (id === 'schedule') {
    await renderTimetable();
  }
  
  if (id === 'study_history') {
    await renderHistory();
  }
  
  if (id === 'job_radar') {
    fetchJobRadarSummary();
    fetchJobsList();
  }
  
  if (id === 'study_tracker') {
    const lastTab = localStorage.getItem('last_tracker_tab') || 'tab_suggestions';
    switchTrackerTab(lastTab);
    await updateTrackerUI(); 
    updateFloatingTimer(); 
  }

  // START TRACKING IF TOPIC
  const cfg = topicConfig[id];
  if (cfg && !cfg.noTimer) {
    startTracking(id);
  }
}

function toggleQA(el) { 
  const isOpen = el.parentElement.classList.toggle('open'); 
  if (isOpen && currentTrackedPage) {
    localStorage.setItem('last_q_' + currentTrackedPage, el.querySelector('.qa-q-text').textContent);
  }
}
function toggleStar(el) { el.parentElement.classList.toggle('open'); }

// Init
document.querySelectorAll('.page').forEach(function(p) {
  if (!p.classList.contains('active')) p.style.display = 'none';
});
document.getElementById('searchPage').style.display = 'none';

// Search index
var searchData = [];
document.querySelectorAll('.qa-block').forEach(function(block) {
  var q = block.querySelector('.qa-q-text');
  var page = block.closest('.page');
  if (q && page) searchData.push({ question: q.textContent.trim(), answerEl: block, pageId: page.id, pageName: page.querySelector('.page-title') ? page.querySelector('.page-title').textContent : '' });
});

function searchContent(val) {
  if (!val || val.length < 2) { document.getElementById('searchPage').style.display = 'none'; return; }
  var lower = val.toLowerCase();
  var results = searchData.filter(function(d) { return d.question.toLowerCase().indexOf(lower) !== -1 || (d.answerEl.textContent||'').toLowerCase().indexOf(lower) !== -1; });
  var container = document.getElementById('searchResults');
  var sp = document.getElementById('searchPage');
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); p.style.display = 'none'; });
  sp.style.display = 'block'; sp.classList.add('active');
  if (!results.length) { container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No results for "'+val+'"</p>'; return; }
  container.innerHTML = results.map(function(r) {
    var idx = searchData.indexOf(r);
    return '<div class="search-result-item" onclick="goToResult(\''+r.pageId+'\','+idx+')"><div class="sr-q">'+r.question+'</div><div class="sr-section">'+r.pageName+'</div></div>';
  }).join('');
}

function goToResult(pageId, idx) {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchPage').style.display = 'none';
  showPage(pageId);
  setTimeout(function() { if (searchData[idx] && searchData[idx].answerEl) { searchData[idx].answerEl.scrollIntoView({behavior:'smooth',block:'center'}); searchData[idx].answerEl.classList.add('open'); } }, 200);
}

let cachedHistories = {};

async function showHistoryModal(date) {
  console.log('[HistoryModal] Attempting to open for date:', date);
  const h = cachedHistories[date];
  if (!h) {
    console.error('[HistoryModal] No cached data found for date:', date);
    alert('No data found for this date. Please click Sync Dashboard first.');
    return;
  }
  console.log('[HistoryModal] Cached Data:', JSON.stringify(h, null, 2));

  const modal = document.getElementById('historyModal');
  const dateEl = document.getElementById('modalDate');
  const body = document.getElementById('modalBody');
  
  dateEl.textContent = date;
  modal.classList.add('active');
  modal.style.display = 'flex';

  const sData = h.study || {};
  const b = sData.breakdown || sData.topicBreakdown || {};
  const topicList = Object.keys(b).map(tid => ({
    id: tid,
    name: b[tid].name || tid,
    totalSeconds: b[tid].totalSeconds || 0
  }));

  let topicHtml = '';
  
  if (topicList.length > 0) {
    topicList.forEach(t => {
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
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:\'IBM Plex Mono\';">${formatTime(h.study.totalSeconds)}</div>
      </div>
      <div style="background:rgba(61,214,140,0.1); padding:1rem; border-radius:12px; text-align:center;">
        <div style="font-size:0.65rem; color:var(--green); text-transform:uppercase; margin-bottom:5px;">Radar Hits</div>
        <div style="font-size:1.5rem; font-weight:700; color:var(--text); font-family:\'IBM Plex Mono\';">+${h.jobs ? h.jobs.newCount : 0}</div>
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

// Lifecycle
window.addEventListener('beforeunload', function() { stopTracking(); });
document.addEventListener('visibilitychange', function() {
  if (document.hidden && currentTrackedPage && !isPaused) {
    // Auto-pause when tab is hidden
    togglePause();
  }
});

// Boot
const lastTab = localStorage.getItem('last_active_tab') || 'schedule';
showPage(lastTab);
fetchJobRadarSummary();
// AI INTERVIEW SYSTEM
let interviewMessages = [];

async function startAIInterview() {
  const topic = document.getElementById('interviewTopic').value;
  const difficulty = document.getElementById('interviewDifficulty').value;
  
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
    
    const res = await fetch('/api/ai/interview', {
      method: 'POST',
      body: JSON.stringify({ prompt: answer, topic, difficulty })
    });
    
    const data = await res.json();
    statusEl.style.display = 'none';
    
    if (data.error) {
      addChatMessage('ai', '⚠️ ' + data.error);
    } else {
      addChatMessage('ai', data.response);
    }
  } catch (e) {
    statusEl.style.display = 'none';
    addChatMessage('ai', '⚠️ Failed to connect to local AI engine.');
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
}

// Support Ctrl+Enter to submit
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'userAnswerInput') {
    submitAnswer();
  }
});
