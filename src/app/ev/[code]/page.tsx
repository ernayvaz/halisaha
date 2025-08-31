"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

type Event = {
  id: string;
  code: string;
  name?: string | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  rosterLocked?: boolean;
  lineupLocked?: boolean;
};

type Card = { id: string; foot: 'L'|'R'|null; pace: number|null; shoot: number|null; pass: number|null; defend: number|null };

type Participant = {
  id: string;
  eventId: string;
  userId: string | null;
  guestName: string | null;
  isGuest: boolean;
  role: 'owner'|'mod'|'player'|'viewer';
  joinedAt: string;
  user?: { id: string; handle: string; displayName: string } | null;
};

type Team = { id: string; eventId: string; index: 1|2; name: string; color: string; formation: string };

type Position = { id: string; teamId: string; participantId: string; x: number; y: number };

type Assignment = { id: string; teamId: string; participantId: string; participant: Participant };

export default function EventLanding() {
  const params = useParams<{ code: string }>();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [availability, setAvailability] = useState<null | boolean>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [saved, setSaved] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [guestName, setGuestName] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<1|2>(1);
  const [positions, setPositions] = useState<Position[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [autoMethod, setAutoMethod] = useState<'snake'|'greedy'>('greedy');
  const [autoPreview, setAutoPreview] = useState<{ team1: string[]; team2: string[]; scoreA: number; scoreB: number } | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [poll, setPoll] = useState<{ id: string; startsAt: string; endsAt: string; finalized: boolean; votes: { id: string; pollId: string; voterParticipantId: string; targetParticipantId: string }[] } | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    fetch(`/api/events/${code}`).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setEventData(d);
    });
  }, [params?.code]);

  useEffect(() => {
    const load = async () => {
      if (!eventData) return;
      const [plist, tlist] = await Promise.all([
        fetch(`/api/events/${eventData.id}/participants`).then((r) => r.json()),
        fetch(`/api/events/${eventData.id}/teams`).then((r) => r.json()),
      ]);
      setParticipants(plist);
      setTeams(tlist);
    };
    load();
  }, [eventData]);

  useEffect(() => {
    const load = async () => {
      const t = teams.find((x) => x.index === selectedTeamIdx);
      if (!t) {
        setPositions([]);
        setAssignments([]);
        return;
      }
      const [pos, asg] = await Promise.all([
        fetch(`/api/teams/${t.id}/positions`).then((r) => r.json()),
        fetch(`/api/teams/${t.id}/assignments`).then((r) => r.json()),
      ]);
      setPositions(pos);
      setAssignments(asg);
    };
    load();
  }, [teams, selectedTeamIdx]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshPoll = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/poll`);
    if (r.ok) setPoll(await r.json());
  };

  const finishEvent = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/finish`, { method: 'POST' });
    if (r.ok) await refreshPoll();
  };

  const voteMVP = async (targetParticipantId: string) => {
    if (!poll) return;
    const voter = participants.find((p) => p.userId === userId) || participants.find((p) => p.isGuest);
    if (!voter) return alert('Önce katılmanız gerekiyor');
    await fetch(`/api/polls/${poll.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voterParticipantId: voter.id, targetParticipantId }) });
    await refreshPoll();
  };

  const remaining = () => {
    if (!poll) return '';
    const now = nowTick;
    const start = new Date(poll.startsAt).getTime();
    const end = new Date(poll.endsAt).getTime();
    if (now < start) {
      const s = Math.max(0, Math.floor((start - now)/1000));
      return `Oylama ${s}s sonra`; 
    }
    if (now <= end) {
      const s = Math.max(0, Math.floor((end - now)/1000));
      return `Kalan süre ${s}s`;
    }
    return 'Oylama bitti';
  };

  const checkHandle = async (h: string) => {
    setHandle(h);
    if (!h || h.length < 3) {
      setAvailability(null);
      return;
    }
    const r = await fetch('/api/nickname/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: h.toLowerCase() }) });
    const d = await r.json();
    setAvailability(d.available ?? false);
  };

  const bindUser = async () => {
    const r = await fetch('/api/users/anonymous', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: handle.toLowerCase(), displayName: displayName || handle }) });
    const d = await r.json();
    if (r.ok) {
      setUserId(d.id);
    } else {
      alert(d.error || 'Hata');
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      const r = await fetch(`/api/users/${userId}/card`);
      if (!r.ok) return;
      const d = await r.json();
      setCard(d);
    };
    load();
  }, [userId]);

  const ensureBase = (): Card => (
    card || { id: userId!, foot: 'R', pace: 3, shoot: 3, pass: 3, defend: 3 }
  );

  const saveCard = async () => {
    if (!userId) return;
    const c = ensureBase();
    const payload = { foot: c.foot, pace: c.pace, shoot: c.shoot, pass: c.pass, defend: c.defend };
    const r = await fetch(`/api/users/${userId}/card`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) setSaved(true);
    else {
      const d = await r.json();
      alert(d.error || 'Hata');
    }
  };

  const addGuest = async () => {
    if (!eventData || !guestName) return;
    const r = await fetch(`/api/events/${eventData.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'join', guestName }) });
    if (r.ok) {
      setGuestName('');
      const list = await fetch(`/api/events/${eventData.id}/participants`);
      setParticipants(await list.json());
    }
  };

  const toggleRosterLock = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: !eventData.rosterLocked }) });
    if (r.ok) {
      const d = await r.json();
      setEventData({ ...eventData, rosterLocked: d.rosterLocked });
    }
  };

  const toggleLineupLock = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineupLocked: !eventData.lineupLocked }) });
    if (r.ok) {
      const d = await r.json();
      setEventData({ ...eventData, lineupLocked: d.lineupLocked });
    }
  };

  const upsertTeam = async (index: 1|2, name: string, color?: string, formation?: string) => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index, name, color, formation }) });
    const t = await r.json();
    const other = teams.filter((x) => x.index !== index);
    setTeams([...other, t].sort((a,b) => a.index - b.index));
  };

  const assign = async (teamIndex: 1|2, participantId: string) => {
    const t = teams.find((x) => x.index === teamIndex);
    if (!t) return;
    await fetch(`/api/teams/${t.id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId }) });
    // refresh assignments if selected team
    if (t.index === selectedTeamIdx) {
      const res = await fetch(`/api/teams/${t.id}/assignments`);
      setAssignments(await res.json());
    }
  };

  const selectedTeam = teams.find((x) => x.index === selectedTeamIdx);

  const ready = useMemo(() => Boolean(userId), [userId]);

  const getDefaultPosition = (i: number): { x: number; y: number } => {
    // distribute roughly in a grid; columns 4, rows 4
    const cols = 4;
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col + 1) / (cols + 1);
    const y = (row + 1) / (cols + 1);
    return { x, y };
  };

  const tokenFor = (pId: string): Position | undefined => positions.find((p) => p.participantId === pId);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, participantId: string) => {
    if (!fieldRef.current || eventData?.lineupLocked) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    draggingRef.current = { id: participantId, offsetX: startX, offsetY: startY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fieldRef.current || !draggingRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    const id = draggingRef.current.id;
    setPositions((prev) => {
      const idx = prev.findIndex((p) => p.participantId === id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], x, y };
        return copy as Position[];
      }
      if (!selectedTeam) return prev;
      const tmpId = `tmp-${id}`;
      return [...prev, { id: tmpId, teamId: selectedTeam.id, participantId: id, x, y }];
    });
  };

  const onPointerUp = async () => {
    if (!draggingRef.current || !selectedTeam) return;
    const id = draggingRef.current.id;
    draggingRef.current = null;
    const pos = positions.find((p) => p.participantId === id);
    if (!pos) return;
    await fetch(`/api/teams/${selectedTeam.id}/positions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId: id, x: pos.x, y: pos.y }) });
    // refresh saved ids
    const fresh = await fetch(`/api/teams/${selectedTeam.id}/positions`);
    setPositions(await fresh.json());
  };

  const runAuto = async (apply: boolean) => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/autobalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: autoMethod, apply }) });
    const d = await r.json();
    setAutoPreview({ team1: d.team1, team2: d.team2, scoreA: d.scoreA, scoreB: d.scoreB });
    if (apply) {
      // refresh assignments for both teams
      const t = teams.find((x) => x.index === selectedTeamIdx);
      if (t) {
        const res = await fetch(`/api/teams/${t.id}/assignments`);
        setAssignments(await res.json());
      }
    }
  };

  const saveSnapshot = async () => {
    if (!eventData || !selectedTeam) return;
    const payload = {
      eventId: eventData.id,
      teams,
      assignments,
      positions,
      poll,
      when: new Date().toISOString(),
    };
    await fetch(`/api/events/${eventData.id}/snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    alert('Snapshot kaydedildi');
  };

  const exportPNG = async () => {
    if (!fieldRef.current) return;
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(fieldRef.current, { cacheBust: true, pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `lineup_${eventData?.code || 'event'}.png`;
    a.click();
  };

  if (!eventData) return <main className="p-6 max-w-xl mx-auto">Yükleniyor…</main>;

  const team1 = teams.find((x) => x.index === 1);
  const team2 = teams.find((x) => x.index === 2);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">{eventData.name || 'Halı Saha Etkinliği'}</h1>

      {!ready && (
        <section className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Nickname (handle)</label>
            <input value={handle} onChange={(e) => checkHandle(e.target.value)} className="border rounded p-2 w-full" placeholder="ornek_kullanici" />
            {availability !== null && (
              <p className={`text-sm ${availability ? 'text-green-600' : 'text-red-600'}`}>{availability ? 'Uygun' : 'Dolu / Geçersiz'}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">Görünen İsim</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="border rounded p-2 w-full" placeholder="Erman" />
          </div>
          <button disabled={!availability} onClick={bindUser} className="bg-blue-600 disabled:opacity-50 hover:bg-blue-700 text-white px-4 py-2 rounded">Kaydet</button>
        </section>
      )}

      {ready && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Oyuncu Kartı</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Ayak</label>
              <select className="border rounded p-2 w-full" value={ensureBase().foot ?? ''} onChange={(e) => setCard({ ...ensureBase(), foot: e.target.value as 'L'|'R' })}>
                <option value="">Seçiniz</option>
                <option value="R">Sağ</option>
                <option value="L">Sol</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Hız</label>
              <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().pace ?? 3} onChange={(e) => setCard({ ...ensureBase(), pace: parseInt(e.target.value || '3', 10) })} />
            </div>
            <div>
              <label className="block text-sm font-medium">Şut</label>
              <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().shoot ?? 3} onChange={(e) => setCard({ ...ensureBase(), shoot: parseInt(e.target.value || '3', 10) })} />
            </div>
            <div>
              <label className="block text-sm font-medium">Pas</label>
              <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().pass ?? 3} onChange={(e) => setCard({ ...ensureBase(), pass: parseInt(e.target.value || '3', 10) })} />
            </div>
            <div>
              <label className="block text-sm font-medium">Defans</label>
              <input type="number" min={1} max={5} className="border rounded p-2 w-full" value={ensureBase().defend ?? 3} onChange={(e) => setCard({ ...ensureBase(), defend: parseInt(e.target.value || '3', 10) })} />
            </div>
          </div>
          <button onClick={saveCard} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Kartı Kaydet</button>
          {saved && <p className="text-sm text-green-700">Kart kaydedildi.</p>}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Takımlar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-3 space-y-2">
            <h3 className="font-medium">1. Takım</h3>
            <input className="border rounded p-2 w-full" placeholder="Takım adı" defaultValue={team1?.name || ''} onBlur={(e) => upsertTeam(1, e.target.value || 'Takım 1', team1?.color, team1?.formation)} />
            <div className="flex gap-2 items-center">
              <label className="text-sm">Renk</label>
              <input type="color" defaultValue={team1?.color || '#16a34a'} onChange={(e) => upsertTeam(1, team1?.name || 'Takım 1', e.target.value, team1?.formation)} />
            </div>
            <div>
              <label className="block text-sm">Formasyon</label>
              <select className="border rounded p-2 w-full" defaultValue={team1?.formation || '1-2-2-1'} onChange={(e) => upsertTeam(1, team1?.name || 'Takım 1', team1?.color, e.target.value)}>
                <option value="1-2-1-1">5v5: 1-2-1-1</option>
                <option value="1-1-2-1">5v5: 1-1-2-1</option>
                <option value="1-2-2-1">6v6: 1-2-2-1</option>
                <option value="1-2-2-2">7v7: 1-2-2-2</option>
              </select>
            </div>
          </div>
          <div className="border rounded p-3 space-y-2">
            <h3 className="font-medium">2. Takım</h3>
            <input className="border rounded p-2 w-full" placeholder="Takım adı" defaultValue={team2?.name || ''} onBlur={(e) => upsertTeam(2, e.target.value || 'Takım 2', team2?.color, team2?.formation)} />
            <div className="flex gap-2 items-center">
              <label className="text-sm">Renk</label>
              <input type="color" defaultValue={team2?.color || '#16a34a'} onChange={(e) => upsertTeam(2, team2?.name || 'Takım 2', e.target.value, team2?.formation)} />
            </div>
            <div>
              <label className="block text-sm">Formasyon</label>
              <select className="border rounded p-2 w-full" defaultValue={team2?.formation || '1-2-2-1'} onChange={(e) => upsertTeam(2, team2?.name || 'Takım 2', team2?.color, e.target.value)}>
                <option value="1-2-1-1">5v5: 1-2-1-1</option>
                <option value="1-1-2-1">5v5: 1-1-2-1</option>
                <option value="1-2-2-1">6v6: 1-2-2-1</option>
                <option value="1-2-2-2">7v7: 1-2-2-2</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Atamalar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <h3 className="font-medium mb-2">Oyuncular</h3>
            <ul className="divide-y">
              {participants.map((p) => (
                <li key={p.id} className="flex justify-between items-center py-2">
                  <span>{p.isGuest ? (p.guestName || 'Misafir') : (p.user?.displayName || p.user?.handle)}</span>
                  <div className="flex gap-2">
                    <button onClick={() => assign(1, p.id)} className="text-xs border rounded px-2 py-1">→ 1</button>
                    <button onClick={() => assign(2, p.id)} className="text-xs border rounded px-2 py-1">→ 2</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="border rounded p-3 space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setSelectedTeamIdx(1)} className={`px-3 py-1 rounded border ${selectedTeamIdx===1?'bg-gray-100':''}`}>1. Takım</button>
              <button onClick={() => setSelectedTeamIdx(2)} className={`px-3 py-1 rounded border ${selectedTeamIdx===2?'bg-gray-100':''}`}>2. Takım</button>
            </div>
            <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative w-full h-72 bg-green-100 rounded overflow-hidden touch-none" role="img" aria-label="Saha dizilişi">
              {/* Basit saha grid'i */}
              <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
                {[...Array(16)].map((_,i) => (
                  <div key={i} className="border border-green-200" />
                ))}
              </div>
              {/* Pozisyon noktaları */}
              {assignments.map((a, idx) => {
                const pos = tokenFor(a.participantId) || { x: getDefaultPosition(idx).x, y: getDefaultPosition(idx).y } as Position;
                const label = a.participant.isGuest ? (a.participant.guestName || 'Misafir') : (a.participant.user?.displayName || a.participant.user?.handle || 'Oyuncu');
                return (
                  <div key={a.id}
                    className="absolute"
                    style={{ left: `${pos.x*100}%`, top: `${pos.y*100}%`, transform: 'translate(-50%, -50%)' }}
                    onPointerDown={(e) => onPointerDown(e, a.participantId)}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-600 border-2 border-white shadow" aria-label={`Oyuncu ${label}`} />
                    <div className="text-[10px] mt-1 text-center max-w-[72px] truncate">{label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Katılımcılar</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium">Misafir ekle</label>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="border rounded p-2 w-full" placeholder="Misafir adı" />
          </div>
          <button onClick={addGuest} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">Ekle</button>
        </div>
        <ul className="divide-y border rounded">
          {participants.map((p) => (
            <li key={p.id} className="p-2 flex justify-between items-center">
              <span>
                {p.isGuest ? (p.guestName || 'Misafir') : (p.user?.displayName || p.user?.handle)}
                <span className="text-xs text-gray-500">  • {p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex gap-3">
        <button onClick={toggleRosterLock} className="px-3 py-2 rounded border">Kadro Kilidi: {eventData.rosterLocked ? 'Açık' : 'Kapalı'}</button>
        <button onClick={toggleLineupLock} className="px-3 py-2 rounded border">Diziliş Kilidi: {eventData.lineupLocked ? 'Açık' : 'Kapalı'}</button>
        <button onClick={saveSnapshot} className="px-3 py-2 rounded border">Snapshot Kaydet</button>
        <button onClick={exportPNG} className="px-3 py-2 rounded border">PNG İndir</button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Oto-Dengeleme</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="border rounded p-2" value={autoMethod} onChange={(e) => setAutoMethod(e.target.value as 'snake'|'greedy')}>
            <option value="greedy">Greedy (farkı minimize)</option>
            <option value="snake">Snake draft</option>
          </select>
          <button onClick={() => runAuto(false)} className="px-3 py-2 rounded border">Önizleme</button>
          <button onClick={() => runAuto(true)} className="px-3 py-2 rounded border bg-green-600 text-white">Uygula</button>
          {autoPreview && (
            <span className="text-sm text-gray-700">Skor A: {autoPreview.scoreA} • Skor B: {autoPreview.scoreB}</span>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">MVP</h2>
        <div className="flex gap-2 items-center">
          <button onClick={finishEvent} className="px-3 py-2 rounded border">Maçı Bitir (10 dk sonra MVP)</button>
          <button onClick={refreshPoll} className="px-3 py-2 rounded border">Durumu Yenile</button>
          {poll && <span className="text-sm text-gray-700">{remaining()}</span>}
        </div>
        {poll && !poll.finalized && (
          <div>
            <p className="text-sm mb-2">Oy ver:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {participants.map((p) => (
                <button key={p.id} onClick={() => voteMVP(p.id)} className="border rounded px-2 py-2 text-left">
                  {p.isGuest ? (p.guestName || 'Misafir') : (p.user?.displayName || p.user?.handle)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}


