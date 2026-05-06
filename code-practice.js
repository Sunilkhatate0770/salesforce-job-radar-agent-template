(function () {
  'use strict';

  const STORAGE_KEY = 'sf_code_practice_workspace_v1';
  const CUSTOM_STORAGE_KEY = 'sf_code_practice_custom_single_files_v1';
  const CP_CSS = 'src/styles/code-practice.css?v=20260506-split';
  const CM_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css';
  const CM_CORE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js';
  const CM_MODES = [
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js'
  ];

  const state = {
    root: null,
    mounted: false,
    eventsBound: false,
    codeMirrorReady: false,
    challenges: [],
    customChallenges: [],
    progress: null,
    profile: null,
    selectedId: '',
    files: [],
    currentFile: '',
    editor: null,
    editorFile: '',
    busy: '',
    activePanel: 'files',
    trackFilter: 'all',
    experienceFilter: 'all',
    runResult: null,
    evaluation: null,
    singleFileDraft: getDefaultSingleFileDraft()
  };

  window.CodePractice = {
    mount,
    refresh: mount
  };

  async function mount() {
    const root = document.getElementById('codePracticeApp');
    if (!root) return;
    state.root = root;
    loadStylesheet(CP_CSS);
    bindEvents();

    if (!state.mounted) {
      root.innerHTML = '<div class="cp-loading">Loading Code Practice workspace...</div>';
      const profilePromise = loadProfile();
      const codeMirrorPromise = loadCodeMirrorAssets();
      await loadChallenges();
      loadCustomChallenges();
      await profilePromise;
      await loadProgress();
      await codeMirrorPromise;
      chooseInitialChallenge();
      state.mounted = true;
    }

    render();
  }

  function bindEvents() {
    if (state.eventsBound || !state.root) return;
    state.eventsBound = true;

    state.root.addEventListener('click', async event => {
      const actionEl = event.target.closest('[data-cp-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-cp-action');

      if (action === 'select-challenge') {
        syncEditorToState();
        selectChallenge(actionEl.getAttribute('data-id'));
        saveLocalWorkspace();
        render();
      }

      if (action === 'select-file') {
        syncEditorToState();
        state.currentFile = actionEl.getAttribute('data-file') || state.currentFile;
        render();
      }

      if (action === 'panel') {
        state.activePanel = actionEl.getAttribute('data-panel') || 'files';
        render();
      }

      if (action === 'track') {
        syncEditorToState();
        state.trackFilter = actionEl.getAttribute('data-track') || 'all';
        ensureVisibleSelection();
        render();
      }

      if (action === 'experience') {
        syncEditorToState();
        state.experienceFilter = actionEl.getAttribute('data-year') || 'all';
        ensureVisibleSelection();
        render();
      }

      if (action === 'reset') {
        selectChallenge(state.selectedId);
        saveLocalWorkspace();
        showToast('Starter files restored.');
        render();
      }

      if (action === 'run') {
        await runCurrentChallenge();
      }

      if (action === 'review') {
        await reviewCurrentChallenge();
      }

      if (action === 'save') {
        await saveAttempt();
      }

      if (action === 'create-single-file') {
        syncSingleFileDraftFromDom();
        createSingleFilePractice();
      }

      if (action === 'reset-single-file-draft') {
        const type = state.singleFileDraft.type || 'html';
        state.singleFileDraft = getDefaultSingleFileDraft(type);
        render();
      }

      if (action === 'delete-custom-challenge') {
        const id = actionEl.getAttribute('data-id');
        deleteCustomChallenge(id);
      }
    });

    state.root.addEventListener('change', event => {
      if (event.target && event.target.id === 'cpExperienceFilter') {
        syncEditorToState();
        state.experienceFilter = event.target.value || 'all';
        ensureVisibleSelection();
        render();
      }
      if (event.target?.matches('[data-cp-draft]')) {
        syncSingleFileDraftFromDom();
        if (event.target.getAttribute('data-cp-draft') === 'type') {
          const previousQuestion = state.singleFileDraft.question;
          const previousTitle = state.singleFileDraft.title;
          state.singleFileDraft = {
            ...getDefaultSingleFileDraft(state.singleFileDraft.type),
            title: previousTitle || getDefaultSingleFileDraft(state.singleFileDraft.type).title,
            question: previousQuestion
          };
          render();
        }
      }
    });

    state.root.addEventListener('input', event => {
      if (event.target?.matches('[data-cp-draft]')) {
        syncSingleFileDraftFromDom();
      }
    });
  }

  async function loadProfile() {
    const token = localStorage.getItem('google_auth_token');
    if (!token) return null;
    try {
      const response = await safeApiFetch('/api/profile/data');
      if (!response.ok) throw new Error(`profile ${response.status}`);
      const data = await response.json();
      state.profile = data.profile || null;
      const years = clampYears(state.profile?.experienceYears);
      if (years) state.experienceFilter = String(years);
      return state.profile;
    } catch (err) {
      state.profile = null;
      return null;
    }
  }

  async function loadChallenges() {
    try {
      const response = await fetch('/api/code-practice/challenges', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`challenges ${response.status}`);
      const data = await response.json();
      state.challenges = Array.isArray(data.challenges) ? data.challenges : [];
    } catch (err) {
      const response = await fetch('/data/code-practice-challenges.json', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      state.challenges = Array.isArray(data.challenges) ? data.challenges : [];
    }
  }

  function loadCustomChallenges() {
    try {
      const raw = localStorage.getItem(getScopedPracticeKey('custom-single-files')) || localStorage.getItem(CUSTOM_STORAGE_KEY) || '[]';
      const parsed = JSON.parse(raw);
      state.customChallenges = Array.isArray(parsed)
        ? parsed.map(normalizeCustomChallenge).filter(Boolean).slice(0, 40)
        : [];
      if (state.customChallenges.length && !localStorage.getItem(getScopedPracticeKey('custom-single-files'))) {
        saveCustomChallenges();
      }
    } catch (err) {
      state.customChallenges = [];
    }
  }

  function saveCustomChallenges() {
    try {
      localStorage.setItem(getScopedPracticeKey('custom-single-files'), JSON.stringify(state.customChallenges));
    } catch (err) {
      // Keep practice usable even when browser storage is blocked.
    }
  }

  function normalizeCustomChallenge(challenge) {
    if (!challenge || typeof challenge !== 'object') return null;
    const type = normalizeSingleFileType(challenge.singleFileType || challenge.type || challenge.practiceMode);
    const template = getSingleFileTemplate(type);
    const files = normalizeFiles(challenge.files || [], []);
    if (!files.length) {
      files.push({ name: template.fileName, language: template.language, content: template.content });
    }
    return {
      id: String(challenge.id || `custom-${type}-${Date.now()}`).slice(0, 80),
      title: String(challenge.title || template.title).slice(0, 90),
      summary: String(challenge.summary || 'Your own single-file practice prompt.').slice(0, 160),
      instructions: String(challenge.instructions || challenge.question || template.question).slice(0, 1200),
      expectedBehavior: String(challenge.expectedBehavior || template.expected).slice(0, 700),
      track: type === 'html' || type === 'js' ? 'web' : 'salesforce',
      practiceMode: template.practiceMode,
      singleFileType: type,
      difficulty: String(challenge.difficulty || 'Custom').slice(0, 40),
      experienceLevels: Array.isArray(challenge.experienceLevels) && challenge.experienceLevels.length
        ? challenge.experienceLevels.map(Number).filter(Number.isFinite)
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      designations: Array.isArray(challenge.designations) && challenge.designations.length
        ? challenge.designations.map(String).slice(0, 4)
        : ['Salesforce Developer', 'FDE'],
      files: files.slice(0, 1),
      tests: Array.isArray(challenge.tests) ? challenge.tests : [],
      staticChecks: Array.isArray(challenge.staticChecks) && challenge.staticChecks.length
        ? challenge.staticChecks
        : buildSingleFileStaticChecks(type, files[0]?.name || template.fileName),
      custom: true,
      createdAt: challenge.createdAt || new Date().toISOString()
    };
  }

  function getDefaultSingleFileDraft(type = 'html') {
    const template = getSingleFileTemplate(type);
    return {
      type: template.type,
      title: template.title,
      question: template.question,
      fileName: template.fileName,
      starter: template.content
    };
  }

  function getSingleFileTemplate(type = 'html') {
    const normalized = normalizeSingleFileType(type);
    const templates = {
      html: {
        type: 'html',
        title: 'Single HTML File Practice',
        question: 'Create one responsive HTML file for the interview prompt. Include semantic structure, accessible labels, and a clear result area.',
        fileName: 'index.html',
        language: 'html',
        practiceMode: 'html-single',
        expected: 'One complete HTML file that renders without external files and works on mobile and desktop.',
        content: `<main class="practice-card">
  <h1>Salesforce Practice</h1>
  <p id="status">Build the requested UI here.</p>
  <button type="button">Start</button>
</main>`
      },
      js: {
        type: 'js',
        title: 'Single JavaScript File Practice',
        question: 'Create one JavaScript file for the prompt. Keep logic readable, validate inputs, and expose a function that can be tested.',
        fileName: 'solution.js',
        language: 'javascript',
        practiceMode: 'js-single',
        expected: 'One JavaScript file with valid syntax and a clear exported/global function or runnable logic.',
        content: `function solve(input) {
  if (!input) return '';
  return String(input).trim();
}

window.solve = solve;`
      },
      apex: {
        type: 'apex',
        title: 'Single Apex Class Practice',
        question: 'Create one Apex class for the prompt. Use bulk-safe collections, clear method names, and security-aware thinking.',
        fileName: 'PracticeSolution.cls',
        language: 'apex',
        practiceMode: 'apex-single',
        expected: 'One Apex class with a valid class declaration, balanced braces, and no obvious SOQL/DML inside loops.',
        content: `public with sharing class PracticeSolution {
    public static void execute(List<Account> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        // Add bulk-safe logic for the prompt here.
    }
}`
      },
      trigger: {
        type: 'trigger',
        title: 'Single Trigger File Practice',
        question: 'Create one Salesforce trigger for the prompt. Keep it bulk-safe and call a handler if the scenario needs more logic.',
        fileName: 'PracticeTrigger.trigger',
        language: 'apex',
        practiceMode: 'apex-trigger-single',
        expected: 'One trigger file with a valid trigger declaration and Trigger context usage.',
        content: `trigger PracticeTrigger on Account (before insert, before update) {
    if (Trigger.isBefore && (Trigger.isInsert || Trigger.isUpdate)) {
        for (Account recordItem : Trigger.new) {
            // Add lightweight context logic for the prompt here.
        }
    }
}`
      }
    };
    return templates[normalized] || templates.html;
  }

  function normalizeSingleFileType(type) {
    const value = String(type || '').toLowerCase();
    if (value.includes('trigger')) return 'trigger';
    if (value.includes('apex') || value.includes('cls')) return 'apex';
    if (value.includes('js') || value.includes('javascript')) return 'js';
    return 'html';
  }

  function buildSingleFileStaticChecks(type, fileName) {
    const escapedFile = String(fileName || '*').slice(0, 80);
    const checks = [
      { id: 'custom-not-empty', label: `${escapedFile} has meaningful source`, file: '*', regex: '[\\s\\S]{24,}', weight: 10 }
    ];
    if (type === 'html') {
      checks.push(
        { id: 'custom-html-structure', label: 'Uses semantic HTML structure', file: '*', regex: '<(main|section|article|form|header|button|h1)\\b', weight: 12 },
        { id: 'custom-html-viewport', label: 'Includes responsive viewport when using a full document', file: '*', regex: 'viewport|<(main|section|article|form|button)\\b', weight: 8 }
      );
    } else if (type === 'js') {
      checks.push(
        { id: 'custom-js-function', label: 'Defines executable JavaScript logic', file: '*', regex: '\\b(function|const|let|=>)\\b', weight: 12 },
        { id: 'custom-js-no-alert-only', label: 'Does more than only alert/log output', file: '*', negativeRegex: '^\\s*(alert|console\\.log)\\s*\\(', weight: 8 }
      );
    } else if (type === 'apex') {
      checks.push(
        { id: 'custom-apex-class', label: 'Declares an Apex class', file: '*', regex: '\\bclass\\s+\\w+', weight: 14 },
        { id: 'custom-apex-sharing', label: 'Considers sharing context', file: '*', regex: '\\b(with|without|inherited)\\s+sharing\\b', weight: 8 }
      );
    } else if (type === 'trigger') {
      checks.push(
        { id: 'custom-trigger-declaration', label: 'Declares a Salesforce trigger', file: '*', regex: '\\btrigger\\s+\\w+\\s+on\\s+\\w+\\s*\\(', weight: 14 },
        { id: 'custom-trigger-context', label: 'Uses Trigger context variables', file: '*', regex: '\\bTrigger\\.(new|old|newMap|oldMap|isInsert|isUpdate|isBefore|isAfter)\\b', weight: 8 }
      );
    }
    return checks;
  }

  async function loadProgress() {
    const token = localStorage.getItem('google_auth_token');
    if (!token) {
      state.progress = readLocalProgress() || getDefaultProgress();
      return;
    }
    try {
      const response = await safeApiFetch('/api/code-practice/progress');
      if (!response.ok) throw new Error(`progress ${response.status}`);
      const data = await response.json();
      state.progress = mergeProgress(data.codingPractice || getDefaultProgress(), readLocalProgress());
    } catch (err) {
      state.progress = readLocalProgress() || getDefaultProgress();
    }
  }

  async function loadCodeMirrorAssets() {
    if (window.CodeMirror) {
      state.codeMirrorReady = true;
      return true;
    }
    loadStylesheet(CM_CSS);
    const coreLoaded = await loadScript(CM_CORE, 4000);
    if (!coreLoaded || !window.CodeMirror) {
      state.codeMirrorReady = false;
      return false;
    }
    await Promise.all(CM_MODES.map(url => loadScript(url, 1800)));
    state.codeMirrorReady = true;
    return true;
  }

  function loadStylesheet(url) {
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }

  function loadScript(url, timeoutMs) {
    if (document.querySelector(`script[src="${url}"]`)) return Promise.resolve(true);
    return new Promise(resolve => {
      const script = document.createElement('script');
      let settled = false;
      const done = ok => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      script.src = url;
      script.async = false;
      script.onload = () => done(true);
      script.onerror = () => done(false);
      setTimeout(() => done(false), timeoutMs);
      document.head.appendChild(script);
    });
  }

  function chooseInitialChallenge() {
    const visible = getVisibleChallenges();
    const lastWorkspace = state.progress?.lastWorkspace;
    const saved = readLocalWorkspace();
    const all = getAllChallenges();
    const candidateId = lastWorkspace?.challengeId || saved?.challengeId || visible[0]?.id || all[0]?.id;
    const filesOverride = lastWorkspace?.challengeId === candidateId ? lastWorkspace.files : (saved?.challengeId === candidateId ? saved.files : null);
    selectChallenge(candidateId, filesOverride);
  }

  function ensureVisibleSelection() {
    const visible = getVisibleChallenges();
    if (!visible.length) return;
    if (!visible.some(challenge => challenge.id === state.selectedId)) {
      selectChallenge(visible[0].id);
    }
  }

  function selectChallenge(challengeId, filesOverride) {
    const challenge = getChallenge(challengeId);
    if (!challenge) return;
    state.selectedId = challenge.id;
    state.files = normalizeFiles(filesOverride || challenge.files || [], challenge.files || []);
    state.currentFile = state.files[0]?.name || '';
    state.editor = null;
    state.editorFile = '';
    state.runResult = null;
    state.evaluation = null;
    state.activePanel = 'files';
  }

  function normalizeFiles(files, starterFiles) {
    const starterByName = new Map((starterFiles || []).map(file => [file.name, file]));
    if (Array.isArray(files)) {
      return files.map(file => ({
        name: String(file.name || '').slice(0, 80),
        language: file.language || starterByName.get(file.name)?.language || inferLanguage(file.name),
        content: String(file.content || '').slice(0, 60000)
      })).filter(file => file.name);
    }
    return Object.entries(files || {}).map(([name, content]) => ({
      name: String(name || '').slice(0, 80),
      language: starterByName.get(name)?.language || inferLanguage(name),
      content: String(content || '').slice(0, 60000)
    })).filter(file => file.name);
  }

  function getVisibleChallenges() {
    return getAllChallenges().filter(challenge => {
      const trackMatch = state.trackFilter === 'all' || challenge.track === state.trackFilter;
      const years = state.experienceFilter === 'all' ? 0 : Number(state.experienceFilter);
      const yearMatch = !years || (challenge.experienceLevels || []).includes(years);
      return trackMatch && yearMatch;
    });
  }

  function getAllChallenges() {
    return [...state.customChallenges, ...state.challenges];
  }

  function getChallenge(id) {
    return getAllChallenges().find(challenge => challenge.id === id) || null;
  }

  function getCurrentChallenge() {
    return getChallenge(state.selectedId);
  }

  function getCurrentFile() {
    return state.files.find(file => file.name === state.currentFile) || state.files[0] || null;
  }

  function filesToMap() {
    return Object.fromEntries(state.files.map(file => [file.name, file.content]));
  }

  function syncEditorToState() {
    const file = getCurrentFile();
    if (!file) return;
    if (state.editor && state.editorFile === file.name && typeof state.editor.getValue === 'function') {
      file.content = state.editor.getValue();
      return;
    }
    const textarea = document.getElementById('cpEditor');
    if (textarea && textarea.dataset.file === file.name) file.content = textarea.value;
  }

  async function runCurrentChallenge() {
    syncEditorToState();
    const challenge = getCurrentChallenge();
    if (!challenge) return;
    state.busy = 'run';
    render();
    try {
      let tests = [];
      if (challenge.track === 'web') {
        tests = await runWebTests(challenge);
      } else if (challenge.track === 'salesforce') {
        tests = runSalesforceStaticTests(challenge, filesToMap());
      }
      state.runResult = { tests };
      state.evaluation = runDeterministicChecks(challenge, filesToMap(), state.runResult);
      state.activePanel = 'results';
      saveLocalWorkspace();
      showToast('Run complete.');
    } catch (err) {
      state.runResult = { tests: [] };
      state.evaluation = runDeterministicChecks(challenge, filesToMap(), state.runResult);
      state.activePanel = 'results';
      showToast('Run completed with fallback checks.');
    } finally {
      state.busy = '';
      render();
    }
  }

  async function reviewCurrentChallenge() {
    const challenge = getCurrentChallenge();
    if (!challenge) return;
    if (!state.runResult) await runCurrentChallenge();
    syncEditorToState();
    state.busy = 'review';
    render();
    const deterministic = runDeterministicChecks(challenge, filesToMap(), state.runResult || { tests: [] });
    try {
      const response = await safeApiFetch('/api/code-practice/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          languageTrack: challenge.track,
          files: state.files,
          runResult: state.runResult || { tests: [] }
        })
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in required for AI review.' : `review ${response.status}`);
      const data = await response.json();
      state.evaluation = { ...deterministic, ...data };
      state.activePanel = 'results';
      showToast('AI review ready.');
    } catch (err) {
      state.evaluation = {
        ...deterministic,
        aiUnavailable: true,
        improvements: deterministic.improvements.length ? deterministic.improvements : ['Sign in with Google to save and request cloud AI review.'],
        interviewFeedback: err.message || deterministic.interviewFeedback
      };
      state.activePanel = 'results';
      showToast(err.message || 'Showing deterministic review.');
    } finally {
      state.busy = '';
      render();
    }
  }

  async function saveAttempt() {
    const challenge = getCurrentChallenge();
    if (!challenge) return;
    if (!state.evaluation) await reviewCurrentChallenge();
    syncEditorToState();
    if (challenge.custom) {
      saveCustomAttempt(challenge);
      saveLocalWorkspace();
      showToast('Custom practice attempt saved locally.');
      render();
      return;
    }
    state.busy = 'save';
    render();
    try {
      const response = await safeApiFetch('/api/code-practice/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          languageTrack: challenge.track,
          files: state.files,
          score: state.evaluation?.score || 0,
          correctnessPercent: state.evaluation?.correctnessPercent || state.evaluation?.score || 0,
          passedChecks: state.evaluation?.passedChecks || [],
          failedChecks: state.evaluation?.failedChecks || [],
          improvements: state.evaluation?.improvements || []
        })
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in with Google to save attempts.' : `save ${response.status}`);
      const data = await response.json();
      state.progress = data.codingPractice || state.progress || getDefaultProgress();
      saveLocalWorkspace();
      showToast('Attempt saved to your Google profile.');
    } catch (err) {
      saveLocalWorkspace();
      showToast(err.message || 'Attempt saved locally only.');
    } finally {
      state.busy = '';
      render();
    }
  }

  function syncSingleFileDraftFromDom() {
    if (!state.root) return;
    const draft = { ...state.singleFileDraft };
    state.root.querySelectorAll('[data-cp-draft]').forEach(input => {
      const field = input.getAttribute('data-cp-draft');
      if (!field) return;
      draft[field] = input.value;
    });
    const template = getSingleFileTemplate(draft.type);
    state.singleFileDraft = {
      ...draft,
      type: template.type,
      fileName: normalizeSingleFileName(draft.fileName, template),
      starter: String(draft.starter || template.content).slice(0, 60000)
    };
  }

  function createSingleFilePractice() {
    const draft = { ...state.singleFileDraft };
    const template = getSingleFileTemplate(draft.type);
    const title = String(draft.title || template.title).trim();
    const question = String(draft.question || template.question).trim();
    const starter = String(draft.starter || template.content).trim();
    const fileName = normalizeSingleFileName(draft.fileName || template.fileName, template);
    if (!title || !question || !starter || !fileName) {
      showToast('Add a title, question, file name, and starter code first.');
      return;
    }
    const challenge = normalizeCustomChallenge({
      id: `custom-${template.type}-${Date.now()}`,
      title,
      summary: `Custom ${formatSingleFileType(template.type)} practice from your own prompt.`,
      instructions: question,
      expectedBehavior: template.expected,
      singleFileType: template.type,
      practiceMode: template.practiceMode,
      track: template.type === 'html' || template.type === 'js' ? 'web' : 'salesforce',
      files: [{ name: fileName, language: template.language, content: starter }],
      staticChecks: buildSingleFileStaticChecks(template.type, fileName),
      createdAt: new Date().toISOString()
    });
    if (!challenge) return;
    state.customChallenges = [
      challenge,
      ...state.customChallenges.filter(item => item.id !== challenge.id)
    ].slice(0, 40);
    saveCustomChallenges();
    state.singleFileDraft = getDefaultSingleFileDraft(template.type);
    selectChallenge(challenge.id);
    saveLocalWorkspace();
    showToast('Single-file practice created.');
    render();
  }

  function deleteCustomChallenge(id) {
    const challengeId = String(id || '');
    const before = state.customChallenges.length;
    state.customChallenges = state.customChallenges.filter(challenge => challenge.id !== challengeId);
    if (state.customChallenges.length === before) return;
    saveCustomChallenges();
    if (state.selectedId === challengeId) {
      const next = getVisibleChallenges()[0] || state.challenges[0];
      if (next) selectChallenge(next.id);
    }
    saveLocalWorkspace();
    showToast('Custom practice removed.');
    render();
  }

  function saveCustomAttempt(challenge) {
    const progress = state.progress || getDefaultProgress();
    const score = Number(state.evaluation?.score || 0);
    const attempt = {
      challengeId: challenge.id,
      title: challenge.title,
      languageTrack: challenge.track,
      score,
      correctnessPercent: score,
      savedAt: new Date().toISOString(),
      custom: true
    };
    const attempts = [attempt, ...(progress.attempts || [])].slice(0, 50);
    const bestScores = { ...(progress.bestScores || {}) };
    bestScores[challenge.id] = Math.max(Number(bestScores[challenge.id] || 0), score);
    const completed = new Set(progress.completedChallengeIds || []);
    if (score >= 70) completed.add(challenge.id);
    state.progress = {
      ...progress,
      attempts,
      bestScores,
      completedChallengeIds: [...completed],
      lastWorkspace: {
        challengeId: challenge.id,
        files: filesToMap(),
        updatedAt: new Date().toISOString()
      }
    };
    try {
      localStorage.setItem(getScopedPracticeKey('progress'), JSON.stringify(state.progress));
    } catch (err) {
      // Best effort local save.
    }
  }

  function normalizeSingleFileName(value, template) {
    const fallback = template.fileName;
    let name = String(value || fallback).trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    if (!name) name = fallback;
    const lower = name.toLowerCase();
    if (template.type === 'html' && !lower.endsWith('.html')) name += '.html';
    if (template.type === 'js' && !lower.endsWith('.js')) name += '.js';
    if (template.type === 'apex' && !lower.endsWith('.cls')) name += '.cls';
    if (template.type === 'trigger' && !lower.endsWith('.trigger')) name += '.trigger';
    return name;
  }

  function formatSingleFileType(type) {
    if (type === 'html') return 'HTML';
    if (type === 'js') return 'JavaScript';
    if (type === 'apex') return 'Apex class';
    if (type === 'trigger') return 'trigger';
    return 'single-file';
  }

  function runDeterministicChecks(challenge, files, runResult) {
    const passedChecks = [];
    const failedChecks = [];
    let passedWeight = 0;
    let totalWeight = 0;

    (challenge.staticChecks || []).forEach(check => {
      const weight = Number(check.weight || 10);
      totalWeight += weight;
      const source = check.file === '*' ? Object.values(files).join('\n\n') : String(files[check.file] || '');
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
    });

    const testWeights = new Map((challenge.tests || []).map(test => [test.id, Number(test.weight || 10)]));
    (runResult?.tests || []).forEach(test => {
      const weight = testWeights.get(test.id) || Number(test.weight || 10);
      totalWeight += weight;
      const item = { id: test.id, label: test.label || test.id, weight };
      if (test.pass) {
        passedWeight += weight;
        passedChecks.push(item);
      } else {
        failedChecks.push({ ...item, message: test.message });
      }
    });

    const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
    return {
      success: true,
      challengeId: challenge.id,
      languageTrack: challenge.track,
      score,
      correctnessPercent: score,
      deterministicScore: score,
      aiScore: null,
      passedChecks,
      failedChecks,
      improvements: failedChecks.slice(0, 6).map(check => `Improve: ${check.label}`),
      interviewFeedback: score >= 80
        ? 'Strong attempt. Explain the tradeoffs, test data, and limit handling clearly.'
        : 'Tighten the failed checks, then explain how you would test and bulk-proof it.',
      nextPracticeTopics: challenge.track === 'salesforce'
        ? ['Bulkification', 'Test coverage', 'Security review']
        : ['DOM events', 'Pure functions', 'Accessible UI']
    };
  }

  function getPracticeMode(challenge) {
    if (challenge.practiceMode) return challenge.practiceMode;
    const files = state.files || challenge.files || [];
    if (files.length !== 1) return 'multi-file';
    const name = String(files[0]?.name || '').toLowerCase();
    if (name.endsWith('.html')) return 'html-single';
    if (name.endsWith('.js')) return 'js-single';
    if (name.endsWith('.trigger')) return 'apex-trigger-single';
    if (name.endsWith('.cls')) return 'apex-single';
    return 'single-file';
  }

  function findFileContent(files, exactNames, extension) {
    const names = exactNames.map(name => name.toLowerCase());
    const exact = Object.entries(files).find(([name]) => names.includes(name.toLowerCase()));
    if (exact) return { name: exact[0], content: String(exact[1] || '') };
    const byExt = Object.entries(files).find(([name]) => name.toLowerCase().endsWith(extension));
    return byExt ? { name: byExt[0], content: String(byExt[1] || '') } : { name: '', content: '' };
  }

  function runWebSyntaxChecks(challenge) {
    const files = filesToMap();
    const mode = getPracticeMode(challenge);
    const jsFile = findFileContent(files, ['script.js', 'solution.js'], '.js');
    if (!jsFile.content.trim()) return [];

    try {
      // Compile only. DOM-dependent code is executed inside the preview iframe.
      // eslint-disable-next-line no-new-func
      new Function(jsFile.content);
      return [{
        id: mode === 'js-single' ? 'single-js-syntax' : 'js-syntax',
        label: `${jsFile.name} has valid JavaScript syntax`,
        pass: true,
        weight: 10
      }];
    } catch (err) {
      return [{
        id: mode === 'js-single' ? 'single-js-syntax' : 'js-syntax',
        label: `${jsFile.name} has valid JavaScript syntax`,
        pass: false,
        message: err.message,
        weight: 10
      }];
    }
  }

  function isBalancedSource(source) {
    const pairs = { '(': ')', '{': '}', '[': ']' };
    const closers = new Set(Object.values(pairs));
    const stack = [];
    let quote = '';
    let escaped = false;

    for (const char of String(source || '')) {
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = '';
        }
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
      } else if (pairs[char]) {
        stack.push(pairs[char]);
      } else if (closers.has(char) && stack.pop() !== char) {
        return false;
      }
    }
    return !quote && stack.length === 0;
  }

  function runSalesforceStaticTests(challenge, files) {
    const combined = Object.entries(files).map(([name, content]) => `// ${name}\n${content}`).join('\n\n');
    const hasTriggerFile = Object.keys(files).some(name => name.toLowerCase().endsWith('.trigger'));
    const hasClassFile = Object.keys(files).some(name => name.toLowerCase().endsWith('.cls'));
    const tests = [
      {
        id: 'apex-balanced-delimiters',
        label: 'Braces, parentheses, and brackets are balanced',
        pass: isBalancedSource(combined),
        weight: 10
      },
      {
        id: hasTriggerFile ? 'trigger-declaration-shape' : 'apex-class-declaration-shape',
        label: hasTriggerFile ? 'Trigger declaration has object and event block' : 'Apex class declaration is present',
        pass: hasTriggerFile
          ? /trigger\s+\w+\s+on\s+\w+\s*\([^)]*\)\s*\{/i.test(combined)
          : /class\s+\w+/i.test(combined),
        weight: 10
      },
      {
        id: 'apex-no-empty-source',
        label: 'Source file is not empty',
        pass: combined.replace(/\/\/.*$/gm, '').trim().length > 20,
        weight: 10
      },
      {
        id: 'apex-loop-query-smell',
        label: 'No obvious SOQL query inside a loop',
        pass: !/for\s*\([^)]*\)\s*\{[\s\S]{0,400}\[[\s\S]{0,80}\bSELECT\b/i.test(combined),
        weight: 10
      },
      {
        id: 'apex-loop-dml-smell',
        label: 'No obvious DML statement inside a loop',
        pass: !/for\s*\([^)]*\)\s*\{[^{}]*\b(insert|update|delete|upsert)\b\s+\w+/i.test(combined),
        weight: 10
      }
    ];

    if (hasClassFile && /Test\.|@IsTest|System\.assert/i.test(combined)) {
      tests.push({
        id: 'apex-test-signal',
        label: 'Includes a test or assertion signal',
        pass: true,
        weight: 8
      });
    }

    if (challenge.practiceMode === 'apex-trigger-single') {
      tests.push({
        id: 'trigger-context-usage',
        label: 'Uses Trigger context variables',
        pass: /\bTrigger\.(new|old|newMap|oldMap|isInsert|isUpdate|isDelete|isUndelete)\b/i.test(combined),
        weight: 10
      });
    }

    return tests;
  }

  function runWebTests(challenge) {
    const tests = challenge.tests || [];
    const syntaxTests = runWebSyntaxChecks(challenge);
    if (!tests.length) return Promise.resolve(syntaxTests);
    return new Promise(resolve => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;border:0;';

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        iframe.remove();
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve([
          ...syntaxTests,
          ...tests.map(test => ({ id: test.id, label: test.label, pass: false, message: 'Test timed out.' }))
        ]);
      }, 1800);
      const onMessage = event => {
        if (!event.data || event.data.type !== 'code-practice-tests' || event.data.challengeId !== challenge.id) return;
        clearTimeout(timer);
        cleanup();
        const results = Array.isArray(event.data.results) ? event.data.results : [];
        resolve([...syntaxTests, ...results]);
      };

      window.addEventListener('message', onMessage);
      iframe.srcdoc = buildPreviewSrcdoc(challenge, true);
      document.body.appendChild(iframe);
    });
  }

  function buildPreviewSrcdoc(challenge, includeTests) {
    const files = filesToMap();
    const mode = getPracticeMode(challenge);
    const htmlFile = findFileContent(files, ['index.html'], '.html');
    const cssFile = findFileContent(files, ['style.css', 'styles.css'], '.css');
    const jsFile = findFileContent(files, ['script.js', 'solution.js'], '.js');
    const testScript = buildPreviewTestScript(challenge, includeTests);

    if (mode === 'html-single') {
      return buildSingleHtmlDocument(htmlFile.content || '<main id="app"></main>', testScript);
    }

    if (mode === 'js-single') {
      return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 18px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f8fafc; }
    .runner-card { max-width: 560px; padding: 16px; border: 1px solid #d8dde6; border-radius: 8px; background: #fff; }
    code { display: block; margin-top: 8px; padding: 8px; border-radius: 6px; background: #eef2f7; white-space: pre-wrap; }
  </style>
</head>
<body>
  ${challenge.previewHtml || '<main class="runner-card"><h1>JavaScript Logic Runner</h1><p>Run tests to validate the single file solution.</p><code id="output">Ready</code></main>'}
  <script>${escapeScriptEnd(jsFile.content)}<\/script>
  ${testScript}
</body>
</html>`;
    }

    const html = htmlFile.content || '<main id="app"></main>';
    const css = cssFile.content || '';
    const js = jsFile.content || '';

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 18px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f8fafc; }
    ${escapeStyleEnd(css)}
  </style>
</head>
<body>
  ${html}
  <script>${escapeScriptEnd(js)}<\/script>
  ${testScript}
</body>
</html>`;
  }

  function buildPreviewTestScript(challenge, includeTests) {
    if (!includeTests) return '';
    const tests = JSON.stringify(challenge.tests || []).replace(/</g, '\\u003c');
    return `
      <script>
        (function () {
          var tests = ${tests};
          setTimeout(function () {
            var results = tests.map(function (test) {
              try {
                return { id: test.id, label: test.label, pass: !!eval(test.expression) };
              } catch (err) {
                return { id: test.id, label: test.label, pass: false, message: err.message };
              }
            });
            parent.postMessage({ type: 'code-practice-tests', challengeId: ${JSON.stringify(challenge.id)}, results: results }, '*');
          }, 80);
        })();
      <\/script>`;
  }

  function buildSingleHtmlDocument(source, testScript) {
    const html = String(source || '');
    const safeHtml = html;
    if (/<!doctype|<html[\s>]/i.test(safeHtml)) {
      if (/<\/body>/i.test(safeHtml)) return safeHtml.replace(/<\/body>/i, `${testScript}</body>`);
      if (/<\/html>/i.test(safeHtml)) return safeHtml.replace(/<\/html>/i, `${testScript}</html>`);
      return safeHtml + testScript;
    }
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 18px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f8fafc; }
  </style>
</head>
<body>
  ${safeHtml}
  ${testScript}
</body>
</html>`;
  }

  function render() {
    if (!state.root) return;
    syncEditorToState();
    const selected = getCurrentChallenge();
    state.root.innerHTML = `
      <div class="cp-frame">
        ${renderTopbar()}
        <div class="cp-layout">
          ${renderSidebar()}
          ${selected ? renderWorkspace(selected) : '<div class="cp-empty">No code practice challenges found.</div>'}
        </div>
      </div>
    `;
    window.requestAnimationFrame(() => {
      renderEditor();
      renderPreview();
    });
  }

  function renderTopbar() {
    return `
      <div class="cp-topbar">
        <div class="cp-title-block">
          <div class="cp-kicker">Code Practice</div>
          <h2 class="cp-heading">Salesforce Coding Workspace</h2>
          <div class="cp-subtle">${escapeHtml(renderProfileHint())}</div>
        </div>
        <div class="cp-toolbar" aria-label="Code practice filters">
          ${renderExperienceMenu()}
          <div class="cp-segments" aria-label="Language track">
            ${renderTrackButton('all', 'All')}
            ${renderTrackButton('web', 'Web')}
            ${renderTrackButton('salesforce', 'Apex')}
          </div>
        </div>
      </div>
    `;
  }

  function renderExperienceMenu() {
    const current = state.experienceFilter === 'all'
      ? 'All years'
      : `${state.experienceFilter} year${state.experienceFilter === '1' ? '' : 's'}`;
    const options = ['all', ...Array.from({ length: 10 }, (_, i) => String(i + 1))];
    return `
      <details class="cp-year-menu">
        <summary aria-label="Experience level filter">
          <span>${escapeHtml(current)}</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div class="cp-year-options" role="listbox" aria-label="Experience level options">
          ${options.map(value => {
            const label = value === 'all' ? 'All years' : `${value} year${value === '1' ? '' : 's'}`;
            return `<button type="button" role="option" aria-selected="${state.experienceFilter === value}" class="${state.experienceFilter === value ? 'is-active' : ''}" data-cp-action="experience" data-year="${value}">${escapeHtml(label)}</button>`;
          }).join('')}
        </div>
      </details>
    `;
  }

  function renderTrackButton(track, label) {
    return `<button type="button" class="cp-segment${state.trackFilter === track ? ' is-active' : ''}" data-cp-action="track" data-track="${track}">${label}</button>`;
  }

  function renderProfileHint() {
    const profile = state.profile || {};
    const years = clampYears(profile.experienceYears);
    const designation = profile.targetDesignation || profile.targetRole || profile.currentDesignation || profile.currentRole;
    if (years && designation) return `${years} year${years > 1 ? 's' : ''} / ${designation}`;
    if (years) return `${years} year${years > 1 ? 's' : ''} practice path`;
    return 'Practice path updates from your profile after Google sign-in.';
  }

  function renderSidebar() {
    const visible = getVisibleChallenges();
    return `
      <aside class="cp-sidebar" aria-label="Code practice challenges">
        ${renderSingleFileBuilder()}
        ${renderCustomPracticeList()}
        <div class="cp-section-title">Challenges</div>
        <div class="cp-challenge-list">
          ${visible.length ? visible.map(renderChallengeCard).join('') : '<div class="cp-empty">No challenge matches this filter.</div>'}
        </div>
        ${renderProgressCard()}
      </aside>
    `;
  }

  function renderSingleFileBuilder() {
    const draft = state.singleFileDraft || getDefaultSingleFileDraft();
    const type = normalizeSingleFileType(draft.type);
    return `
      <details class="cp-single-builder" open>
        <summary>
          <span>Create Single File</span>
          <span aria-hidden="true">+</span>
        </summary>
        <div class="cp-builder-body">
          <div class="cp-builder-grid">
            <label class="cp-builder-field">
              <span>File type</span>
              <select data-cp-draft="type" aria-label="Single file practice type">
                ${renderDraftOption(type, 'html', 'HTML')}
                ${renderDraftOption(type, 'js', 'JavaScript')}
                ${renderDraftOption(type, 'apex', 'Apex Class')}
                ${renderDraftOption(type, 'trigger', 'Trigger')}
              </select>
            </label>
            <label class="cp-builder-field">
              <span>File name</span>
              <input data-cp-draft="fileName" type="text" value="${escapeAttr(draft.fileName || '')}" placeholder="index.html">
            </label>
          </div>
          <label class="cp-builder-field">
            <span>Practice title</span>
            <input data-cp-draft="title" type="text" value="${escapeAttr(draft.title || '')}" placeholder="Build account search">
          </label>
          <label class="cp-builder-field">
            <span>Your question / requirement</span>
            <textarea data-cp-draft="question" rows="4" placeholder="Paste your own interview question or requirement...">${escapeHtml(draft.question || '')}</textarea>
          </label>
          <label class="cp-builder-field">
            <span>Starter code</span>
            <textarea data-cp-draft="starter" rows="6" spellcheck="false" placeholder="Add the single file starter code...">${escapeHtml(draft.starter || '')}</textarea>
          </label>
          <div class="cp-builder-actions">
            <button type="button" class="cp-btn primary" data-cp-action="create-single-file">Create</button>
            <button type="button" class="cp-btn" data-cp-action="reset-single-file-draft">Reset</button>
          </div>
        </div>
      </details>
    `;
  }

  function renderDraftOption(current, value, label) {
    return `<option value="${value}"${current === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function renderCustomPracticeList() {
    if (!state.customChallenges.length) {
      return '<div class="cp-custom-empty">Create your own HTML, JS, Apex class, or trigger file practice above.</div>';
    }
    return `
      <div class="cp-custom-list" aria-label="Custom single-file practices">
        <div class="cp-section-title">Your Single Files</div>
        ${state.customChallenges.slice(0, 6).map(challenge => `
          <div class="cp-custom-item">
            <button type="button" class="cp-custom-select${challenge.id === state.selectedId ? ' is-active' : ''}" data-cp-action="select-challenge" data-id="${escapeAttr(challenge.id)}">
              <span>${escapeHtml(challenge.title)}</span>
              <small>${escapeHtml(formatSingleFileType(challenge.singleFileType))}</small>
            </button>
            <button type="button" class="cp-icon-btn" aria-label="Delete ${escapeAttr(challenge.title)}" data-cp-action="delete-custom-challenge" data-id="${escapeAttr(challenge.id)}">Remove</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderChallengeCard(challenge) {
    const best = state.progress?.bestScores?.[challenge.id];
    const modeLabel = formatPracticeMode(challenge);
    return `
      <button type="button" class="cp-challenge-card${challenge.id === state.selectedId ? ' is-active' : ''}" data-cp-action="select-challenge" data-id="${escapeAttr(challenge.id)}">
        <span class="cp-challenge-title">
          <span>${escapeHtml(challenge.title)}</span>
          ${best ? `<span class="cp-badge score">${Number(best)}%</span>` : ''}
        </span>
        <span class="cp-challenge-summary">${escapeHtml(challenge.summary || '')}</span>
        <span class="cp-badge-row">
          <span class="cp-badge">${escapeHtml(challenge.track === 'web' ? 'HTML/JS' : 'Apex')}</span>
          ${modeLabel ? `<span class="cp-badge single">${escapeHtml(modeLabel)}</span>` : ''}
          <span class="cp-badge">${escapeHtml(challenge.difficulty || 'Practice')}</span>
          <span class="cp-badge">${escapeHtml(formatYears(challenge.experienceLevels))}</span>
        </span>
      </button>
    `;
  }

  function renderProgressCard() {
    const attempts = state.progress?.attempts || [];
    const completed = state.progress?.completedChallengeIds || [];
    return `
      <div class="cp-progress-card" style="padding:12px;">
        <div class="cp-section-title">Progress</div>
        <div class="cp-badge-row">
          <span class="cp-badge score">${completed.length} complete</span>
          <span class="cp-badge">${attempts.length} attempts</span>
        </div>
        ${attempts[0] ? `<div class="cp-subtle" style="margin-top:10px;">Latest: ${escapeHtml(attempts[0].title || attempts[0].challengeId)} (${Number(attempts[0].score || 0)}%)</div>` : '<div class="cp-subtle" style="margin-top:10px;">No saved attempts yet.</div>'}
      </div>
    `;
  }

  function renderWorkspace(challenge) {
    return `
      <main class="cp-workspace">
        <section class="cp-panel cp-current">
          <div class="cp-current-head">
            <div>
              <h3>${escapeHtml(challenge.title)}</h3>
              <div class="cp-badge-row">
                <span class="cp-badge">${escapeHtml(challenge.difficulty || 'Practice')}</span>
                ${formatPracticeMode(challenge) ? `<span class="cp-badge single">${escapeHtml(formatPracticeMode(challenge))}</span>` : ''}
                <span class="cp-badge">${escapeHtml(formatYears(challenge.experienceLevels))}</span>
                <span class="cp-badge">${escapeHtml((challenge.designations || []).slice(0, 2).join(' / '))}</span>
              </div>
            </div>
            <div class="cp-toolbar">
              <button type="button" class="cp-btn warning" data-cp-action="reset" ${state.busy ? 'disabled' : ''}>Reset</button>
              <button type="button" class="cp-btn primary" data-cp-action="run" ${state.busy ? 'disabled' : ''}>${state.busy === 'run' ? 'Running...' : 'Run'}</button>
              <button type="button" class="cp-btn" data-cp-action="review" ${state.busy ? 'disabled' : ''}>${state.busy === 'review' ? 'Reviewing...' : 'AI Review'}</button>
              <button type="button" class="cp-btn success" data-cp-action="save" ${state.busy ? 'disabled' : ''}>${state.busy === 'save' ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
          <div class="cp-current-grid">
            <div class="cp-info-box"><strong>Task</strong><span>${escapeHtml(challenge.instructions || '')}</span></div>
            <div class="cp-info-box"><strong>Expected</strong><span>${escapeHtml(challenge.expectedBehavior || '')}</span></div>
          </div>
        </section>

        <div class="cp-mobile-tabs" aria-label="Workspace panels">
          ${renderPanelTab('files', 'Files')}
          ${renderPanelTab('preview', 'Preview')}
          ${renderPanelTab('results', 'Results')}
        </div>

        <div class="cp-desktop-grid">
          ${renderFilesPanel()}
          ${renderOutputPanel(challenge)}
        </div>
      </main>
    `;
  }

  function renderPanelTab(panel, label) {
    return `<button type="button" class="cp-panel-tab${state.activePanel === panel ? ' is-active' : ''}" data-cp-action="panel" data-panel="${panel}">${label}</button>`;
  }

  function formatPracticeMode(challenge) {
    const mode = challenge.practiceMode || '';
    if (mode === 'html-single') return 'Single HTML';
    if (mode === 'js-single') return 'Single JS';
    if (mode === 'apex-single') return 'Single Class';
    if (mode === 'apex-trigger-single') return 'Single Trigger';
    return '';
  }

  function renderFilesPanel() {
    return `
      <section class="cp-panel${state.activePanel === 'files' ? ' is-active' : ''}" data-panel="files">
        <div class="cp-panel-header">
          <div class="cp-panel-title">Files</div>
          <span class="cp-badge">${state.codeMirrorReady ? 'CodeMirror' : 'Textarea'}</span>
        </div>
        <div class="cp-file-tabs">
          ${state.files.map(file => `<button type="button" class="cp-file-tab${file.name === state.currentFile ? ' is-active' : ''}" data-cp-action="select-file" data-file="${escapeAttr(file.name)}">${escapeHtml(file.name)}</button>`).join('')}
        </div>
        <div class="cp-editor-wrap">
          <textarea id="cpEditor" class="cp-editor" spellcheck="false"></textarea>
        </div>
      </section>
    `;
  }

  function renderOutputPanel(challenge) {
    return `
      <div class="cp-output-column">
        <section class="cp-panel${state.activePanel === 'preview' ? ' is-active' : ''}" data-panel="preview">
          <div class="cp-panel-header">
            <div class="cp-panel-title">${challenge.track === 'web' ? 'Preview' : 'Static Validation'}</div>
            <span class="cp-badge">${escapeHtml(challenge.track)}</span>
          </div>
          <div class="cp-output-stack">
            ${challenge.track === 'web' ? '<iframe id="cpPreviewFrame" class="cp-preview-frame" title="Code preview" sandbox="allow-scripts allow-forms"></iframe>' : renderSalesforcePreview()}
          </div>
        </section>
        <section class="cp-panel${state.activePanel === 'results' ? ' is-active' : ''}" data-panel="results">
          <div class="cp-panel-header">
            <div class="cp-panel-title">Results</div>
            <span class="cp-badge">${state.evaluation ? `${Number(state.evaluation.score || 0)}%` : 'Ready'}</span>
          </div>
          <div class="cp-output-stack">
            ${renderResults()}
          </div>
        </section>
      </div>
    `;
  }

  function renderSalesforcePreview() {
    return `
      <div class="cp-salesforce-preview">
        <div class="cp-section-title">Apex / Trigger Review</div>
        <div class="cp-subtle" style="margin-top:8px;">Apex is checked locally for syntax shape, trigger patterns, and static rules. Org compilation still requires Salesforce CLI or a connected org.</div>
        <div class="cp-file-summary">
          ${state.files.map(file => `<code>${escapeHtml(file.name)} - ${String(file.content || '').split(/\n/).length} lines</code>`).join('')}
        </div>
      </div>
    `;
  }

  function renderResults() {
    if (!state.evaluation) {
      return '<div class="cp-empty">Run the challenge to see checks, score, and feedback.</div>';
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(state.evaluation.score || 0))));
    const passed = state.evaluation.passedChecks || [];
    const failed = state.evaluation.failedChecks || [];
    return `
      <div class="cp-results">
        <div class="cp-score-card">
          <div class="cp-score" style="--cp-score:${score}%;"><span>${score}%</span></div>
          <div>
            <div class="cp-panel-title">Correctness</div>
            <div class="cp-subtle">Deterministic ${Number(state.evaluation.deterministicScore ?? score)}%${state.evaluation.aiScore !== null && state.evaluation.aiScore !== undefined ? ` / AI ${Number(state.evaluation.aiScore)}%` : ''}</div>
          </div>
        </div>
        <div class="cp-result-card" style="padding:12px;">
          <div class="cp-section-title">Passed Checks</div>
          <div class="cp-check-list" style="margin-top:8px;">${passed.length ? passed.map(check => renderCheck(check, true)).join('') : '<div class="cp-subtle">No checks passed yet.</div>'}</div>
        </div>
        <div class="cp-result-card" style="padding:12px;">
          <div class="cp-section-title">Needs Work</div>
          <div class="cp-check-list" style="margin-top:8px;">${failed.length ? failed.map(check => renderCheck(check, false)).join('') : '<div class="cp-subtle">No failed checks.</div>'}</div>
        </div>
        <div class="cp-result-card" style="padding:12px;">
          <div class="cp-section-title">Interview Feedback</div>
          <div class="cp-subtle" style="margin-top:8px;">${escapeHtml(state.evaluation.interviewFeedback || '')}</div>
          ${renderReviewList('Improvements', state.evaluation.improvements)}
          ${renderReviewList('Next Topics', state.evaluation.nextPracticeTopics)}
        </div>
      </div>
    `;
  }

  function renderCheck(check, pass) {
    return `
      <div class="cp-check ${pass ? 'pass' : 'fail'}">
        <span>${pass ? 'OK' : '!'}</span>
        <span>${escapeHtml(check.label || check.id || '')}${check.message ? `<br><small>${escapeHtml(check.message)}</small>` : ''}</span>
      </div>
    `;
  }

  function renderReviewList(title, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return '';
    return `
      <div class="cp-section-title" style="margin-top:12px;">${escapeHtml(title)}</div>
      <ul class="cp-review-list" style="margin-top:8px;">${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    `;
  }

  function renderEditor() {
    const textarea = document.getElementById('cpEditor');
    const file = getCurrentFile();
    if (!textarea || !file) return;
    state.editor = null;
    state.editorFile = file.name;
    textarea.dataset.file = file.name;
    textarea.value = file.content || '';
    textarea.addEventListener('input', () => {
      file.content = textarea.value;
      saveLocalWorkspace();
    });

    if (!state.codeMirrorReady || !window.CodeMirror) return;
    const mode = getCodeMirrorMode(file);
    state.editor = window.CodeMirror.fromTextArea(textarea, {
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      viewportMargin: Infinity,
      mode
    });
    state.editor.on('change', editor => {
      file.content = editor.getValue();
      saveLocalWorkspace();
    });
    setTimeout(() => state.editor?.refresh(), 40);
  }

  function renderPreview() {
    const challenge = getCurrentChallenge();
    const iframe = document.getElementById('cpPreviewFrame');
    if (!challenge || !iframe || challenge.track !== 'web') return;
    iframe.srcdoc = buildPreviewSrcdoc(challenge, false);
  }

  function getCodeMirrorMode(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.html')) return 'htmlmixed';
    if (name.endsWith('.css')) return 'css';
    if (name.endsWith('.js')) return 'javascript';
    if (name.endsWith('.cls') || name.endsWith('.trigger')) return 'text/x-java';
    return 'javascript';
  }

  function inferLanguage(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.html')) return 'html';
    if (lower.endsWith('.css')) return 'css';
    if (lower.endsWith('.js')) return 'javascript';
    if (lower.endsWith('.cls') || lower.endsWith('.trigger')) return 'apex';
    return 'text';
  }

  async function safeApiFetch(url, options = {}) {
    if (typeof window.apiFetch === 'function') return window.apiFetch(url, options);
    const token = localStorage.getItem('google_auth_token');
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  }

  function getDefaultProgress() {
    return { attempts: [], bestScores: {}, lastWorkspace: null, completedChallengeIds: [] };
  }

  function mergeProgress(primary, localOnly) {
    if (!localOnly) return primary || getDefaultProgress();
    const base = primary || getDefaultProgress();
    const attemptsByKey = new Map();
    [...(localOnly.attempts || []), ...(base.attempts || [])].forEach(attempt => {
      const key = `${attempt.challengeId || ''}:${attempt.savedAt || attempt.attemptedAt || ''}:${attempt.score || 0}`;
      if (!attemptsByKey.has(key)) attemptsByKey.set(key, attempt);
    });
    const bestScores = { ...(localOnly.bestScores || {}), ...(base.bestScores || {}) };
    Object.entries(localOnly.bestScores || {}).forEach(([id, score]) => {
      bestScores[id] = Math.max(Number(bestScores[id] || 0), Number(score || 0));
    });
    const completed = new Set([...(localOnly.completedChallengeIds || []), ...(base.completedChallengeIds || [])]);
    return {
      ...base,
      attempts: [...attemptsByKey.values()]
        .sort((a, b) => String(b.savedAt || b.attemptedAt || '').localeCompare(String(a.savedAt || a.attemptedAt || '')))
        .slice(0, 50),
      bestScores,
      completedChallengeIds: [...completed],
      lastWorkspace: base.lastWorkspace || localOnly.lastWorkspace || null
    };
  }

  function saveLocalWorkspace() {
    try {
      localStorage.setItem(getScopedPracticeKey('workspace'), JSON.stringify({
        challengeId: state.selectedId,
        files: filesToMap(),
        updatedAt: new Date().toISOString()
      }));
    } catch (err) {
      // Local storage can be unavailable in private browser modes.
    }
  }

  function readLocalWorkspace() {
    try {
      const scoped = localStorage.getItem(getScopedPracticeKey('workspace'));
      if (scoped) return JSON.parse(scoped);
      const legacy = localStorage.getItem(STORAGE_KEY);
      if (!legacy) return null;
      const parsed = JSON.parse(legacy);
      localStorage.setItem(getScopedPracticeKey('workspace'), legacy);
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function readLocalProgress() {
    try {
      return JSON.parse(localStorage.getItem(getScopedPracticeKey('progress')) || 'null');
    } catch (err) {
      return null;
    }
  }

  function getScopedPracticeKey(key) {
    return `sfjr:${getPracticeUserId()}:code-practice:${key}:v1`;
  }

  function getPracticeUserId() {
    const fromApp = window.currentUser?.id || window.currentUser?.googleId || window.currentUser?.email;
    if (fromApp) return normalizeStorageUserId(fromApp);
    const token = localStorage.getItem('google_auth_token');
    if (token && token.split('.').length >= 2) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return normalizeStorageUserId(payload.sub || payload.email || payload.name || 'guest');
      } catch (err) {
        return 'guest';
      }
    }
    return 'guest';
  }

  function normalizeStorageUserId(value) {
    return String(value || 'guest').toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80) || 'guest';
  }

  function showToast(message) {
    let toast = document.querySelector('.cp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cp-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function clampYears(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.max(1, Math.min(10, Math.round(num)));
  }

  function formatYears(years) {
    if (!Array.isArray(years) || !years.length) return 'All levels';
    const sorted = [...years].sort((a, b) => a - b);
    if (sorted.length === 1) return `${sorted[0]} yr`;
    return `${sorted[0]}-${sorted[sorted.length - 1]} yrs`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function escapeScriptEnd(value) {
    return String(value || '').replace(/<\/script/gi, '<\\/script');
  }

  function escapeStyleEnd(value) {
    return String(value || '').replace(/<\/style/gi, '<\\/style');
  }
})();
