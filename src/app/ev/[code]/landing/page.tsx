"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Event = { id: string; code: string; name?: string | null; date?: string | null; startTime?: string | null; durationMinutes?: number | null };

function ParticipantsList({ eventId }: { eventId: string }) {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadParticipants = async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/participants`);
        if (response.ok) {
          const data = await response.json();
          setParticipants(data);
        }
      } catch (error) {
        console.error('Failed to load participants:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadParticipants();
  }, [eventId]);

  if (loading) {
    return (
      <div className="border rounded-lg p-4">
        <h3 className="font-medium mb-3">Current Participants</h3>
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-medium mb-3">Current Participants ({participants.length})</h3>
      {participants.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No participants yet. Be the first to join!</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1">
              <div className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">
                {(p.isGuest ? (p.guestName || 'G') : (p.user?.displayName || p.user?.handle || 'P')).slice(0,1).toUpperCase()}
              </div>
              <span className="text-sm">
                {p.isGuest ? (p.guestName || 'Guest Player') : (p.user?.displayName || p.user?.handle)}
              </span>
              {p.role === 'owner' && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                  Owner
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <h1 className="text-2xl font-bold">{eventData.name || "Pickup Match"}</h1>
        <p className="text-sm text-gray-500">
          {(() => {
            try {
              const d = eventData.date ? new Date(eventData.date) : null;
              const day = d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '';
              const time = eventData.startTime ? `${eventData.startTime}` : '';
              const dur = `${eventData.durationMinutes || 60} min`;
              return [day, time, dur].filter(Boolean).join(' • ');
            } catch { return `${eventData.startTime || ''} • ${eventData.durationMinutes || 60} min`; }
          })()}
        </p>
      </div>
      
      <div className="space-y-3">
        <button disabled={busy} onClick={() => go("join")} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded disabled:opacity-50">Join Team</button>
        <button disabled={busy} onClick={() => go("view")} className="w-full border px-4 py-3 rounded disabled:opacity-50">Continue as viewer</button>
      </div>
      
      {/* Current Participants */}
      <ParticipantsList eventId={eventData.id} />
    </main>
  );
}


