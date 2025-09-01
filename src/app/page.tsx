"use client";

import { useState, useMemo } from 'react';

type CreateEventResponse = { code?: string; error?: string; details?: Record<string, string> };

function isValidDateDdMmYyyy(v: string): boolean {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (!m) return false;
  const d = Number(m[1]); const mo = Number(m[2]); const y = Number(m[3]);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function isValidTimeHHMM(v: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function maskDate(input: string): string {
  const digits = input.replace(/\D+/g, '').slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  let out = dd;
  if (mm) out += '-' + mm;
  if (yyyy) out += '-' + yyyy;
  return out;
}

function clamp(val: number, min: number, max: number) { return Math.min(Math.max(val, min), max); }

function normalizeDate(input: string): string {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(input);
  if (!m) return input;
  const d = clamp(Number(m[1]), 1, 31);
  const mo = clamp(Number(m[2]), 1, 12);
  const y = Number(m[3]);
  return `${String(d).padStart(2,'0')}-${String(mo).padStart(2,'0')}-${String(y).padStart(4,'0')}`;
}

function maskTime(input: string): string {
  const digits = input.replace(/\D+/g, '').slice(0, 4);
  const hh = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  let out = hh;
  if (mm) out += ':' + mm;
  return out;
}

function normalizeTime(input: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(input);
  if (!m) return input;
  const hh = clamp(Number(m[1]), 0, 23);
  const mm = clamp(Number(m[2]), 0, 59);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

export default function Home() {
  const [name, setName] = useState('Pickup Match');
  const [date, setDate] = useState(''); // DD-MM-YYYY
  const [startTime, setStartTime] = useState(''); // HH:MM 24h
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [code, setCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!name || name.trim().length < 2) errs.name = 'Event name is required';
    if (!date || !isValidDateDdMmYyyy(date)) errs.date = 'Date must be DD-MM-YYYY';
    if (!startTime || !isValidTimeHHMM(startTime)) errs.startTime = 'Start time must be HH:MM (24h)';
    // Prevent past datetime in user's local timezone
    const [dd, mm, yyyy] = (date||'').split('-').map((x)=>parseInt(x,10));
    const [hh, mi] = (startTime||'').split(':').map((x)=>parseInt(x,10));
    if (Number.isFinite(dd) && Number.isFinite(mm) && Number.isFinite(yyyy) && Number.isFinite(hh) && Number.isFinite(mi)) {
      const local = new Date(yyyy, (mm-1), dd, hh, mi, 0, 0);
      if (local.getTime() < Date.now()) errs.date = 'Date/time cannot be in the past';
    }
    if (!Number.isFinite(Number(durationMinutes)) || durationMinutes <= 0 || durationMinutes > 300) errs.durationMinutes = 'Duration must be 1-300 minutes';
    return errs;
  }, [name, date, startTime, durationMinutes]);

  const createEvent = async () => {
    setSubmitting(true);
    setErrors(validate);
    if (Object.keys(validate).length > 0) { setSubmitting(false); return; }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, date, startTime, durationMinutes }),
    });
    const data: CreateEventResponse = await res.json();
    if (res.ok && data.code) { setCode(data.code); setErrors({}); }
    else {
      const serverErrs = (data.error === 'validation_error' && data.details) ? data.details : { form: data.error || 'Error' };
      setErrors(serverErrs);
    }
    setSubmitting(false);
  };

  const link = code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ev/${code}` : '';

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Create Football Event ⚽</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Event Name</label>
          <input className="border rounded p-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Date</label>
          <input type="date" className="border rounded p-2 w-full" value={(()=>{ const m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(date); return m?`${m[3]}-${m[2]}-${m[1]}`:''; })()} onChange={(e)=>{ const v=e.target.value; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v); setDate(m?`${m[3]}-${m[2]}-${m[1]}`:''); }} min={(()=>{ const now=new Date(); const y=now.getFullYear(); const mo=String(now.getMonth()+1).padStart(2,'0'); const d=String(now.getDate()).padStart(2,'0'); return `${y}-${mo}-${d}`; })()} aria-label="Date" />
          {errors.date && <p className="text-sm text-red-600 mt-1">{errors.date}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Start Time (HH:MM, 24‑hour)</label>
          <input type="time" className="border rounded p-2 w-full" placeholder="HH:MM" value={startTime} onChange={(e) => setStartTime(normalizeTime(e.target.value))} step={60} aria-label="Start time (HH:MM, 24-hour)" />
          {errors.startTime && <p className="text-sm text-red-600 mt-1">{errors.startTime}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Duration (min)</label>
          <input type="number" className="border rounded p-2 w-full" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value || '60', 10))} />
          {errors.durationMinutes && <p className="text-sm text-red-600 mt-1">{errors.durationMinutes}</p>}
        </div>
      </div>

      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

      <button onClick={createEvent} disabled={submitting || Object.keys(validate).length > 0} className="bg-green-600 disabled:opacity-50 hover:bg-green-700 text-white px-4 py-2 rounded">Create</button>

      {code && (
        <div className="space-y-2">
          <p className="text-sm">Event Code: <b>{code}</b></p>
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
