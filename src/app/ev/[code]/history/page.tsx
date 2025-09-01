"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Snapshot = { id: string; createdAt: string; ttlAt: string };

export default function HistoryPage() {
  const params = useParams<{ code: string }>();
  const [eventId, setEventId] = useState<string | null>(null);
  const [list, setList] = useState<Snapshot[]>([]);

  useEffect(() => {
    const run = async () => {
      const code = params?.code as string;
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventId(e.id);
      const l = await fetch(`/api/events/${e.id}/snapshot`).then(r=>r.json());
      setList(l);
    };
    run();
  }, [params?.code]);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">History</h1>
      {list.length===0 && <p className="text-sm text-gray-500">No snapshots yet (kept 90 days).</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map(s=> (
          <div key={s.id} className="border rounded p-3">
            <p className="font-medium">{new Date(s.createdAt).toLocaleString()}</p>
            <p className="text-xs text-gray-500">TTL: {new Date(s.ttlAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </main>
  );
}


