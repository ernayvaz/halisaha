"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Event = { id: string; code: string; name?: string | null; date?: string | null; startTime?: string | null; durationMinutes?: number | null };

export default function Landing() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      try {
        const r = await fetch(`/api/events?code=${encodeURIComponent(code)}`);
        if (!r.ok) { setError("Event not found"); return; }
        setEventData(await r.json());
      } catch { setError("Network error"); }
    };
    run();
    (async () => {
      try { const m = await fetch('/api/me'); if (m.ok) setMe(await m.json()); } catch {}
    })();
  }, [params?.code]);

  if (error) return <main className="p-6 max-w-xl mx-auto"><h1 className="text-xl font-bold">{error}</h1></main>;
  if (!eventData) return <main className="p-6 max-w-xl mx-auto">Loading…</main>;

  const go = async (mode: "join" | "view") => {
    if (!eventData) return;
    if (!me) { router.push(`/ev/${eventData.code}/nickname?mode=${mode}`); return; }
    try {
      setBusy(true);
      if (mode === 'join') {
        await fetch(`/api/events/${eventData.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: me.id, mode: 'join' }) });
      } else {
        await fetch(`/api/events/${eventData.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'view' }) });
      }
      router.push(`/ev/${eventData.code}/teams`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{eventData.name || "Pickup Game"}</h1>
        <p className="text-sm text-gray-500">{eventData.date || ""} {eventData.startTime || ""} • {eventData.durationMinutes || 60} min</p>
      </div>
      <div className="space-y-3">
        <button disabled={busy} onClick={() => go("join")} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded disabled:opacity-50">{me? (busy? 'Processing…' : 'Join Team (skip nickname)') : 'Join Team'}</button>
        <button disabled={busy} onClick={() => go("view")} className="w-full border px-4 py-3 rounded disabled:opacity-50">{me? (busy? 'Processing…' : 'Continue as viewer (skip)') : 'Continue as viewer'}</button>
      </div>
      <p className="text-xs text-gray-500">Note: Lobby is disabled; you can set teams and lineup directly.</p>
    </main>
  );
}


