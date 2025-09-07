const BASE = process.env.BASE || 'http://localhost:3000';

let deviceCookie = '';
const fetchWithTimeout = async (url, opts = {}, ms = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const headers = Object.assign({}, opts.headers || {});
    if (deviceCookie) headers['Cookie'] = deviceCookie;
    const res = await fetch(url, { ...opts, headers, signal: controller.signal, redirect: 'follow' });
    // Capture device_token cookie if set
    try {
      const setCookie = res.headers.get('set-cookie');
      if (setCookie && setCookie.includes('device_token=')) {
        const match = setCookie.match(/device_token=[^;]+/);
        if (match) deviceCookie = match[0];
      }
    } catch {}
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, json };
  } finally { clearTimeout(id); }
};

const assert = (cond, label) => { if (!cond) throw new Error('ASSERT_FAIL ' + label); };

(async () => {
  const out = [];
  const log = (k, v) => { out.push({ [k]: v }); console.log('---', k, JSON.stringify(v)); };

  // 1) Create event
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const todayDdMmYyyy = `${dd}-${mm}-${yyyy}`;
  const ce = await fetchWithTimeout(`${BASE}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'E2E', date: todayDdMmYyyy, startTime: '20:00', durationMinutes: 60 }) });
  log('create_event', ce); assert(ce.ok && ce.json.code, 'create_event');
  const { id: eventId, code } = ce.json;

  // 2) Get by code
  const ge = await fetchWithTimeout(`${BASE}/api/events?code=${encodeURIComponent(code)}`);
  log('get_event', ge); assert(ge.ok && ge.json.id === eventId, 'get_event');

  // 3) Nickname check
  const handle = 'u' + Math.floor(Math.random()*1e9);
  const nc = await fetchWithTimeout(`${BASE}/api/nickname/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
  log('nick_check', nc); assert(nc.ok && nc.json.available === true, 'nick_check');

  // 4) Create anonymous user
  const ua = await fetchWithTimeout(`${BASE}/api/users/anonymous`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, displayName: 'E2E User' }) });
  log('anon_user', ua); assert(ua.ok && ua.json.id, 'anon_user');
  const userId = ua.json.id;

  // 5) Join participant
  const pj = await fetchWithTimeout(`${BASE}/api/events/${eventId}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode: 'join' }) });
  log('join_participant', pj); assert(pj.ok && pj.json.id, 'join_participant');

  // 6) Upsert two teams
  const t1 = await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 1, name: 'A', color: '#16a34a' }) });
  const t2 = await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 2, name: 'B', color: '#16a34a' }) });
  log('teams', { t1, t2 }); assert(t1.ok && t2.ok, 'teams');

  // 7) Roster lock enforcement
  const lock = await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: true }) });
  log('lock_roster_on', lock); assert(lock.ok && lock.json.rosterLocked === true, 'lock_on');
  const tryJoin = await fetchWithTimeout(`${BASE}/api/events/${eventId}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestName: 'Guest', mode: 'join' }) });
  log('join_when_locked', tryJoin); assert(tryJoin.status === 403, 'join_locked_403');
  const unlock = await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: false }) });
  log('lock_roster_off', unlock); assert(unlock.ok && unlock.json.rosterLocked === false, 'lock_off');

  // 8) Lineup lock enforcement
  const teams = await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`);
  const team1 = teams.json.find((x) => x.index === 1);
  const posLock = await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineupLocked: true }) });
  log('lock_lineup_on', posLock); assert(posLock.ok && posLock.json.lineupLocked === true, 'lineup_lock_on');
  const posTry = await fetchWithTimeout(`${BASE}/api/teams/${team1.id}/positions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: pj.json.id, x: 0.5, y: 0.5 }) });
  log('positions_when_locked', posTry); assert(posTry.status === 403, 'pos_locked_403');
  await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineupLocked: false }) });

  // 9) Autobalance preview & apply
  const abPrev = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: false }) });
  const abApply = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: true }) });
  log('autobalance', { abPrev, abApply }); assert(abApply.ok, 'autobalance_apply');

  // 10) Ensure lineup unlocked then finish event (starts MVP in 10m)
  await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineupLocked: false }) });
  const fin1 = await fetchWithTimeout(`${BASE}/api/events/${eventId}/finish`, { method: 'POST' }, 30000);
  log('finish_event_try1', fin1);
  const fin = fin1.ok ? fin1 : await fetchWithTimeout(`${BASE}/api/events/${eventId}/finish`, { method: 'POST' }, 30000);
  log('finish_event', fin); assert(fin.ok, 'finish_event');

  console.log('E2E_OK', { eventId, code });
})().catch((e) => { console.error('E2E_FAIL', e?.message || e); process.exit(1); });


