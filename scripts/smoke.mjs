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

const log = (label, data) => {
  console.log('--- ' + label + ' ---');
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

const sleep = (ms) => new Promise((r)=>setTimeout(r, ms));

(async () => {
  // 1) Create event
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const todayDdMmYyyy = `${dd}-${mm}-${yyyy}`;
  let ce = await fetchWithTimeout(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Test', date: todayDdMmYyyy, startTime: '20:00', durationMinutes: 60 }),
  });
  if (!ce.ok) {
    ce = await fetchWithTimeout(`${BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Test', date: todayDdMmYyyy, startTime: '20:00', durationMinutes: 60 }),
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

  // 3) Anonymous user bind (captures device_token cookie)
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

  // 4.1) Add a guest participant to ensure autobalance has at least 2 participants
  const guestJoin = await fetchWithTimeout(`${BASE}/api/events/${eventId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'join' })
  });
  log('join_guest_participant', guestJoin);
  if (!guestJoin.ok || !guestJoin.json.id) throw new Error('join_guest_participant failed');

  // 5) Upsert teams 1 and 2 (owner-only)
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

  // 6.1) Snake preview should work
  const snakePreview = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'snake', apply: false })
  });
  log('snake_preview', snakePreview);
  if (!snakePreview.ok) throw new Error('snake preview failed');

  // 7) Snapshot
  const ss = await fetchWithTimeout(`${BASE}/api/events/${eventId}/snapshot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'smoke' })
  });
  log('snapshot', ss);
  if (!ss.ok) throw new Error('snapshot failed');

  // 8) Lock roster
  const lock = await fetchWithTimeout(`${BASE}/api/events/${eventId}/flags`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: true })
  });
  log('roster_lock_on', lock);
  if (!lock.ok) throw new Error('roster_lock_on failed');

  // 9) Try assignment should fail
  const team1Id = (await fetchWithTimeout(`${BASE}/api/events/${eventId}/teams`)).json[0].id;
  const assignBlocked = await fetchWithTimeout(`${BASE}/api/teams/${team1Id}/assignments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: pj.json.id })
  });
  log('assign_blocked', assignBlocked);
  if (assignBlocked.ok || assignBlocked.status !== 403) throw new Error('assign should be blocked when roster locked');

  // 10) Preview should work, apply should fail
  const previewLocked = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: false })
  });
  log('preview_locked', previewLocked);
  if (!previewLocked.ok) throw new Error('preview should work when roster locked');

  const applyLocked = await fetchWithTimeout(`${BASE}/api/events/${eventId}/autobalance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: true })
  });
  log('apply_locked', applyLocked);
  if (applyLocked.ok || applyLocked.status !== 403) throw new Error('apply should be blocked when roster locked');

  // 11) Finish the event and open MVP soon (longer window to avoid flakiness)
  const finish = await fetchWithTimeout(`${BASE}/api/events/${eventId}/finish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startsInSeconds: 1, durationSeconds: 12 })
  });
  log('finish_event', finish);
  if (!finish.ok) throw new Error('finish failed');

  // Wait until poll opens (be generous to avoid flakiness)
  await sleep(2000);
  const pollOpen = await fetchWithTimeout(`${BASE}/api/events/${eventId}/poll`);
  log('poll_open', pollOpen);
  if (!pollOpen.ok) throw new Error('poll not open');

  // Cast a vote for the only participant
  const pollId = pollOpen.json.id;
  const startDelta = new Date(pollOpen.json.startsAt).getTime() - Date.now();
  if (startDelta > 0) await sleep(startDelta + 200);
  const vote = await fetchWithTimeout(`${BASE}/api/polls/${pollId}/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voterParticipantId: pj.json.id, targetParticipantId: pj.json.id })
  });
  log('vote', vote);
  if (!vote.ok) throw new Error('vote failed');

  // Dynamically wait until poll end, then GET to finalize and assign badge
  const endsAtIso = pollOpen.json.endsAt;
  const waitMs = Math.max(0, new Date(endsAtIso).getTime() - Date.now() + 1500);
  await sleep(waitMs);
  let pollFinal = await fetchWithTimeout(`${BASE}/api/events/${eventId}/poll`);
  log('poll_final', pollFinal);
  if (!pollFinal.ok || !pollFinal.json.finalized) {
    await sleep(2000);
    pollFinal = await fetchWithTimeout(`${BASE}/api/events/${eventId}/poll`);
    log('poll_final_retry', pollFinal);
    if (!pollFinal.ok || !pollFinal.json.finalized) throw new Error('poll not finalized');
  }

  console.log('SMOKE_RESULT OK', { code, eventId });
})().catch((err) => { console.error('SMOKE_RESULT FAIL', err?.message || err); process.exit(1); });
