function normalizeList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeEmailAddress(value) {
  const raw = String(value || "")
    .replace(/\r/g, "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();

  if (!raw) {
    return "";
  }

  const namedMatch = raw.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  if (namedMatch) {
    const name = String(namedMatch[1] || "")
      .replace(/^["']+|["']+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const email = String(namedMatch[2] || "").trim();
    return name ? `${name} <${email}>` : email;
  }

  return raw.replace(/\s+/g, "");
}

function normalizeEmailList(value) {
  const raw = String(value || "").replace(/\r/g, "\n");
  const namedOrPlainMatches = raw.match(
    /[^,<;\n]*<\s*[^<>\s]+@[^<>\s]+\s*>|[^<>\s,;\n]+@[^<>\s,;\n]+/g
  );

  if (!namedOrPlainMatches) {
    const normalized = normalizeEmailAddress(raw);
    return normalized ? [normalized] : [];
  }

  return namedOrPlainMatches
    .map(item => normalizeEmailAddress(item))
    .filter(Boolean);
}

function formatFromAddress(address, displayName) {
  const normalizedAddress = String(address || "").trim();
  const normalizedName = String(displayName || "").trim();

  if (!normalizedAddress) {
    return "";
  }
  if (!normalizedName) {
    return normalizedAddress;
  }

  return `${normalizedName} <${normalizedAddress}>`;
}

function getEmailConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = normalizeEmailAddress(process.env.SMTP_USER || "");
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const fromAddress = normalizeEmailAddress(process.env.EMAIL_FROM || "");
  const to = normalizeEmailList(process.env.EMAIL_TO || "").join(", ");
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const displayName = String(
    process.env.EMAIL_FROM_NAME || process.env.AGENT_NAME || ""
  ).trim();
  const from = formatFromAddress(fromAddress, displayName);

  if (!host || !user || !pass || !fromAddress || !to) {
    return null;
  }

  return { host, port, user, pass, from, to, secure };
}

function getResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const fromAddress = normalizeEmailAddress(
    process.env.RESEND_FROM || process.env.EMAIL_FROM || ""
  );
  const to = normalizeEmailList(
    process.env.RESEND_TO || process.env.EMAIL_TO || ""
  );
  const replyTo = normalizeEmailAddress(
    process.env.RESEND_REPLY_TO || process.env.EMAIL_REPLY_TO || ""
  );
  const displayName = String(
    process.env.RESEND_FROM_NAME ||
    process.env.EMAIL_FROM_NAME ||
    process.env.AGENT_NAME ||
    ""
  ).trim();
  const from = formatFromAddress(fromAddress, displayName);

  if (!apiKey || !fromAddress || to.length === 0) {
    return null;
  }

  return {
    apiKey,
    from,
    to,
    replyTo
  };
}

function getProviderOrder() {
  const configured = normalizeList(
    process.env.EMAIL_PROVIDER_ORDER || "resend,smtp"
  ).map(value => value.toLowerCase());

  const providers = configured.filter(value =>
    ["resend", "smtp"].includes(value)
  );

  return providers.length > 0 ? providers : ["resend", "smtp"];
}

function createTransport(config) {
  return import("nodemailer").then(module =>
    module.default.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    })
  );
}

async function loadResendAttachments(attachments) {
  const normalized = [];

  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const filePath = String(attachment?.path || "").trim();
    if (!filePath) continue;

    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "base64");
    normalized.push({
      filename: String(attachment?.filename || "").trim() || "attachment",
      content
    });
  }

  return normalized;
}

async function sendEmailViaSmtp(config, message) {
  const transporter = await createTransport(config);
  try {
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
      headers: message.headers
    });
  } finally {
    if (typeof transporter.close === "function") {
      transporter.close();
    }
  }
}

async function sendEmailViaResend(config, message) {
  const attachments = await loadResendAttachments(message.attachments);
  const toValue = config.to.length === 1 ? config.to[0] : config.to;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      from: config.from,
      to: toValue,
      reply_to: config.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments,
      headers: message.headers
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API ${response.status}: ${errorText.slice(0, 180)}`);
  }

  return response.json();
}

export async function sendEmailMessage({ subject, text, html, attachments = [] }) {
  const smtpConfig = getEmailConfig();
  const resendConfig = getResendConfig();

  const prefix = String(process.env.EMAIL_SUBJECT_PREFIX || "").trim();
  const subjectWithPrefix = prefix ? `${prefix} ${subject}` : subject;

  const labelHeaderName = String(process.env.EMAIL_LABEL_HEADER_NAME || "X-Agent-Mail").trim();
  const labelHeaderValue = String(process.env.EMAIL_LABEL_HEADER_VALUE || "true").trim();
  const labelHeaders = labelHeaderName ? { [labelHeaderName]: labelHeaderValue } : undefined;

  const message = {
    subject: subjectWithPrefix,
    text,
    html,
    attachments,
    headers: labelHeaders
  };

  const providerOrder = getProviderOrder();
  const errors = [];

  for (const provider of providerOrder) {
    try {
      if (provider === "resend") {
        if (!resendConfig) continue;
        const data = await sendEmailViaResend(resendConfig, message);
        console.log(
          `📧 Email message sent via Resend${data?.id ? ` (${data.id})` : ""}${attachments.length > 0 ? ` with ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}` : ""}`
        );
        return true;
      }

      if (provider === "smtp") {
        if (!smtpConfig) continue;
        await sendEmailViaSmtp(smtpConfig, message);
        console.log(
          `📧 Email message sent via SMTP${attachments.length > 0 ? ` (with ${attachments.length} attachment${attachments.length > 1 ? "s" : ""})` : ""}`
        );
        return true;
      }
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
      console.log(`⚠️ Email provider '${provider}' failed: ${error.message}`);
    }
  }

  if (!smtpConfig && !resendConfig) {
    console.log("ℹ️ Email notifier skipped: no configured email provider.");
    console.log("   To enable email alerts, set either SMTP_* (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO) or RESEND_* (RESEND_API_KEY, RESEND_FROM, RESEND_TO) env vars.");
  } else {
    console.log(`❌ Email send failed: ${errors.join(" | ") || "no available provider"}`);
  }

  return false;
}
