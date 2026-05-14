import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const DEFAULT_URL = 'http://127.0.0.1:3000/?verify=responsive';
const VERIFY_URL = process.env.RESPONSIVE_VERIFY_URL || DEFAULT_URL;
const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean);

const viewports = [
  { name: 'mobile-320', width: 320, height: 740 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'desktop-1365', width: 1365, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 }
];

function findChrome() {
  const executable = chromeCandidates.find(candidate => existsSync(candidate));
  if (!executable) {
    throw new Error('Chrome executable not found. Set PUPPETEER_EXECUTABLE_PATH to run responsive verification.');
  }
  return executable;
}

async function waitForApp(page) {
  await page.goto(VERIFY_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem('job_radar_view', 'kanban');
    localStorage.setItem('job_radar_sidebar_collapsed', 'false');
  });
  await page.waitForSelector('#main, #job_radar, .page', { timeout: 10000 });
}

async function hideLoginOverlay(page) {
  await page.evaluate(() => {
    const login = document.getElementById('loginOverlay');
    if (login) {
      login.style.display = 'none';
      login.setAttribute('aria-hidden', 'true');
    }
  });
}

async function unlockAuthenticatedShell(page) {
  await page.evaluate(() => {
    document.body.classList.remove('login-active');
    document.body.classList.add('authenticated', 'is-authenticated');
    const main = document.getElementById('main');
    if (main) main.removeAttribute('inert');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.removeAttribute('inert');
    if (typeof window.syncSidebarDisplayMode === 'function') window.syncSidebarDisplayMode();
  });
  await page.waitForFunction(() => {
    const main = document.getElementById('main');
    if (!main) return false;
    const style = getComputedStyle(main);
    return style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.9;
  }, { timeout: 4000 });
}

async function verifyLoginOverlay(page) {
  return page.evaluate(() => {
    const login = document.getElementById('loginOverlay');
    if (!login) return { exists: false, fits: true, visible: false };
    login.style.display = 'flex';
    login.setAttribute('aria-hidden', 'false');
    const panel = login.firstElementChild;
    const rect = panel?.getBoundingClientRect();
    const fits = Boolean(rect)
      && rect.width <= innerWidth
      && rect.height <= innerHeight
      && rect.left >= -1
      && rect.right <= innerWidth + 1;
    return {
      exists: true,
      visible: getComputedStyle(login).display !== 'none',
      fits,
      width: Math.round(rect?.width || 0),
      height: Math.round(rect?.height || 0)
    };
  });
}

async function getOverflowReport(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const maxScrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const offenders = Array.from(document.querySelectorAll('body *'))
      .filter(el => !el.closest('[aria-hidden="true"], [hidden]'))
      .map(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          selector: el.id ? `#${el.id}` : (el.className ? `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}` : el.tagName.toLowerCase()),
          width: Math.round(rect.width),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: style.overflowX
        };
      })
      .filter(item => item.scrollWidth > item.clientWidth + 3 && item.overflowX === 'visible')
      .slice(0, 6);
    return {
      innerWidth,
      maxScrollWidth,
      hasHorizontalOverflow: maxScrollWidth > innerWidth + 3,
      offenders
    };
  });
}

async function verifyHeaderFit(page) {
  return page.evaluate(() => {
    const header = document.getElementById('mainHeader');
    if (!header) return { exists: false, fits: true };
    const rect = header.getBoundingClientRect();
    return {
      exists: true,
      fits: header.scrollWidth <= header.clientWidth + 3 && rect.right <= innerWidth + 1,
      width: Math.round(rect.width),
      scrollWidth: header.scrollWidth,
      clientWidth: header.clientWidth
    };
  });
}

