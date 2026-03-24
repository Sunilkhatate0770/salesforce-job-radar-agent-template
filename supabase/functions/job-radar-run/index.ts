import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import process from "node:process";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

function buildJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: jsonHeaders
  });
}

function normalize(value: string | undefined | null, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isAuthorized(request: Request) {
  const expected = normalize(Deno.env.get("JOB_RADAR_CRON_SECRET"));
  if (!expected) {
    return true;
  }

  const actual = normalize(
    request.headers.get("x-job-radar-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  );

  return actual === expected;
}

Deno.serve(async request => {
  try {
    if (!isAuthorized(request)) {
      return buildJson(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }

    if (!("process" in globalThis)) {
      Object.assign(globalThis, { process });
    }

    const module = await import("../../../src/cloud/runSupabaseCloudAgent.js");
    const result = await module.runSupabaseCloudAgent();
    return buildJson(result, result?.ok === false ? 500 : 200);
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
