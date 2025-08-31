const BASE = process.env.BASE || 'http://localhost:3000';

const fetchWithTimeout = async (url, opts = {}, ms = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, json };
  } finally { clearTimeout(id); }
};

const log = (label, data) => {
  console.log('--- ' + label + ' ---');
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

(async () => {
  // 1) Create event
  let ce = await fetchWithTimeout(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Test', durationMinutes: 60 }),
  });
  if (!ce.ok) {
    ce = await fetchWithTimeout(`${BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Test', durationMinutes: 60 }),
    }, 20000);
  }
  log('create_event', ce);
  if (!ce.ok || !ce.json.code) throw new Error('create_event failed');
  const code = ce.json.code;

  // 2) Get event by code (query param)
  const ev = await fetchWithTimeout(`${BASE}/api/events?code=${encodeURIComponent(code)}`);
  log('get_event', ev);
  if (!ev.ok || !ev.json.id) throw new Error('get_event failed');
  const eventId = ev.json.id;

  // 3) Anonymous user bind
  const handle = 's' + Math.floor(Math.random() * 1e9);
  const ua = await fetchWithTimeout(`${BASE}/api/users/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, displayName: 'Smoke User' }),
  });
  log('anonymous_user', ua);
  if (!ua.ok || !ua.json.id) throw new Error('anonymous_user failed');
  const userId = ua.json.id;

  // 4) Join participant
  const pj = await fetchWithTimeout(`${BASE}/api/events/${eventId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, mode: 'join' }),
  });
  log('join_participant', pj);
  if (!pj.ok || !pj.json.id) throw new Error('join_participant failed');

  // 5) Upsert teams 1 and 2
  const t1 = await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 1, name: 'A' })
  });
  const t2 = await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 2, name: 'B' })
  });
  log('team1', t1); log('team2', t2);
  if (!t1.ok || !t2.ok) throw new Error('teams failed');

  // 6) Auto-balance apply greedy
  const ab = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: true })
  });
  log('autobalance', ab);
  if (!ab.ok) throw new Error('autobalance failed');

  // 7) Snapshot
  const ss = await fetchWithTimeout(`${BASE}/api/events/${eventId}/snapshot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'smoke' })
  });
  log('snapshot', ss);
  if (!ss.ok) throw new Error('snapshot failed');

  console.log('SMOKE_RESULT OK', { code, eventId });
})().catch((err) => { console.error('SMOKE_RESULT FAIL', err?.message || err); process.exit(1); });
