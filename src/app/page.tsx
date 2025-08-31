"use client";

import { useState } from 'react';

type CreateEventResponse = { code?: string; error?: string };

export default function Home() {
  const [name, setName] = useState('Halı Saha Maçı');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [code, setCode] = useState<string | null>(null);

  const createEvent = async () => {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date: date || undefined, startTime: startTime || undefined, durationMinutes }),
    });
    const data: CreateEventResponse = await res.json();
    if (res.ok && data.code) setCode(data.code);
    else alert(data.error || 'Hata');
  };

  const link = code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ev/${code}` : '';

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Etkinlik Oluştur</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Etkinlik Adı</label>
          <input className="border rounded p-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Tarih</label>
          <input type="date" className="border rounded p-2 w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Başlangıç</label>
          <input type="time" className="border rounded p-2 w-full" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Süre (dk)</label>
          <input type="number" className="border rounded p-2 w-full" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value || '60', 10))} />
        </div>
      </div>

      <button onClick={createEvent} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Oluştur</button>

      {code && (
        <div className="space-y-2">
          <p className="text-sm">Etkinlik Kodu: <b>{code}</b></p>
          <p className="text-sm break-all">Link: <a href={link} className="text-blue-600 underline">{link}</a></p>
          <div className="border inline-block p-2 rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qrcode?text=${encodeURIComponent(link)}`} alt="QR" width={256} height={256} />
          </div>
        </div>
      )}
    </main>
  );
}
