import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const CURSOR_PATH = new URL("../../.cache/fetch-cursor.json", import.meta.url);
const STATE_KEY = "fetch_cursor";

async function readCursor() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return Number(payload?.plan_index || 0) || 0;
  }

  try {
    const parsed = await readJsonFile(CURSOR_PATH);
    return Number(parsed.plan_index || 0) || 0;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    console.log("⚠️ Fetch cursor read failed:", error.message);
    return 0;
  }
}

async function writeCursor(planIndex) {
  const payload = {
    plan_index: planIndex,
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(CURSOR_PATH, payload);
}

export async function getNextPlanStartIndex(planCount) {
  if (!Number.isInteger(planCount) || planCount <= 0) return 0;

  const current = await readCursor();
  const normalized = ((current % planCount) + planCount) % planCount;
  await writeCursor((normalized + 1) % planCount);
  return normalized;
}

