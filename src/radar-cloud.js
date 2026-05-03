(function () {
  'use strict';

  const BADGE_STYLES = {
    ready: ['rgba(16,185,129,0.1)', 'var(--green, #10b981)'],
    warn: ['rgba(245,158,11,0.12)', 'var(--amber, #f59e0b)'],
    error: ['rgba(239,68,68,0.12)', 'var(--red, #ef4444)'],
    locked: ['rgba(96,165,250,0.12)', '#93c5fd'],
    neutral: ['rgba(139,92,246,0.1)', '#c4b5fd']
  };

  const state = {
    status: 'idle',
    message: '',
    detail: ''
  };

  function getToken() {
    try {
      const token = localStorage.getItem('google_auth_token');
      return token && token !== 'null' && token !== 'undefined' ? token : '';
    } catch (_) {
      return '';
    }
  }

  function hasAuth() {
    return Boolean(getToken());
  }

  function parseApiPath(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (_) {
      return String(url || '').split('?')[0];
    }
  }

  function isPublicApi(url, method) {
    const path = parseApiPath(url);
    const verb = String(method || 'GET').toUpperCase();
    return path === '/api/auth/google' ||
      path === '/api/health' ||
      (verb === 'GET' && path === '/api/code-practice/challenges');
  }

  function setBadge(id, text, variant, title) {
    const el = document.getElementById(id);
    if (!el) return;
    const [background, color] = BADGE_STYLES[variant] || BADGE_STYLES.neutral;
    el.textContent = text;
    el.hidden = false;
    el.style.display = 'inline-block';
    el.style.background = background;
    el.style.color = color;
    if (title) el.title = title;
  }

  function renderNotice() {
    const el = document.getElementById('jobRadarStateNotice');
    if (!el) return;
    if (!state.message || state.status === 'ready') {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.className = `radar-state-notice ${state.status}`;
    el.innerHTML = `
      <div>
        <strong>${escapeText(state.message)}</strong>
        ${state.detail ? `<span>${escapeText(state.detail)}</span>` : ''}
      </div>
    `;
  }

  function setNotice(status, message, detail) {
    state.status = status || 'idle';
    state.message = message || '';
    state.detail = detail || '';
    window.jobRadarCloudState = { ...state };
    renderNotice();
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function classifyApiResponse(response, payload) {
    if (response?.status === 401 || payload?.error === 'login_required') {
      return {
        status: 'locked',
        message: 'Sign in to sync Job Radar',
        detail: 'Your job pipeline and status changes stay private behind Google sign-in.'
      };
    }
    if (!response?.ok) {
      return {
        status: 'error',
        message: 'Job Radar sync failed',
        detail: payload?.error || `Server returned ${response?.status || 'an error'}.`
      };
    }
    if (payload?.degraded?.active) {
      const reasons = Array.isArray(payload.degraded.reasons) ? payload.degraded.reasons : [];
      return {
        status: 'degraded',
        message: 'Job Radar is running in degraded cloud mode',
        detail: reasons.length ? `Needs attention: ${reasons.join(', ')}.` : 'Some optional cloud services are not configured.'
      };
    }
    return {
      status: 'ready',
      message: '',
      detail: ''
    };
  }

  function applyJobsPayload(payload) {
    const degraded = payload?.degraded || {};
    const sourceCounts = payload?.sourceCounts || {};
    const sourceParts = Object.entries(sourceCounts)
      .filter(([, count]) => Number(count || 0) > 0)
      .map(([name, count]) => `${name}: ${count}`);

    if (degraded.active) {
      setBadge('dbStatusBadge', 'Degraded', 'warn', sourceParts.join(' | ') || 'Cloud is partially configured.');
    } else {
      setBadge('dbStatusBadge', 'Cloud Active', 'ready', sourceParts.join(' | ') || 'Cloud sync is healthy.');
    }

    if (payload?.storageCapacity) {
      setBadge('archiveStatusBadge', payload.storageCapacity, 'neutral', 'Storage and archive status');
    }

    const classification = classifyApiResponse({ ok: true, status: 200 }, payload);
    setNotice(classification.status, classification.message, classification.detail);
  }

  window.RadarCloud = {
    state,
    getToken,
    hasAuth,
    isPublicApi,
    classifyApiResponse,
    setBadge,
    setNotice,
    applyJobsPayload,
    renderNotice
  };
})();
