const DEFAULT_MAX_STRING_LENGTH = 200_000;
const DEFAULT_MAX_ARRAY_ITEMS = 1_000;
const DEFAULT_MAX_OBJECT_KEYS = 300;
const DEFAULT_MAX_DEPTH = 12;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function cleanString(value, maxLength) {
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

export function sanitizeApiValue(value, options = {}, depth = 0) {
  const maxStringLength = options.maxStringLength || DEFAULT_MAX_STRING_LENGTH;
  const maxArrayItems = options.maxArrayItems || DEFAULT_MAX_ARRAY_ITEMS;
  const maxObjectKeys = options.maxObjectKeys || DEFAULT_MAX_OBJECT_KEYS;
  const maxDepth = options.maxDepth || DEFAULT_MAX_DEPTH;

  if (depth > maxDepth) return null;
  if (value === null || value === undefined) return value === undefined ? null : null;
  if (typeof value === 'string') return cleanString(value, maxStringLength);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayItems)
      .map(item => sanitizeApiValue(item, options, depth + 1));
  }
  if (typeof value !== 'object') return null;

  const output = {};
  const entries = Object.entries(value).slice(0, maxObjectKeys);
  for (const [key, item] of entries) {
    if (BLOCKED_KEYS.has(key)) continue;
    const safeKey = cleanString(key, 120);
    if (!safeKey || BLOCKED_KEYS.has(safeKey)) continue;
    output[safeKey] = sanitizeApiValue(item, options, depth + 1);
  }
  return output;
}

export function sanitizeApiBody(body, options = {}) {
  if (!body || typeof body !== 'object') return {};
  const sanitized = sanitizeApiValue(body, options);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {};
}

export function parseJsonBody(raw, options = {}) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return sanitizeApiBody(raw, options);
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  try {
    return sanitizeApiBody(JSON.parse(text), options);
  } catch {
    return {};
  }
}
