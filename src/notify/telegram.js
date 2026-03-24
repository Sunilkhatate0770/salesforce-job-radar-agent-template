const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_MAX_LEN = 3800;

function basename(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "attachment";
}

function splitIntoChunks(text, maxLen = TELEGRAM_MAX_LEN) {
  const input = String(text || "");
  if (input.length <= maxLen) return [input];

  const blocks = input.split("\n\n");
  const chunks = [];
  let current = "";

  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }

    const candidate = `${current}\n\n${block}`;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      chunks.push(current);
      current = block;
    }
  }

  if (current) {
    chunks.push(current);
  }

  const normalized = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      normalized.push(chunk);
      continue;
    }

    for (let i = 0; i < chunk.length; i += maxLen) {
      normalized.push(chunk.slice(i, i + maxLen));
    }
  }

  return normalized;
}

async function sendTelegramChunk({ token, chatId, text }) {
  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram API error: ${json.description || "unknown error"}`);
  }
}

async function sendTelegramDocument({ token, chatId, filePath, caption }) {
  const url = `${TELEGRAM_API}/bot${token}/sendDocument`;
  const fs = await import("node:fs/promises");
  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(
    "document",
    new Blob([fileBuffer]),
    basename(filePath)
  );
  if (caption) {
    form.append("caption", caption);
  }

  const res = await fetch(url, {
    method: "POST",
    body: form
  });

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram document API error: ${json.description || "unknown error"}`);
  }
}

export async function sendTelegramMessage(text, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("❌ Telegram env variables missing");
    return false;
  }

  const chunks = splitIntoChunks(text);
  let sentCount = 0;
  const attachments = Array.isArray(options.attachments)
    ? options.attachments
    : [];
  const telegramMaxDocs = Math.max(
    0,
    Number(process.env.TELEGRAM_MAX_DOCS_PER_RUN || 2)
  );

  for (const chunk of chunks) {
    try {
      await sendTelegramChunk({ token, chatId, text: chunk });
      sentCount += 1;
    } catch (err) {
      console.log("❌ Telegram send failed:", err.message);
      return false;
    }
  }

  let sentDocs = 0;
  for (const attachment of attachments.slice(0, telegramMaxDocs)) {
    const filePath = String(attachment?.path || "").trim();
    if (!filePath) continue;

    try {
      await sendTelegramDocument({
        token,
        chatId,
        filePath,
        caption: attachment.caption || "Tailored resume file"
      });
      sentDocs += 1;
    } catch (err) {
      console.log(`⚠️ Telegram document send failed (${filePath}): ${err.message}`);
    }
  }

  console.log(`📲 Telegram message sent (${sentCount} chunk${sentCount > 1 ? "s" : ""})`);
  if (sentDocs > 0) {
    console.log(`📎 Telegram document sent (${sentDocs} file${sentDocs > 1 ? "s" : ""})`);
  }
  return true;
}
