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
    const login = document.getElementById('loginOverlay');
    if (login) {
      login.style.display = 'none';
      login.setAttribute('aria-hidden', 'true');
    }
  });
  await page.waitForSelector('#main, #job_radar, .page', { timeout: 10000 });
}

async function getOverflowReport(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const maxScrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const offenders = Array.from(document.querySelectorAll('body *'))
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

async function verifySidebar(page, viewport) {
  if (viewport.width < 901) {
    const mobileToggleVisible = await page.$eval('#mobileToggle', el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).catch(() => false);
    if (!mobileToggleVisible) return { skipped: 'mobile toggle hidden at this breakpoint' };

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

async function verifyJobRadar(page, viewport) {
  await page.evaluate(() => {
    if (typeof window.showPage === 'function') window.showPage('job_radar');
    const login = document.getElementById('loginOverlay');
    if (login) login.style.display = 'none';
  });
  await page.waitForSelector('#job_radar', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#job_radar .kanban-board-v3'), { timeout: 10000 });

  if (viewport.width <= 640) {
    await page.waitForSelector('#mobileBoardStageSelect', { timeout: 10000 });
    return page.evaluate(() => {
      const select = document.getElementById('mobileBoardStageSelect');
      const visibleColumns = Array.from(document.querySelectorAll('#job_radar .kanban-col-v3'))
        .filter(el => getComputedStyle(el).display !== 'none')
        .map(el => el.id);
      return {
        hasMobileStageSelect: Boolean(select),
        selectedStage: select?.value || '',
        optionCount: select?.options.length || 0,
        visibleColumns
      };
    });
  }

  return page.evaluate(() => ({
    hasBoard: Boolean(document.querySelector('#job_radar .kanban-board-v3')),
    columns: document.querySelectorAll('#job_radar .kanban-col-v3').length,
    stageNavHidden: getComputedStyle(document.getElementById('mobileBoardStageNav') || document.body).display === 'none'
  }));
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

      const overflow = await getOverflowReport(page);
      const sidebar = await verifySidebar(page, viewport);
      const radar = await verifyJobRadar(page, viewport);
      const postRadarOverflow = await getOverflowReport(page);

      const result = { viewport, overflow, sidebar, radar, postRadarOverflow, consoleErrors };
      results.push(result);

      if (overflow.hasHorizontalOverflow || postRadarOverflow.hasHorizontalOverflow) {
        failures.push(`${viewport.name}: horizontal overflow detected`);
      }
      if (viewport.width <= 640) {
        if (!radar.hasMobileStageSelect || radar.optionCount < 5 || radar.visibleColumns.length !== 1) {
          failures.push(`${viewport.name}: mobile Job Radar stage selector is not controlling one visible column`);
        }
      }
      if (viewport.width >= 1024 && sidebar.collapsed && (sidebar.width > 96 || sidebar.visibleHeaderText)) {
        failures.push(`${viewport.name}: collapsed sidebar leaked text or exceeded compact width`);
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
