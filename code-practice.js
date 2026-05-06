(function () {
  'use strict';

  const STORAGE_KEY = 'sf_code_practice_workspace_v1';
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
    evaluation: null
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
    });

    state.root.addEventListener('change', event => {
      if (event.target && event.target.id === 'cpExperienceFilter') {
        syncEditorToState();
        state.experienceFilter = event.target.value || 'all';
        ensureVisibleSelection();
        render();
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

  async function loadProgress() {
    const token = localStorage.getItem('google_auth_token');
    if (!token) {
      state.progress = getDefaultProgress();
      return;
    }
    try {
      const response = await safeApiFetch('/api/code-practice/progress');
      if (!response.ok) throw new Error(`progress ${response.status}`);
      const data = await response.json();
      state.progress = data.codingPractice || getDefaultProgress();
    } catch (err) {
      state.progress = getDefaultProgress();
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
    const candidateId = lastWorkspace?.challengeId || saved?.challengeId || visible[0]?.id || state.challenges[0]?.id;
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
    return state.challenges.filter(challenge => {
      const trackMatch = state.trackFilter === 'all' || challenge.track === state.trackFilter;
      const years = state.experienceFilter === 'all' ? 0 : Number(state.experienceFilter);
      const yearMatch = !years || (challenge.experienceLevels || []).includes(years);
      return trackMatch && yearMatch;
    });
  }

  function getChallenge(id) {
    return state.challenges.find(challenge => challenge.id === id) || null;
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
        <div class="cp-section-title">Challenges</div>
        <div class="cp-challenge-list">
          ${visible.length ? visible.map(renderChallengeCard).join('') : '<div class="cp-empty">No challenge matches this filter.</div>'}
        </div>
        ${renderProgressCard()}
      </aside>
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

  function saveLocalWorkspace() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
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
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (err) {
      return null;
    }
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
