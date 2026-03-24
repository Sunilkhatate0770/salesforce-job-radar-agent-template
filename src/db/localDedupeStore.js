import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const STORE_PATH = new URL("../../.cache/job-hashes.json", import.meta.url);
const STATE_KEY = "job_hashes";

function normalizeHashes(parsed) {
  if (Array.isArray(parsed)) {
    return new Set(parsed);
  }

  if (Array.isArray(parsed?.hashes)) {
    return new Set(parsed.hashes);
  }

  return new Set();
}

async function readStore() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return normalizeHashes(payload);
  }

  try {
    return normalizeHashes(await readJsonFile(STORE_PATH));
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set();
    }

    console.log("⚠️ Local dedupe read failed:", error.message);
    return new Set();
  }
}

async function writeStore(hashes) {
  const payload = {
    hashes: [...hashes],
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(STORE_PATH, payload);
}

export async function hasLocalHash(jobHash) {
  const hashes = await readStore();
  return hashes.has(jobHash);
}

export async function saveLocalHash(jobHash) {
  const hashes = await readStore();
  if (hashes.has(jobHash)) return false;

  hashes.add(jobHash);
  await writeStore(hashes);
  return true;
}

