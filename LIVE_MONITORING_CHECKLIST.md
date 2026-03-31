# Live Monitoring Checklist

Use this after the agent is already deployed and running.

## Quick health check

From the repo root, run:

```powershell
npm run health:live
```

That prints recent health for:

- `supabase-edge`
- `github-actions`

## What healthy looks like

- `succeeded` runs
- `telegram ok`
- `email ok`
- some listing coverage across recent runs
- post coverage appearing sometimes, not necessarily every run

## What is normal

- `new jobs: 0` on many runs
- `alerts sent: 0` when dedupe finds nothing new
- `posts: 0` on some runs, because public hiring posts are unstable by source
- `direct` showing paused when Naukri direct is recaptcha-blocked

## What needs attention

- repeated failed runs
- `email failed` or `telegram failed`
- `coverage alerts seen`
- long zero-post streaks if they continue over many runs
- total listing volume dropping abnormally for multiple cycles

## Gmail checks

- Agent emails should be visible under the `Agent Mail` label
- Gmail will still keep them in `All Mail`; that is normal
- If label notifications stop, re-check Gmail app label notifications for `Agent Mail`

## Telegram checks

- keep the agent chat unmuted
- if notifications stop, confirm the chat is not archived/muted on the phone

## Recommended review rhythm

- quick check once in the morning
- quick check once in the evening
- deeper check only if coverage alerts appear or expected opportunities seem missing
