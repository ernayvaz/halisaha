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
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [playerCard, setPlayerCard] = useState<any>(null);

  const showPlayerCard = async (participant: any) => {
    setSelectedPlayer(participant);
    setPlayerCard(null);
    
    if (!participant.isGuest && participant.user?.id) {
      try {
        const response = await fetch(`/api/users/${participant.user.id}/card`);
        if (response.ok) {
          const card = await response.json();
          setPlayerCard(card);
        }
      } catch (error) {
        console.error('Failed to load player card:', error);
      }
    }
  };

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
              <div key={a.id} className="absolute cursor-pointer" style={{ left: `${pos.x*100}%`, top: `${pos.y*100}%`, transform:'translate(-50%,-50%)' }} 
                   onPointerDown={(e)=>onPointerDown(e, a.participantId)}
                   onClick={(e) => {
                     e.stopPropagation();
                     showPlayerCard(a.participant);
                   }}>
                <div className="w-8 h-8 rounded-full bg-green-600 border-2 border-white shadow hover:bg-green-700" aria-label={`Player ${label}`} />
                <div className="text-[10px] mt-1 text-center max-w-[72px] truncate">{label}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-[10px] text-gray-500 text-right">{new Date().toLocaleString()}</div>
      </div>
      
      {/* Modern Player Card Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="relative bg-gradient-to-br from-blue-600 to-purple-700 px-6 py-8 text-white">
              <button 
                onClick={() => setSelectedPlayer(null)} 
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm text-white text-3xl font-bold flex items-center justify-center mx-auto mb-3 ring-4 ring-white/30">
                  {(selectedPlayer.isGuest ? (selectedPlayer.guestName || 'G') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle || 'P')).slice(0,1).toUpperCase()}
                </div>
                <h4 className="text-xl font-bold mb-1">
                  {selectedPlayer.isGuest ? (selectedPlayer.guestName || 'Guest Player') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle)}
                </h4>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {selectedPlayer.isGuest ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">Guest player - no stats available</p>
                </div>
              ) : playerCard ? (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <div className="text-blue-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-blue-600 mb-1">{playerCard.pace || '-'}</div>
                      <div className="text-xs font-medium text-blue-700">PACE</div>
                    </div>
                    
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <div className="text-red-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-red-600 mb-1">{playerCard.shoot || '-'}</div>
                      <div className="text-xs font-medium text-red-700">SHOOT</div>
                    </div>
                    
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <div className="text-green-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-green-600 mb-1">{playerCard.pass || '-'}</div>
                      <div className="text-xs font-medium text-green-700">PASS</div>
                    </div>
                    
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <div className="text-purple-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-purple-600 mb-1">{playerCard.defend || '-'}</div>
                      <div className="text-xs font-medium text-purple-700">DEFEND</div>
                    </div>
                  </div>

                  {/* Preferred Foot */}
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-gray-600 mb-2">
                      <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4 4 4 0 004-4V5z" />
                      </svg>
                    </div>
                    <div className="text-lg font-semibold text-gray-800 mb-1">
                      {playerCard.foot === 'L' ? 'Left Foot' : playerCard.foot === 'R' ? 'Right Foot' : 'Not specified'}
                    </div>
                    <div className="text-xs font-medium text-gray-600">PREFERRED FOOT</div>
                  </div>

                  {/* Overall Rating */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-full">
                      <span className="text-sm font-medium">Overall Rating:</span>
                      <span className="text-lg font-bold">
                        {Math.round(((playerCard.pace || 0) + (playerCard.shoot || 0) + (playerCard.pass || 0) + (playerCard.defend || 0)) / 4 * 10) / 10}
                      </span>
                      <span className="text-sm">/5</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading player stats...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


