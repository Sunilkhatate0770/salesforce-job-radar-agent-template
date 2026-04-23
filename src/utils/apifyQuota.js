import fs from 'fs';
import path from 'path';

const QUOTA_PATH = path.resolve(process.cwd(), '.cache/apify-quota.json');

/**
 * Budgeting logic to distribute Apify usage across the month.
 * Default: 1000 units/month (approx for free tier or low paid)
 */
const MONTHLY_LIMIT = Number(process.env.APIFY_MONTHLY_UNIT_LIMIT || 1000); 

export async function checkApifyQuota() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
  
  let data = { month: currentMonth, used: 0 };
  
  if (fs.existsSync(QUOTA_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf8'));
      if (saved.month === currentMonth) {
        data = saved;
      }
    } catch (e) {}
  }
  
  const dailyLimit = Math.ceil(MONTHLY_LIMIT / 30);
  const remainingMonth = MONTHLY_LIMIT - data.used;
  
  // Calculate usage in the last 24 hours (simplified: just for today)
  const today = now.toISOString().split('T')[0];
  if (!data.daily) data.daily = {};
  const usedToday = data.daily[today] || 0;

  console.log(`📊 Apify Quota: Month Used ${data.used}/${MONTHLY_LIMIT} | Today Used ${usedToday}/${dailyLimit}`);
  
  if (data.used >= MONTHLY_LIMIT) {
    console.error('❌ Apify Monthly Quota Exceeded!');
    return false;
  }

  if (usedToday >= dailyLimit) {
    console.error('⚠️ Apify Daily Quota Exceeded! (Distributing monthly limit)');
    return false;
  }
  
  return true;
}

export async function recordApifyUsage(units = 1) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const today = now.toISOString().split('T')[0];
  
  let data = { month: currentMonth, used: 0, daily: {} };
  
  if (fs.existsSync(QUOTA_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf8'));
      if (data.month !== currentMonth) {
        data = { month: currentMonth, used: 0, daily: {} };
      }
    } catch (e) {}
  }
  
  if (!data.daily) data.daily = {};
  data.used += units;
  data.daily[today] = (data.daily[today] || 0) + units;
  
  // Cleanup old daily records (keep only last 7 days)
  const dailyKeys = Object.keys(data.daily).sort();
  if (dailyKeys.length > 7) {
    delete data.daily[dailyKeys[0]];
  }

  fs.mkdirSync(path.dirname(QUOTA_PATH), { recursive: true });
  fs.writeFileSync(QUOTA_PATH, JSON.stringify(data, null, 2));
}
