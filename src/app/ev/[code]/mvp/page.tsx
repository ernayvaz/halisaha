"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";


type Participant = { id: string; isGuest: boolean; guestName: string|null; user?: { id: string; displayName: string; handle: string } };

type Poll = { id: string; startsAt: string; endsAt: string; finalized: boolean; votes: { voterParticipantId: string; targetParticipantId: string }[] };

export default function MVPPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [mePartId, setMePartId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventId(e.id);
      const [plist, pollResp, me] = await Promise.all([
        fetch(`/api/events/${e.id}/participants`).then(r=>r.json()),
        fetch(`/api/events/${e.id}/poll`).then(r=>r.ok?r.json():null).catch(()=>null),
        fetch('/api/me').then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      setParticipants(plist);
      setPoll(pollResp);
      if (me?.id) {
        const mine = plist.find((p: Participant)=>p.user?.id===me.id);
        setMePartId(mine?.id || null);
      }
    };
    run();
  }, [params?.code]);

  const vote = async (targetParticipantId: string) => {
    if (!poll?.id || !mePartId) return;
    setBusy(true);
    try {
      await fetch(`/api/polls/${poll.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voterParticipantId: mePartId, targetParticipantId }) });
      router.push(`/ev/${params.code}/teams`);
    } finally { setBusy(false); }
  };

  if (!poll || !eventId) return <main className="p-6 max-w-xl mx-auto">Loading…</main>;

  const now = new Date();
  const startsAt = new Date(poll.startsAt);
  const endsAt = new Date(poll.endsAt);
  if (poll.finalized || now < startsAt || now > endsAt) {
    return (
      <main className="p-6 max-w-xl mx-auto space-y-2">
        <h1 className="text-xl font-semibold">MVP Voting</h1>
        <p className="text-sm text-gray-600">Voting is not active.</p>
        <button className="border px-3 py-1 rounded" onClick={()=>router.push(`/ev/${params.code}/teams`)}>Back</button>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">MVP Voting</h1>
      <p className="text-sm text-gray-600">Select the MVP for this match.</p>
      <ul className="divide-y border rounded">
        {participants.map((p)=> (
          <li key={p.id} className="p-2 flex items-center justify-between">
            <span className="text-sm">{p.isGuest ? (p.guestName || 'Guest Player') : (p.user?.displayName || p.user?.handle)}</span>
            <button disabled={!mePartId || busy} onClick={()=>vote(p.id)} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Vote</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
