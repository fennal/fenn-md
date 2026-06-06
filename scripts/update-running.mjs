#!/usr/bin/env node
/**
 * Refreshes src/data/running.json from the Strava API.
 * Run locally or on a schedule (see .github/workflows/update-running.yml).
 *
 * Required env vars (set as GitHub Action secrets when deployed):
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
 * Get a refresh token once via Strava OAuth with scope `activity:read_all`.
 *
 * Streak rules (important — these match the real streak):
 *  - A run counts for EVERY calendar day it touches, using start_date_local +
 *    elapsed_time. This makes 24h+ races (one Strava activity, two calendar days)
 *    count for both days instead of leaving a false "rest day".
 *  - Days are taken from start_date_local, i.e. the athlete's local clock, so a
 *    late-night run is credited to the right day regardless of UTC offset.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const META = 0.000621371; // meters -> miles
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'running.json');

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.error('Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_REFRESH_TOKEN');
  process.exit(1);
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const dayKey = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
// Midnight (UTC frame) of a Strava local timestamp, e.g. "2026-02-07T09:00:00Z".
const localMidnight = (iso) => new Date(iso.slice(0, 10) + 'T00:00:00Z');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strava occasionally hiccups (e.g. CloudFront returns a 5xx HTML error page during
// token refresh). Retry transient failures — server errors, rate limits, and network
// errors — with backoff, but fail fast on real 4xx (bad token/credentials).
async function fetchRetry(url, opts = {}, label = 'request', tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      const body = (await res.text()).slice(0, 200);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${label}: ${res.status} (transient) — ${body}`);
      } else {
        throw new Error(`${label}: ${res.status} — ${body}`); // 4xx: don't retry
      }
    } catch (e) {
      lastErr = e; // network error — retryable
    }
    if (i < tries - 1) {
      console.warn(`${label} attempt ${i + 1} failed, retrying… (${lastErr.message})`);
      await sleep(2000 * (i + 1)); // 2s, 4s, 6s
    }
  }
  throw lastErr;
}

async function getAccessToken() {
  // Strava's /oauth/token expects application/x-www-form-urlencoded (URLSearchParams
  // sets that header automatically), not JSON.
  const res = await fetchRetry('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  }, 'token exchange');
  return (await res.json()).access_token;
}

const api = async (path, token) => {
  const res = await fetchRetry(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, `GET ${path}`);
  return res.json();
};

const main = async () => {
  const token = await getAccessToken();
  const me = await api('/athlete', token);
  const stats = await api(`/athletes/${me.id}/stats`, token);

  const covered = new Set(); // every calendar day touched by a run
  const milesByStartDay = new Map(); // start day -> miles (full distance counted once)
  let lastRun = null;
  let oldestFetched = null;
  let page = 1;
  let done = false;

  const streakBreaks = () => {
    // walk back from today (or yesterday if today not yet run) to the first uncovered day
    let cur = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    if (!covered.has(dayKey(cur))) cur = addDays(cur, -1);
    while (covered.has(dayKey(cur))) cur = addDays(cur, -1);
    return cur; // the day that breaks the streak
  };

  while (page <= 30 && !done) {
    const acts = await api(`/athlete/activities?per_page=200&page=${page}`, token);
    if (!acts.length) break;
    for (const a of acts) {
      if (!RUN_TYPES.has(a.type) && !RUN_TYPES.has(a.sport_type)) continue;
      const start = localMidnight(a.start_date_local);
      const end = new Date(new Date(a.start_date_local).getTime() + (a.elapsed_time || 0) * 1000);
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) covered.add(dayKey(d));
      const sk = dayKey(start);
      milesByStartDay.set(sk, (milesByStartDay.get(sk) || 0) + a.distance * META);
      if (!lastRun) {
        const mi = a.distance * META;
        let pace = '';
        if (mi > 0.05 && a.moving_time > 0) {
          const secPerMi = a.moving_time / mi;
          let m = Math.floor(secPerMi / 60);
          let s = Math.round(secPerMi % 60);
          if (s === 60) { m += 1; s = 0; }
          pace = `${m}:${String(s).padStart(2, '0')}`; // min/mile, e.g. "7:26"
        }
        lastRun = { date: sk, name: a.name, miles: +mi.toFixed(1), pace };
      }
      oldestFetched = sk;
    }
    // Stop once the streak-breaking day is newer than the oldest activity we've seen
    // (i.e. the break is real, not just "we haven't fetched far enough back").
    if (dayKey(streakBreaks()) > oldestFetched) done = true;
    page++;
  }

  const breakDay = streakBreaks();
  const start = addDays(breakDay, 1); // first day of the streak
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const anchor = covered.has(dayKey(today)) ? today : addDays(today, -1);
  const streakDays = Math.round((anchor - start) / 86400000) + 1;

  let streakMiles = 0;
  for (const [day, mi] of milesByStartDay) if (day >= dayKey(start)) streakMiles += mi;

  // rest days inside the streak window (should be 0 for a true streak)
  let restDays = 0;
  for (let d = new Date(start); d <= anchor; d = addDays(d, 1)) if (!covered.has(dayKey(d))) restDays++;

  const data = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'Strava',
    streakDays,
    streakStart: dayKey(start),
    streakMiles: Math.round(streakMiles),
    restDays,
    totalMiles: Math.round(stats.all_run_totals.distance * META),
    totalRuns: stats.all_run_totals.count,
    ytdMiles: Math.round(stats.ytd_run_totals.distance * META),
    ytdRuns: stats.ytd_run_totals.count,
    lastRun,
  };
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log('updated running.json:', data);
};

main().catch((e) => { console.error(e); process.exit(1); });
