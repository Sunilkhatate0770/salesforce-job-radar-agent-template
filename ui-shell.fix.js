/* Shared UI hardening for the legacy dashboard shell.
   This keeps navigation, dynamic content, and imported legacy text stable while
   the older app files remain large and mixed with historical markup. */
(function () {
  'use strict';

  const OPEN_KEY = 'sf_prep_sidebar_open_sections_v1';
  let repairing = false;
  let sidebarReady = false;

  const textReplacements = [
    [/â€”|â€“|â|â/g, ' - '],
    [/â†’|â/g, '->'],
    [/â€¢/g, '-'],
    [/â€¦/g, '...'],
    [/â€œ|â€/g, '"'],
    [/â€˜|â€™/g, "'"],
    [/â„¹ï¸|â¹ï¸/g, 'Info'],
    [/âœ…|â/g, 'OK'],
    [/âŒ|â/g, 'Error'],
    [/âš¡|â¡/g, ''],
    [/â±ï¸|â±/g, ''],
    [/â–¼/g, 'v'],
    [/Â/g, ''],
    [/ï¿½/g, ''],
    [/ð\S*/g, ''],
    [/≡\S*/g, ''],
    [/ƒ\S*/g, '']
  ];

  function cleanText(value) {
    let output = String(value || '');
    textReplacements.forEach(([pattern, replacement]) => {
      output = output.replace(pattern, replacement);
    });
    output = output
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+-\s+-\s+/g, ' - ')
      .trim();

    if (/^[=G\-_\s]*$/.test(output)) return '';
    return output;
  }

  function cleanDataObject(target, seen) {
    if (!target || typeof target !== 'object') return;
    if (seen.has(target)) return;
    seen.add(target);

    Object.keys(target).forEach(key => {
      const value = target[key];
      if (typeof value === 'string') {
        target[key] = cleanText(value);
      } else if (Array.isArray(value)) {
        value.forEach(item => cleanDataObject(item, seen));
      } else if (value && typeof value === 'object') {
        cleanDataObject(value, seen);
      }
    });
  }

  function cleanDomText(root) {
    if (!root || repairing) return;
    repairing = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (/^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/i.test(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return /[âïðÂ�≡ƒ]/.test(node.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      });

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const cleaned = cleanText(node.nodeValue);
        if (cleaned !== node.nodeValue.trim()) {
          node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), cleaned);
        }
      });
    } finally {
      repairing = false;
    }
  }

  function getSectionId(section, index) {
    const title = section.querySelector(':scope > .nav-parent-title');
    const clone = title ? title.cloneNode(true) : null;
    if (clone) clone.querySelectorAll('.nav-section-chevron').forEach(node => node.remove());
    return (clone ? clone.textContent : 'section-' + index)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function readOpenSections() {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) || 'null') || null;
    } catch (_) {
      return null;
    }
  }

  function writeOpenSections(sections) {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(sections));
    } catch (_) {
      // Local storage can be unavailable in strict privacy modes.
    }
  }

  function wrapNavLabels() {
    document.querySelectorAll('#sidebar .nav-item').forEach(item => {
      if (item.querySelector(':scope > .nav-label')) return;
      const textNodes = Array.from(item.childNodes).filter(node =>
        node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()
      );
      if (!textNodes.length) return;

      const label = document.createElement('span');
      label.className = 'nav-label';
      label.textContent = textNodes.map(node => cleanText(node.nodeValue)).join(' ').trim();
      item.insertBefore(label, item.querySelector('.count') || null);
      textNodes.forEach(node => node.remove());
    });
  }

  function enhanceSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    wrapNavLabels();

    const sections = Array.from(sidebar.querySelectorAll(':scope > .nav-parent-section'));
    const stored = readOpenSections();
    const openMap = stored || {};

    sections.forEach((section, index) => {
      const title = section.querySelector(':scope > .nav-parent-title');
      if (!title) return;

      const id = section.dataset.sectionId || getSectionId(section, index);
      const hasActive = Boolean(section.querySelector('.nav-item.active'));
      const shouldDefaultOpen = index === 0 || hasActive;

      if (!section.dataset.uiReady) {
        section.dataset.uiReady = 'true';
        section.dataset.sectionId = id;
        section.classList.add('nav-section-enhanced');
        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        title.setAttribute('aria-expanded', 'true');

        const chevron = document.createElement('span');
        chevron.className = 'nav-section-chevron';
        title.appendChild(chevron);

        const toggle = () => {
          const collapsed = !section.classList.contains('collapsed');
          section.classList.toggle('collapsed', collapsed);
          title.setAttribute('aria-expanded', String(!collapsed));
          openMap[id] = !collapsed;
          writeOpenSections(openMap);
        };

        title.addEventListener('click', toggle);
        title.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        });
      }

      const isOpen = hasActive || (stored ? openMap[id] !== false : shouldDefaultOpen);
      section.classList.toggle('collapsed', !isOpen);
      title.setAttribute('aria-expanded', String(isOpen));
    });

    sidebarReady = true;
  }

  function repairConfidenceModal() {
    const modal = document.getElementById('confidenceModal');
    if (!modal) return;

    const firstGlyph = modal.querySelector('div[style*="font-size:3rem"]');
    if (firstGlyph) {
      firstGlyph.className = 'confidence-modal-icon';
      firstGlyph.removeAttribute('style');
      firstGlyph.textContent = 'REVIEW';
    }

    modal.querySelectorAll('button').forEach(button => {
      const label = button.querySelector('div:last-child');
      const glyph = button.querySelector('div:first-child');
      if (!label || !glyph) return;
      glyph.className = 'confidence-choice-label';
      glyph.textContent = cleanText(label.textContent);
    });
  }

  function repairRuntimeData() {
    cleanDataObject(window.TOPIC_DATA, new WeakSet());
    cleanDataObject(window.topicConfig, new WeakSet());
    cleanDataObject(window.PREP_REGISTRY, new WeakSet());
  }

  function runRepairs() {
    repairRuntimeData();
    enhanceSidebar();
    repairConfidenceModal();
    cleanDomText(document.body);
  }

  function patchGlobalFunctions() {
    if (typeof window.showPage === 'function' && !window.showPage.__uiShellPatched) {
      const originalShowPage = window.showPage;
      window.showPage = async function patchedShowPage() {
        const result = await originalShowPage.apply(this, arguments);
        runRepairs();
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebarReady) enhanceSidebar();
        return result;
      };
      window.showPage.__uiShellPatched = true;
    }

    if (typeof window.showToast === 'function' && !window.showToast.__uiShellPatched) {
      const originalShowToast = window.showToast;
      window.showToast = function patchedShowToast(message) {
        return originalShowToast.call(this, cleanText(message));
      };
      window.showToast.__uiShellPatched = true;
    }
  }

  function observeDynamicContent() {
    if (!document.body || window.__uiShellObserver) return;
    let pending = false;
    const observer = new MutationObserver(() => {
      if (repairing || pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        runRepairs();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__uiShellObserver = observer;
  }

  function init() {
    patchGlobalFunctions();
    runRepairs();
    observeDynamicContent();
    setTimeout(runRepairs, 250);
    setTimeout(runRepairs, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
