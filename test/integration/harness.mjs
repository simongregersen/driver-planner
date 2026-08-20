// Shared plumbing for the emulator-backed integration specs in this directory.
//
// These specs talk to the Realtime Database emulator over its REST API rather than through the
// Firebase SDK, deliberately: the point of an integration test here is to observe what the
// database itself does with a given payload, and going through the same client library the app
// uses would let that library's own normalization hide the very behaviour under test. Raw REST
// shows exactly what was stored.

const BASE = process.env.DATABASE_EMULATOR_URL ?? 'http://localhost:9000';
const NS = 'driver-planner';

/** The emulator accepts unsigned JWTs, which is how a specific signed-in user is simulated. */
function jwt(uid) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({alg: 'none', typ: 'JWT'})}.${b64({
    iss: `https://securetoken.google.com/${NS}`, aud: NS, auth_time: now,
    user_id: uid, sub: uid, iat: now, exp: now + 3600,
    firebase: {identities: {}, sign_in_provider: 'custom'},
  })}.`;
}

export async function req(path, {method = 'PUT', body, as, qs = {}} = {}) {
  const url = new URL(`${BASE}/${path}.json`);
  url.searchParams.set('ns', NS);
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  const headers = {'Content-Type': 'application/json'};
  // `Bearer owner` bypasses rules entirely — used only to seed fixtures.
  if (as === 'owner') headers.Authorization = 'Bearer owner';
  else if (as) url.searchParams.set('auth', jwt(as));
  const res = await fetch(url, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* a rules rejection returns a non-JSON body */ }
  return {status: res.status, text, json};
}

let passed = 0;
const failures = [];

export function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

export const allowed = r => r.status < 300;
export const denied = r => r.status >= 400;

/** Writes `body` at `path` as the owner and returns it exactly as the database gives it back. */
export async function roundTrip(path, body) {
  await req(path, {as: 'owner', body});
  return (await req(path, {as: 'owner', method: 'GET'})).json;
}

/** Prints the tally and exits non-zero if anything failed. Call at the end of every spec. */
export function summarize() {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

/**
 * Fails fast, and legibly, when nothing is listening on the emulator port.
 *
 * Without this a spec run against no emulator dies on a bare `fetch failed` from whichever
 * assertion happened to go first, which reads like a broken test rather than a missing
 * dependency. The npm scripts start the emulator themselves (`firebase emulators:exec`), so this
 * only fires when a spec is invoked directly.
 */
async function requireEmulator() {
  try {
    const res = await fetch(`${BASE}/.json?ns=${NS}`, {headers: {Authorization: 'Bearer owner'}});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`No Realtime Database emulator answering on ${BASE} (${err.message}).`);
    console.error('Run the integration specs with `npm run test:integration`, which starts one');
    console.error('for the duration of the run, or point DATABASE_EMULATOR_URL at your own.');
    process.exit(1);
  }
}

/** Wraps a spec's entry point: checks the emulator is up, then runs it and reports. */
export function run(main) {
  requireEmulator()
    .then(main)
    .then(summarize)
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
