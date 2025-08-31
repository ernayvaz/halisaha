"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Event = { id: string; code: string; name?: string | null; date?: string | null; startTime?: string | null; durationMinutes?: number | null };

export default function Landing() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [params?.code]);

  if (error) return <main className="p-6 max-w-xl mx-auto"><h1 className="text-xl font-bold">{error}</h1></main>;
  if (!eventData) return <main className="p-6 max-w-xl mx-auto">Loading…</main>;

  const go = (mode: "join" | "view") => {
    router.push(`/ev/${eventData.code}/nickname?mode=${mode}`);
  };

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{eventData.name || "Pickup Game"}</h1>
        <p className="text-sm text-gray-500">{eventData.date || ""} {eventData.startTime || ""} • {eventData.durationMinutes || 60} min</p>
      </div>
      <div className="space-y-3">
        <button onClick={() => go("join")} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded">Join team</button>
        <button onClick={() => go("view")} className="w-full border px-4 py-3 rounded">Continue as viewer</button>
      </div>
    </main>
  );
}


