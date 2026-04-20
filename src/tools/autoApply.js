import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

export async function attemptAutoApply(job) {
  console.log(`\n🚀 [AUTO-APPLY] High match score detected (${job.match_score}%). Launching Auto-Apply Bot for: ${job.title} at ${job.company}`);
  
  // Attempt to use the user's actual Chrome profile to bypass login screens
  const homeDir = os.homedir();
  let chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  let userDataDir = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // Must be visible so the user can intervene if a captcha appears
      executablePath: chromePath,
      userDataDir: userDataDir,
      defaultViewport: null,
      args: ['--start-maximized']
    });
  } catch (e) {
    console.log('⚠️ [AUTO-APPLY] Could not attach to your primary Chrome Profile (it might be currently open). Falling back to standard invisible browser.');
    browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  }

  const page = await browser.newPage();
  
  try {
    console.log(`➡️ Navigating to: ${job.url}`);
    await page.goto(job.url, { waitUntil: 'networkidle2' });

    if (job.url.includes('linkedin.com')) {
      await handleLinkedInApply(page);
    } else if (job.url.includes('naukri.com')) {
      await handleNaukriApply(page);
    } else {
      console.log('⚠️ [AUTO-APPLY] Unsupported platform for auto-apply. Please apply manually.');
    }

  } catch (err) {
    console.error(`❌ [AUTO-APPLY] Automation failed: ${err.message}`);
  } finally {
    console.log('🕒 Leaving browser open for 60 seconds so you can review/submit before closing...');
    setTimeout(async () => {
      await browser.close();
      console.log('✅ [AUTO-APPLY] Session closed.');
    }, 60000);
  }
}

async function handleLinkedInApply(page) {
  console.log('🔍 Hunting for LinkedIn "Easy Apply" button...');
  
  try {
    // Look for the Easy Apply button (LinkedIn constantly changes classes, so we look by button text)
    const easyApplyBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.innerText.includes('Easy Apply') || b.innerText.includes('Apply now'));
    });

    if (easyApplyBtn) {
      await easyApplyBtn.click();
      console.log('🎯 [SUCCESS] Clicked Easy Apply! The modal should be open.');
    } else {
      console.log('⚠️ [AUTO-APPLY] Could not find an Easy Apply button. This might be an external application.');
    }
  } catch (e) {
    console.error('Failed LinkedIn auto-apply:', e.message);
  }
}

async function handleNaukriApply(page) {
  console.log('🔍 Hunting for Naukri "Apply" button...');
  try {
    // Naukri typically uses a specific button ID or class
    const applyBtn = await page.$('.apply-button') || await page.$('#apply-button');
    if (applyBtn) {
      await applyBtn.click();
      console.log('🎯 [SUCCESS] Clicked Naukri Apply button!');
    } else {
      console.log('⚠️ [AUTO-APPLY] Could not find the Apply button. The job might be expired or already applied.');
    }
  } catch (e) {
    console.error('Failed Naukri auto-apply:', e.message);
  }
}
