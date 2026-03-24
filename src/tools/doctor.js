import "dotenv/config";
import nodemailer from "nodemailer";

function mask(value) {
  const raw = String(value || "");
  if (!raw) return "missing";
  if (raw.length <= 6) return "***";
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
}

function hasAll(keys) {
  return keys.every(key => String(process.env[key] || "").trim());
}

function hasResendConfig() {
  const recipient =
    String(process.env.RESEND_TO || "").trim() ||
    String(process.env.EMAIL_TO || "").trim();

  return hasAll(["RESEND_API_KEY", "RESEND_FROM"]) && Boolean(recipient);
}

async function checkSupabase() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  ).trim();

  if (!url || !key) {
    return {
      ok: false,
      label: "Supabase",
      message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY is missing"
    };
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/job_alerts?select=job_hash&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        label: "Supabase",
        message: `HTTP ${response.status}: ${body.slice(0, 120)}`
      };
    }

    return {
      ok: true,
      label: "Supabase",
      message: "Connection and job_alerts read check passed"
    };
  } catch (error) {
    return {
      ok: false,
      label: "Supabase",
      message: error.message
    };
  }
}

async function checkTelegram() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (!token || !chatId) {
    return {
      ok: false,
      label: "Telegram",
      message: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing"
    };
  }

  try {
    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meJson = await meResponse.json();
    if (!meJson.ok) {
      return {
        ok: false,
        label: "Telegram",
        message: `getMe failed: ${meJson.description || "unknown error"}`
      };
    }

    const chatResponse = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`
    );
    const chatJson = await chatResponse.json();
    if (!chatJson.ok) {
      return {
        ok: false,
        label: "Telegram",
        message: `getChat failed: ${chatJson.description || "unknown error"}`
      };
    }

    return {
      ok: true,
      label: "Telegram",
      message: `Bot and chat access verified for chat ${mask(chatId)}`
    };
  } catch (error) {
    return {
      ok: false,
      label: "Telegram",
      message: error.message
    };
  }
}

async function checkEmailSmtp() {
  const keys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_SECURE",
    "EMAIL_FROM",
    "EMAIL_TO"
  ];

  if (!hasAll(keys)) {
    if (hasResendConfig()) {
      return {
        ok: true,
        label: "SMTP",
        message: "SMTP not configured (Resend fallback is configured)"
      };
    }

    return {
      ok: false,
      label: "SMTP",
      message: "One or more SMTP/Email env values are missing"
    };
  }

  const secure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
  });

  try {
    await transporter.verify();
    return {
      ok: true,
      label: "SMTP",
      message: `SMTP verified with user ${mask(process.env.SMTP_USER)}`
    };
  } catch (error) {
    return {
      ok: false,
      label: "SMTP",
      message: error.message
    };
  }
}

async function checkEmailResend() {
  if (!hasResendConfig()) {
    return {
      ok: true,
      label: "Resend",
      message: "RESEND_API_KEY / RESEND_FROM not set (optional fallback)"
    };
  }

  const recipient =
    String(process.env.RESEND_TO || "").trim() ||
    String(process.env.EMAIL_TO || "").trim();

  return {
    ok: true,
    label: "Resend",
    message:
      `Fallback configured with sender ${mask(process.env.RESEND_FROM)} ` +
      `and recipient ${mask(recipient)}`
  };
}

async function checkApify() {
  const token = String(process.env.APIFY_TOKEN || "").trim();
  if (!token) {
    return {
      ok: true,
      label: "Apify",
      message: "APIFY_TOKEN not set (allowed: fallback providers still run)"
    };
  }

  try {
    const response = await fetch(
      `https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`
    );
    const json = await response.json();

    if (!response.ok || !json?.data?.username) {
      return {
        ok: false,
        label: "Apify",
        message: `Token check failed: HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      label: "Apify",
      message: `Token verified for user ${json.data.username}`
    };
  } catch (error) {
    return {
      ok: false,
      label: "Apify",
      message: error.message
    };
  }
}

async function run() {
  console.log("🩺 Salesforce Job Radar Agent doctor started");

  const checks = await Promise.all([
    checkSupabase(),
    checkTelegram(),
    checkEmailSmtp(),
    checkEmailResend(),
    checkApify()
  ]);

  let failed = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`✅ ${check.label}: ${check.message}`);
    } else {
      failed += 1;
      console.log(`❌ ${check.label}: ${check.message}`);
    }
  }

  if (failed > 0) {
    console.log(`\n❌ Doctor failed: ${failed} check(s) need attention`);
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Doctor passed: all checks look good");
}

run().catch(error => {
  console.log("❌ Doctor crashed:", error.message);
  process.exitCode = 1;
});
