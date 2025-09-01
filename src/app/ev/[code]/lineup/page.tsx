"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';
import { toPng } from 'html-to-image';

type Team = { id: string; index: 1|2; name: string; color: string };
type Assignment = { id: string; teamId: string; participantId: string; participant: { isGuest: boolean; guestName: string|null; user?: { displayName: string; handle: string } } };
type Position = { id: string; teamId: string; participantId: string; x: number; y: number };
type Event = { id: string; code: string; lineupLocked?: boolean };

type TeamWithFormation = Team & { formation?: string };

export default function LineupPage() {
  const params = useParams<{ code: string }>();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [teams, setTeams] = useState<TeamWithFormation[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<1|2>(1);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ id: string } | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventData(e);
      const tlist: TeamWithFormation[] = await fetch(`/api/events/${e.id}/teams`).then(r=>r.json());
      setTeams(tlist);
      const t = tlist.find(x=>x.index===selectedTeamIdx);
      if (t) {
        const [asg, pos] = await Promise.all([
          fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json()),
          fetch(`/api/teams/${t.id}/positions`).then(r=>r.json()),
        ]);
        setAssignments(asg); setPositions(pos);
      }
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='positions_updated' || evt.type==='flags_updated' || evt.type==='assignments_updated' || evt.type==='teams_updated') {
          (async () => {
            const tlist: TeamWithFormation[] = await fetch(`/api/events/${e.id}/teams`).then(r=>r.json());
            setTeams(tlist);
            const t = tlist.find(x=>x.index===selectedTeamIdx);
            if (t) {
              const [asg, pos] = await Promise.all([
                fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json()),
                fetch(`/api/teams/${t.id}/positions`).then(r=>r.json()),
              ]);
              setAssignments(asg); setPositions(pos);
            }
          })();
        }
      });
    })();
    return () => unsub();
  }, [params?.code, selectedTeamIdx]);

  const team = teams.find(x=>x.index===selectedTeamIdx);
  const tokenFor = (pid: string) => positions.find(p=>p.participantId===pid);

  const formationPresets: Record<string, { x:number; y:number }[]> = {
    '1-2-1-1': [
      {x:0.1,y:0.5}, {x:0.3,y:0.35},{x:0.3,y:0.65}, {x:0.6,y:0.5}, {x:0.85,y:0.5},
    ],
    '1-1-2-1': [
      {x:0.1,y:0.5}, {x:0.3,y:0.5}, {x:0.55,y:0.35},{x:0.55,y:0.65}, {x:0.85,y:0.5},
    ],
    '1-2-2-1': [
      {x:0.1,y:0.5}, {x:0.25,y:0.3},{x:0.25,y:0.7}, {x:0.55,y:0.35},{x:0.55,y:0.65}, {x:0.85,y:0.5},
    ],
    '1-2-2-2': [
      {x:0.1,y:0.5}, {x:0.25,y:0.3},{x:0.25,y:0.7}, {x:0.55,y:0.35},{x:0.55,y:0.65}, {x:0.85,y:0.35},{x:0.85,y:0.65},
    ],
  };

  const overflowPosition = (k: number) => {
    // place extras in columns to the right, 4 rows grid
    const cols = 3; // compact extra columns
    const row = k % 4;
    const col = Math.floor(k / 4);
    const x = Math.min(0.95, 0.65 + col * (0.1));
    const y = 0.2 + row * 0.2;
    return { x, y };
  };

  const getDefault = (i: number) => {
    const form = (team?.formation || '1-2-2-1').toString();
    const preset = formationPresets[form] || formationPresets['1-2-2-1'];
    if (i < preset.length) return preset[i];
    return overflowPosition(i - preset.length);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
    if (!fieldRef.current || eventData?.lineupLocked) return;
    draggingRef.current = { id: pid };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fieldRef.current || !draggingRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left)/rect.width,0),1);
    const y = Math.min(Math.max((e.clientY - rect.top)/rect.height,0),1);
    const id = draggingRef.current.id;
    setPositions(prev=>{
      const idx = prev.findIndex(p=>p.participantId===id);
      if (idx>=0){ const copy=[...prev]; copy[idx] = { ...copy[idx], x, y }; return copy; }
      if (!team) return prev; return [...prev, { id: `tmp-${id}`, teamId: team.id, participantId: id, x, y }];
    });
  };
  const onPointerUp = async () => {
    if (!draggingRef.current || !team) return;
    const id = draggingRef.current.id; draggingRef.current = null;
    const pos = positions.find(p=>p.participantId===id); if (!pos) return;
    await fetch(`/api/teams/${team.id}/positions`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId:id, x: pos.x, y: pos.y }) });
    const fresh = await fetch(`/api/teams/${team.id}/positions`).then(r=>r.json()); setPositions(fresh);
  };

  const toggleLineupLock = async () => {
    if (!eventData) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lineupLocked: !eventData.lineupLocked }) });
    if (r.ok){ const d=await r.json(); setEventData({ ...eventData, lineupLocked:d.lineupLocked }); }
  };

  const exportPng = async () => {
    try {
      const container = exportRef.current;
      if (!container) return;
      const t = teams.find(x=>x.index===selectedTeamIdx);
      const name = (t?.name || `team${selectedTeamIdx}`).replace(/[^a-z0-9-_]+/gi, '_');
      const dataUrl = await toPng(container, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `lineup-${name}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  if (!team || !eventData) return <main className="p-6 max-w-4xl mx-auto">Loading…</main>;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={()=>setSelectedTeamIdx(1)} className={`px-3 py-1 rounded border ${selectedTeamIdx===1?'bg-gray-100':''}`}>Team 1</button>
          <button onClick={()=>setSelectedTeamIdx(2)} className={`px-3 py-1 rounded border ${selectedTeamIdx===2?'bg-gray-100':''}`}>Team 2</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPng} className="border px-3 py-1 rounded">Export PNG</button>
          <button onClick={toggleLineupLock} className="border px-3 py-1 rounded">Lineup Lock: {eventData.lineupLocked? 'On':'Off'}</button>
        </div>
      </div>
      <p className="text-sm text-gray-500">Drag tokens to set positions. Lineup lock prevents changes.</p>

      <div ref={exportRef} className="bg-white rounded shadow p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: (teams.find(x=>x.index===selectedTeamIdx)?.color || '#16a34a') }} />
            <div className="font-medium text-sm">{teams.find(x=>x.index===selectedTeamIdx)?.name || (selectedTeamIdx===1?'Team 1':'Team 2')}</div>
          </div>
          <div className="text-xs text-gray-500">{teams.find(x=>x.index===selectedTeamIdx)?.formation || '1-2-2-1'}</div>
        </div>

        <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative w-full h-80 bg-green-100 rounded overflow-hidden touch-none">
          <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
            {Array.from({length:16}).map((_,i)=>(<div key={i} className="border border-green-200"/>))}
          </div>
          {assignments.map((a, idx)=>{
            const pos = tokenFor(a.participantId) || getDefault(idx);
            const label = a.participant.isGuest ? (a.participant.guestName||'Guest') : (a.participant.user?.displayName || a.participant.user?.handle || 'Player');
            return (
              <div key={a.id} className="absolute" style={{ left: `${pos.x*100}%`, top: `${pos.y*100}%`, transform:'translate(-50%,-50%)' }} onPointerDown={(e)=>onPointerDown(e, a.participantId)}>
                <div className="w-8 h-8 rounded-full bg-green-600 border-2 border-white shadow" aria-label={`Player ${label}`} />
                <div className="text-[10px] mt-1 text-center max-w-[72px] truncate">{label}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-[10px] text-gray-500 text-right">{new Date().toLocaleString()}</div>
      </div>
    </main>
  );
}


