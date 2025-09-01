"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type UserCard = { id: string; foot: "L"|"R"|null; pace: number|null; shoot: number|null; pass: number|null; defend: number|null };

export default function NicknamePage() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [available, setAvailable] = useState<null | boolean>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [card, setCard] = useState<UserCard | null>(null);
  const mode = (search.get("mode") as "join"|"view") || "join";
  const [cardSaved, setCardSaved] = useState(false);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [autoJoined, setAutoJoined] = useState<boolean>(false);

  const check = async (h: string) => {
    setHandle(h);
    if (!h || h.length < 3) { setAvailable(null); return; }
    const r = await fetch('/api/nickname/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: h.toLowerCase() }) });
    const d = await r.json(); setAvailable(d.available ?? false);
  };

  const saveNickname = async () => {
    const r = await fetch('/api/users/anonymous', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: handle.toLowerCase(), displayName: displayName || handle }) });
    const d = await r.json();
    if (r.ok) {
      setUserId(d.id);
      // If user initiated Join, auto-join immediately after nickname
      try {
        if (mode === 'join' && eventId) {
          const pj = await fetch(`/api/events/${eventId}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: d.id, mode: 'join' }) });
          if (pj.ok) setAutoJoined(true);
        }
      } catch {}
    } else {
      alert(d.error || 'Error');
    }
  };

  useEffect(() => {
    const loadCard = async () => {
      if (!userId) return;
      const r = await fetch(`/api/users/${userId}/card`);
      if (r.ok) setCard(await r.json());
    };
    loadCard();
  }, [userId]);

  useEffect(() => {
    (async () => { try { const m = await fetch('/api/me'); if (m.ok) setMe(await m.json()); } catch {} })();
  }, []);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const r = await fetch(`/api/events?code=${encodeURIComponent(params.code as string)}`);
        if (r.ok) { const e = await r.json(); setEventId(e.id); }
      } catch {}
    };
    loadEvent();
  }, [params.code]);

  const ensureBase = (): UserCard => (
    card || { id: userId || 'me', foot: 'R', pace: 3, shoot: 3, pass: 3, defend: 3 }
  );

  const isCardValid = (c: UserCard|null) => !!c && !!c.foot && [c.pace,c.shoot,c.pass,c.defend].every(v=>typeof v==='number' && v>=1 && v<=5);

  const saveCard = async () => {
    if (!userId) return;
    const c = ensureBase();
    if (!isCardValid(c)) { alert('Please complete your player profile card'); return; }
    const payload = { foot: c.foot, pace: c.pace, shoot: c.shoot, pass: c.pass, defend: c.defend };
    const r = await fetch(`/api/users/${userId}/card`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { const d = await r.json(); alert(d.error || 'Error'); return; }
    setCardSaved(true);
    // On view mode, register view; on join, we already auto-joined
    const ev = await fetch(`/api/events?code=${encodeURIComponent(params.code as string)}`);
    const e = await ev.json();
    if (mode !== 'join') {
      await fetch(`/api/events/${e.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'view' }) });
    }
    router.push(`/ev/${params.code}/teams`);
  };

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Nickname</h1>
        <div>
          <label className="block text-sm">Handle</label>
          <input className="border rounded p-2 w-full" value={handle} onChange={(e)=>check(e.target.value)} />
          {available !== null && <p className={`text-sm ${available?'text-green-600':'text-red-600'}`}>{available?'Available':'Taken/Invalid'}</p>}
        </div>
        <div>
          <label className="block text-sm">Display name</label>
          <input className="border rounded p-2 w-full" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
        </div>
        <button disabled={!available} onClick={saveNickname} className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded">Save handle</button>
      </section>

      {userId && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Player Profile Card (required)</h2>
          <div className="rounded-xl border bg-white text-black shadow p-4">
            <div className="text-center font-semibold mb-2">{displayName || handle || 'Your Name'}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Foot</label>
                <select className="border rounded p-2 w-full" value={ensureBase().foot ?? ''} onChange={(e)=>setCard({ ...ensureBase(), foot: e.target.value as 'L'|'R' })}>
                  <option value="">Select</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                </select>
              </div>
              <div>
                <label className="block text-sm">Pace</label>
                <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().pace ?? 3} onChange={(e)=>setCard({ ...ensureBase(), pace: parseInt(e.target.value||'3',10) })} />
              </div>
              <div>
                <label className="block text-sm">Shoot</label>
                <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().shoot ?? 3} onChange={(e)=>setCard({ ...ensureBase(), shoot: parseInt(e.target.value||'3',10) })} />
              </div>
              <div>
                <label className="block text-sm">Pass</label>
                <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().pass ?? 3} onChange={(e)=>setCard({ ...ensureBase(), pass: parseInt(e.target.value||'3',10) })} />
              </div>
              <div>
                <label className="block text-sm">Defend</label>
                <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().defend ?? 3} onChange={(e)=>setCard({ ...ensureBase(), defend: parseInt(e.target.value||'3',10) })} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveCard} className="bg-green-600 text-white px-3 py-2 rounded">Save and continue</button>
          </div>
        </section>
      )}
    </main>
  );
}


