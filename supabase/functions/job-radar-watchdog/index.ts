import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type RunHistoryRow = {
  run_key: string;
  source: string;
  status: string;
  note: string;
  finished_at: string | null;
  error_message: string;
};

type WatchdogState = {
  last_alert_at?: string;
  last_alert_reason?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

function normalize(value: string | undefined | null, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isTruthy(value: string | undefined | null) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

function toPositiveInt(value: string | undefined | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function buildJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: jsonHeaders
  });
}

async function sendTelegramAlert(text: string) {
  const token = normalize(Deno.env.get("TELEGRAM_BOT_TOKEN"));
  const chatId = normalize(Deno.env.get("TELEGRAM_CHAT_ID"));

  if (!token || !chatId) {
    return {
      ok: false,
      skipped: true,
      message: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API ${response.status}: ${errorText.slice(0, 180)}`);
  }

  return {
    ok: true,
    skipped: false,
    message: "Telegram alert sent"
  };
}

Deno.serve(async request => {
  try {
    const supabaseUrl = normalize(Deno.env.get("SUPABASE_URL"));
    const supabaseKey = normalize(
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        Deno.env.get("SUPABASE_SERVICE_KEY")
    );
    if (!supabaseUrl || !supabaseKey) {
      return buildJson(
        {
          ok: false,
          error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
        },
        500
      );
    }

    const runHistoryTable = normalize(
      Deno.env.get("RUN_HISTORY_TABLE"),
      "agent_run_history"
    );
    const stateTable = normalize(
      Deno.env.get("STATE_BACKEND_TABLE"),
      "agent_state"
    );
    const stateKey = normalize(
      Deno.env.get("WATCHDOG_STATE_KEY"),
      "watchdog_alert_state"
    );
    const agentName = normalize(
      Deno.env.get("AGENT_NAME"),
      "Salesforce Job Radar Agent"
    );
    const maxSuccessAgeMinutes = toPositiveInt(
      Deno.env.get("WATCHDOG_MAX_SUCCESS_AGE_MINUTES"),
      90
    );
    const alertCooldownMinutes = toPositiveInt(
      Deno.env.get("WATCHDOG_ALERT_COOLDOWN_MINUTES"),
      240
    );
    const dryRun =
      isTruthy(new URL(request.url).searchParams.get("dry_run")) ||
      isTruthy(Deno.env.get("WATCHDOG_DRY_RUN"));

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const latestSuccessResult = await supabase
      .from(runHistoryTable)
      .select("run_key, source, status, note, finished_at, error_message")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle<RunHistoryRow>();

    if (latestSuccessResult.error) {
      throw new Error(latestSuccessResult.error.message);
    }

    const latestSuccess = latestSuccessResult.data ?? null;
    const latestSuccessMs = Date.parse(String(latestSuccess?.finished_at || ""));
    const hasFreshSuccess =
      Number.isFinite(latestSuccessMs) &&
      (Date.now() - latestSuccessMs) <= (maxSuccessAgeMinutes * 60 * 1000);

    const watchdogStateResult = await supabase
      .from(stateTable)
      .select("payload")
      .eq("state_key", stateKey)
      .maybeSingle<{ payload: WatchdogState }>();

    if (watchdogStateResult.error) {
      throw new Error(watchdogStateResult.error.message);
    }

    const watchdogState = watchdogStateResult.data?.payload || {};
    const lastAlertMs = Date.parse(String(watchdogState.last_alert_at || ""));
    const inCooldown =
      Number.isFinite(lastAlertMs) &&
      (Date.now() - lastAlertMs) <= (alertCooldownMinutes * 60 * 1000);

    if (hasFreshSuccess) {
      return buildJson({
        ok: true,
        stale: false,
        alerted: false,
        latestSuccessAt: latestSuccess?.finished_at || null,
        maxSuccessAgeMinutes
      });
    }

    const reason = latestSuccess?.finished_at
      ? `Last success is older than ${maxSuccessAgeMinutes} minutes`
      : "No successful run has been recorded yet";
    const alertMessage =
      `${agentName} watchdog alert\n\n` +
      `${reason}\n` +
      `Latest success: ${latestSuccess?.finished_at || "none"}\n` +
      `Latest run key: ${latestSuccess?.run_key || "none"}\n` +
      `Source: ${latestSuccess?.source || "unknown"}\n` +
      `Note: ${latestSuccess?.note || "n/a"}`;

    if (dryRun || inCooldown) {
      return buildJson({
        ok: true,
        stale: true,
        alerted: false,
        dryRun,
        inCooldown,
        latestSuccessAt: latestSuccess?.finished_at || null,
        reason
      });
    }

    const telegramResult = await sendTelegramAlert(alertMessage);

    const { error: writeError } = await supabase
      .from(stateTable)
      .upsert(
        {
          state_key: stateKey,
          payload: {
            last_alert_at: new Date().toISOString(),
            last_alert_reason: reason
          },
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "state_key"
        }
      );

    if (writeError) {
      throw new Error(writeError.message);
    }

    return buildJson({
      ok: true,
      stale: true,
      alerted: telegramResult.ok,
      latestSuccessAt: latestSuccess?.finished_at || null,
      reason
    });
  } catch (error) {
    return buildJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
});