async function verifyTouchTargets(page, viewport) {
  if (viewport.width > 640) return { skipped: 'non-phone viewport' };
  return page.evaluate(() => {
    const selectors = [
      '#mobileToggle',
      '#mobileBoardStageSelect',
      '#mobileRadarActionBar button'
    ];
    const targets = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    const measured = targets
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(el => {
        const rect = el.getBoundingClientRect();
        return {
          selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}`,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          ok: rect.width >= 44 && rect.height >= 44
        };
      });
    return {
      measured,
      failures: measured.filter(item => !item.ok)
    };
  });
}

async function verifySidebar(page, viewport) {
  if (viewport.width < 901) {
    const mobileToggleVisible = await page.$eval('#mobileToggle', el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).catch(() => false);
    if (!mobileToggleVisible) {
      return { open: false, expanded: null, failure: 'mobile toggle hidden at this breakpoint' };
    }

    await page.click('#mobileToggle');
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('mobile-open'), { timeout: 4000 });
    const openState = await page.evaluate(() => ({
      open: document.getElementById('sidebar')?.classList.contains('mobile-open'),
      expanded: document.getElementById('mobileToggle')?.getAttribute('aria-expanded')
    }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('mobile-open'), { timeout: 4000 });
    return openState;
  }

  await page.evaluate(() => document.body.classList.remove('sidebar-collapsed'));
  const canCollapse = await page.$('.desktop-sidebar-toggle');
  if (!canCollapse) return { skipped: 'desktop sidebar toggle not found' };
  const desktopToggleVisible = await page.$eval('.desktop-sidebar-toggle', el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }).catch(() => false);
  if (!desktopToggleVisible) return { skipped: 'desktop sidebar toggle hidden at this breakpoint' };
  await page.evaluate(() => document.querySelector('.desktop-sidebar-toggle')?.click());
  await page.waitForFunction(() => document.body.classList.contains('sidebar-collapsed'), { timeout: 4000 });
  await new Promise(resolve => setTimeout(resolve, 450));
  const collapsed = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const visibleHeaderText = Array.from(document.querySelectorAll('.sidebar-brand-title, .sidebar-brand-subtitle, .sync-status-indicator'))
      .some(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01;
      });
    return {
      collapsed: document.body.classList.contains('sidebar-collapsed'),
      width: Math.round(sidebar?.getBoundingClientRect().width || 0),
      visibleHeaderText
    };
  });
  await page.evaluate(() => document.querySelector('.desktop-sidebar-toggle')?.click());
  await page.waitForFunction(() => !document.body.classList.contains('sidebar-collapsed'), { timeout: 4000 });
  return collapsed;
}

async function seedJobRadarBoard(page) {
  await page.evaluate(() => {
    const now = Date.now();
    const statuses = ['todo', 'applied', 'interview', 'offer', 'rejected'];
    const jobs = [];
    for (let index = 0; index < 9; index += 1) {
      jobs.push({
        id: `qa-todo-${index}`,
        job_hash: `qa-todo-hash-${index}`,
        company: index === 7 ? 'Apex Cloud QA Target' : `Apex Cloud ${index + 1}`,
        role: index % 2 === 0 ? 'Salesforce Developer' : 'Salesforce FDE Consultant',
        title: index % 2 === 0 ? 'Salesforce Developer' : 'Salesforce FDE Consultant',
        status: 'todo',
        location: 'Remote India',
        score: index < 5 ? 92 - index : 58 + index,
        prob: index < 5 ? 'high' : 'medium',
        probability: index < 5 ? 'high' : 'medium',
        matched_skills: ['Apex', 'LWC', 'Integration'],
        missing_skills: ['Data Cloud'],
        why_apply: 'QA seeded role for responsive verification.',
        apply_link: '#',
        updatedAt: new Date(now - index * 3600000).toISOString()
      });
    }
    statuses.slice(1).forEach((status, index) => {
      jobs.push({
        id: `qa-${status}`,
        job_hash: `qa-${status}-hash`,
        company: `${status[0].toUpperCase()}${status.slice(1)} Systems`,
        role: 'Salesforce Platform Engineer',
        title: 'Salesforce Platform Engineer',
        status,
        location: 'Pune / Remote',
        score: 84 - index,
        prob: 'high',
        probability: 'high',
        matched_skills: ['Flow', 'Security', 'Agentforce'],
        missing_skills: ['Data Cloud'],
        why_apply: `QA seeded ${status} role.`,
        apply_link: '#',
        updatedAt: new Date(now - (index + 10) * 3600000).toISOString()
      });
    });
    window.pipelineJobs = jobs;
    window.jobRadarLoading = false;
    window.currentBoardFilter = 'all';
    window.currentBoardSearch = '';
    window.currentMobileBoardStage = 'todo';
    window.radarBoardPages = { todo: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    const input = document.getElementById('boardSearch');
    if (input) input.value = '';
    if (typeof window.renderBoard === 'function') window.renderBoard();
  });
}

async function verifyJobRadar(page, viewport) {
  await page.evaluate(() => {
    if (typeof window.showPage === 'function') window.showPage('job_radar');
    const login = document.getElementById('loginOverlay');
    if (login) login.style.display = 'none';
  });
  await page.waitForSelector('#job_radar', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#job_radar .kanban-board-v3'), { timeout: 10000 });
  await seedJobRadarBoard(page);
  await page.waitForSelector('#job_radar .jcard-v3[data-job-id]', { timeout: 10000 });

  const interaction = await page.evaluate(() => {
    const initialCards = document.querySelectorAll('#job_radar .jcard-v3[data-job-id]').length;
    const initialColumns = document.querySelectorAll('#job_radar .kanban-col-v3').length;

    const firstCard = document.querySelector('#job_radar .jcard-v3[data-job-id]');
    firstCard?.click();
    const flyoutOpen = document.getElementById('jobDetailsFlyout')?.classList.contains('open') || false;
    window.closeJobDetailsFlyout?.();

    const searchInput = document.getElementById('boardSearch');
    if (searchInput) searchInput.value = 'Apex Cloud QA Target';
    window.doBoardSearch?.();
    const searchCards = document.querySelectorAll('#job_radar .jcard-v3[data-job-id]').length;
    const searchMatched = Array.from(document.querySelectorAll('#job_radar .jcard-company'))
      .some(el => /Apex Cloud QA Target/i.test(el.textContent || ''));

    if (searchInput) searchInput.value = '';
    window.currentBoardSearch = '';
    window.setBoardFilter?.('high');
    const highFilterCount = window.getBoardColumnJobs ? window.getBoardColumnJobs('todo').length : 0;
    const highFilterAllHigh = window.getBoardColumnJobs
      ? window.getBoardColumnJobs('todo').every(job => String(job.prob || job.probability || '').toLowerCase() === 'high' || Number(job.score || 0) >= 75)
      : false;

    window.setBoardFilter?.('all');
    window.setBoardPage?.('todo', 1);
    const pageAfterNext = window.radarBoardPages?.todo || 0;
    window.setBoardPage?.('todo', -1);
    const pageAfterPrev = window.radarBoardPages?.todo || 0;

    return {
      initialCards,
      initialColumns,
      flyoutOpen,
      searchCards,
      searchMatched,
      highFilterCount,
      highFilterAllHigh,
      pageAfterNext,
      pageAfterPrev
    };
  });

  if (viewport.width <= 640) {
    await page.waitForSelector('#mobileBoardStageSelect', { timeout: 10000 });
    await page.select('#mobileBoardStageSelect', 'applied');
    return page.evaluate(() => {
      const select = document.getElementById('mobileBoardStageSelect');
      const visibleColumns = Array.from(document.querySelectorAll('#job_radar .kanban-col-v3'))
        .filter(el => getComputedStyle(el).display !== 'none')
        .map(el => el.id);
      return {
        hasMobileStageSelect: Boolean(select),
        selectedStage: select?.value || '',
        optionCount: select?.options.length || 0,
        visibleColumns,
        interaction: window.__lastRadarInteraction || null
      };
    }).then(result => ({ ...result, interaction }));
  }

  return page.evaluate(() => ({
    hasBoard: Boolean(document.querySelector('#job_radar .kanban-board-v3')),
    columns: document.querySelectorAll('#job_radar .kanban-col-v3').length,
    stageNavHidden: getComputedStyle(document.getElementById('mobileBoardStageNav') || document.body).display === 'none'
  })).then(result => ({ ...result, interaction }));
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const failures = [];
  const results = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      const consoleErrors = [];
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' && !/accounts\.google\.com|GSI_LOGGER|Failed to load resource/.test(text)) {
          consoleErrors.push(text);
        }
      });
      await page.setViewport(viewport);
      await waitForApp(page);
      const login = await verifyLoginOverlay(page);
      await hideLoginOverlay(page);
      await unlockAuthenticatedShell(page);

      const overflow = await getOverflowReport(page);
      const header = await verifyHeaderFit(page);
      const sidebar = await verifySidebar(page, viewport);
      const radar = await verifyJobRadar(page, viewport);
      const touchTargets = await verifyTouchTargets(page, viewport);
      const postRadarOverflow = await getOverflowReport(page);

      const result = { viewport, login, overflow, header, sidebar, radar, touchTargets, postRadarOverflow, consoleErrors };
      results.push(result);

      if (viewport.width <= 320 && (!login.exists || !login.fits)) {
        failures.push(`${viewport.name}: login overlay does not fit 320px viewport`);
      }
      if (overflow.hasHorizontalOverflow || postRadarOverflow.hasHorizontalOverflow) {
        failures.push(`${viewport.name}: horizontal overflow detected`);
      }
      if (!header.fits) {
        failures.push(`${viewport.name}: header content overflows its container`);
      }
      if (viewport.width < 901 && sidebar.failure) {
        failures.push(`${viewport.name}: ${sidebar.failure}`);
      }
      if (viewport.width <= 640) {
        if (!radar.hasMobileStageSelect || radar.optionCount < 5 || radar.visibleColumns.length !== 1 || radar.selectedStage !== 'applied') {
          failures.push(`${viewport.name}: mobile Job Radar stage selector is not controlling one visible column`);
        }
        if (touchTargets.failures?.length) {
          failures.push(`${viewport.name}: touch targets below 44px: ${touchTargets.failures.map(item => item.selector).join(', ')}`);
        }
      }
      if (viewport.width >= 1024 && sidebar.collapsed && (sidebar.width > 96 || sidebar.visibleHeaderText)) {
        failures.push(`${viewport.name}: collapsed sidebar leaked text or exceeded compact width`);
      }
      if (!radar.interaction?.flyoutOpen) {
        failures.push(`${viewport.name}: job card detail flyout did not open`);
      }
      if (!radar.interaction?.searchMatched || radar.interaction.searchCards < 1) {
        failures.push(`${viewport.name}: job board search did not return seeded role`);
      }
      if (!radar.interaction?.highFilterAllHigh || radar.interaction.highFilterCount < 1) {
        failures.push(`${viewport.name}: high-fit filter did not return high-fit seeded roles`);
      }
      if (radar.interaction?.pageAfterNext !== 1 || radar.interaction?.pageAfterPrev !== 0) {
        failures.push(`${viewport.name}: job board pagination did not move forward/back`);
      }
      if (consoleErrors.length) {
        failures.push(`${viewport.name}: console errors: ${consoleErrors.slice(0, 2).join(' | ')}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ url: VERIFY_URL, results, failures }, null, 2));
  if (failures.length) process.exit(1);
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
