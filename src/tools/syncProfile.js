import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const ENV_PATH = path.resolve(process.cwd(), '.env');

async function askGemma(prompt) {
  const payload = {
    model: "gemma4:e4b",
    prompt: prompt,
    stream: false,
    options: { temperature: 0.2 }
  };
  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.response;
  } catch (e) {
    console.error("❌ Failed to reach local Gemma engine. Ensure Ollama is running.");
    process.exit(1);
  }
}

async function scrapeProfile(platform) {
  console.log(`\n🚀 Launching Auto-Sync for ${platform}...`);
  
  const homeDir = os.homedir();
  let chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  let userDataDir = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      userDataDir: userDataDir,
      defaultViewport: null
    });
  } catch (e) {
    console.error(`❌ Chrome is already running. Please close all Chrome windows and try again.`);
    process.exit(1);
  }

  const page = await browser.newPage();
  
  try {
    let url = platform === 'LinkedIn' ? 'https://www.linkedin.com/in/me/' : 'https://www.naukri.com/mnjuser/profile';
    console.log(`➡️ Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Auto scroll to load dynamic content
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 300;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if(totalHeight >= scrollHeight - window.innerHeight){
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });

    // Extract all meaningful text
    const profileText = await page.evaluate(() => {
      return document.body.innerText.replace(/\s+/g, ' ').trim();
    });

    console.log(`✅ Extracted ${profileText.length} characters of profile data.`);
    await browser.close();
    return profileText;
  } catch (err) {
    console.error(`❌ Scraping failed: ${err.message}`);
    await browser.close();
    process.exit(1);
  }
}

async function main() {
  console.log("=== JOB RADAR CLOUD SYNC ===");
  const target = process.argv[2] || 'LinkedIn';
  
  const rawText = await scrapeProfile(target);

  console.log(`\n🤖 Sending ${target} profile to local Gemma 4 for AI extraction...`);
  const extractionPrompt = `
  Analyze this raw ${target} profile text.
  Extract the core technical skills and total years of professional experience.
  Return exactly in this JSON format:
  {
    "skills": ["skill1", "skill2"],
    "experienceYears": 3
  }
  Do not include markdown blocks or any other text. Just the JSON.
  Profile: ${rawText.substring(0, 15000)}
  `;

  let jsonResult;
  try {
    const aiResponse = await askGemma(extractionPrompt);
    const cleanJsonStr = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    jsonResult = JSON.parse(cleanJsonStr);
  } catch (e) {
    console.error("❌ Failed to parse Gemma response as JSON. Trying again later.");
    process.exit(1);
  }

  console.log("\n✅ AI Extraction Successful!");
  console.log(`🧠 Detected Skills: ${jsonResult.skills.join(', ')}`);
  console.log(`⏳ Detected Experience: ${jsonResult.experienceYears} Years`);

  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const skillsStr = jsonResult.skills.join(', ');
  
  if (envContent.includes('RESUME_SKILLS=')) {
    envContent = envContent.replace(/RESUME_SKILLS=.*/g, `RESUME_SKILLS="${skillsStr}"`);
  } else {
    envContent += `\nRESUME_SKILLS="${skillsStr}"`;
  }

  if (envContent.includes('RESUME_EXPERIENCE_YEARS=')) {
    envContent = envContent.replace(/RESUME_EXPERIENCE_YEARS=.*/g, `RESUME_EXPERIENCE_YEARS=${jsonResult.experienceYears}`);
  } else {
    envContent += `\nRESUME_EXPERIENCE_YEARS=${jsonResult.experienceYears}`;
  }

  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`\n⚙️ Agent .env Configuration automatically updated! Jobs will now perfectly match your ${target} profile.`);

  console.log(`\n📚 Generating Tailored Study Plan based on your profile gaps...`);
  const studyPrompt = `
  You are an expert Salesforce Career Coach. 
  The user has the following skills: ${skillsStr}. 
  They have ${jsonResult.experienceYears} years of experience.
  
  Based on modern Salesforce Developer requirements, identify 3 critical missing skills or areas they need to study to land a high-paying job.
  Provide a short, direct study plan recommending specific topics to focus on.
  Format your response as a clean, highly readable markdown list.
  `;

  const studyPlan = await askGemma(studyPrompt);
  
  const studyPath = path.resolve(process.cwd(), 'TAILORED_STUDY_PLAN.md');
  fs.writeFileSync(studyPath, studyPlan);
  console.log(`\n🎉 Study Plan generated and saved to: TAILORED_STUDY_PLAN.md\n`);
  console.log(studyPlan);
}

main();
